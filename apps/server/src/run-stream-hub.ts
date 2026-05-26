import type { StreamEvent } from '@aigolet-next/agent-runtime';

interface RunChannel {
  listeners: Set<(event: StreamEvent) => void>;
  buffer: StreamEvent[];
  done: boolean;
}

const TERMINAL_EVENTS = new Set<StreamEvent['type']>(['run.completed', 'run.failed']);

export class RunStreamHub {
  private channels = new Map<string, RunChannel>();

  private getOrCreate(runId: string): RunChannel {
    let channel = this.channels.get(runId);
    if (!channel) {
      channel = { listeners: new Set(), buffer: [], done: false };
      this.channels.set(runId, channel);
    }
    return channel;
  }

  emit(runId: string, event: StreamEvent): void {
    const channel = this.getOrCreate(runId);
    channel.buffer.push(event);

    if (TERMINAL_EVENTS.has(event.type)) {
      channel.done = true;
      setTimeout(() => this.channels.delete(runId), 60_000);
    }

    for (const listener of channel.listeners) {
      listener(event);
    }
  }

  subscribe(runId: string, listener: (event: StreamEvent) => void): () => void {
    const channel = this.getOrCreate(runId);
    channel.listeners.add(listener);

    void (async () => {
      for (const event of channel.buffer) {
        listener(event);
        if (event.type === 'assistant.delta' || event.type === 'reasoning.delta') {
          await new Promise((resolve) => setTimeout(resolve, 16));
        }
      }
    })();

    return () => {
      channel.listeners.delete(listener);
    };
  }

  isDone(runId: string): boolean {
    return this.channels.get(runId)?.done ?? false;
  }
}

export const runStreamHub = new RunStreamHub();
