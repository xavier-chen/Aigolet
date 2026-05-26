export interface BusMessage {
  type: 'event';
  event: string;
  payload: unknown;
}

type Listener = (message: BusMessage) => void;

/** In-process pub/sub for domain events → WebSocket clients */
export class GlobalEventBus {
  private listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  publish(event: string, payload: unknown): void {
    const message: BusMessage = { type: 'event', event, payload };
    for (const listener of this.listeners) {
      try {
        listener(message);
      } catch (err) {
        console.error('[event-bus] listener error:', err);
      }
    }
  }
}

export const globalEventBus = new GlobalEventBus();

export function publishRunEvent(
  event: string,
  payload: Record<string, unknown>,
): void {
  globalEventBus.publish(event, payload);
}
