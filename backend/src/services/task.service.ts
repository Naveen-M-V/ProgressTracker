import { db } from '../db.js';
import {
  Task,
  TaskDetail,
  TaskStatus,
  TaskPriority,
  CreateTaskDTO,
  UpdateTaskDTO,
  TaskFilterDTO,
  Subtask,
  TaskComment,
  ActivityLog,
  TaskWatcher
} from '../types/task.js';
import { AttachmentDTO } from '../types/attachment.js';
import { User } from '../types/auth.js';
import { ProjectService } from './project.service.js';
import { eventDispatcher } from '../events/dispatcher.js';
import { DomainEventType } from '../events/types.js';

export class TaskService {
  private static isAdmin(user: User): boolean {
    return user.role === 'ADMIN';
  }

  /**
   * Helper to fetch a task by ID without access check (internal use)
   */
  private static getRawTask(taskId: number): any {
    const task = db.prepare(`
      SELECT 
        t.*,
        p.name as project_name,
        tm.name as team_name,
        u_assignee.name as assignee_name,
        u_assignee.email as assignee_email,
        u_assignee.avatar_url as assignee_avatar,
        u_creator.name as creator_name
      FROM tasks t
      JOIN projects p ON t.project_id = p.id
      LEFT JOIN teams tm ON t.team_id = tm.id
      LEFT JOIN users u_assignee ON t.assignee_id = u_assignee.id
      JOIN users u_creator ON t.creator_id = u_creator.id
      WHERE t.id = ?
    `).get(taskId);

    if (!task) {
      const err = new Error(`Task with ID ${taskId} not found`);
      (err as any).code = 'TASK_NOT_FOUND';
      throw err;
    }

    return task;
  }

  /**
   * Create a new task with atomic subtasks, watchers, and activity logging
   */
  public static createTask(dto: CreateTaskDTO, actor: User): Task {
    const trimmedTitle = dto.title?.trim();
    if (!trimmedTitle || trimmedTitle.length < 2) {
      const err = new Error('Task title must be at least 2 characters long');
      (err as any).code = 'VALIDATION_ERROR';
      throw err;
    }

    // Authorization: User must have access to project
    if (!ProjectService.canUserAccessProject(dto.project_id, actor)) {
      const err = new Error('You do not have permission to create tasks in this project');
      (err as any).code = 'FORBIDDEN';
      throw err;
    }

    // Validate assignee if provided
    if (dto.assignee_id) {
      const userExists = db.prepare('SELECT id FROM users WHERE id = ?').get(dto.assignee_id);
      if (!userExists) {
        const err = new Error(`Assignee user with ID ${dto.assignee_id} does not exist`);
        (err as any).code = 'USER_NOT_FOUND';
        throw err;
      }
    }

    // Validate team if provided
    if (dto.team_id) {
      const teamExists = db.prepare('SELECT id FROM teams WHERE id = ?').get(dto.team_id);
      if (!teamExists) {
        const err = new Error(`Team with ID ${dto.team_id} does not exist`);
        (err as any).code = 'TEAM_NOT_FOUND';
        throw err;
      }
    }

    const priority: TaskPriority = dto.priority || 'MEDIUM';
    const status: TaskStatus = dto.status || 'TODO';

    // Calculate position order for Kanban column ordering
    let positionOrder = dto.position_order;
    if (positionOrder === undefined) {
      const maxPos = db.prepare(`
        SELECT COALESCE(MAX(position_order), 0.0) as max_pos
        FROM tasks
        WHERE project_id = ? AND status = ?
      `).get(dto.project_id, status) as { max_pos: number };
      positionOrder = Number(maxPos.max_pos) + 1000.0;
    }

    // ATOMIC TRANSACTION: Task + Subtasks + Watchers + Activity Log
    const createTx = db.transaction(() => {
      const insertStmt = db.prepare(`
        INSERT INTO tasks (
          title, description, project_id, team_id, assignee_id, creator_id,
          priority, status, start_date, due_date, position_order
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const result = insertStmt.run(
        trimmedTitle,
        dto.description?.trim() || null,
        dto.project_id,
        dto.team_id || null,
        dto.assignee_id || null,
        actor.id,
        priority,
        status,
        dto.start_date || null,
        dto.due_date || null,
        positionOrder
      );

      const newTaskId = Number(result.lastInsertRowid);

      // 1. Auto-add creator to task_watchers
      const addWatcher = db.prepare(`
        INSERT OR IGNORE INTO task_watchers (task_id, user_id)
        VALUES (?, ?)
      `);
      addWatcher.run(newTaskId, actor.id);

      // 2. Auto-add assignee to task_watchers if different
      if (dto.assignee_id && dto.assignee_id !== actor.id) {
        addWatcher.run(newTaskId, dto.assignee_id);
      }

      // 3. Insert subtasks if provided
      if (dto.subtasks && dto.subtasks.length > 0) {
        const insertSubtask = db.prepare(`
          INSERT INTO subtasks (task_id, title, position)
          VALUES (?, ?, ?)
        `);
        dto.subtasks.forEach((subTitle, idx) => {
          if (subTitle.trim()) {
            insertSubtask.run(newTaskId, subTitle.trim(), idx);
          }
        });
      }

      // 4. Record Activity Log
      db.prepare(`
        INSERT INTO activity_logs (task_id, project_id, actor_id, action_type, description)
        VALUES (?, ?, ?, 'CREATED', ?)
      `).run(newTaskId, dto.project_id, actor.id, `${actor.name} created the task`);

      return newTaskId;
    });

    const createdTaskId = createTx();
    const createdTask = this.getTaskById(createdTaskId, actor);

    // POST-COMMIT: Event Dispatcher
    eventDispatcher.dispatch(DomainEventType.TASK_CREATED, actor.id, createdTask);

    return createdTask;
  }

  /**
   * Get single task with subtasks, comments, watchers, and full activity history
   */
  public static getTaskById(taskId: number, currentUser: User): TaskDetail {
    const task = this.getRawTask(taskId);

    // Verify project access
    if (!ProjectService.canUserAccessProject(task.project_id, currentUser)) {
      const err = new Error('You do not have access to this task');
      (err as any).code = 'FORBIDDEN';
      throw err;
    }

    // Subtasks
    const subtasks = db.prepare(`
      SELECT id, task_id, title, is_completed, position, created_at
      FROM subtasks
      WHERE task_id = ?
      ORDER BY position ASC, id ASC
    `).all(taskId).map((s: any) => ({
      ...s,
      is_completed: Boolean(s.is_completed)
    })) as Subtask[];

    // Comments
    const comments = db.prepare(`
      SELECT 
        c.id, c.task_id, c.user_id, c.content, c.created_at,
        u.name as user_name, u.role as user_role, u.avatar_url as user_avatar
      FROM task_comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.task_id = ?
      ORDER BY c.created_at ASC
    `).all(taskId) as TaskComment[];

    // Watchers
    const watchers = db.prepare(`
      SELECT 
        tw.task_id, tw.user_id, tw.created_at,
        u.name as user_name, u.email as user_email
      FROM task_watchers tw
      JOIN users u ON tw.user_id = u.id
      WHERE tw.task_id = ?
    `).all(taskId) as TaskWatcher[];

    // Activity Logs
    const activity_logs = db.prepare(`
      SELECT 
        al.id, al.task_id, al.project_id, al.actor_id, al.action_type,
        al.old_value, al.new_value, al.description, al.created_at,
        u.name as actor_name, u.role as actor_role
      FROM activity_logs al
      JOIN users u ON al.actor_id = u.id
      WHERE al.task_id = ?
      ORDER BY al.created_at DESC
    `).all(taskId) as ActivityLog[];

    // Attachments (Phase 7)
    const attachments = db.prepare(`
      SELECT 
        a.id, a.entity_type, a.entity_id, a.file_name, a.mime_type, a.file_size,
        a.uploaded_by, a.created_at,
        u.name as uploader_name, u.avatar_url as uploader_avatar
      FROM attachments a
      LEFT JOIN users u ON a.uploaded_by = u.id
      WHERE a.entity_type = 'TASK' AND a.entity_id = ?
      ORDER BY a.created_at DESC
    `).all(taskId) as AttachmentDTO[];

    const subtask_count = subtasks.length;
    const subtasks_completed = subtasks.filter(s => s.is_completed).length;

    return {
      ...task,
      subtasks,
      comments,
      watchers,
      activity_logs,
      attachments,
      subtask_count,
      subtasks_completed,
      comment_count: comments.length,
      attachment_count: attachments.length
    };
  }

  /**
   * Query filtered tasks (Kanban, Shared Calendar, My Work, Dashboard)
   */
  public static getTasks(filters: TaskFilterDTO, currentUser: User): Task[] {
    const conditions: string[] = [];
    const params: any[] = [];

    // RBAC: Non-admin users only see tasks from projects they have access to
    if (!this.isAdmin(currentUser)) {
      conditions.push(`
        t.project_id IN (
          SELECT id FROM projects WHERE manager_id = ?
          UNION
          SELECT project_id FROM project_members WHERE user_id = ?
          UNION
          SELECT p.id FROM projects p 
          JOIN team_members tm ON p.team_id = tm.team_id 
          WHERE tm.user_id = ?
        )
      `);
      params.push(currentUser.id, currentUser.id, currentUser.id);
    }

    if (filters.project_id) {
      conditions.push('t.project_id = ?');
      params.push(filters.project_id);
    }

    if (filters.team_id) {
      conditions.push('t.team_id = ?');
      params.push(filters.team_id);
    }

    if (filters.assignee_id) {
      conditions.push('t.assignee_id = ?');
      params.push(filters.assignee_id);
    }

    if (filters.status) {
      conditions.push('t.status = ?');
      params.push(filters.status);
    }

    if (filters.priority) {
      conditions.push('t.priority = ?');
      params.push(filters.priority);
    }

    if (filters.due_date) {
      conditions.push('DATE(t.due_date) = DATE(?)');
      params.push(filters.due_date);
    }

    if (filters.from_date) {
      conditions.push('(DATE(COALESCE(t.due_date, t.start_date)) >= DATE(?))');
      params.push(filters.from_date);
    }

    if (filters.to_date) {
      conditions.push('(DATE(COALESCE(t.start_date, t.due_date)) <= DATE(?))');
      params.push(filters.to_date);
    }

    if (filters.search) {
      conditions.push('(t.title LIKE ? OR t.description LIKE ?)');
      params.push(`%${filters.search}%`, `%${filters.search}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT 
        t.*,
        p.name as project_name,
        tm.name as team_name,
        u_assignee.name as assignee_name,
        u_assignee.email as assignee_email,
        u_assignee.avatar_url as assignee_avatar,
        u_creator.name as creator_name,
        (SELECT COUNT(*) FROM subtasks s WHERE s.task_id = t.id) as subtask_count,
        (SELECT COUNT(*) FROM subtasks s WHERE s.task_id = t.id AND s.is_completed = 1) as subtasks_completed,
        (SELECT COUNT(*) FROM task_comments tc WHERE tc.task_id = t.id) as comment_count,
        (SELECT COUNT(*) FROM attachments a WHERE a.entity_type = 'TASK' AND a.entity_id = t.id) as attachment_count
      FROM tasks t
      JOIN projects p ON t.project_id = p.id
      LEFT JOIN teams tm ON t.team_id = tm.id
      LEFT JOIN users u_assignee ON t.assignee_id = u_assignee.id
      JOIN users u_creator ON t.creator_id = u_creator.id
      ${whereClause}
      ORDER BY t.position_order ASC, t.created_at DESC
    `;

    return db.prepare(sql).all(...params) as Task[];
  }

  /**
   * Update task fields (Title, Description, Priority, Due Date, Team)
   */
  public static updateTask(taskId: number, dto: UpdateTaskDTO, actor: User): Task {
    const task = this.getRawTask(taskId);

    if (!ProjectService.canUserAccessProject(task.project_id, actor)) {
      const err = new Error('You do not have permission to update this task');
      (err as any).code = 'FORBIDDEN';
      throw err;
    }

    const trimmedTitle = dto.title !== undefined ? dto.title.trim() : task.title;
    if (!trimmedTitle || trimmedTitle.length < 2) {
      const err = new Error('Task title must be at least 2 characters long');
      (err as any).code = 'VALIDATION_ERROR';
      throw err;
    }

    const description = dto.description !== undefined ? dto.description?.trim() || null : task.description;
    const priority = dto.priority || task.priority;
    const teamId = dto.team_id !== undefined ? dto.team_id : task.team_id;
    const startDate = dto.start_date !== undefined ? dto.start_date : task.start_date;
    const dueDate = dto.due_date !== undefined ? dto.due_date : task.due_date;
    const positionOrder = dto.position_order !== undefined ? dto.position_order : task.position_order;

    // ATOMIC TRANSACTION: Update task and record activity logs for each changed attribute
    const updateTx = db.transaction(() => {
      db.prepare(`
        UPDATE tasks
        SET title = ?, description = ?, team_id = ?, priority = ?,
            start_date = ?, due_date = ?, position_order = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(
        trimmedTitle,
        description,
        teamId,
        priority,
        startDate,
        dueDate,
        positionOrder,
        taskId
      );

      const logStmt = db.prepare(`
        INSERT INTO activity_logs (task_id, project_id, actor_id, action_type, old_value, new_value, description)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      if (trimmedTitle !== task.title) {
        logStmt.run(taskId, task.project_id, actor.id, 'TITLE_CHANGED', task.title, trimmedTitle, `${actor.name} renamed task to "${trimmedTitle}"`);
      }
      if (priority !== task.priority) {
        logStmt.run(taskId, task.project_id, actor.id, 'PRIORITY_CHANGED', task.priority, priority, `${actor.name} changed priority from ${task.priority} to ${priority}`);
      }
      if (dueDate !== task.due_date) {
        logStmt.run(taskId, task.project_id, actor.id, 'DUE_DATE_CHANGED', task.due_date, dueDate, `${actor.name} updated due date`);
      }
    });

    updateTx();
    const updatedTask = this.getTaskById(taskId, actor);

    // POST-COMMIT: Event Dispatcher
    eventDispatcher.dispatch(DomainEventType.TASK_UPDATED, actor.id, updatedTask);

    return updatedTask;
  }

  /**
   * Central authoritative Status Transition (Kanban drag-drop, My Work checkbox, etc.)
   */
  public static updateStatus(taskId: number, newStatus: TaskStatus, newPosition: number | undefined, actor: User): Task {
    const validStatuses: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'REVIEW', 'BLOCKED', 'COMPLETED'];
    if (!validStatuses.includes(newStatus)) {
      const err = new Error(`Invalid task status: ${newStatus}`);
      (err as any).code = 'INVALID_STATUS_TRANSITION';
      throw err;
    }

    const task = this.getRawTask(taskId);

    if (!ProjectService.canUserAccessProject(task.project_id, actor)) {
      const err = new Error('You do not have permission to change status of this task');
      (err as any).code = 'FORBIDDEN';
      throw err;
    }

    const oldStatus = task.status;
    const position = newPosition !== undefined ? newPosition : task.position_order;

    // ATOMIC TRANSACTION: Update status and append audit log
    const statusTx = db.transaction(() => {
      db.prepare(`
        UPDATE tasks
        SET status = ?, position_order = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(newStatus, position, taskId);

      if (oldStatus !== newStatus) {
        db.prepare(`
          INSERT INTO activity_logs (task_id, project_id, actor_id, action_type, old_value, new_value, description)
          VALUES (?, ?, ?, 'STATUS_CHANGED', ?, ?, ?)
        `).run(
          taskId,
          task.project_id,
          actor.id,
          oldStatus,
          newStatus,
          `${actor.name} changed status from ${oldStatus} to ${newStatus}`
        );
      }
    });

    statusTx();
    const updatedTask = this.getTaskById(taskId, actor);

    // POST-COMMIT: Event Dispatcher
    eventDispatcher.dispatch(DomainEventType.TASK_STATUS_CHANGED, actor.id, {
      task: updatedTask,
      oldStatus,
      newStatus
    });

    return updatedTask;
  }

  /**
   * Reassign a task to another user
   */
  public static assignTask(taskId: number, assigneeId: number | null, actor: User): Task {
    const task = this.getRawTask(taskId);

    if (!ProjectService.canUserAccessProject(task.project_id, actor)) {
      const err = new Error('You do not have permission to reassign this task');
      (err as any).code = 'FORBIDDEN';
      throw err;
    }

    let newAssigneeName = 'Unassigned';
    if (assigneeId) {
      const assignee = db.prepare('SELECT id, name FROM users WHERE id = ?').get(assigneeId) as { id: number; name: string };
      if (!assignee) {
        const err = new Error(`User with ID ${assigneeId} does not exist`);
        (err as any).code = 'USER_NOT_FOUND';
        throw err;
      }
      newAssigneeName = assignee.name;
    }

    const oldAssigneeId = task.assignee_id;
    const oldAssigneeName = task.assignee_name || 'Unassigned';

    // ATOMIC TRANSACTION: Update assignee, add to watchers, record audit log
    const assignTx = db.transaction(() => {
      db.prepare(`
        UPDATE tasks
        SET assignee_id = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(assigneeId, taskId);

      if (assigneeId) {
        db.prepare(`
          INSERT OR IGNORE INTO task_watchers (task_id, user_id)
          VALUES (?, ?)
        `).run(taskId, assigneeId);
      }

      db.prepare(`
        INSERT INTO activity_logs (task_id, project_id, actor_id, action_type, old_value, new_value, description)
        VALUES (?, ?, ?, 'ASSIGNED', ?, ?, ?)
      `).run(
        taskId,
        task.project_id,
        actor.id,
        oldAssigneeName,
        newAssigneeName,
        `${actor.name} assigned task to ${newAssigneeName}`
      );
    });

    assignTx();
    const updatedTask = this.getTaskById(taskId, actor);

    // POST-COMMIT: Event Dispatcher
    eventDispatcher.dispatch(DomainEventType.TASK_ASSIGNED, actor.id, {
      task: updatedTask,
      oldAssigneeId,
      newAssigneeId: assigneeId
    });

    return updatedTask;
  }

  /**
   * Delete a task (Admin or Project Manager)
   */
  public static deleteTask(taskId: number, actor: User): void {
    const task = this.getRawTask(taskId);

    const project = db.prepare('SELECT manager_id FROM projects WHERE id = ?').get(task.project_id) as { manager_id: number };
    const isManager = project?.manager_id === actor.id;

    if (!this.isAdmin(actor) && !isManager) {
      const err = new Error('Only administrators or the assigned project manager can delete tasks');
      (err as any).code = 'FORBIDDEN';
      throw err;
    }

    const deleteTx = db.transaction(() => {
      db.prepare('DELETE FROM tasks WHERE id = ?').run(taskId);
    });

    deleteTx();

    // POST-COMMIT: Event Dispatcher
    eventDispatcher.dispatch(DomainEventType.TASK_DELETED, actor.id, {
      taskId,
      projectId: task.project_id
    });
  }

  /**
   * Subtasks Management
   */
  public static addSubtask(taskId: number, title: string, actor: User): Subtask {
    const trimmed = title?.trim();
    if (!trimmed) {
      const err = new Error('Subtask title cannot be empty');
      (err as any).code = 'VALIDATION_ERROR';
      throw err;
    }

    const task = this.getRawTask(taskId);
    if (!ProjectService.canUserAccessProject(task.project_id, actor)) {
      const err = new Error('You do not have access to this task');
      (err as any).code = 'FORBIDDEN';
      throw err;
    }

    const maxPos = db.prepare('SELECT COALESCE(MAX(position), -1) as max_pos FROM subtasks WHERE task_id = ?').get(taskId) as { max_pos: number };

    const addTx = db.transaction(() => {
      const res = db.prepare(`
        INSERT INTO subtasks (task_id, title, position)
        VALUES (?, ?, ?)
      `).run(taskId, trimmed, maxPos.max_pos + 1);

      db.prepare(`
        INSERT INTO activity_logs (task_id, project_id, actor_id, action_type, description)
        VALUES (?, ?, ?, 'SUBTASK_ADDED', ?)
      `).run(taskId, task.project_id, actor.id, `${actor.name} added subtask: "${trimmed}"`);

      return Number(res.lastInsertRowid);
    });

    const newSubtaskId = addTx();
    const subtask = db.prepare('SELECT * FROM subtasks WHERE id = ?').get(newSubtaskId) as any;
    const result: Subtask = { ...subtask, is_completed: Boolean(subtask.is_completed) };

    eventDispatcher.dispatch(DomainEventType.SUBTASK_CREATED, actor.id, { taskId, projectId: task.project_id, subtask: result });
    return result;
  }

  public static updateSubtask(subtaskId: number, updates: { title?: string; is_completed?: boolean }, actor: User): Subtask {
    const subtask = db.prepare('SELECT * FROM subtasks WHERE id = ?').get(subtaskId) as any;
    if (!subtask) {
      const err = new Error('Subtask not found');
      (err as any).code = 'NOT_FOUND';
      throw err;
    }

    const task = this.getRawTask(subtask.task_id);
    if (!ProjectService.canUserAccessProject(task.project_id, actor)) {
      const err = new Error('You do not have access to this task');
      (err as any).code = 'FORBIDDEN';
      throw err;
    }

    const title = updates.title !== undefined ? updates.title.trim() : subtask.title;
    const isCompleted = updates.is_completed !== undefined ? (updates.is_completed ? 1 : 0) : subtask.is_completed;

    const updateTx = db.transaction(() => {
      db.prepare(`
        UPDATE subtasks
        SET title = ?, is_completed = ?
        WHERE id = ?
      `).run(title, isCompleted, subtaskId);

      if (updates.is_completed !== undefined && (subtask.is_completed ? 1 : 0) !== isCompleted) {
        const desc = isCompleted === 1
          ? `${actor.name} marked subtask "${title}" as completed`
          : `${actor.name} marked subtask "${title}" as incomplete`;
        db.prepare(`
          INSERT INTO activity_logs (task_id, project_id, actor_id, action_type, description)
          VALUES (?, ?, ?, 'SUBTASK_TOGGLED', ?)
        `).run(task.id, task.project_id, actor.id, desc);
      }
    });

    updateTx();
    const updated = db.prepare('SELECT * FROM subtasks WHERE id = ?').get(subtaskId) as any;
    const result: Subtask = { ...updated, is_completed: Boolean(updated.is_completed) };

    eventDispatcher.dispatch(DomainEventType.SUBTASK_UPDATED, actor.id, { taskId: task.id, projectId: task.project_id, subtask: result });
    return result;
  }

  public static deleteSubtask(subtaskId: number, actor: User): void {
    const subtask = db.prepare('SELECT * FROM subtasks WHERE id = ?').get(subtaskId) as any;
    if (!subtask) {
      const err = new Error('Subtask not found');
      (err as any).code = 'NOT_FOUND';
      throw err;
    }

    const task = this.getRawTask(subtask.task_id);
    if (!ProjectService.canUserAccessProject(task.project_id, actor)) {
      const err = new Error('You do not have access to this task');
      (err as any).code = 'FORBIDDEN';
      throw err;
    }

    const deleteTx = db.transaction(() => {
      db.prepare('DELETE FROM subtasks WHERE id = ?').run(subtaskId);
      db.prepare(`
        INSERT INTO activity_logs (task_id, project_id, actor_id, action_type, description)
        VALUES (?, ?, ?, 'SUBTASK_DELETED', ?)
      `).run(task.id, task.project_id, actor.id, `${actor.name} removed subtask: "${subtask.title}"`);
    });

    deleteTx();
    eventDispatcher.dispatch(DomainEventType.SUBTASK_DELETED, actor.id, { taskId: task.id, projectId: task.project_id, subtaskId });
  }

  /**
   * Comments Management
   */
  public static addComment(taskId: number, content: string, actor: User): TaskComment {
    const trimmed = content?.trim();
    if (!trimmed) {
      const err = new Error('Comment content cannot be empty');
      (err as any).code = 'VALIDATION_ERROR';
      throw err;
    }

    const task = this.getRawTask(taskId);
    if (!ProjectService.canUserAccessProject(task.project_id, actor)) {
      const err = new Error('You do not have access to this task');
      (err as any).code = 'FORBIDDEN';
      throw err;
    }

    const commentTx = db.transaction(() => {
      const res = db.prepare(`
        INSERT INTO task_comments (task_id, user_id, content)
        VALUES (?, ?, ?)
      `).run(taskId, actor.id, trimmed);

      // Auto-watch task when commenting
      db.prepare(`
        INSERT OR IGNORE INTO task_watchers (task_id, user_id)
        VALUES (?, ?)
      `).run(taskId, actor.id);

      db.prepare(`
        INSERT INTO activity_logs (task_id, project_id, actor_id, action_type, description)
        VALUES (?, ?, ?, 'COMMENT_ADDED', ?)
      `).run(taskId, task.project_id, actor.id, `${actor.name} commented on the task`);

      return Number(res.lastInsertRowid);
    });

    const newCommentId = commentTx();
    const commentRow = db.prepare(`
      SELECT 
        c.id, c.task_id, c.user_id, c.content, c.created_at,
        u.name as user_name, u.role as user_role, u.avatar_url as user_avatar
      FROM task_comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.id = ?
    `).get(newCommentId) as TaskComment;

    eventDispatcher.dispatch(DomainEventType.TASK_COMMENT_ADDED, actor.id, {
      comment: commentRow,
      taskId,
      projectId: task.project_id,
      task
    });

    return commentRow;
  }

  /**
   * Get activity history for a task
   */
  public static getTaskActivity(taskId: number, currentUser: User): ActivityLog[] {
    const task = this.getRawTask(taskId);
    if (!ProjectService.canUserAccessProject(task.project_id, currentUser)) {
      const err = new Error('You do not have access to this task');
      (err as any).code = 'FORBIDDEN';
      throw err;
    }

    return db.prepare(`
      SELECT 
        al.id, al.task_id, al.project_id, al.actor_id, al.action_type,
        al.old_value, al.new_value, al.description, al.created_at,
        u.name as actor_name, u.role as actor_role
      FROM activity_logs al
      JOIN users u ON al.actor_id = u.id
      WHERE al.task_id = ?
      ORDER BY al.created_at DESC
    `).all(taskId) as ActivityLog[];
  }
}
