import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ORG_RANK } from '@aigolet-next/protocol';

export const SCHEMA_VERSION = 6;

export type AigoletDatabase = DatabaseSync;

export function resolveDataDir(): string {
  const dir = process.env.AIGOLET_DATA_DIR ?? join(homedir(), '.aigolet');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function resolveWorkspaceDir(): string {
  const dir = join(resolveDataDir(), 'workspace');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function resolveDatabasePath(): string {
  return join(resolveDataDir(), 'aigolet.db');
}

function columnExists(db: AigoletDatabase, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.some((r) => r.name === column);
}

function addColumnIfMissing(db: AigoletDatabase, table: string, column: string, ddl: string): void {
  if (!columnExists(db, table, column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }
}

const MIGRATIONS: string[] = [
  `CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS domain_events (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    aggregate_id TEXT NOT NULL,
    aggregate_type TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    correlation_json TEXT NOT NULL,
    actor_json TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    version INTEGER NOT NULL,
    UNIQUE(aggregate_id, version)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_domain_events_aggregate ON domain_events(aggregate_id, version)`,
  `CREATE INDEX IF NOT EXISTS idx_domain_events_type ON domain_events(type, occurred_at)`,
  `CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    status TEXT NOT NULL,
    input_json TEXT NOT NULL,
    output_json TEXT,
    error TEXT,
    correlation_json TEXT NOT NULL,
    started_at TEXT,
    completed_at TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_runs_session ON runs(session_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    title TEXT NOT NULL,
    namespace_json TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS session_messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    metadata_json TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_session_messages_session ON session_messages(session_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS memory_records (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    namespace_json TEXT NOT NULL,
    content TEXT NOT NULL,
    metadata_json TEXT,
    embedding_json TEXT,
    created_at TEXT NOT NULL,
    expires_at TEXT,
    staged INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE INDEX IF NOT EXISTS idx_memory_namespace ON memory_records(kind, created_at)`,
  `CREATE TABLE IF NOT EXISTS audit_events (
    id TEXT PRIMARY KEY,
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT NOT NULL,
    actor_json TEXT NOT NULL,
    correlation_json TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    redacted_fields_json TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    sequence INTEGER NOT NULL UNIQUE,
    previous_hash TEXT,
    hash TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS skills (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    enabled INTEGER NOT NULL,
    source TEXT NOT NULL,
    content TEXT,
    path TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS llm_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    provider_type TEXT NOT NULL,
    base_url TEXT NOT NULL,
    model_name TEXT NOT NULL,
    api_key TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE TABLE IF NOT EXISTS uploaded_files (
    id TEXT PRIMARY KEY,
    session_id TEXT,
    filename TEXT NOT NULL,
    path TEXT NOT NULL,
    relative_path TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_uploaded_files_session ON uploaded_files(session_id, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    system_prompt TEXT,
    model_override TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS cron_jobs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    schedule TEXT NOT NULL,
    message TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    last_run TEXT,
    next_run TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_cron_jobs_enabled ON cron_jobs(enabled, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS mcp_servers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    command TEXT NOT NULL,
    args_json TEXT NOT NULL DEFAULT '[]',
    env_json TEXT NOT NULL DEFAULT '{}',
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS embedding_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    provider_type TEXT NOT NULL DEFAULT 'stub',
    model_name TEXT NOT NULL DEFAULT 'text-embedding-3-small',
    api_key TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_agent ON sessions(agent_id, updated_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_runs_agent ON runs(agent_id, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS org_nodes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    rank INTEGER NOT NULL DEFAULT 10,
    parent_id TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    color TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_org_nodes_parent ON org_nodes(parent_id, sort_order)`,
  `CREATE TABLE IF NOT EXISTS secretaries (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'personal',
    description TEXT,
    system_prompt TEXT,
    color TEXT,
    permissions_json TEXT NOT NULL DEFAULT '{}',
    allowed_tools_json TEXT,
    allowed_skills_json TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS goals (
    id TEXT PRIMARY KEY,
    horizon TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    progress REAL NOT NULL DEFAULT 0,
    parent_id TEXT,
    due_date TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_goals_horizon ON goals(horizon, sort_order)`,
  `CREATE TABLE IF NOT EXISTS decisions (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    context TEXT,
    options_json TEXT NOT NULL DEFAULT '[]',
    chosen TEXT,
    rationale TEXT,
    assumptions TEXT,
    review_date TEXT,
    outcome TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    company TEXT,
    stage TEXT NOT NULL DEFAULT 'lead',
    last_contact TEXT,
    next_action TEXT,
    notes TEXT,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS principles (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS retrospectives (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    what_happened TEXT,
    lesson TEXT,
    tags_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS artifacts (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    type TEXT NOT NULL,
    file_path TEXT,
    content_preview TEXT,
    goal_id TEXT,
    customer_id TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_artifacts_type ON artifacts(type, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT NOT NULL DEFAULT 'CNY',
    category TEXT,
    description TEXT,
    date TEXT NOT NULL,
    recurring INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date DESC)`,
  `CREATE TABLE IF NOT EXISTS reminders (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    due_date TEXT NOT NULL,
    category TEXT,
    notes TEXT,
    completed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS proposals (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    related_customer_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_proposals_status ON proposals(status, created_at DESC)`,
];

function runSchemaMigrations(db: AigoletDatabase): void {
  addColumnIfMissing(db, 'agents', 'org_node_id', 'TEXT');
  addColumnIfMissing(db, 'agents', 'allowed_tools_json', 'TEXT');
  addColumnIfMissing(db, 'agents', 'allowed_skills_json', 'TEXT');
  addColumnIfMissing(db, 'sessions', 'visibility_level', 'INTEGER NOT NULL DEFAULT 10');
  addColumnIfMissing(db, 'cron_jobs', 'secretary_id', 'TEXT');
  addColumnIfMissing(db, 'secretaries', 'system_prompt', 'TEXT');
  addColumnIfMissing(db, 'secretaries', 'color', 'TEXT');
  addColumnIfMissing(db, 'secretaries', 'allowed_tools_json', 'TEXT');
  addColumnIfMissing(db, 'secretaries', 'allowed_skills_json', 'TEXT');
  addColumnIfMissing(db, 'retrospectives', 'decision_id', 'TEXT');
  addColumnIfMissing(db, 'retrospectives', 'goal_id', 'TEXT');
  db.exec(`UPDATE secretaries SET type = 'personal' WHERE type IN ('general', 'custom')`);
}

export const DEFAULT_ORG_ROOT_ID = 'org-founder';

function seedOrgNodes(db: AigoletDatabase): void {
  const count = db.prepare('SELECT COUNT(*) AS c FROM org_nodes').get() as { c: number };
  if (count.c > 0) return;

  const now = new Date().toISOString();
  const insert = db.prepare(
    `INSERT INTO org_nodes (id, name, rank, parent_id, sort_order, color, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  insert.run('org-founder', '创始人', ORG_RANK.FOUNDER, null, 0, '#f97316', now, now);
  insert.run('org-partner', '合伙人', ORG_RANK.PARTNER, 'org-founder', 0, '#fb923c', now, now);
  insert.run('org-director', '总监', ORG_RANK.DIRECTOR, 'org-partner', 0, '#fdba74', now, now);
  insert.run('org-manager', '经理', ORG_RANK.MANAGER, 'org-director', 0, '#fed7aa', now, now);
  insert.run('org-staff', '专员', ORG_RANK.STAFF, 'org-manager', 0, '#ffedd5', now, now);
}

function seedSecretaries(db: AigoletDatabase): void {
  const count = db.prepare('SELECT COUNT(*) AS c FROM secretaries').get() as { c: number };
  if (count.c > 0) return;

  const now = new Date().toISOString();
  const insert = db.prepare(
    `INSERT INTO secretaries (
      id, name, type, description, system_prompt, color, permissions_json,
      allowed_tools_json, allowed_skills_json, enabled, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, 1, ?, ?)`,
  );

  insert.run(
    crypto.randomUUID(),
    '时间秘书',
    'time',
    '管理定时与周期性任务',
    '你是时间秘书，负责理解用户的日程需求并管理定时任务。',
    '#f59e0b',
    JSON.stringify({ cron: { create: true, edit: true, delete: true, run: true } }),
    now,
    now,
  );
  insert.run(
    crypto.randomUUID(),
    '个人秘书',
    'personal',
    '个人生活助理——提醒、日程与生活事务',
    '你是个人秘书，帮助用户管理日常生活、提醒事项与个人计划。语气亲切、高效。',
    '#8b5cf6',
    JSON.stringify({}),
    now,
    now,
  );
  insert.run(
    crypto.randomUUID(),
    '工作秘书',
    'work',
    '工作商务助理——会议、文档与项目协调',
    '你是工作秘书，帮助用户处理商务事务、会议安排、文档整理与项目跟进。语气专业、简洁。',
    '#3b82f6',
    JSON.stringify({}),
    now,
    now,
  );
}

export function openDatabase(dbPath?: string): AigoletDatabase {
  const path = dbPath ?? resolveDatabasePath();
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');

  for (const sql of MIGRATIONS) {
    db.exec(sql);
  }

  runSchemaMigrations(db);

  const versionRow = db.prepare('SELECT value FROM meta WHERE key = ?').get('schema_version') as
    | { value: string }
    | undefined;

  if (!versionRow) {
    db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)').run(
      'schema_version',
      String(SCHEMA_VERSION),
    );
  } else {
    const currentVersion = Number(versionRow.value);
    if (currentVersion < SCHEMA_VERSION) {
      db.prepare('UPDATE meta SET value = ? WHERE key = ?').run(
        String(SCHEMA_VERSION),
        'schema_version',
      );
    }
  }

  seedOrgNodes(db);
  seedSecretaries(db);

  const agentCount = db.prepare('SELECT COUNT(*) AS c FROM agents').get() as { c: number };
  if (agentCount.c === 0) {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO agents (
        id, name, description, system_prompt, model_override, enabled,
        org_node_id, allowed_tools_json, allowed_skills_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 1, ?, NULL, NULL, ?, ?)`,
    ).run(
      'default-agent',
      'AI Co-founder',
      'Default workspace agent for founders',
      null,
      null,
      DEFAULT_ORG_ROOT_ID,
      now,
      now,
    );
  } else {
    db.prepare(
      `UPDATE agents SET org_node_id = ? WHERE id = 'default-agent' AND org_node_id IS NULL`,
    ).run(DEFAULT_ORG_ROOT_ID);
  }

  const embeddingRow = db.prepare('SELECT id FROM embedding_config WHERE id = 1').get();
  if (!embeddingRow) {
    db.prepare(
      `INSERT INTO embedding_config (id, provider_type, model_name, api_key)
       VALUES (1, 'stub', 'text-embedding-3-small', '')`,
    ).run();
  }

  const configRow = db.prepare('SELECT id FROM llm_config WHERE id = 1').get();
  if (!configRow) {
    db.prepare(
      `INSERT INTO llm_config (id, provider_type, base_url, model_name, api_key)
       VALUES (1, 'stub', '', 'stub-mini', '')`,
    ).run();
  }

  return db;
}
