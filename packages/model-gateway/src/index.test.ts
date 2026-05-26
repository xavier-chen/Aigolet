import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseAssistantMessageFromApi,
  serializeModelMessageForApi,
  type ModelMessage,
} from './index.js';

describe('reasoning_content round-trip', () => {
  it('serializes assistant reasoning_content for API requests', () => {
    const message: ModelMessage = {
      role: 'assistant',
      content: 'Final answer',
      reasoning_content: 'Let me think step by step…',
    };

    const serialized = serializeModelMessageForApi(message);
    assert.equal(serialized.role, 'assistant');
    assert.equal(serialized.content, 'Final answer');
    assert.equal(serialized.reasoning_content, 'Let me think step by step…');
  });

  it('omits reasoning_content when absent', () => {
    const serialized = serializeModelMessageForApi({
      role: 'user',
      content: 'Hello',
    });
    assert.equal('reasoning_content' in serialized, false);
  });

  it('parses reasoning_content from assistant API responses', () => {
    const result = parseAssistantMessageFromApi({
      content: 'Done',
      reasoning_content: 'Internal chain of thought',
    });
    assert.equal(result.content, 'Done');
    assert.equal(result.reasoningContent, 'Internal chain of thought');
    assert.equal(result.finishReason, 'stop');
  });

  it('preserves reasoning_content on tool-call assistant messages', () => {
    const result = parseAssistantMessageFromApi({
      content: '',
      reasoning_content: 'Need to call a tool',
      tool_calls: [
        {
          id: 'call_1',
          function: { name: 'get_time', arguments: '{}' },
        },
      ],
    });
    assert.equal(result.finishReason, 'tool_calls');
    assert.equal(result.reasoningContent, 'Need to call a tool');
    assert.deepEqual(result.toolCalls, [
      { id: 'call_1', name: 'get_time', arguments: '{}' },
    ]);
  });

  it('round-trips assistant history for follow-up requests', () => {
    const apiResponse = parseAssistantMessageFromApi({
      content: 'The time is noon.',
      reasoning_content: 'User asked about time; I should answer directly.',
    });

    const history: ModelMessage[] = [
      { role: 'user', content: 'What time is it?' },
      {
        role: 'assistant',
        content: apiResponse.content,
        reasoning_content: apiResponse.reasoningContent,
      },
      { role: 'user', content: 'Thanks!' },
    ];

    const payload = history.map(serializeModelMessageForApi);
    const assistantTurn = payload[1] as Record<string, unknown>;
    assert.equal(assistantTurn.reasoning_content, 'User asked about time; I should answer directly.');
    assert.equal(assistantTurn.content, 'The time is noon.');
  });
});
