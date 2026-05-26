import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, Sun, Moon, Cpu, KeyRound, Server, RefreshCw, Trash2, AlertTriangle, Plug, Brain } from 'lucide-react';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useThemeStore } from '@/lib/theme-store';
import {
  createMcpServer,
  deleteMcpServer,
  fetchEmbeddingConfig,
  fetchLlmConfig,
  fetchMcpServers,
  invokeIpc,
  resetAllApplicationData,
  resetConversations,
  resetMemory,
  saveEmbeddingConfig,
  saveLlmConfig,
  testLlmConnection,
  type EmbeddingConfigPublic,
  type McpServerRecord,
} from '@/lib/api-client';
import type { LlmConfigPublic } from '@/lib/api-client';

const PROVIDERS = ['stub', 'openai', 'anthropic', 'custom'] as const;

export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useThemeStore();
  const [llm, setLlm] = useState<LlmConfigPublic>({
    providerType: 'stub',
    baseUrl: '',
    modelName: 'stub-mini',
    hasApiKey: false,
  });
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [modelName, setModelName] = useState('stub-mini');
  const [providerType, setProviderType] =
    useState<LlmConfigPublic['providerType']>('stub');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message?: string } | null>(null);
  const [resetDialog, setResetDialog] = useState<'memory' | 'conversations' | 'all' | null>(null);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [resetting, setResetting] = useState(false);
  const [resetResult, setResetResult] = useState<{ ok: boolean; message?: string } | null>(null);
  const [mcpServers, setMcpServers] = useState<McpServerRecord[]>([]);
  const [mcpName, setMcpName] = useState('');
  const [mcpCommand, setMcpCommand] = useState('');
  const [mcpArgs, setMcpArgs] = useState('');
  const [embeddingProvider, setEmbeddingProviderState] =
    useState<EmbeddingConfigPublic['providerType']>('stub');
  const [embeddingApiKey, setEmbeddingApiKey] = useState('');
  const [embeddingModel, setEmbeddingModel] = useState('text-embedding-3-small');

  useEffect(() => {
    void fetchLlmConfig().then((config) => {
      setLlm(config);
      setProviderType(config.providerType);
      setBaseUrl(config.baseUrl);
      setModelName(config.modelName);
    });
    void fetchMcpServers().then(setMcpServers);
    void fetchEmbeddingConfig().then((config) => {
      setEmbeddingProviderState(config.providerType);
      setEmbeddingModel(config.modelName);
    });
  }, []);

  const toggleLang = () => {
    void i18n.changeLanguage(i18n.language === 'zh' ? 'en' : 'zh');
  };

  const handleSaveLlm = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const updated = await saveLlmConfig({
        providerType,
        baseUrl,
        modelName,
        apiKey: apiKey || undefined,
      });
      setLlm(updated);
      setApiKey('');
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  const handleRestartServer = () => {
    if (window.electron) {
      void invokeIpc('server:restart');
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      if (providerType !== 'stub' && (apiKey || !llm.hasApiKey)) {
        await saveLlmConfig({
          providerType,
          baseUrl,
          modelName,
          apiKey: apiKey || undefined,
        });
      }
      const result = await testLlmConnection();
      setTestResult({
        ok: result.ok,
        message: result.ok ? result.message : result.error,
      });
    } finally {
      setTesting(false);
    }
  };

  const openResetDialog = (type: 'memory' | 'conversations' | 'all') => {
    setResetDialog(type);
    setResetConfirmText('');
    setResetResult(null);
  };

  const closeResetDialog = () => {
    setResetDialog(null);
    setResetConfirmText('');
  };

  const handleReset = async () => {
    if (resetConfirmText !== t('settings.reset.confirmWord')) return;
    if (!resetDialog) return;

    setResetting(true);
    setResetResult(null);
    try {
      const result =
        resetDialog === 'memory'
          ? await resetMemory()
          : resetDialog === 'conversations'
            ? await resetConversations()
            : await resetAllApplicationData();

      setResetResult({
        ok: result.ok,
        message: result.ok ? t('settings.reset.success') : result.error,
      });
      if (result.ok) {
        setTimeout(() => closeResetDialog(), 1200);
      }
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="font-display text-2xl font-bold text-[var(--text-primary)]">
        {t('settings.title')}
      </h1>

      <Card>
        <CardTitle className="flex items-center gap-2">
          <Globe className="w-5 h-5 text-brand-500" />
          {t('settings.language')}
        </CardTitle>
        <CardDescription className="mb-4">
          {t('settings.languageCurrent', {
            lang: i18n.language === 'zh' ? '简体中文' : 'English',
          })}
        </CardDescription>
        <Button variant="secondary" size="sm" onClick={toggleLang}>
          {i18n.language === 'zh' ? 'Switch to English' : '切换到中文'}
        </Button>
      </Card>

      <Card>
        <CardTitle className="flex items-center gap-2">
          {theme === 'dark' ? (
            <Moon className="w-5 h-5 text-indigo-400" />
          ) : (
            <Sun className="w-5 h-5 text-amber-500" />
          )}
          {t('settings.theme')}
        </CardTitle>
        <CardDescription className="mb-4">
          {theme === 'dark' ? t('settings.themeDark') : t('settings.themeLight')}
        </CardDescription>
        <div className="flex gap-2">
          <Button
            variant={theme === 'light' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setTheme('light')}
          >
            {t('settings.themeLightLabel')}
          </Button>
          <Button
            variant={theme === 'dark' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setTheme('dark')}
          >
            {t('settings.themeDarkLabel')}
          </Button>
        </div>
      </Card>

      <Card>
        <CardTitle className="flex items-center gap-2">
          <Cpu className="w-5 h-5 text-brand-500" />
          {t('settings.llm.title')}
        </CardTitle>
        <CardDescription className="mb-4">{t('settings.llm.description')}</CardDescription>

        <div className="space-y-4">
          <label className="block space-y-1">
            <span className="text-sm font-medium text-[var(--text-primary)]">
              {t('settings.llm.provider')}
            </span>
            <select
              value={providerType}
              onChange={(e) =>
                setProviderType(e.target.value as LlmConfigPublic['providerType'])
              }
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text-primary)]"
            >
              {PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {t(`settings.llm.providers.${p}`)}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium text-[var(--text-primary)] flex items-center gap-1">
              <Server className="w-3.5 h-3.5" />
              {t('settings.llm.baseUrl')}
            </span>
            <input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.openai.com/v1"
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium text-[var(--text-primary)]">
              {t('settings.llm.model')}
            </span>
            <input
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              placeholder="gpt-4o-mini"
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium text-[var(--text-primary)] flex items-center gap-1">
              <KeyRound className="w-3.5 h-3.5" />
              {t('settings.llm.apiKey')}
            </span>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={
                llm.hasApiKey ? t('settings.llm.apiKeySaved') : t('settings.llm.apiKeyPlaceholder')
              }
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
            />
            {llm.hasApiKey && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400">
                {t('settings.llm.apiKeyStored')}
              </p>
            )}
          </label>

          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" onClick={() => void handleSaveLlm()} disabled={saving}>
              {saving ? t('settings.llm.saving') : t('settings.llm.save')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void handleTestConnection()}
              disabled={testing || providerType === 'stub'}
            >
              {testing ? t('settings.llm.testing') : t('settings.llm.testConnection')}
            </Button>
            {saved && (
              <span className="text-sm text-emerald-600 dark:text-emerald-400">
                {t('settings.llm.saved')}
              </span>
            )}
            {testResult && (
              <span
                className={
                  testResult.ok
                    ? 'text-sm text-emerald-600 dark:text-emerald-400'
                    : 'text-sm text-red-600 dark:text-red-400'
                }
              >
                {testResult.ok ? t('settings.llm.testOk') : testResult.message}
              </span>
            )}
          </div>
        </div>
      </Card>

      <Card>
        <CardTitle className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-brand-500" />
          {t('settings.embedding.title')}
        </CardTitle>
        <CardDescription className="mb-4">{t('settings.embedding.description')}</CardDescription>
        <div className="space-y-3">
          <select
            value={embeddingProvider}
            onChange={(e) =>
              setEmbeddingProviderState(e.target.value as EmbeddingConfigPublic['providerType'])
            }
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm"
          >
            <option value="stub">{t('settings.embedding.stub')}</option>
            <option value="openai">OpenAI</option>
          </select>
          <input
            value={embeddingModel}
            onChange={(e) => setEmbeddingModel(e.target.value)}
            placeholder="text-embedding-3-small"
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm"
          />
          <input
            type="password"
            value={embeddingApiKey}
            onChange={(e) => setEmbeddingApiKey(e.target.value)}
            placeholder={t('settings.llm.apiKeyPlaceholder')}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm"
          />
          <Button
            size="sm"
            onClick={() =>
              void saveEmbeddingConfig({
                providerType: embeddingProvider,
                modelName: embeddingModel,
                apiKey: embeddingApiKey || undefined,
              }).then((config) => {
                setEmbeddingProviderState(config.providerType);
                setEmbeddingModel(config.modelName);
              })
            }
          >
            {t('settings.llm.save')}
          </Button>
        </div>
      </Card>

      <Card>
        <CardTitle className="flex items-center gap-2">
          <Plug className="w-5 h-5 text-brand-500" />
          {t('settings.mcp.title')}
        </CardTitle>
        <CardDescription className="mb-4">{t('settings.mcp.description')}</CardDescription>
        <div className="space-y-3 mb-4">
          {mcpServers.map((s) => (
            <div key={s.id} className="flex items-center justify-between text-sm border border-[var(--border)] rounded-lg px-3 py-2">
              <div>
                <div className="font-medium">{s.name}</div>
                <div className="text-xs text-[var(--text-muted)] font-mono">{s.command}</div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  void deleteMcpServer(s.id).then(() => fetchMcpServers().then(setMcpServers))
                }
              >
                {t('settings.mcp.remove')}
              </Button>
            </div>
          ))}
        </div>
        <div className="space-y-2">
          <input
            value={mcpName}
            onChange={(e) => setMcpName(e.target.value)}
            placeholder={t('settings.mcp.namePlaceholder')}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm"
          />
          <input
            value={mcpCommand}
            onChange={(e) => setMcpCommand(e.target.value)}
            placeholder={t('settings.mcp.commandPlaceholder')}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm font-mono"
          />
          <input
            value={mcpArgs}
            onChange={(e) => setMcpArgs(e.target.value)}
            placeholder={t('settings.mcp.argsPlaceholder')}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm font-mono"
          />
          <Button
            size="sm"
            onClick={() => {
              if (!mcpName.trim() || !mcpCommand.trim()) return;
              void createMcpServer({
                name: mcpName.trim(),
                command: mcpCommand.trim(),
                args: mcpArgs.trim() ? mcpArgs.split(/\s+/) : [],
                enabled: true,
              }).then((server) => {
                if (server) {
                  setMcpName('');
                  setMcpCommand('');
                  setMcpArgs('');
                  void fetchMcpServers().then(setMcpServers);
                }
              });
            }}
          >
            {t('settings.mcp.add')}
          </Button>
        </div>
      </Card>

      {window.electron && (
        <Card>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-brand-500" />
            {t('settings.server.title')}
          </CardTitle>
          <CardDescription className="mb-4">{t('settings.server.description')}</CardDescription>
          <Button variant="secondary" size="sm" onClick={handleRestartServer}>
            {t('settings.server.restart')}
          </Button>
        </Card>
      )}

      <Card>
        <CardTitle className="flex items-center gap-2">
          <Trash2 className="w-5 h-5 text-red-500" />
          {t('settings.reset.title')}
        </CardTitle>
        <CardDescription className="mb-4">{t('settings.reset.description')}</CardDescription>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => openResetDialog('memory')}>
            {t('settings.reset.clearMemory')}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => openResetDialog('conversations')}>
            {t('settings.reset.clearConversations')}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => openResetDialog('all')}>
            {t('settings.reset.fullReset')}
          </Button>
        </div>
      </Card>

      {resetDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md shadow-xl">
            <CardTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5" />
              {t(`settings.reset.dialog.${resetDialog}.title`)}
            </CardTitle>
            <CardDescription className="my-4">
              {t(`settings.reset.dialog.${resetDialog}.description`)}
            </CardDescription>
            <label className="block space-y-1 mb-4">
              <span className="text-sm text-[var(--text-primary)]">
                {t('settings.reset.confirmPrompt', { word: t('settings.reset.confirmWord') })}
              </span>
              <input
                value={resetConfirmText}
                onChange={(e) => setResetConfirmText(e.target.value)}
                placeholder={t('settings.reset.confirmWord')}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text-primary)]"
              />
            </label>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => void handleReset()}
                disabled={
                  resetting || resetConfirmText !== t('settings.reset.confirmWord')
                }
              >
                {resetting ? t('settings.reset.resetting') : t('settings.reset.confirm')}
              </Button>
              <Button variant="secondary" size="sm" onClick={closeResetDialog} disabled={resetting}>
                {t('settings.reset.cancel')}
              </Button>
              {resetResult && (
                <span
                  className={
                    resetResult.ok
                      ? 'text-sm text-emerald-600 dark:text-emerald-400'
                      : 'text-sm text-red-600 dark:text-red-400'
                  }
                >
                  {resetResult.message}
                </span>
              )}
            </div>
          </Card>
        </div>
      )}

      <Card>
        <CardTitle>{t('settings.about')}</CardTitle>
        <CardDescription>
          Aigolet v0.1.0 — Event-sourced orchestrator for one-person companies.
        </CardDescription>
      </Card>
    </div>
  );
}
