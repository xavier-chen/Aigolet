import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { quickCaptureBrain } from '@/lib/founder-api';

interface QuickCaptureModalProps {
  locale: string;
  onClose: () => void;
  onCaptured: () => void;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}

export function QuickCaptureModal({
  locale,
  onClose,
  onCaptured,
  onError,
  onSuccess,
}: QuickCaptureModalProps) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!text.trim()) {
      onError(t('brain.validation.quickCaptureRequired'));
      return;
    }
    setSubmitting(true);
    try {
      const result = await quickCaptureBrain(text.trim(), locale);
      if (!result) {
        onError(t('brain.errors.saveFailed'));
        return;
      }
      onSuccess(t('brain.quickCaptureSuccess', { type: t(`brain.types.${result.type}`) }));
      onCaptured();
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <Card className="w-full max-w-xl p-6 space-y-4 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-brand-500" />
              {t('brain.quickCapture')}
            </CardTitle>
            <CardDescription className="mt-1">{t('brain.quickCaptureHint')}</CardDescription>
          </div>
          <button type="button" onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            <X className="w-5 h-5" />
          </button>
        </div>
        <textarea
          className="w-full min-h-[160px] px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] text-sm resize-y"
          placeholder={t('brain.quickCapturePlaceholder')}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={submitting} onClick={() => void handleSubmit()}>
            {submitting ? t('common.loading') : t('brain.quickCaptureSubmit')}
          </Button>
        </div>
      </Card>
    </div>
  );
}
