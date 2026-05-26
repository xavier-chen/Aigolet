import type { LlmProviderConfig } from '@aigolet-next/protocol';

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface ModelMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  /** Thinking/reasoning trace from models like DeepSeek reasoner or Qwen thinking mode */
  reasoning_content?: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export interface ModelToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters?: Record<string, unknown>;
  };
}

export interface ModelCompletionRequest {
  modelId: string;
  messages: ModelMessage[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  tools?: ModelToolDefinition[];
}

export interface ModelCompletionResult {
  content: string;
  reasoningContent?: string;
  toolCalls?: ToolCall[];
  finishReason?: 'stop' | 'tool_calls';
}

export interface ModelCompletionChunk {
  delta: string;
  /** Incremental reasoning/thinking content from streaming APIs */
  reasoningDelta?: string;
  done: boolean;
}

export interface ModelProvider {
  id: string;
  name: string;
  models: string[];
  complete(request: ModelCompletionRequest): Promise<string>;
  completeStructured?(request: ModelCompletionRequest): Promise<ModelCompletionResult>;
  stream?(request: ModelCompletionRequest): AsyncIterable<ModelCompletionChunk>;
}

export interface ModelGateway {
  registerProvider(provider: ModelProvider): void;
  getProvider(providerId: string): ModelProvider | null;
  listProviders(): ModelProvider[];
  setDefaultProvider(providerId: string): void;
  getDefaultProviderId(): string | undefined;
  complete(request: ModelCompletionRequest & { providerId?: string }): Promise<string>;
  completeStructured(
    request: ModelCompletionRequest & { providerId?: string },
  ): Promise<ModelCompletionResult>;
  stream(
    request: ModelCompletionRequest & { providerId?: string },
  ): AsyncIterable<ModelCompletionChunk>;
}

export class DefaultModelGateway implements ModelGateway {
  private providers = new Map<string, ModelProvider>();
  private defaultProviderId?: string;

  registerProvider(provider: ModelProvider): void {
    this.providers.set(provider.id, provider);
    if (!this.defaultProviderId) {
      this.defaultProviderId = provider.id;
    }
  }

  getProvider(providerId: string): ModelProvider | null {
    return this.providers.get(providerId) ?? null;
  }

  listProviders(): ModelProvider[] {
    return [...this.providers.values()];
  }

  setDefaultProvider(providerId: string): void {
    if (!this.providers.has(providerId)) {
      throw new Error(`Provider not found: ${providerId}`);
    }
    this.defaultProviderId = providerId;
  }

  getDefaultProviderId(): string | undefined {
    return this.defaultProviderId;
  }

  async complete(
    request: ModelCompletionRequest & { providerId?: string },
  ): Promise<string> {
    const result = await this.completeStructured(request);
    return result.content;
  }

  async completeStructured(
    request: ModelCompletionRequest & { providerId?: string },
  ): Promise<ModelCompletionResult> {
    const providerId = request.providerId ?? this.defaultProviderId;
    if (!providerId) throw new Error('No model provider registered');
    const provider = this.providers.get(providerId);
    if (!provider) throw new Error(`Provider not found: ${providerId}`);

    if (provider.completeStructured) {
      return provider.completeStructured(request);
    }

    const content = await provider.complete(request);
    return { content, finishReason: 'stop' };
  }

  async *stream(
    request: ModelCompletionRequest & { providerId?: string },
  ): AsyncIterable<ModelCompletionChunk> {
    const providerId = request.providerId ?? this.defaultProviderId;
    if (!providerId) throw new Error('No model provider registered');
    const provider = this.providers.get(providerId);
    if (!provider) throw new Error(`Provider not found: ${providerId}`);

    if (provider.stream) {
      yield* provider.stream(request);
      return;
    }

    const result = await this.completeStructured(request);
    if (result.reasoningContent) {
      const reasoningParts = result.reasoningContent.match(/\S+\s*|\s+/g) ?? [result.reasoningContent];
      for (const part of reasoningParts) {
        yield { delta: '', reasoningDelta: part, done: false };
        await new Promise((r) => setTimeout(r, 20));
      }
    }
    if (result.content) {
      const parts = result.content.match(/\S+\s*|\s+/g) ?? [result.content];
      for (const part of parts) {
        yield { delta: part, done: false };
        await new Promise((r) => setTimeout(r, 20));
      }
    }
    yield { delta: '', done: true };
  }
}

/** Stub provider for development — no external API calls */
export class StubModelProvider implements ModelProvider {
  id = 'stub';
  name = 'Stub Provider';
  models = ['stub-mini', 'stub-pro'];

  async complete(request: ModelCompletionRequest): Promise<string> {
    const result = await this.completeStructured(request);
    return result.content;
  }

  async completeStructured(request: ModelCompletionRequest): Promise<ModelCompletionResult> {
    const lastUser = [...request.messages].reverse().find((m) => m.role === 'user');
    const userText = lastUser?.content ?? '';
    const tools = request.tools ?? [];

    const hasToolResults = request.messages.some((m) => m.role === 'tool');
    if (!hasToolResults && tools.length > 0) {
      const timeTool = tools.find((t) => t.function.name === 'get_time');
      if (timeTool && /\btime\b/i.test(userText)) {
        return {
          content: '',
          toolCalls: [{ id: `call_${crypto.randomUUID().slice(0, 8)}`, name: 'get_time', arguments: '{}' }],
          finishReason: 'tool_calls',
        };
      }

      const echoTool = tools.find((t) => t.function.name === 'echo');
      if (echoTool && /\becho\b/i.test(userText)) {
        const match = userText.match(/echo\s+(.+)/i);
        const text = match?.[1]?.trim() ?? userText;
        return {
          content: '',
          toolCalls: [
            {
              id: `call_${crypto.randomUUID().slice(0, 8)}`,
              name: 'echo',
              arguments: JSON.stringify({ text }),
            },
          ],
          finishReason: 'tool_calls',
        };
      }
    }

    const lastTool = [...request.messages].reverse().find((m) => m.role === 'tool');
    if (lastTool) {
      return {
        content: `[stub:${request.modelId}] Tool result received. ${lastTool.content}`,
        finishReason: 'stop',
      };
    }

    return {
      content: `[stub:${request.modelId}] ${userText || 'Hello from Aigolet!'}`,
      finishReason: 'stop',
    };
  }

  async *stream(request: ModelCompletionRequest): AsyncIterable<ModelCompletionChunk> {
    const text = await this.complete(request);
    const words = text.split(' ');
    for (let i = 0; i < words.length; i++) {
      yield { delta: (i === 0 ? '' : ' ') + words[i], done: false };
      await new Promise((r) => setTimeout(r, 30));
    }
    yield { delta: '', done: true };
  }
}

export function createDefaultModelGateway(): DefaultModelGateway {
  const gateway = new DefaultModelGateway();
  gateway.registerProvider(new StubModelProvider());
  return gateway;
}

function resolveBaseUrl(config: Pick<LlmProviderConfig, 'providerType' | 'baseUrl'>): string {
  if (config.baseUrl.trim()) {
    return config.baseUrl.replace(/\/$/, '');
  }
  if (config.providerType === 'anthropic') {
    return 'https://api.anthropic.com/v1';
  }
  return 'https://api.openai.com/v1';
}

/** Build OpenAI-compatible chat completions URL from base URL. */
export function buildChatCompletionsUrl(baseUrl: string): string {
  const normalized = baseUrl.replace(/\/$/, '');
  if (normalized.endsWith('/chat/completions')) {
    return normalized;
  }
  if (normalized.endsWith('/v1')) {
    return `${normalized}/chat/completions`;
  }
  return `${normalized}/v1/chat/completions`;
}

function formatLlmHttpError(status: number, body: string): string {
  if (status === 401) {
    return 'LLM authentication failed (401): check your API key in Settings.';
  }
  if (status === 429) {
    return 'LLM rate limit exceeded (429): retry later or switch models.';
  }
  if (status >= 500) {
    return `LLM provider error (${status}): ${body.slice(0, 200)}`;
  }
  return `LLM request failed (${status}): ${body.slice(0, 300)}`;
}

/** Serialize a message for OpenAI-compatible chat completions APIs. */
export function serializeModelMessageForApi(m: ModelMessage): Record<string, unknown> {
  const msg: Record<string, unknown> = { role: m.role, content: m.content };
  if (m.name) msg.name = m.name;
  if (m.tool_call_id) msg.tool_call_id = m.tool_call_id;
  if (m.reasoning_content) msg.reasoning_content = m.reasoning_content;
  if (m.tool_calls?.length) {
    msg.tool_calls = m.tool_calls.map((tc) => ({
      id: tc.id,
      type: 'function',
      function: { name: tc.name, arguments: tc.arguments },
    }));
  }
  return msg;
}

type ApiAssistantMessage = {
  content?: string | null;
  reasoning_content?: string | null;
  tool_calls?: Array<{
    id: string;
    function: { name: string; arguments: string };
  }>;
};

/** Parse assistant message fields from a chat completion response. */
export function parseAssistantMessageFromApi(message: ApiAssistantMessage): ModelCompletionResult {
  const toolCalls = message.tool_calls?.map((tc) => ({
    id: tc.id,
    name: tc.function.name,
    arguments: tc.function.arguments,
  }));

  const content = message.content ?? '';
  const reasoningContent = message.reasoning_content?.trim()
    ? message.reasoning_content
    : undefined;

  if (toolCalls?.length) {
    return {
      content,
      reasoningContent,
      toolCalls,
      finishReason: 'tool_calls',
    };
  }

  if (!content.trim() && !reasoningContent?.trim()) {
    throw new Error('LLM returned an empty response');
  }

  return { content, reasoningContent, finishReason: 'stop' };
}

function wrapNetworkError(err: unknown): Error {
  if (err instanceof Error) {
    if (err.name === 'AbortError') {
      return new Error('LLM request timed out');
    }
    if (err.message.includes('fetch failed') || err.message.includes('ECONNREFUSED')) {
      return new Error(`LLM network error: ${err.message}. Check base URL and connectivity.`);
    }
    return err;
  }
  return new Error(String(err));
}

/** OpenAI-compatible HTTP provider */
export class OpenAICompatibleProvider implements ModelProvider {
  id: string;
  name: string;
  models: string[];
  private chatUrl: string;
  private apiKey: string;
  private defaultModel: string;
  private requestTimeoutMs: number;

  constructor(options: {
    id?: string;
    name?: string;
    baseUrl: string;
    apiKey: string;
    modelName: string;
    requestTimeoutMs?: number;
  }) {
    this.id = options.id ?? 'openai-compatible';
    this.name = options.name ?? 'OpenAI Compatible';
    this.chatUrl = buildChatCompletionsUrl(options.baseUrl);
    this.apiKey = options.apiKey;
    this.defaultModel = options.modelName;
    this.models = [options.modelName];
    this.requestTimeoutMs = options.requestTimeoutMs ?? 120_000;
  }

  private buildHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey}`,
    };
  }

  private resolveModel(modelId: string): string {
    return modelId && modelId !== 'stub-mini' && modelId !== 'stub-pro'
      ? modelId
      : this.defaultModel;
  }

  async complete(request: ModelCompletionRequest): Promise<string> {
    const result = await this.completeStructured(request);
    return result.content;
  }

  async completeStructured(request: ModelCompletionRequest): Promise<ModelCompletionResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.requestTimeoutMs);

    try {
      const body: Record<string, unknown> = {
        model: this.resolveModel(request.modelId),
        messages: request.messages.map(serializeModelMessageForApi),
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens,
        stream: false,
      };

      if (request.tools?.length) {
        body.tools = request.tools;
        body.tool_choice = 'auto';
      }

      const res = await fetch(this.chatUrl, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(formatLlmHttpError(res.status, text));
      }

      const data = (await res.json()) as {
        choices?: Array<{
          finish_reason?: string;
          message?: ApiAssistantMessage;
        }>;
      };

      const message = data.choices?.[0]?.message;
      if (!message) {
        throw new Error('LLM returned an empty response');
      }
      return parseAssistantMessageFromApi(message);
    } catch (err) {
      throw wrapNetworkError(err);
    } finally {
      clearTimeout(timer);
    }
  }

  async *stream(request: ModelCompletionRequest): AsyncIterable<ModelCompletionChunk> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.requestTimeoutMs);

    try {
      const res = await fetch(this.chatUrl, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify({
          model: this.resolveModel(request.modelId),
          messages: request.messages.map(serializeModelMessageForApi),
          temperature: request.temperature ?? 0.7,
          max_tokens: request.maxTokens,
          stream: true,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(formatLlmHttpError(res.status, text));
      }

      if (!res.body) {
        const content = await this.complete({ ...request, stream: false });
        yield { delta: content, done: false };
        yield { delta: '', done: true };
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === '[DONE]') {
            yield { delta: '', done: true };
            return;
          }
          try {
            const parsed = JSON.parse(payload) as {
              choices?: Array<{ delta?: { content?: string; reasoning_content?: string } }>;
            };
            const delta = parsed.choices?.[0]?.delta?.content ?? '';
            const reasoningDelta = parsed.choices?.[0]?.delta?.reasoning_content ?? '';
            if (delta || reasoningDelta) {
              yield { delta, reasoningDelta: reasoningDelta || undefined, done: false };
            }
          } catch {
            // ignore malformed SSE chunks
          }
        }
      }

      yield { delta: '', done: true };
    } catch (err) {
      throw wrapNetworkError(err);
    } finally {
      clearTimeout(timer);
    }
  }
}

export function createProviderFromConfig(config: LlmProviderConfig): ModelProvider | null {
  if (config.providerType === 'stub' || !config.apiKey) {
    return null;
  }

  return new OpenAICompatibleProvider({
    id: config.providerType,
    name: config.providerType,
    baseUrl: resolveBaseUrl(config),
    apiKey: config.apiKey,
    modelName: config.modelName,
  });
}

export function applyLlmConfig(
  gateway: DefaultModelGateway,
  config: LlmProviderConfig,
): void {
  if (config.providerType === 'stub' || !config.apiKey) {
    gateway.setDefaultProvider('stub');
    return;
  }

  const provider = createProviderFromConfig(config);
  if (!provider) {
    gateway.setDefaultProvider('stub');
    return;
  }

  gateway.registerProvider(provider);
  gateway.setDefaultProvider(provider.id);
}

export function resolveProviderId(config: LlmProviderConfig): string {
  if (config.providerType === 'stub' || !config.apiKey) {
    return 'stub';
  }
  return config.providerType;
}

export function validateLlmConfig(config: LlmProviderConfig): void {
  if (config.providerType === 'stub') {
    return;
  }
  if (!config.apiKey?.trim()) {
    throw new Error(
      'LLM not configured: API key is required. Open Settings → LLM Providers to configure your model.',
    );
  }
  if (!config.modelName?.trim()) {
    throw new Error('LLM not configured: model name is required.');
  }
}

/** Lightweight connectivity test — sends a minimal chat completion request. */
export async function testLlmConnection(config: LlmProviderConfig): Promise<string> {
  if (config.providerType === 'stub') {
    return 'Stub provider — no network call needed.';
  }

  validateLlmConfig(config);
  const provider = createProviderFromConfig(config);
  if (!provider) {
    throw new Error('LLM provider could not be created from configuration.');
  }

  const response = await provider.complete({
    modelId: config.modelName,
    messages: [
      { role: 'system', content: 'Reply with exactly: OK' },
      { role: 'user', content: 'ping' },
    ],
    maxTokens: 16,
    temperature: 0,
  });

  return response.trim() || 'Connection successful (empty body).';
}
