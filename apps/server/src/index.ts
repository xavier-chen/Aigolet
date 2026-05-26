import type { Server as HttpServer } from 'node:http';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
import { AuditProjector, DefaultRedactionPolicy } from '@aigolet-next/audit';
import {
  createAgentRuntime,
  DEFAULT_FOUNDER_SYSTEM_PROMPT,
  registerSkillTools,
  type StreamEvent,
} from '@aigolet-next/agent-runtime';
import {
  createEmbeddingProvider,
  MemoryProjector,
  MemoryService,
} from '@aigolet-next/memory';
import { registerMcpTools } from '@aigolet-next/mcp';
import {
  applyLlmConfig,
  createDefaultModelGateway,
  testLlmConnection,
} from '@aigolet-next/model-gateway';
import { createOrchestrator } from '@aigolet-next/orchestrator';
import {
  createPersistentStores,
  filterMemoriesByRank,
  resetAllApplicationData,
  resetConversations,
  resetMemoryRecords,
  resolveDataDir,
  resolveWorkspaceDir,
  FOUNDER_VIEWER_RANK,
} from '@aigolet-next/persistence';
import type {
  Agent,
  CreateAgentInput,
  CreateCronJobInput,
  CreateMcpServerInput,
  CreateOrgNodeInput,
  CreateSecretaryInput,
  EmbeddingConfig,
  HealthResponse,
  MemoryKind,
  RunStatus,
  UpdateAgentInput,
  UpdateCronJobInput,
  UpdateMcpServerInput,
  UpdateOrgNodeInput,
  UpdateSecretaryInput,
} from '@aigolet-next/protocol';
import {
  AllowlistToolRegistry,
  createDefaultToolRegistry,
  DefaultPolicyEngine,
  OverlayToolRegistry,
  PolicyAwareToolExecutor,
} from '@aigolet-next/tools';
import { registerFounderTools, buildBrainContextBlock } from '@aigolet-next/founder';
import { listEnabledAgents, resolveAgent } from './agent-resolver.js';
import {
  secretaryAgentId,
  secretaryToRuntimeAgent,
} from './secretary-resolver.js';
import {
  canViewSession,
  getAgentRank,
  syncSessionVisibility,
} from './org-rbac.js';
import {
  createSkill,
  deleteSkill,
  getLlmConfig,
  getLlmConfigPublic,
  getSkill,
  initConfigStores,
  listSkills,
  setLlmConfig,
  updateSkill,
} from './config-store.js';
import { CronScheduler } from './cron-scheduler.js';
import { validateCronExpression, computeNextRun } from './cron-utils.js';
import { buildCronParsePrompt, parseCronParseResult } from './cron-parse.js';
import { EventBusSubscriber } from './event-bus-subscriber.js';
import { globalEventBus, publishRunEvent } from './event-bus.js';
import { runStreamHub } from './run-stream-hub.js';
import {
  saveUploadedBuffer,
  saveUploadedFileFromBlob,
  type RunAttachmentRef,
} from './file-upload.js';
import { attachWebSocketServer } from './ws-server.js';
import { createFounderRoutes } from './founder-routes.js';

const startTime = Date.now();
const PORT = Number(process.env.PORT ?? 3847);

const stores = createPersistentStores();
initConfigStores({
  llmConfigStore: stores.llmConfigStore,
  skillStore: stores.skillStore,
});

let embeddingProvider = createEmbeddingProvider(stores.embeddingConfigStore.get());
const memoryStore = stores.memoryStore;
const memoryProjector = new MemoryProjector(memoryStore);
const auditLedger = stores.auditLedger;
const auditProjector = new AuditProjector(auditLedger, new DefaultRedactionPolicy());
const eventBusSubscriber = new EventBusSubscriber();

const orchestrator = createOrchestrator({
  eventStore: stores.eventStore,
  runRepo: stores.runRepo,
  sessionRepo: stores.sessionRepo,
  sessionMessageRepo: stores.sessionMessageRepo,
  subscribers: [auditProjector, memoryProjector, eventBusSubscriber],
});

const workspaceDir = resolveWorkspaceDir();
const memoryService = new MemoryService(memoryStore, (text) => embeddingProvider.embed(text));
const baseToolRegistry = createDefaultToolRegistry({ workspaceDir, memory: memoryService });

function notifyBrainChange(entity: string): void {
  globalEventBus.publish('brain.updated', { entity });
}

registerFounderTools(baseToolRegistry, {
  stores: stores.founder,
  workspaceDir,
  onBrainChange: notifyBrainChange,
});
registerSkillTools(baseToolRegistry, listSkills().filter((s) => s.enabled));
const modelGateway = createDefaultModelGateway();
applyLlmConfig(modelGateway, getLlmConfig());

const DEFAULT_NAMESPACE = { tenantId: 'default', userId: 'founder' };

function refreshSkillTools(): void {
  for (const def of baseToolRegistry.list()) {
    if (def.id.startsWith('skill_')) {
      (baseToolRegistry as { unregister?: (id: string) => boolean }).unregister?.(def.id);
    }
  }
  registerSkillTools(baseToolRegistry, listSkills().filter((s) => s.enabled));
}

function agentSessionMetaKey(agentId: string): string {
  return `session:${agentId}:${DEFAULT_NAMESPACE.userId}`;
}

function secretarySessionMetaKey(secretaryId: string): string {
  return `session:secretary:${secretaryId}:${DEFAULT_NAMESPACE.userId}`;
}

function readAgentSessionId(agentId: string): string | null {
  const row = stores.db
    .prepare('SELECT value FROM meta WHERE key = ?')
    .get(agentSessionMetaKey(agentId)) as { value: string } | undefined;
  return row?.value ?? null;
}

function persistAgentSessionId(agentId: string, sessionId: string): void {
  stores.db
    .prepare(
      `INSERT INTO meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(agentSessionMetaKey(agentId), sessionId);
}

async function getOrCreateAgentSession(agentId: string): Promise<string> {
  const storedId = readAgentSessionId(agentId);
  if (storedId) {
    const session = await stores.sessionRepo.get(storedId);
    if (session && session.agentId === agentId) return storedId;
  }

  const sessions = await orchestrator.listSessions();
  const existing = sessions.find(
    (s) =>
      s.agentId === agentId &&
      s.namespace.tenantId === DEFAULT_NAMESPACE.tenantId &&
      s.namespace.userId === DEFAULT_NAMESPACE.userId,
  );
  if (existing) {
    persistAgentSessionId(agentId, existing.id);
    return existing.id;
  }

  const agent = resolveAgent(stores.agentStore, agentId);
  const title = agent ? `${agent.name} chat` : 'Workspace chat';
  const session = await orchestrator.createSession({
    agentId,
    title,
    namespace: { ...DEFAULT_NAMESPACE, agentId },
  });
  const rank = getAgentRank(stores.agentStore, stores.orgNodeStore, agentId);
  await stores.sessionRepo.updateVisibility(session.id, rank);
  persistAgentSessionId(agentId, session.id);
  globalEventBus.publish('agent.session.created', { agentId, sessionId: session.id });
  return session.id;
}

async function getOrCreateDefaultSession(): Promise<string> {
  return getOrCreateAgentSession('default-agent');
}

async function getOrCreateSecretarySession(secretaryId: string): Promise<string> {
  const metaKey = secretarySessionMetaKey(secretaryId);
  const row = stores.db.prepare('SELECT value FROM meta WHERE key = ?').get(metaKey) as
    | { value: string }
    | undefined;
  if (row?.value) {
    const session = await stores.sessionRepo.get(row.value);
    if (session && session.agentId === secretaryAgentId(secretaryId)) return row.value;
  }

  const secretary = stores.secretaryStore.get(secretaryId);
  if (!secretary) throw new Error(`Secretary not found: ${secretaryId}`);

  const session = await orchestrator.createSession({
    agentId: secretaryAgentId(secretaryId),
    title: `${secretary.name} chat`,
    namespace: { ...DEFAULT_NAMESPACE, agentId: secretaryAgentId(secretaryId) },
  });
  await stores.sessionRepo.updateVisibility(session.id, FOUNDER_VIEWER_RANK);
  stores.db
    .prepare(
      `INSERT INTO meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(metaKey, session.id);
  globalEventBus.publish('agent.session.created', {
    agentId: secretaryAgentId(secretaryId),
    sessionId: session.id,
    secretaryId,
  });
  return session.id;
}

async function executeRunAsync(
  runId: string,
  sessionId: string,
  agentId: string,
  message: string,
  attachments?: RunAttachmentRef[],
  secretaryId?: string,
): Promise<void> {
  applyLlmConfig(modelGateway, getLlmConfig());

  const secretary = secretaryId ? stores.secretaryStore.get(secretaryId) : null;
  const agent =
    (secretary ? secretaryToRuntimeAgent(secretary) : null) ??
    resolveAgent(stores.agentStore, agentId) ??
    ({
      id: 'default-agent',
      name: 'AI Co-founder',
      description: 'Default workspace agent',
      systemPrompt: DEFAULT_FOUNDER_SYSTEM_PROMPT,
      toolIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } satisfies Agent);

  const storedAgent = secretary ? null : stores.agentStore.get(agentId);
  const allowedTools = secretary?.allowedTools ?? storedAgent?.allowedTools;
  const allowedSkillIds = secretary?.allowedSkills ?? storedAgent?.allowedSkills;
  const agentRank = secretary
    ? FOUNDER_VIEWER_RANK
    : getAgentRank(stores.agentStore, stores.orgNodeStore, agentId);
  const enabledSkills = listSkills().filter(
    (s) => s.enabled && (!allowedSkillIds?.length || allowedSkillIds.includes(s.id)),
  );

  const overlayRegistry = new OverlayToolRegistry(baseToolRegistry);
  registerSkillTools(overlayRegistry, enabledSkills);

  let mcpCleanup: (() => Promise<void>) | undefined;
  try {
    const mcpResult = await registerMcpTools(
      overlayRegistry,
      stores.mcpServerStore.list().filter((s) => s.enabled),
    );
    mcpCleanup = mcpResult.cleanup;
  } catch (err) {
    console.error('[server] MCP registration failed:', err);
  }

  const filteredRegistry = new AllowlistToolRegistry(overlayRegistry, allowedTools);
  const runToolExecutor = new PolicyAwareToolExecutor(
    filteredRegistry,
    new DefaultPolicyEngine(new Set(), allowedTools),
  );
  const agentRuntime = createAgentRuntime({
    orchestrator,
    memory: memoryService,
    modelGateway,
    toolExecutor: runToolExecutor,
    toolRegistry: filteredRegistry,
    getLlmConfig,
    getEnabledSkillRecords: () => enabledSkills,
    filterRecalledMemories: (records) => filterMemoriesByRank(records, agentRank),
    getMemoryVisibilityLevel: () => agentRank,
  });

  const onStream = (event: StreamEvent) => {
    runStreamHub.emit(runId, event);
    publishRunEvent(event.type, { runId, ...event });
  };

  const namespace = { ...DEFAULT_NAMESPACE, agentId };

  const brainContext = await buildBrainContextBlock(stores.founder, message);

  try {
    await agentRuntime.run(
      {
        sessionId,
        agent,
        userMessage: message,
        namespace,
        attachments,
        extraSystemContext: brainContext || undefined,
      },
      onStream,
      runId,
    );
    await syncSessionVisibility(
      stores.sessionRepo,
      stores.agentStore,
      stores.orgNodeStore,
      sessionId,
      agentId,
    );
  } catch (err) {
    console.error(`[server] Run ${runId} failed:`, err);
  } finally {
    if (mcpCleanup) await mcpCleanup();
  }
}

function extractRunResponseFromOutput(run: { output?: unknown }): string | null {
  if (!run.output || typeof run.output !== 'object') return null;
  const output = run.output as { response?: string };
  return output.response ?? null;
}

const TERMINAL_RUN_STATUSES = new Set(['completed', 'failed', 'cancelled']);

const cronScheduler = new CronScheduler(stores.cronJobStore, async (job) => {
  const sessionId = await getOrCreateAgentSession(job.agentId);
  const run = await orchestrator.createRun({
    sessionId,
    agentId: job.agentId,
    payload: { message: job.message, source: 'cron', cronJobId: job.id },
  });
  globalEventBus.publish('run.created', { runId: run.id, agentId: job.agentId, cronJobId: job.id });
  await executeRunAsync(run.id, sessionId, job.agentId, job.message);
});

const app = new Hono();

app.use('*', cors());

app.get('/health', (c) => {
  const health: HealthResponse = {
    status: 'ok',
    version: '0.2.0',
    uptime: Math.floor((Date.now() - startTime) / 1000),
    services: {
      orchestrator: 'ok',
      audit: 'ok',
      memory: 'ok',
      modelGateway: 'ok',
      persistence: 'ok',
      websocket: 'ok',
      cron: 'ok',
    },
  };
  return c.json(health);
});

app.get('/api/events', async (c) => {
  const limit = Number(c.req.query('limit') ?? 50);
  const events = await orchestrator.eventStore.getAll(limit);
  return c.json({ events });
});

app.get('/api/audit', async (c) => {
  const limit = Number(c.req.query('limit') ?? 50);
  const events = await auditLedger.getAll(limit);
  return c.json({ events });
});

app.get('/api/memory', async (c) => {
  const tenantId = c.req.query('tenantId') ?? DEFAULT_NAMESPACE.tenantId;
  const userId = c.req.query('userId') ?? DEFAULT_NAMESPACE.userId;
  const agentId = c.req.query('agentId') ?? undefined;
  const kind = c.req.query('kind') as MemoryKind | undefined;
  const query = c.req.query('query') ?? undefined;
  const limit = Number(c.req.query('limit') ?? 50);

  const records = await memoryService.recall({
    namespace: { tenantId, userId, agentId },
    kind,
    query,
    limit,
  });

  return c.json({ records });
});

app.get('/api/memory/search', async (c) => {
  const q = c.req.query('q')?.trim();
  if (!q) return c.json({ error: 'q query parameter is required' }, 400);

  const tenantId = c.req.query('tenantId') ?? DEFAULT_NAMESPACE.tenantId;
  const userId = c.req.query('userId') ?? DEFAULT_NAMESPACE.userId;
  const agentId = c.req.query('agentId') ?? undefined;
  const kind = c.req.query('kind') as MemoryKind | undefined;
  const limit = Number(c.req.query('limit') ?? 20);

  let queryEmbedding: number[] | undefined;
  try {
    queryEmbedding = await embeddingProvider.embed(q);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return c.json({ error: `Embedding failed: ${error}` }, 502);
  }

  const records = await memoryStore.retrieve({
    namespace: { tenantId, userId, agentId },
    kind,
    query: q,
    queryEmbedding,
    limit,
  });

  return c.json({ query: q, records });
});

app.get('/api/agents', (c) => {
  return c.json({ agents: stores.agentStore.list() });
});

app.get('/api/agents/:id', (c) => {
  const agent = stores.agentStore.get(c.req.param('id'));
  if (!agent) return c.json({ error: 'Agent not found' }, 404);
  return c.json({ agent });
});

app.post('/api/agents', async (c) => {
  const body = await c.req.json<CreateAgentInput>();
  if (!body.name?.trim()) return c.json({ error: 'name is required' }, 400);
  const agent = stores.agentStore.create(body);
  globalEventBus.publish('agent.created', { agentId: agent.id, name: agent.name });
  return c.json({ agent }, 201);
});

app.patch('/api/agents/:id', async (c) => {
  const body = await c.req.json<UpdateAgentInput>();
  const agent = stores.agentStore.update(c.req.param('id'), body);
  if (!agent) return c.json({ error: 'Agent not found' }, 404);
  globalEventBus.publish('agent.updated', { agentId: agent.id });
  return c.json({ agent });
});

app.delete('/api/agents/:id', (c) => {
  const id = c.req.param('id');
  if (id === 'default-agent') {
    return c.json({ error: 'Cannot delete the default agent' }, 400);
  }
  const removed = stores.agentStore.delete(id);
  if (!removed) return c.json({ error: 'Agent not found or protected' }, 404);
  globalEventBus.publish('agent.deleted', { agentId: id });
  return c.json({ ok: true });
});

app.get('/api/tools', (c) => {
  return c.json({ tools: baseToolRegistry.list().map((t) => ({ id: t.id, name: t.name, description: t.description })) });
});

app.get('/api/org/nodes', (c) => {
  return c.json({ nodes: stores.orgNodeStore.list() });
});

app.get('/api/org/tree', (c) => {
  return c.json({ tree: stores.orgNodeStore.buildTree(stores.agentStore) });
});

app.post('/api/org/nodes', async (c) => {
  const body = await c.req.json<CreateOrgNodeInput>();
  if (!body.name?.trim()) return c.json({ error: 'name is required' }, 400);
  const node = stores.orgNodeStore.create(body);
  return c.json({ node }, 201);
});

app.patch('/api/org/nodes/:id', async (c) => {
  const body = await c.req.json<UpdateOrgNodeInput>();
  const node = stores.orgNodeStore.update(c.req.param('id'), body);
  if (!node) return c.json({ error: 'Org node not found' }, 404);
  return c.json({ node });
});

app.delete('/api/org/nodes/:id', (c) => {
  const removed = stores.orgNodeStore.delete(c.req.param('id'));
  if (!removed) {
    return c.json({ error: 'Org node not found or has children/agents assigned' }, 400);
  }
  return c.json({ ok: true });
});

app.get('/api/secretaries', (c) => {
  return c.json({ secretaries: stores.secretaryStore.list() });
});

app.get('/api/secretaries/:id', (c) => {
  const secretary = stores.secretaryStore.get(c.req.param('id'));
  if (!secretary) return c.json({ error: 'Secretary not found' }, 404);
  const jobs = stores.cronJobStore.listBySecretary(secretary.id);
  return c.json({ secretary, jobs });
});

app.post('/api/secretaries', async (c) => {
  const body = await c.req.json<CreateSecretaryInput>();
  if (!body.name?.trim()) return c.json({ error: 'name is required' }, 400);
  if (!body.type || !['time', 'personal', 'work'].includes(body.type)) {
    return c.json({ error: 'type must be time, personal, or work' }, 400);
  }
  const secretary = stores.secretaryStore.create(body);
  return c.json({ secretary }, 201);
});

app.patch('/api/secretaries/:id', async (c) => {
  const body = await c.req.json<UpdateSecretaryInput>();
  const secretary = stores.secretaryStore.update(c.req.param('id'), body);
  if (!secretary) return c.json({ error: 'Secretary not found' }, 404);
  return c.json({ secretary });
});

app.delete('/api/secretaries/:id', (c) => {
  const id = c.req.param('id');
  const secretary = stores.secretaryStore.get(id);
  if (!secretary) return c.json({ error: 'Secretary not found' }, 404);
  if (secretary.type === 'time') {
    const jobs = stores.cronJobStore.listBySecretary(id);
    for (const job of jobs) stores.cronJobStore.delete(job.id);
  }
  const removed = stores.secretaryStore.delete(id);
  if (!removed) return c.json({ error: 'Secretary not found' }, 404);
  return c.json({ ok: true });
});

app.get('/api/secretaries/:id/session', async (c) => {
  const secretary = stores.secretaryStore.get(c.req.param('id'));
  if (!secretary) return c.json({ error: 'Secretary not found' }, 404);
  const sessionId = await getOrCreateSecretarySession(secretary.id);
  const session = await stores.sessionRepo.get(sessionId);
  return c.json({ sessionId, session, secretaryId: secretary.id });
});

app.get('/api/agents/:id/session', async (c) => {
  const agentId = c.req.param('id');
  const agent = stores.agentStore.get(agentId);
  if (!agent) return c.json({ error: 'Agent not found' }, 404);
  const sessionId = await getOrCreateAgentSession(agentId);
  const session = await stores.sessionRepo.get(sessionId);
  return c.json({ sessionId, session });
});

app.get('/api/sessions', async (c) => {
  const sessions = await orchestrator.listSessions();
  return c.json({ sessions });
});

app.get('/api/sessions/default', async (c) => {
  const sessionId = await getOrCreateDefaultSession();
  const session = await stores.sessionRepo.get(sessionId);
  return c.json({ sessionId, session });
});

app.get('/api/sessions/:id/messages', async (c) => {
  const sessionId = c.req.param('id');
  const session = await stores.sessionRepo.get(sessionId);
  if (!session) return c.json({ error: 'Session not found' }, 404);

  const viewerAgentId = c.req.query('viewerAgentId') ?? session.agentId;
  const founderView = c.req.query('founderView') === '1';
  if (!canViewSession(stores.agentStore, stores.orgNodeStore, session, viewerAgentId, founderView)) {
    return c.json({ sessionId, messages: [], accessDenied: true }, 403);
  }

  const limit = Number(c.req.query('limit') ?? 100);
  const messages = await orchestrator.getSessionMessages(sessionId, limit);
  return c.json({ sessionId, messages });
});

app.get('/api/chat/history', async (c) => {
  const secretaryId = c.req.query('secretaryId');
  if (secretaryId) {
    const secretary = stores.secretaryStore.get(secretaryId);
    if (!secretary) return c.json({ error: 'Secretary not found' }, 404);
    const sessionId = await getOrCreateSecretarySession(secretaryId);
    const limit = Number(c.req.query('limit') ?? 100);
    const messages = await orchestrator.getSessionMessages(sessionId, limit);
    return c.json({
      sessionId,
      secretaryId,
      agentId: secretaryAgentId(secretaryId),
      messages,
    });
  }

  const agentId = c.req.query('agentId') ?? 'default-agent';
  const viewerAgentId = c.req.query('viewerAgentId') ?? agentId;
  const founderView = c.req.query('founderView') !== '0';
  const sessionId = await getOrCreateAgentSession(agentId);
  const session = await stores.sessionRepo.get(sessionId);
  if (!session) return c.json({ error: 'Session not found' }, 404);

  if (!canViewSession(stores.agentStore, stores.orgNodeStore, session, viewerAgentId, founderView)) {
    return c.json({ sessionId, agentId, messages: [], accessDenied: true }, 403);
  }

  const limit = Number(c.req.query('limit') ?? 100);
  const messages = await orchestrator.getSessionMessages(sessionId, limit);
  return c.json({ sessionId, agentId, messages });
});

app.get('/api/runs', async (c) => {
  const status = c.req.query('status') as RunStatus | undefined;
  const agentId = c.req.query('agentId') ?? undefined;
  const limit = Number(c.req.query('limit') ?? 50);
  let runs = await orchestrator.listRuns({ status, limit: agentId ? 500 : limit });
  if (agentId) {
    runs = runs.filter((r) => r.agentId === agentId).slice(0, limit);
  }
  return c.json({ runs });
});

app.get('/api/runs/stats', async (c) => {
  const agentId = c.req.query('agentId') ?? undefined;
  let runs = await orchestrator.listRuns({ limit: 500 });
  if (agentId) runs = runs.filter((r) => r.agentId === agentId);
  const stats = {
    active: runs.filter((r) => r.status === 'running').length,
    queued: runs.filter((r) => r.status === 'pending').length,
    completed: runs.filter((r) => r.status === 'completed').length,
    failed: runs.filter((r) => r.status === 'failed').length,
    cancelled: runs.filter((r) => r.status === 'cancelled').length,
    total: runs.length,
  };
  return c.json({ stats });
});

app.get('/api/runs/:id', async (c) => {
  const run = await orchestrator.getRun(c.req.param('id'));
  if (!run) return c.json({ error: 'Run not found' }, 404);
  const events = await orchestrator.eventStore.getByAggregate(run.id);
  return c.json({ run, events });
});

app.get('/api/runs/:id/events', async (c) => {
  const runId = c.req.param('id');
  const run = await orchestrator.getRun(runId);
  if (!run) return c.json({ error: 'Run not found' }, 404);
  const events = await orchestrator.eventStore.getByAggregate(runId);
  return c.json({ events });
});

app.get('/api/runs/:id/stream', async (c) => {
  const runId = c.req.param('id');
  const run = await orchestrator.getRun(runId);
  if (!run) return c.json({ error: 'Run not found' }, 404);

  return streamSSE(c, async (stream) => {
    c.header('Cache-Control', 'no-cache');
    c.header('Connection', 'keep-alive');
    c.header('X-Accel-Buffering', 'no');

    await stream.writeSSE({
      event: 'connected',
      data: JSON.stringify({ runId, status: run.status }),
    });

    if (TERMINAL_RUN_STATUSES.has(run.status)) {
      if (run.status === 'completed') {
        const response = extractRunResponseFromOutput(run);
        if (response) {
          await stream.writeSSE({
            event: 'assistant.delta',
            data: JSON.stringify({ delta: response }),
          });
        }
        await stream.writeSSE({
          event: 'run.completed',
          data: JSON.stringify({
            response: response ?? '',
            toolCallCount: (run.output as { toolCallCount?: number } | undefined)?.toolCallCount,
          }),
        });
      } else if (run.status === 'failed') {
        await stream.writeSSE({
          event: 'run.failed',
          data: JSON.stringify({ error: run.error ?? 'Run failed' }),
        });
      }
      return;
    }

    await new Promise<void>((resolve) => {
      let settled = false;
      let writeChain = Promise.resolve();
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve();
      };

      const unsubscribe = runStreamHub.subscribe(runId, (event) => {
        writeChain = writeChain.then(async () => {
          await stream.writeSSE({
            event: event.type,
            data: JSON.stringify(
              event.type === 'assistant.delta' || event.type === 'reasoning.delta'
                ? { delta: event.delta }
                : event,
            ),
          });

          if (event.type === 'run.completed' || event.type === 'run.failed') {
            unsubscribe();
            finish();
          }
        });
      });

      c.req.raw.signal.addEventListener('abort', () => {
        unsubscribe();
        finish();
      });
    });
  });
});

app.post('/api/runs', async (c) => {
  const body = await c.req.json<{
    message: string;
    sessionId?: string;
    agentId?: string;
    secretaryId?: string;
    attachments?: Array<{
      fileId: string;
      path: string;
      filename: string;
      relativePath?: string;
      mimeType?: string;
      size?: number;
    }>;
  }>();

  if (!body.message?.trim() && (!body.attachments || body.attachments.length === 0)) {
    return c.json({ error: 'message or attachments required' }, 400);
  }

  if (body.secretaryId) {
    const secretary = stores.secretaryStore.get(body.secretaryId);
    if (!secretary) return c.json({ error: 'Secretary not found' }, 404);
    if (!secretary.enabled) return c.json({ error: 'Secretary is disabled' }, 400);

    const agentId = secretaryAgentId(body.secretaryId);
    const sessionId = body.sessionId ?? (await getOrCreateSecretarySession(body.secretaryId));
    const message = body.message?.trim() ?? '';
    const attachments = body.attachments?.map((a) => ({
      fileId: a.fileId,
      path: a.path,
      filename: a.filename,
      relativePath: a.relativePath,
      mimeType: a.mimeType,
      size: a.size,
    }));

    const run = await orchestrator.createRun({
      sessionId,
      agentId,
      payload: { message, attachments, secretaryId: body.secretaryId },
    });

    globalEventBus.publish('run.created', {
      runId: run.id,
      agentId,
      sessionId,
      secretaryId: body.secretaryId,
    });
    void executeRunAsync(run.id, sessionId, agentId, message, attachments, body.secretaryId);

    return c.json({ run, sessionId, agentId, secretaryId: body.secretaryId }, 201);
  }

  const agentId = body.agentId ?? 'default-agent';
  const agent = stores.agentStore.get(agentId);
  if (!agent) return c.json({ error: 'Agent not found' }, 404);
  if (!agent.enabled) return c.json({ error: 'Agent is disabled' }, 400);

  const sessionId = body.sessionId ?? (await getOrCreateAgentSession(agentId));
  const message = body.message?.trim() ?? '';
  const attachments = body.attachments?.map((a) => ({
    fileId: a.fileId,
    path: a.path,
    filename: a.filename,
    relativePath: a.relativePath,
    mimeType: a.mimeType,
    size: a.size,
  }));

  const run = await orchestrator.createRun({
    sessionId,
    agentId,
    payload: { message, attachments },
  });

  globalEventBus.publish('run.created', { runId: run.id, agentId, sessionId });
  void executeRunAsync(run.id, sessionId, agentId, message, attachments);

  return c.json({ run, sessionId, agentId }, 201);
});

app.get('/api/cron', (c) => {
  const secretaryId = c.req.query('secretaryId');
  const jobs = secretaryId
    ? stores.cronJobStore.listBySecretary(secretaryId)
    : stores.cronJobStore.list();
  return c.json({ jobs });
});

app.post('/api/cron', async (c) => {
  const body = await c.req.json<CreateCronJobInput>();
  const validation = validateCronExpression(body.schedule ?? '');
  if (!validation.valid) {
    return c.json({ error: validation.error ?? 'Invalid cron expression' }, 400);
  }
  if (!body.name?.trim() || !body.message?.trim() || !body.agentId) {
    return c.json({ error: 'name, message, and agentId are required' }, 400);
  }
  if (!body.secretaryId) {
    return c.json({ error: 'secretaryId is required — cron jobs must belong to a time-type secretary' }, 400);
  }
  const secretary = stores.secretaryStore.get(body.secretaryId);
  if (!secretary) return c.json({ error: 'Secretary not found' }, 400);
  if (secretary.type !== 'time') {
    return c.json({ error: 'Cron jobs can only be assigned to time-type secretaries' }, 400);
  }
  if (!stores.agentStore.get(body.agentId)) {
    return c.json({ error: 'Agent not found' }, 400);
  }
  const job = stores.cronJobStore.create(body);
  const next = computeNextRun(job.schedule);
  if (next) stores.cronJobStore.setNextRun(job.id, next.toISOString());
  globalEventBus.publish('cron.created', { jobId: job.id });
  return c.json({ job: stores.cronJobStore.get(job.id) }, 201);
});

app.post('/api/cron/parse', async (c) => {
  const body = await c.req.json<{ description?: string; locale?: string }>();
  const description = body.description?.trim();
  if (!description) return c.json({ error: 'description is required' }, 400);

  const llmConfig = getLlmConfig();
  if (llmConfig.providerType === 'stub') {
    return c.json({ error: 'LLM not configured — natural language parsing requires a real provider' }, 503);
  }

  try {
    const raw = await modelGateway.complete({
      modelId: llmConfig.modelName,
      messages: [
        { role: 'system', content: buildCronParsePrompt(body.locale) },
        { role: 'user', content: description },
      ],
      temperature: 0.2,
      maxTokens: 512,
    });

    const proposal = parseCronParseResult(raw);
    if (!proposal) {
      return c.json({ error: 'Could not parse LLM response into a valid schedule' }, 422);
    }

    const validation = validateCronExpression(proposal.schedule);
    if (!validation.valid) {
      return c.json({ error: validation.error ?? 'Invalid cron expression from parser' }, 422);
    }

    return c.json({ proposal });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: `Parse failed: ${message}` }, 500);
  }
});

app.patch('/api/cron/:id', async (c) => {
  const body = await c.req.json<UpdateCronJobInput>();
  if (body.schedule) {
    const validation = validateCronExpression(body.schedule);
    if (!validation.valid) {
      return c.json({ error: validation.error ?? 'Invalid cron expression' }, 400);
    }
  }
  const job = stores.cronJobStore.update(c.req.param('id'), body);
  if (!job) return c.json({ error: 'Cron job not found' }, 404);
  if (body.schedule) {
    const next = computeNextRun(job.schedule);
    stores.cronJobStore.setNextRun(job.id, next?.toISOString() ?? null);
  }
  globalEventBus.publish('cron.updated', { jobId: job.id });
  return c.json({ job: stores.cronJobStore.get(job.id) });
});

app.delete('/api/cron/:id', (c) => {
  const removed = stores.cronJobStore.delete(c.req.param('id'));
  if (!removed) return c.json({ error: 'Cron job not found' }, 404);
  globalEventBus.publish('cron.deleted', { jobId: c.req.param('id') });
  return c.json({ ok: true });
});

app.post('/api/cron/:id/run', async (c) => {
  const result = await cronScheduler.triggerJob(c.req.param('id'));
  if (!result.ok) return c.json({ error: result.error }, 404);
  return c.json({ ok: true });
});

app.get('/api/mcp', (c) => {
  return c.json({ servers: stores.mcpServerStore.list() });
});

app.post('/api/mcp', async (c) => {
  const body = await c.req.json<CreateMcpServerInput>();
  if (!body.name?.trim() || !body.command?.trim()) {
    return c.json({ error: 'name and command are required' }, 400);
  }
  const server = stores.mcpServerStore.create(body);
  return c.json({ server }, 201);
});

app.patch('/api/mcp/:id', async (c) => {
  const body = await c.req.json<UpdateMcpServerInput>();
  const server = stores.mcpServerStore.update(c.req.param('id'), body);
  if (!server) return c.json({ error: 'MCP server not found' }, 404);
  return c.json({ server });
});

app.delete('/api/mcp/:id', (c) => {
  const removed = stores.mcpServerStore.delete(c.req.param('id'));
  if (!removed) return c.json({ error: 'MCP server not found' }, 404);
  return c.json({ ok: true });
});

app.get('/api/config/embedding', (c) => {
  const config = stores.embeddingConfigStore.get();
  return c.json({
    config: {
      providerType: config.providerType,
      modelName: config.modelName,
      hasApiKey: Boolean(config.apiKey),
    },
  });
});

app.put('/api/config/embedding', async (c) => {
  const body = await c.req.json<EmbeddingConfig>();
  const updated = stores.embeddingConfigStore.set(body);
  embeddingProvider = createEmbeddingProvider(updated);
  return c.json({
    config: {
      providerType: updated.providerType,
      modelName: updated.modelName,
      hasApiKey: Boolean(updated.apiKey),
    },
  });
});

app.post('/api/files/upload', async (c) => {
  try {
    const body = await c.req.parseBody();
    const fileField = body.file ?? body.files;
    const sessionId =
      typeof body.sessionId === 'string' && body.sessionId.trim()
        ? body.sessionId.trim()
        : undefined;

    if (!fileField) {
      return c.json({ error: 'file is required' }, 400);
    }

    const uploadOne = async (file: File) => {
      return saveUploadedFileFromBlob(stores.db, workspaceDir, file, sessionId);
    };

    if (Array.isArray(fileField)) {
      const results = await Promise.all(fileField.map((f) => uploadOne(f as File)));
      return c.json({ files: results }, 201);
    }

    const result = await uploadOne(fileField as File);
    return c.json(result, 201);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return c.json({ error }, 400);
  }
});

app.post('/api/files/upload-buffer', async (c) => {
  try {
    const body = await c.req.json<{
      filename: string;
      contentBase64: string;
      sessionId?: string;
    }>();

    if (!body.filename?.trim() || !body.contentBase64) {
      return c.json({ error: 'filename and contentBase64 are required' }, 400);
    }

    const buffer = Buffer.from(body.contentBase64, 'base64');
    const result = saveUploadedBuffer(
      stores.db,
      workspaceDir,
      buffer,
      body.filename,
      body.sessionId,
    );
    return c.json(result, 201);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return c.json({ error }, 400);
  }
});

app.post('/api/sessions', async (c) => {
  const body = await c.req.json<{
    agentId: string;
    title: string;
    tenantId: string;
    userId: string;
  }>();
  const session = await orchestrator.createSession({
    agentId: body.agentId,
    title: body.title,
    namespace: {
      tenantId: body.tenantId,
      userId: body.userId,
      agentId: body.agentId,
    },
  });
  return c.json({ session }, 201);
});

app.get('/api/config/llm', (c) => {
  return c.json({ config: getLlmConfigPublic() });
});

app.put('/api/config/llm', async (c) => {
  const body = await c.req.json<Parameters<typeof setLlmConfig>[0]>();
  const updated = setLlmConfig(body);
  applyLlmConfig(modelGateway, updated);
  return c.json({ config: getLlmConfigPublic() });
});

app.post('/api/config/llm/test', async (c) => {
  const config = getLlmConfig();
  if (config.providerType === 'stub') {
    return c.json({ ok: true, message: 'Stub provider — no network call needed.' });
  }
  if (!config.apiKey) {
    return c.json(
      { ok: false, error: 'API key not configured. Save your LLM settings first.' },
      400,
    );
  }
  try {
    const message = await testLlmConnection(config);
    return c.json({ ok: true, message });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return c.json({ ok: false, error }, 502);
  }
});

app.get('/api/skills', (c) => {
  return c.json({ skills: listSkills() });
});

app.post('/api/skills', async (c) => {
  try {
    const body = await c.req.json<Parameters<typeof createSkill>[0]>();
    const skill = createSkill(body);
    refreshSkillTools();
    return c.json({ skill }, 201);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return c.json({ error }, 400);
  }
});

app.patch('/api/skills/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json<Parameters<typeof updateSkill>[1]>();
    const skill = updateSkill(id, body);
    if (!skill) return c.json({ error: 'Skill not found' }, 404);
    refreshSkillTools();
    return c.json({ skill });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return c.json({ error }, 400);
  }
});

app.delete('/api/skills/:id', (c) => {
  const id = c.req.param('id');
  const removed = deleteSkill(id);
  if (!removed) return c.json({ error: 'Skill not found' }, 404);
  refreshSkillTools();
  return c.json({ ok: true });
});

app.get('/api/skills/:id', (c) => {
  const skill = getSkill(c.req.param('id'));
  if (!skill) return c.json({ error: 'Skill not found' }, 404);
  return c.json({ skill });
});

app.post('/api/admin/reset-memory', async (c) => {
  const deleted = resetMemoryRecords(stores.db);
  return c.json({ ok: true, deleted: { memoryRecords: deleted } });
});

app.post('/api/admin/reset-conversations', async (c) => {
  const deleted = resetConversations(stores.db);
  return c.json({ ok: true, deleted });
});

app.post('/api/admin/initialize', async (c) => {
  const deleted = resetAllApplicationData(stores.db);
  return c.json({ ok: true, deleted });
});

app.route('/', createFounderRoutes({
  stores,
  modelGateway,
  getLlmConfig,
  workspaceDir,
  onBrainChange: notifyBrainChange,
}));

console.log(`[server] Aigolet orchestrator starting on :${PORT}`);
console.log(`[server] Data directory: ${resolveDataDir()}`);
console.log(`[server] Workspace: ${workspaceDir}`);
console.log(`[server] Agents: ${listEnabledAgents(stores.agentStore).length} enabled`);

const server = serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`[server] Listening on http://localhost:${info.port}`);
  attachWebSocketServer(server as HttpServer, '/ws');
  cronScheduler.start();
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `[server] Port ${PORT} is already in use. Run "node scripts/ensure-orchestrator-port.mjs" or restart with "pnpm start".`,
    );
    process.exit(1);
  }
  throw err;
});

export { app, orchestrator, baseToolRegistry as toolRegistry };
