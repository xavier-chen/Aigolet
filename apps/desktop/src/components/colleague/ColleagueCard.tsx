import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import gsap from 'gsap';
import { cn } from '@/lib/utils';
import type { AgentRecord } from '@/lib/api-client';
import { ColleagueAvatar } from './ColleagueAvatar';

interface ColleagueCardProps {
  colleague: AgentRecord;
  selected?: boolean;
  compact?: boolean;
  lastMessage?: string;
  onClick?: () => void;
  className?: string;
}

export function ColleagueCard({
  colleague,
  selected,
  compact,
  lastMessage,
  onClick,
  className,
}: ColleagueCardProps) {
  const { t } = useTranslation();
  const cardRef = useRef<HTMLButtonElement>(null);

  const handleMouseEnter = () => {
    if (!cardRef.current || selected) return;
    gsap.to(cardRef.current, { y: -2, scale: 1.01, duration: 0.2, ease: 'power2.out' });
  };

  const handleMouseLeave = () => {
    if (!cardRef.current || selected) return;
    gsap.to(cardRef.current, { y: 0, scale: 1, duration: 0.2, ease: 'power2.out' });
  };

  const handleClick = () => {
    if (cardRef.current) {
      gsap.fromTo(
        cardRef.current,
        { scale: 0.97 },
        { scale: selected ? 1 : 1.01, duration: 0.22, ease: 'power2.out' },
      );
    }
    onClick?.();
  };

  return (
    <button
      ref={cardRef}
      type="button"
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={cn(
        'w-full text-left transition-all duration-200',
        compact ? 'p-3 rounded-[var(--radius-md)]' : 'p-4 rounded-[var(--radius-lg)]',
        selected
          ? 'bg-[var(--accent-soft)] shadow-soft'
          : 'bg-[var(--bg-card)] hover:bg-[var(--bg-secondary)] shadow-[var(--shadow-soft)]',
        !colleague.enabled && 'opacity-50',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <ColleagueAvatar
          agentId={colleague.id}
          name={colleague.name}
          size={compact ? 'sm' : 'md'}
          selected={selected}
          online={colleague.enabled}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-display font-semibold text-sm text-[var(--text-primary)] truncate">
              {colleague.name}
            </span>
            {colleague.id === 'default-agent' && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-brand-100 dark:bg-brand-900/40 text-brand-600 dark:text-brand-300">
                {t('agents.default')}
              </span>
            )}
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-0.5 line-clamp-2">
            {lastMessage ?? colleague.description ?? t('agents.noDescription')}
          </p>
        </div>
      </div>
    </button>
  );
}
