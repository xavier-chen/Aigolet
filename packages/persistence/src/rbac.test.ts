import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { MemoryRecord } from '@aigolet-next/protocol';
import { ORG_RANK } from '@aigolet-next/protocol';
import {
  canAccessVisibility,
  computeSessionVisibility,
  filterMemoriesByRank,
} from './rbac.js';

describe('canAccessVisibility', () => {
  it('allows equal or higher rank viewers', () => {
    assert.equal(canAccessVisibility(ORG_RANK.FOUNDER, ORG_RANK.FOUNDER), true);
    assert.equal(canAccessVisibility(ORG_RANK.FOUNDER, ORG_RANK.STAFF), true);
    assert.equal(canAccessVisibility(ORG_RANK.PARTNER, ORG_RANK.FOUNDER), false);
    assert.equal(canAccessVisibility(ORG_RANK.STAFF, ORG_RANK.MANAGER), false);
  });
});

describe('computeSessionVisibility', () => {
  it('uses max participant rank', () => {
    assert.equal(
      computeSessionVisibility([ORG_RANK.STAFF, ORG_RANK.PARTNER]),
      ORG_RANK.PARTNER,
    );
    assert.equal(computeSessionVisibility([]), ORG_RANK.STAFF);
  });
});

describe('filterMemoriesByRank', () => {
  const base: MemoryRecord = {
    id: 'm1',
    kind: 'semantic',
    namespace: { tenantId: 'default', userId: 'founder' },
    content: 'test',
    createdAt: new Date().toISOString(),
  };

  it('filters high-visibility memories from low-rank viewers', () => {
    const records: MemoryRecord[] = [
      { ...base, id: 'a', metadata: { visibilityLevel: ORG_RANK.FOUNDER } },
      { ...base, id: 'b', metadata: { visibilityLevel: ORG_RANK.STAFF } },
      { ...base, id: 'c' },
    ];
    const filtered = filterMemoriesByRank(records, ORG_RANK.STAFF);
    assert.deepEqual(
      filtered.map((r) => r.id),
      ['b', 'c'],
    );
  });
});
