import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Ban,
  Bot,
  CheckCircle2,
  Clock,
  Loader2,
  User,
  Wrench,
  XCircle,
  Zap,
} from 'lucide-react';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { fadeInUp } from '@/lib/gsap';
import {
  extractRunMessage,
  extractRunResponse,
  fetchRun,
  fetchRunEvents,
  formatDuration,
  type DomainEvent,
  type RunRecord,
  type RunStatus,
} from '@/lib/api-client';
import { cn } from '@/lib/utils';

const POLL_INTERVAL_MS = 2000;
const TERMINAL_STATUSES: RunStatus[] = ['completed', 'failed', 'cancelled'];

function formatTime(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

function StatusIcon({ status }: { status: RunStatus }) {
  switch (status) {
    case 'running':
      return <Loader2 className="w-5 h-5 text-amber-500 animate-spin" />;
    case 'pending':
      return <Clock className="w-5 h-5 text-slate-400" />;
    case 'completed':
      return <CheckCircle2 className="w-5 h-5 text-emerald-500" />;
    case 'failed':
      return <XCircle className="w-5 h-5 text-red-500" />;
    case 'cancelled':
      return <Ban className="w-5 h-5 text-slate-400" />;
  }
}

function eventIcon(type: DomainEvent['type']) {
  if (type.startsWith('run.')) return Zap;
  if (type.startsWith('model.')) return Bot;
  if (type.startsWith('tool.')) return Wrench;
  if (type.startsWith('agent.')) return Bot;
  return Clock;
}

function eventColor(type: DomainEvent['type']): string {
  if (type === 'run.failed') return 'border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900';
  if (type === 'run.completed') return 'border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-900';
  if (type.startsWith('model.')) return 'border-sky-200 bg-sky-50 dark:bg-sky-950/30 dark:border-sky-900';
  if (type.startsWith('tool.')) return 'border-violet-200 bg-violet-50 dark:bg-violet-950/30 dark:border-violet-900';
  return 'border-[var(--border)] bg-[var(--bg-secondary)]';
}

function summarizeEventPayload(event: DomainEvent): string | null {
  const payload = event.payload as Record<string, unknown> | null;
  if (!payload) return null;

  if (event.type === 'run.created' || event.type === 'run.started') {
    const input = payload.input as { message?: string } | undefined;
    if (input?.message) return input.message;
  }

  if (event.type === 'run.completed') {
    const output = payload.output as { response?: string } | undefined;
    if (output?.response) return output.response.slice(0, 200);
  }

  if (event.type === 'run.failed' && typeof payload.error === 'string') {
    return payload.error;
  }

  if (event.type === 'model.request') {
    const modelId = payload.modelId;
    const userMessage = payload.userMessage;
    if (typeof userMessage === 'string') {
      return `${modelId ? String(modelId) + ' · ' : ''}${userMessage.slice(0, 160)}`;
    }
  }

  if (event.type === 'model.response' && typeof payload.content === 'string') {
    return payload.content.slice(0, 200);
  }

  if (event.type === 'tool.invoked') {
    const toolId = payload.toolId ?? (payload as { tool?: { toolId?: string } }).tool?.toolId;
    const input = payload.input;
    const inputPreview =
      typeof input === 'object' && input !== null
        ? JSON.stringify(input).slice(0, 120)
        : String(input ?? '');
    return toolId ? `${String(toolId)}(${inputPreview})` : null;
  }

  if (event.type === 'tool.completed') {
    const toolId = payload.toolId;
    const result = payload.result;
    const resultPreview =
      typeof result === 'string'
        ? result.slice(0, 120)
        : JSON.stringify(result ?? '').slice(0, 120);
    return toolId ? `${String(toolId)} → ${resultPreview}` : null;
  }

  if (event.type === 'tool.failed') {
    const toolId = payload.toolId;
    const error = payload.error;
    return toolId ? `${String(toolId)} ✗ ${String(error ?? '')}` : null;
  }

  if (event.type === 'agent.message' && typeof payload.content === 'string') {
    return payload.content.slice(0, 200);
  }

  return null;
}

function MetadataRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
      <dt className="text-xs font-medium text-[var(--text-muted)] shrink-0 sm:w-28">{label}</dt>
      <dd className={cn('text-sm text-[var(--text-primary)] break-all', mono && 'font-mono text-xs')}>
        {value}
      </dd>
    </div>
  );
}

export function RunDetailPage() {
  const { runId } = useParams<{ runId: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const headerRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  const [run, setRun] = useState<RunRecord | null>(null);
  const [events, setEvents] = useState<DomainEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const loadDetail = useCallback(async () => {
    if (!runId) return;
    const [runData, eventData] = await Promise.all([fetchRun(runId), fetchRunEvents(runId)]);
    if (!runData) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setRun(runData);
    setEvents(eventData);
    setNotFound(false);
    setLoading(false);
  }, [runId]);

  useEffect(() => {
    if (headerRef.current) fadeInUp(headerRef.current);
    void loadDetail();
  }, [loadDetail]);

  useEffect(() => {
    if (!run || TERMINAL_STATUSES.includes(run.status)) return;
    const interval = setInterval(() => void loadDetail(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [run?.status, loadDetail]);

  useEffect(() => {
    if (timelineRef.current && events.length > 0) {
      fadeInUp(timelineRef.current.children, { stagger: 0.03 });
    }
  }, [events.length]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto flex items-center gap-2 text-[var(--text-muted)] text-sm py-12">
        <Loader2 className="w-4 h-4 animate-spin" />
        {t('runDetail.loading')}
      </div>
    );
  }

  if (notFound || !run) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate('/tasks')}>
          <ArrowLeft className="w-4 h-4" />
          {t('runDetail.back')}
        </Button>
        <Card className="py-12 text-center text-[var(--text-muted)]">{t('runDetail.notFound')}</Card>
      </div>
    );
  }

  const message = extractRunMessage(run);
  const response = extractRunResponse(run);
  const duration = formatDuration(run.startedAt, run.completedAt);

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-8">
      <div ref={headerRef} className="space-y-4">
        <Link
          to="/tasks"
          className="inline-flex items-center gap-1.5 text-sm text-brand-600 hover:underline"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('runDetail.back')}
        </Link>

        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-sky-50 dark:bg-sky-950/40 flex items-center justify-center shrink-0">
            <StatusIcon status={run.status} />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-2xl font-bold text-[var(--text-primary)] truncate">
              {message || t('runDetail.untitled')}
            </h1>
            <p className="text-[var(--text-muted)] mt-1 text-sm">{t('runDetail.subtitle')}</p>
          </div>
          <span
            className={cn(
              'shrink-0 px-3 py-1 rounded-full text-xs font-medium',
              run.status === 'running' && 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
              run.status === 'pending' && 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
              run.status === 'completed' && 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
              run.status === 'failed' && 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300',
              run.status === 'cancelled' && 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
            )}
          >
            {t(`runs.status.${run.status}`)}
          </span>
        </div>
      </div>

      <Card className="p-5">
        <CardTitle className="text-base mb-4">{t('runDetail.metadata')}</CardTitle>
        <dl className="grid gap-3 sm:grid-cols-2">
          <MetadataRow label={t('runDetail.runId')} value={run.id} mono />
          <MetadataRow label={t('runs.agent')} value={run.agentId} />
          <MetadataRow label={t('runDetail.session')} value={run.sessionId} mono />
          <MetadataRow label={t('runDetail.duration')} value={duration ?? '—'} />
          <MetadataRow label={t('runs.created')} value={formatTime(run.createdAt)} />
          <MetadataRow label={t('runDetail.started')} value={formatTime(run.startedAt)} />
          <MetadataRow label={t('runDetail.completed')} value={formatTime(run.completedAt)} />
          <MetadataRow
            label={t('runs.trace')}
            value={run.correlation.traceId ?? run.correlation.correlationId}
            mono
          />
        </dl>
      </Card>

      <Card className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <User className="w-4 h-4 text-brand-500" />
          <CardTitle className="text-base">{t('runDetail.input')}</CardTitle>
        </div>
        <p className="text-sm text-[var(--text-primary)] whitespace-pre-wrap">{message || '—'}</p>
      </Card>

      {(response || run.status === 'running' || run.status === 'pending') && (
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Bot className="w-4 h-4 text-sky-500" />
            <CardTitle className="text-base">{t('runDetail.output')}</CardTitle>
          </div>
          {response ? (
            <p className="text-sm text-[var(--text-primary)] whitespace-pre-wrap">{response}</p>
          ) : (
            <p className="text-sm text-[var(--text-muted)] flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t('runDetail.outputPending')}
            </p>
          )}
        </Card>
      )}

      {run.error && (
        <Card className="p-5 border-red-200 dark:border-red-900 bg-red-50/50 dark:bg-red-950/20">
          <div className="flex items-center gap-2 mb-3">
            <XCircle className="w-4 h-4 text-red-500" />
            <CardTitle className="text-base text-red-700 dark:text-red-400">{t('runDetail.error')}</CardTitle>
          </div>
          <p className="text-sm text-red-700 dark:text-red-300 whitespace-pre-wrap">{run.error}</p>
        </Card>
      )}

      <section className="space-y-3">
        <h2 className="font-display font-semibold text-[var(--text-primary)]">{t('runDetail.timeline')}</h2>
        {events.length === 0 ? (
          <Card className="py-8 text-center text-[var(--text-muted)] text-sm">{t('runDetail.noEvents')}</Card>
        ) : (
          <div ref={timelineRef} className="relative space-y-0">
            <div className="absolute left-[19px] top-3 bottom-3 w-px bg-[var(--border)]" aria-hidden />
            {events.map((event) => {
              const Icon = eventIcon(event.type);
              const summary = summarizeEventPayload(event);
              return (
                <div key={event.id} className="relative flex gap-4 pb-4 last:pb-0">
                  <div
                    className={cn(
                      'relative z-10 w-10 h-10 rounded-xl border flex items-center justify-center shrink-0',
                      eventColor(event.type),
                    )}
                  >
                    <Icon className="w-4 h-4 text-[var(--text-primary)]" />
                  </div>
                  <Card className="flex-1 py-3 px-4 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <CardTitle className="text-sm font-mono">{t(`runDetail.eventTypes.${event.type}`)}</CardTitle>
                        <CardDescription className="mt-0.5">
                          {event.actor.displayName ?? event.actor.id} · v{event.version}
                        </CardDescription>
                        {summary && (
                          <p className="mt-2 text-xs text-[var(--text-primary)] whitespace-pre-wrap break-words line-clamp-4">
                            {summary}
                          </p>
                        )}
                      </div>
                      <time className="text-xs text-[var(--text-muted)] shrink-0">
                        {formatTime(event.occurredAt)}
                      </time>
                    </div>
                  </Card>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
