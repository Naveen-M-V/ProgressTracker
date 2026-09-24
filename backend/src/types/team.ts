import { UserRole } from './auth.js';

export interface Team {
  id: number;
  name: string;
  description: string | null;
  lead_id: number | null;
  lead_name?: string | null;
  lead_email?: string | null;
  member_count?: number;
  is_member?: boolean;
  created_at: string;
}

export interface TeamMember {
  team_id: number;
  user_id: number;
  name: string;
  email: string;
  role: UserRole;
  avatar_url: string | null;
}

export interface CreateTeamDTO {
  name: string;
  description?: string;
  lead_id?: number | null;
  member_ids?: number[];
}

export interface UpdateTeamDTO {
  name?: string;
  description?: string;
  lead_id?: number | null;
}
