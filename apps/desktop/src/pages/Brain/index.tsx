import { useEffect, useRef, useState, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Brain,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  Pencil,
  Search,
  Trash2,
  Users,
  Zap,
} from 'lucide-react';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { fadeInUp, panelSlide, staggerCards } from '@/lib/gsap';
import { useEventStream } from '@/hooks/useEventStream';
import { useToast } from '@/hooks/useToast';
import { searchMemory as searchSemanticMemory } from '@/lib/api-client';
import {
  createCustomer,
  createDecision,
  createPrinciple,
  createRetrospective,
  deleteCustomer,
  deleteDecision,
  deletePrinciple,
  deleteRetrospective,
  fetchBrainSummary,
  fetchCustomers,
  fetchDecisions,
  fetchGoals,
  fetchPrinciples,
  fetchRetrospectives,
  searchBrain,
  updateCustomer,
  updateDecision,
  updatePrinciple,
  updateRetrospective,
  type BrainSearchResults,
  type BrainSummary,
  type Customer,
  type CustomerStage,
  type Decision,
  type Goal,
  type Principle,
  type PrincipleCategory,
  type Retrospective,
} from '@/lib/founder-api';
import { cn } from '@/lib/utils';
import { QuickCaptureModal } from './QuickCaptureModal';
import {
  CUSTOMER_STAGES,
  PRINCIPLE_CATEGORIES,
  defaultReviewDate,
  formatRelativeDate,
  isCustomerStale,
  todayDate,
} from './utils';

type Tab = 'decisions' | 'customers' | 'principles' | 'retros' | 'search';

const TAB_IDS: Tab[] = ['decisions', 'customers', 'principles', 'retros', 'search'];

function ToastBanner({ message, kind }: { message: string; kind: 'success' | 'error' }) {
  return (
    <div
      className={cn(
        'fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium animate-in slide-in-from-bottom-2',
        kind === 'success'
          ? 'bg-emerald-600 text-white'
          : 'bg-red-600 text-white',
      )}
    >
      {message}
    </div>
  );
}

function FieldLabel({ children }: { children: ReactNode }) {
  return <label className="text-xs font-medium text-[var(--text-muted)]">{children}</label>;
}

function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        'w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] text-sm',
        props.className,
      )}
    />
  );
}

function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        'w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] text-sm resize-y',
        props.className,
      )}
    />
  );
}

export function BrainPage() {
  const { t, i18n } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const headerRef = useRef<HTMLDivElement>(null);
  const tabPanelRef = useRef<HTMLDivElement>(null);
  const initialTab = (searchParams.get('tab') as Tab | null) ?? 'decisions';
  const [tab, setTab] = useState<Tab>(TAB_IDS.includes(initialTab) ? initialTab : 'decisions');

  const [summary, setSummary] = useState<BrainSummary | null>(null);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [principles, setPrinciples] = useState<Principle[]>([]);
  const [retros, setRetros] = useState<Retrospective[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);

  const [expandedDecision, setExpandedDecision] = useState<string | null>(null);
  const [editingDecision, setEditingDecision] = useState<Decision | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [editingPrinciple, setEditingPrinciple] = useState<Principle | null>(null);
  const [editingRetro, setEditingRetro] = useState<Retrospective | null>(null);
  const [followUpCustomer, setFollowUpCustomer] = useState<Customer | null>(null);
  const [followUpNote, setFollowUpNote] = useState('');

  const [showQuickCapture, setShowQuickCapture] = useState(false);
  const [showDecisionForm, setShowDecisionForm] = useState(false);
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [showPrincipleForm, setShowPrincipleForm] = useState(false);
  const [showRetroForm, setShowRetroForm] = useState(false);

  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState<BrainSearchResults | null>(null);
  const [memResults, setMemResults] = useState<Array<{ content: string }>>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const { toast, showToast } = useToast();

  const reload = async () => {
    const [d, c, p, r, s, g] = await Promise.all([
      fetchDecisions(),
      fetchCustomers(),
      fetchPrinciples(),
      fetchRetrospectives(),
      fetchBrainSummary(),
      fetchGoals('quarter'),
    ]);
    setDecisions(d);
    setCustomers(c);
    setPrinciples(p);
    setRetros(r);
    setSummary(s);
    setGoals(g);
    setLoading(false);
  };

  useEffect(() => {
    void reload();
  }, []);

  useEventStream({
    onMessage: (msg) => {
      if (msg.event === 'brain.updated') void reload();
    },
  });

  useEffect(() => {
    if (headerRef.current) fadeInUp(headerRef.current);
    if (tabPanelRef.current) {
      panelSlide(tabPanelRef.current, 'in');
      staggerCards(tabPanelRef.current.children, { delay: 0.06 });
    }
  }, [tab]);

  const switchTab = (next: Tab) => {
    setTab(next);
    setSearchParams({ tab: next }, { replace: true });
  };

  const tabs: { id: Tab; label: string; icon: typeof Brain }[] = [
    { id: 'decisions', label: t('brain.tabs.decisions'), icon: Brain },
    { id: 'customers', label: t('brain.tabs.customers'), icon: Users },
    { id: 'principles', label: t('brain.tabs.principles'), icon: Brain },
    { id: 'retros', label: t('brain.tabs.retros'), icon: Brain },
    { id: 'search', label: t('brain.tabs.search'), icon: Search },
  ];

  const handleSearch = async () => {
    const q = searchQ.trim();
    if (!q) return;
    setSearchLoading(true);
    setSearchError(null);
    try {
      const [brain, mem] = await Promise.all([searchBrain(q), searchSemanticMemory(q, 8)]);
      if (!brain) {
        setSearchError(t('brain.errors.searchFailed'));
        setSearchResults(null);
        setMemResults([]);
        return;
      }
      setSearchResults(brain);
      setMemResults(mem);
    } catch {
      setSearchError(t('brain.errors.searchFailed'));
    } finally {
      setSearchLoading(false);
    }
  };

  const saveDecision = async (form: Partial<Decision> & { title: string }) => {
    if (!form.title.trim()) {
      showToast(t('brain.validation.titleRequired'), 'error');
      return;
    }
    const payload = {
      ...form,
      options: form.options?.filter(Boolean),
      reviewDate: form.reviewDate || defaultReviewDate(),
    };
    const saved = editingDecision
      ? await updateDecision(editingDecision.id, payload)
      : await createDecision(payload);
    if (!saved) {
      showToast(t('brain.errors.saveFailed'), 'error');
      return;
    }
    showToast(t('brain.saved'));
    setEditingDecision(null);
    setShowDecisionForm(false);
    await reload();
  };

  const saveCustomer = async (form: Partial<Customer> & { name: string }) => {
    if (!form.name.trim()) {
      showToast(t('brain.validation.nameRequired'), 'error');
      return;
    }
    const payload = {
      ...form,
      stage: (form.stage ?? 'lead') as CustomerStage,
      lastContact: form.lastContact ?? new Date().toISOString(),
    };
    const saved = editingCustomer
      ? await updateCustomer(editingCustomer.id, payload)
      : await createCustomer(payload);
    if (!saved) {
      showToast(t('brain.errors.saveFailed'), 'error');
      return;
    }
    showToast(t('brain.saved'));
    setEditingCustomer(null);
    setShowCustomerForm(false);
    await reload();
  };

  const savePrinciple = async (category: PrincipleCategory, content: string) => {
    if (!content.trim()) {
      showToast(t('brain.validation.contentRequired'), 'error');
      return;
    }
    const saved = editingPrinciple
      ? await updatePrinciple(editingPrinciple.id, { category, content: content.trim() })
      : await createPrinciple(category, content.trim());
    if (!saved) {
      showToast(t('brain.errors.saveFailed'), 'error');
      return;
    }
    showToast(t('brain.saved'));
    setEditingPrinciple(null);
    setShowPrincipleForm(false);
    await reload();
  };

  const saveRetro = async (form: Partial<Retrospective> & { title: string }) => {
    if (!form.title.trim()) {
      showToast(t('brain.validation.titleRequired'), 'error');
      return;
    }
    const payload = {
      ...form,
      tags: form.tags?.filter(Boolean),
    };
    const saved = editingRetro
      ? await updateRetrospective(editingRetro.id, payload)
      : await createRetrospective(payload);
    if (!saved) {
      showToast(t('brain.errors.saveFailed'), 'error');
      return;
    }
    showToast(t('brain.saved'));
    setEditingRetro(null);
    setShowRetroForm(false);
    await reload();
  };

  const handleFollowUp = async () => {
    if (!followUpCustomer) return;
    const notes = followUpNote.trim()
      ? `${followUpCustomer.notes ? `${followUpCustomer.notes}\n` : ''}${todayDate()}: ${followUpNote.trim()}`
      : followUpCustomer.notes;
    const saved = await updateCustomer(followUpCustomer.id, {
      lastContact: new Date().toISOString(),
      notes,
    });
    if (!saved) {
      showToast(t('brain.errors.saveFailed'), 'error');
      return;
    }
    showToast(t('brain.followUpSaved'));
    setFollowUpCustomer(null);
    setFollowUpNote('');
    await reload();
  };

  const chatPrefill = (text: string) =>
    `/chat?${new URLSearchParams({ prefill: text }).toString()}`;

  const DecisionForm = ({
    initial,
    onCancel,
    onSave,
  }: {
    initial?: Decision;
    onCancel: () => void;
    onSave: (d: Partial<Decision> & { title: string }) => void;
  }) => {
    const [form, setForm] = useState<Partial<Decision> & { title: string }>({
      title: initial?.title ?? '',
      context: initial?.context ?? '',
      options: initial?.options ?? ['', ''],
      chosen: initial?.chosen ?? '',
      rationale: initial?.rationale ?? '',
      assumptions: initial?.assumptions ?? '',
      reviewDate: initial?.reviewDate ?? defaultReviewDate(),
    });

    return (
      <div className="space-y-3 p-4 rounded-xl border border-brand-200 dark:border-brand-800 bg-brand-50/30 dark:bg-brand-900/10">
        <FieldLabel>{t('brain.fields.title')} *</FieldLabel>
        <TextInput value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <FieldLabel>{t('brain.fields.context')}</FieldLabel>
        <TextArea rows={2} value={form.context ?? ''} onChange={(e) => setForm({ ...form, context: e.target.value })} />
        <FieldLabel>{t('brain.fields.options')}</FieldLabel>
        {(form.options ?? []).map((opt, i) => (
          <TextInput
            key={i}
            value={opt}
            placeholder={`${t('brain.fields.option')} ${i + 1}`}
            onChange={(e) => {
              const options = [...(form.options ?? [])];
              options[i] = e.target.value;
              setForm({ ...form, options });
            }}
          />
        ))}
        <Button size="sm" variant="ghost" onClick={() => setForm({ ...form, options: [...(form.options ?? []), ''] })}>
          + {t('brain.addOption')}
        </Button>
        <FieldLabel>{t('brain.fields.chosen')}</FieldLabel>
        <TextInput value={form.chosen ?? ''} onChange={(e) => setForm({ ...form, chosen: e.target.value })} />
        <FieldLabel>{t('brain.fields.rationale')}</FieldLabel>
        <TextArea rows={2} value={form.rationale ?? ''} onChange={(e) => setForm({ ...form, rationale: e.target.value })} />
        <FieldLabel>{t('brain.fields.assumptions')}</FieldLabel>
        <TextArea rows={2} value={form.assumptions ?? ''} onChange={(e) => setForm({ ...form, assumptions: e.target.value })} />
        <FieldLabel>{t('brain.fields.reviewDate')}</FieldLabel>
        <TextInput type="date" value={form.reviewDate ?? defaultReviewDate()} onChange={(e) => setForm({ ...form, reviewDate: e.target.value })} />
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={onCancel}>{t('common.cancel')}</Button>
          <Button variant="primary" size="sm" onClick={() => onSave(form)}>{t('common.save')}</Button>
        </div>
      </div>
    );
  };

  const CustomerForm = ({
    initial,
    onCancel,
    onSave,
  }: {
    initial?: Customer;
    onCancel: () => void;
    onSave: (c: Partial<Customer> & { name: string }) => void;
  }) => {
    const [form, setForm] = useState<Partial<Customer> & { name: string }>({
      name: initial?.name ?? '',
      company: initial?.company ?? '',
      stage: initial?.stage ?? 'lead',
      lastContact: initial?.lastContact?.slice(0, 10) ?? todayDate(),
      nextAction: initial?.nextAction ?? '',
      notes: initial?.notes ?? '',
    });

    return (
      <div className="space-y-3 p-4 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)]">
        <FieldLabel>{t('brain.fields.name')} *</FieldLabel>
        <TextInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <FieldLabel>{t('brain.fields.company')}</FieldLabel>
        <TextInput value={form.company ?? ''} onChange={(e) => setForm({ ...form, company: e.target.value })} />
        <FieldLabel>{t('brain.fields.stage')}</FieldLabel>
        <select
          className="w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] text-sm"
          value={form.stage}
          onChange={(e) => setForm({ ...form, stage: e.target.value })}
        >
          {CUSTOMER_STAGES.map((s) => (
            <option key={s} value={s}>{t(`brain.stages.${s}`)}</option>
          ))}
        </select>
        <FieldLabel>{t('brain.fields.lastContact')}</FieldLabel>
        <TextInput type="date" value={form.lastContact?.slice(0, 10) ?? todayDate()} onChange={(e) => setForm({ ...form, lastContact: e.target.value })} />
        <FieldLabel>{t('brain.fields.nextAction')}</FieldLabel>
        <TextInput value={form.nextAction ?? ''} onChange={(e) => setForm({ ...form, nextAction: e.target.value })} />
        <FieldLabel>{t('brain.fields.notes')}</FieldLabel>
        <TextArea rows={3} value={form.notes ?? ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={onCancel}>{t('common.cancel')}</Button>
          <Button variant="primary" size="sm" onClick={() => onSave(form)}>{t('common.save')}</Button>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {toast && <ToastBanner message={toast.message} kind={toast.kind} />}

      <div ref={headerRef} className="space-y-3">
        <p className="text-sm text-brand-600 font-medium">{t('brain.label')}</p>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="font-display text-2xl font-bold">{t('brain.title')}</h1>
            <p className="text-sm text-[var(--text-muted)] max-w-xl">{t('brain.subtitle')}</p>
            <p className="text-xs text-[var(--text-muted)]">{t('brain.memoryNote')}</p>
          </div>
          <Button variant="primary" onClick={() => setShowQuickCapture(true)}>
            <Zap className="w-4 h-4 mr-1.5" />
            {t('brain.quickCapture')}
          </Button>
        </div>

        {summary && (
          <div className="flex flex-wrap gap-2">
            <span className="text-xs px-3 py-1.5 rounded-full bg-[var(--bg-secondary)]">{t('brain.stats.decisions', { count: summary.decisions })}</span>
            <span className="text-xs px-3 py-1.5 rounded-full bg-[var(--bg-secondary)]">{t('brain.stats.customers', { count: summary.customers })}</span>
            {summary.staleCustomers > 0 && (
              <span className="text-xs px-3 py-1.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                {t('brain.stats.stale', { count: summary.staleCustomers })}
              </span>
            )}
            {summary.pendingDecisions > 0 && (
              <span className="text-xs px-3 py-1.5 rounded-full bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300">
                {t('brain.stats.pending', { count: summary.pendingDecisions })}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => switchTab(id)}
            className={cn(
              'px-4 py-2 rounded-xl text-sm font-medium transition-all',
              tab === id
                ? 'bg-brand-500 text-white shadow-soft'
                : 'bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div ref={tabPanelRef} className="space-y-4">
        {tab === 'decisions' && (
          <Card className="p-6 space-y-4">
            <div className="flex justify-between items-center gap-2">
              <CardTitle>{t('brain.tabs.decisions')}</CardTitle>
              <Button size="sm" onClick={() => { setEditingDecision(null); setShowDecisionForm(true); }}>
                {t('brain.addDecision')}
              </Button>
            </div>
            {(showDecisionForm || editingDecision) && (
              <DecisionForm
                initial={editingDecision ?? undefined}
                onCancel={() => { setShowDecisionForm(false); setEditingDecision(null); }}
                onSave={(f) => void saveDecision(f)}
              />
            )}
            {!loading && decisions.length === 0 && !showDecisionForm ? (
              <div className="text-center py-8 space-y-3">
                <p className="text-sm text-[var(--text-muted)]">{t('brain.emptyDecisions')}</p>
                <Button variant="primary" size="sm" onClick={() => setShowDecisionForm(true)}>
                  {t('brain.emptyDecisionsCta')}
                </Button>
              </div>
            ) : (
              <ul className="space-y-3">
                {decisions.map((d) => {
                  const open = expandedDecision === d.id;
                  return (
                    <li key={d.id} className="p-4 rounded-xl border border-[var(--border)]">
                      <div className="flex items-start justify-between gap-2">
                        <button type="button" className="text-left flex-1" onClick={() => setExpandedDecision(open ? null : d.id)}>
                          <p className="font-medium">{d.title}</p>
                          {d.chosen && <p className="text-xs text-brand-600 mt-1">{t('brain.chosen')}: {d.chosen}</p>}
                          {d.reviewDate && <p className="text-xs text-[var(--text-muted)] mt-1">{t('brain.fields.reviewDate')}: {d.reviewDate}</p>}
                        </button>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button size="sm" variant="ghost" onClick={() => setExpandedDecision(open ? null : d.id)}>
                            {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => { setEditingDecision(d); setShowDecisionForm(false); }}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => void deleteDecision(d.id).then(() => reload())}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                      {open && (
                        <div className="mt-3 pt-3 border-t border-[var(--border)] space-y-2 text-sm">
                          {d.context && <p><span className="text-[var(--text-muted)]">{t('brain.fields.context')}:</span> {d.context}</p>}
                          {d.options?.length ? <p><span className="text-[var(--text-muted)]">{t('brain.fields.options')}:</span> {d.options.join(' · ')}</p> : null}
                          {d.rationale && <p><span className="text-[var(--text-muted)]">{t('brain.fields.rationale')}:</span> {d.rationale}</p>}
                          {d.assumptions && <p><span className="text-[var(--text-muted)]">{t('brain.fields.assumptions')}:</span> {d.assumptions}</p>}
                          <Link to="/timeline" className="inline-flex text-xs text-brand-600 hover:underline">
                            {t('brain.viewTimeline')}
                          </Link>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        )}

        {tab === 'customers' && (
          <Card className="p-6 space-y-4">
            <div className="flex justify-between items-center">
              <CardTitle>{t('brain.tabs.customers')}</CardTitle>
              <Button size="sm" onClick={() => { setEditingCustomer(null); setShowCustomerForm(true); }}>{t('brain.addCustomer')}</Button>
            </div>
            {(showCustomerForm || editingCustomer) && (
              <CustomerForm
                initial={editingCustomer ?? undefined}
                onCancel={() => { setShowCustomerForm(false); setEditingCustomer(null); }}
                onSave={(f) => void saveCustomer(f)}
              />
            )}
            {customers.length === 0 && !showCustomerForm ? (
              <p className="text-sm text-[var(--text-muted)]">{t('brain.emptyCustomers')}</p>
            ) : (
              <div className="grid sm:grid-cols-2 gap-3">
                {customers.map((c) => {
                  const stale = isCustomerStale(c.lastContact);
                  return (
                    <div
                      key={c.id}
                      className={cn(
                        'p-4 rounded-xl border',
                        stale
                          ? 'border-amber-300 bg-amber-50/50 dark:border-amber-700 dark:bg-amber-900/10'
                          : 'border-[var(--border)] bg-[var(--bg-secondary)]',
                      )}
                    >
                      <div className="flex justify-between gap-2">
                        <div>
                          <p className="font-medium">{c.name}</p>
                          {c.company && <p className="text-xs text-[var(--text-muted)]">{c.company}</p>}
                        </div>
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => { setEditingCustomer(c); setShowCustomerForm(false); }}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => void deleteCustomer(c.id).then(() => reload())}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                      <span className="inline-block mt-2 text-[10px] uppercase px-2 py-0.5 rounded-full bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
                        {t(`brain.stages.${c.stage as CustomerStage}`, { defaultValue: c.stage })}
                      </span>
                      <p className="text-xs text-[var(--text-muted)] mt-2">
                        {t('brain.lastContact')}: {formatRelativeDate(c.lastContact, i18n.language)}
                        {stale && <span className="ml-2 text-amber-600">{t('brain.staleBadge')}</span>}
                      </p>
                      {c.nextAction && <p className="text-xs mt-1">{t('brain.fields.nextAction')}: {c.nextAction}</p>}
                      <div className="flex flex-wrap gap-2 mt-3">
                        <Button size="sm" variant="outline" onClick={() => setFollowUpCustomer(c)}>{t('brain.followUp')}</Button>
                        <Link to={chatPrefill(t('brain.chatCustomerPrefill', { name: c.name }))}>
                          <Button size="sm" variant="ghost"><MessageSquare className="w-3.5 h-3.5 mr-1" />{t('brain.discussCustomer')}</Button>
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        )}

        {tab === 'principles' && (
          <Card className="p-6 space-y-4">
            <div className="flex justify-between items-center">
              <CardTitle>{t('brain.tabs.principles')}</CardTitle>
              <Button size="sm" onClick={() => { setEditingPrinciple(null); setShowPrincipleForm(true); }}>{t('brain.addPrinciple')}</Button>
            </div>
            {(showPrincipleForm || editingPrinciple) && (
              <PrincipleFormInline
                initial={editingPrinciple ?? undefined}
                onCancel={() => { setShowPrincipleForm(false); setEditingPrinciple(null); }}
                onSave={(cat, content) => void savePrinciple(cat, content)}
                t={t}
              />
            )}
            {principles.length === 0 && !showPrincipleForm ? (
              <p className="text-sm text-[var(--text-muted)]">{t('brain.emptyPrinciples')}</p>
            ) : (
              <div className="grid sm:grid-cols-2 gap-3">
                {principles.map((p) => (
                  <div key={p.id} className="p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)]">
                    <div className="flex justify-between gap-2">
                      <span className="text-[10px] uppercase text-brand-600">{t(`brain.categories.${p.category as PrincipleCategory}`, { defaultValue: p.category })}</span>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => { setEditingPrinciple(p); setShowPrincipleForm(false); }}><Pencil className="w-3.5 h-3.5" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => void deletePrinciple(p.id).then(() => reload())}><Trash2 className="w-3.5 h-3.5" /></Button>
                      </div>
                    </div>
                    <p className="mt-2 text-sm">{p.content}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {tab === 'retros' && (
          <Card className="p-6 space-y-4">
            <div className="flex justify-between items-center">
              <CardTitle>{t('brain.tabs.retros')}</CardTitle>
              <Button size="sm" onClick={() => { setEditingRetro(null); setShowRetroForm(true); }}>{t('brain.addRetro')}</Button>
            </div>
            {(showRetroForm || editingRetro) && (
              <RetroFormInline
                initial={editingRetro ?? undefined}
                decisions={decisions}
                goals={goals}
                onCancel={() => { setShowRetroForm(false); setEditingRetro(null); }}
                onSave={(f) => void saveRetro(f)}
                t={t}
              />
            )}
            {retros.length === 0 && !showRetroForm ? (
              <p className="text-sm text-[var(--text-muted)]">{t('brain.emptyRetros')}</p>
            ) : (
              <ul className="space-y-3">
                {retros.map((r) => (
                  <li key={r.id} className="p-4 rounded-xl border border-[var(--border)]">
                    <div className="flex justify-between gap-2">
                      <div>
                        <p className="font-medium text-sm">{r.title}</p>
                        {r.lesson && <p className="text-xs text-[var(--text-muted)] mt-1">{r.lesson}</p>}
                      </div>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => { setEditingRetro(r); setShowRetroForm(false); }}><Pencil className="w-4 h-4" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => void deleteRetrospective(r.id).then(() => reload())}><Trash2 className="w-4 h-4" /></Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {tab === 'search' && (
          <Card className="p-6 space-y-4">
            <CardTitle>{t('brain.tabs.search')}</CardTitle>
            <CardDescription>{t('brain.searchHint')}</CardDescription>
            <div className="flex gap-2">
              <TextInput
                className="flex-1"
                placeholder={t('brain.searchPlaceholder')}
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void handleSearch()}
              />
              <Button onClick={() => void handleSearch()} disabled={searchLoading}>
                {searchLoading ? t('common.loading') : t('brain.search')}
              </Button>
            </div>
            {searchError && <p className="text-sm text-red-600">{searchError}</p>}
            {searchResults && (
              <div className="space-y-4">
                <SearchSection title={t('brain.tabs.decisions')} items={searchResults.decisions.map((d) => d.title)} empty={t('brain.noResults')} />
                <SearchSection title={t('brain.tabs.customers')} items={searchResults.customers.map((c) => `${c.name}${c.company ? ` · ${c.company}` : ''}`)} empty={t('brain.noResults')} />
                <SearchSection title={t('brain.tabs.principles')} items={searchResults.principles.map((p) => p.content)} empty={t('brain.noResults')} />
                <SearchSection title={t('brain.tabs.retros')} items={searchResults.retrospectives.map((r) => r.title)} empty={t('brain.noResults')} />
              </div>
            )}
            {(memResults.length > 0 || (searchResults && searchResults.memories?.length)) && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-[var(--text-muted)]">{t('brain.semanticMemory')}</p>
                {(searchResults?.memories ?? memResults).map((m, i) => (
                  <p key={i} className="text-sm p-3 rounded-xl bg-[var(--bg-secondary)]">{m.content}</p>
                ))}
              </div>
            )}
            {searchResults && !searchLoading &&
              searchResults.decisions.length === 0 &&
              searchResults.customers.length === 0 &&
              searchResults.principles.length === 0 &&
              searchResults.retrospectives.length === 0 &&
              memResults.length === 0 && (
              <p className="text-sm text-[var(--text-muted)]">{t('brain.noResults')}</p>
            )}
          </Card>
        )}
      </div>

      {showQuickCapture && (
        <QuickCaptureModal
          locale={i18n.language}
          onClose={() => setShowQuickCapture(false)}
          onCaptured={() => void reload()}
          onError={(msg) => showToast(msg, 'error')}
          onSuccess={(msg) => showToast(msg)}
        />
      )}

      {followUpCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <Card className="w-full max-w-md p-6 space-y-4">
            <CardTitle>{t('brain.followUp')}: {followUpCustomer.name}</CardTitle>
            <TextArea rows={4} placeholder={t('brain.followUpPlaceholder')} value={followUpNote} onChange={(e) => setFollowUpNote(e.target.value)} />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setFollowUpCustomer(null)}>{t('common.cancel')}</Button>
              <Button variant="primary" onClick={() => void handleFollowUp()}>{t('common.save')}</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function SearchSection({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-semibold text-brand-600 mb-2">{title}</p>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className="text-sm p-2 rounded-lg bg-[var(--bg-secondary)]">{item || empty}</li>
        ))}
      </ul>
    </div>
  );
}

function PrincipleFormInline({
  initial,
  onCancel,
  onSave,
  t,
}: {
  initial?: Principle;
  onCancel: () => void;
  onSave: (category: PrincipleCategory, content: string) => void;
  t: (key: string) => string;
}) {
  const [category, setCategory] = useState<PrincipleCategory>((initial?.category as PrincipleCategory) ?? 'product');
  const [content, setContent] = useState(initial?.content ?? '');
  return (
    <div className="space-y-3 p-4 rounded-xl border border-[var(--border)]">
      <FieldLabel>{t('brain.fields.category')}</FieldLabel>
      <select className="w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] text-sm" value={category} onChange={(e) => setCategory(e.target.value as PrincipleCategory)}>
        {PRINCIPLE_CATEGORIES.map((c) => (
          <option key={c} value={c}>{t(`brain.categories.${c}`)}</option>
        ))}
      </select>
      <FieldLabel>{t('brain.fields.content')} *</FieldLabel>
      <TextInput value={content} onChange={(e) => setContent(e.target.value)} placeholder={t('brain.principlePlaceholder')} />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>{t('common.cancel')}</Button>
        <Button variant="primary" size="sm" onClick={() => onSave(category, content)}>{t('common.save')}</Button>
      </div>
    </div>
  );
}

function RetroFormInline({
  initial,
  decisions,
  goals,
  onCancel,
  onSave,
  t,
}: {
  initial?: Retrospective;
  decisions: Decision[];
  goals: Goal[];
  onCancel: () => void;
  onSave: (r: Partial<Retrospective> & { title: string }) => void;
  t: (key: string) => string;
}) {
  const [form, setForm] = useState<Partial<Retrospective> & { title: string; tagsText?: string }>({
    title: initial?.title ?? '',
    whatHappened: initial?.whatHappened ?? '',
    lesson: initial?.lesson ?? '',
    tags: initial?.tags ?? [],
    tagsText: (initial?.tags ?? []).join(', '),
    decisionId: initial?.decisionId,
    goalId: initial?.goalId,
  });

  return (
    <div className="space-y-3 p-4 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)]">
      <FieldLabel>{t('brain.fields.title')} *</FieldLabel>
      <TextInput value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      <FieldLabel>{t('brain.fields.whatHappened')}</FieldLabel>
      <TextArea rows={3} value={form.whatHappened ?? ''} onChange={(e) => setForm({ ...form, whatHappened: e.target.value })} />
      <FieldLabel>{t('brain.fields.lesson')}</FieldLabel>
      <TextArea rows={2} value={form.lesson ?? ''} onChange={(e) => setForm({ ...form, lesson: e.target.value })} />
      <FieldLabel>{t('brain.fields.tags')}</FieldLabel>
      <TextInput value={form.tagsText ?? ''} onChange={(e) => setForm({ ...form, tagsText: e.target.value })} placeholder={t('brain.tagsPlaceholder')} />
      <FieldLabel>{t('brain.fields.linkDecision')}</FieldLabel>
      <select className="w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] text-sm" value={form.decisionId ?? ''} onChange={(e) => setForm({ ...form, decisionId: e.target.value || undefined })}>
        <option value="">{t('brain.none')}</option>
        {decisions.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
      </select>
      <FieldLabel>{t('brain.fields.linkGoal')}</FieldLabel>
      <select className="w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] text-sm" value={form.goalId ?? ''} onChange={(e) => setForm({ ...form, goalId: e.target.value || undefined })}>
        <option value="">{t('brain.none')}</option>
        {goals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
      </select>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>{t('common.cancel')}</Button>
        <Button
          variant="primary"
          size="sm"
          onClick={() => onSave({
            ...form,
            tags: (form.tagsText ?? '').split(',').map((x) => x.trim()).filter(Boolean),
          })}
        >
          {t('common.save')}
        </Button>
      </div>
    </div>
  );
}
