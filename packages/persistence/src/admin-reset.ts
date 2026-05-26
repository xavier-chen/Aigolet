import type { AigoletDatabase } from './database.js';

export interface ResetCounts {
  memoryRecords: number;
  sessionMessages: number;
  sessions: number;
  runs: number;
  domainEvents: number;
}

function deleteCount(db: AigoletDatabase, sql: string): number {
  return Number(db.prepare(sql).run().changes);
}

export function resetMemoryRecords(db: AigoletDatabase): number {
  return deleteCount(db, 'DELETE FROM memory_records');
}

export function resetConversations(db: AigoletDatabase): ResetCounts {
  const sessionMessages = deleteCount(db, 'DELETE FROM session_messages');
  const runs = deleteCount(db, 'DELETE FROM runs');
  const sessions = deleteCount(db, 'DELETE FROM sessions');
  const domainEvents = deleteCount(
    db,
    `DELETE FROM domain_events WHERE aggregate_type IN ('run', 'session')`,
  );
  db.prepare(`DELETE FROM meta WHERE key = 'default_session_id'`).run();
  return { memoryRecords: 0, sessionMessages, sessions, runs, domainEvents };
}

export function resetAllApplicationData(db: AigoletDatabase): ResetCounts {
  const memoryRecords = resetMemoryRecords(db);
  const conversations = resetConversations(db);
  return { ...conversations, memoryRecords };
}
