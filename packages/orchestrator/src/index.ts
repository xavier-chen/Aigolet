import type {
  Actor,
  Correlation,
  DomainEvent,
  DomainEventType,
  Run,
  RunStatus,
  Session,
  SessionMessage,
} from '@aigolet-next/protocol';
import { createActor, createCorrelation } from '@aigolet-next/protocol';

/** Event store — single source of truth */
export interface EventStore {
  append(event: Omit<DomainEvent, 'id' | 'version'>): Promise<DomainEvent>;
  getById(id: string): Promise<DomainEvent | null>;
  getByAggregate(aggregateId: string, fromVersion?: number): Promise<DomainEvent[]>;
  getByType(type: DomainEventType, limit?: number): Promise<DomainEvent[]>;
  getAll(limit?: number): Promise<DomainEvent[]>;
}

export interface EventSubscriber {
  onEvent(event: DomainEvent): void | Promise<void>;
}

export interface RunRepository {
  get(id: string): Promise<Run | null>;
  save(run: Run): Promise<void>;
  listBySession(sessionId: string): Promise<Run[]>;
  list(options?: { status?: RunStatus; limit?: number }): Promise<Run[]>;
}

export interface SessionRepository {
  get(id: string): Promise<Session | null>;
  save(session: Session): Promise<void>;
  list(): Promise<Session[]>;
}

export interface SessionMessageRepository {
  append(message: Omit<SessionMessage, 'id' | 'createdAt'>): Promise<SessionMessage>;
  list(sessionId: string, limit?: number): Promise<SessionMessage[]>;
}

export interface OrchestratorConfig {
  eventStore: EventStore;
  runRepo: RunRepository;
  sessionRepo: SessionRepository;
  sessionMessageRepo?: SessionMessageRepository;
  subscribers?: EventSubscriber[];
}

export class InMemoryEventStore implements EventStore {
  private events: DomainEvent[] = [];
  private aggregateVersions = new Map<string, number>();

  async append(event: Omit<DomainEvent, 'id' | 'version'>): Promise<DomainEvent> {
    const version = (this.aggregateVersions.get(event.aggregateId) ?? 0) + 1;
    this.aggregateVersions.set(event.aggregateId, version);
    const stored: DomainEvent = {
      ...event,
      id: crypto.randomUUID(),
      version,
    };
    this.events.push(stored);
    return stored;
  }

  async getById(id: string): Promise<DomainEvent | null> {
    return this.events.find((e) => e.id === id) ?? null;
  }

  async getByAggregate(aggregateId: string, fromVersion = 0): Promise<DomainEvent[]> {
    return this.events.filter(
      (e) => e.aggregateId === aggregateId && e.version >= fromVersion,
    );
  }

  async getByType(type: DomainEventType, limit = 100): Promise<DomainEvent[]> {
    return this.events.filter((e) => e.type === type).slice(-limit);
  }

  async getAll(limit = 500): Promise<DomainEvent[]> {
    return this.events.slice(-limit);
  }
}

export class InMemoryRunRepository implements RunRepository {
  private runs = new Map<string, Run>();

  async get(id: string): Promise<Run | null> {
    return this.runs.get(id) ?? null;
  }

  async save(run: Run): Promise<void> {
    this.runs.set(run.id, run);
  }

  async listBySession(sessionId: string): Promise<Run[]> {
    return [...this.runs.values()].filter((r) => r.sessionId === sessionId);
  }

  async list(options?: { status?: RunStatus; limit?: number }): Promise<Run[]> {
    let items = [...this.runs.values()];
    if (options?.status) {
      items = items.filter((r) => r.status === options.status);
    }
    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const limit = options?.limit ?? 100;
    return items.slice(0, limit);
  }
}

export class InMemorySessionRepository implements SessionRepository {
  private sessions = new Map<string, Session>();

  async get(id: string): Promise<Session | null> {
    return this.sessions.get(id) ?? null;
  }

  async save(session: Session): Promise<void> {
    this.sessions.set(session.id, session);
  }

  async list(): Promise<Session[]> {
    return [...this.sessions.values()];
  }
}

export class InMemorySessionMessageRepository implements SessionMessageRepository {
  private messages = new Map<string, SessionMessage[]>();

  async append(message: Omit<SessionMessage, 'id' | 'createdAt'>): Promise<SessionMessage> {
    const stored: SessionMessage = {
      ...message,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    const list = this.messages.get(message.sessionId) ?? [];
    list.push(stored);
    this.messages.set(message.sessionId, list);
    return stored;
  }

  async list(sessionId: string, limit = 50): Promise<SessionMessage[]> {
    const list = this.messages.get(sessionId) ?? [];
    return list.slice(-limit);
  }
}

export class Orchestrator {
  private readonly config: OrchestratorConfig;

  constructor(config: OrchestratorConfig) {
    this.config = config;
  }

  get eventStore(): EventStore {
    return this.config.eventStore;
  }

  async createSession(
    input: Omit<Session, 'id' | 'createdAt' | 'updatedAt' | 'status'>,
    actor?: Actor,
  ): Promise<Session> {
    const now = new Date().toISOString();
    const session: Session = {
      ...input,
      id: crypto.randomUUID(),
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
    await this.config.sessionRepo.save(session);
    await this.emit('session.created', session.id, 'session', session, actor);
    return session;
  }

  async createRun(
    input: {
      sessionId: string;
      agentId: string;
      payload: unknown;
      correlation?: Correlation;
    },
    actor?: Actor,
  ): Promise<Run> {
    const now = new Date().toISOString();
    const run: Run = {
      id: crypto.randomUUID(),
      sessionId: input.sessionId,
      agentId: input.agentId,
      status: 'pending',
      input: input.payload,
      correlation: input.correlation ?? createCorrelation(),
      createdAt: now,
    };
    await this.config.runRepo.save(run);
    await this.emit('run.created', run.id, 'run', run, actor);
    return run;
  }

  async transitionRun(
    runId: string,
    status: RunStatus,
    extras?: { output?: unknown; error?: string },
    actor?: Actor,
  ): Promise<Run> {
    const run = await this.config.runRepo.get(runId);
    if (!run) throw new Error(`Run not found: ${runId}`);

    const now = new Date().toISOString();
    const updated: Run = {
      ...run,
      status,
      output: extras?.output ?? run.output,
      error: extras?.error ?? run.error,
      startedAt: status === 'running' ? now : run.startedAt,
      completedAt: ['completed', 'failed', 'cancelled'].includes(status)
        ? now
        : run.completedAt,
    };
    await this.config.runRepo.save(updated);

    const eventType = ({
      running: 'run.started',
      completed: 'run.completed',
      failed: 'run.failed',
      cancelled: 'run.cancelled',
    } as const)[status as 'running' | 'completed' | 'failed' | 'cancelled'];

    if (eventType) {
      await this.emit(eventType, runId, 'run', updated, actor);
    }
    return updated;
  }

  async getRun(id: string): Promise<Run | null> {
    return this.config.runRepo.get(id);
  }

  async listRuns(options?: { status?: RunStatus; limit?: number }): Promise<Run[]> {
    return this.config.runRepo.list(options);
  }

  async listSessions(): Promise<Session[]> {
    return this.config.sessionRepo.list();
  }

  async appendSessionMessage(
    sessionId: string,
    role: SessionMessage['role'],
    content: string,
    metadata?: Record<string, unknown>,
  ): Promise<SessionMessage | null> {
    const repo = this.config.sessionMessageRepo;
    if (!repo) return null;
    return repo.append({ sessionId, role, content, metadata });
  }

  async getSessionMessages(sessionId: string, limit = 50): Promise<SessionMessage[]> {
    const repo = this.config.sessionMessageRepo;
    if (!repo) return [];
    return repo.list(sessionId, limit);
  }

  /** Append a domain event for a run aggregate (e.g. model.request / model.response). */
  async appendRunEvent(
    runId: string,
    type: DomainEventType,
    payload: unknown,
    actor?: Actor,
  ): Promise<DomainEvent> {
    const run = await this.config.runRepo.get(runId);
    if (!run) throw new Error(`Run not found: ${runId}`);
    return this.emit(type, runId, 'run', payload, actor);
  }

  private async emit(
    type: DomainEventType,
    aggregateId: string,
    aggregateType: string,
    payload: unknown,
    actor?: Actor,
  ): Promise<DomainEvent> {
    const event = await this.config.eventStore.append({
      type,
      aggregateId,
      aggregateType,
      payload,
      correlation: createCorrelation(),
      actor: actor ?? createActor('system', 'orchestrator'),
      occurredAt: new Date().toISOString(),
    });

    for (const sub of this.config.subscribers ?? []) {
      await sub.onEvent(event);
    }
    return event;
  }
}

export function createDefaultOrchestrator(
  subscribers: EventSubscriber[] = [],
): Orchestrator {
  return new Orchestrator({
    eventStore: new InMemoryEventStore(),
    runRepo: new InMemoryRunRepository(),
    sessionRepo: new InMemorySessionRepository(),
    sessionMessageRepo: new InMemorySessionMessageRepository(),
    subscribers,
  });
}

export function createOrchestrator(
  config: OrchestratorConfig,
): Orchestrator {
  return new Orchestrator(config);
}
