import { db } from '../db.js';
import { Project, ProjectMember, ProjectProgress, CreateProjectDTO, UpdateProjectDTO } from '../types/project.js';
import { User } from '../types/auth.js';
import { eventDispatcher } from '../events/dispatcher.js';
import { DomainEventType } from '../events/types.js';

export class ProjectService {
  private static isAdmin(user: User): boolean {
    return user.role === 'ADMIN';
  }

  /**
   * Check if a user has permission to view a project
   */
  public static canUserAccessProject(projectId: number, user: User): boolean {
    if (this.isAdmin(user)) return true;

    // Check if user is manager or explicitly in project_members
    const isMember = db.prepare(`
      SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?
      UNION
      SELECT 1 FROM projects WHERE id = ? AND manager_id = ?
    `).get(projectId, user.id, projectId, user.id);

    if (isMember) return true;

    // Check if project is assigned to a team the user belongs to
    const project = db.prepare('SELECT team_id FROM projects WHERE id = ?').get(projectId) as { team_id: number | null };
    if (project && project.team_id) {
      const inTeam = db.prepare('SELECT 1 FROM team_members WHERE team_id = ? AND user_id = ?').get(project.team_id, user.id);
      if (inTeam) return true;
    }

    return false;
  }

  /**
   * Calculate real-time project task progress statistics
   */
  public static calculateProgress(projectId: number): ProjectProgress {
    const stats = db.prepare(`
      SELECT 
        COUNT(*) as total_tasks,
        SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) as completed_tasks,
        SUM(CASE WHEN status = 'IN_PROGRESS' THEN 1 ELSE 0 END) as in_progress_tasks,
        SUM(CASE WHEN status = 'TODO' THEN 1 ELSE 0 END) as todo_tasks,
        SUM(CASE WHEN status = 'REVIEW' THEN 1 ELSE 0 END) as review_tasks,
        SUM(CASE WHEN status = 'BLOCKED' THEN 1 ELSE 0 END) as blocked_tasks
      FROM tasks
      WHERE project_id = ?
    `).get(projectId) as any;

    const total = Number(stats?.total_tasks || 0);
    const completed = Number(stats?.completed_tasks || 0);
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

    return {
      total_tasks: total,
      completed_tasks: completed,
      in_progress_tasks: Number(stats?.in_progress_tasks || 0),
      todo_tasks: Number(stats?.todo_tasks || 0),
      review_tasks: Number(stats?.review_tasks || 0),
      blocked_tasks: Number(stats?.blocked_tasks || 0),
      progress_percentage: percentage
    };
  }

  /**
   * Get all projects accessible to the current user
   */
  public static getAllProjects(currentUser: User): Project[] {
    let rows: any[];

    if (this.isAdmin(currentUser)) {
      rows = db.prepare(`
        SELECT 
          p.id, p.name, p.description, p.team_id, p.manager_id, p.status, p.created_at,
          t.name as team_name,
          u.name as manager_name, u.email as manager_email,
          (SELECT COUNT(*) FROM project_members pm WHERE pm.project_id = p.id) as member_count
        FROM projects p
        LEFT JOIN teams t ON p.team_id = t.id
        LEFT JOIN users u ON p.manager_id = u.id
        ORDER BY p.name ASC
      `).all();
    } else {
      // Return projects user manages, is a member of, or where user's team is assigned
      rows = db.prepare(`
        SELECT DISTINCT
          p.id, p.name, p.description, p.team_id, p.manager_id, p.status, p.created_at,
          t.name as team_name,
          u.name as manager_name, u.email as manager_email,
          (SELECT COUNT(*) FROM project_members pm WHERE pm.project_id = p.id) as member_count
        FROM projects p
        LEFT JOIN teams t ON p.team_id = t.id
        LEFT JOIN users u ON p.manager_id = u.id
        WHERE p.manager_id = ?
           OR p.id IN (SELECT project_id FROM project_members WHERE user_id = ?)
           OR p.team_id IN (SELECT team_id FROM team_members WHERE user_id = ?)
        ORDER BY p.name ASC
      `).all(currentUser.id, currentUser.id, currentUser.id);
    }

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      team_id: r.team_id,
      team_name: r.team_name,
      manager_id: r.manager_id,
      manager_name: r.manager_name,
      manager_email: r.manager_email,
      status: r.status,
      member_count: r.member_count,
      progress: this.calculateProgress(r.id),
      created_at: r.created_at
    }));
  }

  /**
   * Get single project by ID with authorization check
   */
  public static getProjectById(projectId: number, currentUser: User): Project {
    const row = db.prepare(`
      SELECT 
        p.id, p.name, p.description, p.team_id, p.manager_id, p.status, p.created_at,
        t.name as team_name,
        u.name as manager_name, u.email as manager_email,
        (SELECT COUNT(*) FROM project_members pm WHERE pm.project_id = p.id) as member_count
      FROM projects p
      LEFT JOIN teams t ON p.team_id = t.id
      LEFT JOIN users u ON p.manager_id = u.id
      WHERE p.id = ?
    `).get(projectId) as any;

    if (!row) {
      const err = new Error(`Project with ID ${projectId} not found`);
      (err as any).code = 'PROJECT_NOT_FOUND';
      throw err;
    }

    // RBAC Authorization Check
    if (!this.canUserAccessProject(projectId, currentUser)) {
      const err = new Error('You do not have permission to access this project');
      (err as any).code = 'FORBIDDEN';
      throw err;
    }

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      team_id: row.team_id,
      team_name: row.team_name,
      manager_id: row.manager_id,
      manager_name: row.manager_name,
      manager_email: row.manager_email,
      status: row.status,
      member_count: row.member_count,
      progress: this.calculateProgress(row.id),
      created_at: row.created_at
    };
  }

  /**
   * Create a new project (Admin or Project Manager)
   */
  public static createProject(dto: CreateProjectDTO, actor: User): Project {
    if (actor.role === 'TEAM_MEMBER') {
      const err = new Error('Team Members are not authorized to create projects');
      (err as any).code = 'FORBIDDEN';
      throw err;
    }

    const trimmedName = dto.name?.trim();
    if (!trimmedName || trimmedName.length < 2) {
      const err = new Error('Project name must be at least 2 characters long');
      (err as any).code = 'VALIDATION_ERROR';
      throw err;
    }

    // Check name uniqueness
    const existing = db.prepare('SELECT id FROM projects WHERE name = ? COLLATE NOCASE').get(trimmedName);
    if (existing) {
      const err = new Error(`Project name '${trimmedName}' is already in use`);
      (err as any).code = 'CONFLICT';
      throw err;
    }

    // Determine manager: if PM creates, default to themselves unless Admin specifies otherwise
    let managerId = actor.role === 'PROJECT_MANAGER' ? actor.id : dto.manager_id || null;
    if (dto.manager_id !== undefined && this.isAdmin(actor)) {
      managerId = dto.manager_id;
    }

    if (managerId) {
      const managerExists = db.prepare('SELECT id FROM users WHERE id = ?').get(managerId);
      if (!managerExists) {
        const err = new Error(`Manager user with ID ${managerId} does not exist`);
        (err as any).code = 'USER_NOT_FOUND';
        throw err;
      }
    }

    if (dto.team_id) {
      const teamExists = db.prepare('SELECT id FROM teams WHERE id = ?').get(dto.team_id);
      if (!teamExists) {
        const err = new Error(`Team with ID ${dto.team_id} does not exist`);
        (err as any).code = 'TEAM_NOT_FOUND';
        throw err;
      }
    }

    const status = dto.status || 'ACTIVE';

    // ATOMIC TRANSACTION: Insert project + project_members + default chat channels
    const createTx = db.transaction(() => {
      const insertStmt = db.prepare(`
        INSERT INTO projects (name, description, team_id, manager_id, status)
        VALUES (?, ?, ?, ?, ?)
      `);
      const result = insertStmt.run(
        trimmedName,
        dto.description?.trim() || null,
        dto.team_id || null,
        managerId,
        status
      );
      const newProjectId = Number(result.lastInsertRowid);

      const insertMemberStmt = db.prepare(`
        INSERT OR IGNORE INTO project_members (project_id, user_id, role_in_project)
        VALUES (?, ?, ?)
      `);

      // Add manager to members
      if (managerId) {
        insertMemberStmt.run(newProjectId, managerId, 'MANAGER');
      }

      // Add additional members
      const memberSet = new Set<number>(dto.member_ids || []);
      for (const mId of memberSet) {
        if (mId !== managerId) {
          const uExists = db.prepare('SELECT id FROM users WHERE id = ?').get(mId);
          if (!uExists) {
            throw new Error(`Cannot add non-existent user ${mId} to project`);
          }
          insertMemberStmt.run(newProjectId, mId, 'MEMBER');
        }
      }

      // Create default project chat channels
      const insertChannel = db.prepare(`
        INSERT INTO chat_channels (project_id, name, is_direct)
        VALUES (?, ?, ?)
      `);
      const generalChId = insertChannel.run(newProjectId, 'General', 0).lastInsertRowid;
      const devChId = insertChannel.run(newProjectId, 'Development', 0).lastInsertRowid;
      const opsChId = insertChannel.run(newProjectId, 'Operations', 0).lastInsertRowid;

      // Add members to default channels
      const allMembers = Array.from(new Set([actor.id, ...(managerId ? [managerId] : []), ...Array.from(memberSet)]));
      const addChMember = db.prepare(`
        INSERT OR IGNORE INTO chat_channel_members (channel_id, user_id)
        VALUES (?, ?)
      `);
      for (const uId of allMembers) {
        addChMember.run(generalChId, uId);
        addChMember.run(devChId, uId);
        addChMember.run(opsChId, uId);
      }

      return newProjectId;
    });

    const createdProjectId = createTx();
    const createdProject = this.getProjectById(createdProjectId, actor);

    // POST-COMMIT: Event Dispatcher
    eventDispatcher.dispatch(DomainEventType.PROJECT_CREATED, actor.id, createdProject);

    return createdProject;
  }

  /**
   * Update project details (Admin or assigned Project Manager)
   */
  public static updateProject(projectId: number, dto: UpdateProjectDTO, actor: User): Project {
    const project = this.getProjectById(projectId, actor);

    const isManager = project.manager_id === actor.id;
    if (!this.isAdmin(actor) && !isManager) {
      const err = new Error('Only administrators or the assigned project manager can modify this project');
      (err as any).code = 'FORBIDDEN';
      throw err;
    }

    const trimmedName = dto.name !== undefined ? dto.name.trim() : project.name;
    if (!trimmedName || trimmedName.length < 2) {
      const err = new Error('Project name must be at least 2 characters long');
      (err as any).code = 'VALIDATION_ERROR';
      throw err;
    }

    // Name uniqueness check if renamed
    if (trimmedName.toLowerCase() !== project.name.toLowerCase()) {
      const duplicate = db.prepare('SELECT id FROM projects WHERE name = ? COLLATE NOCASE AND id != ?').get(trimmedName, projectId);
      if (duplicate) {
        const err = new Error(`Project name '${trimmedName}' is already taken`);
        (err as any).code = 'CONFLICT';
        throw err;
      }
    }

    let newTeamId = project.team_id;
    if (dto.team_id !== undefined) {
      if (dto.team_id !== null) {
        const teamExists = db.prepare('SELECT id FROM teams WHERE id = ?').get(dto.team_id);
        if (!teamExists) {
          const err = new Error(`Team ${dto.team_id} does not exist`);
          (err as any).code = 'TEAM_NOT_FOUND';
          throw err;
        }
      }
      newTeamId = dto.team_id;
    }

    let newManagerId = project.manager_id;
    if (dto.manager_id !== undefined) {
      // Only Admin can reassign project manager
      if (!this.isAdmin(actor)) {
        const err = new Error('Only administrators can reassign project managers');
        (err as any).code = 'FORBIDDEN';
        throw err;
      }
      if (dto.manager_id !== null) {
        const managerExists = db.prepare('SELECT id FROM users WHERE id = ?').get(dto.manager_id);
        if (!managerExists) {
          const err = new Error(`Manager ${dto.manager_id} does not exist`);
          (err as any).code = 'USER_NOT_FOUND';
          throw err;
        }
      }
      newManagerId = dto.manager_id;
    }

    const newStatus = dto.status || project.status;

    const updateTx = db.transaction(() => {
      db.prepare(`
        UPDATE projects
        SET name = ?, description = ?, team_id = ?, manager_id = ?, status = ?
        WHERE id = ?
      `).run(
        trimmedName,
        dto.description !== undefined ? dto.description?.trim() || null : project.description,
        newTeamId,
        newManagerId,
        newStatus,
        projectId
      );

      // If manager updated, add them to project_members
      if (newManagerId) {
        db.prepare(`
          INSERT OR IGNORE INTO project_members (project_id, user_id, role_in_project)
          VALUES (?, ?, 'MANAGER')
        `).run(projectId, newManagerId);
      }
    });

    updateTx();
    const updated = this.getProjectById(projectId, actor);

    // POST-COMMIT: Event Dispatcher
    eventDispatcher.dispatch(DomainEventType.PROJECT_UPDATED, actor.id, updated);

    return updated;
  }

  /**
   * Delete a project (Admin only)
   */
  public static deleteProject(projectId: number, actor: User): void {
    if (!this.isAdmin(actor)) {
      const err = new Error('Only administrators can delete projects');
      (err as any).code = 'FORBIDDEN';
      throw err;
    }

    const project = this.getProjectById(projectId, actor);

    const deleteTx = db.transaction(() => {
      db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
    });

    deleteTx();

    // POST-COMMIT: Event Dispatcher
    eventDispatcher.dispatch(DomainEventType.PROJECT_DELETED, actor.id, { id: projectId, name: project.name });
  }

  /**
   * Get members of a project
   */
  public static getProjectMembers(projectId: number, currentUser: User): ProjectMember[] {
    this.getProjectById(projectId, currentUser); // Check access

    const rows = db.prepare(`
      SELECT 
        pm.project_id, pm.user_id, pm.role_in_project,
        u.name, u.email, u.role, u.avatar_url
      FROM project_members pm
      JOIN users u ON pm.user_id = u.id
      WHERE pm.project_id = ?
      ORDER BY u.name ASC
    `).all(projectId) as any[];

    return rows;
  }

  /**
   * Add a member to a project (Admin or Project Manager)
   */
  public static addMember(
    projectId: number,
    userId: number,
    roleInProject = 'MEMBER',
    actor: User
  ): ProjectMember {
    const project = this.getProjectById(projectId, actor);

    const isManager = project.manager_id === actor.id;
    if (!this.isAdmin(actor) && !isManager) {
      const err = new Error('Only administrators or the assigned project manager can add project members');
      (err as any).code = 'FORBIDDEN';
      throw err;
    }

    const user = db.prepare('SELECT id, name, email, role, avatar_url FROM users WHERE id = ?').get(userId) as any;
    if (!user) {
      const err = new Error(`User with ID ${userId} not found`);
      (err as any).code = 'USER_NOT_FOUND';
      throw err;
    }

    const existing = db.prepare('SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?').get(projectId, userId);
    if (existing) {
      const err = new Error('User is already a member of this project');
      (err as any).code = 'CONFLICT';
      throw err;
    }

    const addTx = db.transaction(() => {
      db.prepare(`
        INSERT INTO project_members (project_id, user_id, role_in_project)
        VALUES (?, ?, ?)
      `).run(projectId, userId, roleInProject);

      // Auto-join project chat channels
      const channels = db.prepare('SELECT id FROM chat_channels WHERE project_id = ?').all(projectId) as { id: number }[];
      const addChMember = db.prepare(`
        INSERT OR IGNORE INTO chat_channel_members (channel_id, user_id)
        VALUES (?, ?)
      `);
      for (const ch of channels) {
        addChMember.run(ch.id, userId);
      }
    });

    addTx();

    const newMember: ProjectMember = {
      project_id: projectId,
      user_id: user.id,
      role_in_project: roleInProject,
      name: user.name,
      email: user.email,
      role: user.role,
      avatar_url: user.avatar_url
    };

    // POST-COMMIT: Event Dispatcher
    eventDispatcher.dispatch(DomainEventType.PROJECT_MEMBER_ADDED, actor.id, newMember);

    return newMember;
  }

  /**
   * Remove a member from a project (Admin or Project Manager)
   */
  public static removeMember(projectId: number, userId: number, actor: User): void {
    const project = this.getProjectById(projectId, actor);

    const isManager = project.manager_id === actor.id;
    if (!this.isAdmin(actor) && !isManager) {
      const err = new Error('Only administrators or the assigned project manager can remove project members');
      (err as any).code = 'FORBIDDEN';
      throw err;
    }

    if (userId === project.manager_id) {
      const err = new Error('Cannot remove the project manager. Reassign the manager first.');
      (err as any).code = 'VALIDATION_ERROR';
      throw err;
    }

    const existing = db.prepare('SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?').get(projectId, userId);
    if (!existing) {
      const err = new Error('User is not a member of this project');
      (err as any).code = 'NOT_FOUND';
      throw err;
    }

    const removeTx = db.transaction(() => {
      db.prepare('DELETE FROM project_members WHERE project_id = ? AND user_id = ?').run(projectId, userId);
    });

    removeTx();

    // POST-COMMIT: Event Dispatcher
    eventDispatcher.dispatch(DomainEventType.PROJECT_MEMBER_REMOVED, actor.id, { projectId, userId });
  }
}
