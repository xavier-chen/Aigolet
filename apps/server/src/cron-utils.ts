/** Validate and compute next run for standard 5-field cron expressions */
const CRON_PARTS = 5;

export function validateCronExpression(expression: string): { valid: boolean; error?: string } {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== CRON_PARTS) {
    return {
      valid: false,
      error: `Expected ${CRON_PARTS} fields (minute hour day month weekday), got ${parts.length}`,
    };
  }

  const ranges = [
    { name: 'minute', min: 0, max: 59 },
    { name: 'hour', min: 0, max: 23 },
    { name: 'day', min: 1, max: 31 },
    { name: 'month', min: 1, max: 12 },
    { name: 'weekday', min: 0, max: 6 },
  ];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const { name, min, max } = ranges[i];
    if (part === '*') continue;
    if (/^\*\/\d+$/.test(part)) {
      const step = Number(part.slice(2));
      if (step <= 0) return { valid: false, error: `Invalid step in ${name}: ${part}` };
      continue;
    }
    if (/^\d+$/.test(part)) {
      const value = Number(part);
      if (value < min || value > max) {
        return { valid: false, error: `${name} out of range: ${value}` };
      }
      continue;
    }
    if (/^[\d,-/]+$/.test(part)) {
      continue;
    }
    return { valid: false, error: `Invalid ${name} field: ${part}` };
  }

  return { valid: true };
}

function matchesField(value: number, field: string, min: number, _max: number): boolean {
  if (field === '*') return true;
  if (field.startsWith('*/')) {
    const step = Number(field.slice(2));
    return value % step === 0;
  }
  for (const segment of field.split(',')) {
    if (segment.includes('/')) {
      const [base, stepStr] = segment.split('/');
      const step = Number(stepStr);
      const start = base === '*' ? min : Number(base);
      if ((value - start) % step === 0 && value >= start) return true;
      continue;
    }
    if (segment.includes('-')) {
      const [a, b] = segment.split('-').map(Number);
      if (value >= a && value <= b) return true;
      continue;
    }
    if (Number(segment) === value) return true;
  }
  return false;
}

export function cronMatches(date: Date, expression: string): boolean {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== CRON_PARTS) return false;
  const [minute, hour, day, month, weekday] = parts;
  return (
    matchesField(date.getMinutes(), minute, 0, 59) &&
    matchesField(date.getHours(), hour, 0, 23) &&
    matchesField(date.getDate(), day, 1, 31) &&
    matchesField(date.getMonth() + 1, month, 1, 12) &&
    matchesField(date.getDay(), weekday, 0, 6)
  );
}

export function computeNextRun(expression: string, from = new Date()): Date | null {
  const validation = validateCronExpression(expression);
  if (!validation.valid) return null;

  const cursor = new Date(from);
  cursor.setSeconds(0, 0);
  cursor.setMinutes(cursor.getMinutes() + 1);

  const limit = from.getTime() + 366 * 24 * 60 * 60 * 1000;
  while (cursor.getTime() <= limit) {
    if (cronMatches(cursor, expression)) return new Date(cursor);
    cursor.setMinutes(cursor.getMinutes() + 1);
  }
  return null;
}
