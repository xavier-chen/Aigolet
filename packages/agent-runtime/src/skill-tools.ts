import type { Skill } from '@aigolet-next/protocol';
import type { ToolHandler, ToolRegistry } from '@aigolet-next/tools';
import { loadEnabledSkills, type LoadedSkill } from './skills.js';

export function registerSkillTools(registry: ToolRegistry, skills: Skill[]): LoadedSkill[] {
  const loaded = loadEnabledSkills(skills);
  for (const skill of loaded) {
    const toolId = `skill_${skill.slug}`;
    if (registry.get(toolId)) continue;

    const handler: ToolHandler = async () => ({
      skill: skill.name,
      slug: skill.slug,
      description: skill.description,
      instructions:
        'Apply the following skill instructions when relevant to the user request.',
      content: skill.content,
      allowedTools: skill.allowedTools,
    });

    registry.register(
      {
        id: toolId,
        name: toolId,
        description:
          skill.description ??
          `Load skill "${skill.name}" — returns full SKILL.md content and usage instructions.`,
        inputSchema: {
          type: 'object',
          properties: {
            reason: {
              type: 'string',
              description: 'Why you are invoking this skill',
            },
          },
        },
      },
      handler,
    );
  }
  return loaded;
}
