import { Briefcase, CalendarClock, UserRound } from 'lucide-react';
import type { SecretaryRecord } from '@/lib/api-client';

export type SecretaryType = SecretaryRecord['type'];

export const TYPE_COLORS: Record<SecretaryType, string> = {
  time: '#f59e0b',
  personal: '#8b5cf6',
  work: '#3b82f6',
};

export const TYPE_GRADIENT: Record<SecretaryType, string> = {
  time: 'from-amber-400 to-orange-500',
  personal: 'from-violet-400 to-purple-500',
  work: 'from-blue-400 to-indigo-500',
};

export const TYPE_BADGE: Record<SecretaryType, string> = {
  time: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  personal: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200',
  work: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
};

export const TYPE_ICONS = {
  time: CalendarClock,
  personal: UserRound,
  work: Briefcase,
} as const;

export function secretaryColor(sec: SecretaryRecord): string {
  return sec.color ?? TYPE_COLORS[sec.type];
}

export function secretaryGradient(sec: SecretaryRecord): string {
  if (sec.color) return '';
  return TYPE_GRADIENT[sec.type];
}
