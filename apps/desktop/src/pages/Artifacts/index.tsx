import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, FileSpreadsheet, ScrollText, Receipt, Sparkles } from 'lucide-react';
import { Card, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { fadeInUp, staggerCards } from '@/lib/gsap';
import { fetchArtifact, fetchArtifacts, generateArtifact, type Artifact } from '@/lib/founder-api';
import { cn } from '@/lib/utils';

const TYPE_ICONS: Record<string, typeof FileText> = {
  pitch: ScrollText,
  contract: FileText,
  report: FileSpreadsheet,
  invoice: Receipt,
  other: FileText,
};

const TEMPLATES = [
  { id: 'bp', type: 'pitch', labelKey: 'artifacts.templates.bp' },
  { id: 'weekly', type: 'report', labelKey: 'artifacts.templates.weekly' },
  { id: 'quote', type: 'invoice', labelKey: 'artifacts.templates.quote' },
  { id: 'contract', type: 'contract', labelKey: 'artifacts.templates.contract' },
] as const;

export function ArtifactsPage() {
  const { t } = useTranslation();
  const headerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [selected, setSelected] = useState<{ artifact: Artifact; content?: string } | null>(null);
  const [title, setTitle] = useState('');
  const [generating, setGenerating] = useState(false);

  const reload = async () => setArtifacts(await fetchArtifacts());

  useEffect(() => {
    void reload();
  }, []);

  useEffect(() => {
    if (headerRef.current) fadeInUp(headerRef.current);
    if (gridRef.current) staggerCards(gridRef.current.children, { delay: 0.08 });
  }, [artifacts.length]);

  const handleGenerate = async (template: (typeof TEMPLATES)[number]) => {
    const docTitle = title.trim() || t(template.labelKey);
    setGenerating(true);
    const result = await generateArtifact({
      title: docTitle,
      type: template.type,
      template: template.id,
    });
    setGenerating(false);
    if (result?.artifact) {
      setTitle('');
      await reload();
      const full = await fetchArtifact(result.artifact.id);
      if (full) setSelected(full);
    }
  };

  const openArtifact = async (id: string) => {
    const full = await fetchArtifact(id);
    if (full) setSelected(full);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div ref={headerRef} className="space-y-2">
        <p className="text-sm text-brand-600 font-medium">{t('artifacts.label')}</p>
        <h1 className="font-display text-2xl font-bold">{t('artifacts.title')}</h1>
        <p className="text-sm text-[var(--text-muted)]">{t('artifacts.subtitle')}</p>
      </div>

      <Card className="p-6 space-y-4">
        <CardTitle>{t('artifacts.generate')}</CardTitle>
        <input
          className="w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] text-sm"
          placeholder={t('artifacts.titlePlaceholder')}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {TEMPLATES.map((tpl) => (
            <Button
              key={tpl.id}
              variant="outline"
              disabled={generating}
              className="h-auto py-3 flex-col gap-1"
              onClick={() => void handleGenerate(tpl)}
            >
              <Sparkles className="w-4 h-4" />
              <span className="text-xs">{t(tpl.labelKey)}</span>
            </Button>
          ))}
        </div>
      </Card>

      <div ref={gridRef} className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {artifacts.length === 0 ? (
          <Card className="p-8 col-span-full text-center text-sm text-[var(--text-muted)]">
            {t('artifacts.empty')}
          </Card>
        ) : (
          artifacts.map((a) => {
            const Icon = TYPE_ICONS[a.type] ?? FileText;
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => void openArtifact(a.id)}
                className="text-left"
              >
                <Card className={cn('p-5 hover:shadow-card transition-shadow h-full')}>
                  <Icon className="w-8 h-8 text-brand-500 mb-3" />
                  <p className="font-medium text-sm line-clamp-2">{a.title}</p>
                  <p className="text-[10px] uppercase text-[var(--text-muted)] mt-2">{a.type} · v{a.version}</p>
                </Card>
              </button>
            );
          })
        )}
      </div>

      {selected && (
        <Card className="p-6 space-y-4">
          <div className="flex justify-between items-start">
            <CardTitle>{selected.artifact.title}</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>{t('common.cancel')}</Button>
          </div>
          <pre className="text-sm whitespace-pre-wrap max-h-[50vh] overflow-auto p-4 rounded-xl bg-[var(--bg-secondary)]">
            {selected.content ?? selected.artifact.contentPreview ?? t('artifacts.noPreview')}
          </pre>
        </Card>
      )}
    </div>
  );
}
