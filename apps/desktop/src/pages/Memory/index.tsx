import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Route, Layers, Search, Clock } from 'lucide-react';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { fadeInUp, staggerCards } from '@/lib/gsap';
import { fetchMemory, searchMemory, type MemoryRecord } from '@/lib/api-client';
import { cn } from '@/lib/utils';

const MEMORY_TYPES: Array<{ kind: MemoryRecord['kind']; gradient: string }> = [
  { kind: 'working', gradient: 'from-brand-400 to-orange-500' },
  { kind: 'episodic', gradient: 'from-sky-400 to-blue-500' },
  { kind: 'semantic', gradient: 'from-emerald-400 to-teal-500' },
];

export function MemoryPage() {
  const { t } = useTranslation();
  const headerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [records, setRecords] = useState<MemoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);

  const loadRecords = async () => {
    setLoading(true);
    setRecords(await fetchMemory({ limit: 100 }));
    setLoading(false);
  };

  useEffect(() => {
    void loadRecords();
  }, []);

  useEffect(() => {
    if (headerRef.current) fadeInUp(headerRef.current);
    if (gridRef.current && !loading) staggerCards(gridRef.current.children, { stagger: 0.08 });
    if (listRef.current && !loading && records.length > 0) staggerCards(listRef.current.children, { delay: 0.2 });
  }, [loading, records.length]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      await loadRecords();
      return;
    }
    setSearching(true);
    setRecords(await searchMemory(searchQuery.trim()));
    setSearching(false);
  };

  const countByKind = (kind: MemoryRecord['kind']) =>
    records.filter((r) => r.kind === kind).length;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div ref={headerRef} className="space-y-2">
        <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
          <Route className="w-5 h-5" />
          <span className="text-sm font-medium">{t('memory.title')}</span>
        </div>
        <h1 className="font-display text-2xl font-bold text-[var(--text-primary)]">{t('memory.title')}</h1>
        <p className="text-[var(--text-muted)]">{t('memory.subtitle')}</p>
      </div>

      <div className="flex gap-2">
        <input
          className="flex-1 rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm bg-[var(--bg-card)]"
          placeholder={t('memory.searchPlaceholder')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void handleSearch()}
        />
        <Button onClick={() => void handleSearch()} disabled={searching}>
          <Search className="w-4 h-4" />
          {t('memory.search')}
        </Button>
      </div>

      <div ref={gridRef} className="grid md:grid-cols-3 gap-4">
        {MEMORY_TYPES.map((m) => (
          <Card key={m.kind} className="text-center p-5 hover:shadow-lg transition-shadow">
            <div
              className={cn(
                'w-12 h-12 mx-auto rounded-2xl bg-gradient-to-br flex items-center justify-center mb-3',
                m.gradient,
              )}
            >
              <Layers className="w-6 h-6 text-white" />
            </div>
            <CardTitle className="text-base">{t(`memory.kinds.${m.kind}`)}</CardTitle>
            <CardDescription>{t(`memory.kindDesc.${m.kind}`)}</CardDescription>
            <div className="mt-4 flex items-center justify-center gap-1 text-xs text-[var(--text-muted)]">
              <Clock className="w-3 h-3" />
              {t('memory.recordCount', { count: countByKind(m.kind) })}
            </div>
          </Card>
        ))}
      </div>

      {loading ? (
        <Card className="text-center py-12 text-[var(--text-muted)] text-sm">{t('memory.loading')}</Card>
      ) : records.length === 0 ? (
        <Card className="text-center py-12 text-[var(--text-muted)] text-sm">{t('memory.empty')}</Card>
      ) : (
        <div className="space-y-3">
          <h2 className="font-display font-semibold text-[var(--text-primary)]">{t('memory.recent')}</h2>
          <div ref={listRef} className="space-y-3">
            {records
              .slice()
              .reverse()
              .map((record) => (
                <Card key={record.id} className="p-4 hover:border-emerald-200 dark:hover:border-emerald-800 transition-colors">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                      {t(`memory.kinds.${record.kind}`)}
                    </span>
                    <time className="text-xs text-[var(--text-muted)]">
                      {new Date(record.createdAt).toLocaleString()}
                    </time>
                  </div>
                  <p className="text-sm text-[var(--text-primary)] whitespace-pre-wrap leading-relaxed">
                    {record.content}
                  </p>
                </Card>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
