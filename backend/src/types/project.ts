import { UserRole } from './auth.js';

export type ProjectStatus = 'ACTIVE' | 'ARCHIVED' | 'COMPLETED';

export interface ProjectProgress {
  total_tasks: number;
  completed_tasks: number;
  in_progress_tasks: number;
  todo_tasks: number;
  review_tasks: number;
  blocked_tasks: number;
  progress_percentage: number;
}

export interface Project {
  id: number;
  name: string;
  description: string | null;
  team_id: number | null;
  team_name?: string | null;
  manager_id: number | null;
  manager_name?: string | null;
  manager_email?: string | null;
  status: ProjectStatus;
  progress?: ProjectProgress;
  member_count?: number;
  created_at: string;
}

export interface ProjectMember {
  project_id: number;
  user_id: number;
  role_in_project: string;
  name: string;
  email: string;
  role: UserRole;
  avatar_url: string | null;
}

export interface CreateProjectDTO {
  name: string;
  description?: string;
  team_id?: number | null;
  manager_id?: number | null;
  status?: ProjectStatus;
  member_ids?: number[];
}

export interface UpdateProjectDTO {
  name?: string;
  description?: string;
  team_id?: number | null;
  manager_id?: number | null;
  status?: ProjectStatus;
}
