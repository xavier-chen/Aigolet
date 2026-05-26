import type {
  DomainEvent,
  MemoryKind,
  MemoryNamespace,
  MemoryRecord,
} from '@aigolet-next/protocol';
import type { EventStore, EventSubscriber } from '@aigolet-next/orchestrator';

export interface MemoryQuery {
  namespace: MemoryNamespace;
  kind?: MemoryKind;
  query?: string;
  queryEmbedding?: number[];
  limit?: number;
}

export interface MemoryStore {
  stage(record: Omit<MemoryRecord, 'id' | 'createdAt'>): Promise<MemoryRecord>;
  commit(id: string): Promise<MemoryRecord>;
  discard(id: string): Promise<void>;
  retrieve(query: MemoryQuery): Promise<MemoryRecord[]>;
  get(id: string): Promise<MemoryRecord | null>;
}

function namespaceKey(ns: MemoryNamespace): string {
  return [ns.tenantId, ns.userId, ns.taskId ?? '', ns.agentId ?? ''].join(':');
}

export class InMemoryMemoryStore implements MemoryStore {
  private committed = new Map<string, MemoryRecord>();
  private staged = new Map<string, MemoryRecord>();

  async stage(record: Omit<MemoryRecord, 'id' | 'createdAt'>): Promise<MemoryRecord> {
    const staged: MemoryRecord = {
      ...record,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    this.staged.set(staged.id, staged);
    return staged;
  }

  async commit(id: string): Promise<MemoryRecord> {
    const record = this.staged.get(id);
    if (!record) throw new Error(`Staged memory not found: ${id}`);
    this.staged.delete(id);
    this.committed.set(id, record);
    return record;
  }

  async discard(id: string): Promise<void> {
    this.staged.delete(id);
  }

  async retrieve(query: MemoryQuery): Promise<MemoryRecord[]> {
    const key = namespaceKey(query.namespace);
    const limit = query.limit ?? 50;
    const all = [...this.committed.values()].filter((r) => {
      if (namespaceKey(r.namespace) !== key) return false;
      if (query.kind && r.kind !== query.kind) return false;
      if (query.query && !r.content.toLowerCase().includes(query.query.toLowerCase())) {
        return false;
      }
      return true;
    });
    return all.slice(-limit);
  }

  async get(id: string): Promise<MemoryRecord | null> {
    return this.committed.get(id) ?? this.staged.get(id) ?? null;
  }
}

/** Projector: listens to domain events and updates memory */
export class MemoryProjector implements EventSubscriber {
  constructor(private readonly store: MemoryStore) {}

  async onEvent(event: DomainEvent): Promise<void> {
    if (event.type === 'agent.message' && typeof event.payload === 'object' && event.payload) {
      const payload = event.payload as { content?: string; namespace?: MemoryNamespace };
      if (payload.content && payload.namespace) {
        const staged = await this.store.stage({
          kind: 'episodic',
          namespace: payload.namespace,
          content: payload.content,
          metadata: { eventId: event.id, eventType: event.type },
        });
        await this.store.commit(staged.id);
      }
    }
  }
}

export class MemoryService {
  constructor(
    private readonly store: MemoryStore,
    private readonly embedText?: (text: string) => Promise<number[]>,
  ) {}

  async remember(
    namespace: MemoryNamespace,
    content: string,
    kind: MemoryKind = 'semantic',
    metadata?: Record<string, unknown>,
  ): Promise<MemoryRecord> {
    let embedding: number[] | undefined;
    if (this.embedText) {
      try {
        embedding = await this.embedText(content);
      } catch {
        // fallback: store without embedding
      }
    }
    const staged = await this.store.stage({ kind, namespace, content, embedding, metadata });
    const committed = await this.store.commit(staged.id);
    return committed;
  }

  async recall(query: MemoryQuery): Promise<MemoryRecord[]> {
    return this.store.retrieve(query);
  }

  createProjector(eventStore: EventStore): MemoryProjector {
    void eventStore;
    return new MemoryProjector(this.store);
  }
}

export function createMemoryService(): MemoryService {
  return new MemoryService(new InMemoryMemoryStore());
}

export { createEmbeddingProvider, StubEmbeddingProvider, OpenAiEmbeddingProvider, type EmbeddingProvider } from './embedding.js';
export { cosineSimilarity, rankBySimilarity, stubEmbed, type SemanticSearchResult } from './vector.js';
