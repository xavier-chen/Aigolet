import { useCallback, useEffect, useState } from 'react';

export type ToastKind = 'success' | 'error';

export interface ToastState {
  message: string;
  kind: ToastKind;
}

export function useToast(durationMs = 2800) {
  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast = useCallback((message: string, kind: ToastKind = 'success') => {
    setToast({ message, kind });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), durationMs);
    return () => clearTimeout(timer);
  }, [toast, durationMs]);

  return { toast, showToast, clearToast: () => setToast(null) };
}
