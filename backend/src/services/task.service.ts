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
import { TeamService } from './team.service.js';
import { eventDispatcher } from '../events/dispatcher.js';
import { DomainEventType } from '../events/types.js';

export class TaskService {
  private static isAdmin(user: User): boolean {
    return user.role === 'ADMIN';
  }

  /**
   * Authoritative RBAC check: Can the user view/interact with this task?
   * - ADMIN: Full access across all tasks
   * - Project Manager: Full oversight of all tasks in their managed projects
   * - Creator or Assignee: Full access to tasks they created or are assigned to
   * - Team Member: Tasks assigned to a team are strictly visible only to members/lead of that team
   * - Unassigned Tasks (team_id IS NULL): Visible to all members with project access
   */
  public static async canUserAccessTask(task: any, user: User): Promise<boolean> {
    if (this.isAdmin(user)) return true;

    // Check project-level access first
    const hasProjectAccess = await ProjectService.canUserAccessProject(task.project_id, user);
    if (!hasProjectAccess) return false;

    // Project manager has oversight of all tasks in that project
    const project = await db.queryOne<{ manager_id: number | null }>(
      'SELECT manager_id FROM projects WHERE id = ?',
      [task.project_id]
    );
    if (project?.manager_id === user.id) return true;

    // Direct assignee or creator can always access the task
    if (task.creator_id === user.id || task.assignee_id === user.id) return true;

    // If task is assigned to a team, user must belong to that team (or be team lead)
    if (task.team_id !== null && task.team_id !== undefined) {
      return await TeamService.isUserInTeam(task.team_id, user.id);
    }

    // Unassigned project tasks are accessible to all project members
    return true;
  }

  /**
   * Helper to fetch a task by ID without access check (internal use)
   */
  private static async getRawTask(taskId: number): Promise<any> {
    const task = await db.queryOne(`
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
    `, [taskId]);

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
  public static async createTask(dto: CreateTaskDTO, actor: User): Promise<Task> {
    const trimmedTitle = dto.title?.trim();
    if (!trimmedTitle || trimmedTitle.length < 2) {
      const err = new Error('Task title must be at least 2 characters long');
      (err as any).code = 'VALIDATION_ERROR';
      throw err;
    }

    // Authorization: User must have access to project
    const hasAccess = await ProjectService.canUserAccessProject(dto.project_id, actor);
    if (!hasAccess) {
      const err = new Error('You do not have permission to create tasks in this project');
      (err as any).code = 'FORBIDDEN';
      throw err;
    }

    // Validate assignee if provided
    if (dto.assignee_id) {
      const userExists = await db.queryOne('SELECT id FROM users WHERE id = ?', [dto.assignee_id]);
      if (!userExists) {
        const err = new Error(`Assignee user with ID ${dto.assignee_id} does not exist`);
        (err as any).code = 'USER_NOT_FOUND';
        throw err;
      }
    }

    // Validate team if provided and ensure user belongs to it (unless Admin or Project Manager)
    if (dto.team_id) {
      const teamExists = await db.queryOne('SELECT id FROM teams WHERE id = ?', [dto.team_id]);
      if (!teamExists) {
        const err = new Error(`Team with ID ${dto.team_id} does not exist`);
        (err as any).code = 'TEAM_NOT_FOUND';
        throw err;
      }

      if (!this.isAdmin(actor)) {
        const project = await db.queryOne<{ manager_id: number | null }>(
          'SELECT manager_id FROM projects WHERE id = ?',
          [dto.project_id]
        );
        const isManager = project?.manager_id === actor.id;
        if (!isManager) {
          const inTeam = await TeamService.isUserInTeam(dto.team_id, actor.id);
          if (!inTeam) {
            const err = new Error('You can only assign tasks to teams you are a member of');
            (err as any).code = 'FORBIDDEN';
            throw err;
          }
        }
      }
    }

    const priority: TaskPriority = dto.priority || 'MEDIUM';
    const status: TaskStatus = dto.status || 'TODO';
    const itemType = dto.item_type === 'EVENT' ? 'EVENT' : 'TASK';

    // Calculate position order for Kanban column ordering
    let positionOrder = dto.position_order;
    if (positionOrder === undefined) {
      const maxPos = await db.queryOne<{ max_pos: number }>(`
        SELECT COALESCE(MAX(position_order), 0.0) as max_pos
        FROM tasks
        WHERE project_id = ? AND status = ?
      `, [dto.project_id, status]);
      positionOrder = Number(maxPos?.max_pos || 0) + 1000.0;
    }

    // ATOMIC TRANSACTION: Task + Subtasks + Watchers + Activity Log
    const createdTaskId = await db.withTransaction(async (tx) => {
      const result = await tx.queryOne(`
        INSERT INTO tasks (
          title, description, project_id, team_id, assignee_id, creator_id,
          priority, status, start_date, due_date, position_order, item_type
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING id
      `, [
        trimmedTitle,
        dto.description?.trim() || null,
        dto.project_id,
        dto.team_id || null,
        dto.assignee_id || null,
        actor.id,
        priority,
        status,
        itemType === 'EVENT' ? null : (dto.start_date || null),
        dto.due_date || null,
        positionOrder,
        itemType
      ]);

      const newTaskId = Number(result.id);

      // 1. Auto-add creator to task_watchers
      await tx.execute(`
        INSERT INTO task_watchers (task_id, user_id)
        VALUES (?, ?)
        ON CONFLICT DO NOTHING
      `, [newTaskId, actor.id]);

      // 2. Auto-add assignee to task_watchers if different
      if (dto.assignee_id && dto.assignee_id !== actor.id) {
        await tx.execute(`
          INSERT INTO task_watchers (task_id, user_id)
          VALUES (?, ?)
          ON CONFLICT DO NOTHING
        `, [newTaskId, dto.assignee_id]);
      }

      // 3. Insert subtasks if provided (for tasks)
      if (itemType === 'TASK' && dto.subtasks && dto.subtasks.length > 0) {
        for (let idx = 0; idx < dto.subtasks.length; idx++) {
          const subTitle = dto.subtasks[idx];
          if (subTitle.trim()) {
            await tx.execute(`
              INSERT INTO subtasks (task_id, title, position)
              VALUES (?, ?, ?)
            `, [newTaskId, subTitle.trim(), idx]);
          }
        }
      }

      // 4. Record Activity Log
      const actionDesc = itemType === 'EVENT'
        ? `${actor.name} created the event`
        : `${actor.name} created the task`;

      await tx.execute(`
        INSERT INTO activity_logs (task_id, project_id, actor_id, action_type, description)
        VALUES (?, ?, ?, 'CREATED', ?)
      `, [newTaskId, dto.project_id, actor.id, actionDesc]);

      return newTaskId;
    });

    const createdTask = await this.getTaskById(createdTaskId, actor);

    // POST-COMMIT: Event Dispatcher
    await eventDispatcher.dispatch(DomainEventType.TASK_CREATED, actor.id, createdTask);

    return createdTask;
  }

  /**
   * Get single task with subtasks, comments, watchers, and full activity history
   */
  public static async getTaskById(taskId: number, currentUser: User): Promise<TaskDetail> {
    const task = await this.getRawTask(taskId);

    // Verify task access with team RBAC
    const hasAccess = await this.canUserAccessTask(task, currentUser);
    if (!hasAccess) {
      const err = new Error('You do not have access to this task');
      (err as any).code = 'FORBIDDEN';
      throw err;
    }

    // Subtasks
    const subtaskRows = await db.query(`
      SELECT id, task_id, title, is_completed, position, created_at
      FROM subtasks
      WHERE task_id = ?
      ORDER BY position ASC, id ASC
    `, [taskId]);

    const subtasks: Subtask[] = subtaskRows.map((s: any) => ({
      ...s,
      is_completed: Boolean(s.is_completed)
    }));

    // Comments
    const comments = await db.query<TaskComment>(`
      SELECT 
        c.id, c.task_id, c.user_id, c.content, c.created_at,
        u.name as user_name, u.role as user_role, u.avatar_url as user_avatar
      FROM task_comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.task_id = ?
      ORDER BY c.created_at ASC
    `, [taskId]);

    // Watchers
    const watchers = await db.query<TaskWatcher>(`
      SELECT 
        tw.task_id, tw.user_id, tw.created_at,
        u.name as user_name, u.email as user_email
      FROM task_watchers tw
      JOIN users u ON tw.user_id = u.id
      WHERE tw.task_id = ?
    `, [taskId]);

    // Activity Logs
    const activity_logs = await db.query<ActivityLog>(`
      SELECT 
        al.id, al.task_id, al.project_id, al.actor_id, al.action_type,
        al.old_value, al.new_value, al.description, al.created_at,
        u.name as actor_name, u.role as actor_role
      FROM activity_logs al
      JOIN users u ON al.actor_id = u.id
      WHERE al.task_id = ?
      ORDER BY al.created_at DESC
    `, [taskId]);

    // Attachments
    const attachments = await db.query<AttachmentDTO>(`
      SELECT 
        a.id, a.entity_type, a.entity_id, a.file_name, a.mime_type, a.file_size,
        a.uploaded_by, a.created_at,
        u.name as uploader_name, u.avatar_url as uploader_avatar
      FROM attachments a
      LEFT JOIN users u ON a.uploaded_by = u.id
      WHERE a.entity_type = 'TASK' AND a.entity_id = ?
      ORDER BY a.created_at DESC
    `, [taskId]);

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
  public static async getTasks(filters: TaskFilterDTO, currentUser: User): Promise<Task[]> {
    const conditions: string[] = [];
    const params: any[] = [];

    // RBAC: Non-admin users only see tasks from projects they have access to,
    // and only tasks assigned to their teams (or unassigned, or where they are creator/assignee/PM)
    if (!this.isAdmin(currentUser)) {
      conditions.push(`
        t.project_id IN (
          SELECT id FROM projects WHERE manager_id = ?
          UNION
          SELECT project_id FROM project_members WHERE user_id = ?
          UNION
          SELECT p2.id FROM projects p2 
          JOIN team_members tm ON p2.team_id = tm.team_id 
          WHERE tm.user_id = ?
          UNION
          SELECT p3.id FROM projects p3
          JOIN teams t3 ON p3.team_id = t3.id
          WHERE t3.lead_id = ?
        )
      `);
      params.push(currentUser.id, currentUser.id, currentUser.id, currentUser.id);

      conditions.push(`
        (
          t.team_id IS NULL
          OR t.team_id IN (
            SELECT team_id FROM team_members WHERE user_id = ?
            UNION
            SELECT id FROM teams WHERE lead_id = ?
          )
          OR t.assignee_id = ?
          OR t.creator_id = ?
          OR p.manager_id = ?
        )
      `);
      params.push(currentUser.id, currentUser.id, currentUser.id, currentUser.id, currentUser.id);
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
      conditions.push('(t.title ILIKE ? OR t.description ILIKE ?)');
      params.push(`%${filters.search}%`, `%${filters.search}%`);
    }

    if (filters.item_type) {
      conditions.push('t.item_type = ?');
      params.push(filters.item_type);
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
        (SELECT COUNT(*) FROM subtasks s WHERE s.task_id = t.id AND s.is_completed = TRUE) as subtasks_completed,
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

    return db.query(sql, params);
  }

  /**
   * Update task fields (Title, Description, Priority, Due Date, Team)
   */
  public static async updateTask(taskId: number, dto: UpdateTaskDTO, actor: User): Promise<Task> {
    const task = await this.getRawTask(taskId);

    const hasAccess = await this.canUserAccessTask(task, actor);
    if (!hasAccess) {
      const err = new Error('You do not have permission to update this task');
      (err as any).code = 'FORBIDDEN';
      throw err;
    }

    if (dto.team_id !== undefined && dto.team_id !== null && dto.team_id !== task.team_id) {
      const teamExists = await db.queryOne('SELECT id FROM teams WHERE id = ?', [dto.team_id]);
      if (!teamExists) {
        const err = new Error(`Team with ID ${dto.team_id} does not exist`);
        (err as any).code = 'TEAM_NOT_FOUND';
        throw err;
      }

      if (!this.isAdmin(actor)) {
        const project = await db.queryOne<{ manager_id: number | null }>(
          'SELECT manager_id FROM projects WHERE id = ?',
          [task.project_id]
        );
        const isManager = project?.manager_id === actor.id;
        if (!isManager) {
          const inTeam = await TeamService.isUserInTeam(dto.team_id, actor.id);
          if (!inTeam) {
            const err = new Error('You can only assign tasks to teams you are a member of');
            (err as any).code = 'FORBIDDEN';
            throw err;
          }
        }
      }
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
    const itemType = dto.item_type !== undefined ? dto.item_type : task.item_type;

    await db.withTransaction(async (tx) => {
      await tx.execute(`
        UPDATE tasks
        SET title = ?, description = ?, team_id = ?, priority = ?,
            start_date = ?, due_date = ?, position_order = ?, item_type = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [
        trimmedTitle,
        description,
        teamId,
        priority,
        itemType === 'EVENT' ? null : startDate,
        dueDate,
        positionOrder,
        itemType,
        taskId
      ]);

      if (trimmedTitle !== task.title) {
        await tx.execute(`
          INSERT INTO activity_logs (task_id, project_id, actor_id, action_type, old_value, new_value, description)
          VALUES (?, ?, ?, 'TITLE_CHANGED', ?, ?, ?)
        `, [taskId, task.project_id, actor.id, task.title, trimmedTitle, `${actor.name} renamed task to "${trimmedTitle}"`]);
      }
      if (priority !== task.priority) {
        await tx.execute(`
          INSERT INTO activity_logs (task_id, project_id, actor_id, action_type, old_value, new_value, description)
          VALUES (?, ?, ?, 'PRIORITY_CHANGED', ?, ?, ?)
        `, [taskId, task.project_id, actor.id, task.priority, priority, `${actor.name} changed priority from ${task.priority} to ${priority}`]);
      }
      if (dueDate !== task.due_date) {
        await tx.execute(`
          INSERT INTO activity_logs (task_id, project_id, actor_id, action_type, old_value, new_value, description)
          VALUES (?, ?, ?, 'DUE_DATE_CHANGED', ?, ?, ?)
        `, [taskId, task.project_id, actor.id, task.due_date, dueDate, `${actor.name} updated due date`]);
      }
    });

    const updatedTask = await this.getTaskById(taskId, actor);

    // POST-COMMIT: Event Dispatcher
    await eventDispatcher.dispatch(DomainEventType.TASK_UPDATED, actor.id, updatedTask);

    return updatedTask;
  }

  /**
   * Central authoritative Status Transition (Kanban drag-drop, My Work checkbox, etc.)
   */
  public static async updateStatus(taskId: number, newStatus: TaskStatus, newPosition: number | undefined, actor: User): Promise<Task> {
    const validStatuses: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'REVIEW', 'BLOCKED', 'COMPLETED'];
    if (!validStatuses.includes(newStatus)) {
      const err = new Error(`Invalid task status: ${newStatus}`);
      (err as any).code = 'INVALID_STATUS_TRANSITION';
      throw err;
    }

    const task = await this.getRawTask(taskId);

    const hasAccess = await this.canUserAccessTask(task, actor);
    if (!hasAccess) {
      const err = new Error('You do not have permission to change status of this task');
      (err as any).code = 'FORBIDDEN';
      throw err;
    }

    const oldStatus = task.status;
    const position = newPosition !== undefined ? newPosition : task.position_order;

    await db.withTransaction(async (tx) => {
      await tx.execute(`
        UPDATE tasks
        SET status = ?, position_order = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [newStatus, position, taskId]);

      if (oldStatus !== newStatus) {
        await tx.execute(`
          INSERT INTO activity_logs (task_id, project_id, actor_id, action_type, old_value, new_value, description)
          VALUES (?, ?, ?, 'STATUS_CHANGED', ?, ?, ?)
        `, [
          taskId,
          task.project_id,
          actor.id,
          oldStatus,
          newStatus,
          `${actor.name} changed status from ${oldStatus} to ${newStatus}`
        ]);
      }
    });

    const updatedTask = await this.getTaskById(taskId, actor);

    // POST-COMMIT: Event Dispatcher
    await eventDispatcher.dispatch(DomainEventType.TASK_STATUS_CHANGED, actor.id, {
      task: updatedTask,
      oldStatus,
      newStatus
    });

    return updatedTask;
  }

  /**
   * Reassign a task to another user
   */
  public static async assignTask(taskId: number, assigneeId: number | null, actor: User): Promise<Task> {
    const task = await this.getRawTask(taskId);

    const hasAccess = await this.canUserAccessTask(task, actor);
    if (!hasAccess) {
      const err = new Error('You do not have permission to reassign this task');
      (err as any).code = 'FORBIDDEN';
      throw err;
    }

    let newAssigneeName = 'Unassigned';
    if (assigneeId) {
      const assignee = await db.queryOne<{ id: number; name: string }>('SELECT id, name FROM users WHERE id = ?', [assigneeId]);
      if (!assignee) {
        const err = new Error(`User with ID ${assigneeId} does not exist`);
        (err as any).code = 'USER_NOT_FOUND';
        throw err;
      }
      newAssigneeName = assignee.name;
    }

    const oldAssigneeId = task.assignee_id;
    const oldAssigneeName = task.assignee_name || 'Unassigned';

    await db.withTransaction(async (tx) => {
      await tx.execute(`
        UPDATE tasks
        SET assignee_id = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [assigneeId, taskId]);

      if (assigneeId) {
        await tx.execute(`
          INSERT INTO task_watchers (task_id, user_id)
          VALUES (?, ?)
          ON CONFLICT DO NOTHING
        `, [taskId, assigneeId]);
      }

      await tx.execute(`
        INSERT INTO activity_logs (task_id, project_id, actor_id, action_type, old_value, new_value, description)
        VALUES (?, ?, ?, 'ASSIGNED', ?, ?, ?)
      `, [
        taskId,
        task.project_id,
        actor.id,
        oldAssigneeName,
        newAssigneeName,
        `${actor.name} assigned task to ${newAssigneeName}`
      ]);
    });

    const updatedTask = await this.getTaskById(taskId, actor);

    // POST-COMMIT: Event Dispatcher
    await eventDispatcher.dispatch(DomainEventType.TASK_ASSIGNED, actor.id, {
      task: updatedTask,
      oldAssigneeId,
      newAssigneeId: assigneeId
    });

    return updatedTask;
  }

  /**
   * Delete a task (Admin or Project Manager)
   */
  public static async deleteTask(taskId: number, actor: User): Promise<void> {
    const task = await this.getRawTask(taskId);

    const hasAccess = await this.canUserAccessTask(task, actor);
    if (!hasAccess) {
      const err = new Error('You do not have permission to delete this task');
      (err as any).code = 'FORBIDDEN';
      throw err;
    }

    const project = await db.queryOne<{ manager_id: number }>('SELECT manager_id FROM projects WHERE id = ?', [task.project_id]);
    const isManager = project?.manager_id === actor.id;

    if (!this.isAdmin(actor) && !isManager) {
      const err = new Error('Only administrators or the assigned project manager can delete tasks');
      (err as any).code = 'FORBIDDEN';
      throw err;
    }

    await db.withTransaction(async (tx) => {
      await tx.execute('DELETE FROM tasks WHERE id = ?', [taskId]);
    });

    // POST-COMMIT: Event Dispatcher
    await eventDispatcher.dispatch(DomainEventType.TASK_DELETED, actor.id, {
      taskId,
      projectId: task.project_id
    });
  }

  /**
   * Subtasks Management
   */
  public static async addSubtask(taskId: number, title: string, actor: User): Promise<Subtask> {
    const trimmed = title?.trim();
    if (!trimmed) {
      const err = new Error('Subtask title cannot be empty');
      (err as any).code = 'VALIDATION_ERROR';
      throw err;
    }

    const task = await this.getRawTask(taskId);
    const hasAccess = await this.canUserAccessTask(task, actor);
    if (!hasAccess) {
      const err = new Error('You do not have access to this task');
      (err as any).code = 'FORBIDDEN';
      throw err;
    }

    const maxPos = await db.queryOne<{ max_pos: number }>('SELECT COALESCE(MAX(position), -1) as max_pos FROM subtasks WHERE task_id = ?', [taskId]);

    const newSubtaskId = await db.withTransaction(async (tx) => {
      const res = await tx.queryOne(`
        INSERT INTO subtasks (task_id, title, position)
        VALUES (?, ?, ?)
        RETURNING id
      `, [taskId, trimmed, (maxPos?.max_pos ?? -1) + 1]);

      await tx.execute(`
        INSERT INTO activity_logs (task_id, project_id, actor_id, action_type, description)
        VALUES (?, ?, ?, 'SUBTASK_ADDED', ?)
      `, [taskId, task.project_id, actor.id, `${actor.name} added subtask: "${trimmed}"`]);

      return Number(res.id);
    });

    const subtask = await db.queryOne('SELECT * FROM subtasks WHERE id = ?', [newSubtaskId]);
    const result: Subtask = { ...subtask, is_completed: Boolean(subtask.is_completed) };

    await eventDispatcher.dispatch(DomainEventType.SUBTASK_CREATED, actor.id, { taskId, projectId: task.project_id, subtask: result });
    return result;
  }

  public static async updateSubtask(subtaskId: number, updates: { title?: string; is_completed?: boolean }, actor: User): Promise<Subtask> {
    const subtask = await db.queryOne('SELECT * FROM subtasks WHERE id = ?', [subtaskId]);
    if (!subtask) {
      const err = new Error('Subtask not found');
      (err as any).code = 'NOT_FOUND';
      throw err;
    }

    const task = await this.getRawTask(subtask.task_id);
    const hasAccess = await this.canUserAccessTask(task, actor);
    if (!hasAccess) {
      const err = new Error('You do not have access to this task');
      (err as any).code = 'FORBIDDEN';
      throw err;
    }

    const title = updates.title !== undefined ? updates.title.trim() : subtask.title;
    const isCompleted = updates.is_completed !== undefined ? updates.is_completed : subtask.is_completed;

    await db.withTransaction(async (tx) => {
      await tx.execute(`
        UPDATE subtasks
        SET title = ?, is_completed = ?
        WHERE id = ?
      `, [title, isCompleted, subtaskId]);

      if (updates.is_completed !== undefined && Boolean(subtask.is_completed) !== isCompleted) {
        const desc = isCompleted
          ? `${actor.name} marked subtask "${title}" as completed`
          : `${actor.name} marked subtask "${title}" as incomplete`;
        await tx.execute(`
          INSERT INTO activity_logs (task_id, project_id, actor_id, action_type, description)
          VALUES (?, ?, ?, 'SUBTASK_TOGGLED', ?)
        `, [task.id, task.project_id, actor.id, desc]);
      }
    });

    const updated = await db.queryOne('SELECT * FROM subtasks WHERE id = ?', [subtaskId]);
    const result: Subtask = { ...updated, is_completed: Boolean(updated.is_completed) };

    await eventDispatcher.dispatch(DomainEventType.SUBTASK_UPDATED, actor.id, { taskId: task.id, projectId: task.project_id, subtask: result });
    return result;
  }

  public static async deleteSubtask(subtaskId: number, actor: User): Promise<void> {
    const subtask = await db.queryOne('SELECT * FROM subtasks WHERE id = ?', [subtaskId]);
    if (!subtask) {
      const err = new Error('Subtask not found');
      (err as any).code = 'NOT_FOUND';
      throw err;
    }

    const task = await this.getRawTask(subtask.task_id);
    const hasAccess = await this.canUserAccessTask(task, actor);
    if (!hasAccess) {
      const err = new Error('You do not have access to this task');
      (err as any).code = 'FORBIDDEN';
      throw err;
    }

    await db.withTransaction(async (tx) => {
      await tx.execute('DELETE FROM subtasks WHERE id = ?', [subtaskId]);
      await tx.execute(`
        INSERT INTO activity_logs (task_id, project_id, actor_id, action_type, description)
        VALUES (?, ?, ?, 'SUBTASK_DELETED', ?)
      `, [task.id, task.project_id, actor.id, `${actor.name} removed subtask: "${subtask.title}"`]);
    });

    await eventDispatcher.dispatch(DomainEventType.SUBTASK_DELETED, actor.id, { taskId: task.id, projectId: task.project_id, subtaskId });
  }

  /**
   * Comments Management
   */
  public static async addComment(taskId: number, content: string, actor: User): Promise<TaskComment> {
    const trimmed = content?.trim();
    if (!trimmed) {
      const err = new Error('Comment content cannot be empty');
      (err as any).code = 'VALIDATION_ERROR';
      throw err;
    }

    const task = await this.getRawTask(taskId);
    const hasAccess = await this.canUserAccessTask(task, actor);
    if (!hasAccess) {
      const err = new Error('You do not have access to this task');
      (err as any).code = 'FORBIDDEN';
      throw err;
    }

    const newCommentId = await db.withTransaction(async (tx) => {
      const res = await tx.queryOne(`
        INSERT INTO task_comments (task_id, user_id, content)
        VALUES (?, ?, ?)
        RETURNING id
      `, [taskId, actor.id, trimmed]);

      // Auto-watch task when commenting
      await tx.execute(`
        INSERT INTO task_watchers (task_id, user_id)
        VALUES (?, ?)
        ON CONFLICT DO NOTHING
      `, [taskId, actor.id]);

      await tx.execute(`
        INSERT INTO activity_logs (task_id, project_id, actor_id, action_type, description)
        VALUES (?, ?, ?, 'COMMENT_ADDED', ?)
      `, [taskId, task.project_id, actor.id, `${actor.name} commented on the task`]);

      return Number(res.id);
    });

    const commentRow = await db.queryOne<TaskComment>(`
      SELECT 
        c.id, c.task_id, c.user_id, c.content, c.created_at,
        u.name as user_name, u.role as user_role, u.avatar_url as user_avatar
      FROM task_comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.id = ?
    `, [newCommentId]);

    await eventDispatcher.dispatch(DomainEventType.TASK_COMMENT_ADDED, actor.id, {
      comment: commentRow,
      taskId,
      projectId: task.project_id,
      task
    });

    return commentRow!;
  }

  /**
   * Get activity history for a task
   */
  public static async getTaskActivity(taskId: number, currentUser: User): Promise<ActivityLog[]> {
    const task = await this.getRawTask(taskId);
    const hasAccess = await this.canUserAccessTask(task, currentUser);
    if (!hasAccess) {
      const err = new Error('You do not have access to this task');
      (err as any).code = 'FORBIDDEN';
      throw err;
    }

    return db.query(`
      SELECT 
        al.id, al.task_id, al.project_id, al.actor_id, al.action_type,
        al.old_value, al.new_value, al.description, al.created_at,
        u.name as actor_name, u.role as actor_role
      FROM activity_logs al
      JOIN users u ON al.actor_id = u.id
      WHERE al.task_id = ?
      ORDER BY al.created_at DESC
    `, [taskId]);
  }
}
