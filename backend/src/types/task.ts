import { UserRole } from './auth.js';

export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'BLOCKED' | 'COMPLETED';
export type ItemType = 'TASK' | 'EVENT';

export interface Task {
  id: number;
  title: string;
  description: string | null;
  project_id: number;
  project_name?: string;
  team_id: number | null;
  team_name?: string | null;
  assignee_id: number | null;
  assignee_name?: string | null;
  assignee_email?: string | null;
  assignee_avatar?: string | null;
  creator_id: number;
  creator_name?: string;
  priority: TaskPriority;
  status: TaskStatus;
  start_date: string | null;
  due_date: string | null;
  position_order: number;
  item_type: ItemType;
  subtask_count?: number;
  subtasks_completed?: number;
  comment_count?: number;
  attachment_count?: number;
  created_at: string;
  updated_at: string;
}

export interface Subtask {
  id: number;
  task_id: number;
  title: string;
  is_completed: boolean;
  position: number;
  created_at: string;
}

export interface TaskComment {
  id: number;
  task_id: number;
  user_id: number;
  user_name: string;
  user_role: UserRole;
  user_avatar: string | null;
  content: string;
  created_at: string;
}

export interface TaskWatcher {
  task_id: number;
  user_id: number;
  user_name: string;
  user_email: string;
  created_at: string;
}

export interface ActivityLog {
  id: number;
  task_id: number;
  project_id: number;
  actor_id: number;
  actor_name: string;
  actor_role: UserRole;
  action_type: string;
  old_value: string | null;
  new_value: string | null;
  description: string;
  created_at: string;
}

import { AttachmentDTO } from './attachment.js';

export interface TaskDetail extends Task {
  subtasks: Subtask[];
  comments: TaskComment[];
  watchers: TaskWatcher[];
  activity_logs: ActivityLog[];
  attachments?: AttachmentDTO[];
}

export interface CreateTaskDTO {
  title: string;
  description?: string;
  project_id: number;
  team_id?: number | null;
  assignee_id?: number | null;
  priority?: TaskPriority;
  status?: TaskStatus;
  start_date?: string | null;
  due_date?: string | null;
  position_order?: number;
  item_type?: ItemType;
  subtasks?: string[];
}

export interface UpdateTaskDTO {
  title?: string;
  description?: string;
  team_id?: number | null;
  assignee_id?: number | null;
  priority?: TaskPriority;
  status?: TaskStatus;
  start_date?: string | null;
  due_date?: string | null;
  position_order?: number;
  item_type?: ItemType;
}

export interface TaskFilterDTO {
  project_id?: number;
  team_id?: number;
  assignee_id?: number;
  status?: TaskStatus;
  priority?: TaskPriority;
  due_date?: string;
  from_date?: string;
  to_date?: string;
  search?: string;
  item_type?: ItemType;
}
