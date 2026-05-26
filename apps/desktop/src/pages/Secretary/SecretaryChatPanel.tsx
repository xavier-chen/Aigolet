import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, MessageCircle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { fadeInUp } from '@/lib/gsap';
import {
  extractRunResponse,
  fetchRun,
  fetchSecretaryChatHistory,
  submitRun,
  subscribeRunStream,
  type SecretaryRecord,
} from '@/lib/api-client';
import { cn } from '@/lib/utils';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
  error?: string;
}

interface SecretaryChatPanelProps {
  secretary: SecretaryRecord;
}

export function SecretaryChatPanel({ secretary }: SecretaryChatPanelProps) {
  const { t } = useTranslation();
  const panelRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const { sessionId: sid, messages: history } = await fetchSecretaryChatHistory(secretary.id);
      setSessionId(sid || null);
      setMessages(
        history
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .map((m) => ({ id: m.id, role: m.role as 'user' | 'assistant', content: m.content })),
      );
      setLoading(false);
    })();
  }, [secretary.id]);

  useEffect(() => {
    if (panelRef.current) fadeInUp(panelRef.current);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || sending) return;
    const text = input.trim();
    setInput('');
    setSending(true);

    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: text };
    const assistantId = crypto.randomUUID();
    setMessages((prev) => [...prev, userMsg, { id: assistantId, role: 'assistant', content: '', streaming: true }]);

    const { run, sessionId: newSid, error } = await submitRun(text, sessionId ?? undefined, undefined, undefined, secretary.id);
    if (newSid) setSessionId(newSid);

    if (error || !run) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: error ?? t('chat.submitError'), streaming: false, error: error ?? undefined }
            : m,
        ),
      );
      setSending(false);
      return;
    }

    let content = '';
    subscribeRunStream(run.id, {
      onAssistantDelta: (delta) => {
        content += delta;
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, content, streaming: true } : m)),
        );
      },
      onCompleted: (payload) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: payload.response || content, streaming: false } : m,
          ),
        );
        setSending(false);
      },
      onFailed: (err) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: err, streaming: false, error: err } : m,
          ),
        );
        setSending(false);
      },
      onClose: async () => {
        if (content) return;
        const finalRun = await fetchRun(run.id);
        if (finalRun) {
          const response = extractRunResponse(finalRun);
          if (response) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: response, streaming: false } : m,
              ),
            );
          }
        }
        setSending(false);
      },
    });
  };

  return (
    <div ref={panelRef} className="space-y-4">
      <div className="flex items-center gap-2">
        <MessageCircle className="w-5 h-5 text-brand-500" />
        <h2 className="font-display text-lg font-semibold">{t('secretary.chat')}</h2>
      </div>
      <p className="text-sm text-[var(--text-muted)]">{t('secretary.chatSubtitle')}</p>

      <Card className="flex flex-col h-[420px] overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center h-full text-[var(--text-muted)]">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              {t('common.loading')}
            </div>
          ) : messages.length === 0 ? (
            <div className="flex items-center justify-center h-full text-[var(--text-muted)] text-sm text-center px-6">
              {t('secretary.chatEmpty')}
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}
              >
                <div
                  className={cn(
                    'max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap',
                    msg.role === 'user'
                      ? 'bg-brand-500 text-white'
                      : 'bg-[var(--bg-muted)] text-[var(--text-primary)]',
                    msg.error && 'border border-red-200 text-red-600',
                  )}
                >
                  {msg.content || (msg.streaming ? '…' : '')}
                  {msg.streaming && <span className="inline-block w-1.5 h-4 ml-1 bg-brand-400 animate-pulse align-middle" />}
                </div>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>

        <div className="border-t border-[var(--border)] p-3 flex gap-2">
          <input
            className="flex-1 rounded-xl border border-[var(--border)] px-3 py-2 text-sm bg-[var(--bg-card)]"
            placeholder={t('secretary.chatPlaceholder')}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            disabled={sending || !secretary.enabled}
          />
          <Button onClick={() => void handleSend()} disabled={sending || !input.trim() || !secretary.enabled}>
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : t('chat.send')}
          </Button>
        </div>
      </Card>
    </div>
  );
}
