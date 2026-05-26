import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Shield, CheckCircle, AlertCircle } from 'lucide-react';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { fadeInUp } from '@/lib/gsap';
import { fetchAudit } from '@/lib/api-client';

interface AuditRow {
  id: string;
  action: string;
  resourceType: string;
  occurredAt: string;
  sequence: number;
}

export function AuditPage() {
  const { t } = useTranslation();
  const listRef = useRef<HTMLDivElement>(null);
  const [events, setEvents] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetchAudit(50).then((data) => {
      setEvents(data as AuditRow[]);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (listRef.current && events.length) {
      fadeInUp(listRef.current.children, { stagger: 0.04 });
    }
  }, [events]);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-[var(--text-primary)]">{t('audit.title')}</h1>
          <p className="text-[var(--text-muted)] mt-1">{t('audit.subtitle')}</p>
        </div>
        <Button variant="outline" size="sm">
          <Shield className="w-4 h-4" />
          {t('audit.verify')}
        </Button>
      </div>

      {loading ? (
        <Card className="py-12 text-center text-[var(--text-muted)]">Loading…</Card>
      ) : events.length === 0 ? (
        <Card className="py-12 text-center text-[var(--text-muted)]">{t('audit.empty')}</Card>
      ) : (
        <div ref={listRef} className="space-y-2">
          {events.map((ev) => (
            <Card key={ev.id} className="py-3 px-4 flex items-center gap-4">
              <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <CardTitle className="text-sm font-mono truncate">{ev.action}</CardTitle>
                <CardDescription>
                  {ev.resourceType} · #{ev.sequence}
                </CardDescription>
              </div>
              <time className="text-xs text-[var(--text-muted)] shrink-0">
                {new Date(ev.occurredAt).toLocaleString()}
              </time>
            </Card>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
        <AlertCircle className="w-3 h-3" />
        Append-only ledger with SHA-256 hash chain
      </div>
    </div>
  );
}
