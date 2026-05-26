import { ipcMain, app, BrowserWindow, dialog } from 'electron';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import type { ServerSupervisor } from '../gateway/supervisor';
import { getLlmConfigFromStore, saveLlmConfigToStore } from './settings-store';
import type { LlmProviderConfig } from '@aigolet-next/protocol';

const SERVER_PORT = 3847;

function getMainWindow(): BrowserWindow | null {
  return BrowserWindow.getAllWindows()[0] ?? null;
}

async function syncLlmConfigToServer(config: LlmProviderConfig): Promise<void> {
  try {
    await fetch(`http://127.0.0.1:${SERVER_PORT}/api/config/llm`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
  } catch (err) {
    console.warn('[ipc] Failed to sync LLM config to server:', err);
  }
}

export function registerIpcHandlers(supervisor: ServerSupervisor): void {
  ipcMain.handle('server:status', () => supervisor.getStatus());
  ipcMain.handle('server:start', () => supervisor.start());
  ipcMain.handle('server:stop', () => supervisor.stop());
  ipcMain.handle('server:restart', () => supervisor.restart());
  ipcMain.handle('server:health', async () => supervisor.checkHealth());

  ipcMain.handle('app:version', () => app.getVersion());
  ipcMain.handle('app:platform', () => process.platform);

  ipcMain.handle('settings:getLlmConfig', async () => {
    const config = getLlmConfigFromStore();
    return {
      providerType: config.providerType,
      baseUrl: config.baseUrl,
      modelName: config.modelName,
      hasApiKey: Boolean(config.apiKey),
    };
  });

  ipcMain.handle('settings:setLlmConfig', async (_event, config: LlmProviderConfig) => {
    const saved = saveLlmConfigToStore(config);
    await syncLlmConfigToServer(saved);
    return {
      providerType: saved.providerType,
      baseUrl: saved.baseUrl,
      modelName: saved.modelName,
      hasApiKey: Boolean(saved.apiKey),
    };
  });

  ipcMain.handle('window:minimize', () => {
    getMainWindow()?.minimize();
  });

  ipcMain.handle('window:maximize', () => {
    const win = getMainWindow();
    if (!win) return;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });

  ipcMain.handle('window:close', () => {
    getMainWindow()?.close();
  });

  ipcMain.handle('window:isMaximized', () => {
    return getMainWindow()?.isMaximized() ?? false;
  });

  ipcMain.handle('dialog:pickAndUploadFiles', async (_event, sessionId?: string) => {
    const win = getMainWindow();
    const dialogOptions = {
      properties: ['openFile', 'multiSelections'] as Array<'openFile' | 'multiSelections'>,
      filters: [
        {
          name: 'Documents',
          extensions: ['pdf', 'docx', 'doc', 'xlsx', 'xls', 'pptx', 'txt', 'md', 'csv'],
        },
      ],
    };
    const result = win
      ? await dialog.showOpenDialog(win, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions);

    if (result.canceled || result.filePaths.length === 0) {
      return { files: [] };
    }

    const files: Array<{
      fileId: string;
      filename: string;
      path: string;
      mimeType: string;
      size: number;
      relativePath: string;
      textPreview?: string;
    }> = [];

    for (const filePath of result.filePaths) {
      try {
        const buffer = readFileSync(filePath);
        const filename = basename(filePath);
        const res = await fetch(`http://127.0.0.1:${SERVER_PORT}/api/files/upload-buffer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename,
            contentBase64: buffer.toString('base64'),
            sessionId,
          }),
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string };
          console.warn('[ipc] Upload failed for', filename, err.error);
          continue;
        }
        const uploaded = (await res.json()) as (typeof files)[number];
        files.push(uploaded);
      } catch (err) {
        console.warn('[ipc] Failed to read/upload file:', filePath, err);
      }
    }

    return { files };
  });
}
