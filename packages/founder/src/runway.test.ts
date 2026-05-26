import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeRunwaySummary } from './runway.js';
import type { Transaction } from './types.js';

describe('computeRunwaySummary', () => {
  it('computes months remaining from balance and burn', () => {
    const txs: Transaction[] = [
      {
        id: '1',
        type: 'expense',
        amount: 3000,
        currency: 'CNY',
        date: new Date().toISOString().slice(0, 10),
        recurring: true,
        createdAt: new Date().toISOString(),
      },
      {
        id: '2',
        type: 'income',
        amount: 1000,
        currency: 'CNY',
        date: new Date().toISOString().slice(0, 10),
        recurring: true,
        createdAt: new Date().toISOString(),
      },
    ];
    const summary = computeRunwaySummary(12000, 'CNY', txs);
    assert.equal(summary.netBurn, 2000);
    assert.equal(summary.monthsRemaining, 6);
    assert.equal(summary.lowRunway, false);
  });

  it('flags low runway under 6 months', () => {
    const txs: Transaction[] = [
      {
        id: '1',
        type: 'expense',
        amount: 5000,
        currency: 'CNY',
        date: new Date().toISOString().slice(0, 10),
        recurring: true,
        createdAt: new Date().toISOString(),
      },
    ];
    const summary = computeRunwaySummary(10000, 'CNY', txs);
    assert.equal(summary.lowRunway, true);
    assert.equal(summary.monthsRemaining, 2);
  });
});
