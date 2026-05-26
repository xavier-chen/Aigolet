import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Puzzle, ToggleLeft, ToggleRight, FileText } from 'lucide-react';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  createSkill,
  fetchSkills,
  updateSkill,
  type SkillRecord,
} from '@/lib/api-client';

export function SkillsPage() {
  const { t } = useTranslation();
  const [skills, setSkills] = useState<SkillRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');
  const [path, setPath] = useState('');
  const [source, setSource] = useState<'inline' | 'path'>('inline');
  const [submitting, setSubmitting] = useState(false);

  const loadSkills = async () => {
    setLoading(true);
    const list = await fetchSkills();
    setSkills(list);
    setLoading(false);
  };

  useEffect(() => {
    void loadSkills();
  }, []);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      const skill = await createSkill({
        name: name.trim(),
        description: description.trim() || undefined,
        source,
        content: source === 'inline' ? content : undefined,
        path: source === 'path' ? path : undefined,
        enabled: true,
      });
      if (skill) {
        setShowForm(false);
        setName('');
        setDescription('');
        setContent('');
        setPath('');
        await loadSkills();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const toggleEnabled = async (skill: SkillRecord) => {
    const updated = await updateSkill(skill.id, { enabled: !skill.enabled });
    if (updated) {
      setSkills((prev) => prev.map((s) => (s.id === skill.id ? updated : s)));
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[var(--text-primary)]">
            {t('skills.title')}
          </h1>
          <p className="text-[var(--text-muted)] mt-1">{t('skills.subtitle')}</p>
        </div>
        <Button size="sm" onClick={() => setShowForm((v) => !v)}>
          <Plus className="w-4 h-4" />
          {t('skills.add')}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardTitle>{t('skills.form.title')}</CardTitle>
          <CardDescription className="mb-4">{t('skills.form.description')}</CardDescription>
          <div className="space-y-4">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('skills.form.name')}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm"
            />
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('skills.form.descriptionField')}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm"
            />
            <div className="flex gap-2">
              <Button
                variant={source === 'inline' ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setSource('inline')}
              >
                {t('skills.form.inline')}
              </Button>
              <Button
                variant={source === 'path' ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setSource('path')}
              >
                {t('skills.form.path')}
              </Button>
            </div>
            {source === 'inline' ? (
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={t('skills.form.content')}
                rows={6}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm font-mono"
              />
            ) : (
              <input
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder={t('skills.form.pathPlaceholder')}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm"
              />
            )}
            <div className="flex gap-2">
              <Button size="sm" onClick={() => void handleCreate()} disabled={submitting}>
                {submitting ? t('skills.form.saving') : t('skills.form.save')}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>
                {t('skills.form.cancel')}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {loading ? (
        <Card>
          <CardDescription>{t('skills.loading')}</CardDescription>
        </Card>
      ) : skills.length === 0 ? (
        <Card className="text-center py-12">
          <Puzzle className="w-10 h-10 text-brand-400 mx-auto mb-3" />
          <CardTitle>{t('skills.empty')}</CardTitle>
          <CardDescription>{t('skills.emptyHint')}</CardDescription>
        </Card>
      ) : (
        <div className="space-y-3">
          {skills.map((skill) => (
            <Card key={skill.id} className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-brand-500 shrink-0" />
                  <span className="truncate">{skill.name}</span>
                  {!skill.enabled && (
                    <span className="text-xs font-normal text-[var(--text-muted)]">
                      ({t('skills.disabled')})
                    </span>
                  )}
                </CardTitle>
                {skill.description && (
                  <CardDescription className="mt-1">{skill.description}</CardDescription>
                )}
                <p className="text-xs text-[var(--text-muted)] mt-2">
                  {skill.source === 'inline'
                    ? t('skills.sourceInline')
                    : t('skills.sourcePath', { path: skill.path ?? '—' })}
                  {skill.enabled && (
                    <span className="ml-2 text-emerald-600">{t('skills.loadedAtRuntime')}</span>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void toggleEnabled(skill)}
                className="no-drag shrink-0 text-brand-500 hover:text-brand-600 transition-colors"
                title={skill.enabled ? t('skills.disable') : t('skills.enable')}
              >
                {skill.enabled ? (
                  <ToggleRight className="w-8 h-8" />
                ) : (
                  <ToggleLeft className="w-8 h-8 text-[var(--text-muted)]" />
                )}
              </button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
