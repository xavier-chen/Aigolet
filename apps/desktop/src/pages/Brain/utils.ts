import type { CustomerStage, PrincipleCategory } from '@/lib/founder-api';

export const CUSTOMER_STAGES: CustomerStage[] = ['lead', 'negotiating', 'won', 'lost'];

export const PRINCIPLE_CATEGORIES: PrincipleCategory[] = ['brand', 'product', 'pricing', 'other'];

export function defaultReviewDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
}

export function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isCustomerStale(lastContact?: string, days = 7): boolean {
  if (!lastContact) return true;
  return Date.now() - new Date(lastContact).getTime() > days * 86_400_000;
}

export function formatRelativeDate(iso?: string, locale = 'zh'): string {
  if (!iso) return locale.startsWith('zh') ? '从未联系' : 'Never contacted';
  try {
    return new Date(iso).toLocaleDateString(locale.startsWith('zh') ? 'zh-CN' : 'en-US');
  } catch {
    return iso;
  }
}
