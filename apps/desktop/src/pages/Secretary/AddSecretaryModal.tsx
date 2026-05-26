import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Briefcase, CalendarClock, UserRound, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { createSecretary, type SecretaryRecord } from '@/lib/api-client';
import { TYPE_BADGE, TYPE_COLORS, type SecretaryType } from './secretary-utils';

interface AddSecretaryModalProps {
  onClose: () => void;
  onCreated: (secretary: SecretaryRecord) => void;
}

const TYPE_OPTIONS: Array<{
  type: SecretaryType;
  icon: typeof CalendarClock;
}> = [
  { type: 'time', icon: CalendarClock },
  { type: 'personal', icon: UserRound },
  { type: 'work', icon: Briefcase },
];

export function AddSecretaryModal({ onClose, onCreated }: AddSecretaryModalProps) {
  const { t } = useTranslation();
  const [type, setType] = useState<SecretaryType>('personal');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      const secretary = await createSecretary({
        name: name.trim(),
        type,
        description: description.trim() || undefined,
        systemPrompt: systemPrompt.trim() || undefined,
        color: TYPE_COLORS[type],
        enabled: true,
      });
      if (secretary) onCreated(secretary);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <Card className="w-full max-w-lg p-6 space-y-5 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>{t('secretary.newSecretary')}</CardTitle>
            <CardDescription className="mt-1">{t('secretary.addSubtitle')}</CardDescription>
          </div>
          <button type="button" onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {TYPE_OPTIONS.map(({ type: opt, icon: Icon }) => (
            <button
              key={opt}
              type="button"
              onClick={() => setType(opt)}
              className={cn(
                'flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all',
                type === opt
                  ? 'border-brand-400 bg-brand-50/50 dark:bg-brand-900/20 shadow-sm'
                  : 'border-[var(--border)] hover:border-brand-200',
              )}
            >
              <Icon className="w-5 h-5" style={{ color: TYPE_COLORS[opt] }} />
              <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', TYPE_BADGE[opt])}>
                {t(`secretary.type${opt.charAt(0).toUpperCase()}${opt.slice(1)}` as 'secretary.typeTime')}
              </span>
            </button>
          ))}
        </div>

        <input
          className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm bg-[var(--bg-card)]"
          placeholder={t('secretary.namePlaceholder')}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm bg-[var(--bg-card)]"
          placeholder={t('secretary.descriptionPlaceholder')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <textarea
          className="w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm bg-[var(--bg-card)] min-h-[88px] resize-none"
          placeholder={t('secretary.systemPromptPlaceholder')}
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
        />

        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
          <Button onClick={() => void handleCreate()} disabled={submitting || !name.trim()}>
            {submitting ? t('common.loading') : t('secretary.create')}
          </Button>
        </div>
      </Card>
    </div>
  );
}
