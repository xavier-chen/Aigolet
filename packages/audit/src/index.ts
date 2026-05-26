import { createHash } from 'node:crypto';
import type { AuditEvent, DomainEvent } from '@aigolet-next/protocol';
import type { EventSubscriber } from '@aigolet-next/orchestrator';

export interface AuditLedger {
  append(event: Omit<AuditEvent, 'sequence' | 'hash' | 'previousHash'>): Promise<AuditEvent>;
  getAll(limit?: number): Promise<AuditEvent[]>;
  getByCorrelation(correlationId: string): Promise<AuditEvent[]>;
  verify(): Promise<{ valid: boolean; brokenAt?: number }>;
}

export interface RedactionPolicy {
  redact(payload: Record<string, unknown>): {
    payload: Record<string, unknown>;
    redactedFields: string[];
  };
}

const SENSITIVE_KEYS = ['password', 'apiKey', 'token', 'secret', 'authorization'];

export class DefaultRedactionPolicy implements RedactionPolicy {
  redact(payload: Record<string, unknown>): {
    payload: Record<string, unknown>;
    redactedFields: string[];
  } {
    const redactedFields: string[] = [];
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(payload)) {
      if (SENSITIVE_KEYS.some((s) => key.toLowerCase().includes(s))) {
        result[key] = '[REDACTED]';
        redactedFields.push(key);
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        const nested = this.redact(value as Record<string, unknown>);
        result[key] = nested.payload;
        redactedFields.push(...nested.redactedFields.map((f) => `${key}.${f}`));
      } else {
        result[key] = value;
      }
    }
    return { payload: result, redactedFields };
  }
}

export class AppendOnlyAuditLedger implements AuditLedger {
  private events: AuditEvent[] = [];

  async append(
    event: Omit<AuditEvent, 'sequence' | 'hash' | 'previousHash'>,
  ): Promise<AuditEvent> {
    const previous = this.events.at(-1);
    const sequence = this.events.length;
    const previousHash = previous?.hash;
    const hash = this.computeHash({ ...event, sequence, previousHash });
    const stored: AuditEvent = { ...event, sequence, previousHash, hash };
    this.events.push(stored);
    return stored;
  }

  async getAll(limit = 500): Promise<AuditEvent[]> {
    return this.events.slice(-limit);
  }

  async getByCorrelation(correlationId: string): Promise<AuditEvent[]> {
    return this.events.filter((e) => e.correlation.correlationId === correlationId);
  }

  async verify(): Promise<{ valid: boolean; brokenAt?: number }> {
    let previousHash: string | undefined;
    for (let i = 0; i < this.events.length; i++) {
      const event = this.events[i];
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

  private computeHash(
    event: Omit<AuditEvent, 'hash'> & { hash?: string },
  ): string {
    const { hash: _hash, ...rest } = event;
    return createHash('sha256').update(JSON.stringify(rest)).digest('hex');
  }
}

/** Projector: domain events → tamper-evident audit ledger */
export class AuditProjector implements EventSubscriber {
  constructor(
    private readonly ledger: AuditLedger,
    private readonly redaction: RedactionPolicy = new DefaultRedactionPolicy(),
  ) {}

  async onEvent(event: DomainEvent): Promise<void> {
    const rawPayload =
      typeof event.payload === 'object' && event.payload !== null
        ? (event.payload as Record<string, unknown>)
        : { value: event.payload };

    const { payload, redactedFields } = this.redaction.redact(rawPayload);

    await this.ledger.append({
      id: crypto.randomUUID(),
      action: event.type,
      resourceType: event.aggregateType,
      resourceId: event.aggregateId,
      actor: event.actor,
      correlation: event.correlation,
      payload,
      redactedFields,
      occurredAt: event.occurredAt,
    });
  }
}

export function createAuditService(): {
  ledger: AppendOnlyAuditLedger;
  projector: AuditProjector;
} {
  const ledger = new AppendOnlyAuditLedger();
  const projector = new AuditProjector(ledger);
  return { ledger, projector };
}
