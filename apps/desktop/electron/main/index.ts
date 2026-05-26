/**
 * Electron Main Process
 */
import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { join } from 'path';
import { ServerSupervisor } from '../gateway/supervisor';
import { registerIpcHandlers } from './ipc-handlers';
import { createTray, destroyTray } from './tray';
import { getLlmConfigFromStore } from './settings-store';
import { isQuitting, setQuitting, isQuitCleanupDone, markQuitCleanupDone } from './app-state';

const isDev = !app.isPackaged;
let mainWindow: BrowserWindow | null = null;
let supervisor: ServerSupervisor | null = null;
let quitCleanupPromise: Promise<void> | null = null;

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: '#fffbf7',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('close', (event) => {
    if (process.platform === 'darwin' && !isQuitting()) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    await mainWindow.loadFile(join(__dirname, '../../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (mainWindow) {
    createTray(mainWindow, supervisor);
  }
}

async function shutdownOrchestrator(): Promise<void> {
  if (!supervisor) return;
  await supervisor.shutdownOnQuit();
}

app.whenReady().then(async () => {
  supervisor = new ServerSupervisor();
  registerIpcHandlers(supervisor);

  try {
    await supervisor.start();
  } catch (err) {
    console.warn('[main] Server supervisor start deferred:', err);
  }

  const llmConfig = getLlmConfigFromStore();
  if (llmConfig.apiKey || llmConfig.providerType !== 'stub') {
    try {
      await fetch('http://127.0.0.1:3847/api/config/llm', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(llmConfig),
      });
    } catch (err) {
      console.warn('[main] Failed to sync LLM config on startup:', err);
    }
  }

  await createWindow();

  app.on('activate', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
      return;
    }
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', (event) => {
  setQuitting();
  destroyTray();

  if (isQuitCleanupDone()) {
    return;
  }

  if (quitCleanupPromise) {
    event.preventDefault();
    return;
  }

  event.preventDefault();
  quitCleanupPromise = shutdownOrchestrator()
    .catch((err) => {
      console.warn('[main] Orchestrator shutdown error during quit:', err);
    })
    .finally(() => {
      quitCleanupPromise = null;
      markQuitCleanupDone();
      app.quit();
    });
});

app.on('will-quit', () => {
  destroyTray();
});

ipcMain.handle('shell:openExternal', (_event, url: string) => {
  return shell.openExternal(url);
});

function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

function getSupervisor(): ServerSupervisor | null {
  return supervisor;
}

export { getMainWindow, getSupervisor };
