/**
 * Preload — safe IPC bridge
 */
import { contextBridge, ipcRenderer } from 'electron';

const INVOKE_CHANNELS = [
  'server:status',
  'server:start',
  'server:stop',
  'server:restart',
  'server:health',
  'shell:openExternal',
  'app:version',
  'app:platform',
  'settings:getLlmConfig',
  'settings:setLlmConfig',
  'window:minimize',
  'window:maximize',
  'window:close',
  'window:isMaximized',
  'dialog:pickAndUploadFiles',
] as const;

const ON_CHANNELS = ['server:status-changed', 'navigate'] as const;

type InvokeChannel = (typeof INVOKE_CHANNELS)[number];
type OnChannel = (typeof ON_CHANNELS)[number];

const electronAPI = {
  ipcRenderer: {
    invoke: (channel: string, ...args: unknown[]) => {
      if (!INVOKE_CHANNELS.includes(channel as InvokeChannel)) {
        throw new Error(`Invalid IPC channel: ${channel}`);
      }
      return ipcRenderer.invoke(channel, ...args);
    },
    on: (channel: string, callback: (...args: unknown[]) => void) => {
      if (!ON_CHANNELS.includes(channel as OnChannel)) {
        throw new Error(`Invalid IPC channel: ${channel}`);
      }
      const subscription = (_event: Electron.IpcRendererEvent, ...args: unknown[]) => {
        callback(...args);
      };
      ipcRenderer.on(channel, subscription);
      return () => ipcRenderer.removeListener(channel, subscription);
    },
  },
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  platform: process.platform,
  isDev: process.env.NODE_ENV === 'development' || !!process.env.VITE_DEV_SERVER_URL,
};

contextBridge.exposeInMainWorld('electron', electronAPI);

export type ElectronAPI = typeof electronAPI;
