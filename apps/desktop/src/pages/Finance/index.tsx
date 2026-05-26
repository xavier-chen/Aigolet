import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDownCircle, ArrowUpCircle, Wallet } from 'lucide-react';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { fadeInUp, staggerCards } from '@/lib/gsap';
import {
  createTransaction,
  fetchRunway,
  fetchTransactions,
  updateFinanceSettings,
  type RunwaySummary,
  type Transaction,
} from '@/lib/founder-api';
import { cn } from '@/lib/utils';

export function FinancePage() {
  const { t } = useTranslation();
  const headerRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<HTMLDivElement>(null);
  const [runway, setRunway] = useState<RunwaySummary | null>(null);
  const [balance, setBalance] = useState(0);
  const [currency, setCurrency] = useState('CNY');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [amount, setAmount] = useState('');
  const [desc, setDesc] = useState('');
  const [txType, setTxType] = useState<'income' | 'expense'>('expense');

  const reload = async () => {
    const [rw, txs] = await Promise.all([fetchRunway(), fetchTransactions()]);
    if (rw) {
      setRunway(rw.runway);
      setBalance(rw.balance);
      setCurrency(rw.currency);
    }
    setTransactions(txs);
  };

  useEffect(() => {
    void reload();
  }, []);

  useEffect(() => {
    if (headerRef.current) fadeInUp(headerRef.current);
    if (cardsRef.current) staggerCards(cardsRef.current.children, { delay: 0.1 });
  }, [runway]);

  const saveBalance = async () => {
    await updateFinanceSettings(balance, currency);
    await reload();
  };

  const addTx = async () => {
    const num = Number(amount);
    if (!num || num <= 0) return;
    await createTransaction({
      type: txType,
      amount: num,
      currency,
      description: desc || undefined,
      date: new Date().toISOString().slice(0, 10),
      recurring: false,
    });
    setAmount('');
    setDesc('');
    await reload();
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div ref={headerRef} className="space-y-2">
        <p className="text-sm text-brand-600 font-medium">{t('finance.label')}</p>
        <h1 className="font-display text-2xl font-bold">{t('finance.title')}</h1>
        <p className="text-sm text-[var(--text-muted)]">{t('finance.subtitle')}</p>
      </div>

      <div ref={cardsRef} className="grid sm:grid-cols-3 gap-4">
        <Card className="p-5">
          <CardDescription>{t('finance.balance')}</CardDescription>
          <div className="flex items-center gap-2 mt-2">
            <Wallet className="w-5 h-5 text-brand-500" />
            <input
              type="number"
              className="font-display text-2xl font-bold bg-transparent w-full outline-none"
              value={balance}
              onChange={(e) => setBalance(Number(e.target.value))}
              onBlur={() => void saveBalance()}
            />
            <span className="text-sm text-[var(--text-muted)]">{currency}</span>
          </div>
        </Card>
        <Card className="p-5">
          <CardDescription>{t('finance.monthlyBurn')}</CardDescription>
          <p className="font-display text-2xl font-bold mt-2 text-red-600">
            {runway?.monthlyBurn?.toLocaleString() ?? '—'}
          </p>
        </Card>
        <Card className={cn('p-5', runway?.lowRunway && 'border-red-300 dark:border-red-800')}>
          <CardDescription>{t('finance.runway')}</CardDescription>
          <p className="font-display text-2xl font-bold mt-2">
            {runway?.monthsRemaining != null ? `${runway.monthsRemaining} ${t('finance.months')}` : '∞'}
          </p>
        </Card>
      </div>

      <Card className="p-6 space-y-4">
        <CardTitle>{t('finance.addTransaction')}</CardTitle>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTxType('expense')}
            className={cn('px-3 py-1.5 rounded-lg text-sm', txType === 'expense' ? 'bg-red-100 text-red-700' : 'bg-[var(--bg-secondary)]')}
          >
            {t('finance.expense')}
          </button>
          <button
            type="button"
            onClick={() => setTxType('income')}
            className={cn('px-3 py-1.5 rounded-lg text-sm', txType === 'income' ? 'bg-green-100 text-green-700' : 'bg-[var(--bg-secondary)]')}
          >
            {t('finance.income')}
          </button>
        </div>
        <div className="flex gap-2">
          <input
            type="number"
            className="w-32 px-3 py-2 rounded-xl border border-[var(--border)] text-sm"
            placeholder={t('finance.amount')}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <input
            className="flex-1 px-3 py-2 rounded-xl border border-[var(--border)] text-sm"
            placeholder={t('finance.description')}
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
          />
          <Button onClick={() => void addTx()}>{t('common.save')}</Button>
        </div>
      </Card>

      <Card className="p-6">
        <CardTitle className="mb-4">{t('finance.recent')}</CardTitle>
        {transactions.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">{t('finance.empty')}</p>
        ) : (
          <ul className="space-y-2">
            {transactions.slice(0, 20).map((tx) => (
              <li key={tx.id} className="flex items-center gap-3 p-3 rounded-xl bg-[var(--bg-secondary)]">
                {tx.type === 'income' ? (
                  <ArrowUpCircle className="w-4 h-4 text-green-600" />
                ) : (
                  <ArrowDownCircle className="w-4 h-4 text-red-500" />
                )}
                <span className="text-sm flex-1">{tx.description ?? tx.category ?? tx.type}</span>
                <span className={cn('text-sm font-medium', tx.type === 'income' ? 'text-green-600' : 'text-red-600')}>
                  {tx.type === 'income' ? '+' : '-'}{tx.amount} {tx.currency}
                </span>
                <span className="text-xs text-[var(--text-muted)]">{tx.date}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
