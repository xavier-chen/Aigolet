/** Extract JSON object from LLM response text */
export function extractJsonFromLlm(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch?.[1]) return fenceMatch[1].trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}

export interface CronParseResult {
  name: string;
  schedule: string;
  message: string;
  description: string;
}

export function buildCronParsePrompt(locale?: string): string {
  const langHint = locale?.startsWith('zh') ? 'Chinese' : 'English';
  return `You are a scheduling assistant ("Time Secretary"). Parse natural language into a cron job.

Output ONLY valid JSON with these fields:
- name: short job title (${langHint})
- schedule: standard 5-field cron (minute hour day month weekday), e.g. "0 9 * * *" for daily 9am
- message: the prompt/instruction to send to the AI colleague when the job runs (${langHint})
- description: human-readable schedule summary (${langHint})

Rules:
- Use 5-field cron only (not 6-field)
- Weekday: 0=Sunday, 1=Monday ... 6=Saturday
- For "every day at 9am" use "0 9 * * *"
- For "every Monday at 10am" use "0 10 * * 1"
- message should be actionable and complete`;
}

export function parseCronParseResult(raw: string): CronParseResult | null {
  try {
    const parsed = JSON.parse(extractJsonFromLlm(raw)) as Partial<CronParseResult>;
    if (
      typeof parsed.name !== 'string' ||
      typeof parsed.schedule !== 'string' ||
      typeof parsed.message !== 'string'
    ) {
      return null;
    }
    return {
      name: parsed.name.trim(),
      schedule: parsed.schedule.trim(),
      message: parsed.message.trim(),
      description:
        typeof parsed.description === 'string'
          ? parsed.description.trim()
          : parsed.schedule.trim(),
    };
  } catch {
    return null;
  }
}
