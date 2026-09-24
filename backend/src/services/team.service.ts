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
  public static async isUserInTeam(teamId: number, userId: number): Promise<boolean> {
    const row = await db.queryOne(`
      SELECT 1 FROM team_members WHERE team_id = ? AND user_id = ?
      UNION
      SELECT 1 FROM teams WHERE id = ? AND lead_id = ?
    `, [teamId, userId, teamId, userId]);
    return !!row;
  }

  /**
   * Helper: Get all team IDs a user belongs to (as member or lead)
   */
  public static async getUserTeamIds(userId: number): Promise<number[]> {
    const rows = await db.query<{ team_id: number }>(`
      SELECT team_id FROM team_members WHERE user_id = ?
      UNION
      SELECT id as team_id FROM teams WHERE lead_id = ?
    `, [userId, userId]);
    return rows.map((r) => Number(r.team_id));
  }

  /**
   * List all teams (enriched with lead name, member count, and user membership status)
   */
  public static async getAllTeams(currentUser: User): Promise<Team[]> {
    const rows = await db.query(`
      SELECT 
        t.id, t.name, t.description, t.lead_id, t.created_at,
        u.name as lead_name, u.email as lead_email,
        (SELECT COUNT(*) FROM team_members tm WHERE tm.team_id = t.id) as member_count,
        EXISTS(
          SELECT 1 FROM team_members tm2 WHERE tm2.team_id = t.id AND tm2.user_id = ?
          UNION
          SELECT 1 FROM teams t2 WHERE t2.id = t.id AND t2.lead_id = ?
        ) as is_member
      FROM teams t
      LEFT JOIN users u ON t.lead_id = u.id
      ORDER BY t.name ASC
    `, [currentUser.id, currentUser.id]);

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      lead_id: r.lead_id,
      lead_name: r.lead_name,
      lead_email: r.lead_email,
      member_count: Number(r.member_count),
      is_member: Boolean(r.is_member),
      created_at: r.created_at
    }));
  }

  /**
   * Get team details by ID
   */
  public static async getTeamById(teamId: number, currentUser: User): Promise<Team> {
    const row = await db.queryOne(`
      SELECT 
        t.id, t.name, t.description, t.lead_id, t.created_at,
        u.name as lead_name, u.email as lead_email,
        (SELECT COUNT(*) FROM team_members tm WHERE tm.team_id = t.id) as member_count,
        EXISTS(
          SELECT 1 FROM team_members tm2 WHERE tm2.team_id = t.id AND tm2.user_id = ?
          UNION
          SELECT 1 FROM teams t2 WHERE t2.id = t.id AND t2.lead_id = ?
        ) as is_member
      FROM teams t
      LEFT JOIN users u ON t.lead_id = u.id
      WHERE t.id = ?
    `, [currentUser.id, currentUser.id, teamId]);

    if (!row) {
      const err = new Error(`Team with ID ${teamId} not found`);
      (err as any).code = 'TEAM_NOT_FOUND';
      throw err;
    }

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      lead_id: row.lead_id,
      lead_name: row.lead_name,
      lead_email: row.lead_email,
      member_count: Number(row.member_count),
      is_member: Boolean(row.is_member),
      created_at: row.created_at
    };
  }

  /**
   * Create a new team with optional initial members (Admin only)
   */
  public static async createTeam(dto: CreateTeamDTO, actor: User): Promise<Team> {
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
    const existing = await db.queryOne('SELECT id FROM teams WHERE LOWER(name) = LOWER(?)', [trimmedName]);
    if (existing) {
      const err = new Error(`Team name '${trimmedName}' is already in use`);
      (err as any).code = 'CONFLICT';
      throw err;
    }

    // Validate lead if specified
    if (dto.lead_id) {
      const leadExists = await db.queryOne('SELECT id FROM users WHERE id = ?', [dto.lead_id]);
      if (!leadExists) {
        const err = new Error(`Lead user with ID ${dto.lead_id} does not exist`);
        (err as any).code = 'USER_NOT_FOUND';
        throw err;
      }
    }

    // ATOMIC TRANSACTION: Create team and insert members
    const createdTeamId = await db.withTransaction(async (tx) => {
      const res = await tx.queryOne(`
        INSERT INTO teams (name, description, lead_id)
        VALUES (?, ?, ?)
        RETURNING id
      `, [trimmedName, dto.description?.trim() || null, dto.lead_id || null]);
      const newTeamId = Number(res.id);

      // Auto-add lead to team members if lead is specified
      const memberSet = new Set<number>(dto.member_ids || []);
      if (dto.lead_id) {
        memberSet.add(dto.lead_id);
      }

      for (const memberId of memberSet) {
        const userExists = await tx.queryOne('SELECT id FROM users WHERE id = ?', [memberId]);
        if (!userExists) {
          throw new Error(`Cannot add non-existent user ${memberId} to team`);
        }
        await tx.execute(`
          INSERT INTO team_members (team_id, user_id)
          VALUES (?, ?)
          ON CONFLICT DO NOTHING
        `, [newTeamId, memberId]);
      }

      return newTeamId;
    });

    const createdTeam = await this.getTeamById(createdTeamId, actor);

    // POST-COMMIT: Event Dispatcher
    await eventDispatcher.dispatch(DomainEventType.TEAM_CREATED, actor.id, createdTeam);

    return createdTeam;
  }

  /**
   * Update team properties (Admin or Team Lead)
   */
  public static async updateTeam(teamId: number, dto: UpdateTeamDTO, actor: User): Promise<Team> {
    const team = await this.getTeamById(teamId, actor);

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
      const duplicate = await db.queryOne('SELECT id FROM teams WHERE LOWER(name) = LOWER(?) AND id != ?', [trimmedName, teamId]);
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
        const userExists = await db.queryOne('SELECT id FROM users WHERE id = ?', [dto.lead_id]);
        if (!userExists) {
          const err = new Error(`User ${dto.lead_id} does not exist`);
          (err as any).code = 'USER_NOT_FOUND';
          throw err;
        }
      }
      newLeadId = dto.lead_id;
    }

    await db.withTransaction(async (tx) => {
      await tx.execute(`
        UPDATE teams
        SET name = ?, description = ?, lead_id = ?
        WHERE id = ?
      `, [
        trimmedName,
        dto.description !== undefined ? dto.description?.trim() || null : team.description,
        newLeadId,
        teamId
      ]);

      // If new lead assigned, ensure they are in team_members
      if (newLeadId) {
        await tx.execute(`
          INSERT INTO team_members (team_id, user_id)
          VALUES (?, ?)
          ON CONFLICT DO NOTHING
        `, [teamId, newLeadId]);
      }
    });

    const updated = await this.getTeamById(teamId, actor);

    // POST-COMMIT: Event Dispatcher
    await eventDispatcher.dispatch(DomainEventType.TEAM_UPDATED, actor.id, updated);

    return updated;
  }

  /**
   * Delete a team (Admin only)
   */
  public static async deleteTeam(teamId: number, actor: User): Promise<void> {
    if (!this.isAdmin(actor)) {
      const err = new Error('Only administrators can delete teams');
      (err as any).code = 'FORBIDDEN';
      throw err;
    }

    const team = await this.getTeamById(teamId, actor);

    await db.withTransaction(async (tx) => {
      await tx.execute('DELETE FROM teams WHERE id = ?', [teamId]);
    });

    // POST-COMMIT: Event Dispatcher
    await eventDispatcher.dispatch(DomainEventType.TEAM_DELETED, actor.id, { id: teamId, name: team.name });
  }

  /**
   * Get members of a team
   */
  public static async getTeamMembers(teamId: number, currentUser: User): Promise<TeamMember[]> {
    await this.getTeamById(teamId, currentUser); // Ensure team exists

    const rows = await db.query(`
      SELECT 
        tm.team_id, tm.user_id,
        u.name, u.email, u.role, u.avatar_url
      FROM team_members tm
      JOIN users u ON tm.user_id = u.id
      WHERE tm.team_id = ?
      ORDER BY u.name ASC
    `, [teamId]);

    return rows;
  }

  /**
   * Add a member to a team (Admin or Team Lead)
   */
  public static async addMember(teamId: number, userId: number, actor: User): Promise<TeamMember> {
    const team = await this.getTeamById(teamId, actor);

    const isLead = team.lead_id === actor.id;
    if (!this.isAdmin(actor) && !isLead) {
      const err = new Error('Only administrators or the team lead can add members');
      (err as any).code = 'FORBIDDEN';
      throw err;
    }

    const user = await db.queryOne('SELECT id, name, email, role, avatar_url FROM users WHERE id = ?', [userId]);
    if (!user) {
      const err = new Error(`User with ID ${userId} not found`);
      (err as any).code = 'USER_NOT_FOUND';
      throw err;
    }

    const existing = await db.queryOne('SELECT 1 FROM team_members WHERE team_id = ? AND user_id = ?', [teamId, userId]);
    if (existing) {
      const err = new Error(`User is already a member of this team`);
      (err as any).code = 'CONFLICT';
      throw err;
    }

    await db.withTransaction(async (tx) => {
      await tx.execute('INSERT INTO team_members (team_id, user_id) VALUES (?, ?)', [teamId, userId]);
    });

    const newMember: TeamMember = {
      team_id: teamId,
      user_id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      avatar_url: user.avatar_url
    };

    // POST-COMMIT: Event Dispatcher
    await eventDispatcher.dispatch(DomainEventType.TEAM_MEMBER_ADDED, actor.id, newMember);

    return newMember;
  }

  /**
   * Remove a member from a team (Admin or Team Lead)
   */
  public static async removeMember(teamId: number, userId: number, actor: User): Promise<void> {
    const team = await this.getTeamById(teamId, actor);

    const isLead = team.lead_id === actor.id;
    if (!this.isAdmin(actor) && !isLead) {
      const err = new Error('Only administrators or the team lead can remove members');
      (err as any).code = 'FORBIDDEN';
      throw err;
    }

    const existing = await db.queryOne('SELECT 1 FROM team_members WHERE team_id = ? AND user_id = ?', [teamId, userId]);
    if (!existing) {
      const err = new Error(`User is not a member of this team`);
      (err as any).code = 'NOT_FOUND';
      throw err;
    }

    await db.withTransaction(async (tx) => {
      await tx.execute('DELETE FROM team_members WHERE team_id = ? AND user_id = ?', [teamId, userId]);
    });

    // POST-COMMIT: Event Dispatcher
    await eventDispatcher.dispatch(DomainEventType.TEAM_MEMBER_REMOVED, actor.id, { teamId, userId });
  }
}
