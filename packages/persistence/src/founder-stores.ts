import type { AigoletDatabase } from './database.js';
import type {
  Artifact,
  ArtifactType,
  CreateGoalInput,
  Customer,
  Decision,
  Goal,
  GoalHorizon,
  GoalStatus,
  Principle,
  Proposal,
  ProposalStatus,
  ProposalType,
  Reminder,
  Retrospective,
  Transaction,
  TransactionType,
  UpdateGoalInput,
} from './founder-types.js';

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export class SqliteGoalStore {
  constructor(private readonly db: AigoletDatabase) {}

  list(horizon?: GoalHorizon): Goal[] {
    const rows = horizon
      ? (this.db
          .prepare(`SELECT * FROM goals WHERE horizon = ? ORDER BY sort_order ASC, created_at ASC`)
          .all(horizon) as Array<Record<string, unknown>>)
      : (this.db
          .prepare(`SELECT * FROM goals ORDER BY sort_order ASC, created_at ASC`)
          .all() as Array<Record<string, unknown>>);
    return rows.map((r) => this.rowToGoal(r));
  }

  get(id: string): Goal | null {
    const row = this.db.prepare('SELECT * FROM goals WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? this.rowToGoal(row) : null;
  }

  create(input: CreateGoalInput): Goal {
    const now = new Date().toISOString();
    const goal: Goal = {
      id: crypto.randomUUID(),
      horizon: input.horizon,
      title: input.title,
      description: input.description,
      status: input.status ?? 'active',
      progress: input.progress ?? 0,
      parentId: input.parentId,
      dueDate: input.dueDate,
      sortOrder: input.sortOrder ?? 0,
      createdAt: now,
      updatedAt: now,
    };
    this.db
      .prepare(
        `INSERT INTO goals (
          id, horizon, title, description, status, progress, parent_id, due_date, sort_order, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        goal.id,
        goal.horizon,
        goal.title,
        goal.description ?? null,
        goal.status,
        goal.progress,
        goal.parentId ?? null,
        goal.dueDate ?? null,
        goal.sortOrder,
        goal.createdAt,
        goal.updatedAt,
      );
    return goal;
  }

  update(id: string, input: UpdateGoalInput): Goal | null {
    const existing = this.get(id);
    if (!existing) return null;
    const updated: Goal = {
      ...existing,
      ...input,
      parentId: input.parentId === null ? undefined : (input.parentId ?? existing.parentId),
      dueDate: input.dueDate === null ? undefined : (input.dueDate ?? existing.dueDate),
      updatedAt: new Date().toISOString(),
    };
    this.db
      .prepare(
        `UPDATE goals SET title = ?, description = ?, status = ?, progress = ?,
         parent_id = ?, due_date = ?, sort_order = ?, updated_at = ? WHERE id = ?`,
      )
      .run(
        updated.title,
        updated.description ?? null,
        updated.status,
        updated.progress,
        updated.parentId ?? null,
        updated.dueDate ?? null,
        updated.sortOrder,
        updated.updatedAt,
        id,
      );
    return updated;
  }

  delete(id: string): boolean {
    const result = this.db.prepare('DELETE FROM goals WHERE id = ?').run(id);
    return result.changes > 0;
  }

  bumpProgress(id: string, delta: number): Goal | null {
    const goal = this.get(id);
    if (!goal) return null;
    const progress = Math.min(100, Math.max(0, goal.progress + delta));
    const status: GoalStatus = progress >= 100 ? 'completed' : goal.status;
    return this.update(id, { progress, status });
  }

  private rowToGoal(row: Record<string, unknown>): Goal {
    return {
      id: row.id as string,
      horizon: row.horizon as GoalHorizon,
      title: row.title as string,
      description: (row.description as string) ?? undefined,
      status: row.status as GoalStatus,
      progress: row.progress as number,
      parentId: (row.parent_id as string) ?? undefined,
      dueDate: (row.due_date as string) ?? undefined,
      sortOrder: row.sort_order as number,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }
}

export class SqliteDecisionStore {
  constructor(private readonly db: AigoletDatabase) {}

  list(limit = 100): Decision[] {
    const rows = this.db
      .prepare(`SELECT * FROM decisions ORDER BY created_at DESC LIMIT ?`)
      .all(limit) as Array<Record<string, unknown>>;
    return rows.map((r) => this.rowToDecision(r));
  }

  listPending(): Decision[] {
    const rows = this.db
      .prepare(`SELECT * FROM decisions WHERE chosen IS NULL OR chosen = '' ORDER BY created_at DESC`)
      .all() as Array<Record<string, unknown>>;
    return rows.map((r) => this.rowToDecision(r));
  }

  get(id: string): Decision | null {
    const row = this.db.prepare('SELECT * FROM decisions WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? this.rowToDecision(row) : null;
  }

  create(input: Omit<Decision, 'id' | 'createdAt' | 'updatedAt'>): Decision {
    const now = new Date().toISOString();
    const decision: Decision = { id: crypto.randomUUID(), ...input, createdAt: now, updatedAt: now };
    this.db
      .prepare(
        `INSERT INTO decisions (
          id, title, context, options_json, chosen, rationale, assumptions, review_date, outcome, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        decision.id,
        decision.title,
        decision.context ?? null,
        JSON.stringify(decision.options ?? []),
        decision.chosen ?? null,
        decision.rationale ?? null,
        decision.assumptions ?? null,
        decision.reviewDate ?? null,
        decision.outcome ?? null,
        decision.createdAt,
        decision.updatedAt,
      );
    return decision;
  }

  update(id: string, input: Partial<Omit<Decision, 'id' | 'createdAt'>>): Decision | null {
    const existing = this.get(id);
    if (!existing) return null;
    const updated: Decision = { ...existing, ...input, updatedAt: new Date().toISOString() };
    this.db
      .prepare(
        `UPDATE decisions SET title = ?, context = ?, options_json = ?, chosen = ?, rationale = ?,
         assumptions = ?, review_date = ?, outcome = ?, updated_at = ? WHERE id = ?`,
      )
      .run(
        updated.title,
        updated.context ?? null,
        JSON.stringify(updated.options ?? []),
        updated.chosen ?? null,
        updated.rationale ?? null,
        updated.assumptions ?? null,
        updated.reviewDate ?? null,
        updated.outcome ?? null,
        updated.updatedAt,
        id,
      );
    return updated;
  }

  delete(id: string): boolean {
    return this.db.prepare('DELETE FROM decisions WHERE id = ?').run(id).changes > 0;
  }

  search(q: string, limit = 20): Decision[] {
    const pattern = `%${q}%`;
    const rows = this.db
      .prepare(
        `SELECT * FROM decisions WHERE title LIKE ? OR context LIKE ? OR rationale LIKE ?
         ORDER BY created_at DESC LIMIT ?`,
      )
      .all(pattern, pattern, pattern, limit) as Array<Record<string, unknown>>;
    return rows.map((r) => this.rowToDecision(r));
  }

  private rowToDecision(row: Record<string, unknown>): Decision {
    return {
      id: row.id as string,
      title: row.title as string,
      context: (row.context as string) ?? undefined,
      options: parseJson<string[]>(row.options_json as string, []),
      chosen: (row.chosen as string) ?? undefined,
      rationale: (row.rationale as string) ?? undefined,
      assumptions: (row.assumptions as string) ?? undefined,
      reviewDate: (row.review_date as string) ?? undefined,
      outcome: (row.outcome as string) ?? undefined,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }
}

export class SqliteCustomerStore {
  constructor(private readonly db: AigoletDatabase) {}

  list(): Customer[] {
    const rows = this.db
      .prepare(`SELECT * FROM customers ORDER BY updated_at DESC`)
      .all() as Array<Record<string, unknown>>;
    return rows.map((r) => this.rowToCustomer(r));
  }

  get(id: string): Customer | null {
    const row = this.db.prepare('SELECT * FROM customers WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? this.rowToCustomer(row) : null;
  }

  create(input: Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>): Customer {
    const now = new Date().toISOString();
    const customer: Customer = { id: crypto.randomUUID(), ...input, createdAt: now, updatedAt: now };
    this.db
      .prepare(
        `INSERT INTO customers (
          id, name, company, stage, last_contact, next_action, notes, metadata_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        customer.id,
        customer.name,
        customer.company ?? null,
        customer.stage,
        customer.lastContact ?? null,
        customer.nextAction ?? null,
        customer.notes ?? null,
        JSON.stringify(customer.metadata ?? {}),
        customer.createdAt,
        customer.updatedAt,
      );
    return customer;
  }

  update(id: string, input: Partial<Omit<Customer, 'id' | 'createdAt'>>): Customer | null {
    const existing = this.get(id);
    if (!existing) return null;
    const updated: Customer = { ...existing, ...input, updatedAt: new Date().toISOString() };
    this.db
      .prepare(
        `UPDATE customers SET name = ?, company = ?, stage = ?, last_contact = ?, next_action = ?,
         notes = ?, metadata_json = ?, updated_at = ? WHERE id = ?`,
      )
      .run(
        updated.name,
        updated.company ?? null,
        updated.stage,
        updated.lastContact ?? null,
        updated.nextAction ?? null,
        updated.notes ?? null,
        JSON.stringify(updated.metadata ?? {}),
        updated.updatedAt,
        id,
      );
    return updated;
  }

  delete(id: string): boolean {
    return this.db.prepare('DELETE FROM customers WHERE id = ?').run(id).changes > 0;
  }

  listStale(days: number): Customer[] {
    const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
    const rows = this.db
      .prepare(
        `SELECT * FROM customers WHERE last_contact IS NULL OR last_contact < ? ORDER BY last_contact ASC`,
      )
      .all(cutoff) as Array<Record<string, unknown>>;
    return rows.map((r) => this.rowToCustomer(r));
  }

  search(q: string, limit = 20): Customer[] {
    const pattern = `%${q}%`;
    const rows = this.db
      .prepare(
        `SELECT * FROM customers WHERE name LIKE ? OR company LIKE ? OR notes LIKE ?
         ORDER BY updated_at DESC LIMIT ?`,
      )
      .all(pattern, pattern, pattern, limit) as Array<Record<string, unknown>>;
    return rows.map((r) => this.rowToCustomer(r));
  }

  private rowToCustomer(row: Record<string, unknown>): Customer {
    return {
      id: row.id as string,
      name: row.name as string,
      company: (row.company as string) ?? undefined,
      stage: row.stage as string,
      lastContact: (row.last_contact as string) ?? undefined,
      nextAction: (row.next_action as string) ?? undefined,
      notes: (row.notes as string) ?? undefined,
      metadata: parseJson<Record<string, unknown>>(row.metadata_json as string, {}),
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }
}

export class SqlitePrincipleStore {
  constructor(private readonly db: AigoletDatabase) {}

  list(): Principle[] {
    const rows = this.db
      .prepare(`SELECT * FROM principles ORDER BY created_at DESC`)
      .all() as Array<Record<string, unknown>>;
    return rows.map((r) => this.rowToPrinciple(r));
  }

  create(input: Omit<Principle, 'id' | 'createdAt'>): Principle {
    const now = new Date().toISOString();
    const principle: Principle = { id: crypto.randomUUID(), ...input, createdAt: now };
    this.db
      .prepare(`INSERT INTO principles (id, category, content, created_at) VALUES (?, ?, ?, ?)`)
      .run(principle.id, principle.category, principle.content, principle.createdAt);
    return principle;
  }

  update(id: string, input: Partial<Omit<Principle, 'id' | 'createdAt'>>): Principle | null {
    const rows = this.db
      .prepare(`SELECT * FROM principles WHERE id = ?`)
      .all(id) as Array<Record<string, unknown>>;
    const existing = rows[0];
    if (!existing) return null;
    const updated: Principle = {
      id: existing.id as string,
      category: (input.category ?? existing.category) as Principle['category'],
      content: input.content ?? (existing.content as string),
      createdAt: existing.created_at as string,
    };
    this.db
      .prepare(`UPDATE principles SET category = ?, content = ? WHERE id = ?`)
      .run(updated.category, updated.content, id);
    return updated;
  }

  delete(id: string): boolean {
    return this.db.prepare('DELETE FROM principles WHERE id = ?').run(id).changes > 0;
  }

  search(q: string, limit = 20): Principle[] {
    const pattern = `%${q}%`;
    const rows = this.db
      .prepare(`SELECT * FROM principles WHERE content LIKE ? ORDER BY created_at DESC LIMIT ?`)
      .all(pattern, limit) as Array<Record<string, unknown>>;
    return rows.map((r) => this.rowToPrinciple(r));
  }

  private rowToPrinciple(row: Record<string, unknown>): Principle {
    return {
      id: row.id as string,
      category: row.category as Principle['category'],
      content: row.content as string,
      createdAt: row.created_at as string,
    };
  }
}

export class SqliteRetrospectiveStore {
  constructor(private readonly db: AigoletDatabase) {}

  list(): Retrospective[] {
    const rows = this.db
      .prepare(`SELECT * FROM retrospectives ORDER BY created_at DESC`)
      .all() as Array<Record<string, unknown>>;
    return rows.map((r) => this.rowToRetro(r));
  }

  get(id: string): Retrospective | null {
    const row = this.db.prepare('SELECT * FROM retrospectives WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? this.rowToRetro(row) : null;
  }

  create(input: Omit<Retrospective, 'id' | 'createdAt'>): Retrospective {
    const now = new Date().toISOString();
    const retro: Retrospective = { id: crypto.randomUUID(), ...input, createdAt: now };
    this.db
      .prepare(
        `INSERT INTO retrospectives (id, title, what_happened, lesson, tags_json, decision_id, goal_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        retro.id,
        retro.title,
        retro.whatHappened ?? null,
        retro.lesson ?? null,
        JSON.stringify(retro.tags ?? []),
        retro.decisionId ?? null,
        retro.goalId ?? null,
        retro.createdAt,
      );
    return retro;
  }

  update(id: string, input: Partial<Omit<Retrospective, 'id' | 'createdAt'>>): Retrospective | null {
    const existing = this.get(id);
    if (!existing) return null;
    const updated: Retrospective = {
      ...existing,
      ...input,
      decisionId: input.decisionId === null ? undefined : (input.decisionId ?? existing.decisionId),
      goalId: input.goalId === null ? undefined : (input.goalId ?? existing.goalId),
    };
    this.db
      .prepare(
        `UPDATE retrospectives SET title = ?, what_happened = ?, lesson = ?, tags_json = ?,
         decision_id = ?, goal_id = ? WHERE id = ?`,
      )
      .run(
        updated.title,
        updated.whatHappened ?? null,
        updated.lesson ?? null,
        JSON.stringify(updated.tags ?? []),
        updated.decisionId ?? null,
        updated.goalId ?? null,
        id,
      );
    return updated;
  }

  delete(id: string): boolean {
    return this.db.prepare('DELETE FROM retrospectives WHERE id = ?').run(id).changes > 0;
  }

  search(q: string, limit = 20): Retrospective[] {
    const pattern = `%${q}%`;
    const rows = this.db
      .prepare(
        `SELECT * FROM retrospectives WHERE title LIKE ? OR what_happened LIKE ? OR lesson LIKE ?
         ORDER BY created_at DESC LIMIT ?`,
      )
      .all(pattern, pattern, pattern, limit) as Array<Record<string, unknown>>;
    return rows.map((r) => this.rowToRetro(r));
  }

  private rowToRetro(row: Record<string, unknown>): Retrospective {
    return {
      id: row.id as string,
      title: row.title as string,
      whatHappened: (row.what_happened as string) ?? undefined,
      lesson: (row.lesson as string) ?? undefined,
      tags: parseJson<string[]>(row.tags_json as string, []),
      decisionId: (row.decision_id as string) ?? undefined,
      goalId: (row.goal_id as string) ?? undefined,
      createdAt: row.created_at as string,
    };
  }
}

export class SqliteArtifactStore {
  constructor(private readonly db: AigoletDatabase) {}

  list(): Artifact[] {
    const rows = this.db
      .prepare(`SELECT * FROM artifacts ORDER BY created_at DESC`)
      .all() as Array<Record<string, unknown>>;
    return rows.map((r) => this.rowToArtifact(r));
  }

  get(id: string): Artifact | null {
    const row = this.db.prepare('SELECT * FROM artifacts WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? this.rowToArtifact(row) : null;
  }

  create(input: Omit<Artifact, 'id' | 'createdAt' | 'updatedAt' | 'version'> & { version?: number }): Artifact {
    const now = new Date().toISOString();
    const artifact: Artifact = {
      id: crypto.randomUUID(),
      version: input.version ?? 1,
      ...input,
      createdAt: now,
      updatedAt: now,
    };
    this.db
      .prepare(
        `INSERT INTO artifacts (
          id, title, type, file_path, content_preview, goal_id, customer_id, version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        artifact.id,
        artifact.title,
        artifact.type,
        artifact.filePath ?? null,
        artifact.contentPreview ?? null,
        artifact.goalId ?? null,
        artifact.customerId ?? null,
        artifact.version,
        artifact.createdAt,
        artifact.updatedAt,
      );
    return artifact;
  }

  delete(id: string): boolean {
    return this.db.prepare('DELETE FROM artifacts WHERE id = ?').run(id).changes > 0;
  }

  private rowToArtifact(row: Record<string, unknown>): Artifact {
    return {
      id: row.id as string,
      title: row.title as string,
      type: row.type as ArtifactType,
      filePath: (row.file_path as string) ?? undefined,
      contentPreview: (row.content_preview as string) ?? undefined,
      goalId: (row.goal_id as string) ?? undefined,
      customerId: (row.customer_id as string) ?? undefined,
      version: row.version as number,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }
}

export class SqliteTransactionStore {
  constructor(private readonly db: AigoletDatabase) {}

  list(limit = 500): Transaction[] {
    const rows = this.db
      .prepare(`SELECT * FROM transactions ORDER BY date DESC LIMIT ?`)
      .all(limit) as Array<Record<string, unknown>>;
    return rows.map((r) => this.rowToTransaction(r));
  }

  create(input: Omit<Transaction, 'id' | 'createdAt'>): Transaction {
    const now = new Date().toISOString();
    const tx: Transaction = { id: crypto.randomUUID(), ...input, createdAt: now };
    this.db
      .prepare(
        `INSERT INTO transactions (
          id, type, amount, currency, category, description, date, recurring, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        tx.id,
        tx.type,
        tx.amount,
        tx.currency,
        tx.category ?? null,
        tx.description ?? null,
        tx.date,
        tx.recurring ? 1 : 0,
        tx.createdAt,
      );
    return tx;
  }

  delete(id: string): boolean {
    return this.db.prepare('DELETE FROM transactions WHERE id = ?').run(id).changes > 0;
  }

  private rowToTransaction(row: Record<string, unknown>): Transaction {
    return {
      id: row.id as string,
      type: row.type as TransactionType,
      amount: row.amount as number,
      currency: row.currency as string,
      category: (row.category as string) ?? undefined,
      description: (row.description as string) ?? undefined,
      date: row.date as string,
      recurring: Boolean(row.recurring),
      createdAt: row.created_at as string,
    };
  }
}

export class SqliteReminderStore {
  constructor(private readonly db: AigoletDatabase) {}

  list(): Reminder[] {
    const rows = this.db
      .prepare(`SELECT * FROM reminders ORDER BY due_date ASC`)
      .all() as Array<Record<string, unknown>>;
    return rows.map((r) => this.rowToReminder(r));
  }

  create(input: Omit<Reminder, 'id' | 'createdAt'>): Reminder {
    const now = new Date().toISOString();
    const reminder: Reminder = { id: crypto.randomUUID(), ...input, createdAt: now };
    this.db
      .prepare(
        `INSERT INTO reminders (id, title, due_date, category, notes, completed, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        reminder.id,
        reminder.title,
        reminder.dueDate,
        reminder.category ?? null,
        reminder.notes ?? null,
        reminder.completed ? 1 : 0,
        reminder.createdAt,
      );
    return reminder;
  }

  update(id: string, input: Partial<Omit<Reminder, 'id' | 'createdAt'>>): Reminder | null {
    const existing = this.list().find((r) => r.id === id);
    if (!existing) return null;
    const updated = { ...existing, ...input };
    this.db
      .prepare(
        `UPDATE reminders SET title = ?, due_date = ?, category = ?, notes = ?, completed = ? WHERE id = ?`,
      )
      .run(
        updated.title,
        updated.dueDate,
        updated.category ?? null,
        updated.notes ?? null,
        updated.completed ? 1 : 0,
        id,
      );
    return updated;
  }

  listUpcoming(days = 30): Reminder[] {
    const now = new Date().toISOString();
    const end = new Date(Date.now() + days * 86_400_000).toISOString();
    const rows = this.db
      .prepare(
        `SELECT * FROM reminders WHERE completed = 0 AND due_date >= ? AND due_date <= ? ORDER BY due_date ASC`,
      )
      .all(now, end) as Array<Record<string, unknown>>;
    return rows.map((r) => this.rowToReminder(r));
  }

  private rowToReminder(row: Record<string, unknown>): Reminder {
    return {
      id: row.id as string,
      title: row.title as string,
      dueDate: row.due_date as string,
      category: (row.category as string) ?? undefined,
      notes: (row.notes as string) ?? undefined,
      completed: Boolean(row.completed),
      createdAt: row.created_at as string,
    };
  }
}

export class SqliteProposalStore {
  constructor(private readonly db: AigoletDatabase) {}

  list(status?: ProposalStatus): Proposal[] {
    const rows = status
      ? (this.db
          .prepare(`SELECT * FROM proposals WHERE status = ? ORDER BY created_at DESC`)
          .all(status) as Array<Record<string, unknown>>)
      : (this.db
          .prepare(`SELECT * FROM proposals ORDER BY created_at DESC`)
          .all() as Array<Record<string, unknown>>);
    return rows.map((r) => this.rowToProposal(r));
  }

  get(id: string): Proposal | null {
    const row = this.db.prepare('SELECT * FROM proposals WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? this.rowToProposal(row) : null;
  }

  create(input: Omit<Proposal, 'id' | 'createdAt' | 'updatedAt' | 'status'> & { status?: ProposalStatus }): Proposal {
    const now = new Date().toISOString();
    const proposal: Proposal = {
      id: crypto.randomUUID(),
      status: input.status ?? 'pending',
      ...input,
      createdAt: now,
      updatedAt: now,
    };
    this.db
      .prepare(
        `INSERT INTO proposals (
          id, type, title, body, status, related_customer_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        proposal.id,
        proposal.type,
        proposal.title,
        proposal.body ?? null,
        proposal.status,
        proposal.relatedCustomerId ?? null,
        proposal.createdAt,
        proposal.updatedAt,
      );
    return proposal;
  }

  updateStatus(id: string, status: ProposalStatus): Proposal | null {
    const existing = this.get(id);
    if (!existing) return null;
    const updatedAt = new Date().toISOString();
    this.db
      .prepare(`UPDATE proposals SET status = ?, updated_at = ? WHERE id = ?`)
      .run(status, updatedAt, id);
    return { ...existing, status, updatedAt };
  }

  private rowToProposal(row: Record<string, unknown>): Proposal {
    return {
      id: row.id as string,
      type: row.type as ProposalType,
      title: row.title as string,
      body: (row.body as string) ?? undefined,
      status: row.status as ProposalStatus,
      relatedCustomerId: (row.related_customer_id as string) ?? undefined,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }
}

export class SqliteFounderSettingsStore {
  constructor(private readonly db: AigoletDatabase) {}

  getBalance(): number {
    const row = this.db.prepare(`SELECT value FROM meta WHERE key = ?`).get('founder_balance') as
      | { value: string }
      | undefined;
    return row ? Number(row.value) || 0 : 0;
  }

  setBalance(amount: number): void {
    this.db
      .prepare(
        `INSERT INTO meta (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run('founder_balance', String(amount));
  }

  getCurrency(): string {
    const row = this.db.prepare(`SELECT value FROM meta WHERE key = ?`).get('founder_currency') as
      | { value: string }
      | undefined;
    return row?.value ?? 'CNY';
  }

  setCurrency(currency: string): void {
    this.db
      .prepare(
        `INSERT INTO meta (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run('founder_currency', currency);
  }

  getTodayCache(): string | null {
    const row = this.db.prepare(`SELECT value FROM meta WHERE key = ?`).get('founder_today_cache') as
      | { value: string }
      | undefined;
    return row?.value ?? null;
  }

  setTodayCache(json: string): void {
    this.db
      .prepare(
        `INSERT INTO meta (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run('founder_today_cache', json);
  }
}

export interface FounderStores {
  goalStore: SqliteGoalStore;
  decisionStore: SqliteDecisionStore;
  customerStore: SqliteCustomerStore;
  principleStore: SqlitePrincipleStore;
  retrospectiveStore: SqliteRetrospectiveStore;
  artifactStore: SqliteArtifactStore;
  transactionStore: SqliteTransactionStore;
  reminderStore: SqliteReminderStore;
  proposalStore: SqliteProposalStore;
  settingsStore: SqliteFounderSettingsStore;
}

export function createFounderStores(db: AigoletDatabase): FounderStores {
  return {
    goalStore: new SqliteGoalStore(db),
    decisionStore: new SqliteDecisionStore(db),
    customerStore: new SqliteCustomerStore(db),
    principleStore: new SqlitePrincipleStore(db),
    retrospectiveStore: new SqliteRetrospectiveStore(db),
    artifactStore: new SqliteArtifactStore(db),
    transactionStore: new SqliteTransactionStore(db),
    reminderStore: new SqliteReminderStore(db),
    proposalStore: new SqliteProposalStore(db),
    settingsStore: new SqliteFounderSettingsStore(db),
  };
}
