import { eventDispatcher } from '../dispatcher.js';
import { DomainEventType, DomainEvent } from '../types.js';
import { NotificationService } from '../../services/notification.service.js';
import { db } from '../../db.js';

/**
 * Register Automated Notification Listeners on the Central Event Dispatcher
 * Dispatched strictly AFTER SQLite transaction commits
 */
export function registerNotificationEventHandlers(): void {
  // 1. Task Created with an initial Assignee
  eventDispatcher.subscribe(DomainEventType.TASK_CREATED, (event: DomainEvent) => {
    const task = event.payload;
    if (task.assignee_id && task.assignee_id !== event.actorId) {
      NotificationService.createNotification({
        recipientId: task.assignee_id,
        actorId: event.actorId,
        type: 'TASK_ASSIGNED',
        title: 'New Task Assigned',
        message: `You were assigned to task "${task.title}".`,
        entityType: 'TASK',
        entityId: task.id
      });
    }
  });

  // 2. Task Assigned / Reassigned
  eventDispatcher.subscribe(DomainEventType.TASK_ASSIGNED, (event: DomainEvent) => {
    const { task, newAssigneeId } = event.payload;
    if (newAssigneeId && newAssigneeId !== event.actorId) {
      NotificationService.createNotification({
        recipientId: newAssigneeId,
        actorId: event.actorId,
        type: 'TASK_ASSIGNED',
        title: 'Task Assigned to You',
        message: `You have been assigned to "${task.title}".`,
        entityType: 'TASK',
        entityId: task.id
      });
    }
  });

  // 3. Task Status Changed
  eventDispatcher.subscribe(DomainEventType.TASK_STATUS_CHANGED, (event: DomainEvent) => {
    const { task, newStatus } = event.payload;

    const recipients = new Set<number>();
    if (task.assignee_id && task.assignee_id !== event.actorId) {
      recipients.add(task.assignee_id);
    }
    if (task.creator_id && task.creator_id !== event.actorId) {
      recipients.add(task.creator_id);
    }

    const readableStatus = newStatus.replace('_', ' ');
    const notifType = newStatus === 'COMPLETED' ? 'TASK_COMPLETED' : 'TASK_STATUS_CHANGED';
    const notifTitle = newStatus === 'COMPLETED' ? 'Task Completed' : 'Task Status Updated';

    for (const recipientId of recipients) {
      NotificationService.createNotification({
        recipientId,
        actorId: event.actorId,
        type: notifType,
        title: notifTitle,
        message: `Task "${task.title}" status changed to ${readableStatus}.`,
        entityType: 'TASK',
        entityId: task.id
      });
    }
  });

  // 4. Task Comment Added
  eventDispatcher.subscribe(DomainEventType.TASK_COMMENT_ADDED, (event: DomainEvent) => {
    const { comment, task } = event.payload;
    if (!task) return;

    const recipients = new Set<number>();

    // Assignee and Creator
    if (task.assignee_id && task.assignee_id !== event.actorId) {
      recipients.add(task.assignee_id);
    }
    if (task.creator_id && task.creator_id !== event.actorId) {
      recipients.add(task.creator_id);
    }

    // Task Watchers
    const watchers = db.prepare(`
      SELECT user_id FROM task_watchers 
      WHERE task_id = ? AND user_id != ?
    `).all(task.id, event.actorId) as { user_id: number }[];

    for (const w of watchers) {
      recipients.add(w.user_id);
    }

    const snippet = comment.content.length > 60
      ? `${comment.content.slice(0, 57)}...`
      : comment.content;

    for (const recipientId of recipients) {
      NotificationService.createNotification({
        recipientId,
        actorId: event.actorId,
        type: 'TASK_COMMENT_ADDED',
        title: 'New Comment on Task',
        message: `${comment.user_name || 'A teammate'} commented on "${task.title}": "${snippet}"`,
        entityType: 'TASK',
        entityId: task.id
      });
    }
  });
}
