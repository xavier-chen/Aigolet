import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ListTodo, Loader2, Clock, CheckCircle2, XCircle, Ban, ChevronRight } from 'lucide-react';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { fadeInUp } from '@/lib/gsap';
import {
  extractRunMessage,
  fetchAgents,
  fetchRuns,
  type AgentRecord,
  type RunRecord,
  type RunStatus,
} from '@/lib/api-client';
import { useEventStream } from '@/hooks/useEventStream';
import { cn } from '@/lib/utils';

const POLL_INTERVAL_MS = 3000;

function formatTime(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

function StatusIcon({ status }: { status: RunStatus }) {
  switch (status) {
    case 'running':
      return <Loader2 className="w-4 h-4 text-amber-500 animate-spin" />;
    case 'pending':
      return <Clock className="w-4 h-4 text-slate-400" />;
    case 'completed':
      return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
    case 'failed':
      return <XCircle className="w-4 h-4 text-red-500" />;
    case 'cancelled':
      return <Ban className="w-4 h-4 text-slate-400" />;
  }
}

function RunCard({ run }: { run: RunRecord }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const message = extractRunMessage(run);

  return (
    <Card
      className="flex items-start gap-4 py-4 cursor-pointer hover:border-brand-200 dark:hover:border-brand-800 transition-colors"
      onClick={() => navigate(`/tasks/${run.id}`)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          navigate(`/tasks/${run.id}`);
        }
      }}
    >
      <div className="w-10 h-10 rounded-xl bg-sky-50 dark:bg-sky-950/40 flex items-center justify-center shrink-0">
        <StatusIcon status={run.status} />
      </div>
      <div className="flex-1 min-w-0">
        <CardTitle className="text-base truncate">{message || run.id.slice(0, 8)}</CardTitle>
        <CardDescription className="mt-1">
          {t('runs.agent')}: {run.agentId} · {t('runs.created')}: {formatTime(run.createdAt)}
        </CardDescription>
        {run.error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{run.error}</p>}
        <p className="mt-1 text-xs text-[var(--text-muted)] font-mono truncate">
          {t('runs.trace')}: {run.correlation.traceId ?? run.correlation.correlationId}
        </p>
      </div>
      <div className="flex flex-col items-end gap-2 shrink-0">
        <div
          className={cn(
            'px-2.5 py-1 rounded-full text-xs font-medium',
            run.status === 'running' && 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
            run.status === 'pending' && 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
            run.status === 'completed' && 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
            run.status === 'failed' && 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300',
            run.status === 'cancelled' && 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
          )}
        >
          {t(`runs.status.${run.status}`)}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs text-brand-600"
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/tasks/${run.id}`);
          }}
        >
          {t('tasks.viewDetails')}
          <ChevronRight className="w-3 h-3" />
        </Button>
      </div>
    </Card>
  );
}

function RunSection({
  title,
  runs,
  empty,
}: {
  title: string;
  runs: RunRecord[];
  empty: string;
}) {
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (gridRef.current && runs.length > 0) {
      fadeInUp(gridRef.current.children, { stagger: 0.04 });
    }
  }, [runs.length]);

  return (
    <section className="space-y-3">
      <h2 className="font-display font-semibold text-[var(--text-primary)] flex items-center gap-2">
        {title}
        <span className="text-xs font-normal text-[var(--text-muted)]">({runs.length})</span>
      </h2>
      {runs.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)] py-4">{empty}</p>
      ) : (
        <div ref={gridRef} className="grid gap-3">
          {runs.map((run) => (
            <RunCard key={run.id} run={run} />
          ))}
        </div>
      )}
    </section>
  );
}

export function TasksPage() {
  const { t } = useTranslation();
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [agentFilter, setAgentFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const headerRef = useRef<HTMLDivElement>(null);

  const loadRuns = useCallback(async () => {
    const data = await fetchRuns({
      limit: 100,
      agentId: agentFilter || undefined,
    });
    setRuns(data);
    setLoading(false);
  }, [agentFilter]);

  const { connected } = useEventStream({
    onMessage: (msg) => {
      if (msg.event.startsWith('run.')) void loadRuns();
    },
  });

  useEffect(() => {
    void fetchAgents().then(setAgents);
  }, []);

  useEffect(() => {
    if (headerRef.current) fadeInUp(headerRef.current);
    void loadRuns();
    const interval = setInterval(
      () => void loadRuns(),
      connected ? POLL_INTERVAL_MS * 2 : POLL_INTERVAL_MS,
    );
    return () => clearInterval(interval);
  }, [loadRuns, connected]);

  const active = runs.filter((r) => r.status === 'running');
  const queued = runs.filter((r) => r.status === 'pending');
  const history = runs.filter((r) => ['completed', 'failed', 'cancelled'].includes(r.status));

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div ref={headerRef} className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[var(--text-primary)]">{t('tasks.title')}</h1>
          <p className="text-[var(--text-muted)] mt-1">{t('tasks.subtitle')}</p>
        </div>
        <select
          className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm bg-[var(--bg-card)]"
          value={agentFilter}
          onChange={(e) => setAgentFilter(e.target.value)}
        >
          <option value="">{t('tasks.allAgents')}</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-[var(--text-muted)] text-sm py-8">
          <Loader2 className="w-4 h-4 animate-spin" />
          {t('tasks.loading')}
        </div>
      ) : runs.length === 0 ? (
        <Card className="py-12 text-center">
          <ListTodo className="w-10 h-10 text-[var(--text-muted)] mx-auto mb-3" />
          <p className="text-[var(--text-muted)]">{t('tasks.empty')}</p>
        </Card>
      ) : (
        <>
          <RunSection title={t('tasks.active')} runs={active} empty={t('tasks.noActive')} />
          <RunSection title={t('tasks.queued')} runs={queued} empty={t('tasks.noQueued')} />
          <RunSection title={t('tasks.history')} runs={history} empty={t('tasks.noHistory')} />
        </>
      )}
    </div>
  );
}
