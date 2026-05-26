import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Clock,
  Play,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  Trash2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ColleagueAvatar } from '@/components/colleague/ColleagueAvatar';
import { staggerCards } from '@/lib/gsap';
import {
  createCronJob,
  deleteCronJob,
  fetchAgents,
  fetchCronJobs,
  parseCronNaturalLanguage,
  runCronJobNow,
  updateCronJob,
  type AgentRecord,
  type CronJobRecord,
  type CronParseProposal,
} from '@/lib/api-client';

function formatTime(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

interface TimeSecretaryPanelProps {
  secretaryId: string;
}

export function TimeSecretaryPanel({ secretaryId }: TimeSecretaryPanelProps) {
  const { t, i18n } = useTranslation();
  const jobsRef = useRef<HTMLDivElement>(null);
  const [jobs, setJobs] = useState<CronJobRecord[]>([]);
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [naturalInput, setNaturalInput] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<CronParseProposal | null>(null);
  const [name, setName] = useState('');
  const [schedule, setSchedule] = useState('0 9 * * *');
  const [message, setMessage] = useState('');
  const [agentId, setAgentId] = useState('default-agent');
  const [submitting, setSubmitting] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [jobList, agentList] = await Promise.all([
      fetchCronJobs(secretaryId),
      fetchAgents(),
    ]);
    setJobs(jobList);
    setAgents(agentList.filter((a) => a.enabled));
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, [secretaryId]);

  useEffect(() => {
    if (jobsRef.current && !loading) staggerCards(jobsRef.current.children, { delay: 0.15 });
  }, [loading]);

  const handleParse = async () => {
    if (!naturalInput.trim()) return;
    setParsing(true);
    setParseError(null);
    setProposal(null);
    const { proposal: parsed, error } = await parseCronNaturalLanguage(naturalInput.trim(), i18n.language);
    setParsing(false);
    if (error || !parsed) {
      setParseError(error?.includes('LLM not configured') ? t('cron.llmRequired') : t('cron.parseError'));
      return;
    }
    setProposal(parsed);
    setName(parsed.name);
    setSchedule(parsed.schedule);
    setMessage(parsed.message);
  };

  const createJob = async () => {
    if (!name.trim() || !message.trim()) return;
    setSubmitting(true);
    try {
      const job = await createCronJob({
        name: name.trim(),
        schedule: schedule.trim(),
        message: message.trim(),
        agentId,
        secretaryId,
        enabled: true,
      });
      if (job) {
        setProposal(null);
        setNaturalInput('');
        setName('');
        setMessage('');
        setShowAdvanced(false);
        await load();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const toggleEnabled = async (job: CronJobRecord) => {
    const updated = await updateCronJob(job.id, { enabled: !job.enabled });
    if (updated) setJobs((prev) => prev.map((j) => (j.id === job.id ? updated : j)));
  };

  const agentFor = (id: string) => agents.find((a) => a.id === id);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-lg font-semibold">{t('secretary.schedules')}</h2>
        <p className="text-sm text-[var(--text-muted)]">{t('secretary.schedulesSubtitle')}</p>
      </div>

      <Card className="space-y-4 border-amber-100 dark:border-amber-900/40 bg-gradient-to-br from-amber-50/50 to-orange-50/30 dark:from-amber-950/20 dark:to-orange-950/10">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="w-5 h-5 text-amber-500" />
          {t('cron.naturalLanguage')}
        </CardTitle>
        <textarea
          className="w-full rounded-xl border border-[var(--border)] px-4 py-3 text-sm bg-[var(--bg-card)] min-h-[80px] resize-none"
          placeholder={t('cron.naturalLanguagePlaceholder')}
          value={naturalInput}
          onChange={(e) => setNaturalInput(e.target.value)}
        />
        {parseError && <p className="text-sm text-red-600">{parseError}</p>}
        <div className="flex gap-2 flex-wrap">
          <Button onClick={() => void handleParse()} disabled={parsing || !naturalInput.trim()}>
            {parsing ? t('cron.parsing') : t('cron.parseSchedule')}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setShowAdvanced((v) => !v)}>
            {showAdvanced ? (
              <>
                <ChevronUp className="w-4 h-4" />
                {t('cron.hideAdvanced')}
              </>
            ) : (
              <>
                <ChevronDown className="w-4 h-4" />
                {t('cron.advancedMode')}
              </>
            )}
          </Button>
        </div>

        {proposal && (
          <Card className="bg-[var(--bg-card)] border-emerald-200 dark:border-emerald-800 space-y-3">
            <CardTitle className="text-base">{t('cron.previewTitle')}</CardTitle>
            <div className="grid sm:grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-[var(--text-muted)]">{t('cron.previewSchedule')}</p>
                <p className="font-mono font-medium">{proposal.schedule}</p>
              </div>
              <div>
                <p className="text-xs text-[var(--text-muted)]">{t('cron.previewDescription')}</p>
                <p>{proposal.description}</p>
              </div>
            </div>
            <select
              className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm bg-[var(--bg-card)]"
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
            >
              {agents.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <Button onClick={() => void createJob()} disabled={submitting}>{t('cron.confirmCreate')}</Button>
              <Button variant="outline" onClick={() => setProposal(null)}>{t('common.cancel')}</Button>
            </div>
          </Card>
        )}
      </Card>

      {showAdvanced && (
        <Card className="space-y-4">
          <CardTitle>{t('cron.newJob')}</CardTitle>
          <input className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm bg-[var(--bg-card)]" placeholder={t('cron.namePlaceholder')} value={name} onChange={(e) => setName(e.target.value)} />
          <input className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm font-mono bg-[var(--bg-card)]" placeholder={t('cron.schedulePlaceholder')} value={schedule} onChange={(e) => setSchedule(e.target.value)} />
          <textarea className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm bg-[var(--bg-card)] min-h-[80px]" placeholder={t('cron.messagePlaceholder')} value={message} onChange={(e) => setMessage(e.target.value)} />
          <select className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm bg-[var(--bg-card)]" value={agentId} onChange={(e) => setAgentId(e.target.value)}>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <Button onClick={() => void createJob()} disabled={submitting || !name.trim()}>{t('cron.create')}</Button>
        </Card>
      )}

      {loading ? (
        <Card className="text-center py-12 text-[var(--text-muted)]">{t('cron.loading')}</Card>
      ) : jobs.length === 0 ? (
        <Card className="text-center py-12 text-[var(--text-muted)]">{t('cron.empty')}</Card>
      ) : (
        <div ref={jobsRef} className="space-y-3">
          {jobs.map((job) => {
            const agent = agentFor(job.agentId);
            return (
              <Card key={job.id} className="p-4 space-y-3 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center">
                      <Clock className="w-5 h-5 text-amber-500" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{job.name}</CardTitle>
                      <CardDescription className="mt-1 font-mono">{job.schedule}</CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => void toggleEnabled(job)}>
                      {job.enabled ? <ToggleRight className="w-6 h-6 text-emerald-500" /> : <ToggleLeft className="w-6 h-6 text-[var(--text-muted)]" />}
                    </button>
                    <Button size="sm" variant="outline" disabled={runningId === job.id} onClick={async () => { setRunningId(job.id); await runCronJobNow(job.id); await load(); setRunningId(null); }}>
                      <Play className="w-3 h-3" />{t('cron.runNow')}
                    </Button>
                    <button type="button" onClick={async () => { if (await deleteCronJob(job.id)) setJobs((p) => p.filter((j) => j.id !== job.id)); }}>
                      <Trash2 className="w-4 h-4 text-[var(--text-muted)] hover:text-red-500" />
                    </button>
                  </div>
                </div>
                <p className="text-sm pl-[52px]">{job.message}</p>
                <div className="flex flex-wrap gap-4 text-xs text-[var(--text-muted)] pl-[52px]">
                  {agent && (
                    <span className="inline-flex items-center gap-1.5">
                      {t('cron.agent')}: <ColleagueAvatar agentId={agent.id} name={agent.name} size="sm" />{agent.name}
                    </span>
                  )}
                  <span>{t('cron.lastRun')}: {formatTime(job.lastRun)}</span>
                  <span>{t('cron.nextRun')}: {formatTime(job.nextRun)}</span>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
