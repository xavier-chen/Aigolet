const SERVER_PORT = 3847;
const BASE = `http://127.0.0.1:${SERVER_PORT}`;
export const WS_BASE = `ws://127.0.0.1:${SERVER_PORT}/ws`;

export type RunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface RunRecord {
  id: string;
  sessionId: string;
  agentId: string;
  status: RunStatus;
  input: unknown;
  output?: unknown;
  error?: string;
  correlation: { correlationId: string; traceId?: string; causationId?: string };
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
}

export interface RunStats {
  active: number;
  queued: number;
  completed: number;
  failed: number;
  cancelled: number;
  total: number;
}

export async function invokeIpc<T = unknown>(channel: string, ...args: unknown[]): Promise<T> {
  if (!window.electron?.ipcRenderer) {
    throw new Error('Electron IPC unavailable');
  }
  return window.electron.ipcRenderer.invoke(channel, ...args) as Promise<T>;
}

export async function fetchHealth(): Promise<{
  ok: boolean;
  status?: string;
  uptime?: number;
}> {
  try {
    const res = await fetch(`${BASE}/health`);
    if (!res.ok) return { ok: false };
    const data = (await res.json()) as { status: string; uptime: number };
    return { ok: true, status: data.status, uptime: data.uptime };
  } catch {
    return { ok: false };
  }
}

export async function fetchAudit(limit = 20): Promise<unknown[]> {
  try {
    const res = await fetch(`${BASE}/api/audit?limit=${limit}`);
    if (!res.ok) return [];
    const data = (await res.json()) as { events: unknown[] };
    return data.events;
  } catch {
    return [];
  }
}

export async function fetchEvents(limit = 20): Promise<unknown[]> {
  try {
    const res = await fetch(`${BASE}/api/events?limit=${limit}`);
    if (!res.ok) return [];
    const data = (await res.json()) as { events: unknown[] };
    return data.events;
  } catch {
    return [];
  }
}

export async function fetchRuns(options?: {
  status?: RunStatus;
  limit?: number;
  agentId?: string;
}): Promise<RunRecord[]> {
  try {
    const params = new URLSearchParams();
    if (options?.status) params.set('status', options.status);
    if (options?.agentId) params.set('agentId', options.agentId);
    params.set('limit', String(options?.limit ?? 50));
    const res = await fetch(`${BASE}/api/runs?${params}`);
    if (!res.ok) return [];
    const data = (await res.json()) as { runs: RunRecord[] };
    return data.runs;
  } catch {
    return [];
  }
}

export async function fetchRunStats(agentId?: string): Promise<RunStats | null> {
  try {
    const params = agentId ? `?agentId=${encodeURIComponent(agentId)}` : '';
    const res = await fetch(`${BASE}/api/runs/stats${params}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { stats: RunStats };
    return data.stats;
  } catch {
    return null;
  }
}

export async function fetchRun(id: string): Promise<RunRecord | null> {
  try {
    const res = await fetch(`${BASE}/api/runs/${id}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { run: RunRecord };
    return data.run;
  } catch {
    return null;
  }
}

export interface DomainEvent {
  id: string;
  type:
    | 'run.created'
    | 'run.started'
    | 'run.completed'
    | 'run.failed'
    | 'run.cancelled'
    | 'model.request'
    | 'model.response'
    | 'agent.message'
    | 'tool.invoked'
    | 'tool.completed'
    | 'tool.failed'
    | 'memory.staged'
    | 'memory.committed'
    | 'audit.recorded'
    | 'session.created'
    | 'session.updated';
  aggregateId: string;
  aggregateType: string;
  payload: unknown;
  correlation: { correlationId: string; traceId?: string; causationId?: string };
  actor: { type: 'user' | 'agent' | 'system'; id: string; displayName?: string };
  occurredAt: string;
  version: number;
}

export async function fetchRunEvents(runId: string): Promise<DomainEvent[]> {
  try {
    const res = await fetch(`${BASE}/api/runs/${runId}/events`);
    if (!res.ok) return [];
    const data = (await res.json()) as { events: DomainEvent[] };
    return data.events;
  } catch {
    return [];
  }
}

export function formatDuration(startedAt?: string, completedAt?: string): string | null {
  if (!startedAt) return null;
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const ms = Math.max(0, end - start);
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rem = seconds % 60;
  if (minutes < 60) return rem > 0 ? `${minutes}m ${rem}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remMin = minutes % 60;
  return remMin > 0 ? `${hours}h ${remMin}m` : `${hours}h`;
}

export interface RunAttachment {
  fileId: string;
  path: string;
  filename: string;
  relativePath?: string;
  mimeType?: string;
  size?: number;
}

export interface UploadedFileResult {
  fileId: string;
  filename: string;
  path: string;
  mimeType: string;
  size: number;
  relativePath: string;
  textPreview?: string;
}

export async function uploadFile(
  file: File,
  sessionId?: string,
): Promise<{ file: UploadedFileResult | null; error?: string }> {
  try {
    const form = new FormData();
    form.append('file', file);
    if (sessionId) form.append('sessionId', sessionId);

    const res = await fetch(`${BASE}/api/files/upload`, {
      method: 'POST',
      body: form,
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      return { file: null, error: err.error ?? `HTTP ${res.status}` };
    }

    const data = (await res.json()) as UploadedFileResult;
    return { file: data };
  } catch (err) {
    return { file: null, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function pickAndUploadFiles(sessionId?: string): Promise<{
  files: UploadedFileResult[];
  error?: string;
}> {
  if (!window.electron?.ipcRenderer) {
    return { files: [], error: 'Native file picker unavailable' };
  }
  try {
    const result = await invokeIpc<{ files: UploadedFileResult[]; error?: string }>(
      'dialog:pickAndUploadFiles',
      sessionId,
    );
    return result;
  } catch (err) {
    return { files: [], error: err instanceof Error ? err.message : String(err) };
  }
}

export async function submitRun(
  message: string,
  sessionId?: string,
  attachments?: RunAttachment[],
  agentId?: string,
  secretaryId?: string,
): Promise<{
  run: RunRecord | null;
  sessionId?: string;
  agentId?: string;
  secretaryId?: string;
  error?: string;
}> {
  try {
    const res = await fetch(`${BASE}/api/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, sessionId, attachments, agentId, secretaryId }),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      return { run: null, error: err.error ?? `HTTP ${res.status}` };
    }
    const data = (await res.json()) as {
      run: RunRecord;
      sessionId: string;
      agentId: string;
      secretaryId?: string;
    };
    return {
      run: data.run,
      sessionId: data.sessionId,
      agentId: data.agentId,
      secretaryId: data.secretaryId,
    };
  } catch (err) {
    return { run: null, error: err instanceof Error ? err.message : String(err) };
  }
}

export function extractRunResponse(run: RunRecord): string | null {
  if (run.status !== 'completed' || !run.output) return null;
  const output = run.output as { response?: string };
  return output.response ?? null;
}

export type RunStreamEventType =
  | 'connected'
  | 'assistant.delta'
  | 'reasoning.delta'
  | 'tool.start'
  | 'tool.end'
  | 'run.completed'
  | 'run.failed';

export interface RunStreamHandlers {
  onConnected?: (payload: { runId: string; status: RunStatus }) => void;
  onAssistantDelta?: (delta: string) => void;
  onReasoningDelta?: (delta: string) => void;
  onToolStart?: (payload: { toolId: string; toolCallId: string; input: unknown }) => void;
  onToolEnd?: (payload: {
    toolId: string;
    toolCallId: string;
    result?: unknown;
    error?: string;
  }) => void;
  onCompleted?: (payload: { response: string; toolCallCount?: number; reasoning?: string }) => void;
  onFailed?: (error: string) => void;
  onError?: (error: Error) => void;
  onClose?: () => void;
}

function parseSseBlock(block: string): { event: string; data: string } | null {
  let event = 'message';
  let data = '';
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) data += line.slice(5).trim();
  }
  if (!data) return null;
  return { event, data };
}

/** Subscribe to run SSE stream. Returns abort function. */
export function subscribeRunStream(runId: string, handlers: RunStreamHandlers): () => void {
  const controller = new AbortController();

  void (async () => {
    try {
      const res = await fetch(`${BASE}/api/runs/${runId}/stream`, {
        signal: controller.signal,
        headers: { Accept: 'text/event-stream' },
      });

      if (!res.ok || !res.body) {
        throw new Error(`SSE failed: HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split('\n\n');
        buffer = blocks.pop() ?? '';

        for (const block of blocks) {
          const parsed = parseSseBlock(block.trim());
          if (!parsed) continue;

          const payload = JSON.parse(parsed.data) as Record<string, unknown>;

          switch (parsed.event as RunStreamEventType) {
            case 'connected':
              handlers.onConnected?.(payload as { runId: string; status: RunStatus });
              break;
            case 'assistant.delta':
              handlers.onAssistantDelta?.(String(payload.delta ?? ''));
              await new Promise((resolve) => setTimeout(resolve, 0));
              break;
            case 'reasoning.delta':
              handlers.onReasoningDelta?.(String(payload.delta ?? ''));
              await new Promise((resolve) => setTimeout(resolve, 0));
              break;
            case 'tool.start':
              handlers.onToolStart?.(payload as { toolId: string; toolCallId: string; input: unknown });
              break;
            case 'tool.end':
              handlers.onToolEnd?.(payload as {
                toolId: string;
                toolCallId: string;
                result?: unknown;
                error?: string;
              });
              break;
            case 'run.completed':
              handlers.onCompleted?.(payload as {
                response: string;
                toolCallCount?: number;
                reasoning?: string;
              });
              handlers.onClose?.();
              return;
            case 'run.failed':
              handlers.onFailed?.(String(payload.error ?? 'Run failed'));
              handlers.onClose?.();
              return;
          }
        }
      }

      handlers.onClose?.();
    } catch (err) {
      if (!controller.signal.aborted) {
        handlers.onError?.(err instanceof Error ? err : new Error(String(err)));
      }
    }
  })();

  return () => controller.abort();
}

export function extractRunMessage(run: RunRecord): string {
  const input = run.input as { message?: string };
  return input.message ?? '';
}

export interface LlmConfigPublic {
  providerType: 'stub' | 'openai' | 'anthropic' | 'custom';
  baseUrl: string;
  modelName: string;
  hasApiKey: boolean;
}

export async function fetchLlmConfig(): Promise<LlmConfigPublic> {
  if (window.electron) {
    return invokeIpc<LlmConfigPublic>('settings:getLlmConfig');
  }
  const res = await fetch(`${BASE}/api/config/llm`);
  const data = (await res.json()) as { config: LlmConfigPublic };
  return data.config;
}

export async function saveLlmConfig(config: {
  providerType: LlmConfigPublic['providerType'];
  baseUrl: string;
  modelName: string;
  apiKey?: string;
}): Promise<LlmConfigPublic> {
  if (window.electron) {
    return invokeIpc<LlmConfigPublic>('settings:setLlmConfig', config);
  }
  const res = await fetch(`${BASE}/api/config/llm`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  const data = (await res.json()) as { config: LlmConfigPublic };
  return data.config;
}

export async function testLlmConnection(): Promise<{
  ok: boolean;
  message?: string;
  error?: string;
}> {
  try {
    const res = await fetch(`${BASE}/api/config/llm/test`, { method: 'POST' });
    const data = (await res.json()) as { ok: boolean; message?: string; error?: string };
    return data;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function isLlmNotConfiguredError(error?: string): boolean {
  if (!error) return false;
  return error.includes('LLM not configured') || error.includes('API key is required');
}

export interface SkillRecord {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  source: 'inline' | 'path';
  content?: string;
  path?: string;
  createdAt: string;
  updatedAt: string;
}

export async function fetchSkills(): Promise<SkillRecord[]> {
  try {
    const res = await fetch(`${BASE}/api/skills`);
    if (!res.ok) return [];
    const data = (await res.json()) as { skills: SkillRecord[] };
    return data.skills;
  } catch {
    return [];
  }
}

export async function createSkill(input: {
  name: string;
  description?: string;
  source: 'inline' | 'path';
  content?: string;
  path?: string;
  enabled?: boolean;
}): Promise<SkillRecord | null> {
  try {
    const res = await fetch(`${BASE}/api/skills`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { skill: SkillRecord };
    return data.skill;
  } catch {
    return null;
  }
}

export async function updateSkill(
  id: string,
  input: Partial<Pick<SkillRecord, 'name' | 'description' | 'enabled' | 'content' | 'path'>>,
): Promise<SkillRecord | null> {
  try {
    const res = await fetch(`${BASE}/api/skills/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { skill: SkillRecord };
    return data.skill;
  } catch {
    return null;
  }
}

export { BASE as API_BASE };

export interface MemoryRecord {
  id: string;
  kind: 'working' | 'episodic' | 'semantic';
  namespace: {
    tenantId: string;
    userId: string;
    taskId?: string;
    agentId?: string;
  };
  content: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  expiresAt?: string;
}

export async function fetchMemory(options?: {
  kind?: MemoryRecord['kind'];
  query?: string;
  limit?: number;
}): Promise<MemoryRecord[]> {
  try {
    const params = new URLSearchParams();
    if (options?.kind) params.set('kind', options.kind);
    if (options?.query) params.set('query', options.query);
    params.set('limit', String(options?.limit ?? 50));
    const res = await fetch(`${BASE}/api/memory?${params}`);
    if (!res.ok) return [];
    const data = (await res.json()) as { records: MemoryRecord[] };
    return data.records;
  } catch {
    return [];
  }
}

export async function fetchRunToolEvents(runId: string): Promise<DomainEvent[]> {
  const events = await fetchRunEvents(runId);
  return events.filter((e) =>
    e.type === 'tool.invoked' || e.type === 'tool.completed' || e.type === 'tool.failed',
  );
}

export interface SessionRecord {
  id: string;
  agentId: string;
  title: string;
  namespace: { tenantId: string; userId: string; taskId?: string; agentId?: string };
  status: 'active' | 'archived' | 'closed';
  createdAt: string;
  updatedAt: string;
}

export interface SessionMessageRecord {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

const SESSION_STORAGE_KEY = 'aigolet-default-session-id';

export function getStoredSessionId(): string | null {
  try {
    return localStorage.getItem(SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function storeSessionId(sessionId: string): void {
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
  } catch {
    // ignore storage errors
  }
}

export function clearStoredSessionId(): void {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // ignore storage errors
  }
}

export async function fetchDefaultSession(): Promise<{
  sessionId: string;
  session: SessionRecord | null;
}> {
  try {
    const res = await fetch(`${BASE}/api/sessions/default`);
    if (!res.ok) return { sessionId: '', session: null };
    const data = (await res.json()) as { sessionId: string; session: SessionRecord };
    return data;
  } catch {
    return { sessionId: '', session: null };
  }
}

export async function fetchSessionMessages(
  sessionId: string,
  limit = 100,
): Promise<SessionMessageRecord[]> {
  try {
    const res = await fetch(`${BASE}/api/sessions/${sessionId}/messages?limit=${limit}`);
    if (!res.ok) return [];
    const data = (await res.json()) as { messages: SessionMessageRecord[] };
    return data.messages;
  } catch {
    return [];
  }
}

export async function fetchChatHistory(agentId?: string, limit = 100): Promise<{
  sessionId: string;
  agentId?: string;
  messages: SessionMessageRecord[];
}> {
  try {
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    if (agentId) params.set('agentId', agentId);
    params.set('founderView', '1');
    const res = await fetch(`${BASE}/api/chat/history?${params}`);
    if (!res.ok) return { sessionId: '', messages: [] };
    const data = (await res.json()) as {
      sessionId: string;
      agentId?: string;
      messages: SessionMessageRecord[];
    };
    return data;
  } catch {
    return { sessionId: '', messages: [] };
  }
}

export async function resetMemory(): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${BASE}/api/admin/reset-memory`, { method: 'POST' });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: err.error ?? `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function resetConversations(): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${BASE}/api/admin/reset-conversations`, { method: 'POST' });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: err.error ?? `HTTP ${res.status}` };
    }
    clearStoredSessionId();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function resetAllApplicationData(): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${BASE}/api/admin/initialize`, { method: 'POST' });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: err.error ?? `HTTP ${res.status}` };
    }
    clearStoredSessionId();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export interface AgentRecord {
  id: string;
  name: string;
  description?: string;
  systemPrompt?: string;
  modelOverride?: string;
  enabled: boolean;
  orgNodeId?: string;
  allowedTools?: string[];
  allowedSkills?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface OrgNodeRecord {
  id: string;
  name: string;
  rank: number;
  parentId?: string;
  sortOrder: number;
  color?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrgTreeNode {
  id: string;
  name: string;
  rank: number;
  parentId?: string;
  sortOrder: number;
  color?: string;
  agents: Array<{ id: string; name: string; enabled: boolean }>;
  children: OrgTreeNode[];
}

export interface SecretaryRecord {
  id: string;
  name: string;
  type: 'time' | 'personal' | 'work';
  description?: string;
  systemPrompt?: string;
  color?: string;
  permissions: Record<string, unknown>;
  allowedTools?: string[];
  allowedSkills?: string[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ToolDefinitionRecord {
  id: string;
  name: string;
  description: string;
}

export async function fetchAgents(): Promise<AgentRecord[]> {
  try {
    const res = await fetch(`${BASE}/api/agents`);
    if (!res.ok) return [];
    const data = (await res.json()) as { agents: AgentRecord[] };
    return data.agents;
  } catch {
    return [];
  }
}

export async function createAgent(input: {
  name: string;
  description?: string;
  systemPrompt?: string;
  modelOverride?: string;
  enabled?: boolean;
  orgNodeId?: string;
  allowedTools?: string[];
  allowedSkills?: string[];
}): Promise<AgentRecord | null> {
  try {
    const res = await fetch(`${BASE}/api/agents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { agent: AgentRecord };
    return data.agent;
  } catch {
    return null;
  }
}

export async function updateAgent(
  id: string,
  input: Partial<
    Pick<
      AgentRecord,
      | 'name'
      | 'description'
      | 'systemPrompt'
      | 'modelOverride'
      | 'enabled'
      | 'orgNodeId'
      | 'allowedTools'
      | 'allowedSkills'
    >
  >,
): Promise<AgentRecord | null> {
  try {
    const res = await fetch(`${BASE}/api/agents/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { agent: AgentRecord };
    return data.agent;
  } catch {
    return null;
  }
}

export async function deleteAgent(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/api/agents/${id}`, { method: 'DELETE' });
    return res.ok;
  } catch {
    return false;
  }
}

export interface CronJobRecord {
  id: string;
  name: string;
  schedule: string;
  message: string;
  agentId: string;
  secretaryId?: string;
  enabled: boolean;
  lastRun?: string;
  nextRun?: string;
  createdAt: string;
}

export async function fetchOrgTree(): Promise<OrgTreeNode[]> {
  try {
    const res = await fetch(`${BASE}/api/org/tree`);
    if (!res.ok) return [];
    const data = (await res.json()) as { tree: OrgTreeNode[] };
    return data.tree;
  } catch {
    return [];
  }
}

export async function createOrgNode(input: {
  name: string;
  rank?: number;
  parentId?: string;
  sortOrder?: number;
  color?: string;
}): Promise<OrgNodeRecord | null> {
  try {
    const res = await fetch(`${BASE}/api/org/nodes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { node: OrgNodeRecord };
    return data.node;
  } catch {
    return null;
  }
}

export async function deleteOrgNode(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/api/org/nodes/${id}`, { method: 'DELETE' });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchSecretaries(): Promise<SecretaryRecord[]> {
  try {
    const res = await fetch(`${BASE}/api/secretaries`);
    if (!res.ok) return [];
    const data = (await res.json()) as { secretaries: SecretaryRecord[] };
    return data.secretaries;
  } catch {
    return [];
  }
}

export async function fetchSecretary(id: string): Promise<SecretaryRecord | null> {
  try {
    const res = await fetch(`${BASE}/api/secretaries/${id}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { secretary: SecretaryRecord };
    return data.secretary;
  } catch {
    return null;
  }
}

export async function createSecretary(input: {
  name: string;
  type: 'time' | 'personal' | 'work';
  description?: string;
  systemPrompt?: string;
  color?: string;
  enabled?: boolean;
  allowedTools?: string[];
  allowedSkills?: string[];
}): Promise<SecretaryRecord | null> {
  try {
    const res = await fetch(`${BASE}/api/secretaries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { secretary: SecretaryRecord };
    return data.secretary;
  } catch {
    return null;
  }
}

export async function updateSecretary(
  id: string,
  input: Partial<
    Pick<
      SecretaryRecord,
      | 'name'
      | 'type'
      | 'description'
      | 'systemPrompt'
      | 'color'
      | 'enabled'
      | 'allowedTools'
      | 'allowedSkills'
    >
  >,
): Promise<SecretaryRecord | null> {
  try {
    const res = await fetch(`${BASE}/api/secretaries/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { secretary: SecretaryRecord };
    return data.secretary;
  } catch {
    return null;
  }
}

export async function deleteSecretary(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/api/secretaries/${id}`, { method: 'DELETE' });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchSecretarySession(secretaryId: string): Promise<{
  sessionId: string;
  secretaryId: string;
} | null> {
  try {
    const res = await fetch(`${BASE}/api/secretaries/${secretaryId}/session`);
    if (!res.ok) return null;
    const data = (await res.json()) as { sessionId: string; secretaryId: string };
    return data;
  } catch {
    return null;
  }
}

export async function fetchSecretaryChatHistory(
  secretaryId: string,
  limit = 100,
): Promise<{ sessionId: string; secretaryId: string; messages: SessionMessageRecord[] }> {
  try {
    const params = new URLSearchParams();
    params.set('secretaryId', secretaryId);
    params.set('limit', String(limit));
    const res = await fetch(`${BASE}/api/chat/history?${params}`);
    if (!res.ok) return { sessionId: '', secretaryId, messages: [] };
    const data = (await res.json()) as {
      sessionId: string;
      secretaryId: string;
      messages: SessionMessageRecord[];
    };
    return data;
  } catch {
    return { sessionId: '', secretaryId, messages: [] };
  }
}

export async function fetchTools(): Promise<ToolDefinitionRecord[]> {
  try {
    const res = await fetch(`${BASE}/api/tools`);
    if (!res.ok) return [];
    const data = (await res.json()) as { tools: ToolDefinitionRecord[] };
    return data.tools;
  } catch {
    return [];
  }
}

export async function fetchSkillsList(): Promise<SkillRecord[]> {
  try {
    const res = await fetch(`${BASE}/api/skills`);
    if (!res.ok) return [];
    const data = (await res.json()) as { skills: SkillRecord[] };
    return data.skills;
  } catch {
    return [];
  }
}

export async function fetchCronJobs(secretaryId?: string): Promise<CronJobRecord[]> {
  try {
    const params = secretaryId ? `?secretaryId=${encodeURIComponent(secretaryId)}` : '';
    const res = await fetch(`${BASE}/api/cron${params}`);
    if (!res.ok) return [];
    const data = (await res.json()) as { jobs: CronJobRecord[] };
    return data.jobs;
  } catch {
    return [];
  }
}

export async function createCronJob(input: {
  name: string;
  schedule: string;
  message: string;
  agentId: string;
  secretaryId?: string;
  enabled?: boolean;
}): Promise<CronJobRecord | null> {
  try {
    const res = await fetch(`${BASE}/api/cron`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { job: CronJobRecord };
    return data.job;
  } catch {
    return null;
  }
}

export async function updateCronJob(
  id: string,
  input: Partial<Pick<CronJobRecord, 'name' | 'schedule' | 'message' | 'agentId' | 'enabled'>>,
): Promise<CronJobRecord | null> {
  try {
    const res = await fetch(`${BASE}/api/cron/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { job: CronJobRecord };
    return data.job;
  } catch {
    return null;
  }
}

export async function deleteCronJob(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/api/cron/${id}`, { method: 'DELETE' });
    return res.ok;
  } catch {
    return false;
  }
}

export async function runCronJobNow(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/api/cron/${id}/run`, { method: 'POST' });
    return res.ok;
  } catch {
    return false;
  }
}

export interface CronParseProposal {
  name: string;
  schedule: string;
  message: string;
  description: string;
}

export async function parseCronNaturalLanguage(
  description: string,
  locale?: string,
): Promise<{ proposal: CronParseProposal | null; error?: string }> {
  try {
    const res = await fetch(`${BASE}/api/cron/parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description, locale }),
    });
    const data = (await res.json()) as { proposal?: CronParseProposal; error?: string };
    if (!res.ok) return { proposal: null, error: data.error ?? `HTTP ${res.status}` };
    return { proposal: data.proposal ?? null };
  } catch (err) {
    return { proposal: null, error: err instanceof Error ? err.message : String(err) };
  }
}

export interface AuditEventRecord {
  id: string;
  type: string;
  occurredAt: string;
  actor?: { type: string; id: string; displayName?: string };
  payload?: unknown;
}

export async function fetchAuditEvents(limit = 20): Promise<AuditEventRecord[]> {
  try {
    const res = await fetch(`${BASE}/api/audit?limit=${limit}`);
    if (!res.ok) return [];
    const data = (await res.json()) as { events: AuditEventRecord[] };
    return data.events ?? [];
  } catch {
    return [];
  }
}

export interface McpServerRecord {
  id: string;
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export async function fetchMcpServers(): Promise<McpServerRecord[]> {
  try {
    const res = await fetch(`${BASE}/api/mcp`);
    if (!res.ok) return [];
    const data = (await res.json()) as { servers: McpServerRecord[] };
    return data.servers;
  } catch {
    return [];
  }
}

export async function createMcpServer(input: {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  enabled?: boolean;
}): Promise<McpServerRecord | null> {
  try {
    const res = await fetch(`${BASE}/api/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { server: McpServerRecord };
    return data.server;
  } catch {
    return null;
  }
}

export async function deleteMcpServer(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/api/mcp/${id}`, { method: 'DELETE' });
    return res.ok;
  } catch {
    return false;
  }
}

export interface EmbeddingConfigPublic {
  providerType: 'stub' | 'openai';
  modelName: string;
  hasApiKey: boolean;
}

export async function fetchEmbeddingConfig(): Promise<EmbeddingConfigPublic> {
  const res = await fetch(`${BASE}/api/config/embedding`);
  const data = (await res.json()) as { config: EmbeddingConfigPublic };
  return data.config;
}

export async function saveEmbeddingConfig(config: {
  providerType: EmbeddingConfigPublic['providerType'];
  modelName: string;
  apiKey?: string;
}): Promise<EmbeddingConfigPublic> {
  const res = await fetch(`${BASE}/api/config/embedding`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  const data = (await res.json()) as { config: EmbeddingConfigPublic };
  return data.config;
}

export async function searchMemory(q: string, limit = 20): Promise<MemoryRecord[]> {
  try {
    const params = new URLSearchParams({ q, limit: String(limit) });
    const res = await fetch(`${BASE}/api/memory/search?${params}`);
    if (!res.ok) return [];
    const data = (await res.json()) as { records: MemoryRecord[] };
    return data.records;
  } catch {
    return [];
  }
}

const AGENT_STORAGE_KEY = 'aigolet-selected-agent-id';

export function getStoredAgentId(): string {
  try {
    return localStorage.getItem(AGENT_STORAGE_KEY) ?? 'default-agent';
  } catch {
    return 'default-agent';
  }
}

export function storeAgentId(agentId: string): void {
  try {
    localStorage.setItem(AGENT_STORAGE_KEY, agentId);
  } catch {
    // ignore
  }
}
