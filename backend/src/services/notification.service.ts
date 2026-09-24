import { db } from '../db.js';
import { broadcastToUser } from '../sockets.js';
import { Notification, CreateNotificationDTO } from '../types/notification.js';

export class NotificationService {
  /**
   * Create a new notification, persist it to PostgreSQL, and broadcast via Socket.io
   */
  public static async createNotification(dto: CreateNotificationDTO): Promise<Notification> {
    const row = await db.queryOne(`
      INSERT INTO notifications (
        recipient_id,
        actor_id,
        type,
        title,
        message,
        entity_type,
        entity_id,
        is_read
      ) VALUES (?, ?, ?, ?, ?, ?, ?, FALSE)
      RETURNING id
    `, [
      dto.recipientId,
      dto.actorId || null,
      dto.type,
      dto.title,
      dto.message,
      dto.entityType || 'TASK',
      dto.entityId
    ]);

    const notificationId = Number(row.id);
    const notification = await this.getNotificationById(notificationId);

    if (notification) {
      // Real-time Socket.io push to recipient's personal socket room
      broadcastToUser(dto.recipientId, 'notification:created', notification);
    }

    return notification!;
  }

  /**
   * Retrieve single notification by ID with actor details
   */
  public static async getNotificationById(id: number): Promise<Notification | null> {
    const row = await db.queryOne(`
      SELECT 
        n.*,
        u.name as actor_name,
        u.avatar_url as actor_avatar
      FROM notifications n
      LEFT JOIN users u ON n.actor_id = u.id
      WHERE n.id = ?
    `, [id]);

    if (!row) return null;

    return {
      ...row,
      is_read: Boolean(row.is_read)
    } as Notification;
  }

  /**
   * Retrieve list of notifications for a specific user
   */
  public static async getUserNotifications(
    userId: number,
    options: { unreadOnly?: boolean; limit?: number; offset?: number } = {}
  ): Promise<Notification[]> {
    const { unreadOnly = false, limit = 50, offset = 0 } = options;

    let sql = `
      SELECT 
        n.*,
        u.name as actor_name,
        u.avatar_url as actor_avatar
      FROM notifications n
      LEFT JOIN users u ON n.actor_id = u.id
      WHERE n.recipient_id = ?
    `;

    const params: any[] = [userId];

    if (unreadOnly) {
      sql += ` AND n.is_read = FALSE`;
    }

    sql += ` ORDER BY n.created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const rows = await db.query(sql, params);

    return rows.map((r: any) => ({
      ...r,
      is_read: Boolean(r.is_read)
    })) as Notification[];
  }

  /**
   * Count unread notifications for a user
   */
  public static async getUnreadCount(userId: number): Promise<number> {
    const result = await db.queryOne<{ count: number }>(`
      SELECT COUNT(*) as count 
      FROM notifications 
      WHERE recipient_id = ? AND is_read = FALSE
    `, [userId]);

    return result ? Number(result.count) : 0;
  }

  /**
   * Mark a specific notification as read
   */
  public static async markAsRead(notificationId: number, userId: number): Promise<Notification> {
    const existing = await this.getNotificationById(notificationId);
    if (!existing) {
      const err = new Error('Notification not found');
      (err as any).code = 'NOT_FOUND';
      throw err;
    }

    if (existing.recipient_id !== userId) {
      const err = new Error('You are not authorized to modify this notification');
      (err as any).code = 'FORBIDDEN';
      throw err;
    }

    await db.execute(`
      UPDATE notifications 
      SET is_read = TRUE 
      WHERE id = ? AND recipient_id = ?
    `, [notificationId, userId]);

    const updated = (await this.getNotificationById(notificationId))!;

    // Broadcast update to user's devices
    broadcastToUser(userId, 'notification:read', { id: notificationId });

    return updated;
  }

  /**
   * Mark all notifications for a user as read
   */
  public static async markAllAsRead(userId: number): Promise<{ updatedCount: number }> {
    const result = await db.execute(`
      UPDATE notifications 
      SET is_read = TRUE 
      WHERE recipient_id = ? AND is_read = FALSE
    `, [userId]);

    const updatedCount = result.rowCount;

    broadcastToUser(userId, 'notification:all_read', { userId, updatedCount });

    return { updatedCount };
  }

  /**
   * Delete a notification
   */
  public static async deleteNotification(notificationId: number, userId: number): Promise<boolean> {
    const existing = await this.getNotificationById(notificationId);
    if (!existing) {
      const err = new Error('Notification not found');
      (err as any).code = 'NOT_FOUND';
      throw err;
    }

    if (existing.recipient_id !== userId) {
      const err = new Error('You are not authorized to delete this notification');
      (err as any).code = 'FORBIDDEN';
      throw err;
    }

    await db.execute('DELETE FROM notifications WHERE id = ? AND recipient_id = ?', [notificationId, userId]);
    return true;
  }

  /**
   * Automated Deadline Reminder Engine
   * Checks active tasks with deadlines and generates timely alerts without duplicates
   */
  public static async checkAndCreateDeadlineReminders(): Promise<{ remindersCreated: number; details: any[] }> {
    // 1. Fetch active tasks with deadlines and assigned users
    const tasks = await db.query(`
      SELECT 
        t.id,
        t.title,
        t.due_date,
        t.status,
        t.assignee_id,
        p.name as project_name
      FROM tasks t
      LEFT JOIN projects p ON t.project_id = p.id
      WHERE t.status != 'COMPLETED' 
        AND t.due_date IS NOT NULL 
        AND t.assignee_id IS NOT NULL
    `);

    let remindersCreated = 0;
    const details: any[] = [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const task of tasks) {
      const due = new Date(task.due_date);
      due.setHours(0, 0, 0, 0);

      const diffTime = due.getTime() - today.getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

      let reminderTitle: string | null = null;
      let reminderMessage: string | null = null;

      if (diffDays === 0) {
        reminderTitle = `Due Today: "${task.title}"`;
        reminderMessage = `The deadline for task "${task.title}" in project "${task.project_name || 'Project'}" is today.`;
      } else if (diffDays === 1) {
        reminderTitle = `Due Tomorrow: "${task.title}"`;
        reminderMessage = `Task "${task.title}" in project "${task.project_name || 'Project'}" is due tomorrow.`;
      } else if (diffDays === 3) {
        reminderTitle = `Upcoming Deadline in 3 Days: "${task.title}"`;
        reminderMessage = `Task "${task.title}" is due in 3 days.`;
      } else if (diffDays < 0) {
        const overdueDays = Math.abs(diffDays);
        reminderTitle = `Overdue (${overdueDays}d): "${task.title}"`;
        reminderMessage = `Task "${task.title}" in project "${task.project_name || 'Project'}" is ${overdueDays} day(s) overdue!`;
      }

      if (reminderTitle && reminderMessage) {
        const existingReminder = await db.queryOne(`
          SELECT id FROM notifications 
          WHERE recipient_id = ? 
            AND entity_id = ? 
            AND type = 'DEADLINE_REMINDER' 
            AND title = ? 
            AND DATE(created_at) = CURRENT_DATE
        `, [task.assignee_id, task.id, reminderTitle]);

        if (!existingReminder) {
          await this.createNotification({
            recipientId: task.assignee_id,
            actorId: null,
            type: 'DEADLINE_REMINDER',
            title: reminderTitle,
            message: reminderMessage,
            entityType: 'TASK',
            entityId: task.id
          });

          remindersCreated++;
          details.push({
            taskId: task.id,
            recipientId: task.assignee_id,
            title: reminderTitle
          });
        }
      }
    }

    return { remindersCreated, details };
  }
}
