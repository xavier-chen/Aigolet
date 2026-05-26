import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { basename, extname, join, normalize, relative, resolve } from 'node:path';
import type { AigoletDatabase } from '@aigolet-next/persistence';

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export const ALLOWED_EXTENSIONS = new Set([
  '.pdf',
  '.docx',
  '.doc',
  '.xlsx',
  '.xls',
  '.pptx',
  '.txt',
  '.md',
  '.csv',
]);

const EXT_TO_MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.doc': 'application/msword',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xls': 'application/vnd.ms-excel',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.csv': 'text/csv',
};

const TEXT_PREVIEW_EXTENSIONS = new Set(['.txt', '.md', '.csv']);
const TEXT_PREVIEW_MAX_BYTES = 4096;

export interface UploadedFileRecord {
  fileId: string;
  filename: string;
  path: string;
  mimeType: string;
  size: number;
  relativePath: string;
  textPreview?: string;
}

export interface RunAttachmentRef {
  fileId: string;
  path: string;
  filename: string;
  relativePath?: string;
  mimeType?: string;
  size?: number;
}

export function sanitizeFilename(original: string): string {
  const base = basename(normalize(original).replace(/^(\.\.(\/|\\|$))+/, ''));
  let sanitized = base
    .replace(/[\x00-\x1f\x7f<>:"|?*\\/]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  if (!sanitized || sanitized === '.' || sanitized === '..') {
    sanitized = 'upload';
  }
  const ext = extname(sanitized);
  const name = ext ? sanitized.slice(0, -ext.length) : sanitized;
  return (name.slice(0, 180) + ext).slice(0, 200);
}

export function assertAllowedExtension(filename: string): string {
  const ext = extname(filename).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error(`Unsupported file type: ${ext || '(none)'}`);
  }
  return ext;
}

export function resolveUploadDir(workspaceDir: string, sessionId?: string): string {
  const sub = sessionId ? join('attachments', sessionId) : 'uploads';
  const dir = join(workspaceDir, sub);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function mimeForExtension(ext: string): string {
  return EXT_TO_MIME[ext.toLowerCase()] ?? 'application/octet-stream';
}

function relativeWorkspacePath(workspaceDir: string, absolutePath: string): string {
  return relative(workspaceDir, absolutePath).replace(/\\/g, '/');
}

function maybeTextPreview(absolutePath: string, ext: string, size: number): string | undefined {
  if (!TEXT_PREVIEW_EXTENSIONS.has(ext) || size > TEXT_PREVIEW_MAX_BYTES) return undefined;
  try {
    const content = readFileSync(absolutePath, 'utf-8');
    return content.length > 500 ? `${content.slice(0, 500)}…` : content;
  } catch {
    return undefined;
  }
}

export function saveUploadedBuffer(
  db: AigoletDatabase,
  workspaceDir: string,
  buffer: Buffer,
  originalFilename: string,
  sessionId?: string,
): UploadedFileRecord {
  const filename = sanitizeFilename(originalFilename);
  const ext = assertAllowedExtension(filename);

  if (buffer.length > MAX_UPLOAD_BYTES) {
    throw new Error(`File exceeds ${MAX_UPLOAD_BYTES / 1024 / 1024}MB limit`);
  }

  const fileId = randomUUID();
  const storedName = `${fileId.slice(0, 8)}_${filename}`;
  const uploadDir = resolveUploadDir(workspaceDir, sessionId);
  const absolutePath = resolve(uploadDir, storedName);

  const relFromUploadDir = relative(uploadDir, absolutePath);
  if (relFromUploadDir.startsWith('..') || resolve(absolutePath) === resolve('/')) {
    throw new Error('Invalid file path');
  }

  writeFileSync(absolutePath, buffer);

  const relativePath = relativeWorkspacePath(workspaceDir, absolutePath);
  const mimeType = mimeForExtension(ext);
  const createdAt = new Date().toISOString();
  const textPreview = maybeTextPreview(absolutePath, ext, buffer.length);

  db.prepare(
    `INSERT INTO uploaded_files (
      id, session_id, filename, path, relative_path, mime_type, size, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    fileId,
    sessionId ?? null,
    filename,
    absolutePath,
    relativePath,
    mimeType,
    buffer.length,
    createdAt,
  );

  return {
    fileId,
    filename,
    path: absolutePath,
    mimeType,
    size: buffer.length,
    relativePath,
    textPreview,
  };
}

export async function saveUploadedFileFromBlob(
  db: AigoletDatabase,
  workspaceDir: string,
  file: File,
  sessionId?: string,
): Promise<UploadedFileRecord> {
  const arrayBuffer = await file.arrayBuffer();
  return saveUploadedBuffer(db, workspaceDir, Buffer.from(arrayBuffer), file.name, sessionId);
}

export function attachmentWorkspacePath(ref: RunAttachmentRef): string {
  return ref.relativePath ?? ref.path;
}
