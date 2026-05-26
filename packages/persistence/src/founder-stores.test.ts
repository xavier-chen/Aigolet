import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from './database.js';
import { createFounderStores } from './founder-stores.js';

describe('founder stores CRUD', () => {
  let db: ReturnType<typeof openDatabase>;

  before(() => {
    db = openDatabase(':memory:');
  });

  after(() => {
    db.close();
  });

  const stores = () => createFounderStores(db);

  it('decisions CRUD and search', () => {
    const { decisionStore } = stores();
    const created = decisionStore.create({
      title: 'Choose pricing model',
      context: 'SaaS vs usage',
      options: ['flat', 'usage'],
      chosen: 'flat',
      rationale: 'Predictable revenue',
      reviewDate: '2026-06-01',
    });
    assert.ok(created.id);

    const listed = decisionStore.list();
    assert.equal(listed.length, 1);

    const updated = decisionStore.update(created.id, { outcome: 'Working well' });
    assert.equal(updated?.outcome, 'Working well');

    const hits = decisionStore.search('pricing');
    assert.equal(hits.length, 1);

    assert.ok(decisionStore.delete(created.id));
    assert.equal(decisionStore.list().length, 0);
  });

  it('customers CRUD, stale list, search', () => {
    const { customerStore } = stores();
    const created = customerStore.create({
      name: 'Alice',
      company: 'Acme',
      stage: 'lead',
      lastContact: '2020-01-01T00:00:00.000Z',
      nextAction: 'Send proposal',
      notes: 'Warm intro',
    });
    assert.ok(created.id);

    const stale = customerStore.listStale(7);
    assert.ok(stale.some((c) => c.id === created.id));

    const updated = customerStore.update(created.id, {
      stage: 'negotiating',
      lastContact: new Date().toISOString(),
    });
    assert.equal(updated?.stage, 'negotiating');

    const hits = customerStore.search('Acme');
    assert.equal(hits.length, 1);

    assert.ok(customerStore.delete(created.id));
  });

  it('principles CRUD and search', () => {
    const { principleStore } = stores();
    const created = principleStore.create({ category: 'product', content: 'Ship weekly' });
    assert.ok(created.id);

    const updated = principleStore.update(created.id, { content: 'Ship every week' });
    assert.equal(updated?.content, 'Ship every week');

    const hits = principleStore.search('every');
    assert.equal(hits.length, 1);

    assert.ok(principleStore.delete(created.id));
  });

  it('retrospectives CRUD, links, search', () => {
    const { retrospectiveStore } = stores();
    const created = retrospectiveStore.create({
      title: 'Launch retro',
      whatHappened: 'Missed deadline',
      lesson: 'Scope smaller',
      tags: ['launch'],
      decisionId: 'dec-1',
    });
    assert.ok(created.id);
    assert.equal(created.decisionId, 'dec-1');

    const updated = retrospectiveStore.update(created.id, { goalId: 'goal-1' });
    assert.equal(updated?.goalId, 'goal-1');

    const hits = retrospectiveStore.search('deadline');
    assert.equal(hits.length, 1);

    assert.ok(retrospectiveStore.delete(created.id));
  });
});
