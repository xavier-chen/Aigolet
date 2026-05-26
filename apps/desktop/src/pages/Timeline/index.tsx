import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Clock } from 'lucide-react';
import { fadeInUp } from '@/lib/gsap';
import { fetchTimeline, type TimelineEntry } from '@/lib/founder-api';
import { cn } from '@/lib/utils';

const TYPE_COLORS: Record<string, string> = {
  decision: 'bg-violet-500',
  artifact: 'bg-blue-500',
  goal: 'bg-green-500',
  transaction: 'bg-amber-500',
};

export function TimelinePage() {
  const { t } = useTranslation();
  const headerRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);
  const [entries, setEntries] = useState<TimelineEntry[]>([]);

  useEffect(() => {
    void fetchTimeline(50).then(setEntries);
  }, []);

  useEffect(() => {
    if (headerRef.current) fadeInUp(headerRef.current);
    if (lineRef.current) {
      const items = lineRef.current.querySelectorAll('.timeline-item');
      items.forEach((el, i) => {
        fadeInUp(el as HTMLElement, { delay: i * 0.06 });
      });
    }
  }, [entries.length]);

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div ref={headerRef} className="space-y-2">
        <p className="text-sm text-brand-600 font-medium">{t('timeline.label')}</p>
        <h1 className="font-display text-2xl font-bold">{t('timeline.title')}</h1>
        <p className="text-sm text-[var(--text-muted)]">{t('timeline.subtitle')}</p>
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-center text-[var(--text-muted)] py-12">{t('timeline.empty')}</p>
      ) : (
        <div ref={lineRef} className="relative pl-8 border-l-2 border-[var(--border)] space-y-6">
          {entries.map((e) => (
            <div key={`${e.type}-${e.id}`} className="timeline-item relative">
              <span
                className={cn(
                  'absolute -left-[2.125rem] w-3 h-3 rounded-full ring-4 ring-[var(--bg-primary)]',
                  TYPE_COLORS[e.type] ?? 'bg-slate-400',
                )}
              />
              <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] hover:shadow-soft transition-shadow">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                  <Clock className="w-3 h-3" />
                  {new Date(e.occurredAt).toLocaleString()}
                  <span className="px-1.5 py-0.5 rounded bg-[var(--bg-secondary)]">{e.type}</span>
                </div>
                {e.link ? (
                  <Link to={e.link} className="font-medium text-sm mt-2 block hover:text-brand-600">
                    {e.title}
                  </Link>
                ) : (
                  <p className="font-medium text-sm mt-2">{e.title}</p>
                )}
                {e.summary && <p className="text-xs text-[var(--text-muted)] mt-1">{e.summary}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
