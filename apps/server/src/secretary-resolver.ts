import type { Agent, Secretary } from '@aigolet-next/protocol';
import type { SqliteSecretaryStore } from '@aigolet-next/persistence';

export function secretaryAgentId(secretaryId: string): string {
  return `secretary:${secretaryId}`;
}

export function isSecretaryAgentId(agentId: string): boolean {
  return agentId.startsWith('secretary:');
}

export function secretaryIdFromAgentId(agentId: string): string | null {
  return isSecretaryAgentId(agentId) ? agentId.slice('secretary:'.length) : null;
}

export function secretaryToRuntimeAgent(secretary: Secretary): Agent {
  const now = secretary.updatedAt;
  return {
    id: secretaryAgentId(secretary.id),
    name: secretary.name,
    description: secretary.description,
    systemPrompt: secretary.systemPrompt ?? defaultSystemPromptForType(secretary.type),
    toolIds: secretary.allowedTools ?? [],
    createdAt: secretary.createdAt,
    updatedAt: now,
  };
}

export function resolveSecretaryAgent(
  secretaryStore: SqliteSecretaryStore,
  secretaryId: string,
): Agent | null {
  const secretary = secretaryStore.get(secretaryId);
  if (!secretary || !secretary.enabled) return null;
  return secretaryToRuntimeAgent(secretary);
}

function defaultSystemPromptForType(type: Secretary['type']): string {
  switch (type) {
    case 'time':
      return '你是时间秘书，负责理解用户的日程需求并管理定时任务。';
    case 'personal':
      return '你是个人秘书，帮助用户管理日常生活、提醒事项与个人计划。语气亲切、高效。';
    case 'work':
      return '你是工作秘书，帮助用户处理商务事务、会议安排、文档整理与项目跟进。语气专业、简洁。';
  }
}
