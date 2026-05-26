import type { Agent, StoredAgent } from '@aigolet-next/protocol';
import { DEFAULT_FOUNDER_SYSTEM_PROMPT } from '@aigolet-next/agent-runtime';
import type { SqliteAgentStore } from '@aigolet-next/persistence';

export function storedAgentToRuntimeAgent(stored: StoredAgent): Agent {
  const now = stored.updatedAt;
  return {
    id: stored.id,
    name: stored.name,
    description: stored.description,
    modelId: stored.modelOverride,
    systemPrompt: stored.systemPrompt ?? DEFAULT_FOUNDER_SYSTEM_PROMPT,
    toolIds: stored.allowedTools ?? [],
    createdAt: stored.createdAt,
    updatedAt: now,
  };
}

export function resolveAgent(agentStore: SqliteAgentStore, agentId: string): Agent | null {
  const stored = agentStore.get(agentId);
  if (!stored || !stored.enabled) return null;
  return storedAgentToRuntimeAgent(stored);
}

export function listEnabledAgents(agentStore: SqliteAgentStore): Agent[] {
  return agentStore
    .list()
    .filter((a) => a.enabled)
    .map(storedAgentToRuntimeAgent);
}
