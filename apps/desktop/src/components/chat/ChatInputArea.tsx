import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Paperclip, Send, X, FileText, FileSpreadsheet, File } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fadeInUp } from '@/lib/gsap';
import {
  pickAndUploadFiles,
  uploadFile,
  type RunAttachment,
  type UploadedFileResult,
} from '@/lib/api-client';
import { cn } from '@/lib/utils';

const ACCEPT =
  '.pdf,.docx,.doc,.xlsx,.xls,.pptx,.txt,.md,.csv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain,text/markdown,text/csv';

export type PendingAttachment = RunAttachment & { id: string };

function fileIcon(filename: string) {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
    return <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />;
  }
  if (ext === 'pdf' || ext === 'doc' || ext === 'docx' || ext === 'txt' || ext === 'md') {
    return <FileText className="w-3.5 h-3.5 shrink-0" />;
  }
  return <File className="w-3.5 h-3.5 shrink-0" />;
}

function toPendingAttachment(uploaded: UploadedFileResult): PendingAttachment {
  return {
    id: uploaded.fileId,
    fileId: uploaded.fileId,
    filename: uploaded.filename,
    path: uploaded.path,
    relativePath: uploaded.relativePath,
    mimeType: uploaded.mimeType,
    size: uploaded.size,
  };
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface ChatInputAreaProps {
  input: string;
  sending: boolean;
  uploading: boolean;
  attachments: PendingAttachment[];
  sessionId: string | null;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onAttachmentsChange: (attachments: PendingAttachment[]) => void;
  onUploadingChange: (uploading: boolean) => void;
}

export function ChatInputArea({
  input,
  sending,
  uploading,
  attachments,
  sessionId,
  onInputChange,
  onSend,
  onAttachmentsChange,
  onUploadingChange,
}: ChatInputAreaProps) {
  const { t } = useTranslation();
  const [isDragging, setIsDragging] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chipsRef = useRef<HTMLDivElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chipsRef.current && attachments.length > 0) {
      fadeInUp(chipsRef.current.children, { duration: 0.35, stagger: 0.05 });
    }
  }, [attachments.length]);

  const addUploaded = (uploaded: UploadedFileResult[]) => {
    const next = [...attachments];
    for (const file of uploaded) {
      if (next.some((a) => a.fileId === file.fileId)) continue;
      next.push(toPendingAttachment(file));
    }
    onAttachmentsChange(next);
  };

  const handleUploadFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length === 0) return;

    onUploadingChange(true);
    setUploadError(null);

    for (const file of list) {
      const { file: uploaded, error } = await uploadFile(file, sessionId ?? undefined);
      if (uploaded) {
        addUploaded([uploaded]);
      } else {
        setUploadError(error ?? t('chat.uploadFailed', { error: 'unknown' }));
      }
    }

    onUploadingChange(false);
  };

  const handlePickFiles = async () => {
    if (window.electron) {
      onUploadingChange(true);
      setUploadError(null);
      const { files, error } = await pickAndUploadFiles(sessionId ?? undefined);
      if (files.length > 0) addUploaded(files);
      if (error) setUploadError(error);
      onUploadingChange(false);
      return;
    }
    fileInputRef.current?.click();
  };

  const removeAttachment = (id: string) => {
    onAttachmentsChange(attachments.filter((a) => a.id !== id));
  };

  const canSend = (input.trim().length > 0 || attachments.length > 0) && !sending && !uploading;

  return (
    <div className="p-4 pt-3 bg-[var(--bg-card)]">
      {attachments.length > 0 && (
        <div ref={chipsRef} className="flex flex-wrap gap-2 mb-3">
          {attachments.map((att) => (
            <span
              key={att.id}
              className="inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1.5 rounded-[var(--radius-sm)] text-xs bg-[var(--bg-secondary)] text-[var(--text-primary)] shadow-[var(--shadow-soft)]"
            >
              {fileIcon(att.filename)}
              <span className="max-w-[160px] truncate">{att.filename}</span>
              {att.size != null && (
                <span className="text-[var(--text-muted)]">{formatSize(att.size)}</span>
              )}
              <button
                type="button"
                onClick={() => removeAttachment(att.id)}
                className="p-0.5 rounded hover:bg-[var(--border)] text-[var(--text-muted)]"
                aria-label={t('chat.removeAttachment')}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {uploadError && (
        <p className="text-xs text-red-500 mb-2 px-1">{t('chat.uploadFailed', { error: uploadError })}</p>
      )}

      <div
        ref={dropZoneRef}
        className={cn(
          'flex gap-2 rounded-[var(--radius-md)] transition-colors',
          isDragging && 'bg-[var(--accent-soft)]',
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={(e) => {
          if (!dropZoneRef.current?.contains(e.relatedTarget as Node)) {
            setIsDragging(false);
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          if (e.dataTransfer.files.length > 0) {
            void handleUploadFiles(e.dataTransfer.files);
          }
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) {
              void handleUploadFiles(e.target.files);
              e.target.value = '';
            }
          }}
        />

        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={sending || uploading}
          onClick={() => void handlePickFiles()}
          title={t('chat.attachHint')}
          className="shrink-0 self-end !p-2.5"
        >
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
        </Button>

        <div className="flex-1 relative">
          {isDragging && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[var(--radius-md)] border border-dashed border-brand-400/60 bg-[var(--accent-soft)] text-sm text-brand-600 pointer-events-none">
              {t('chat.dropFiles')}
            </div>
          )}
          <input
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && canSend && void onSend()}
            placeholder={isDragging ? t('chat.dropFiles') : t('chat.placeholder')}
            disabled={sending}
            className="w-full px-4 py-3 rounded-[var(--radius-md)] bg-[var(--bg-secondary)] shadow-[var(--shadow-soft)] focus:outline-none focus:shadow-[var(--shadow-card)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] disabled:opacity-60 transition-shadow"
          />
        </div>

        <Button onClick={() => void onSend()} disabled={!canSend} className="self-end shrink-0">
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {t('chat.send')}
        </Button>
      </div>
    </div>
  );
}

export function MessageAttachments({
  attachments,
}: {
  attachments: Array<{ filename: string; size?: number }>;
}) {
  const { t } = useTranslation();
  if (!attachments.length) return null;

  return (
    <div className="flex flex-wrap gap-1.5 mb-2">
      {attachments.map((att) => (
        <span
          key={att.filename}
          className={cn(
            'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs',
            'bg-white/20 text-white/90',
          )}
        >
          {fileIcon(att.filename)}
          <span className="max-w-[140px] truncate">{att.filename}</span>
          {att.size != null && <span className="opacity-75">{formatSize(att.size)}</span>}
        </span>
      ))}
      <span className="sr-only">{t('chat.attachedFiles')}</span>
    </div>
  );
}
