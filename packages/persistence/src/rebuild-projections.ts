import { AuditProjector, DefaultRedactionPolicy } from '@aigolet-next/audit';
import { MemoryProjector } from '@aigolet-next/memory';
import type { AigoletDatabase } from './database.js';
import {
  SqliteAuditLedger,
  SqliteEventStore,
  SqliteMemoryStore,
} from './index.js';

export interface RebuildProjectionsOptions {
  dryRun?: boolean;
}

export interface RebuildProjectionsResult {
  dryRun: boolean;
  domainEventsReplayed: number;
  auditEventsBefore: number;
  auditEventsAfter: number;
  memoryRecordsBefore: number;
  memoryRecordsAfter: number;
}

export async function rebuildProjections(
  db: AigoletDatabase,
  options: RebuildProjectionsOptions = {},
): Promise<RebuildProjectionsResult> {
  const dryRun = options.dryRun ?? false;
  const eventStore = new SqliteEventStore(db);
  const memoryStore = new SqliteMemoryStore(db);
  const auditLedger = new SqliteAuditLedger(db);

  const auditBefore =
    (db.prepare('SELECT COUNT(*) AS c FROM audit_events').get() as { c: number }).c;
  const memoryBefore =
    (db.prepare('SELECT COUNT(*) AS c FROM memory_records').get() as { c: number }).c;

  const events = await eventStore.getAll(100_000);

  if (dryRun) {
    return {
      dryRun: true,
      domainEventsReplayed: events.length,
      auditEventsBefore: auditBefore,
      auditEventsAfter: auditBefore,
      memoryRecordsBefore: memoryBefore,
      memoryRecordsAfter: memoryBefore,
    };
  }

  db.exec('DELETE FROM audit_events');
  db.exec('DELETE FROM memory_records');

  const memoryProjector = new MemoryProjector(memoryStore);
  const auditProjector = new AuditProjector(auditLedger, new DefaultRedactionPolicy());

  for (const event of events) {
    await auditProjector.onEvent(event);
    await memoryProjector.onEvent(event);
  }

  const auditAfter =
    (db.prepare('SELECT COUNT(*) AS c FROM audit_events').get() as { c: number }).c;
  const memoryAfter =
    (db.prepare('SELECT COUNT(*) AS c FROM memory_records').get() as { c: number }).c;

  return {
    dryRun: false,
    domainEventsReplayed: events.length,
    auditEventsBefore: auditBefore,
    auditEventsAfter: auditAfter,
    memoryRecordsBefore: memoryBefore,
    memoryRecordsAfter: memoryAfter,
  };
}
