import { cn } from '@/lib/utils';
import { getColleagueInitials, getColleagueTheme } from '@/lib/colleague-utils';

interface ColleagueAvatarProps {
  agentId: string;
  name: string;
  size?: 'sm' | 'md' | 'lg';
  selected?: boolean;
  online?: boolean;
  className?: string;
}

const sizes = {
  sm: 'w-9 h-9 rounded-xl text-xs',
  md: 'w-11 h-11 rounded-xl text-sm',
  lg: 'w-14 h-14 rounded-2xl text-base',
};

export function ColleagueAvatar({
  agentId,
  name,
  size = 'md',
  selected,
  online,
  className,
}: ColleagueAvatarProps) {
  const { palette, Icon } = getColleagueTheme(agentId);

  return (
    <div className={cn('relative shrink-0', className)}>
      <div
        className={cn(
          'flex items-center justify-center bg-gradient-to-br font-display font-bold shadow-soft transition-transform duration-200',
          sizes[size],
          palette.bg,
          palette.text,
          selected && `ring-2 ring-offset-2 ring-offset-[var(--bg-primary)] ${palette.ring} scale-105`,
        )}
      >
        <Icon className={cn(size === 'sm' ? 'w-4 h-4' : size === 'md' ? 'w-5 h-5' : 'w-6 h-6')} />
        <span className="sr-only">{getColleagueInitials(name)}</span>
      </div>
      {online !== undefined && (
        <span
          className={cn(
            'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[var(--bg-primary)]',
            online ? 'bg-emerald-400' : 'bg-slate-300 dark:bg-slate-600',
          )}
        />
      )}
    </div>
  );
}
