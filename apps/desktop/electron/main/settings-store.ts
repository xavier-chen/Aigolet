import { app, safeStorage } from 'electron';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { LlmProviderConfig, LlmProviderType } from '@aigolet-next/protocol';

interface StoredSettings {
  llm?: {
    providerType: LlmProviderType;
    baseUrl: string;
    modelName: string;
    apiKeyEncrypted?: string;
  };
}

function getSettingsPath(): string {
  const dir = join(app.getPath('userData'), 'settings');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, 'aigolet-settings.json');
}

function readStore(): StoredSettings {
  const path = getSettingsPath();
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as StoredSettings;
  } catch {
    return {};
  }
}

function writeStore(data: StoredSettings): void {
  writeFileSync(getSettingsPath(), JSON.stringify(data, null, 2), 'utf-8');
}

function encrypt(value: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(value).toString('base64');
  }
  return Buffer.from(value, 'utf-8').toString('base64');
}

function decrypt(value: string): string {
  const buf = Buffer.from(value, 'base64');
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.decryptString(buf);
  }
  return buf.toString('utf-8');
}

export function getLlmConfigFromStore(): LlmProviderConfig {
  const store = readStore();
  const llm = store.llm;
  if (!llm) {
    return {
      providerType: 'stub',
      baseUrl: '',
      modelName: 'stub-mini',
    };
  }

  return {
    providerType: llm.providerType,
    baseUrl: llm.baseUrl,
    modelName: llm.modelName,
    apiKey: llm.apiKeyEncrypted ? decrypt(llm.apiKeyEncrypted) : undefined,
  };
}

export function saveLlmConfigToStore(config: LlmProviderConfig): LlmProviderConfig {
  const store = readStore();
  store.llm = {
    providerType: config.providerType,
    baseUrl: config.baseUrl,
    modelName: config.modelName,
    apiKeyEncrypted: config.apiKey ? encrypt(config.apiKey) : store.llm?.apiKeyEncrypted,
  };
  if (config.apiKey === '') {
    delete store.llm.apiKeyEncrypted;
  }
  writeStore(store);
  return getLlmConfigFromStore();
}
