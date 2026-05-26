import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import {
  User,
  Loader2,
  ExternalLink,
  AlertCircle,
  Wrench,
  ChevronDown,
  ChevronRight,
  ArrowDown,
  PanelRightOpen,
  PanelRightClose,
} from 'lucide-react';
import gsap from 'gsap';
import { fadeInUp, panelSlide, staggerCards } from '@/lib/gsap';
import { ColleagueAvatar } from '@/components/colleague/ColleagueAvatar';
import { ColleagueCard } from '@/components/colleague/ColleagueCard';
import {
  ChatInputArea,
  MessageAttachments,
  type PendingAttachment,
} from '@/components/chat/ChatInputArea';
import { useChatScroll } from '@/components/chat/useChatScroll';
import {
  extractRunResponse,
  fetchChatHistory,
  fetchDefaultSession,
  fetchAgents,
  fetchRun,
  fetchRunToolEvents,
  getStoredAgentId,
  isLlmNotConfiguredError,
  storeAgentId,
  storeSessionId,
  submitRun,
  subscribeRunStream,
  type AgentRecord,
  type DomainEvent,
  type RunRecord,
  type RunStatus,
  type RunAttachment,
} from '@/lib/api-client';
import { cn } from '@/lib/utils';

interface MessageAttachmentDisplay {
  filename: string;
  size?: number;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  attachments?: MessageAttachmentDisplay[];
  reasoning?: string;
  runId?: string;
  runStatus?: RunStatus;
  error?: string;
  llmNotConfigured?: boolean;
  toolEvents?: DomainEvent[];
  activeTools?: Array<{ toolId: string; toolCallId: string; input: unknown }>;
  streaming?: boolean;
}

function parseAttachmentsFromMetadata(
  metadata?: Record<string, unknown>,
): MessageAttachmentDisplay[] | undefined {
  const raw = metadata?.attachments;
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const attachments: MessageAttachmentDisplay[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    if (typeof rec.filename !== 'string') continue;
    attachments.push({
      filename: rec.filename,
      size: typeof rec.size === 'number' ? rec.size : undefined,
    });
  }
  return attachments.length > 0 ? attachments : undefined;
}

const TERMINAL_STATUSES: RunStatus[] = ['completed', 'failed', 'cancelled'];

function RunStatusBadge({ status }: { status: RunStatus }) {
  const { t } = useTranslation();
  const styles: Record<RunStatus, string> = {
    pending: 'bg-slate-100 text-slate-600',
    running: 'bg-amber-50 text-amber-700',
    completed: 'bg-emerald-50 text-emerald-700',
    failed: 'bg-red-50 text-red-700',
    cancelled: 'bg-slate-100 text-slate-500',
  };
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', styles[status])}>
      {(status === 'pending' || status === 'running') && <Loader2 className="w-3 h-3 animate-spin" />}
      {t(`runs.status.${status}`)}
    </span>
  );
}

function StreamingCursor() {
  return (
    <span
      className="inline-block w-[2px] h-[1em] ml-0.5 bg-brand-500/70 animate-pulse align-text-bottom rounded-full"
      aria-hidden
    />
  );
}

export function ChatPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState(getStoredAgentId());
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [expandedReasoning, setExpandedReasoning] = useState<Set<string>>(new Set());
  const [showExpertPanel, setShowExpertPanel] = useState(false);
  const chatPanelRef = useRef<HTMLDivElement>(null);
  const colleaguesPanelRef = useRef<HTMLDivElement>(null);
  const colleagueCardsRef = useRef<HTMLDivElement>(null);
  const prevMessageCountRef = useRef(0);
  const wasLoadingHistoryRef = useRef(true);
  const pollTimers = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
  const streamAbort = useRef<Map<string, () => void>>(new Map());

  const hasStreaming = messages.some((m) => m.streaming);
  const instantScroll =
    (wasLoadingHistoryRef.current && !loadingHistory) || hasStreaming;

  const {
    scrollContainerRef,
    bottomRef,
    showScrollButton,
    scrollToBottom,
    handleScroll,
    forceAutoScroll,
  } = useChatScroll({
    watch: [messages],
    instant: instantScroll,
  });

  useEffect(() => {
    wasLoadingHistoryRef.current = loadingHistory;
  }, [loadingHistory]);

  const enabledAgents = agents.filter((a) => a.enabled);
  const selectedAgent = agents.find((a) => a.id === selectedAgentId);

  useEffect(() => {
    if (chatPanelRef.current) fadeInUp(chatPanelRef.current, { delay: 0.05 });
  }, []);

  useEffect(() => {
    if (!showExpertPanel || !colleaguesPanelRef.current) return;
    panelSlide(colleaguesPanelRef.current, 'in');
    if (colleagueCardsRef.current) {
      staggerCards(colleagueCardsRef.current.children, { delay: 0.08, stagger: 0.05 });
    }
  }, [showExpertPanel]);

  useEffect(() => {
    if (messages.length <= prevMessageCountRef.current) {
      prevMessageCountRef.current = messages.length;
      return;
    }
    const container = scrollContainerRef.current;
    if (!container) return;
    const rows = container.querySelectorAll('[data-message-row]');
    const last = rows[rows.length - 1];
    if (last) {
      gsap.fromTo(last, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out' });
    }
    prevMessageCountRef.current = messages.length;
  }, [messages.length, scrollContainerRef]);

  useEffect(() => {
    void fetchAgents().then(setAgents);
  }, []);

  useEffect(() => {
    const prefill = searchParams.get('prefill');
    if (prefill) setInput(prefill);
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;

    const loadHistory = async () => {
      setLoadingHistory(true);
      const fallback = await fetchChatHistory(selectedAgentId);
      let resolvedSessionId = fallback.sessionId;
      const historyMessages = fallback.messages;

      if (!resolvedSessionId) {
        const defaultSession = await fetchDefaultSession();
        resolvedSessionId = defaultSession.sessionId;
      }

      if (cancelled) return;

      if (resolvedSessionId) {
        storeSessionId(resolvedSessionId);
        setSessionId(resolvedSessionId);
      }

      const restored: Message[] = historyMessages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({
          id: m.id,
          role: m.role as 'user' | 'assistant',
          content: m.content,
          attachments: parseAttachmentsFromMetadata(m.metadata),
          reasoning:
            typeof m.metadata?.reasoning_content === 'string'
              ? m.metadata.reasoning_content
              : undefined,
          runId: typeof m.metadata?.runId === 'string' ? m.metadata.runId : undefined,
          runStatus: m.role === 'assistant' ? ('completed' as RunStatus) : undefined,
        }));

      setMessages(restored);
      setLoadingHistory(false);
    };

    void loadHistory();
    return () => {
      cancelled = true;
    };
  }, [selectedAgentId]);

  useEffect(() => {
    return () => {
      for (const timer of pollTimers.current.values()) clearInterval(timer);
      pollTimers.current.clear();
      for (const abort of streamAbort.current.values()) abort();
      streamAbort.current.clear();
    };
  }, []);

  const selectColleague = (agentId: string) => {
    storeAgentId(agentId);
    setSelectedAgentId(agentId);
  };

  const updateAssistantFromRun = async (run: RunRecord) => {
    const toolEvents = await fetchRunToolEvents(run.id);

    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.runId !== run.id) return msg;
        const response = extractRunResponse(run);
        return {
          ...msg,
          runStatus: run.status,
          streaming: false,
          toolEvents,
          activeTools: undefined,
          content:
            run.status === 'failed'
              ? run.error ?? t('chat.runFailed')
              : run.status === 'completed' && response
                ? response
                : msg.content,
          error: run.status === 'failed' ? run.error : undefined,
          llmNotConfigured: run.status === 'failed' && isLlmNotConfiguredError(run.error),
        };
      }),
    );
  };

  const startPollingRun = (runId: string) => {
    if (pollTimers.current.has(runId)) return;

    const poll = async () => {
      const run = await fetchRun(runId);
      if (!run) return;
      await updateAssistantFromRun(run);
      if (TERMINAL_STATUSES.includes(run.status)) {
        const timer = pollTimers.current.get(runId);
        if (timer) clearInterval(timer);
        pollTimers.current.delete(runId);
      }
    };

    void poll();
    const timer = setInterval(() => void poll(), 2000);
    pollTimers.current.set(runId, timer);
  };

  const startStreamingRun = (runId: string, assistantId: string) => {
    if (streamAbort.current.has(runId)) return;

    const abort = subscribeRunStream(runId, {
      onConnected: () => {
        flushSync(() => {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantId
                ? { ...msg, runId, runStatus: 'running', streaming: true }
                : msg,
            ),
          );
        });
      },
      onAssistantDelta: (delta) => {
        if (!delta) return;
        flushSync(() => {
          setMessages((prev) =>
            prev.map((msg) => {
              if (msg.id !== assistantId) return msg;
              const placeholder =
                msg.content === t('chat.running') || msg.content === t('chat.thinking');
              return {
                ...msg,
                runStatus: 'running',
                streaming: true,
                content: placeholder ? delta : msg.content + delta,
              };
            }),
          );
        });
      },
      onReasoningDelta: (delta) => {
        if (!delta) return;
        flushSync(() => {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantId
                ? { ...msg, reasoning: (msg.reasoning ?? '') + delta }
                : msg,
            ),
          );
        });
      },
      onToolStart: ({ toolId, toolCallId, input }) => {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantId
              ? {
                  ...msg,
                  runStatus: 'running',
                  content: msg.content || t('chat.usingTools'),
                  activeTools: [...(msg.activeTools ?? []), { toolId, toolCallId, input }],
                }
              : msg,
          ),
        );
      },
      onToolEnd: ({ toolCallId }) => {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantId
              ? {
                  ...msg,
                  activeTools: msg.activeTools?.filter((tool) => tool.toolCallId !== toolCallId),
                }
              : msg,
          ),
        );
      },
      onCompleted: async ({ response }) => {
        streamAbort.current.delete(runId);
        const toolEvents = await fetchRunToolEvents(runId);
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantId
              ? {
                  ...msg,
                  runStatus: 'completed',
                  streaming: false,
                  content: response || msg.content,
                  activeTools: undefined,
                  toolEvents,
                }
              : msg,
          ),
        );
      },
      onFailed: (error) => {
        streamAbort.current.delete(runId);
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantId
              ? {
                  ...msg,
                  runStatus: 'failed',
                  streaming: false,
                  content: error,
                  error,
                  llmNotConfigured: isLlmNotConfiguredError(error),
                  activeTools: undefined,
                }
              : msg,
          ),
        );
      },
      onError: () => {
        streamAbort.current.delete(runId);
        startPollingRun(runId);
      },
    });

    streamAbort.current.set(runId, abort);
  };

  const toggleReasoning = (messageId: string) => {
    setExpandedReasoning((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) next.delete(messageId);
      else next.add(messageId);
      return next;
    });
  };

  const send = async () => {
    if ((!input.trim() && pendingAttachments.length === 0) || sending || uploading) return;
    forceAutoScroll();
    const content =
      input.trim() ||
      (pendingAttachments.length > 0 ? t('chat.defaultAttachmentPrompt') : '');
    const attachments: RunAttachment[] = pendingAttachments.map(({ fileId, path, filename, relativePath, mimeType, size }) => ({
      fileId,
      path,
      filename,
      relativePath,
      mimeType,
      size,
    }));
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      attachments: attachments.map((a) => ({ filename: a.filename, size: a.size })),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setPendingAttachments([]);
    setSending(true);

    const assistantId = crypto.randomUUID();
    setMessages((prev) => [
      ...prev,
      {
        id: assistantId,
        role: 'assistant',
        content: t('chat.thinking'),
        runStatus: 'pending',
      },
    ]);

    const { run, sessionId: returnedSessionId, error } = await submitRun(
      content,
      sessionId ?? undefined,
      attachments.length > 0 ? attachments : undefined,
      selectedAgentId,
    );
    setSending(false);

    if (returnedSessionId) {
      storeSessionId(returnedSessionId);
      setSessionId(returnedSessionId);
    }

    if (!run) {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantId
            ? {
                ...msg,
                content: error ?? t('chat.submitError'),
                runStatus: 'failed',
                error,
              }
            : msg,
        ),
      );
      return;
    }

    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === assistantId
          ? { ...msg, runId: run.id, runStatus: run.status, content: t('chat.running') }
          : msg,
      ),
    );
    startStreamingRun(run.id, assistantId);
  };

  const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user')?.content;
  const modeLabel = selectedAgent?.name ?? t('chat.title');

  return (
    <div className="h-[calc(100vh-4rem)] flex max-w-7xl mx-auto overflow-hidden relative">
      {showExpertPanel && (
        <button
          type="button"
          aria-label={t('chat.expertToggle')}
          className="fixed inset-0 z-20 bg-black/15 backdrop-blur-[1px] lg:hidden"
          onClick={() => setShowExpertPanel(false)}
        />
      )}
      <div ref={chatPanelRef} className="flex-1 flex flex-col min-w-0 min-h-0">
        <header className="shrink-0 flex items-center justify-between gap-4 px-1 py-3">
          <div className="flex items-center gap-3 min-w-0">
            {selectedAgent && (
              <ColleagueAvatar agentId={selectedAgent.id} name={selectedAgent.name} size="md" online />
            )}
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-wider text-[var(--text-muted)] font-medium">
                {t('chat.currentMode')}
              </p>
              <h1 className="font-display text-lg font-semibold text-[var(--text-primary)] truncate">
                {modeLabel}
              </h1>
              {selectedAgent?.description && (
                <p className="text-xs text-[var(--text-muted)] truncate mt-0.5">
                  {selectedAgent.description}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowExpertPanel((v) => !v)}
            className={cn(
              'inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-[var(--radius-sm)] transition-colors shrink-0',
              showExpertPanel
                ? 'bg-[var(--accent-soft)] text-brand-600'
                : 'bg-[var(--bg-card)] text-[var(--text-muted)] hover:text-[var(--text-primary)] shadow-[var(--shadow-soft)]',
            )}
            aria-expanded={showExpertPanel}
          >
            {showExpertPanel ? (
              <PanelRightClose className="w-3.5 h-3.5" />
            ) : (
              <PanelRightOpen className="w-3.5 h-3.5" />
            )}
            {t('chat.expertToggle')}
          </button>
        </header>

        <div className="flex-1 flex flex-col min-h-0 rounded-[var(--radius-xl)] bg-[var(--bg-card)] shadow-[var(--shadow-card)] overflow-hidden relative">
          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto px-5 py-5 space-y-5 scroll-smooth"
          >
            {loadingHistory ? (
              <div className="h-full flex items-center justify-center text-[var(--text-muted)] text-sm">
                {t('chat.loadingHistory')}
              </div>
            ) : messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center px-8 gap-4">
                {selectedAgent && (
                  <ColleagueAvatar agentId={selectedAgent.id} name={selectedAgent.name} size="lg" online />
                )}
                <div className="space-y-2 max-w-md">
                  <p className="text-[var(--text-primary)] text-sm leading-relaxed">{t('chat.empty')}</p>
                  <p className="text-xs text-[var(--text-muted)]">{t('chat.selectColleague')}</p>
                </div>
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  data-message-row
                  className={cn('flex gap-3', msg.role === 'user' ? 'flex-row-reverse' : '')}
                >
                  {msg.role === 'user' ? (
                    <div className="w-9 h-9 rounded-[var(--radius-sm)] flex items-center justify-center shrink-0 bg-brand-500/15 text-brand-600">
                      <User className="w-4 h-4" />
                    </div>
                  ) : selectedAgent ? (
                    <ColleagueAvatar agentId={selectedAgent.id} name={selectedAgent.name} size="sm" />
                  ) : (
                    <div className="w-9 h-9 shrink-0" />
                  )}
                  <div
                    className={cn(
                      'flex flex-col gap-1.5 max-w-[min(85%,42rem)]',
                      msg.role === 'user' ? 'items-end' : '',
                    )}
                  >
                    {msg.reasoning && msg.role === 'assistant' && (
                      <button
                        type="button"
                        onClick={() => toggleReasoning(msg.id)}
                        className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                      >
                        {expandedReasoning.has(msg.id) ? (
                          <ChevronDown className="w-3 h-3" />
                        ) : (
                          <ChevronRight className="w-3 h-3" />
                        )}
                        {t('chat.reasoning')}
                      </button>
                    )}
                    {msg.reasoning && expandedReasoning.has(msg.id) && (
                      <div className="rounded-[var(--radius-sm)] px-3 py-2 text-xs text-[var(--text-muted)] bg-[var(--bg-secondary)] whitespace-pre-wrap">
                        {msg.reasoning}
                      </div>
                    )}
                    <div
                      className={cn(
                        'px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap',
                        msg.role === 'user'
                          ? 'rounded-[var(--radius-md)] rounded-br-[var(--radius-sm)] bg-brand-500 text-white shadow-[var(--shadow-soft)]'
                          : 'rounded-[var(--radius-md)] rounded-bl-[var(--radius-sm)] bg-[var(--bg-secondary)] text-[var(--text-primary)] shadow-[var(--shadow-soft)]',
                      )}
                    >
                      {msg.role === 'user' && msg.attachments && (
                        <MessageAttachments attachments={msg.attachments} />
                      )}
                      {msg.content || (msg.streaming ? '' : t('chat.running'))}
                      {msg.streaming && <StreamingCursor />}
                      {msg.error && (
                        <p className="mt-2 flex items-center gap-1 text-xs text-red-600">
                          <AlertCircle className="w-3 h-3" />
                          {msg.error}
                        </p>
                      )}
                      {msg.llmNotConfigured && (
                        <Link
                          to="/settings"
                          className="mt-2 inline-flex items-center gap-1 text-xs text-brand-600 hover:underline"
                        >
                          {t('chat.configureLlm')}
                        </Link>
                      )}
                    </div>
                    {msg.runId && msg.runStatus && showExpertPanel && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <RunStatusBadge status={msg.runStatus} />
                        {msg.activeTools && msg.activeTools.length > 0 && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[var(--radius-sm)] text-xs font-medium bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
                            <Wrench className="w-3 h-3 animate-spin" />
                            {t('chat.toolRunning', { name: msg.activeTools[msg.activeTools.length - 1]?.toolId })}
                          </span>
                        )}
                        {msg.toolEvents && msg.toolEvents.length > 0 && !msg.streaming && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[var(--radius-sm)] text-xs font-medium bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
                            <Wrench className="w-3 h-3" />
                            {t('chat.toolsUsed', { count: msg.toolEvents.filter((e) => e.type === 'tool.invoked').length })}
                          </span>
                        )}
                        <Link
                          to={`/tasks/${msg.runId}`}
                          className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline"
                        >
                          {t('chat.viewRun')}
                          <ExternalLink className="w-3 h-3" />
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
            <div ref={bottomRef} className="h-px shrink-0" aria-hidden />
          </div>

          {showScrollButton && (
            <button
              type="button"
              onClick={() => scrollToBottom('smooth')}
              className="absolute bottom-[5.5rem] left-1/2 -translate-x-1/2 z-10 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-[var(--bg-card)] text-[var(--text-primary)] shadow-[var(--shadow-card)] hover:bg-[var(--bg-secondary)] transition-colors"
            >
              <ArrowDown className="w-3 h-3" />
              {t('chat.scrollToBottom')}
            </button>
          )}

          <ChatInputArea
            input={input}
            sending={sending}
            uploading={uploading}
            attachments={pendingAttachments}
            sessionId={sessionId}
            onInputChange={setInput}
            onSend={() => void send()}
            onAttachmentsChange={setPendingAttachments}
            onUploadingChange={setUploading}
          />
        </div>
      </div>

      <aside
        className={cn(
          'shrink-0 flex flex-col min-h-0 overflow-hidden transition-[width,transform] duration-300 ease-out z-30',
          showExpertPanel
            ? 'fixed top-16 right-0 bottom-4 w-[17.5rem] max-w-[85vw] lg:relative lg:top-auto lg:right-auto lg:bottom-auto lg:w-[17.5rem] lg:ml-4'
            : 'w-0',
        )}
        aria-hidden={!showExpertPanel}
      >
        <div
          ref={colleaguesPanelRef}
          className={cn(
            'h-full flex flex-col min-h-0 w-[17.5rem] max-w-[85vw] rounded-[var(--radius-lg)] bg-[var(--bg-card)] shadow-[var(--shadow-card)] p-4 lg:p-0 lg:rounded-none lg:bg-transparent lg:shadow-none',
            !showExpertPanel && 'pointer-events-none',
          )}
        >
          <div className="shrink-0 pb-3">
            <h2 className="font-display font-semibold text-sm text-[var(--text-primary)]">
              {t('chat.colleaguesPanel')}
            </h2>
            <p className="text-[11px] text-[var(--text-muted)] mt-1 leading-relaxed">{t('chat.expertHint')}</p>
          </div>
          <div ref={colleagueCardsRef} className="flex-1 overflow-y-auto space-y-2 min-h-0">
            {enabledAgents.map((agent) => (
              <ColleagueCard
                key={agent.id}
                colleague={agent}
                selected={agent.id === selectedAgentId}
                compact
                lastMessage={
                  agent.id === selectedAgentId && lastUserMessage
                    ? lastUserMessage.slice(0, 60) + (lastUserMessage.length > 60 ? '…' : '')
                    : undefined
                }
                onClick={() => selectColleague(agent.id)}
              />
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}
