import type { Agent, LlmProviderConfig, MemoryNamespace, MemoryRecord, Run, Skill } from '@aigolet-next/protocol';
import { createActor } from '@aigolet-next/protocol';
import type { Orchestrator } from '@aigolet-next/orchestrator';
import type { MemoryService } from '@aigolet-next/memory';
import {
  applyLlmConfig,
  type DefaultModelGateway,
  type ModelGateway,
  type ModelMessage,
  type ModelToolDefinition,
  resolveProviderId,
  validateLlmConfig,
} from '@aigolet-next/model-gateway';
import type { ToolExecutor, ToolRegistry } from '@aigolet-next/tools';
import { toolDefinitionsToModelTools } from '@aigolet-next/tools';
import {
  attachmentMetadata,
  buildUserMessageWithAttachments,
  type AttachmentRef,
} from './attachments.js';
import { buildSkillsSystemBlock, loadEnabledSkills, type LoadedSkill } from './skills.js';

export const DEFAULT_FOUNDER_SYSTEM_PROMPT = `You are AIgolet (Algolet), an AI co-founder assistant helping entrepreneurs build and run a one-person company.

Your role:
- Help the founder clarify goals, prioritize work, and execute across company setup, product, design, finance, and operations.
- Give practical, actionable advice tailored to solo founders and small teams.
- Be concise, direct, and supportive — like a trusted co-founder, not a generic chatbot.

When you lack context, ask focused follow-up questions before recommending next steps.
You have access to tools — use them when they help accomplish the founder's request.`;

export const MAX_TOOL_ITERATIONS = 10;

const REASONING_METADATA_KEY = 'reasoning_content';

export type StreamEvent =
  | { type: 'assistant.delta'; delta: string }
  | { type: 'reasoning.delta'; delta: string }
  | { type: 'tool.start'; toolId: string; toolCallId: string; input: unknown }
  | {
      type: 'tool.end';
      toolId: string;
      toolCallId: string;
      result?: unknown;
      error?: string;
    }
  | { type: 'run.completed'; response: string; toolCallCount?: number; reasoning?: string }
  | { type: 'run.failed'; error: string };

export type StreamCallback = (event: StreamEvent) => void;

function sessionMessageToModelMessage(msg: {
  role: string;
  content: string;
  metadata?: Record<string, unknown>;
}): ModelMessage | null {
  if (msg.role !== 'user' && msg.role !== 'assistant') return null;
  const modelMsg: ModelMessage = { role: msg.role, content: msg.content };
  const reasoning = msg.metadata?.[REASONING_METADATA_KEY];
  if (typeof reasoning === 'string' && reasoning) {
    modelMsg.reasoning_content = reasoning;
  }
  return modelMsg;
}

function assistantMetadata(
  runId: string,
  toolCallCount: number,
  reasoningContent?: string,
): Record<string, unknown> {
  const metadata: Record<string, unknown> = { runId, toolCallCount };
  if (reasoningContent) {
    metadata[REASONING_METADATA_KEY] = reasoningContent;
  }
  return metadata;
}

const STREAM_EMIT_DELAY_MS = 20;

async function emitTextAsDeltas(
  text: string,
  type: 'assistant.delta' | 'reasoning.delta',
  onStream?: StreamCallback,
): Promise<void> {
  if (!onStream || !text) return;
  const parts = text.match(/\S+\s*|\s+/g) ?? [text];
  for (const part of parts) {
    onStream({ type, delta: part });
    await new Promise((resolve) => setTimeout(resolve, STREAM_EMIT_DELAY_MS));
  }
}

export interface AgentRunInput {
  sessionId: string;
  agent: Agent;
  userMessage: string;
  namespace: MemoryNamespace;
  modelId?: string;
  attachments?: AttachmentRef[];
  /** Additional system context (e.g. company brain) injected before user message */
  extraSystemContext?: string;
}

export interface AgentRunResult {
  run: Run;
  response: string;
  toolCallCount?: number;
}

export interface AgentRuntimeConfig {
  orchestrator: Orchestrator;
  memory: MemoryService;
  modelGateway: ModelGateway;
  toolExecutor: ToolExecutor;
  toolRegistry: ToolRegistry;
  getLlmConfig: () => LlmProviderConfig;
  getEnabledSkillRecords?: () => Skill[];
  filterRecalledMemories?: (records: MemoryRecord[]) => MemoryRecord[];
  getMemoryVisibilityLevel?: () => number;
}

function visibilityMetadata(level?: number): Record<string, unknown> | undefined {
  if (level === undefined) return undefined;
  return { visibilityLevel: level };
}

function buildSystemPrompt(agent: Agent, loadedSkills: LoadedSkill[]): string {
  const base = agent.systemPrompt?.trim() || DEFAULT_FOUNDER_SYSTEM_PROMPT;
  const skillsBlock = buildSkillsSystemBlock(loadedSkills);
  if (!skillsBlock) return base;
  return `${base}\n\n${skillsBlock}`;
}

function summarizeResult(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.length > 500 ? `${value.slice(0, 500)}…` : value;
  }
  try {
    const json = JSON.stringify(value);
    return json.length > 500 ? `${json.slice(0, 500)}…` : value;
  } catch {
    return String(value);
  }
}

/**
 * Agent loop: intake → context → model ↔ tools → persist
 */
export class AgentRuntime {
  constructor(private readonly config: AgentRuntimeConfig) {}

  private providerSupportsStream(providerId: string): boolean {
    const provider = this.config.modelGateway.getProvider(providerId);
    return typeof provider?.stream === 'function';
  }

  private async streamModelResponse(params: {
    providerId: string;
    modelId: string;
    messages: ModelMessage[];
    onStream?: StreamCallback;
  }): Promise<{ content: string; reasoningContent?: string }> {
    let content = '';
    let reasoningContent = '';

    for await (const chunk of this.config.modelGateway.stream({
      providerId: params.providerId,
      modelId: params.modelId,
      messages: params.messages,
    })) {
      if (chunk.delta) {
        content += chunk.delta;
        params.onStream?.({ type: 'assistant.delta', delta: chunk.delta });
      }
      if (chunk.reasoningDelta) {
        reasoningContent += chunk.reasoningDelta;
        params.onStream?.({ type: 'reasoning.delta', delta: chunk.reasoningDelta });
      }
    }

    return {
      content,
      reasoningContent: reasoningContent || undefined,
    };
  }

  async run(
    input: AgentRunInput,
    onStream?: StreamCallback,
    existingRunId?: string,
  ): Promise<AgentRunResult> {
    const actor = createActor('agent', input.agent.id, input.agent.name);
    const llmConfig = this.config.getLlmConfig();
    applyLlmConfig(this.config.modelGateway as DefaultModelGateway, llmConfig);

    let run: Run;
    if (existingRunId) {
      const existing = await this.config.orchestrator.getRun(existingRunId);
      if (!existing) throw new Error(`Run not found: ${existingRunId}`);
      run = existing;
    } else {
      run = await this.config.orchestrator.createRun(
        {
          sessionId: input.sessionId,
          agentId: input.agent.id,
          payload: { message: input.userMessage },
        },
        actor,
      );
    }

    await this.config.orchestrator.transitionRun(run.id, 'running', undefined, actor);

    try {
      validateLlmConfig(llmConfig);

      const rawMemories = await this.config.memory.recall({
        namespace: input.namespace,
        limit: 10,
      });
      const memories = this.config.filterRecalledMemories
        ? this.config.filterRecalledMemories(rawMemories)
        : rawMemories;

      const skillRecords = this.config.getEnabledSkillRecords?.() ?? [];
      const loadedSkills = loadEnabledSkills(skillRecords);
      const systemPrompt = buildSystemPrompt(input.agent, loadedSkills);
      const contextBlock = memories.map((m) => m.content).join('\n');

      const priorMessages = await this.config.orchestrator.getSessionMessages(
        input.sessionId,
        40,
      );

      const messages: ModelMessage[] = [{ role: 'system', content: systemPrompt }];
      if (input.extraSystemContext?.trim()) {
        messages.push({ role: 'system', content: input.extraSystemContext.trim() });
      }
      if (contextBlock) {
        messages.push({ role: 'system', content: `Relevant context:\n${contextBlock}` });
      }

      for (const msg of priorMessages) {
        const modelMsg = sessionMessageToModelMessage(msg);
        if (modelMsg) messages.push(modelMsg);
      }

      const effectiveUserMessage = buildUserMessageWithAttachments(
        input.userMessage,
        input.attachments,
      );
      messages.push({ role: 'user', content: effectiveUserMessage });

      const providerId = resolveProviderId(llmConfig);
      const modelId =
        llmConfig.providerType === 'stub'
          ? input.modelId ?? input.agent.modelId ?? llmConfig.modelName ?? 'stub-mini'
          : llmConfig.modelName || input.modelId || input.agent.modelId || 'gpt-4o-mini';

      const toolDefs = this.config.toolRegistry.list();
      const modelTools: ModelToolDefinition[] = toolDefinitionsToModelTools(toolDefs);

      let response = '';
      let responseReasoningContent: string | undefined;
      let toolCallCount = 0;
      let iteration = 0;

      while (iteration < MAX_TOOL_ITERATIONS) {
        await this.config.orchestrator.appendRunEvent(
          run.id,
          'model.request',
          {
            providerId,
            modelId,
            messageCount: messages.length,
            iteration,
            userMessage: iteration === 0 ? input.userMessage : undefined,
            toolCount: modelTools.length,
          },
          actor,
        );

        const hasToolResults = messages.some((m) => m.role === 'tool');

        if (hasToolResults && this.providerSupportsStream(providerId)) {
          const streamed = await this.streamModelResponse({
            providerId,
            modelId,
            messages,
            onStream,
          });
          response = streamed.content;
          responseReasoningContent = streamed.reasoningContent;
        } else if (modelTools.length === 0 && this.providerSupportsStream(providerId)) {
          const streamed = await this.streamModelResponse({
            providerId,
            modelId,
            messages,
            onStream,
          });
          response = streamed.content;
          responseReasoningContent = streamed.reasoningContent;
        } else {
          const result = await this.config.modelGateway.completeStructured({
            providerId,
            modelId,
            messages,
            tools: modelTools.length > 0 ? modelTools : undefined,
          });

          if (result.toolCalls?.length) {
            messages.push({
              role: 'assistant',
              content: result.content ?? '',
              reasoning_content: result.reasoningContent,
              tool_calls: result.toolCalls,
            });

            for (const toolCall of result.toolCalls) {
              toolCallCount += 1;
              let parsedInput: unknown = {};
              try {
                parsedInput = toolCall.arguments ? JSON.parse(toolCall.arguments) : {};
              } catch {
                parsedInput = { raw: toolCall.arguments };
              }

              onStream?.({
                type: 'tool.start',
                toolId: toolCall.name,
                toolCallId: toolCall.id,
                input: parsedInput,
              });

              await this.config.orchestrator.appendRunEvent(
                run.id,
                'tool.invoked',
                {
                  toolId: toolCall.name,
                  toolCallId: toolCall.id,
                  input: parsedInput,
                },
                actor,
              );

              try {
                const toolResult = await this.config.toolExecutor.invoke(
                  { toolId: toolCall.name, input: parsedInput },
                  {
                    actor,
                    runId: run.id,
                    sessionId: input.sessionId,
                    namespace: input.namespace,
                  },
                );

                await this.config.orchestrator.appendRunEvent(
                  run.id,
                  'tool.completed',
                  {
                    toolId: toolCall.name,
                    toolCallId: toolCall.id,
                    result: summarizeResult(toolResult),
                  },
                  actor,
                );

                onStream?.({
                  type: 'tool.end',
                  toolId: toolCall.name,
                  toolCallId: toolCall.id,
                  result: summarizeResult(toolResult),
                });

                messages.push({
                  role: 'tool',
                  content: JSON.stringify(toolResult),
                  tool_call_id: toolCall.id,
                  name: toolCall.name,
                });
              } catch (toolErr) {
                const errorMessage =
                  toolErr instanceof Error ? toolErr.message : String(toolErr);

                await this.config.orchestrator.appendRunEvent(
                  run.id,
                  'tool.failed',
                  {
                    toolId: toolCall.name,
                    toolCallId: toolCall.id,
                    error: errorMessage,
                  },
                  actor,
                );

                onStream?.({
                  type: 'tool.end',
                  toolId: toolCall.name,
                  toolCallId: toolCall.id,
                  error: errorMessage,
                });

                messages.push({
                  role: 'tool',
                  content: JSON.stringify({ error: errorMessage }),
                  tool_call_id: toolCall.id,
                  name: toolCall.name,
                });
              }
            }

            iteration += 1;
            continue;
          }

          response = result.content;
          responseReasoningContent = result.reasoningContent;

          if (result.reasoningContent) {
            await emitTextAsDeltas(result.reasoningContent, 'reasoning.delta', onStream);
          }
          await emitTextAsDeltas(result.content, 'assistant.delta', onStream);
        }

        if (!response.trim() && !responseReasoningContent?.trim()) {
          throw new Error('LLM returned an empty response');
        }

        await this.config.orchestrator.appendRunEvent(
          run.id,
          'model.response',
          {
            providerId,
            modelId,
            content: response,
            length: response.length,
            iterations: iteration + 1,
            toolCallCount,
          },
          actor,
        );

        break;
      }

      if (!response.trim()) {
        throw new Error(`Agent exceeded max tool iterations (${MAX_TOOL_ITERATIONS})`);
      }

      await this.config.orchestrator.appendSessionMessage(
        input.sessionId,
        'user',
        input.userMessage,
        attachmentMetadata(input.attachments),
      );
      await this.config.orchestrator.appendSessionMessage(
        input.sessionId,
        'assistant',
        response,
        assistantMetadata(run.id, toolCallCount, responseReasoningContent),
      );

      await this.config.memory.remember(
        input.namespace,
        `User: ${input.userMessage}`,
        'episodic',
        visibilityMetadata(this.config.getMemoryVisibilityLevel?.()),
      );
      await this.config.memory.remember(
        input.namespace,
        `Assistant: ${response}`,
        'episodic',
        visibilityMetadata(this.config.getMemoryVisibilityLevel?.()),
      );

      const completed = await this.config.orchestrator.transitionRun(
        run.id,
        'completed',
        { output: { response, toolCallCount } },
        actor,
      );

      onStream?.({
        type: 'run.completed',
        response,
        toolCallCount,
        reasoning: responseReasoningContent,
      });

      return { run: completed, response, toolCallCount };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const failed = await this.config.orchestrator.transitionRun(
        run.id,
        'failed',
        { error: message },
        actor,
      );
      onStream?.({ type: 'run.failed', error: message });
      return { run: failed, response: '' };
    }
  }
}

export function createAgentRuntime(config: AgentRuntimeConfig): AgentRuntime {
  return new AgentRuntime(config);
}

export {
  attachmentMetadata,
  buildUserMessageWithAttachments,
  type AttachmentRef,
} from './attachments.js';
export {
  buildSkillsSystemBlock,
  loadEnabledSkills,
  loadSkillFromRecord,
  loadSkillMarkdown,
  type LoadedSkill,
} from './skills.js';
export { registerSkillTools } from './skill-tools.js';
