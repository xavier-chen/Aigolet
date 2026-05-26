import { useState, useEffect } from 'react';
import { Minus, Square, X, Copy } from 'lucide-react';
import { invokeIpc } from '@/lib/api-client';

export function TitleBar() {
  const platform = window.electron?.platform;

  if (platform === 'darwin') {
    return null;
  }

  if (platform !== 'win32') {
    return null;
  }

  return <WindowsTitleBar />;
}

function WindowsTitleBar() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    void invokeIpc<boolean>('window:isMaximized').then(setMaximized);
  }, []);

  const handleMinimize = () => {
    void invokeIpc('window:minimize');
  };

  const handleMaximize = () => {
    void invokeIpc('window:maximize').then(() => {
      void invokeIpc<boolean>('window:isMaximized').then(setMaximized);
    });
  };

  const handleClose = () => {
    void invokeIpc('window:close');
  };

  return (
    <div
      data-testid="windows-titlebar"
      className="drag-region flex h-10 shrink-0 items-center justify-end bg-[var(--bg-sidebar)]"
    >
      <div className="no-drag flex h-full">
        <button
          onClick={handleMinimize}
          className="flex h-full w-11 items-center justify-center text-[var(--text-muted)] hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          title="Minimize"
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          onClick={handleMaximize}
          className="flex h-full w-11 items-center justify-center text-[var(--text-muted)] hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          title={maximized ? 'Restore' : 'Maximize'}
        >
          {maximized ? <Copy className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
        </button>
        <button
          onClick={handleClose}
          className="flex h-full w-11 items-center justify-center text-[var(--text-muted)] hover:bg-red-500 hover:text-white transition-colors"
          title="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
