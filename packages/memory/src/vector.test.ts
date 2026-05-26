import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cosineSimilarity, rankBySimilarity, stubEmbed } from './vector.js';

describe('vector search', () => {
  it('computes cosine similarity for identical vectors', () => {
    const v = [1, 0, 0];
    assert.equal(cosineSimilarity(v, v), 1);
  });

  it('ranks semantically related stub embeddings higher', () => {
    const query = stubEmbed('product roadmap planning');
    const items = [
      { item: 'a', embedding: stubEmbed('product roadmap planning for startup') },
      { item: 'b', embedding: stubEmbed('unrelated weather forecast today') },
    ];
    const ranked = rankBySimilarity(query, items, 2);
    assert.equal(ranked[0]?.item, 'a');
    assert.ok((ranked[0]?.score ?? 0) > (ranked[1]?.score ?? 0));
  });

  it('stub embed is deterministic', () => {
    assert.deepEqual(stubEmbed('hello world'), stubEmbed('hello world'));
  });
});
