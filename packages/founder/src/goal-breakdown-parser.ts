import type { GoalBreakdownTask } from './types.js';

export function parseGoalBreakdownResponse(raw: string): GoalBreakdownTask[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  const jsonMatch = trimmed.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as unknown;
      if (Array.isArray(parsed)) {
        return normalizeTasks(parsed);
      }
    } catch {
      // fall through to line parsing
    }
  }

  const lines = trimmed
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const tasks: GoalBreakdownTask[] = [];
  for (const line of lines) {
    const cleaned = line.replace(/^[-*•\d.)\]]+\s*/, '').trim();
    if (!cleaned) continue;
    const [title, ...rest] = cleaned.split(':');
    tasks.push({
      title: title.trim(),
      description: rest.length ? rest.join(':').trim() : undefined,
    });
  }
  return tasks.slice(0, 20);
}

function normalizeTasks(items: unknown[]): GoalBreakdownTask[] {
  const tasks: GoalBreakdownTask[] = [];
  for (const item of items) {
    if (typeof item === 'string' && item.trim()) {
      tasks.push({ title: item.trim() });
      continue;
    }
    if (item && typeof item === 'object') {
      const obj = item as Record<string, unknown>;
      const title = String(obj.title ?? obj.task ?? obj.name ?? '').trim();
      if (!title) continue;
      tasks.push({
        title,
        description: obj.description ? String(obj.description) : undefined,
        dueDate: obj.dueDate ? String(obj.dueDate) : undefined,
      });
    }
  }
  return tasks;
}

export function buildGoalBreakdownPrompt(quarterGoal: string, locale = 'zh'): string {
  const lang = locale.startsWith('zh') ? 'Chinese' : 'English';
  return `You are a founder coach. Break the quarterly OKR into 3-7 concrete weekly tasks.
Respond ONLY with a JSON array: [{"title":"...","description":"...","dueDate":"YYYY-MM-DD"}].
Use ${lang} for titles and descriptions.
Quarter goal: ${quarterGoal}`;
}
