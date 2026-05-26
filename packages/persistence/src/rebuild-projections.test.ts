import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createOrchestrator } from '@aigolet-next/orchestrator';
import { createActor } from '@aigolet-next/protocol';
import { AuditProjector, DefaultRedactionPolicy } from '@aigolet-next/audit';
import { MemoryProjector, MemoryService } from '@aigolet-next/memory';
import { createPersistentStores } from './index.js';
import { rebuildProjections } from './rebuild-projections.js';

describe('rebuild projections', () => {
  let tempDir: string;
  let dbPath: string;

  before(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'aigolet-rebuild-'));
    dbPath = join(tempDir, 'test.db');
  });

  after(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('dry-run does not mutate projections', async () => {
    const stores = createPersistentStores(dbPath);
    const orchestrator = createOrchestrator({
      eventStore: stores.eventStore,
      runRepo: stores.runRepo,
      sessionRepo: stores.sessionRepo,
      sessionMessageRepo: stores.sessionMessageRepo,
      subscribers: [
        new AuditProjector(stores.auditLedger, new DefaultRedactionPolicy()),
        new MemoryProjector(stores.memoryStore),
      ],
    });

    const session = await orchestrator.createSession({
      agentId: 'default-agent',
      title: 'Test',
      namespace: { tenantId: 't', userId: 'u' },
    });
    await orchestrator.createRun(
      { sessionId: session.id, agentId: 'default-agent', payload: { message: 'hi' } },
      createActor('user', 'u'),
    );

    const memoryService = new MemoryService(stores.memoryStore);
    await memoryService.remember({ tenantId: 't', userId: 'u' }, 'hello memory', 'semantic');

    const beforeAudit = (stores.db.prepare('SELECT COUNT(*) AS c FROM audit_events').get() as { c: number }).c;
    const dry = await rebuildProjections(stores.db, { dryRun: true });
    const afterAudit = (stores.db.prepare('SELECT COUNT(*) AS c FROM audit_events').get() as { c: number }).c;

    assert.equal(dry.dryRun, true);
    assert.ok(dry.domainEventsReplayed > 0);
    assert.equal(beforeAudit, afterAudit);
    stores.db.close();
  });

  it('rebuild clears and replays audit from domain events', async () => {
    const stores = createPersistentStores(dbPath);
    stores.db.exec('DELETE FROM audit_events');

    const result = await rebuildProjections(stores.db);
    assert.equal(result.dryRun, false);
    assert.ok(result.auditEventsAfter > 0);
    stores.db.close();
  });
});
