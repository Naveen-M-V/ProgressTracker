import { eventDispatcher } from '../dispatcher.js';
import { DomainEventType, DomainEvent } from '../types.js';
import { broadcastToProject, broadcastToUser } from '../../sockets.js';

/**
 * Register Socket.io listeners on the Central Event Dispatcher
 * Dispatched ONLY AFTER SQLite transaction commits
 */
export function registerSocketEventHandlers(): void {
  // Task Created
  eventDispatcher.subscribe(DomainEventType.TASK_CREATED, (event: DomainEvent) => {
    const task = event.payload;
    broadcastToProject(task.project_id, 'task:created', {
      task,
      actorId: event.actorId,
      timestamp: event.timestamp
    });
  });

  // Task Updated
  eventDispatcher.subscribe(DomainEventType.TASK_UPDATED, (event: DomainEvent) => {
    const task = event.payload;
    broadcastToProject(task.project_id, 'task:updated', {
      task,
      actorId: event.actorId,
      timestamp: event.timestamp
    });
  });

  // Task Status Changed
  eventDispatcher.subscribe(DomainEventType.TASK_STATUS_CHANGED, (event: DomainEvent) => {
    const { task, oldStatus, newStatus } = event.payload;
    broadcastToProject(task.project_id, 'task:status_changed', {
      task,
      oldStatus,
      newStatus,
      actorId: event.actorId,
      timestamp: event.timestamp
    });
    // Also emit general task:updated for views listening to task state updates
    broadcastToProject(task.project_id, 'task:updated', {
      task,
      actorId: event.actorId,
      timestamp: event.timestamp
    });
  });

  // Task Assigned
  eventDispatcher.subscribe(DomainEventType.TASK_ASSIGNED, (event: DomainEvent) => {
    const { task, oldAssigneeId, newAssigneeId } = event.payload;
    broadcastToProject(task.project_id, 'task:assigned', {
      task,
      oldAssigneeId,
      newAssigneeId,
      actorId: event.actorId,
      timestamp: event.timestamp
    });
    broadcastToProject(task.project_id, 'task:updated', {
      task,
      actorId: event.actorId,
      timestamp: event.timestamp
    });

    if (newAssigneeId) {
      broadcastToUser(newAssigneeId, 'task:assigned_to_you', {
        task,
        actorId: event.actorId,
        timestamp: event.timestamp
      });
    }
  });

  // Task Deleted
  eventDispatcher.subscribe(DomainEventType.TASK_DELETED, (event: DomainEvent) => {
    const { taskId, projectId } = event.payload;
    broadcastToProject(projectId, 'task:deleted', {
      taskId,
      projectId,
      actorId: event.actorId,
      timestamp: event.timestamp
    });
  });

  // Task Comment Added
  eventDispatcher.subscribe(DomainEventType.TASK_COMMENT_ADDED, (event: DomainEvent) => {
    const { comment, projectId } = event.payload;
    broadcastToProject(projectId, 'task:comment_added', {
      comment,
      projectId,
      actorId: event.actorId,
      timestamp: event.timestamp
    });
  });

  // Subtask Lifecycle
  const subtaskEvents = [
    DomainEventType.SUBTASK_CREATED,
    DomainEventType.SUBTASK_UPDATED,
    DomainEventType.SUBTASK_DELETED
  ];
  for (const ev of subtaskEvents) {
    eventDispatcher.subscribe(ev, (event: DomainEvent) => {
      const { taskId, projectId } = event.payload;
      broadcastToProject(projectId, 'task:subtask_updated', {
        taskId,
        projectId,
        actorId: event.actorId,
        timestamp: event.timestamp
      });
    });
  }
}
