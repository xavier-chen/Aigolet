import { NavLink } from 'react-router-dom';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Home,
  MessageSquare,
  Target,
  Brain,
  FileText,
  Wallet,
  Clock,
  Sparkles,
  UserCog,
  ListTodo,
  Shield,
  Puzzle,
  Settings,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const primaryLinks = [
  { to: '/', icon: Home, key: 'home' },
  { to: '/chat', icon: MessageSquare, key: 'chat' },
  { to: '/goals', icon: Target, key: 'goals' },
  { to: '/brain', icon: Brain, key: 'brain' },
  { to: '/artifacts', icon: FileText, key: 'artifacts' },
  { to: '/finance', icon: Wallet, key: 'finance' },
  { to: '/timeline', icon: Clock, key: 'timeline' },
  { to: '/secretary', icon: Sparkles, key: 'secretary' },
] as const;

const advancedLinks = [
  { to: '/agents', icon: UserCog, key: 'agents' },
  { to: '/tasks', icon: ListTodo, key: 'tasks' },
  { to: '/audit', icon: Shield, key: 'audit' },
  { to: '/skills', icon: Puzzle, key: 'skills' },
  { to: '/settings', icon: Settings, key: 'settings' },
] as const;

function NavItem({ to, icon: Icon, label }: { to: string; icon: typeof Home; label: string }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        cn(
          'nav-item flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
          isActive
            ? 'bg-gradient-to-r from-brand-50 to-orange-50 dark:from-brand-900/30 dark:to-orange-900/20 text-brand-600 dark:text-brand-300 shadow-sm'
            : 'text-[var(--text-muted)] hover:bg-white/60 dark:hover:bg-white/5 hover:text-[var(--text-primary)]',
        )
      }
    >
      <Icon className="w-4 h-4" />
      {label}
    </NavLink>
  );
}

export function Sidebar() {
  const { t } = useTranslation();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const isMac = window.electron?.platform === 'darwin';

  return (
    <aside className="w-64 shrink-0 flex flex-col p-4 gap-2 bg-[var(--bg-sidebar)] backdrop-blur-xl border-r border-[var(--border)] overflow-y-auto">
      <div
        className={cn(
          'flex items-center gap-3 px-3 py-4 mb-2',
          isMac && 'drag-region items-end pt-10 h-[4.75rem]',
        )}
      >
        <div className="no-drag w-10 h-10 rounded-xl bg-gradient-to-br from-brand-400 to-orange-500 flex items-center justify-center shadow-soft">
          <Sparkles className="w-5 h-5 text-white" />
        </div>
        <div className="no-drag">
          <div className="font-display font-bold text-lg gradient-text">{t('app.name')}</div>
          <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Founder OS</div>
        </div>
      </div>

      <nav className="flex flex-col gap-1 no-drag">
        {primaryLinks.map(({ to, icon, key }) => (
          <NavItem key={to} to={to} icon={icon} label={t(`nav.${key}`)} />
        ))}

        <button
          type="button"
          onClick={() => setAdvancedOpen((o) => !o)}
          className="flex items-center gap-2 px-3 py-2 mt-3 text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider hover:text-[var(--text-primary)]"
        >
          {advancedOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          {t('nav.advanced')}
        </button>

        {advancedOpen &&
          advancedLinks.map(({ to, icon, key }) => (
            <NavItem key={to} to={to} icon={icon} label={t(`nav.${key}`)} />
          ))}
      </nav>
    </aside>
  );
}
