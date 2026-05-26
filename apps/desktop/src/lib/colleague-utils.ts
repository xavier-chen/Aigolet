import {
  Briefcase,
  Calculator,
  Code,
  Headphones,
  Megaphone,
  Palette,
  PenTool,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';

const AVATAR_PALETTES = [
  { bg: 'from-violet-400 to-purple-500', ring: 'ring-violet-300/50', text: 'text-white' },
  { bg: 'from-sky-400 to-blue-500', ring: 'ring-sky-300/50', text: 'text-white' },
  { bg: 'from-emerald-400 to-teal-500', ring: 'ring-emerald-300/50', text: 'text-white' },
  { bg: 'from-amber-400 to-orange-500', ring: 'ring-amber-300/50', text: 'text-white' },
  { bg: 'from-rose-400 to-pink-500', ring: 'ring-rose-300/50', text: 'text-white' },
  { bg: 'from-indigo-400 to-blue-600', ring: 'ring-indigo-300/50', text: 'text-white' },
  { bg: 'from-cyan-400 to-sky-500', ring: 'ring-cyan-300/50', text: 'text-white' },
  { bg: 'from-fuchsia-400 to-purple-600', ring: 'ring-fuchsia-300/50', text: 'text-white' },
] as const;

const ROLE_ICONS: LucideIcon[] = [
  Sparkles,
  Briefcase,
  Palette,
  Calculator,
  Code,
  Megaphone,
  PenTool,
  Headphones,
];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function getColleagueTheme(agentId: string) {
  const index = hashString(agentId) % AVATAR_PALETTES.length;
  const iconIndex = hashString(agentId + ':icon') % ROLE_ICONS.length;
  return {
    palette: AVATAR_PALETTES[index],
    Icon: ROLE_ICONS[iconIndex],
    initials: agentId.slice(0, 2).toUpperCase(),
  };
}

export function getColleagueInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase() || 'AI';
}
