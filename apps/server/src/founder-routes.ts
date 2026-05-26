import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Hono } from 'hono';
import type { ModelGateway } from '@aigolet-next/model-gateway';
import type { FounderStores, PersistentStores } from '@aigolet-next/persistence';
import type { LlmProviderConfig } from '@aigolet-next/protocol';
import {
  breakdownGoalWithLlm,
  buildBrainSummary,
  buildHeuristicTodayPlan,
  buildRiskRadar,
  buildTimeline,
  computeRunwaySummary,
  generateArtifact,
  generateBriefing,
  generateTodayPlanWithLlm,
  quickCaptureFromText,
  scanAndCreateProposals,
} from '@aigolet-next/founder';
import { resolveWorkspaceDir } from '@aigolet-next/persistence';

export interface FounderRouteDeps {
  stores: PersistentStores;
  modelGateway: ModelGateway;
  getLlmConfig: () => LlmProviderConfig;
  workspaceDir?: string;
  onBrainChange?: (entity: string) => void;
}

export function createFounderRoutes(deps: FounderRouteDeps): Hono {
  const app = new Hono();
  const founder: FounderStores = deps.stores.founder;
  const workspaceDir = deps.workspaceDir ?? resolveWorkspaceDir();
  const notifyBrain = (entity: string) => deps.onBrainChange?.(entity);

  app.get('/api/founder/today', (c) => {
    const locale = c.req.query('locale') ?? 'zh';
    const cached = founder.settingsStore.getTodayCache();
    if (cached) {
      try {
        const plan = JSON.parse(cached) as { generatedAt: string };
        const age = Date.now() - new Date(plan.generatedAt).getTime();
        if (age < 4 * 3600_000) {
          return c.json({
            plan: JSON.parse(cached),
            risks: buildRiskRadar(founder),
            runway: computeRunwaySummary(
              founder.settingsStore.getBalance(),
              founder.settingsStore.getCurrency(),
              founder.transactionStore.list(),
            ),
            quarterGoals: founder.goalStore.list('quarter'),
            weekGoals: founder.goalStore.list('week'),
            pendingDecisions: founder.decisionStore.listPending(),
            proposals: founder.proposalStore.list('pending'),
          });
        }
      } catch {
        // refresh below
      }
    }

    const plan = buildHeuristicTodayPlan(founder, locale);
    founder.settingsStore.setTodayCache(JSON.stringify(plan));
    scanAndCreateProposals(founder);

    return c.json({
      plan,
      risks: buildRiskRadar(founder),
      runway: computeRunwaySummary(
        founder.settingsStore.getBalance(),
        founder.settingsStore.getCurrency(),
        founder.transactionStore.list(),
      ),
      quarterGoals: founder.goalStore.list('quarter'),
      weekGoals: founder.goalStore.list('week'),
      pendingDecisions: founder.decisionStore.listPending(),
      proposals: founder.proposalStore.list('pending'),
    });
  });

  app.post('/api/founder/today/refresh', async (c) => {
    const body = await c.req.json<{ locale?: string }>().catch(() => ({ locale: 'zh' }));
    const locale = body.locale ?? 'zh';
    const llm = deps.getLlmConfig();
    let plan;
    if (llm.providerType !== 'stub') {
      plan = await generateTodayPlanWithLlm(founder, deps.modelGateway, llm.modelName, locale);
    } else {
      plan = buildHeuristicTodayPlan(founder, locale);
    }
    founder.settingsStore.setTodayCache(JSON.stringify(plan));
    scanAndCreateProposals(founder);
    return c.json({ plan });
  });

  app.post('/api/founder/briefing/morning', async (c) => {
    const body = await c.req.json<{ locale?: string }>().catch(() => ({ locale: 'zh' }));
    const llm = deps.getLlmConfig();
    const briefing = await generateBriefing(
      founder,
      deps.modelGateway,
      llm.modelName,
      'morning',
      body.locale ?? 'zh',
    );
    return c.json({ briefing });
  });

  app.post('/api/founder/briefing/evening', async (c) => {
    const body = await c.req.json<{ locale?: string }>().catch(() => ({ locale: 'zh' }));
    const llm = deps.getLlmConfig();
    const briefing = await generateBriefing(
      founder,
      deps.modelGateway,
      llm.modelName,
      'evening',
      body.locale ?? 'zh',
    );
    return c.json({ briefing });
  });

  // Goals
  app.get('/api/goals', (c) => {
    const horizon = c.req.query('horizon');
    return c.json({ goals: founder.goalStore.list(horizon as 'year' | 'quarter' | 'week' | 'day' | undefined) });
  });

  app.post('/api/goals', async (c) => {
    const body = await c.req.json();
    if (!body.title || !body.horizon) return c.json({ error: 'title and horizon required' }, 400);
    const goal = founder.goalStore.create(body);
    return c.json({ goal }, 201);
  });

  app.patch('/api/goals/:id', async (c) => {
    const body = await c.req.json();
    const goal = founder.goalStore.update(c.req.param('id'), body);
    if (!goal) return c.json({ error: 'Not found' }, 404);
    return c.json({ goal });
  });

  app.delete('/api/goals/:id', (c) => {
    if (!founder.goalStore.delete(c.req.param('id'))) return c.json({ error: 'Not found' }, 404);
    return c.json({ ok: true });
  });

  app.post('/api/goals/breakdown', async (c) => {
    const body = await c.req.json<{ goalId?: string; locale?: string }>();
    if (!body.goalId) return c.json({ error: 'goalId required' }, 400);
    const llm = deps.getLlmConfig();
    if (llm.providerType === 'stub') {
      return c.json({ error: 'LLM not configured' }, 503);
    }
    try {
      const result = await breakdownGoalWithLlm(
        founder,
        deps.modelGateway,
        llm.modelName,
        body.goalId,
        body.locale,
      );
      return c.json(result);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  // Brain - decisions
  app.get('/api/brain/summary', (c) => {
    return c.json({ summary: buildBrainSummary(founder) });
  });

  app.post('/api/brain/quick-capture', async (c) => {
    const body = (await c.req.json<{ text?: string; locale?: string }>().catch(() => ({
      text: undefined,
      locale: undefined,
    }))) as { text?: string; locale?: string };
    if (!body.text?.trim()) return c.json({ error: 'text required' }, 400);
    const llm = deps.getLlmConfig();
    try {
      const result = await quickCaptureFromText(
        founder,
        deps.modelGateway,
        llm.modelName,
        body.text,
        body.locale,
      );
      notifyBrain(result.type);
      return c.json(result, 201);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  app.get('/api/brain/decisions', (c) => {
    return c.json({ decisions: founder.decisionStore.list() });
  });

  app.post('/api/brain/decisions', async (c) => {
    const body = await c.req.json();
    if (!body.title) return c.json({ error: 'title required' }, 400);
    const decision = founder.decisionStore.create(body);
    notifyBrain('decision');
    return c.json({ decision }, 201);
  });

  app.patch('/api/brain/decisions/:id', async (c) => {
    const decision = founder.decisionStore.update(c.req.param('id'), await c.req.json());
    if (!decision) return c.json({ error: 'Not found' }, 404);
    notifyBrain('decision');
    return c.json({ decision });
  });

  app.delete('/api/brain/decisions/:id', (c) => {
    if (!founder.decisionStore.delete(c.req.param('id'))) return c.json({ error: 'Not found' }, 404);
    notifyBrain('decision');
    return c.json({ ok: true });
  });

  // Brain - customers
  app.get('/api/brain/customers', (c) => {
    return c.json({ customers: founder.customerStore.list() });
  });

  app.post('/api/brain/customers', async (c) => {
    const body = await c.req.json();
    if (!body.name) return c.json({ error: 'name required' }, 400);
    const customer = founder.customerStore.create({ stage: 'lead', lastContact: new Date().toISOString(), ...body });
    notifyBrain('customer');
    return c.json({ customer }, 201);
  });

  app.patch('/api/brain/customers/:id', async (c) => {
    const customer = founder.customerStore.update(c.req.param('id'), await c.req.json());
    if (!customer) return c.json({ error: 'Not found' }, 404);
    notifyBrain('customer');
    return c.json({ customer });
  });

  app.delete('/api/brain/customers/:id', (c) => {
    if (!founder.customerStore.delete(c.req.param('id'))) return c.json({ error: 'Not found' }, 404);
    notifyBrain('customer');
    return c.json({ ok: true });
  });

  // Brain - principles
  app.get('/api/brain/principles', (c) => {
    return c.json({ principles: founder.principleStore.list() });
  });

  app.post('/api/brain/principles', async (c) => {
    const body = await c.req.json();
    if (!body.content) return c.json({ error: 'content required' }, 400);
    const principle = founder.principleStore.create({
      category: body.category ?? 'other',
      content: body.content,
    });
    notifyBrain('principle');
    return c.json({ principle }, 201);
  });

  app.patch('/api/brain/principles/:id', async (c) => {
    const body = await c.req.json();
    const principle = founder.principleStore.update(c.req.param('id'), body);
    if (!principle) return c.json({ error: 'Not found' }, 404);
    notifyBrain('principle');
    return c.json({ principle });
  });

  app.delete('/api/brain/principles/:id', (c) => {
    if (!founder.principleStore.delete(c.req.param('id'))) return c.json({ error: 'Not found' }, 404);
    notifyBrain('principle');
    return c.json({ ok: true });
  });

  // Brain - retrospectives
  app.get('/api/brain/retrospectives', (c) => {
    return c.json({ retrospectives: founder.retrospectiveStore.list() });
  });

  app.post('/api/brain/retrospectives', async (c) => {
    const body = await c.req.json();
    if (!body.title) return c.json({ error: 'title required' }, 400);
    const retro = founder.retrospectiveStore.create(body);
    notifyBrain('retrospective');
    return c.json({ retrospective: retro }, 201);
  });

  app.patch('/api/brain/retrospectives/:id', async (c) => {
    const retro = founder.retrospectiveStore.update(c.req.param('id'), await c.req.json());
    if (!retro) return c.json({ error: 'Not found' }, 404);
    notifyBrain('retrospective');
    return c.json({ retrospective: retro });
  });

  app.delete('/api/brain/retrospectives/:id', (c) => {
    if (!founder.retrospectiveStore.delete(c.req.param('id'))) return c.json({ error: 'Not found' }, 404);
    notifyBrain('retrospective');
    return c.json({ ok: true });
  });

  app.get('/api/brain/search', async (c) => {
    const q = c.req.query('q')?.trim();
    if (!q) return c.json({ error: 'q required' }, 400);
    const memoryHits = await deps.stores.memoryStore.retrieve({
      namespace: { tenantId: 'default', userId: 'founder' },
      query: q,
      limit: 5,
    });

    return c.json({
      decisions: founder.decisionStore.search(q),
      customers: founder.customerStore.search(q),
      principles: founder.principleStore.search(q),
      retrospectives: founder.retrospectiveStore.search(q),
      memories: memoryHits,
    });
  });

  // Artifacts
  app.get('/api/artifacts', (c) => {
    return c.json({ artifacts: founder.artifactStore.list() });
  });

  app.get('/api/artifacts/:id', (c) => {
    const artifact = founder.artifactStore.get(c.req.param('id'));
    if (!artifact) return c.json({ error: 'Not found' }, 404);
    let content: string | undefined;
    if (artifact.filePath) {
      try {
        content = readFileSync(join(workspaceDir, artifact.filePath), 'utf-8');
      } catch {
        content = artifact.contentPreview;
      }
    }
    return c.json({ artifact, content });
  });

  app.post('/api/artifacts/generate', async (c) => {
    const body = await c.req.json();
    if (!body.title || !body.template) return c.json({ error: 'title and template required' }, 400);
    const llm = deps.getLlmConfig();
    if (llm.providerType === 'stub') return c.json({ error: 'LLM not configured' }, 503);
    try {
      const result = await generateArtifact(founder, deps.modelGateway, llm.modelName, workspaceDir, body);
      return c.json(result, 201);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  app.delete('/api/artifacts/:id', (c) => {
    if (!founder.artifactStore.delete(c.req.param('id'))) return c.json({ error: 'Not found' }, 404);
    return c.json({ ok: true });
  });

  // Finance
  app.get('/api/finance/transactions', (c) => {
    return c.json({ transactions: founder.transactionStore.list() });
  });

  app.post('/api/finance/transactions', async (c) => {
    const body = await c.req.json();
    if (!body.type || body.amount === undefined) return c.json({ error: 'type and amount required' }, 400);
    const tx = founder.transactionStore.create({
      currency: founder.settingsStore.getCurrency(),
      date: new Date().toISOString().slice(0, 10),
      recurring: false,
      ...body,
    });
    return c.json({ transaction: tx }, 201);
  });

  app.delete('/api/finance/transactions/:id', (c) => {
    if (!founder.transactionStore.delete(c.req.param('id'))) return c.json({ error: 'Not found' }, 404);
    return c.json({ ok: true });
  });

  app.get('/api/finance/runway', (c) => {
    return c.json({
      runway: computeRunwaySummary(
        founder.settingsStore.getBalance(),
        founder.settingsStore.getCurrency(),
        founder.transactionStore.list(),
      ),
      balance: founder.settingsStore.getBalance(),
      currency: founder.settingsStore.getCurrency(),
    });
  });

  app.put('/api/finance/settings', async (c) => {
    const body = await c.req.json<{ balance?: number; currency?: string }>();
    if (body.balance !== undefined) founder.settingsStore.setBalance(body.balance);
    if (body.currency) founder.settingsStore.setCurrency(body.currency);
    return c.json({
      balance: founder.settingsStore.getBalance(),
      currency: founder.settingsStore.getCurrency(),
    });
  });

  app.get('/api/finance/reminders', (c) => {
    return c.json({ reminders: founder.reminderStore.list() });
  });

  app.post('/api/finance/reminders', async (c) => {
    const body = await c.req.json();
    if (!body.title || !body.dueDate) return c.json({ error: 'title and dueDate required' }, 400);
    const reminder = founder.reminderStore.create({ completed: false, ...body });
    return c.json({ reminder }, 201);
  });

  app.patch('/api/finance/reminders/:id', async (c) => {
    const reminder = founder.reminderStore.update(c.req.param('id'), await c.req.json());
    if (!reminder) return c.json({ error: 'Not found' }, 404);
    return c.json({ reminder });
  });

  // Proposals
  app.get('/api/proposals', (c) => {
    const status = c.req.query('status') as 'pending' | 'approved' | 'dismissed' | undefined;
    return c.json({ proposals: founder.proposalStore.list(status) });
  });

  app.post('/api/proposals/:id/approve', (c) => {
    const proposal = founder.proposalStore.updateStatus(c.req.param('id'), 'approved');
    if (!proposal) return c.json({ error: 'Not found' }, 404);
    if (proposal.relatedCustomerId) {
      founder.customerStore.update(proposal.relatedCustomerId, {
        lastContact: new Date().toISOString(),
      });
    }
    return c.json({ proposal });
  });

  app.post('/api/proposals/:id/dismiss', (c) => {
    const proposal = founder.proposalStore.updateStatus(c.req.param('id'), 'dismissed');
    if (!proposal) return c.json({ error: 'Not found' }, 404);
    return c.json({ proposal });
  });

  app.post('/api/proposals/scan', (c) => {
    const created = scanAndCreateProposals(founder);
    return c.json({ created, proposals: founder.proposalStore.list('pending') });
  });

  // Timeline
  app.get('/api/timeline', (c) => {
    const limit = Number(c.req.query('limit') ?? 50);
    return c.json({ entries: buildTimeline(founder, limit) });
  });

  return app;
}
