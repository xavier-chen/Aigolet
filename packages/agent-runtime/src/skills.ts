import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Skill } from '@aigolet-next/protocol';

export interface LoadedSkill {
  id: string;
  name: string;
  description?: string;
  content: string;
  allowedTools?: string[];
  slug: string;
}

export interface ParsedSkillFrontmatter {
  description?: string;
  allowedTools?: string[];
  allowed_tools?: string[];
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function parseFrontmatter(raw: string): { frontmatter: ParsedSkillFrontmatter; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: raw.trim() };
  }

  const frontmatter: ParsedSkillFrontmatter = {};
  for (const line of match[1].split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const colon = trimmed.indexOf(':');
    if (colon === -1) continue;

    const key = trimmed.slice(0, colon).trim();
    let value = trimmed.slice(colon + 1).trim();

    if (value.startsWith('[') && value.endsWith(']')) {
      const items = value
        .slice(1, -1)
        .split(',')
        .map((item) => item.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean);
      if (key === 'allowed_tools' || key === 'allowedTools') {
        frontmatter.allowedTools = items;
      }
      continue;
    }

    value = value.replace(/^['"]|['"]$/g, '');
    if (key === 'description') frontmatter.description = value;
    if (key === 'allowed_tools' || key === 'allowedTools') {
      frontmatter.allowedTools = value.split(',').map((v) => v.trim()).filter(Boolean);
    }
  }

  return { frontmatter, body: match[2].trim() };
}

export function loadSkillMarkdown(rawContent: string): {
  content: string;
  description?: string;
  allowedTools?: string[];
} {
  const { frontmatter, body } = parseFrontmatter(rawContent);
  const allowedTools = frontmatter.allowedTools ?? frontmatter.allowed_tools;
  return {
    content: body,
    description: frontmatter.description,
    allowedTools,
  };
}

export function loadSkillFromRecord(skill: Skill): LoadedSkill {
  let raw = '';

  if (skill.source === 'inline') {
    raw = skill.content ?? '';
  } else if (skill.path) {
    const skillPath = skill.path.endsWith('SKILL.md')
      ? skill.path
      : join(skill.path, 'SKILL.md');
    try {
      raw = readFileSync(skillPath, 'utf-8');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      raw = `# ${skill.name}\n\n(Failed to load SKILL.md: ${message})`;
    }
  }

  const parsed = loadSkillMarkdown(raw);
  const slug = slugify(skill.name);

  return {
    id: skill.id,
    name: skill.name,
    description: skill.description ?? parsed.description,
    content: parsed.content || raw,
    allowedTools: parsed.allowedTools,
    slug,
  };
}

export function loadEnabledSkills(skills: Skill[]): LoadedSkill[] {
  return skills.filter((s) => s.enabled).map(loadSkillFromRecord);
}

export function buildSkillsSystemBlock(loaded: LoadedSkill[]): string {
  if (loaded.length === 0) return '';

  const blocks = loaded.map((skill) => {
    const toolsLine = skill.allowedTools?.length
      ? `\nPreferred tools: ${skill.allowedTools.join(', ')}`
      : '';
    const desc = skill.description ? `${skill.description}\n\n` : '';
    return `### Skill: ${skill.name}${toolsLine}\n\n${desc}${skill.content}`;
  });

  return `## Active Skills\n\nFollow these skill instructions when relevant:\n\n${blocks.join('\n\n---\n\n')}`;
}
