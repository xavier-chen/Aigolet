import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createPersistentStores } from './index.js';
import { createOrchestrator } from '@aigolet-next/orchestrator';
import { createActor } from '@aigolet-next/protocol';

describe('sqlite persistence', () => {
  let tempDir: string;
  let dbPath: string;

  before(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'aigolet-test-'));
    dbPath = join(tempDir, 'test.db');
  });

  after(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('persists runs and domain events across store reopen', async () => {
    const stores1 = createPersistentStores(dbPath);
    const orchestrator1 = createOrchestrator({
      eventStore: stores1.eventStore,
      runRepo: stores1.runRepo,
      sessionRepo: stores1.sessionRepo,
      sessionMessageRepo: stores1.sessionMessageRepo,
    });

    const session = await orchestrator1.createSession({
      agentId: 'agent-1',
      title: 'Test',
      namespace: { tenantId: 't', userId: 'u' },
    });

    const run = await orchestrator1.createRun({
      sessionId: session.id,
      agentId: 'agent-1',
      payload: { message: 'hello' },
    }, createActor('user', 'u1'));

    await orchestrator1.transitionRun(run.id, 'running', undefined, createActor('agent', 'agent-1'));
    await orchestrator1.appendRunEvent(run.id, 'tool.invoked', { toolId: 'echo' }, createActor('agent', 'agent-1'));
    stores1.db.close();

    const stores2 = createPersistentStores(dbPath);
    const loadedRun = await stores2.runRepo.get(run.id);
    const events = await stores2.eventStore.getByAggregate(run.id);
    stores2.db.close();

    assert.ok(loadedRun);
    assert.equal(loadedRun?.status, 'running');
    assert.ok(events.some((e) => e.type === 'tool.invoked'));
  });

  it('persists llm config and skills', () => {
    const stores = createPersistentStores(dbPath);
    stores.llmConfigStore.set({
      providerType: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      modelName: 'gpt-4o-mini',
      apiKey: 'test-key',
    });

    const skill = stores.skillStore.create({
      name: 'Test Skill',
      source: 'inline',
      content: '# Skill\nDo work',
      enabled: true,
    });

    const config = stores.llmConfigStore.get();
    const skills = stores.skillStore.list();
    stores.db.close();

    assert.equal(config.modelName, 'gpt-4o-mini');
    assert.equal(config.apiKey, 'test-key');
    assert.ok(skills.some((s) => s.id === skill.id));
  });
});
