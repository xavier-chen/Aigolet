import type { CronJob } from '@aigolet-next/protocol';
import type { SqliteCronJobStore } from '@aigolet-next/persistence';
import { computeNextRun, cronMatches, validateCronExpression } from './cron-utils.js';
import { globalEventBus } from './event-bus.js';

export type CronRunHandler = (job: CronJob) => Promise<void>;

export class CronScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = new Set<string>();

  constructor(
    private readonly store: SqliteCronJobStore,
    private readonly onTrigger: CronRunHandler,
  ) {}

  start(intervalMs = 60_000): void {
    if (this.timer) return;
    void this.refreshNextRuns();
    this.timer = setInterval(() => void this.tick(), intervalMs);
    console.log('[cron] Scheduler started');
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  refreshNextRuns(): void {
    for (const job of this.store.list()) {
      if (!job.enabled) continue;
      const validation = validateCronExpression(job.schedule);
      if (!validation.valid) continue;
      const next = computeNextRun(job.schedule);
      if (next) {
        this.store.setNextRun(job.id, next.toISOString());
      }
    }
  }

  async triggerJob(jobId: string): Promise<{ ok: boolean; error?: string }> {
    const job = this.store.get(jobId);
    if (!job) return { ok: false, error: 'Cron job not found' };
    await this.executeJob(job, true);
    return { ok: true };
  }

  private async tick(): Promise<void> {
    const now = new Date();
    for (const job of this.store.list()) {
      if (!job.enabled) continue;
      if (this.running.has(job.id)) continue;
      if (!cronMatches(now, job.schedule)) continue;
      void this.executeJob(job, false);
    }
  }

  private async executeJob(job: CronJob, manual: boolean): Promise<void> {
    if (this.running.has(job.id)) return;
    this.running.add(job.id);

    const startedAt = new Date().toISOString();
    globalEventBus.publish('cron.triggered', { jobId: job.id, name: job.name, manual });

    try {
      await this.onTrigger(job);
      const next = computeNextRun(job.schedule);
      this.store.updateRunTimes(job.id, startedAt, next?.toISOString());
      globalEventBus.publish('cron.completed', { jobId: job.id, name: job.name });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      globalEventBus.publish('cron.failed', { jobId: job.id, name: job.name, error });
      console.error(`[cron] Job "${job.name}" failed:`, error);
    } finally {
      this.running.delete(job.id);
    }
  }
}
