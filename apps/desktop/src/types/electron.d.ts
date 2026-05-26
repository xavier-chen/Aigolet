export interface IpcRenderer {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  on(channel: string, callback: (...args: unknown[]) => void): (() => void) | void;
}

export interface ServerStatusInfo {
  status: 'stopped' | 'starting' | 'running' | 'error';
  port: number;
  error?: string;
}

export interface ServerHealth {
  ok: boolean;
  status?: string;
  uptime?: number;
  error?: string;
}

export interface LlmConfigPublic {
  providerType: 'stub' | 'openai' | 'anthropic' | 'custom';
  baseUrl: string;
  modelName: string;
  hasApiKey: boolean;
}

export interface LlmConfigInput {
  providerType: 'stub' | 'openai' | 'anthropic' | 'custom';
  baseUrl: string;
  modelName: string;
  apiKey?: string;
}

export interface ElectronAPI {
  ipcRenderer: IpcRenderer;
  openExternal: (url: string) => Promise<void>;
  platform: NodeJS.Platform;
  isDev: boolean;
}

declare global {
  interface Window {
    electron?: ElectronAPI;
  }
}

export {};
