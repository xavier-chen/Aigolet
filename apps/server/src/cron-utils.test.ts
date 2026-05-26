import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeNextRun, cronMatches, validateCronExpression } from './cron-utils.js';

describe('cron utils', () => {
  it('validates 5-field cron expressions', () => {
    assert.equal(validateCronExpression('0 9 * * *').valid, true);
    assert.equal(validateCronExpression('invalid').valid, false);
  });

  it('matches daily 9am schedule', () => {
    const date = new Date('2026-05-25T09:00:00');
    assert.equal(cronMatches(date, '0 9 * * *'), true);
    assert.equal(cronMatches(new Date('2026-05-25T10:00:00'), '0 9 * * *'), false);
  });

  it('computes next run after reference time', () => {
    const from = new Date('2026-05-25T08:30:00');
    const next = computeNextRun('0 9 * * *', from);
    assert.ok(next);
    assert.equal(next!.getHours(), 9);
    assert.equal(next!.getMinutes(), 0);
  });
});
