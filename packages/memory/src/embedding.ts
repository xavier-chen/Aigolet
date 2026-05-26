import type { EmbeddingConfig } from '@aigolet-next/protocol';
import { stubEmbed } from './vector.js';

export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
}

export class StubEmbeddingProvider implements EmbeddingProvider {
  async embed(text: string): Promise<number[]> {
    return stubEmbed(text);
  }
}

export class OpenAiEmbeddingProvider implements EmbeddingProvider {
  constructor(
    private readonly apiKey: string,
    private readonly modelName: string,
  ) {}

  async embed(text: string): Promise<number[]> {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.modelName,
        input: text.slice(0, 8000),
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`OpenAI embeddings failed (${res.status}): ${body}`);
    }

    const data = (await res.json()) as {
      data?: Array<{ embedding?: number[] }>;
    };
    const embedding = data.data?.[0]?.embedding;
    if (!embedding?.length) {
      throw new Error('OpenAI embeddings returned empty vector');
    }
    return embedding;
  }
}

export function createEmbeddingProvider(config: EmbeddingConfig): EmbeddingProvider {
  if (config.providerType === 'openai') {
    if (!config.apiKey) {
      throw new Error('OpenAI embedding API key is required');
    }
    return new OpenAiEmbeddingProvider(config.apiKey, config.modelName);
  }
  return new StubEmbeddingProvider();
}
