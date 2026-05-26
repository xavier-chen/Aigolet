import { createHash } from 'node:crypto';
import type {
  AuditEvent,
  CreateAgentInput,
  CreateCronJobInput,
  CreateMcpServerInput,
  CreateOrgNodeInput,
  CreateSecretaryInput,
  CreateSkillInput,
  CronJob,
  DomainEvent,
  DomainEventType,
  EmbeddingConfig,
  LlmProviderConfig,
  MemoryKind,
  MemoryNamespace,
  MemoryRecord,
  McpServer,
  OrgNode,
  OrgTreeNode,
  Run,
  RunStatus,
  Secretary,
  SecretaryPermissions,
  Session,
  Skill,
  StoredAgent,
  UpdateAgentInput,
  UpdateCronJobInput,
  UpdateMcpServerInput,
  UpdateOrgNodeInput,
  UpdateSecretaryInput,
  UpdateSkillInput,
} from '@aigolet-next/protocol';
import type { AuditLedger } from '@aigolet-next/audit';
import type { MemoryQuery, MemoryStore } from '@aigolet-next/memory';
import { rankBySimilarity, stubEmbed } from '@aigolet-next/memory';
import type {
  EventStore,
  RunRepository,
  SessionMessageRepository,
  SessionRepository,
} from '@aigolet-next/orchestrator';
import type { SessionMessage } from '@aigolet-next/protocol';
import type { AlgoletDatabase } from './database.js';
import { openDatabase, resolveDatabasePath } from './database.js';
import { createFounderStores, type FounderStores } from './founder-stores.js';

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T;
}

function namespaceKey(ns: MemoryNamespace): string {
  return [ns.tenantId, ns.userId, ns.taskId ?? '', ns.agentId ?? ''].join(':');
}

export class SqliteEventStore implements EventStore {
  private readonly aggregateVersions = new Map<string, number>();

  constructor(private readonly db: AlgoletDatabase) {
    const rows = this.db
      .prepare(
        `SELECT aggregate_id, MAX(version) AS max_version FROM domain_events GROUP BY aggregate_id`,
      )
      .all() as Array<{ aggregate_id: string; max_version: number }>;
    for (const row of rows) {
      this.aggregateVersions.set(row.aggregate_id, row.max_version);
    }
  }

  async append(event: Omit<DomainEvent, 'id' | 'version'>): Promise<DomainEvent> {
    const version = (this.aggregateVersions.get(event.aggregateId) ?? 0) + 1;
    this.aggregateVersions.set(event.aggregateId, version);
    const stored: DomainEvent = {
      ...event,
      id: crypto.randomUUID(),
      version,
    };

    this.db
      .prepare(
        `INSERT INTO domain_events (
          id, type, aggregate_id, aggregate_type, payload_json, correlation_json,
          actor_json, occurred_at, version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        stored.id,
        stored.type,
        stored.aggregateId,
        stored.aggregateType,
        JSON.stringify(stored.payload),
        JSON.stringify(stored.correlation),
        JSON.stringify(stored.actor),
        stored.occurredAt,
        stored.version,
      );

    return stored;
  }

  async getById(id: string): Promise<DomainEvent | null> {
    const row = this.db.prepare('SELECT * FROM domain_events WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? this.rowToEvent(row) : null;
  }

  async getByAggregate(aggregateId: string, fromVersion = 0): Promise<DomainEvent[]> {
    const rows = this.db
      .prepare(
        `SELECT * FROM domain_events WHERE aggregate_id = ? AND version >= ? ORDER BY version ASC`,
      )
      .all(aggregateId, fromVersion) as Array<Record<string, unknown>>;
    return rows.map((row) => this.rowToEvent(row));
  }

  async getByType(type: DomainEventType, limit = 100): Promise<DomainEvent[]> {
    const rows = this.db
      .prepare(
        `SELECT * FROM domain_events WHERE type = ? ORDER BY occurred_at ASC LIMIT ?`,
      )
      .all(type, limit) as Array<Record<string, unknown>>;
    return rows.map((row) => this.rowToEvent(row));
  }

  async getAll(limit = 500): Promise<DomainEvent[]> {
    const rows = this.db
      .prepare(`SELECT * FROM domain_events ORDER BY occurred_at ASC LIMIT ?`)
      .all(limit) as Array<Record<string, unknown>>;
    return rows.map((row) => this.rowToEvent(row));
  }

  private rowToEvent(row: Record<string, unknown>): DomainEvent {
    return {
      id: row.id as string,
      type: row.type as DomainEventType,
      aggregateId: row.aggregate_id as string,
      aggregateType: row.aggregate_type as string,
      payload: parseJson(String(row.payload_json)),
      correlation: parseJson(String(row.correlation_json)),
      actor: parseJson(String(row.actor_json)),
      occurredAt: row.occurred_at as string,
      version: row.version as number,
    };
  }
}

export class SqliteRunRepository implements RunRepository {
  constructor(private readonly db: AlgoletDatabase) {}

  async get(id: string): Promise<Run | null> {
    const row = this.db.prepare('SELECT * FROM runs WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? this.rowToRun(row) : null;
  }

  async save(run: Run): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO runs (
          id, session_id, agent_id, status, input_json, output_json, error,
          correlation_json, started_at, completed_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          status = excluded.status,
          output_json = excluded.output_json,
          error = excluded.error,
          started_at = excluded.started_at,
          completed_at = excluded.completed_at`,
      )
      .run(
        run.id,
        run.sessionId,
        run.agentId,
        run.status,
        JSON.stringify(run.input),
        run.output === undefined ? null : JSON.stringify(run.output),
        run.error ?? null,
        JSON.stringify(run.correlation),
        run.startedAt ?? null,
        run.completedAt ?? null,
        run.createdAt,
      );
  }

  async listBySession(sessionId: string): Promise<Run[]> {
    const rows = this.db
      .prepare(`SELECT * FROM runs WHERE session_id = ? ORDER BY created_at DESC`)
      .all(sessionId) as Array<Record<string, unknown>>;
    return rows.map((row) => this.rowToRun(row));
  }

  async list(options?: { status?: RunStatus; limit?: number }): Promise<Run[]> {
    const limit = options?.limit ?? 100;
    const rows = options?.status
      ? (this.db
          .prepare(`SELECT * FROM runs WHERE status = ? ORDER BY created_at DESC LIMIT ?`)
          .all(options.status, limit) as Array<Record<string, unknown>>)
      : (this.db
          .prepare(`SELECT * FROM runs ORDER BY created_at DESC LIMIT ?`)
          .all(limit) as Array<Record<string, unknown>>);
    return rows.map((row) => this.rowToRun(row));
  }

  private rowToRun(row: Record<string, unknown>): Run {
    return {
      id: row.id as string,
      sessionId: row.session_id as string,
      agentId: row.agent_id as string,
      status: row.status as RunStatus,
      input: parseJson(String(row.input_json)),
      output: row.output_json ? parseJson(String(row.output_json)) : undefined,
      error: (row.error as string | null) ?? undefined,
      correlation: parseJson(String(row.correlation_json)),
      startedAt: (row.started_at as string | null) ?? undefined,
      completedAt: (row.completed_at as string | null) ?? undefined,
      createdAt: row.created_at as string,
    };
  }
}

export class SqliteSessionRepository implements SessionRepository {
  constructor(private readonly db: AlgoletDatabase) {}

  async get(id: string): Promise<Session | null> {
    const row = this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? this.rowToSession(row) : null;
  }

  async save(session: Session): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO sessions (
          id, agent_id, title, namespace_json, status, visibility_level, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          status = excluded.status,
          visibility_level = excluded.visibility_level,
          updated_at = excluded.updated_at`,
      )
      .run(
        session.id,
        session.agentId,
        session.title,
        JSON.stringify(session.namespace),
        session.status,
        session.visibilityLevel ?? 10,
        session.createdAt,
        session.updatedAt,
      );
  }

  async updateVisibility(id: string, visibilityLevel: number): Promise<void> {
    this.db
      .prepare(`UPDATE sessions SET visibility_level = ?, updated_at = ? WHERE id = ?`)
      .run(visibilityLevel, new Date().toISOString(), id);
  }

  async list(): Promise<Session[]> {
    const rows = this.db
      .prepare(`SELECT * FROM sessions ORDER BY updated_at DESC`)
      .all() as Array<Record<string, unknown>>;
    return rows.map((row) => this.rowToSession(row));
  }

  private rowToSession(row: Record<string, unknown>): Session {
    return {
      id: row.id as string,
      agentId: row.agent_id as string,
      title: row.title as string,
      namespace: parseJson(String(row.namespace_json)),
      status: row.status as Session['status'],
      visibilityLevel: (row.visibility_level as number | null) ?? undefined,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }
}

export class SqliteSessionMessageRepository implements SessionMessageRepository {
  constructor(private readonly db: AlgoletDatabase) {}

  async append(message: Omit<SessionMessage, 'id' | 'createdAt'>): Promise<SessionMessage> {
    const stored: SessionMessage = {
      ...message,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };

    this.db
      .prepare(
        `INSERT INTO session_messages (id, session_id, role, content, metadata_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        stored.id,
        stored.sessionId,
        stored.role,
        stored.content,
        stored.metadata ? JSON.stringify(stored.metadata) : null,
        stored.createdAt,
      );

    return stored;
  }

  async list(sessionId: string, limit = 50): Promise<SessionMessage[]> {
    const rows = this.db
      .prepare(
        `SELECT * FROM session_messages WHERE session_id = ?
         ORDER BY created_at ASC LIMIT ?`,
      )
      .all(sessionId, limit) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      id: row.id as string,
      sessionId: row.session_id as string,
      role: row.role as SessionMessage['role'],
      content: row.content as string,
      metadata: row.metadata_json ? parseJson(String(row.metadata_json)) : undefined,
      createdAt: row.created_at as string,
    }));
  }
}

export class SqliteMemoryStore implements MemoryStore {
  constructor(private readonly db: AlgoletDatabase) {}

  async stage(record: Omit<MemoryRecord, 'id' | 'createdAt'>): Promise<MemoryRecord> {
    const staged: MemoryRecord = {
      ...record,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };

    this.db
      .prepare(
        `INSERT INTO memory_records (
          id, kind, namespace_json, content, metadata_json, embedding_json,
          created_at, expires_at, staged
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      )
      .run(
        staged.id,
        staged.kind,
        JSON.stringify(staged.namespace),
        staged.content,
        staged.metadata ? JSON.stringify(staged.metadata) : null,
        staged.embedding ? JSON.stringify(staged.embedding) : null,
        staged.createdAt,
        staged.expiresAt ?? null,
      );

    return staged;
  }

  async commit(id: string): Promise<MemoryRecord> {
    const row = this.db.prepare('SELECT * FROM memory_records WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    if (!row) throw new Error(`Staged memory not found: ${id}`);

    this.db.prepare('UPDATE memory_records SET staged = 0 WHERE id = ?').run(id);
    return this.rowToRecord(row, 0);
  }

  async discard(id: string): Promise<void> {
    this.db.prepare('DELETE FROM memory_records WHERE id = ? AND staged = 1').run(id);
  }

  async retrieve(query: MemoryQuery): Promise<MemoryRecord[]> {
    const key = namespaceKey(query.namespace);
    const rows = this.db
      .prepare(
        `SELECT * FROM memory_records WHERE staged = 0 ORDER BY created_at ASC`,
      )
      .all() as Array<Record<string, unknown>>;

    const limit = query.limit ?? 50;
    let filtered = rows
      .map((row) => this.rowToRecord(row, row.staged as number))
      .filter((record) => {
        if (namespaceKey(record.namespace) !== key) return false;
        if (query.kind && record.kind !== query.kind) return false;
        return true;
      });

    if (query.query?.trim()) {
      const q = query.query.trim();
      const queryEmbedding = query.queryEmbedding ?? stubEmbed(q);
      const withEmbeddings = filtered.filter((r) => r.embedding?.length);
      if (withEmbeddings.length > 0) {
        const ranked = rankBySimilarity(
          queryEmbedding,
          withEmbeddings.map((r) => ({ item: r, embedding: r.embedding })),
          limit,
        );
        const semantic = ranked.map((r) => r.item);
        if (semantic.length >= limit) return semantic;
        const semanticIds = new Set(semantic.map((r) => r.id));
        const keyword = filtered.filter(
          (r) =>
            !semanticIds.has(r.id) &&
            r.content.toLowerCase().includes(q.toLowerCase()),
        );
        return [...semantic, ...keyword].slice(0, limit);
      }
      filtered = filtered.filter((r) =>
        r.content.toLowerCase().includes(q.toLowerCase()),
      );
    }

    return filtered.slice(-limit);
  }

  async searchSemantic(
    namespace: MemoryNamespace,
    queryEmbedding: number[],
    options?: { kind?: MemoryKind; limit?: number },
  ): Promise<MemoryRecord[]> {
    return this.retrieve({
      namespace,
      kind: options?.kind,
      query: '',
      queryEmbedding,
      limit: options?.limit ?? 20,
    });
  }

  async updateEmbedding(id: string, embedding: number[]): Promise<void> {
    this.db
      .prepare('UPDATE memory_records SET embedding_json = ? WHERE id = ?')
      .run(JSON.stringify(embedding), id);
  }

  async get(id: string): Promise<MemoryRecord | null> {
    const row = this.db.prepare('SELECT * FROM memory_records WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? this.rowToRecord(row, row.staged as number) : null;
  }

  private rowToRecord(row: Record<string, unknown>, staged: number): MemoryRecord {
    return {
      id: row.id as string,
      kind: row.kind as MemoryKind,
      namespace: parseJson(String(row.namespace_json)),
      content: row.content as string,
      metadata: row.metadata_json ? parseJson(String(row.metadata_json)) : undefined,
      embedding: row.embedding_json ? parseJson(String(row.embedding_json)) : undefined,
      createdAt: row.created_at as string,
      expiresAt: (row.expires_at as string | null) ?? undefined,
      ...(staged ? {} : {}),
    };
  }
}

export class SqliteAuditLedger implements AuditLedger {
  constructor(private readonly db: AlgoletDatabase) {}

  async append(
    event: Omit<AuditEvent, 'sequence' | 'hash' | 'previousHash'>,
  ): Promise<AuditEvent> {
    const last = this.db
      .prepare(`SELECT hash, sequence FROM audit_events ORDER BY sequence DESC LIMIT 1`)
      .get() as { hash: string; sequence: number } | undefined;

    const sequence = last?.sequence !== undefined ? last.sequence + 1 : 0;
    const previousHash = last?.hash;
    const hash = this.computeHash({ ...event, sequence, previousHash });
    const stored: AuditEvent = { ...event, sequence, previousHash, hash };

    this.db
      .prepare(
        `INSERT INTO audit_events (
          id, action, resource_type, resource_id, actor_json, correlation_json,
          payload_json, redacted_fields_json, occurred_at, sequence, previous_hash, hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        stored.id,
        stored.action,
        stored.resourceType,
        stored.resourceId,
        JSON.stringify(stored.actor),
        JSON.stringify(stored.correlation),
        JSON.stringify(stored.payload),
        JSON.stringify(stored.redactedFields),
        stored.occurredAt,
        stored.sequence,
        stored.previousHash ?? null,
        stored.hash,
      );

    return stored;
  }

  async getAll(limit = 500): Promise<AuditEvent[]> {
    const rows = this.db
      .prepare(`SELECT * FROM audit_events ORDER BY sequence ASC LIMIT ?`)
      .all(limit) as Array<Record<string, unknown>>;
    return rows.map((row) => this.rowToAudit(row));
  }

  async getByCorrelation(correlationId: string): Promise<AuditEvent[]> {
    const rows = this.db
      .prepare(`SELECT * FROM audit_events ORDER BY sequence ASC`)
      .all() as Array<Record<string, unknown>>;
    return rows
      .map((row) => this.rowToAudit(row))
      .filter((event) => event.correlation.correlationId === correlationId);
  }

  async verify(): Promise<{ valid: boolean; brokenAt?: number }> {
    const rows = this.db
      .prepare(`SELECT * FROM audit_events ORDER BY sequence ASC`)
      .all() as Array<Record<string, unknown>>;

    let previousHash: string | undefined;
    for (let i = 0; i < rows.length; i++) {
      const event = this.rowToAudit(rows[i]);
      if (event.sequence !== i) return { valid: false, brokenAt: i };
      if (event.previousHash !== previousHash) return { valid: false, brokenAt: i };
      const expected = this.computeHash({
        ...event,
        hash: undefined as unknown as string,
      });
      if (event.hash !== expected) return { valid: false, brokenAt: i };
      previousHash = event.hash;
    }
    return { valid: true };
  }

  private computeHash(event: Omit<AuditEvent, 'hash'> & { hash?: string }): string {
    const { hash: _hash, ...rest } = event;
    return createHash('sha256').update(JSON.stringify(rest)).digest('hex');
  }

  private rowToAudit(row: Record<string, unknown>): AuditEvent {
    return {
      id: row.id as string,
      action: row.action as string,
      resourceType: row.resource_type as string,
      resourceId: row.resource_id as string,
      actor: parseJson(String(row.actor_json)),
      correlation: parseJson(String(row.correlation_json)),
      payload: parseJson(String(row.payload_json)),
      redactedFields: parseJson(String(row.redacted_fields_json)),
      occurredAt: row.occurred_at as string,
      sequence: row.sequence as number,
      previousHash: (row.previous_hash as string | null) ?? undefined,
      hash: row.hash as string,
    };
  }
}

export class SqliteSkillStore {
  constructor(private readonly db: AlgoletDatabase) {}

  list(): Skill[] {
    const rows = this.db
      .prepare(`SELECT * FROM skills ORDER BY updated_at DESC`)
      .all() as Array<Record<string, unknown>>;
    return rows.map((row) => this.rowToSkill(row));
  }

  get(id: string): Skill | null {
    const row = this.db.prepare('SELECT * FROM skills WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? this.rowToSkill(row) : null;
  }

  create(input: CreateSkillInput): Skill {
    const now = new Date().toISOString();
    const skill: Skill = {
      id: crypto.randomUUID(),
      name: input.name,
      description: input.description,
      enabled: input.enabled ?? true,
      source: input.source,
      content: input.content,
      path: input.path,
      createdAt: now,
      updatedAt: now,
    };
    this.db
      .prepare(
        `INSERT INTO skills (
          id, name, description, enabled, source, content, path, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        skill.id,
        skill.name,
        skill.description ?? null,
        skill.enabled ? 1 : 0,
        skill.source,
        skill.content ?? null,
        skill.path ?? null,
        skill.createdAt,
        skill.updatedAt,
      );
    return skill;
  }

  update(id: string, input: UpdateSkillInput): Skill | null {
    const existing = this.get(id);
    if (!existing) return null;

    const updated: Skill = {
      ...existing,
      ...input,
      updatedAt: new Date().toISOString(),
    };

    this.db
      .prepare(
        `UPDATE skills SET
          name = ?, description = ?, enabled = ?, content = ?, path = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        updated.name,
        updated.description ?? null,
        updated.enabled ? 1 : 0,
        updated.content ?? null,
        updated.path ?? null,
        updated.updatedAt,
        id,
      );

    return updated;
  }

  delete(id: string): boolean {
    const result = this.db.prepare('DELETE FROM skills WHERE id = ?').run(id);
    return result.changes > 0;
  }

  private rowToSkill(row: Record<string, unknown>): Skill {
    return {
      id: row.id as string,
      name: row.name as string,
      description: (row.description as string | null) ?? undefined,
      enabled: Boolean(row.enabled),
      source: row.source as Skill['source'],
      content: (row.content as string | null) ?? undefined,
      path: (row.path as string | null) ?? undefined,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }
}

export class SqliteAgentStore {
  constructor(private readonly db: AlgoletDatabase) {}

  list(): StoredAgent[] {
    const rows = this.db
      .prepare(`SELECT * FROM agents ORDER BY created_at ASC`)
      .all() as Array<Record<string, unknown>>;
    return rows.map((row) => this.rowToAgent(row));
  }

  get(id: string): StoredAgent | null {
    const row = this.db.prepare('SELECT * FROM agents WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? this.rowToAgent(row) : null;
  }

  create(input: CreateAgentInput): StoredAgent {
    const now = new Date().toISOString();
    const agent: StoredAgent = {
      id: crypto.randomUUID(),
      name: input.name,
      description: input.description,
      systemPrompt: input.systemPrompt,
      modelOverride: input.modelOverride,
      enabled: input.enabled ?? true,
      orgNodeId: input.orgNodeId,
      allowedTools: input.allowedTools,
      allowedSkills: input.allowedSkills,
      createdAt: now,
      updatedAt: now,
    };
    this.db
      .prepare(
        `INSERT INTO agents (
          id, name, description, system_prompt, model_override, enabled,
          org_node_id, allowed_tools_json, allowed_skills_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        agent.id,
        agent.name,
        agent.description ?? null,
        agent.systemPrompt ?? null,
        agent.modelOverride ?? null,
        agent.enabled ? 1 : 0,
        agent.orgNodeId ?? null,
        agent.allowedTools?.length ? JSON.stringify(agent.allowedTools) : null,
        agent.allowedSkills?.length ? JSON.stringify(agent.allowedSkills) : null,
        agent.createdAt,
        agent.updatedAt,
      );
    return agent;
  }

  update(id: string, input: UpdateAgentInput): StoredAgent | null {
    const existing = this.get(id);
    if (!existing) return null;
    const updated: StoredAgent = {
      ...existing,
      ...input,
      orgNodeId: input.orgNodeId === null ? undefined : (input.orgNodeId ?? existing.orgNodeId),
      updatedAt: new Date().toISOString(),
    };
    this.db
      .prepare(
        `UPDATE agents SET
          name = ?, description = ?, system_prompt = ?, model_override = ?,
          enabled = ?, org_node_id = ?, allowed_tools_json = ?, allowed_skills_json = ?,
          updated_at = ?
         WHERE id = ?`,
      )
      .run(
        updated.name,
        updated.description ?? null,
        updated.systemPrompt ?? null,
        updated.modelOverride ?? null,
        updated.enabled ? 1 : 0,
        updated.orgNodeId ?? null,
        updated.allowedTools?.length ? JSON.stringify(updated.allowedTools) : null,
        updated.allowedSkills?.length ? JSON.stringify(updated.allowedSkills) : null,
        updated.updatedAt,
        id,
      );
    return updated;
  }

  delete(id: string): boolean {
    if (id === 'default-agent') return false;
    const result = this.db.prepare('DELETE FROM agents WHERE id = ?').run(id);
    return result.changes > 0;
  }

  private rowToAgent(row: Record<string, unknown>): StoredAgent {
    const allowedToolsRaw = row.allowed_tools_json as string | null;
    const allowedSkillsRaw = row.allowed_skills_json as string | null;
    return {
      id: row.id as string,
      name: row.name as string,
      description: (row.description as string | null) ?? undefined,
      systemPrompt: (row.system_prompt as string | null) ?? undefined,
      modelOverride: (row.model_override as string | null) ?? undefined,
      enabled: Boolean(row.enabled),
      orgNodeId: (row.org_node_id as string | null) ?? undefined,
      allowedTools: allowedToolsRaw ? parseJson<string[]>(allowedToolsRaw) : undefined,
      allowedSkills: allowedSkillsRaw ? parseJson<string[]>(allowedSkillsRaw) : undefined,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }
}

export class SqliteCronJobStore {
  constructor(private readonly db: AlgoletDatabase) {}

  list(): CronJob[] {
    const rows = this.db
      .prepare(`SELECT * FROM cron_jobs ORDER BY created_at DESC`)
      .all() as Array<Record<string, unknown>>;
    return rows.map((row) => this.rowToCron(row));
  }

  get(id: string): CronJob | null {
    const row = this.db.prepare('SELECT * FROM cron_jobs WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? this.rowToCron(row) : null;
  }

  create(input: CreateCronJobInput): CronJob {
    const now = new Date().toISOString();
    const job: CronJob = {
      id: crypto.randomUUID(),
      name: input.name,
      schedule: input.schedule,
      message: input.message,
      agentId: input.agentId,
      secretaryId: input.secretaryId,
      enabled: input.enabled ?? true,
      createdAt: now,
    };
    this.db
      .prepare(
        `INSERT INTO cron_jobs (
          id, name, schedule, message, agent_id, secretary_id, enabled, last_run, next_run, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?)`,
      )
      .run(
        job.id,
        job.name,
        job.schedule,
        job.message,
        job.agentId,
        job.secretaryId ?? null,
        job.enabled ? 1 : 0,
        job.createdAt,
      );
    return job;
  }

  update(id: string, input: UpdateCronJobInput): CronJob | null {
    const existing = this.get(id);
    if (!existing) return null;
    const updated: CronJob = { ...existing, ...input };
    this.db
      .prepare(
        `UPDATE cron_jobs SET
          name = ?, schedule = ?, message = ?, agent_id = ?, secretary_id = ?, enabled = ?
         WHERE id = ?`,
      )
      .run(
        updated.name,
        updated.schedule,
        updated.message,
        updated.agentId,
        updated.secretaryId ?? null,
        updated.enabled ? 1 : 0,
        id,
      );
    return updated;
  }

  updateRunTimes(id: string, lastRun: string, nextRun?: string): void {
    this.db
      .prepare(`UPDATE cron_jobs SET last_run = ?, next_run = ? WHERE id = ?`)
      .run(lastRun, nextRun ?? null, id);
  }

  setNextRun(id: string, nextRun: string | null): void {
    this.db.prepare(`UPDATE cron_jobs SET next_run = ? WHERE id = ?`).run(nextRun, id);
  }

  delete(id: string): boolean {
    const result = this.db.prepare('DELETE FROM cron_jobs WHERE id = ?').run(id);
    return result.changes > 0;
  }

  listBySecretary(secretaryId: string): CronJob[] {
    return this.list().filter((j) => j.secretaryId === secretaryId);
  }

  private rowToCron(row: Record<string, unknown>): CronJob {
    return {
      id: row.id as string,
      name: row.name as string,
      schedule: row.schedule as string,
      message: row.message as string,
      agentId: row.agent_id as string,
      secretaryId: (row.secretary_id as string | null) ?? undefined,
      enabled: Boolean(row.enabled),
      lastRun: (row.last_run as string | null) ?? undefined,
      nextRun: (row.next_run as string | null) ?? undefined,
      createdAt: row.created_at as string,
    };
  }
}

export class SqliteOrgNodeStore {
  constructor(private readonly db: AlgoletDatabase) {}

  list(): OrgNode[] {
    const rows = this.db
      .prepare(`SELECT * FROM org_nodes ORDER BY sort_order ASC, created_at ASC`)
      .all() as Array<Record<string, unknown>>;
    return rows.map((row) => this.rowToNode(row));
  }

  get(id: string): OrgNode | null {
    const row = this.db.prepare('SELECT * FROM org_nodes WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? this.rowToNode(row) : null;
  }

  create(input: CreateOrgNodeInput): OrgNode {
    const now = new Date().toISOString();
    const node: OrgNode = {
      id: crypto.randomUUID(),
      name: input.name,
      rank: input.rank ?? 10,
      parentId: input.parentId,
      sortOrder: input.sortOrder ?? 0,
      color: input.color,
      createdAt: now,
      updatedAt: now,
    };
    this.db
      .prepare(
        `INSERT INTO org_nodes (id, name, rank, parent_id, sort_order, color, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        node.id,
        node.name,
        node.rank,
        node.parentId ?? null,
        node.sortOrder,
        node.color ?? null,
        node.createdAt,
        node.updatedAt,
      );
    return node;
  }

  update(id: string, input: UpdateOrgNodeInput): OrgNode | null {
    const existing = this.get(id);
    if (!existing) return null;
    const updated: OrgNode = {
      ...existing,
      ...input,
      parentId: input.parentId === null ? undefined : (input.parentId ?? existing.parentId),
      updatedAt: new Date().toISOString(),
    };
    this.db
      .prepare(
        `UPDATE org_nodes SET name = ?, rank = ?, parent_id = ?, sort_order = ?, color = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        updated.name,
        updated.rank,
        updated.parentId ?? null,
        updated.sortOrder,
        updated.color ?? null,
        updated.updatedAt,
        id,
      );
    return updated;
  }

  delete(id: string): boolean {
    const child = this.db.prepare('SELECT id FROM org_nodes WHERE parent_id = ? LIMIT 1').get(id);
    if (child) return false;
    const agents = this.db.prepare('SELECT id FROM agents WHERE org_node_id = ? LIMIT 1').get(id);
    if (agents) return false;
    const result = this.db.prepare('DELETE FROM org_nodes WHERE id = ?').run(id);
    return result.changes > 0;
  }

  buildTree(agentStore: SqliteAgentStore): OrgTreeNode[] {
    const nodes = this.list();
    const agents = agentStore.list();
    const byParent = new Map<string | undefined, OrgNode[]>();
    for (const node of nodes) {
      const key = node.parentId;
      const list = byParent.get(key) ?? [];
      list.push(node);
      byParent.set(key, list);
    }

    const build = (parentId: string | undefined): OrgTreeNode[] => {
      const children = byParent.get(parentId) ?? [];
      return children.map((node) => ({
        id: node.id,
        name: node.name,
        rank: node.rank,
        parentId: node.parentId,
        sortOrder: node.sortOrder,
        color: node.color,
        agents: agents
          .filter((a) => a.orgNodeId === node.id)
          .map((a) => ({ id: a.id, name: a.name, enabled: a.enabled })),
        children: build(node.id),
      }));
    };

    return build(undefined);
  }

  private rowToNode(row: Record<string, unknown>): OrgNode {
    return {
      id: row.id as string,
      name: row.name as string,
      rank: row.rank as number,
      parentId: (row.parent_id as string | null) ?? undefined,
      sortOrder: row.sort_order as number,
      color: (row.color as string | null) ?? undefined,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }
}

export class SqliteSecretaryStore {
  constructor(private readonly db: AlgoletDatabase) {}

  list(): Secretary[] {
    const rows = this.db
      .prepare(`SELECT * FROM secretaries ORDER BY created_at ASC`)
      .all() as Array<Record<string, unknown>>;
    return rows.map((row) => this.rowToSecretary(row));
  }

  get(id: string): Secretary | null {
    const row = this.db.prepare('SELECT * FROM secretaries WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? this.rowToSecretary(row) : null;
  }

  create(input: CreateSecretaryInput): Secretary {
    const now = new Date().toISOString();
    const secretary: Secretary = {
      id: crypto.randomUUID(),
      name: input.name,
      type: input.type,
      description: input.description,
      systemPrompt: input.systemPrompt,
      color: input.color,
      permissions: input.permissions ?? defaultPermissionsForType(input.type),
      allowedTools: input.allowedTools,
      allowedSkills: input.allowedSkills,
      enabled: input.enabled ?? true,
      createdAt: now,
      updatedAt: now,
    };
    this.db
      .prepare(
        `INSERT INTO secretaries (
          id, name, type, description, system_prompt, color, permissions_json,
          allowed_tools_json, allowed_skills_json, enabled, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        secretary.id,
        secretary.name,
        secretary.type,
        secretary.description ?? null,
        secretary.systemPrompt ?? null,
        secretary.color ?? null,
        JSON.stringify(secretary.permissions),
        secretary.allowedTools?.length ? JSON.stringify(secretary.allowedTools) : null,
        secretary.allowedSkills?.length ? JSON.stringify(secretary.allowedSkills) : null,
        secretary.enabled ? 1 : 0,
        secretary.createdAt,
        secretary.updatedAt,
      );
    return secretary;
  }

  update(id: string, input: UpdateSecretaryInput): Secretary | null {
    const existing = this.get(id);
    if (!existing) return null;
    const updated: Secretary = {
      ...existing,
      ...input,
      permissions: input.permissions ?? existing.permissions,
      updatedAt: new Date().toISOString(),
    };
    this.db
      .prepare(
        `UPDATE secretaries SET name = ?, type = ?, description = ?, system_prompt = ?, color = ?,
         permissions_json = ?, allowed_tools_json = ?, allowed_skills_json = ?,
         enabled = ?, updated_at = ? WHERE id = ?`,
      )
      .run(
        updated.name,
        updated.type,
        updated.description ?? null,
        updated.systemPrompt ?? null,
        updated.color ?? null,
        JSON.stringify(updated.permissions),
        updated.allowedTools?.length ? JSON.stringify(updated.allowedTools) : null,
        updated.allowedSkills?.length ? JSON.stringify(updated.allowedSkills) : null,
        updated.enabled ? 1 : 0,
        updated.updatedAt,
        id,
      );
    return updated;
  }

  delete(id: string): boolean {
    const result = this.db.prepare('DELETE FROM secretaries WHERE id = ?').run(id);
    return result.changes > 0;
  }

  private rowToSecretary(row: Record<string, unknown>): Secretary {
    const allowedToolsRaw = row.allowed_tools_json as string | null;
    const allowedSkillsRaw = row.allowed_skills_json as string | null;
    return {
      id: row.id as string,
      name: row.name as string,
      type: row.type as Secretary['type'],
      description: (row.description as string | null) ?? undefined,
      systemPrompt: (row.system_prompt as string | null) ?? undefined,
      color: (row.color as string | null) ?? undefined,
      permissions: parseJson<SecretaryPermissions>(String(row.permissions_json)),
      allowedTools: allowedToolsRaw ? parseJson<string[]>(allowedToolsRaw) : undefined,
      allowedSkills: allowedSkillsRaw ? parseJson<string[]>(allowedSkillsRaw) : undefined,
      enabled: Boolean(row.enabled),
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }
}

function defaultPermissionsForType(type: Secretary['type']): SecretaryPermissions {
  if (type === 'time') {
    return { cron: { create: true, edit: true, delete: true, run: true } };
  }
  return {};
}

export class SqliteMcpServerStore {
  constructor(private readonly db: AlgoletDatabase) {}

  list(): McpServer[] {
    const rows = this.db
      .prepare(`SELECT * FROM mcp_servers ORDER BY updated_at DESC`)
      .all() as Array<Record<string, unknown>>;
    return rows.map((row) => this.rowToMcp(row));
  }

  get(id: string): McpServer | null {
    const row = this.db.prepare('SELECT * FROM mcp_servers WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? this.rowToMcp(row) : null;
  }

  create(input: CreateMcpServerInput): McpServer {
    const now = new Date().toISOString();
    const server: McpServer = {
      id: crypto.randomUUID(),
      name: input.name,
      command: input.command,
      args: input.args ?? [],
      env: input.env ?? {},
      enabled: input.enabled ?? true,
      createdAt: now,
      updatedAt: now,
    };
    this.db
      .prepare(
        `INSERT INTO mcp_servers (
          id, name, command, args_json, env_json, enabled, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        server.id,
        server.name,
        server.command,
        JSON.stringify(server.args),
        JSON.stringify(server.env),
        server.enabled ? 1 : 0,
        server.createdAt,
        server.updatedAt,
      );
    return server;
  }

  update(id: string, input: UpdateMcpServerInput): McpServer | null {
    const existing = this.get(id);
    if (!existing) return null;
    const updated: McpServer = {
      ...existing,
      ...input,
      args: input.args ?? existing.args,
      env: input.env ?? existing.env,
      updatedAt: new Date().toISOString(),
    };
    this.db
      .prepare(
        `UPDATE mcp_servers SET
          name = ?, command = ?, args_json = ?, env_json = ?, enabled = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        updated.name,
        updated.command,
        JSON.stringify(updated.args),
        JSON.stringify(updated.env),
        updated.enabled ? 1 : 0,
        updated.updatedAt,
        id,
      );
    return updated;
  }

  delete(id: string): boolean {
    const result = this.db.prepare('DELETE FROM mcp_servers WHERE id = ?').run(id);
    return result.changes > 0;
  }

  private rowToMcp(row: Record<string, unknown>): McpServer {
    return {
      id: row.id as string,
      name: row.name as string,
      command: row.command as string,
      args: parseJson<string[]>(String(row.args_json)),
      env: parseJson<Record<string, string>>(String(row.env_json)),
      enabled: Boolean(row.enabled),
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }
}

export class SqliteEmbeddingConfigStore {
  constructor(private readonly db: AlgoletDatabase) {}

  get(): EmbeddingConfig {
    const row = this.db.prepare('SELECT * FROM embedding_config WHERE id = 1').get() as
      | Record<string, unknown>
      | undefined;
    if (!row) {
      return { providerType: 'stub', modelName: 'text-embedding-3-small' };
    }
    return {
      providerType: row.provider_type as EmbeddingConfig['providerType'],
      modelName: row.model_name as string,
      apiKey: (row.api_key as string) || undefined,
    };
  }

  set(config: EmbeddingConfig): EmbeddingConfig {
    const current = this.get();
    const merged: EmbeddingConfig = {
      providerType: config.providerType,
      modelName: config.modelName,
      apiKey: config.apiKey ?? current.apiKey,
    };
    this.db
      .prepare(
        `UPDATE embedding_config SET provider_type = ?, model_name = ?, api_key = ? WHERE id = 1`,
      )
      .run(merged.providerType, merged.modelName, merged.apiKey ?? '');
    return this.get();
  }
}

export class SqliteLlmConfigStore {
  constructor(private readonly db: AlgoletDatabase) {}

  get(): LlmProviderConfig {
    const row = this.db.prepare('SELECT * FROM llm_config WHERE id = 1').get() as
      | Record<string, unknown>
      | undefined;
    if (!row) {
      return { providerType: 'stub', baseUrl: '', modelName: 'stub-mini', apiKey: '' };
    }
    return {
      providerType: row.provider_type as LlmProviderConfig['providerType'],
      baseUrl: row.base_url as string,
      modelName: row.model_name as string,
      apiKey: (row.api_key as string) || undefined,
    };
  }

  set(config: LlmProviderConfig): LlmProviderConfig {
    const current = this.get();
    const merged: LlmProviderConfig = {
      providerType: config.providerType,
      baseUrl: config.baseUrl,
      modelName: config.modelName,
      apiKey: config.apiKey ?? current.apiKey,
    };

    this.db
      .prepare(
        `UPDATE llm_config SET provider_type = ?, base_url = ?, model_name = ?, api_key = ? WHERE id = 1`,
      )
      .run(
        merged.providerType,
        merged.baseUrl,
        merged.modelName,
        merged.apiKey ?? '',
      );

    return this.get();
  }
}

export interface PersistentStores {
  db: AlgoletDatabase;
  eventStore: SqliteEventStore;
  runRepo: SqliteRunRepository;
  sessionRepo: SqliteSessionRepository;
  sessionMessageRepo: SqliteSessionMessageRepository;
  memoryStore: SqliteMemoryStore;
  auditLedger: SqliteAuditLedger;
  skillStore: SqliteSkillStore;
  agentStore: SqliteAgentStore;
  orgNodeStore: SqliteOrgNodeStore;
  secretaryStore: SqliteSecretaryStore;
  cronJobStore: SqliteCronJobStore;
  mcpServerStore: SqliteMcpServerStore;
  embeddingConfigStore: SqliteEmbeddingConfigStore;
  llmConfigStore: SqliteLlmConfigStore;
  founder: FounderStores;
}

export function getAgentRank(
  agentStore: SqliteAgentStore,
  orgNodeStore: SqliteOrgNodeStore,
  agentId: string,
): number {
  const agent = agentStore.get(agentId);
  if (!agent?.orgNodeId) return 10;
  const node = orgNodeStore.get(agent.orgNodeId);
  return node?.rank ?? 10;
}

export function createPersistentStores(dbPath?: string): PersistentStores {
  const db = openDatabase(dbPath ?? resolveDatabasePath());
  return {
    db,
    eventStore: new SqliteEventStore(db),
    runRepo: new SqliteRunRepository(db),
    sessionRepo: new SqliteSessionRepository(db),
    sessionMessageRepo: new SqliteSessionMessageRepository(db),
    memoryStore: new SqliteMemoryStore(db),
    auditLedger: new SqliteAuditLedger(db),
    skillStore: new SqliteSkillStore(db),
    agentStore: new SqliteAgentStore(db),
    orgNodeStore: new SqliteOrgNodeStore(db),
    secretaryStore: new SqliteSecretaryStore(db),
    cronJobStore: new SqliteCronJobStore(db),
    mcpServerStore: new SqliteMcpServerStore(db),
    embeddingConfigStore: new SqliteEmbeddingConfigStore(db),
    llmConfigStore: new SqliteLlmConfigStore(db),
    founder: createFounderStores(db),
  };
}

export {
  resetAllApplicationData,
  resetConversations,
  resetMemoryRecords,
  type ResetCounts,
} from './admin-reset.js';
export { rebuildProjections, type RebuildProjectionsOptions, type RebuildProjectionsResult } from './rebuild-projections.js';
export { openDatabase, resolveDataDir, resolveDatabasePath, resolveWorkspaceDir, type AlgoletDatabase, DEFAULT_ORG_ROOT_ID } from './database.js';
export {
  canAccessVisibility,
  computeSessionVisibility,
  filterMemoriesByRank,
  FOUNDER_VIEWER_RANK,
} from './rbac.js';
export {
  createFounderStores,
  type FounderStores,
  SqliteGoalStore,
  SqliteDecisionStore,
  SqliteCustomerStore,
  SqlitePrincipleStore,
  SqliteRetrospectiveStore,
  SqliteArtifactStore,
  SqliteTransactionStore,
  SqliteReminderStore,
  SqliteProposalStore,
  SqliteFounderSettingsStore,
} from './founder-stores.js';
export type {
  Goal,
  GoalHorizon,
  GoalStatus,
  CreateGoalInput,
  UpdateGoalInput,
  Decision,
  Customer,
  Principle,
  Retrospective,
  Artifact,
  ArtifactType,
  Transaction,
  TransactionType,
  Reminder,
  Proposal,
  ProposalType,
  ProposalStatus,
  RunwaySummary,
  TodayPriority,
  RiskItem,
  TodayPlan,
  TimelineEntry,
  GoalBreakdownTask,
} from './founder-types.js';
