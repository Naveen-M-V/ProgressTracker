import { db } from '../db.js';
import { Team, TeamMember, CreateTeamDTO, UpdateTeamDTO } from '../types/team.js';
import { User } from '../types/auth.js';
import { eventDispatcher } from '../events/dispatcher.js';
import { DomainEventType } from '../events/types.js';

export class TeamService {
  /**
   * Helper: Check if user is an Admin
   */
  private static isAdmin(user: User): boolean {
    return user.role === 'ADMIN';
  }

  /**
   * Helper: Check if user is a member or lead of the team
   */
  public static isUserInTeam(teamId: number, userId: number): boolean {
    const row = db.prepare(`
      SELECT 1 FROM team_members WHERE team_id = ? AND user_id = ?
      UNION
      SELECT 1 FROM teams WHERE id = ? AND lead_id = ?
    `).get(teamId, userId, teamId, userId);
    return !!row;
  }

  /**
   * List all teams (enriched with lead name and member count)
   */
  public static getAllTeams(currentUser: User): Team[] {
    const rows = db.prepare(`
      SELECT 
        t.id, t.name, t.description, t.lead_id, t.created_at,
        u.name as lead_name, u.email as lead_email,
        (SELECT COUNT(*) FROM team_members tm WHERE tm.team_id = t.id) as member_count
      FROM teams t
      LEFT JOIN users u ON t.lead_id = u.id
      ORDER BY t.name ASC
    `).all() as any[];

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      lead_id: r.lead_id,
      lead_name: r.lead_name,
      lead_email: r.lead_email,
      member_count: r.member_count,
      created_at: r.created_at
    }));
  }

  /**
   * Get team details by ID
   */
  public static getTeamById(teamId: number, currentUser: User): Team {
    const row = db.prepare(`
      SELECT 
        t.id, t.name, t.description, t.lead_id, t.created_at,
        u.name as lead_name, u.email as lead_email,
        (SELECT COUNT(*) FROM team_members tm WHERE tm.team_id = t.id) as member_count
      FROM teams t
      LEFT JOIN users u ON t.lead_id = u.id
      WHERE t.id = ?
    `).get(teamId) as any;

    if (!row) {
      const err = new Error(`Team with ID ${teamId} not found`);
      (err as any).code = 'TEAM_NOT_FOUND';
      throw err;
    }

    // RBAC: Admins can view everything. Members/PM can view all teams or their own teams.
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      lead_id: row.lead_id,
      lead_name: row.lead_name,
      lead_email: row.lead_email,
      member_count: row.member_count,
      created_at: row.created_at
    };
  }

  /**
   * Create a new team with optional initial members (Admin only)
   */
  public static createTeam(dto: CreateTeamDTO, actor: User): Team {
    if (!this.isAdmin(actor)) {
      const err = new Error('Only administrators can create teams');
      (err as any).code = 'FORBIDDEN';
      throw err;
    }

    const trimmedName = dto.name?.trim();
    if (!trimmedName || trimmedName.length < 2) {
      const err = new Error('Team name must be at least 2 characters long');
      (err as any).code = 'VALIDATION_ERROR';
      throw err;
    }

    // Check duplicate name
    const existing = db.prepare('SELECT id FROM teams WHERE name = ? COLLATE NOCASE').get(trimmedName);
    if (existing) {
      const err = new Error(`Team name '${trimmedName}' is already in use`);
      (err as any).code = 'CONFLICT';
      throw err;
    }

    // Validate lead if specified
    if (dto.lead_id) {
      const leadExists = db.prepare('SELECT id FROM users WHERE id = ?').get(dto.lead_id);
      if (!leadExists) {
        const err = new Error(`Lead user with ID ${dto.lead_id} does not exist`);
        (err as any).code = 'USER_NOT_FOUND';
        throw err;
      }
    }

    // ATOMIC TRANSACTION: Create team and insert members
    const createTx = db.transaction(() => {
      const insertStmt = db.prepare(`
        INSERT INTO teams (name, description, lead_id)
        VALUES (?, ?, ?)
      `);
      const res = insertStmt.run(trimmedName, dto.description?.trim() || null, dto.lead_id || null);
      const newTeamId = Number(res.lastInsertRowid);

      // Auto-add lead to team members if lead is specified
      const memberSet = new Set<number>(dto.member_ids || []);
      if (dto.lead_id) {
        memberSet.add(dto.lead_id);
      }

      const insertMemberStmt = db.prepare(`
        INSERT OR IGNORE INTO team_members (team_id, user_id)
        VALUES (?, ?)
      `);

      for (const memberId of memberSet) {
        const userExists = db.prepare('SELECT id FROM users WHERE id = ?').get(memberId);
        if (!userExists) {
          throw new Error(`Cannot add non-existent user ${memberId} to team`);
        }
        insertMemberStmt.run(newTeamId, memberId);
      }

      return newTeamId;
    });

    const createdTeamId = createTx();
    const createdTeam = this.getTeamById(createdTeamId, actor);

    // POST-COMMIT: Event Dispatcher
    eventDispatcher.dispatch(DomainEventType.TEAM_CREATED, actor.id, createdTeam);

    return createdTeam;
  }

  /**
   * Update team properties (Admin or Team Lead)
   */
  public static updateTeam(teamId: number, dto: UpdateTeamDTO, actor: User): Team {
    const team = this.getTeamById(teamId, actor);

    const isLead = team.lead_id === actor.id;
    if (!this.isAdmin(actor) && !isLead) {
      const err = new Error('You do not have permission to modify this team');
      (err as any).code = 'FORBIDDEN';
      throw err;
    }

    const trimmedName = dto.name !== undefined ? dto.name.trim() : team.name;
    if (!trimmedName || trimmedName.length < 2) {
      const err = new Error('Team name must be at least 2 characters long');
      (err as any).code = 'VALIDATION_ERROR';
      throw err;
    }

    // Name uniqueness check if renamed
    if (trimmedName.toLowerCase() !== team.name.toLowerCase()) {
      const duplicate = db.prepare('SELECT id FROM teams WHERE name = ? COLLATE NOCASE AND id != ?').get(trimmedName, teamId);
      if (duplicate) {
        const err = new Error(`Team name '${trimmedName}' is already taken`);
        (err as any).code = 'CONFLICT';
        throw err;
      }
    }

    let newLeadId = team.lead_id;
    if (dto.lead_id !== undefined) {
      // Only Admin can reassign team lead
      if (!this.isAdmin(actor)) {
        const err = new Error('Only administrators can reassign team leads');
        (err as any).code = 'FORBIDDEN';
        throw err;
      }
      if (dto.lead_id !== null) {
        const userExists = db.prepare('SELECT id FROM users WHERE id = ?').get(dto.lead_id);
        if (!userExists) {
          const err = new Error(`User ${dto.lead_id} does not exist`);
          (err as any).code = 'USER_NOT_FOUND';
          throw err;
        }
      }
      newLeadId = dto.lead_id;
    }

    const updateTx = db.transaction(() => {
      db.prepare(`
        UPDATE teams
        SET name = ?, description = ?, lead_id = ?
        WHERE id = ?
      `).run(
        trimmedName,
        dto.description !== undefined ? dto.description?.trim() || null : team.description,
        newLeadId,
        teamId
      );

      // If new lead assigned, ensure they are in team_members
      if (newLeadId) {
        db.prepare(`
          INSERT OR IGNORE INTO team_members (team_id, user_id)
          VALUES (?, ?)
        `).run(teamId, newLeadId);
      }
    });

    updateTx();
    const updated = this.getTeamById(teamId, actor);

    // POST-COMMIT: Event Dispatcher
    eventDispatcher.dispatch(DomainEventType.TEAM_UPDATED, actor.id, updated);

    return updated;
  }

  /**
   * Delete a team (Admin only)
   */
  public static deleteTeam(teamId: number, actor: User): void {
    if (!this.isAdmin(actor)) {
      const err = new Error('Only administrators can delete teams');
      (err as any).code = 'FORBIDDEN';
      throw err;
    }

    const team = this.getTeamById(teamId, actor);

    const deleteTx = db.transaction(() => {
      db.prepare('DELETE FROM teams WHERE id = ?').run(teamId);
    });

    deleteTx();

    // POST-COMMIT: Event Dispatcher
    eventDispatcher.dispatch(DomainEventType.TEAM_DELETED, actor.id, { id: teamId, name: team.name });
  }

  /**
   * Get members of a team
   */
  public static getTeamMembers(teamId: number, currentUser: User): TeamMember[] {
    this.getTeamById(teamId, currentUser); // Ensure team exists

    const rows = db.prepare(`
      SELECT 
        tm.team_id, tm.user_id,
        u.name, u.email, u.role, u.avatar_url
      FROM team_members tm
      JOIN users u ON tm.user_id = u.id
      WHERE tm.team_id = ?
      ORDER BY u.name ASC
    `).all(teamId) as any[];

    return rows;
  }

  /**
   * Add a member to a team (Admin or Team Lead)
   */
  public static addMember(teamId: number, userId: number, actor: User): TeamMember {
    const team = this.getTeamById(teamId, actor);

    const isLead = team.lead_id === actor.id;
    if (!this.isAdmin(actor) && !isLead) {
      const err = new Error('Only administrators or the team lead can add members');
      (err as any).code = 'FORBIDDEN';
      throw err;
    }

    const user = db.prepare('SELECT id, name, email, role, avatar_url FROM users WHERE id = ?').get(userId) as any;
    if (!user) {
      const err = new Error(`User with ID ${userId} not found`);
      (err as any).code = 'USER_NOT_FOUND';
      throw err;
    }

    const existing = db.prepare('SELECT 1 FROM team_members WHERE team_id = ? AND user_id = ?').get(teamId, userId);
    if (existing) {
      const err = new Error(`User is already a member of this team`);
      (err as any).code = 'CONFLICT';
      throw err;
    }

    const addTx = db.transaction(() => {
      db.prepare('INSERT INTO team_members (team_id, user_id) VALUES (?, ?)').run(teamId, userId);
    });

    addTx();

    const newMember: TeamMember = {
      team_id: teamId,
      user_id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      avatar_url: user.avatar_url
    };

    // POST-COMMIT: Event Dispatcher
    eventDispatcher.dispatch(DomainEventType.TEAM_MEMBER_ADDED, actor.id, newMember);

    return newMember;
  }

  /**
   * Remove a member from a team (Admin or Team Lead)
   */
  public static removeMember(teamId: number, userId: number, actor: User): void {
    const team = this.getTeamById(teamId, actor);

    const isLead = team.lead_id === actor.id;
    if (!this.isAdmin(actor) && !isLead) {
      const err = new Error('Only administrators or the team lead can remove members');
      (err as any).code = 'FORBIDDEN';
      throw err;
    }

    const existing = db.prepare('SELECT 1 FROM team_members WHERE team_id = ? AND user_id = ?').get(teamId, userId);
    if (!existing) {
      const err = new Error(`User is not a member of this team`);
      (err as any).code = 'NOT_FOUND';
      throw err;
    }

    const removeTx = db.transaction(() => {
      db.prepare('DELETE FROM team_members WHERE team_id = ? AND user_id = ?').run(teamId, userId);
    });

    removeTx();

    // POST-COMMIT: Event Dispatcher
    eventDispatcher.dispatch(DomainEventType.TEAM_MEMBER_REMOVED, actor.id, { teamId, userId });
  }
}
