import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadSkillMarkdown, buildSkillsSystemBlock } from './skills.js';

describe('skills runtime', () => {
  it('parses frontmatter and body from SKILL.md content', () => {
    const raw = `---
description: Test skill
allowed_tools: [read_file, remember]
---
# Instructions

Do the thing.`;

    const parsed = loadSkillMarkdown(raw);
    assert.equal(parsed.description, 'Test skill');
    assert.deepEqual(parsed.allowedTools, ['read_file', 'remember']);
    assert.match(parsed.content, /Do the thing/);
  });

  it('builds system block with full skill instructions', () => {
    const block = buildSkillsSystemBlock([
      {
        id: '1',
        name: 'Founder Ops',
        description: 'Operations playbook',
        content: 'Always prioritize revenue-generating tasks.',
        slug: 'founder_ops',
      },
    ]);

    assert.match(block, /Active Skills/);
    assert.match(block, /Founder Ops/);
    assert.match(block, /revenue-generating/);
  });
});
