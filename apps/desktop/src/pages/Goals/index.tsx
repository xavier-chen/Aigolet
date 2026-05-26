import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Plus, Sparkles, Target } from 'lucide-react';
import { Card, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { fadeInUp, staggerCards } from '@/lib/gsap';
import {
  breakdownGoal,
  createGoal,
  fetchGoals,
  updateGoal,
  type Goal,
} from '@/lib/founder-api';
import { cn } from '@/lib/utils';

export function GoalsPage() {
  const { t, i18n } = useTranslation();
  const headerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [quarterGoals, setQuarterGoals] = useState<Goal[]>([]);
  const [weekGoals, setWeekGoals] = useState<Goal[]>([]);
  const [dayGoals, setDayGoals] = useState<Goal[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [breaking, setBreaking] = useState<string | null>(null);

  const reload = async () => {
    const [q, w, d] = await Promise.all([
      fetchGoals('quarter'),
      fetchGoals('week'),
      fetchGoals('day'),
    ]);
    setQuarterGoals(q);
    setWeekGoals(w);
    setDayGoals(d);
    setLoading(false);
  };

  useEffect(() => {
    void reload();
  }, []);

  useEffect(() => {
    if (!loading && headerRef.current) fadeInUp(headerRef.current);
    if (!loading && gridRef.current) staggerCards(gridRef.current.children, { delay: 0.1 });
  }, [loading]);

  const addQuarterGoal = async () => {
    if (!newTitle.trim() || quarterGoals.length >= 3) return;
    await createGoal({ horizon: 'quarter', title: newTitle.trim() });
    setNewTitle('');
    await reload();
  };

  const toggleDay = async (goal: Goal) => {
    const done = goal.status !== 'completed';
    await updateGoal(goal.id, {
      status: done ? 'completed' : 'active',
      progress: done ? 100 : 0,
    });
    await reload();
  };

  const handleBreakdown = async (goalId: string) => {
    setBreaking(goalId);
    await breakdownGoal(goalId, i18n.language);
    setBreaking(null);
    await reload();
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div ref={headerRef} className="space-y-2">
        <p className="text-sm text-brand-600 font-medium">{t('goals.label')}</p>
        <h1 className="font-display text-2xl font-bold text-[var(--text-primary)]">{t('goals.title')}</h1>
        <p className="text-[var(--text-muted)] text-sm">{t('goals.subtitle')}</p>
      </div>

      <Card className="p-6 space-y-4" ref={gridRef}>
        <div className="flex items-center gap-2">
          <Target className="w-5 h-5 text-brand-500" />
          <CardTitle>{t('goals.quarterOkrs')}</CardTitle>
          <span className="text-xs text-[var(--text-muted)]">({quarterGoals.length}/3)</span>
        </div>
        <ul className="space-y-3">
          {quarterGoals.map((g) => (
            <li key={g.id} className="p-4 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)]">
              <div className="flex justify-between gap-2">
                <div>
                  <p className="font-medium">{g.title}</p>
                  {g.description && <p className="text-xs text-[var(--text-muted)] mt-1">{g.description}</p>}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={breaking === g.id}
                  onClick={() => void handleBreakdown(g.id)}
                >
                  <Sparkles className="w-3.5 h-3.5 mr-1" />
                  {t('goals.breakdown')}
                </Button>
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-[var(--bg-primary)]">
                <div className="h-full rounded-full bg-brand-500" style={{ width: `${g.progress}%` }} />
              </div>
            </li>
          ))}
        </ul>
        {quarterGoals.length < 3 && (
          <div className="flex gap-2">
            <input
              className="flex-1 px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] text-sm"
              placeholder={t('goals.quarterPlaceholder')}
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void addQuarterGoal()}
            />
            <Button variant="primary" onClick={() => void addQuarterGoal()}>
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        )}
      </Card>

      <Card className="p-6 space-y-4">
        <CardTitle>{t('goals.weekPlan')}</CardTitle>
        {weekGoals.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">{t('goals.noWeek')}</p>
        ) : (
          <ul className="space-y-2">
            {weekGoals.map((g) => (
              <li key={g.id} className="flex items-center gap-3 p-3 rounded-xl bg-[var(--bg-secondary)]">
                <span className="text-sm flex-1">{g.title}</span>
                <span className="text-xs text-[var(--text-muted)]">{g.progress}%</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-6 space-y-4">
        <CardTitle>{t('goals.todayTasks')}</CardTitle>
        {dayGoals.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">{t('goals.noToday')}</p>
        ) : (
          <ul className="space-y-2">
            {dayGoals.map((g) => (
              <li key={g.id}>
                <button
                  type="button"
                  onClick={() => void toggleDay(g)}
                  className={cn(
                    'w-full flex items-center gap-3 p-3 rounded-xl text-left transition-colors',
                    g.status === 'completed'
                      ? 'bg-green-50 dark:bg-green-900/20 line-through opacity-70'
                      : 'bg-[var(--bg-secondary)] hover:bg-brand-50 dark:hover:bg-brand-900/10',
                  )}
                >
                  <Check className={cn('w-4 h-4', g.status === 'completed' ? 'text-green-600' : 'text-[var(--text-muted)]')} />
                  <span className="text-sm">{g.title}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
