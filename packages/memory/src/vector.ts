/** Cosine similarity between two equal-length vectors */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dot / denom;
}

/** Deterministic stub embedding from text (for local dev without API) */
export function stubEmbed(text: string, dimensions = 64): number[] {
  const vec = new Array<number>(dimensions).fill(0);
  const normalized = text.toLowerCase().trim();
  if (!normalized) return vec;

  for (let i = 0; i < normalized.length; i++) {
    const code = normalized.charCodeAt(i);
    vec[i % dimensions] += (code % 97) / 97;
  }

  const tokens = normalized.split(/\s+/);
  for (const token of tokens) {
    let hash = 0;
    for (let i = 0; i < token.length; i++) {
      hash = (hash * 31 + token.charCodeAt(i)) >>> 0;
    }
    vec[hash % dimensions] += 1;
  }

  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
  if (norm === 0) return vec;
  return vec.map((v) => v / norm);
}

export interface SemanticSearchResult<T> {
  item: T;
  score: number;
}

/** Rank items by cosine similarity to query embedding */
export function rankBySimilarity<T>(
  queryEmbedding: number[],
  items: Array<{ item: T; embedding?: number[] }>,
  limit = 10,
): SemanticSearchResult<T>[] {
  const scored: SemanticSearchResult<T>[] = [];

  for (const { item, embedding } of items) {
    if (!embedding?.length) continue;
    scored.push({ item, score: cosineSimilarity(queryEmbedding, embedding) });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}
