import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseGoalBreakdownResponse } from './goal-breakdown-parser.js';

describe('parseGoalBreakdownResponse', () => {
  it('parses JSON array from LLM output', () => {
    const raw = `Here are tasks:
[{"title":"联系3个潜在客户","description":"冷启动","dueDate":"2026-05-30"}]`;
    const tasks = parseGoalBreakdownResponse(raw);
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].title, '联系3个潜在客户');
    assert.equal(tasks[0].dueDate, '2026-05-30');
  });

  it('falls back to line parsing', () => {
    const raw = `- 完成产品 demo
- 更新定价页
2. 写周报`;
    const tasks = parseGoalBreakdownResponse(raw);
    assert.equal(tasks.length, 3);
    assert.equal(tasks[0].title, '完成产品 demo');
  });
});
