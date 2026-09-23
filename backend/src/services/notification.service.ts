import { db } from '../db.js';
import { broadcastToUser } from '../sockets.js';
import { Notification, CreateNotificationDTO, NotificationType } from '../types/notification.js';

export class NotificationService {
  /**
   * Create a new notification, persist it to SQLite, and broadcast via Socket.io
   */
  public static createNotification(dto: CreateNotificationDTO): Notification {
    const stmt = db.prepare(`
      INSERT INTO notifications (
        recipient_id,
        actor_id,
        type,
        title,
        message,
        entity_type,
        entity_id,
        is_read
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 0)
    `);

    const result = stmt.run(
      dto.recipientId,
      dto.actorId || null,
      dto.type,
      dto.title,
      dto.message,
      dto.entityType || 'TASK',
      dto.entityId
    );

    const notificationId = Number(result.lastInsertRowid);
    const notification = this.getNotificationById(notificationId);

    if (notification) {
      // Real-time Socket.io push to recipient's personal socket room
      broadcastToUser(dto.recipientId, 'notification:created', notification);
    }

    return notification!;
  }

  /**
   * Retrieve single notification by ID with actor details
   */
  public static getNotificationById(id: number): Notification | null {
    const row = db.prepare(`
      SELECT 
        n.*,
        u.name as actor_name,
        u.avatar_url as actor_avatar
      FROM notifications n
      LEFT JOIN users u ON n.actor_id = u.id
      WHERE n.id = ?
    `).get(id) as any;

    if (!row) return null;

    return {
      ...row,
      is_read: Boolean(row.is_read)
    } as Notification;
  }

  /**
   * Retrieve list of notifications for a specific user
   */
  public static getUserNotifications(
    userId: number,
    options: { unreadOnly?: boolean; limit?: number; offset?: number } = {}
  ): Notification[] {
    const { unreadOnly = false, limit = 50, offset = 0 } = options;

    let query = `
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
      query += ` AND n.is_read = 0`;
    }

    query += ` ORDER BY n.created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const rows = db.prepare(query).all(...params) as any[];

    return rows.map((r) => ({
      ...r,
      is_read: Boolean(r.is_read)
    })) as Notification[];
  }

  /**
   * Count unread notifications for a user
   */
  public static getUnreadCount(userId: number): number {
    const result = db.prepare(`
      SELECT COUNT(*) as count 
      FROM notifications 
      WHERE recipient_id = ? AND is_read = 0
    `).get(userId) as { count: number };

    return result ? result.count : 0;
  }

  /**
   * Mark a specific notification as read
   */
  public static markAsRead(notificationId: number, userId: number): Notification {
    const existing = this.getNotificationById(notificationId);
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

    db.prepare(`
      UPDATE notifications 
      SET is_read = 1 
      WHERE id = ? AND recipient_id = ?
    `).run(notificationId, userId);

    const updated = this.getNotificationById(notificationId)!;

    // Broadcast update to user's devices
    broadcastToUser(userId, 'notification:read', { id: notificationId });

    return updated;
  }

  /**
   * Mark all notifications for a user as read
   */
  public static markAllAsRead(userId: number): { updatedCount: number } {
    const result = db.prepare(`
      UPDATE notifications 
      SET is_read = 1 
      WHERE recipient_id = ? AND is_read = 0
    `).run(userId);

    const updatedCount = result.changes;

    broadcastToUser(userId, 'notification:all_read', { userId, updatedCount });

    return { updatedCount };
  }

  /**
   * Delete a notification
   */
  public static deleteNotification(notificationId: number, userId: number): boolean {
    const existing = this.getNotificationById(notificationId);
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

    db.prepare('DELETE FROM notifications WHERE id = ? AND recipient_id = ?').run(notificationId, userId);
    return true;
  }

  /**
   * Automated Deadline Reminder Engine
   * Checks active tasks with deadlines and generates timely alerts without duplicates:
   * - 3 days before
   * - 1 day before (tomorrow)
   * - Due today
   * - Overdue
   */
  public static checkAndCreateDeadlineReminders(): { remindersCreated: number; details: any[] } {
    // 1. Fetch active tasks with deadlines and assigned users
    const tasks = db.prepare(`
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
    `).all() as any[];

    let remindersCreated = 0;
    const details: any[] = [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const checkDuplicateStmt = db.prepare(`
      SELECT id FROM notifications 
      WHERE recipient_id = ? 
        AND entity_id = ? 
        AND type = 'DEADLINE_REMINDER' 
        AND title = ? 
        AND date(created_at) = date('now')
    `);

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
        // Idempotency check: Don't spam the user with the same reminder multiple times today
        const existingReminder = checkDuplicateStmt.get(task.assignee_id, task.id, reminderTitle);
        if (!existingReminder) {
          this.createNotification({
            recipientId: task.assignee_id,
            actorId: null, // System-generated alert
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
