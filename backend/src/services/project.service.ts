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
  public static async canUserAccessProject(projectId: number, user: User): Promise<boolean> {
    if (this.isAdmin(user)) return true;

    // Check if user is manager or explicitly in project_members
    const isMember = await db.queryOne(`
      SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?
      UNION
      SELECT 1 FROM projects WHERE id = ? AND manager_id = ?
    `, [projectId, user.id, projectId, user.id]);

    if (isMember) return true;

    // Check if project is assigned to a team the user belongs to
    const project = await db.queryOne<{ team_id: number | null }>('SELECT team_id FROM projects WHERE id = ?', [projectId]);
    if (project && project.team_id) {
      const inTeam = await db.queryOne('SELECT 1 FROM team_members WHERE team_id = ? AND user_id = ?', [project.team_id, user.id]);
      if (inTeam) return true;
    }

    return false;
  }

  /**
   * Calculate real-time project task progress statistics
   */
  public static async calculateProgress(projectId: number): Promise<ProjectProgress> {
    const stats = await db.queryOne<any>(`
      SELECT 
        COUNT(*) as total_tasks,
        SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) as completed_tasks,
        SUM(CASE WHEN status = 'IN_PROGRESS' THEN 1 ELSE 0 END) as in_progress_tasks,
        SUM(CASE WHEN status = 'TODO' THEN 1 ELSE 0 END) as todo_tasks,
        SUM(CASE WHEN status = 'REVIEW' THEN 1 ELSE 0 END) as review_tasks,
        SUM(CASE WHEN status = 'BLOCKED' THEN 1 ELSE 0 END) as blocked_tasks
      FROM tasks
      WHERE project_id = ?
    `, [projectId]);

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
  public static async getAllProjects(currentUser: User): Promise<Project[]> {
    let rows: any[];

    if (this.isAdmin(currentUser)) {
      rows = await db.query(`
        SELECT 
          p.id, p.name, p.description, p.team_id, p.manager_id, p.status, p.created_at,
          t.name as team_name,
          u.name as manager_name, u.email as manager_email,
          (SELECT COUNT(*) FROM project_members pm WHERE pm.project_id = p.id) as member_count
        FROM projects p
        LEFT JOIN teams t ON p.team_id = t.id
        LEFT JOIN users u ON p.manager_id = u.id
        ORDER BY p.name ASC
      `);
    } else {
      // Return projects user manages, is a member of, or where user's team is assigned
      rows = await db.query(`
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
      `, [currentUser.id, currentUser.id, currentUser.id]);
    }

    const projects: Project[] = [];
    for (const r of rows) {
      const progress = await this.calculateProgress(r.id);
      projects.push({
        id: r.id,
        name: r.name,
        description: r.description,
        team_id: r.team_id,
        team_name: r.team_name,
        manager_id: r.manager_id,
        manager_name: r.manager_name,
        manager_email: r.manager_email,
        status: r.status,
        member_count: Number(r.member_count),
        progress,
        created_at: r.created_at
      });
    }

    return projects;
  }

  /**
   * Get single project by ID with authorization check
   */
  public static async getProjectById(projectId: number, currentUser: User): Promise<Project> {
    const row = await db.queryOne(`
      SELECT 
        p.id, p.name, p.description, p.team_id, p.manager_id, p.status, p.created_at,
        t.name as team_name,
        u.name as manager_name, u.email as manager_email,
        (SELECT COUNT(*) FROM project_members pm WHERE pm.project_id = p.id) as member_count
      FROM projects p
      LEFT JOIN teams t ON p.team_id = t.id
      LEFT JOIN users u ON p.manager_id = u.id
      WHERE p.id = ?
    `, [projectId]);

    if (!row) {
      const err = new Error(`Project with ID ${projectId} not found`);
      (err as any).code = 'PROJECT_NOT_FOUND';
      throw err;
    }

    // RBAC Authorization Check
    const hasAccess = await this.canUserAccessProject(projectId, currentUser);
    if (!hasAccess) {
      const err = new Error('You do not have permission to access this project');
      (err as any).code = 'FORBIDDEN';
      throw err;
    }

    const progress = await this.calculateProgress(row.id);

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
      member_count: Number(row.member_count),
      progress,
      created_at: row.created_at
    };
  }

  /**
   * Create a new project (Admin or Project Manager)
   */
  public static async createProject(dto: CreateProjectDTO, actor: User): Promise<Project> {
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
    const existing = await db.queryOne('SELECT id FROM projects WHERE LOWER(name) = LOWER(?)', [trimmedName]);
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
      const managerExists = await db.queryOne('SELECT id FROM users WHERE id = ?', [managerId]);
      if (!managerExists) {
        const err = new Error(`Manager user with ID ${managerId} does not exist`);
        (err as any).code = 'USER_NOT_FOUND';
        throw err;
      }
    }

    if (dto.team_id) {
      const teamExists = await db.queryOne('SELECT id FROM teams WHERE id = ?', [dto.team_id]);
      if (!teamExists) {
        const err = new Error(`Team with ID ${dto.team_id} does not exist`);
        (err as any).code = 'TEAM_NOT_FOUND';
        throw err;
      }
    }

    const status = dto.status || 'ACTIVE';

    // ATOMIC TRANSACTION: Insert project + project_members + default chat channels
    const createdProjectId = await db.withTransaction(async (tx) => {
      const insertResult = await tx.queryOne(`
        INSERT INTO projects (name, description, team_id, manager_id, status)
        VALUES (?, ?, ?, ?, ?)
        RETURNING id
      `, [
        trimmedName,
        dto.description?.trim() || null,
        dto.team_id || null,
        managerId,
        status
      ]);
      const newProjectId = Number(insertResult.id);

      // Add manager to members
      if (managerId) {
        await tx.execute(`
          INSERT INTO project_members (project_id, user_id, role_in_project)
          VALUES (?, ?, 'MANAGER')
          ON CONFLICT DO NOTHING
        `, [newProjectId, managerId]);
      }

      // Add additional members
      const memberSet = new Set<number>(dto.member_ids || []);
      for (const mId of memberSet) {
        if (mId !== managerId) {
          const uExists = await tx.queryOne('SELECT id FROM users WHERE id = ?', [mId]);
          if (!uExists) {
            throw new Error(`Cannot add non-existent user ${mId} to project`);
          }
          await tx.execute(`
            INSERT INTO project_members (project_id, user_id, role_in_project)
            VALUES (?, ?, 'MEMBER')
            ON CONFLICT DO NOTHING
          `, [newProjectId, mId]);
        }
      }

      // Create default project chat channels
      const genCh = await tx.queryOne(`
        INSERT INTO chat_channels (project_id, name, is_direct)
        VALUES (?, 'General', FALSE)
        RETURNING id
      `, [newProjectId]);
      const devCh = await tx.queryOne(`
        INSERT INTO chat_channels (project_id, name, is_direct)
        VALUES (?, 'Development', FALSE)
        RETURNING id
      `, [newProjectId]);
      const opsCh = await tx.queryOne(`
        INSERT INTO chat_channels (project_id, name, is_direct)
        VALUES (?, 'Operations', FALSE)
        RETURNING id
      `, [newProjectId]);

      const generalChId = Number(genCh.id);
      const devChId = Number(devCh.id);
      const opsChId = Number(opsCh.id);

      // Add members to default channels
      const allMembers = Array.from(new Set([actor.id, ...(managerId ? [managerId] : []), ...Array.from(memberSet)]));
      for (const uId of allMembers) {
        await tx.execute(`INSERT INTO chat_channel_members (channel_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING`, [generalChId, uId]);
        await tx.execute(`INSERT INTO chat_channel_members (channel_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING`, [devChId, uId]);
        await tx.execute(`INSERT INTO chat_channel_members (channel_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING`, [opsChId, uId]);
      }

      return newProjectId;
    });

    const createdProject = await this.getProjectById(createdProjectId, actor);

    // POST-COMMIT: Event Dispatcher
    await eventDispatcher.dispatch(DomainEventType.PROJECT_CREATED, actor.id, createdProject);

    return createdProject;
  }

  /**
   * Update project details (Admin or assigned Project Manager)
   */
  public static async updateProject(projectId: number, dto: UpdateProjectDTO, actor: User): Promise<Project> {
    const project = await this.getProjectById(projectId, actor);

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
      const duplicate = await db.queryOne('SELECT id FROM projects WHERE LOWER(name) = LOWER(?) AND id != ?', [trimmedName, projectId]);
      if (duplicate) {
        const err = new Error(`Project name '${trimmedName}' is already taken`);
        (err as any).code = 'CONFLICT';
        throw err;
      }
    }

    let newTeamId = project.team_id;
    if (dto.team_id !== undefined) {
      if (dto.team_id !== null) {
        const teamExists = await db.queryOne('SELECT id FROM teams WHERE id = ?', [dto.team_id]);
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
        const managerExists = await db.queryOne('SELECT id FROM users WHERE id = ?', [dto.manager_id]);
        if (!managerExists) {
          const err = new Error(`Manager ${dto.manager_id} does not exist`);
          (err as any).code = 'USER_NOT_FOUND';
          throw err;
        }
      }
      newManagerId = dto.manager_id;
    }

    const newStatus = dto.status || project.status;

    await db.withTransaction(async (tx) => {
      await tx.execute(`
        UPDATE projects
        SET name = ?, description = ?, team_id = ?, manager_id = ?, status = ?
        WHERE id = ?
      `, [
        trimmedName,
        dto.description !== undefined ? dto.description?.trim() || null : project.description,
        newTeamId,
        newManagerId,
        newStatus,
        projectId
      ]);

      // If manager updated, add them to project_members
      if (newManagerId) {
        await tx.execute(`
          INSERT INTO project_members (project_id, user_id, role_in_project)
          VALUES (?, ?, 'MANAGER')
          ON CONFLICT DO NOTHING
        `, [projectId, newManagerId]);
      }
    });

    const updated = await this.getProjectById(projectId, actor);

    // POST-COMMIT: Event Dispatcher
    await eventDispatcher.dispatch(DomainEventType.PROJECT_UPDATED, actor.id, updated);

    return updated;
  }

  /**
   * Delete a project (Admin only)
   */
  public static async deleteProject(projectId: number, actor: User): Promise<void> {
    if (!this.isAdmin(actor)) {
      const err = new Error('Only administrators can delete projects');
      (err as any).code = 'FORBIDDEN';
      throw err;
    }

    const project = await this.getProjectById(projectId, actor);

    await db.withTransaction(async (tx) => {
      await tx.execute('DELETE FROM projects WHERE id = ?', [projectId]);
    });

    // POST-COMMIT: Event Dispatcher
    await eventDispatcher.dispatch(DomainEventType.PROJECT_DELETED, actor.id, { id: projectId, name: project.name });
  }

  /**
   * Get members of a project
   */
  public static async getProjectMembers(projectId: number, currentUser: User): Promise<ProjectMember[]> {
    await this.getProjectById(projectId, currentUser); // Check access

    const rows = await db.query(`
      SELECT 
        pm.project_id, pm.user_id, pm.role_in_project,
        u.name, u.email, u.role, u.avatar_url
      FROM project_members pm
      JOIN users u ON pm.user_id = u.id
      WHERE pm.project_id = ?
      ORDER BY u.name ASC
    `, [projectId]);

    return rows;
  }

  /**
   * Add a member to a project (Admin or Project Manager)
   */
  public static async addMember(
    projectId: number,
    userId: number,
    roleInProject = 'MEMBER',
    actor: User
  ): Promise<ProjectMember> {
    const project = await this.getProjectById(projectId, actor);

    const isManager = project.manager_id === actor.id;
    if (!this.isAdmin(actor) && !isManager) {
      const err = new Error('Only administrators or the assigned project manager can add project members');
      (err as any).code = 'FORBIDDEN';
      throw err;
    }

    const user = await db.queryOne('SELECT id, name, email, role, avatar_url FROM users WHERE id = ?', [userId]);
    if (!user) {
      const err = new Error(`User with ID ${userId} not found`);
      (err as any).code = 'USER_NOT_FOUND';
      throw err;
    }

    const existing = await db.queryOne('SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?', [projectId, userId]);
    if (existing) {
      const err = new Error('User is already a member of this project');
      (err as any).code = 'CONFLICT';
      throw err;
    }

    await db.withTransaction(async (tx) => {
      await tx.execute(`
        INSERT INTO project_members (project_id, user_id, role_in_project)
        VALUES (?, ?, ?)
      `, [projectId, userId, roleInProject]);

      // Auto-join project chat channels
      const channels = await tx.query<{ id: number }>('SELECT id FROM chat_channels WHERE project_id = ?', [projectId]);
      for (const ch of channels) {
        await tx.execute(`
          INSERT INTO chat_channel_members (channel_id, user_id)
          VALUES (?, ?)
          ON CONFLICT DO NOTHING
        `, [ch.id, userId]);
      }
    });

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
    await eventDispatcher.dispatch(DomainEventType.PROJECT_MEMBER_ADDED, actor.id, newMember);

    return newMember;
  }

  /**
   * Remove a member from a project (Admin or Project Manager)
   */
  public static async removeMember(projectId: number, userId: number, actor: User): Promise<void> {
    const project = await this.getProjectById(projectId, actor);

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

    const existing = await db.queryOne('SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?', [projectId, userId]);
    if (!existing) {
      const err = new Error('User is not a member of this project');
      (err as any).code = 'NOT_FOUND';
      throw err;
    }

    await db.withTransaction(async (tx) => {
      await tx.execute('DELETE FROM project_members WHERE project_id = ? AND user_id = ?', [projectId, userId]);
    });

    // POST-COMMIT: Event Dispatcher
    await eventDispatcher.dispatch(DomainEventType.PROJECT_MEMBER_REMOVED, actor.id, { projectId, userId });
  }
}
