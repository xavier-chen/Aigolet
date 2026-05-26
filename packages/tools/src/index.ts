import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, normalize, relative, resolve } from 'node:path';
import type { MemoryNamespace } from '@aigolet-next/protocol';
import type { MemoryService } from '@aigolet-next/memory';
import type { Actor, ToolInvocation } from '@aigolet-next/protocol';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';

export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  requiredPermissions?: string[];
}

export interface ToolContext {
  actor: Actor;
  runId: string;
  sessionId: string;
  namespace?: MemoryNamespace;
}

export interface ToolHandler {
  (input: unknown, context: ToolContext): Promise<unknown>;
}

export interface ToolRegistry {
  register(definition: ToolDefinition, handler: ToolHandler): void;
  get(id: string): { definition: ToolDefinition; handler: ToolHandler } | null;
  list(): ToolDefinition[];
}

export interface PolicyDecision {
  allowed: boolean;
  reason?: string;
}

export interface PolicyEngine {
  evaluate(
    actor: Actor,
    toolId: string,
    invocation: ToolInvocation,
  ): Promise<PolicyDecision>;
}

export interface ToolExecutor {
  invoke(invocation: ToolInvocation, context: ToolContext): Promise<unknown>;
}

export class InMemoryToolRegistry implements ToolRegistry {
  private tools = new Map<string, { definition: ToolDefinition; handler: ToolHandler }>();

  register(definition: ToolDefinition, handler: ToolHandler): void {
    this.tools.set(definition.id, { definition, handler });
  }

  unregister(id: string): boolean {
    return this.tools.delete(id);
  }

  get(id: string): { definition: ToolDefinition; handler: ToolHandler } | null {
    return this.tools.get(id) ?? null;
  }

  list(): ToolDefinition[] {
    return [...this.tools.values()].map((t) => t.definition);
  }
}

/** Overlay dynamic tools on a base registry (used for per-run MCP/skill tools) */
export class OverlayToolRegistry implements ToolRegistry {
  private overlay = new Map<string, { definition: ToolDefinition; handler: ToolHandler }>();

  constructor(private readonly base: ToolRegistry) {}

  register(definition: ToolDefinition, handler: ToolHandler): void {
    this.overlay.set(definition.id, { definition, handler });
  }

  unregister(id: string): boolean {
    return this.overlay.delete(id);
  }

  clearOverlay(): void {
    this.overlay.clear();
  }

  get(id: string): { definition: ToolDefinition; handler: ToolHandler } | null {
    return this.overlay.get(id) ?? this.base.get(id);
  }

  list(): ToolDefinition[] {
    const baseIds = new Set(this.base.list().map((d) => d.id));
    const overlayDefs = [...this.overlay.values()]
      .map((t) => t.definition)
      .filter((d) => !baseIds.has(d.id));
    return [...this.base.list(), ...overlayDefs];
  }
}

export class DefaultPolicyEngine implements PolicyEngine {
  constructor(
    private readonly deniedTools = new Set<string>(),
    private readonly allowedTools: string[] | null | undefined = undefined,
  ) {}

  async evaluate(
    actor: Actor,
    toolId: string,
    _invocation: ToolInvocation,
  ): Promise<PolicyDecision> {
    if (this.deniedTools.has(toolId)) {
      return { allowed: false, reason: `Tool ${toolId} is denied by policy` };
    }
    if (this.allowedTools && this.allowedTools.length > 0 && !this.allowedTools.includes(toolId)) {
      return { allowed: false, reason: `Tool ${toolId} is not in agent allowlist` };
    }
    if (actor.type === 'system') {
      return { allowed: true };
    }
    return { allowed: true };
  }
}

export class PolicyAwareToolExecutor implements ToolExecutor {
  constructor(
    private readonly registry: ToolRegistry,
    private readonly policy: PolicyEngine,
  ) {}

  async invoke(invocation: ToolInvocation, context: ToolContext): Promise<unknown> {
    const entry = this.registry.get(invocation.toolId);
    if (!entry) throw new Error(`Unknown tool: ${invocation.toolId}`);

    const decision = await this.policy.evaluate(context.actor, invocation.toolId, invocation);
    if (!decision.allowed) {
      throw new Error(decision.reason ?? 'Policy denied tool invocation');
    }

    return entry.handler(invocation.input, context);
  }
}

export interface ExtendedToolOptions {
  workspaceDir: string;
  memory?: MemoryService;
}

function resolveWorkspacePath(workspaceDir: string, filePath: string): string {
  const root = resolve(workspaceDir);
  const target = resolve(root, normalize(filePath).replace(/^(\.\.(\/|\\|$))+/, ''));
  const rel = relative(root, target);
  if (rel.startsWith('..') || resolve(target) === resolve('/')) {
    throw new Error(`Path escapes workspace: ${filePath}`);
  }
  return target;
}

const MAX_TEXT_CHARS = 50_000;

function truncateText(text: string): { text: string; truncated: boolean; originalLength: number } {
  if (text.length <= MAX_TEXT_CHARS) {
    return { text, truncated: false, originalLength: text.length };
  }
  return {
    text: `${text.slice(0, MAX_TEXT_CHARS)}\n\n...[truncated, ${text.length - MAX_TEXT_CHARS} chars omitted]`,
    truncated: true,
    originalLength: text.length,
  };
}

async function readPdfText(fullPath: string): Promise<string> {
  const data = readFileSync(fullPath);
  const parser = new PDFParse({ data });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

async function readDocxText(fullPath: string): Promise<string> {
  const result = await mammoth.extractRawText({ path: fullPath });
  return result.value;
}

function readXlsxText(fullPath: string): string {
  const workbook = XLSX.readFile(fullPath);
  const parts: string[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    parts.push(`## Sheet: ${sheetName}\n${csv}`);
  }
  return parts.join('\n\n');
}

async function readPptxText(fullPath: string): Promise<string> {
  const data = readFileSync(fullPath);
  const zip = await JSZip.loadAsync(data);
  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const numA = Number(a.match(/slide(\d+)/)?.[1] ?? 0);
      const numB = Number(b.match(/slide(\d+)/)?.[1] ?? 0);
      return numA - numB;
    });

  const slides: string[] = [];
  for (const [index, fileName] of slideFiles.entries()) {
    const xml = await zip.file(fileName)?.async('text');
    if (!xml) continue;
    const texts = [...xml.matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g)].map((m) => m[1]?.trim()).filter(Boolean);
    slides.push(`## Slide ${index + 1}\n${texts.join('\n')}`);
  }
  return slides.join('\n\n');
}

interface WorkspaceEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
}

function listWorkspaceEntries(workspaceDir: string, subPath = '', recursive = false): WorkspaceEntry[] {
  const fullPath = resolveWorkspacePath(workspaceDir, subPath || '.');
  if (!existsSync(fullPath)) throw new Error(`Path not found: ${subPath || '.'}`);
  const stat = statSync(fullPath);
  if (!stat.isDirectory()) throw new Error(`Not a directory: ${subPath || '.'}`);

  const entries: WorkspaceEntry[] = [];
  for (const name of readdirSync(fullPath).sort()) {
    const entryPath = subPath ? join(subPath, name) : name;
    const entryFull = join(fullPath, name);
    const entryStat = statSync(entryFull);
    if (entryStat.isDirectory()) {
      entries.push({ name, path: entryPath.replace(/\\/g, '/'), type: 'directory' });
      if (recursive) entries.push(...listWorkspaceEntries(workspaceDir, entryPath, true));
    } else {
      entries.push({
        name,
        path: entryPath.replace(/\\/g, '/'),
        type: 'file',
        size: entryStat.size,
      });
    }
  }
  return entries;
}

export function createDefaultToolRegistry(options?: ExtendedToolOptions): InMemoryToolRegistry {
  const registry = new InMemoryToolRegistry();
  const workspaceDir = options?.workspaceDir;
  const memory = options?.memory;

  registry.register(
    {
      id: 'echo',
      name: 'echo',
      description: 'Returns the input text unchanged',
      inputSchema: {
        type: 'object',
        properties: { text: { type: 'string', description: 'Text to echo back' } },
        required: ['text'],
      },
    },
    async (input) => {
      const text = (input as { text?: string })?.text ?? input;
      return { echoed: text };
    },
  );

  registry.register(
    {
      id: 'get_time',
      name: 'get_time',
      description: 'Returns the current ISO timestamp',
      inputSchema: { type: 'object', properties: {} },
    },
    async () => ({ now: new Date().toISOString() }),
  );

  if (workspaceDir) {
    if (!existsSync(workspaceDir)) mkdirSync(workspaceDir, { recursive: true });

    registry.register(
      {
        id: 'read_file',
        name: 'read_file',
        description: 'Read a text file from the workspace directory',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Relative path within workspace' },
          },
          required: ['path'],
        },
      },
      async (input) => {
        const path = (input as { path?: string })?.path;
        if (!path) throw new Error('path is required');
        const fullPath = resolveWorkspacePath(workspaceDir, path);
        if (!existsSync(fullPath)) throw new Error(`File not found: ${path}`);
        const content = readFileSync(fullPath, 'utf-8');
        return { path, content, size: content.length };
      },
    );

    registry.register(
      {
        id: 'write_file',
        name: 'write_file',
        description: 'Write text content to a file in the workspace directory',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Relative path within workspace' },
            content: { type: 'string', description: 'File content to write' },
          },
          required: ['path', 'content'],
        },
      },
      async (input) => {
        const { path, content } = input as { path?: string; content?: string };
        if (!path) throw new Error('path is required');
        if (content === undefined) throw new Error('content is required');
        const fullPath = resolveWorkspacePath(workspaceDir, path);
        mkdirSync(dirname(fullPath), { recursive: true });
        writeFileSync(fullPath, content, 'utf-8');
        return { path, bytesWritten: Buffer.byteLength(content, 'utf-8') };
      },
    );

    registry.register(
      {
        id: 'list_files',
        name: 'list_files',
        description:
          'List files and folders in the workspace directory (~/.aigolet/workspace/). Use for browsing documents before reading.',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Relative directory path within workspace (default: root)',
            },
            recursive: {
              type: 'boolean',
              description: 'List subdirectories recursively (default false)',
            },
          },
        },
      },
      async (input) => {
        const { path: subPath, recursive } = input as { path?: string; recursive?: boolean };
        const entries = listWorkspaceEntries(workspaceDir, subPath ?? '', recursive ?? false);
        return { path: subPath ?? '.', count: entries.length, entries };
      },
    );

    registry.register(
      {
        id: 'read_pdf',
        name: 'read_pdf',
        description:
          'Extract plain text from a PDF file in the workspace. Good for contracts, reports, and scanned docs.',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Relative path to .pdf file within workspace' },
          },
          required: ['path'],
        },
      },
      async (input) => {
        const path = (input as { path?: string })?.path;
        if (!path) throw new Error('path is required');
        const fullPath = resolveWorkspacePath(workspaceDir, path);
        if (!existsSync(fullPath)) throw new Error(`File not found: ${path}`);
        const raw = await readPdfText(fullPath);
        const { text, truncated, originalLength } = truncateText(raw);
        return { path, content: text, truncated, originalLength };
      },
    );

    registry.register(
      {
        id: 'read_docx',
        name: 'read_docx',
        description:
          'Read text from a Word .docx document in the workspace. Good for memos, proposals, and specs.',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Relative path to .docx file within workspace' },
          },
          required: ['path'],
        },
      },
      async (input) => {
        const path = (input as { path?: string })?.path;
        if (!path) throw new Error('path is required');
        const fullPath = resolveWorkspacePath(workspaceDir, path);
        if (!existsSync(fullPath)) throw new Error(`File not found: ${path}`);
        const raw = await readDocxText(fullPath);
        const { text, truncated, originalLength } = truncateText(raw);
        return { path, content: text, truncated, originalLength };
      },
    );

    registry.register(
      {
        id: 'read_xlsx',
        name: 'read_xlsx',
        description:
          'Read an Excel .xlsx spreadsheet from the workspace as structured text (one section per sheet).',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Relative path to .xlsx file within workspace' },
          },
          required: ['path'],
        },
      },
      async (input) => {
        const path = (input as { path?: string })?.path;
        if (!path) throw new Error('path is required');
        const fullPath = resolveWorkspacePath(workspaceDir, path);
        if (!existsSync(fullPath)) throw new Error(`File not found: ${path}`);
        const raw = readXlsxText(fullPath);
        const { text, truncated, originalLength } = truncateText(raw);
        return { path, content: text, truncated, originalLength };
      },
    );

    registry.register(
      {
        id: 'read_pptx',
        name: 'read_pptx',
        description:
          'Extract slide text from a PowerPoint .pptx file in the workspace. Layout/images are not included.',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Relative path to .pptx file within workspace' },
          },
          required: ['path'],
        },
      },
      async (input) => {
        const path = (input as { path?: string })?.path;
        if (!path) throw new Error('path is required');
        const fullPath = resolveWorkspacePath(workspaceDir, path);
        if (!existsSync(fullPath)) throw new Error(`File not found: ${path}`);
        const raw = await readPptxText(fullPath);
        const { text, truncated, originalLength } = truncateText(raw);
        return { path, content: text, truncated, originalLength };
      },
    );
  }

  if (memory) {
    registry.register(
      {
        id: 'remember',
        name: 'remember',
        description: 'Store a fact or note in long-term memory for later recall',
        inputSchema: {
          type: 'object',
          properties: {
            content: { type: 'string', description: 'Information to remember' },
            kind: {
              type: 'string',
              enum: ['working', 'episodic', 'semantic'],
              description: 'Memory kind (default semantic)',
            },
          },
          required: ['content'],
        },
      },
      async (input, context) => {
        const { content, kind } = input as {
          content?: string;
          kind?: 'working' | 'episodic' | 'semantic';
        };
        if (!content?.trim()) throw new Error('content is required');
        if (!context.namespace) throw new Error('Memory namespace unavailable');
        const record = await memory.remember(
          context.namespace,
          content.trim(),
          kind ?? 'semantic',
        );
        return { id: record.id, kind: record.kind, stored: true };
      },
    );

    registry.register(
      {
        id: 'recall',
        name: 'recall',
        description: 'Search and retrieve stored memories',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Optional search text' },
            limit: { type: 'number', description: 'Max records to return (default 10)' },
          },
        },
      },
      async (input, context) => {
        if (!context.namespace) throw new Error('Memory namespace unavailable');
        const { query, limit } = input as { query?: string; limit?: number };
        const records = await memory.recall({
          namespace: context.namespace,
          query,
          limit: limit ?? 10,
        });
        return {
          count: records.length,
          memories: records.map((r) => ({
            id: r.id,
            kind: r.kind,
            content: r.content,
            createdAt: r.createdAt,
          })),
        };
      },
    );
  }

  return registry;
}

export function toolDefinitionsToModelTools(
  definitions: ToolDefinition[],
): Array<{
  type: 'function';
  function: { name: string; description: string; parameters?: Record<string, unknown> };
}> {
  return definitions.map((def) => ({
    type: 'function' as const,
    function: {
      name: def.id,
      description: def.description,
      parameters: def.inputSchema ?? { type: 'object', properties: {} },
    },
  }));
}

export { AllowlistToolRegistry, AgentAllowlistPolicyEngine } from './allowlist.js';
