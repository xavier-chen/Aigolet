import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ModelGateway } from '@aigolet-next/model-gateway';
import type { FounderStores } from '@aigolet-next/persistence';
import type {
  RiskItem,
  TimelineEntry,
  TodayPlan,
  TodayPriority,
} from './types.js';
import { computeRunwaySummary } from './runway.js';
import { buildGoalBreakdownPrompt, parseGoalBreakdownResponse } from './goal-breakdown-parser.js';

const MS_PER_DAY = 86_400_000;

function morningGreeting(locale: string, now: Date): string {
  const hour = now.getHours();
  const isZh = locale.startsWith('zh');
  if (hour < 12) return isZh ? '早上好，创始人' : 'Good morning, Founder';
  if (hour < 18) return isZh ? '下午好，创始人' : 'Good afternoon, Founder';
  return isZh ? '晚上好，创始人' : 'Good evening, Founder';
}

function formatDate(locale: string, now: Date): string {
  return now.toLocaleDateString(locale.startsWith('zh') ? 'zh-CN' : 'en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function buildRiskRadar(stores: FounderStores, now = new Date()): RiskItem[] {
  const risks: RiskItem[] = [];
  const balance = stores.settingsStore.getBalance();
  const currency = stores.settingsStore.getCurrency();
  const runway = computeRunwaySummary(balance, currency, stores.transactionStore.list());

  if (runway.lowRunway) {
    risks.push({
      id: 'runway-low',
      severity: 'high',
      category: 'finance',
      title: '资金跑道偏短',
      detail: `约 ${runway.monthsRemaining ?? 0} 个月（净 burn ¥${runway.netBurn}/月）`,
    });
  }

  const staleCustomers = stores.customerStore.listStale(7);
  for (const c of staleCustomers.slice(0, 3)) {
    risks.push({
      id: `customer-stale-${c.id}`,
      severity: 'medium',
      category: 'customer',
      title: `${c.name} 超过 7 天未联系`,
      detail: c.nextAction ?? c.company,
    });
  }

  const overdueGoals = stores.goalStore.list('week').filter((g) => {
    if (!g.dueDate || g.status === 'completed') return false;
    return new Date(g.dueDate) < now;
  });
  for (const g of overdueGoals.slice(0, 3)) {
    risks.push({
      id: `goal-overdue-${g.id}`,
      severity: 'medium',
      category: 'goals',
      title: `目标逾期：${g.title}`,
    });
  }

  const upcomingReminders = stores.reminderStore.listUpcoming(7);
  for (const r of upcomingReminders.slice(0, 3)) {
    risks.push({
      id: `reminder-${r.id}`,
      severity: 'low',
      category: 'reminder',
      title: r.title,
      detail: r.dueDate,
    });
  }

  return risks;
}

export function buildHeuristicTodayPlan(stores: FounderStores, locale = 'zh'): TodayPlan {
  const now = new Date();
  const priorities: TodayPriority[] = [];
  let rank = 1;

  const pendingDecisions = stores.decisionStore.listPending();
  for (const d of pendingDecisions.slice(0, 1)) {
    priorities.push({
      rank: rank++,
      title: `决策：${d.title}`,
      reason: '待你拍板的事项会阻塞后续执行',
      action: '/brain',
    });
  }

  const weekGoals = stores.goalStore.list('week').filter((g) => g.status === 'active');
  for (const g of weekGoals.slice(0, 2)) {
    priorities.push({
      rank: rank++,
      title: g.title,
      reason: g.progress < 50 ? '本周目标进度落后' : '推进本周 OKR',
      action: '/goals',
    });
  }

  const stale = stores.customerStore.listStale(7);
  if (stale[0]) {
    priorities.push({
      rank: rank++,
      title: `跟进客户 ${stale[0].name}`,
      reason: '超过 7 天未联系',
      action: '/brain',
    });
  }

  while (priorities.length < 3) {
    priorities.push({
      rank: rank++,
      title: locale.startsWith('zh') ? '和联合创始人对齐今日重点' : 'Align priorities with co-founder',
      reason: locale.startsWith('zh') ? '明确今日最重要的一件事' : 'Clarify the one thing that matters today',
      action: '/chat',
    });
  }

  return {
    greeting: morningGreeting(locale, now),
    date: formatDate(locale, now),
    priorities: priorities.slice(0, 3),
    generatedAt: now.toISOString(),
  };
}

export async function generateTodayPlanWithLlm(
  stores: FounderStores,
  modelGateway: ModelGateway,
  modelId: string,
  locale = 'zh',
): Promise<TodayPlan> {
  const base = buildHeuristicTodayPlan(stores, locale);
  const context = {
    goals: stores.goalStore.list(),
    pendingDecisions: stores.decisionStore.listPending(),
    risks: buildRiskRadar(stores),
    runway: computeRunwaySummary(
      stores.settingsStore.getBalance(),
      stores.settingsStore.getCurrency(),
      stores.transactionStore.list(),
    ),
  };

  const prompt = locale.startsWith('zh')
    ? `你是创始人 AI 幕僚。根据以下公司上下文，输出今日 Top 3 优先级 JSON 数组：
[{"rank":1,"title":"...","reason":"...","action":"/goals"}]
只输出 JSON，不要其他文字。
上下文：${JSON.stringify(context)}`
    : `You are a founder AI chief of staff. Output today's Top 3 priorities as JSON array:
[{"rank":1,"title":"...","reason":"...","action":"/goals"}]
Context: ${JSON.stringify(context)}`;

  try {
    const raw = await modelGateway.complete({
      modelId,
      messages: [
        { role: 'system', content: 'Respond with valid JSON only.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      maxTokens: 800,
    });
    const match = raw.match(/\[[\s\S]*\]/);
    if (match) {
      const parsed = JSON.parse(match[0]) as TodayPriority[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        return { ...base, priorities: parsed.slice(0, 3), generatedAt: new Date().toISOString() };
      }
    }
  } catch {
    // fallback to heuristic
  }
  return base;
}

export async function generateBriefing(
  stores: FounderStores,
  modelGateway: ModelGateway,
  modelId: string,
  kind: 'morning' | 'evening',
  locale = 'zh',
): Promise<string> {
  const context = {
    goals: stores.goalStore.list('quarter'),
    weekGoals: stores.goalStore.list('week'),
    customers: stores.customerStore.list().slice(0, 10),
    pendingDecisions: stores.decisionStore.listPending(),
    runway: computeRunwaySummary(
      stores.settingsStore.getBalance(),
      stores.settingsStore.getCurrency(),
      stores.transactionStore.list(),
    ),
    proposals: stores.proposalStore.list('pending'),
  };

  const isZh = locale.startsWith('zh');
  const instruction =
    kind === 'morning'
      ? isZh
        ? '写一段简洁的晨间简报（3-5 句），点出今日重点、风险和一条建议。'
        : 'Write a concise morning briefing (3-5 sentences) with focus, risks, and one suggestion.'
      : isZh
        ? '写一段简洁的晚间复盘（3-5 句），总结今日进展与明日建议。'
        : 'Write a concise evening wrap-up (3-5 sentences) on progress and tomorrow.';

  try {
    const raw = await modelGateway.complete({
      modelId,
      messages: [
        { role: 'system', content: instruction },
        { role: 'user', content: JSON.stringify(context) },
      ],
      temperature: 0.4,
      maxTokens: 600,
    });
    return raw.trim();
  } catch {
    return kind === 'morning'
      ? isZh
        ? '今日优先处理待决策事项与本周目标。'
        : 'Prioritize pending decisions and weekly goals today.'
      : isZh
        ? '回顾今日完成项，为明日设定单一重点。'
        : 'Review today and set one priority for tomorrow.';
  }
}

export function scanAndCreateProposals(stores: FounderStores): number {
  let created = 0;
  const existing = new Set(stores.proposalStore.list('pending').map((p) => p.title));

  for (const c of stores.customerStore.listStale(7)) {
    const title = `跟进客户：${c.name}`;
    if (existing.has(title)) continue;
    stores.proposalStore.create({
      type: 'followup',
      title,
      body: `${c.name}${c.company ? `（${c.company}）` : ''} 已超过 7 天未联系。${c.nextAction ? `建议：${c.nextAction}` : ''}`,
      relatedCustomerId: c.id,
    });
    created++;
  }

  for (const d of stores.decisionStore.listPending()) {
    const title = `待决策：${d.title}`;
    if (existing.has(title)) continue;
    stores.proposalStore.create({
      type: 'decision',
      title,
      body: d.context ?? '需要你确认方向',
    });
    created++;
  }

  return created;
}

export function buildTimeline(stores: FounderStores, limit = 50): TimelineEntry[] {
  const entries: TimelineEntry[] = [];

  for (const d of stores.decisionStore.list(limit)) {
    entries.push({
      id: d.id,
      type: 'decision',
      title: d.title,
      summary: d.chosen ? `已选：${d.chosen}` : '待决策',
      occurredAt: d.createdAt,
      link: '/brain',
    });
  }
  for (const a of stores.artifactStore.list()) {
    entries.push({
      id: a.id,
      type: 'artifact',
      title: a.title,
      summary: a.type,
      occurredAt: a.createdAt,
      link: '/artifacts',
    });
  }
  for (const g of stores.goalStore.list()) {
    if (g.status === 'completed' || g.progress >= 100) {
      entries.push({
        id: g.id,
        type: 'goal',
        title: g.title,
        summary: `${g.progress}%`,
        occurredAt: g.updatedAt,
        link: '/goals',
      });
    }
  }
  for (const tx of stores.transactionStore.list(100)) {
    entries.push({
      id: tx.id,
      type: 'transaction',
      title: tx.description ?? tx.category ?? tx.type,
      summary: `${tx.type === 'income' ? '+' : '-'}${tx.amount} ${tx.currency}`,
      occurredAt: tx.date,
      link: '/finance',
    });
  }

  entries.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
  return entries.slice(0, limit);
}

export async function buildBrainContextBlock(
  stores: FounderStores,
  query?: string,
): Promise<string> {
  const parts: string[] = [];

  if (query?.trim()) {
    const q = query.trim();
    const decisions = stores.decisionStore.search(q, 3);
    const customers = stores.customerStore.search(q, 3);
    const principles = stores.principleStore.search(q, 3);
    const retros = stores.retrospectiveStore.search(q, 3);
    if (decisions.length) {
      parts.push('相关决策：\n' + decisions.map((d) => `- ${d.title}: ${d.chosen ?? '待定'}`).join('\n'));
    }
    if (customers.length) {
      parts.push('相关客户：\n' + customers.map((c) => `- ${c.name} (${c.stage})`).join('\n'));
    }
    if (principles.length) {
      parts.push('相关原则：\n' + principles.map((p) => `- [${p.category}] ${p.content}`).join('\n'));
    }
    if (retros.length) {
      parts.push('相关复盘：\n' + retros.map((r) => `- ${r.title}: ${r.lesson ?? ''}`).join('\n'));
    }
  } else {
    const activeGoals = stores.goalStore.list('quarter').filter((g) => g.status === 'active');
    const recentDecisions = stores.decisionStore.list(3);
    const principles = stores.principleStore.list().slice(0, 8);
    if (activeGoals.length) {
      parts.push('季度目标：\n' + activeGoals.map((g) => `- ${g.title} (${g.progress}%)`).join('\n'));
    }
    if (recentDecisions.length) {
      parts.push('近期决策：\n' + recentDecisions.map((d) => `- ${d.title}`).join('\n'));
    }
    if (principles.length) {
      parts.push('经营原则：\n' + principles.map((p) => `- [${p.category}] ${p.content}`).join('\n'));
    }
  }

  return parts.length ? `公司大脑上下文：\n${parts.join('\n\n')}` : '';
}

export interface QuickCaptureResult {
  type: 'decision' | 'customer' | 'principle' | 'retrospective';
  record: unknown;
}

function heuristicQuickCapture(
  stores: FounderStores,
  text: string,
): QuickCaptureResult {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  if (/客户|跟进|contact|customer|线索/.test(trimmed)) {
    const nameMatch = trimmed.match(/(?:客户|跟进)\s*[：:]\s*([^\n，,]+)/);
    const name = nameMatch?.[1]?.trim() ?? trimmed.slice(0, 40);
    const customer = stores.customerStore.create({
      name,
      stage: 'lead',
      lastContact: new Date().toISOString(),
      notes: trimmed,
    });
    return { type: 'customer', record: customer };
  }

  if (/复盘|教训|lesson|retro/.test(lower)) {
    const retro = stores.retrospectiveStore.create({
      title: trimmed.slice(0, 60),
      whatHappened: trimmed,
      lesson: trimmed,
    });
    return { type: 'retrospective', record: retro };
  }

  if (/原则|principle|定价|品牌/.test(trimmed)) {
    const category = /定价|price/i.test(trimmed)
      ? 'pricing'
      : /品牌|brand/i.test(trimmed)
        ? 'brand'
        : 'product';
    const principle = stores.principleStore.create({ category, content: trimmed.slice(0, 200) });
    return { type: 'principle', record: principle };
  }

  const reviewDate = new Date(Date.now() + 30 * MS_PER_DAY).toISOString().slice(0, 10);
  const decision = stores.decisionStore.create({
    title: trimmed.slice(0, 80),
    context: trimmed,
    reviewDate,
  });
  return { type: 'decision', record: decision };
}

export async function quickCaptureFromText(
  stores: FounderStores,
  modelGateway: ModelGateway,
  modelId: string,
  text: string,
  locale = 'zh',
): Promise<QuickCaptureResult> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('text required');

  const prompt = locale.startsWith('zh')
    ? `从创始人粘贴的文本中提取结构化记录。只输出 JSON：
{"type":"decision|customer|principle|retrospective","data":{...}}
decision 字段: title, context, options[], chosen, rationale, assumptions, reviewDate
customer 字段: name, company, stage(lead|negotiating|won|lost), notes, nextAction
principle 字段: category(brand|product|pricing|other), content
retrospective 字段: title, whatHappened, lesson, tags[]
文本：${trimmed}`
    : `Extract structured founder brain record from pasted text. Output JSON only:
{"type":"decision|customer|principle|retrospective","data":{...}}
Text: ${trimmed}`;

  try {
    const raw = await modelGateway.complete({
      modelId,
      messages: [
        { role: 'system', content: 'Respond with valid JSON only.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
      maxTokens: 800,
    });
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]) as {
        type?: QuickCaptureResult['type'];
        data?: Record<string, unknown>;
      };
      const data = parsed.data ?? {};
      switch (parsed.type) {
        case 'customer': {
          const name = String(data.name ?? trimmed.slice(0, 40));
          const customer = stores.customerStore.create({
            name,
            company: data.company ? String(data.company) : undefined,
            stage: String(data.stage ?? 'lead'),
            lastContact: new Date().toISOString(),
            nextAction: data.nextAction ? String(data.nextAction) : undefined,
            notes: data.notes ? String(data.notes) : trimmed,
          });
          return { type: 'customer', record: customer };
        }
        case 'principle': {
          const principle = stores.principleStore.create({
            category: (data.category as 'brand' | 'product' | 'pricing' | 'other') ?? 'other',
            content: String(data.content ?? trimmed),
          });
          return { type: 'principle', record: principle };
        }
        case 'retrospective': {
          const retro = stores.retrospectiveStore.create({
            title: String(data.title ?? trimmed.slice(0, 60)),
            whatHappened: data.whatHappened ? String(data.whatHappened) : trimmed,
            lesson: data.lesson ? String(data.lesson) : undefined,
            tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
          });
          return { type: 'retrospective', record: retro };
        }
        case 'decision':
        default: {
          const reviewDate =
            (data.reviewDate ? String(data.reviewDate) : undefined) ??
            new Date(Date.now() + 30 * MS_PER_DAY).toISOString().slice(0, 10);
          const decision = stores.decisionStore.create({
            title: String(data.title ?? trimmed.slice(0, 80)),
            context: data.context ? String(data.context) : trimmed,
            options: Array.isArray(data.options) ? data.options.map(String) : undefined,
            chosen: data.chosen ? String(data.chosen) : undefined,
            rationale: data.rationale ? String(data.rationale) : undefined,
            assumptions: data.assumptions ? String(data.assumptions) : undefined,
            reviewDate,
          });
          return { type: 'decision', record: decision };
        }
      }
    }
  } catch {
    // fallback below
  }

  return heuristicQuickCapture(stores, trimmed);
}

export function buildBrainSummary(stores: FounderStores): {
  decisions: number;
  customers: number;
  principles: number;
  retrospectives: number;
  staleCustomers: number;
  pendingDecisions: number;
} {
  return {
    decisions: stores.decisionStore.list(1000).length,
    customers: stores.customerStore.list().length,
    principles: stores.principleStore.list().length,
    retrospectives: stores.retrospectiveStore.list().length,
    staleCustomers: stores.customerStore.listStale(7).length,
    pendingDecisions: stores.decisionStore.listPending().length,
  };
}

export async function breakdownGoalWithLlm(
  stores: FounderStores,
  modelGateway: ModelGateway,
  modelId: string,
  goalId: string,
  locale = 'zh',
): Promise<{ tasks: ReturnType<typeof parseGoalBreakdownResponse>; created: number }> {
  const goal = stores.goalStore.get(goalId);
  if (!goal) throw new Error('Goal not found');

  const raw = await modelGateway.complete({
    modelId,
    messages: [
      { role: 'system', content: buildGoalBreakdownPrompt(goal.title, locale) },
      { role: 'user', content: goal.description ?? goal.title },
    ],
    temperature: 0.3,
    maxTokens: 1024,
  });

  const tasks = parseGoalBreakdownResponse(raw);
  let created = 0;
  const weekEnd = new Date(Date.now() + 7 * MS_PER_DAY).toISOString().slice(0, 10);

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    stores.goalStore.create({
      horizon: 'week',
      title: task.title,
      description: task.description,
      parentId: goalId,
      dueDate: task.dueDate ?? weekEnd,
      sortOrder: i,
    });
    created++;
  }

  return { tasks, created };
}

export interface GenerateArtifactInput {
  title: string;
  type: 'pitch' | 'contract' | 'report' | 'invoice' | 'other';
  template: string;
  goalId?: string;
  customerId?: string;
}

const ARTIFACT_TEMPLATES: Record<string, string> = {
  bp: '商业计划书大纲：问题、解决方案、市场、商业模式、竞争、团队、财务预测、融资需求',
  weekly: '创始人周报：本周完成、关键指标、阻塞、下周计划',
  quote: '报价单：服务项目、单价、数量、总价、付款条款',
  contract: '合同要点清单：双方、标的、交付、付款、知识产权、保密、终止条款',
};

export async function generateArtifact(
  stores: FounderStores,
  modelGateway: ModelGateway,
  modelId: string,
  workspaceDir: string,
  input: GenerateArtifactInput,
): Promise<{ artifact: import('./types.js').Artifact; filePath: string }> {
  const templateDesc = ARTIFACT_TEMPLATES[input.template] ?? input.template;
  const raw = await modelGateway.complete({
    modelId,
    messages: [
      {
        role: 'system',
        content: `你是创始人文档助手。根据模板生成专业文档内容，使用 Markdown 格式。模板：${templateDesc}`,
      },
      { role: 'user', content: input.title },
    ],
    temperature: 0.5,
    maxTokens: 4096,
  });

  const slug = input.title.replace(/[^\w\u4e00-\u9fff]+/g, '-').slice(0, 40);
  const relPath = `artifacts/${slug}-${Date.now()}.md`;
  const fullPath = join(workspaceDir, relPath);
  mkdirSync(join(workspaceDir, 'artifacts'), { recursive: true });
  writeFileSync(fullPath, raw, 'utf-8');

  const artifact = stores.artifactStore.create({
    title: input.title,
    type: input.type,
    filePath: relPath,
    contentPreview: raw.slice(0, 500),
    goalId: input.goalId,
    customerId: input.customerId,
  });

  if (input.goalId) {
    stores.goalStore.bumpProgress(input.goalId, 5);
  }

  return { artifact, filePath: relPath };
}

export function registerFounderTools(
  registry: import('@aigolet-next/tools').ToolRegistry,
  deps: {
    stores: FounderStores;
    workspaceDir?: string;
    onBrainChange?: (entity: string) => void;
  },
): void {
  const { stores, onBrainChange } = deps;
  const notify = (entity: string) => onBrainChange?.(entity);

  registry.register(
    {
      id: 'record_decision',
      name: 'record_decision',
      description: 'Record a company decision in the brain',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          context: { type: 'string' },
          options: { type: 'array', items: { type: 'string' } },
          chosen: { type: 'string' },
          rationale: { type: 'string' },
        },
        required: ['title'],
      },
    },
    async (input) => {
      const body = input as {
        title?: string;
        context?: string;
        options?: string[];
        chosen?: string;
        rationale?: string;
      };
      if (!body.title?.trim()) throw new Error('title is required');
      const decision = stores.decisionStore.create({
        title: body.title.trim(),
        context: body.context,
        options: body.options,
        chosen: body.chosen,
        rationale: body.rationale,
      });
      notify('decision');
      return { id: decision.id, recorded: true };
    },
  );

  registry.register(
    {
      id: 'update_customer',
      name: 'update_customer',
      description: 'Create or update a customer record',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          company: { type: 'string' },
          stage: { type: 'string' },
          lastContact: { type: 'string' },
          nextAction: { type: 'string' },
          notes: { type: 'string' },
        },
        required: ['name'],
      },
    },
    async (input) => {
      const body = input as {
        id?: string;
        name?: string;
        company?: string;
        stage?: string;
        lastContact?: string;
        nextAction?: string;
        notes?: string;
      };
      if (!body.name?.trim()) throw new Error('name is required');
      if (body.id) {
        const updated = stores.customerStore.update(body.id, {
          name: body.name,
          company: body.company,
          stage: body.stage,
          lastContact: body.lastContact ?? new Date().toISOString(),
          nextAction: body.nextAction,
          notes: body.notes,
        });
        notify('customer');
        return { id: updated?.id, updated: true };
      }
      const customer = stores.customerStore.create({
        name: body.name.trim(),
        company: body.company,
        stage: body.stage ?? 'lead',
        lastContact: body.lastContact ?? new Date().toISOString(),
        nextAction: body.nextAction,
        notes: body.notes,
      });
      notify('customer');
      return { id: customer.id, created: true };
    },
  );

  registry.register(
    {
      id: 'recall_brain',
      name: 'recall_brain',
      description: 'Search company brain: decisions, customers, principles',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
        },
        required: ['query'],
      },
    },
    async (input) => {
      const query = (input as { query?: string }).query?.trim();
      if (!query) throw new Error('query is required');
      return {
        decisions: stores.decisionStore.search(query, 5),
        customers: stores.customerStore.search(query, 5),
        principles: stores.principleStore.search(query, 5),
        retrospectives: stores.retrospectiveStore.search(query, 5),
      };
    },
  );

  registry.register(
    {
      id: 'save_artifact',
      name: 'save_artifact',
      description: 'Save a document artifact to workspace and database',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          type: { type: 'string', enum: ['pitch', 'contract', 'report', 'invoice', 'other'] },
          content: { type: 'string' },
          goalId: { type: 'string' },
          customerId: { type: 'string' },
        },
        required: ['title', 'content'],
      },
    },
    async (input) => {
      const body = input as {
        title?: string;
        type?: 'pitch' | 'contract' | 'report' | 'invoice' | 'other';
        content?: string;
        goalId?: string;
        customerId?: string;
      };
      if (!body.title || !body.content) throw new Error('title and content are required');
      let filePath: string | undefined;
      if (deps.workspaceDir) {
        const slug = body.title.replace(/[^\w\u4e00-\u9fff]+/g, '-').slice(0, 40);
        const relPath = `artifacts/${slug}-${Date.now()}.md`;
        const fullPath = join(deps.workspaceDir, relPath);
        mkdirSync(join(deps.workspaceDir, 'artifacts'), { recursive: true });
        writeFileSync(fullPath, body.content, 'utf-8');
        filePath = relPath;
      }
      const artifact = stores.artifactStore.create({
        title: body.title,
        type: body.type ?? 'other',
        filePath,
        contentPreview: body.content.slice(0, 500),
        goalId: body.goalId,
        customerId: body.customerId,
      });
      if (body.goalId) stores.goalStore.bumpProgress(body.goalId, 5);
      return { id: artifact.id, filePath };
    },
  );

  registry.register(
    {
      id: 'record_transaction',
      name: 'record_transaction',
      description: 'Record income or expense transaction',
      inputSchema: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['income', 'expense'] },
          amount: { type: 'number' },
          currency: { type: 'string' },
          category: { type: 'string' },
          description: { type: 'string' },
          date: { type: 'string' },
          recurring: { type: 'boolean' },
        },
        required: ['type', 'amount'],
      },
    },
    async (input) => {
      const body = input as {
        type?: 'income' | 'expense';
        amount?: number;
        currency?: string;
        category?: string;
        description?: string;
        date?: string;
        recurring?: boolean;
      };
      if (!body.type || body.amount === undefined) throw new Error('type and amount required');
      const tx = stores.transactionStore.create({
        type: body.type,
        amount: body.amount,
        currency: body.currency ?? stores.settingsStore.getCurrency(),
        category: body.category,
        description: body.description,
        date: body.date ?? new Date().toISOString().slice(0, 10),
        recurring: body.recurring ?? false,
      });
      return { id: tx.id };
    },
  );

  registry.register(
    {
      id: 'get_runway_summary',
      name: 'get_runway_summary',
      description: 'Get financial runway summary',
      inputSchema: { type: 'object', properties: {} },
    },
    async () => {
      return computeRunwaySummary(
        stores.settingsStore.getBalance(),
        stores.settingsStore.getCurrency(),
        stores.transactionStore.list(),
      );
    },
  );
}
