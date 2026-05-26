import type { DomainEvent } from '@aigolet-next/protocol';
import type { EventSubscriber } from '@aigolet-next/orchestrator';
import { globalEventBus } from './event-bus.js';

/** Forwards domain events to the global WebSocket event bus */
export class EventBusSubscriber implements EventSubscriber {
  async onEvent(event: DomainEvent): Promise<void> {
    const [category] = event.type.split('.');
    globalEventBus.publish(`${category}.*`, {
      id: event.id,
      type: event.type,
      aggregateId: event.aggregateId,
      payload: event.payload,
      occurredAt: event.occurredAt,
    });
    globalEventBus.publish(event.type, {
      id: event.id,
      type: event.type,
      aggregateId: event.aggregateId,
      payload: event.payload,
      occurredAt: event.occurredAt,
    });
  }
}
