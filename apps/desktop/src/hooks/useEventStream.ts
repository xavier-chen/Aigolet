import { useEffect, useRef, useState, useCallback } from 'react';
import { WS_BASE } from '@/lib/api-client';

export interface EventStreamMessage {
  type: string;
  event: string;
  payload: unknown;
}

export interface UseEventStreamOptions {
  onMessage?: (message: EventStreamMessage) => void;
  enabled?: boolean;
}

export function useEventStream(options: UseEventStreamOptions = {}) {
  const { onMessage, enabled = true } = options;
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const connect = useCallback(() => {
    if (!enabled) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(WS_BASE);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      retryRef.current = setTimeout(connect, 3000);
    };
    ws.onerror = () => ws.close();
    ws.onmessage = (evt) => {
      try {
        const message = JSON.parse(String(evt.data)) as EventStreamMessage;
        onMessageRef.current?.(message);
      } catch {
        // ignore malformed messages
      }
    };
  }, [enabled]);

  useEffect(() => {
    connect();
    return () => {
      if (retryRef.current) clearTimeout(retryRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { connected, reconnect: connect };
}
