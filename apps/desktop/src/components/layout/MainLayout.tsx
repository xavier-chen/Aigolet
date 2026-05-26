import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import { Sidebar } from './Sidebar';
import { TitleBar } from './TitleBar';
import { pageTransition } from '@/lib/gsap';
import { cn } from '@/lib/utils';

export function MainLayout() {
  const contentRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const platform = window.electron?.platform;
  const isMac = platform === 'darwin';
  const isWin = platform === 'win32';

  useEffect(() => {
    pageTransition(contentRef.current);
  }, [location.pathname]);

  useEffect(() => {
    if (!window.electron?.ipcRenderer) return;
    const unsubscribe = window.electron.ipcRenderer.on('navigate', (path) => {
      if (typeof path === 'string') navigate(path);
    });
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [navigate]);

  return (
    <div
      className={cn(
        'flex h-full overflow-hidden',
        isWin ? 'flex-col bg-[var(--bg-sidebar)]' : 'flex-row',
      )}
    >
      <TitleBar />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar />
        <main
          ref={contentRef}
          className={cn(
            'relative flex-1 overflow-auto p-8 pt-6',
            !isWin && 'border-t border-[var(--border)]',
          )}
        >
          {isMac && (
            <div
              data-testid="mac-main-drag-region"
              aria-hidden="true"
              className="drag-region absolute inset-x-0 top-0 z-10 h-7"
            />
          )}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
