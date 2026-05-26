import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Save, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  deleteSecretary,
  fetchSkillsList,
  fetchTools,
  updateSecretary,
  type SecretaryRecord,
  type SkillRecord,
  type ToolDefinitionRecord,
} from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { TYPE_BADGE } from './secretary-utils';
import { TimeSecretaryPanel } from './TimeSecretaryPanel';
import { SecretaryChatPanel } from './SecretaryChatPanel';

interface SecretaryDetailPanelProps {
  secretary: SecretaryRecord;
  onUpdated: (secretary: SecretaryRecord) => void;
  onDeleted: (id: string) => void;
}

export function SecretaryDetailPanel({
  secretary: initial,
  onUpdated,
  onDeleted,
}: SecretaryDetailPanelProps) {
  const { t } = useTranslation();
  const [secretary, setSecretary] = useState(initial);
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description ?? '');
  const [systemPrompt, setSystemPrompt] = useState(initial.systemPrompt ?? '');
  const [allowedTools, setAllowedTools] = useState<string[]>(initial.allowedTools ?? []);
  const [allowedSkills, setAllowedSkills] = useState<string[]>(initial.allowedSkills ?? []);
  const [tools, setTools] = useState<ToolDefinitionRecord[]>([]);
  const [skills, setSkills] = useState<SkillRecord[]>([]);
  const [saving, setSaving] = useState(false);
  const [showConfig, setShowConfig] = useState(true);

  useEffect(() => {
    setSecretary(initial);
    setName(initial.name);
    setDescription(initial.description ?? '');
    setSystemPrompt(initial.systemPrompt ?? '');
    setAllowedTools(initial.allowedTools ?? []);
    setAllowedSkills(initial.allowedSkills ?? []);
  }, [initial]);

  useEffect(() => {
    void (async () => {
      const [toolList, skillList] = await Promise.all([fetchTools(), fetchSkillsList()]);
      setTools(toolList);
      setSkills(skillList);
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await updateSecretary(secretary.id, {
        name: name.trim(),
        description: description.trim() || undefined,
        systemPrompt: systemPrompt.trim() || undefined,
        allowedTools: allowedTools.length ? allowedTools : undefined,
        allowedSkills: allowedSkills.length ? allowedSkills : undefined,
      });
      if (updated) {
        setSecretary(updated);
        onUpdated(updated);
      }
    } finally {
      setSaving(false);
    }
  };

  const toggleEnabled = async () => {
    const updated = await updateSecretary(secretary.id, { enabled: !secretary.enabled });
    if (updated) {
      setSecretary(updated);
      onUpdated(updated);
    }
  };

  const handleDelete = async () => {
    const ok = await deleteSecretary(secretary.id);
    if (ok) onDeleted(secretary.id);
  };

  const toggleMulti = (key: 'allowedTools' | 'allowedSkills', value: string) => {
    const setter = key === 'allowedTools' ? setAllowedTools : setAllowedSkills;
    setter((list) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <span className={cn('text-xs font-medium px-2.5 py-1 rounded-full', TYPE_BADGE[secretary.type])}>
            {t(`secretary.type${secretary.type.charAt(0).toUpperCase()}${secretary.type.slice(1)}` as 'secretary.typeTime')}
          </span>
          <button type="button" onClick={() => void toggleEnabled()}>
            {secretary.enabled ? (
              <ToggleRight className="w-7 h-7 text-emerald-500" />
            ) : (
              <ToggleLeft className="w-7 h-7 text-[var(--text-muted)]" />
            )}
          </button>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowConfig((v) => !v)}>
            {showConfig ? t('secretary.hideConfig') : t('secretary.configure')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => void handleDelete()}>
            <Trash2 className="w-4 h-4 text-red-500" />
            {t('common.delete')}
          </Button>
        </div>
      </div>

      {showConfig && (
        <Card className="p-5 space-y-4">
          <CardTitle className="text-base">{t('secretary.configure')}</CardTitle>
          <CardDescription>{t('secretary.configSubtitle')}</CardDescription>
          <input
            className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm bg-[var(--bg-card)]"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('secretary.namePlaceholder')}
          />
          <input
            className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm bg-[var(--bg-card)]"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('secretary.descriptionPlaceholder')}
          />
          <textarea
            className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm bg-[var(--bg-card)] min-h-[100px] resize-none"
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder={t('secretary.systemPromptPlaceholder')}
          />

          {secretary.type !== 'time' && (
            <>
              <div>
                <p className="text-sm font-medium mb-2">{t('agents.allowedTools')}</p>
                <p className="text-xs text-[var(--text-muted)] mb-2">{t('agents.allowedToolsHint')}</p>
                <div className="flex flex-wrap gap-2">
                  {tools.map((tool) => (
                    <button
                      key={tool.id}
                      type="button"
                      onClick={() => toggleMulti('allowedTools', tool.id)}
                      className={cn(
                        'text-xs px-2.5 py-1 rounded-full border transition-colors',
                        allowedTools.includes(tool.id)
                          ? 'bg-brand-100 border-brand-300 text-brand-700 dark:bg-brand-900/30'
                          : 'border-[var(--border)] text-[var(--text-muted)]',
                      )}
                    >
                      {tool.name}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-sm font-medium mb-2">{t('agents.allowedSkills')}</p>
                <p className="text-xs text-[var(--text-muted)] mb-2">{t('agents.allowedSkillsHint')}</p>
                <div className="flex flex-wrap gap-2">
                  {skills.map((skill) => (
                    <button
                      key={skill.id}
                      type="button"
                      onClick={() => toggleMulti('allowedSkills', skill.id)}
                      className={cn(
                        'text-xs px-2.5 py-1 rounded-full border transition-colors',
                        allowedSkills.includes(skill.id)
                          ? 'bg-brand-100 border-brand-300 text-brand-700 dark:bg-brand-900/30'
                          : 'border-[var(--border)] text-[var(--text-muted)]',
                      )}
                    >
                      {skill.name}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          <Button size="sm" onClick={() => void handleSave()} disabled={saving || !name.trim()}>
            <Save className="w-4 h-4" />
            {saving ? t('common.loading') : t('common.save')}
          </Button>
        </Card>
      )}

      {secretary.type === 'time' && <TimeSecretaryPanel secretaryId={secretary.id} />}
      {(secretary.type === 'personal' || secretary.type === 'work') && (
        <SecretaryChatPanel secretary={secretary} />
      )}
    </div>
  );
}
