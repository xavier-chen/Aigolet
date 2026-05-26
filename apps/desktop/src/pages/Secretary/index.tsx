import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Plus, Sparkles } from 'lucide-react';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { fadeInUp, staggerCards } from '@/lib/gsap';
import { cn } from '@/lib/utils';
import { fetchSecretaries, type SecretaryRecord } from '@/lib/api-client';
import { AddSecretaryModal } from './AddSecretaryModal';
import { SecretaryDetailPanel } from './SecretaryDetailPanel';
import {
  TYPE_BADGE,
  TYPE_ICONS,
  secretaryColor,
  secretaryGradient,
} from './secretary-utils';

export function SecretaryPage() {
  const { t } = useTranslation();
  const headerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [secretaries, setSecretaries] = useState<SecretaryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  const load = async () => {
    setLoading(true);
    setSecretaries(await fetchSecretaries());
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (headerRef.current) fadeInUp(headerRef.current);
    if (gridRef.current && !loading && !selectedId) {
      staggerCards(gridRef.current.children, { delay: 0.08 });
    }
  }, [loading, selectedId]);

  const selected = secretaries.find((s) => s.id === selectedId);

  if (selected) {
    const Icon = TYPE_ICONS[selected.type];
    const gradient = secretaryGradient(selected);
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <Button variant="ghost" size="sm" onClick={() => setSelectedId(null)}>
          <ArrowLeft className="w-4 h-4" />
          {t('secretary.backToList')}
        </Button>
        <div className="flex items-start gap-4">
          <div
            className={cn(
              'w-14 h-14 rounded-2xl flex items-center justify-center shadow-soft',
              gradient ? `bg-gradient-to-br ${gradient}` : '',
            )}
            style={gradient ? undefined : { backgroundColor: secretaryColor(selected) }}
          >
            <Icon className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold">{selected.name}</h1>
            <p className="text-[var(--text-muted)]">
              {selected.description ?? t(`secretary.type${selected.type.charAt(0).toUpperCase()}${selected.type.slice(1)}Desc` as 'secretary.typeTimeDesc')}
            </p>
          </div>
        </div>
        <SecretaryDetailPanel
          secretary={selected}
          onUpdated={(updated) => setSecretaries((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))}
          onDeleted={() => {
            setSelectedId(null);
            void load();
          }}
        />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div ref={headerRef} className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-brand-600 dark:text-brand-300">
            <Sparkles className="w-5 h-5" />
            <span className="text-sm font-medium">{t('secretary.panelLabel')}</span>
          </div>
          <h1 className="font-display text-2xl font-bold">{t('secretary.title')}</h1>
          <p className="text-[var(--text-muted)] max-w-xl">{t('secretary.subtitle')}</p>
          <p className="text-xs text-[var(--text-muted)]">{t('secretary.orgNote')}</p>
        </div>
        <Button size="sm" onClick={() => setShowAddModal(true)}>
          <Plus className="w-4 h-4" />
          {t('secretary.add')}
        </Button>
      </div>

      {loading ? (
        <Card className="text-center py-12 text-[var(--text-muted)]">{t('common.loading')}</Card>
      ) : secretaries.length === 0 ? (
        <Card className="text-center py-16 space-y-4">
          <Sparkles className="w-10 h-10 mx-auto text-brand-400" />
          <CardTitle>{t('secretary.emptyTitle')}</CardTitle>
          <CardDescription>{t('secretary.emptyHint')}</CardDescription>
          <Button onClick={() => setShowAddModal(true)}>
            <Plus className="w-4 h-4" />
            {t('secretary.add')}
          </Button>
        </Card>
      ) : (
        <div ref={gridRef} className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {secretaries.map((sec) => {
            const Icon = TYPE_ICONS[sec.type];
            const gradient = secretaryGradient(sec);
            return (
              <Card
                key={sec.id}
                className={cn(
                  'p-5 cursor-pointer transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5',
                  !sec.enabled && 'opacity-60',
                )}
                onClick={() => setSelectedId(sec.id)}
              >
                <div className="flex items-start gap-4">
                  <div
                    className={cn(
                      'w-12 h-12 rounded-xl flex items-center justify-center shrink-0',
                      gradient ? `bg-gradient-to-br ${gradient}` : '',
                    )}
                    style={gradient ? undefined : { backgroundColor: secretaryColor(sec) }}
                  >
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base">{sec.name}</CardTitle>
                    <CardDescription className="mt-1 line-clamp-2">
                      {sec.description ?? t(`secretary.type${sec.type.charAt(0).toUpperCase()}${sec.type.slice(1)}Desc` as 'secretary.typeTimeDesc')}
                    </CardDescription>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium', TYPE_BADGE[sec.type])}>
                        {t(`secretary.type${sec.type.charAt(0).toUpperCase()}${sec.type.slice(1)}` as 'secretary.typeTime')}
                      </span>
                      <span
                        className={cn(
                          'text-[10px] px-2 py-0.5 rounded-full',
                          sec.enabled
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30'
                            : 'bg-slate-100 text-slate-500',
                        )}
                      >
                        {sec.enabled ? t('secretary.enabled') : t('secretary.disabled')}
                      </span>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {showAddModal && (
        <AddSecretaryModal
          onClose={() => setShowAddModal(false)}
          onCreated={(secretary) => {
            setShowAddModal(false);
            setSecretaries((prev) => [...prev, secretary]);
            setSelectedId(secretary.id);
          }}
        />
      )}
    </div>
  );
}

/** @deprecated Use SecretaryPage — kept for /cron redirect compatibility */
export { SecretaryPage as CronPage };
