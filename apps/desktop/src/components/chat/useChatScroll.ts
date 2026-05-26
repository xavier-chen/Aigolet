import { useCallback, useEffect, useRef, useState } from 'react';

const NEAR_BOTTOM_THRESHOLD = 80;

interface UseChatScrollOptions {
  /** Re-run auto-scroll when these values change (e.g. messages) */
  watch: unknown[];
  /** Use instant scroll (e.g. on initial history load) */
  instant?: boolean;
}

export function useChatScroll({ watch, instant }: UseChatScrollOptions) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const [showScrollButton, setShowScrollButton] = useState(false);

  const isNearBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_THRESHOLD;
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const el = scrollContainerRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior });
    } else {
      bottomRef.current?.scrollIntoView({ behavior });
    }
    shouldAutoScrollRef.current = true;
    setShowScrollButton(false);
  }, []);

  const handleScroll = useCallback(() => {
    const nearBottom = isNearBottom();
    shouldAutoScrollRef.current = nearBottom;
    setShowScrollButton(!nearBottom);
  }, [isNearBottom]);

  const forceAutoScroll = useCallback(() => {
    shouldAutoScrollRef.current = true;
    setShowScrollButton(false);
  }, []);

  useEffect(() => {
    if (!shouldAutoScrollRef.current) return;
    scrollToBottom(instant ? 'instant' : 'smooth');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, watch);

  return {
    scrollContainerRef,
    bottomRef,
    showScrollButton,
    scrollToBottom,
    handleScroll,
    forceAutoScroll,
  };
}
