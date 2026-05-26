import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  FileText,
  MessageSquare,
  RefreshCw,
  Sparkles,
  Target,
  TrendingDown,
} from 'lucide-react';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { fadeInUp, staggerCards } from '@/lib/gsap';
import {
  approveProposal,
  dismissProposal,
  fetchFounderToday,
  fetchMorningBriefing,
  fetchBrainSummary,
  refreshFounderToday,
  updateDecision,
  type Decision,
  type Proposal,
  type RiskItem,
  type TodayPlan,
  type BrainSummary,
} from '@/lib/founder-api';
import { cn } from '@/lib/utils';

function ProgressBar({ value, label }: { value: number; label: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-sm">
        <span className="text-[var(--text-primary)] font-medium truncate pr-2">{label}</span>
        <span className="text-[var(--text-muted)] shrink-0">{Math.round(value)}%</span>
      </div>
      <div className="h-2 rounded-full bg-[var(--bg-secondary)] overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-brand-400 to-orange-500 transition-all duration-700"
          style={{ width: `${Math.min(100, value)}%` }}
        />
      </div>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: RiskItem['severity'] }) {
  const styles = {
    high: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    medium: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    low: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  };
  return (
    <span className={cn('text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full font-medium', styles[severity])}>
      {severity}
    </span>
  );
}

export function HomePage() {
  const { t, i18n } = useTranslation();
  const headerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [plan, setPlan] = useState<TodayPlan | null>(null);
  const [risks, setRisks] = useState<RiskItem[]>([]);
  const [quarterGoals, setQuarterGoals] = useState<Array<{ id: string; title: string; progress: number }>>([]);
  const [pendingDecisions, setPendingDecisions] = useState<Decision[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [runway, setRunway] = useState<{ monthsRemaining: number | null; lowRunway: boolean; netBurn: number } | null>(null);
  const [briefing, setBriefing] = useState<string | null>(null);
  const [brainSummary, setBrainSummary] = useState<BrainSummary | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const [data, summary] = await Promise.all([
      fetchFounderToday(i18n.language),
      fetchBrainSummary(),
    ]);
    if (data) {
      setPlan(data.plan);
      setRisks(data.risks);
      setQuarterGoals(data.quarterGoals);
      setPendingDecisions(data.pendingDecisions);
      setProposals(data.proposals);
      setRunway(data.runway);
      if (data.plan.briefing) setBriefing(data.plan.briefing);
    }
    setBrainSummary(summary);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, [i18n.language]);

  useEffect(() => {
    if (!loading && headerRef.current) fadeInUp(headerRef.current);
    if (!loading && gridRef.current) staggerCards(gridRef.current.children, { delay: 0.08 });
  }, [loading]);

  const handleRefresh = async () => {
    setRefreshing(true);
    const newPlan = await refreshFounderToday(i18n.language);
    if (newPlan) setPlan(newPlan);
    await load();
    setRefreshing(false);
  };

  const handleBriefing = async () => {
    const text = await fetchMorningBriefing(i18n.language);
    if (text) setBriefing(text);
  };

  const handleDecision = async (id: string, chosen: string) => {
    await updateDecision(id, { chosen, rationale: '快速确认' });
    await load();
  };

  const handleProposal = async (id: string, action: 'approve' | 'dismiss') => {
    if (action === 'approve') await approveProposal(id);
    else await dismissProposal(id);
    await load();
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div ref={headerRef} className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div className="space-y-1">
          <p className="text-sm text-brand-600 dark:text-brand-400 font-medium">{plan?.date ?? '—'}</p>
          <h1 className="font-display text-3xl font-bold text-[var(--text-primary)]">
            {plan?.greeting ?? t('home.greeting')}
          </h1>
          <p className="text-[var(--text-muted)]">{t('home.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void handleBriefing()}>
            <Sparkles className="w-4 h-4 mr-1.5" />
            {t('home.morningBriefing')}
          </Button>
          <Button variant="primary" size="sm" disabled={refreshing} onClick={() => void handleRefresh()}>
            <RefreshCw className={cn('w-4 h-4 mr-1.5', refreshing && 'animate-spin')} />
            {t('home.refreshToday')}
          </Button>
        </div>
      </div>

      {briefing && (
        <Card className="p-5 border-brand-200/50 dark:border-brand-800/30 bg-gradient-to-br from-brand-50/50 to-transparent dark:from-brand-900/10">
          <CardDescription className="text-xs uppercase tracking-wider mb-2">{t('home.briefingLabel')}</CardDescription>
          <p className="text-sm text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap">{briefing}</p>
        </Card>
      )}

      <div ref={gridRef} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Target className="w-5 h-5 text-brand-500" />
            <CardTitle>{t('home.top3')}</CardTitle>
          </div>
          {plan?.priorities.length ? (
            <ol className="space-y-3">
              {plan.priorities.map((p) => (
                <li key={p.rank} className="flex gap-3 items-start">
                  <span className="w-7 h-7 rounded-lg bg-brand-100 dark:bg-brand-900/40 text-brand-600 dark:text-brand-300 flex items-center justify-center text-sm font-bold shrink-0">
                    {p.rank}
                  </span>
                  <div className="min-w-0 flex-1">
                    {p.action ? (
                      <Link to={p.action} className="font-medium text-[var(--text-primary)] hover:text-brand-600">
                        {p.title}
                      </Link>
                    ) : (
                      <p className="font-medium text-[var(--text-primary)]">{p.title}</p>
                    )}
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">{p.reason}</p>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-[var(--text-muted)]">{t('home.noPriorities')}</p>
          )}
        </Card>

        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-2">
            <TrendingDown className="w-5 h-5 text-brand-500" />
            <CardTitle>{t('home.weekProgress')}</CardTitle>
          </div>
          {quarterGoals.length > 0 ? (
            <div className="space-y-4">
              {quarterGoals.slice(0, 3).map((g) => (
                <ProgressBar key={g.id} value={g.progress} label={g.title} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--text-muted)]">
              {t('home.noGoals')}{' '}
              <Link to="/goals" className="text-brand-600 hover:underline">{t('home.setGoals')}</Link>
            </p>
          )}
        </Card>

        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-brand-500" />
              <CardTitle>{t('home.pendingDecisions')}</CardTitle>
            </div>
            <Link to="/brain" className="text-xs text-brand-600 hover:underline">{t('home.viewAll')}</Link>
          </div>
          {pendingDecisions.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">{t('home.noDecisions')}</p>
          ) : (
            <ul className="space-y-3">
              {pendingDecisions.slice(0, 4).map((d) => (
                <li key={d.id} className="p-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)]">
                  <p className="text-sm font-medium text-[var(--text-primary)]">{d.title}</p>
                  <div className="flex gap-2 mt-2">
                    <Button size="sm" variant="primary" onClick={() => void handleDecision(d.id, 'approve')}>
                      {t('home.approve')}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => void handleDecision(d.id, 'defer')}>
                      {t('home.defer')}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            <CardTitle>{t('home.riskRadar')}</CardTitle>
          </div>
          {runway?.lowRunway && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
              {t('home.lowRunway', { months: runway.monthsRemaining ?? 0 })}
            </div>
          )}
          {risks.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">{t('home.noRisks')}</p>
          ) : (
            <ul className="space-y-2">
              {risks.slice(0, 5).map((r) => (
                <li key={r.id} className="flex items-start gap-2 text-sm">
                  <SeverityBadge severity={r.severity} />
                  <div>
                    <p className="text-[var(--text-primary)]">{r.title}</p>
                    {r.detail && <p className="text-xs text-[var(--text-muted)]">{r.detail}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {brainSummary && (
        <Card className="p-6 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-brand-500" />
              <CardTitle>{t('home.brainStats')}</CardTitle>
            </div>
            <Link to="/brain" className="text-xs text-brand-600 hover:underline">{t('home.viewAll')}</Link>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="px-3 py-1.5 rounded-full bg-[var(--bg-secondary)]">
              {t('brain.stats.decisions', { count: brainSummary.decisions })}
            </span>
            <span className="px-3 py-1.5 rounded-full bg-[var(--bg-secondary)]">
              {t('brain.stats.customers', { count: brainSummary.customers })}
            </span>
            {brainSummary.staleCustomers > 0 && (
              <span className="px-3 py-1.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                {t('brain.stats.stale', { count: brainSummary.staleCustomers })}
              </span>
            )}
          </div>
        </Card>
      )}

      {proposals.length > 0 && (
        <Card className="p-6 space-y-4">
          <CardTitle>{t('home.pendingConfirm')}</CardTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            {proposals.slice(0, 4).map((p) => (
              <div key={p.id} className="p-4 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)]">
                <p className="text-sm font-medium">{p.title}</p>
                {p.body && <p className="text-xs text-[var(--text-muted)] mt-1 line-clamp-2">{p.body}</p>}
                <div className="flex gap-2 mt-3">
                  <Button size="sm" variant="primary" onClick={() => void handleProposal(p.id, 'approve')}>
                    {t('home.execute')}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void handleProposal(p.id, 'dismiss')}>
                    {t('home.skip')}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-6">
        <CardTitle className="mb-4">{t('home.quickActions')}</CardTitle>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Link to="/chat">
            <Button variant="secondary" className="w-full justify-start gap-2 h-auto py-4">
              <MessageSquare className="w-5 h-5 text-brand-500" />
              <span>{t('home.actionChat')}</span>
            </Button>
          </Link>
          <Link to="/brain">
            <Button variant="secondary" className="w-full justify-start gap-2 h-auto py-4">
              <Brain className="w-5 h-5 text-brand-500" />
              <span>{t('home.actionDecision')}</span>
            </Button>
          </Link>
          <Link to="/artifacts">
            <Button variant="secondary" className="w-full justify-start gap-2 h-auto py-4">
              <FileText className="w-5 h-5 text-brand-500" />
              <span>{t('home.actionArtifacts')}</span>
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
