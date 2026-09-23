import { DomainEvent, DomainEventType, EventHandler } from './types.js';

class EventDispatcher {
  private handlers: Map<DomainEventType, EventHandler[]> = new Map();

  /**
   * Register a subscriber for a specific domain event
   */
  public subscribe<T = any>(eventType: DomainEventType, handler: EventHandler<T>): void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, []);
    }
    this.handlers.get(eventType)!.push(handler);
  }

  /**
   * Dispatch a domain event to all registered handlers AFTER transaction commit
   */
  public async dispatch<T = any>(type: DomainEventType, actorId: number, payload: T): Promise<void> {
    const event: DomainEvent<T> = {
      type,
      actorId,
      payload,
      timestamp: new Date().toISOString()
    };

    const subscribers = this.handlers.get(type) || [];
    for (const handler of subscribers) {
      try {
        await handler(event);
      } catch (err) {
        console.error(`[EventDispatcher] Error in handler for event ${type}:`, err);
      }
    }
  }
}

export const eventDispatcher = new EventDispatcher();
