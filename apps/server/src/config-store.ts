import type {
  CreateSkillInput,
  LlmProviderConfig,
  LlmProviderConfigPublic,
  Skill,
  UpdateSkillInput,
} from '@aigolet-next/protocol';
import type { SqliteLlmConfigStore, SqliteSkillStore } from '@aigolet-next/persistence';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

let llmStore: SqliteLlmConfigStore | null = null;
let skillStore: SqliteSkillStore | null = null;

export function initConfigStores(stores: {
  llmConfigStore: SqliteLlmConfigStore;
  skillStore: SqliteSkillStore;
}): void {
  llmStore = stores.llmConfigStore;
  skillStore = stores.skillStore;
}

function requireLlmStore(): SqliteLlmConfigStore {
  if (!llmStore) throw new Error('LLM config store not initialized');
  return llmStore;
}

function requireSkillStore(): SqliteSkillStore {
  if (!skillStore) throw new Error('Skill store not initialized');
  return skillStore;
}

export function getLlmConfig(): LlmProviderConfig {
  return requireLlmStore().get();
}

export function getLlmConfigPublic(): LlmProviderConfigPublic {
  const llmConfig = getLlmConfig();
  return {
    providerType: llmConfig.providerType,
    baseUrl: llmConfig.baseUrl,
    modelName: llmConfig.modelName,
    hasApiKey: Boolean(llmConfig.apiKey),
  };
}

export function setLlmConfig(config: LlmProviderConfig): LlmProviderConfig {
  return requireLlmStore().set(config);
}

export function listSkills(): Skill[] {
  return requireSkillStore().list();
}

export function getSkill(id: string): Skill | null {
  return requireSkillStore().get(id);
}

function validateSkillInput(input: CreateSkillInput): void {
  if (input.source === 'inline' && !input.content?.trim()) {
    throw new Error('Inline skills require content (SKILL.md markdown)');
  }
  if (input.source === 'path') {
    if (!input.path?.trim()) {
      throw new Error('Path skills require a path to SKILL.md or skill directory');
    }
    const skillPath = input.path.endsWith('SKILL.md')
      ? input.path
      : join(input.path, 'SKILL.md');
    try {
      readFileSync(skillPath, 'utf-8');
    } catch {
      throw new Error(`SKILL.md not found or unreadable at: ${skillPath}`);
    }
  }
}

export function createSkill(input: CreateSkillInput): Skill {
  validateSkillInput(input);
  return requireSkillStore().create(input);
}

export function updateSkill(id: string, input: UpdateSkillInput): Skill | null {
  const existing = getSkill(id);
  if (!existing) return null;

  const merged: CreateSkillInput = {
    name: input.name ?? existing.name,
    description: input.description ?? existing.description,
    source: existing.source,
    content: input.content ?? existing.content,
    path: input.path ?? existing.path,
    enabled: input.enabled ?? existing.enabled,
  };
  validateSkillInput(merged);

  return requireSkillStore().update(id, input);
}

export function deleteSkill(id: string): boolean {
  return requireSkillStore().delete(id);
}
