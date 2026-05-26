import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryToolRegistry } from '@aigolet-next/tools';
import { openDatabase } from '@aigolet-next/persistence';
import { createFounderStores } from '@aigolet-next/persistence';
import { registerFounderTools } from './founder-service.js';

describe('registerFounderTools', () => {
  it('registers brain and finance tools', () => {
    const db = openDatabase(':memory:');
    const stores = createFounderStores(db);
    const registry = new InMemoryToolRegistry();
    registerFounderTools(registry, { stores, workspaceDir: '/tmp' });

    const ids = registry.list().map((d) => d.id);
    assert.ok(ids.includes('record_decision'));
    assert.ok(ids.includes('update_customer'));
    assert.ok(ids.includes('recall_brain'));
    assert.ok(ids.includes('save_artifact'));
    assert.ok(ids.includes('record_transaction'));
    assert.ok(ids.includes('get_runway_summary'));
  });
});
