export type NotificationType =
  | 'TASK_ASSIGNED'
  | 'TASK_STATUS_CHANGED'
  | 'TASK_COMMENT_ADDED'
  | 'DEADLINE_REMINDER'
  | 'TASK_COMPLETED';

export interface Notification {
  id: number;
  recipient_id: number;
  actor_id: number | null;
  actor_name?: string | null;
  actor_avatar?: string | null;
  type: NotificationType;
  title: string;
  message: string;
  entity_type: 'TASK' | 'PROJECT' | 'COMMENT';
  entity_id: number;
  is_read: boolean;
  created_at: string;
}
