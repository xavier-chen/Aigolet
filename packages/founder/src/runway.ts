import type { RunwaySummary, Transaction } from './types.js';

const MS_PER_DAY = 86_400_000;

function daysInMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

/** Monthly burn from expense transactions in the last 90 days (non-recurring averaged + recurring normalized). */
export function computeMonthlyBurn(transactions: Transaction[], now = new Date()): number {
  const cutoff = new Date(now.getTime() - 90 * MS_PER_DAY);
  let recurringMonthly = 0;
  let nonRecurringTotal = 0;
  let nonRecurringDays = 0;

  for (const tx of transactions) {
    if (tx.type !== 'expense') continue;
    const txDate = new Date(tx.date);
    if (tx.recurring) {
      recurringMonthly += tx.amount;
      continue;
    }
    if (txDate >= cutoff) {
      nonRecurringTotal += tx.amount;
      const daysSince = Math.max(1, (now.getTime() - txDate.getTime()) / MS_PER_DAY);
      nonRecurringDays = Math.max(nonRecurringDays, daysSince);
    }
  }

  const windowDays = Math.min(90, Math.max(nonRecurringDays, 30));
  const variableMonthly = (nonRecurringTotal / windowDays) * daysInMonth(now);
  return recurringMonthly + variableMonthly;
}

export function computeMonthlyIncome(transactions: Transaction[], now = new Date()): number {
  const cutoff = new Date(now.getTime() - 90 * MS_PER_DAY);
  let recurringMonthly = 0;
  let nonRecurringTotal = 0;

  for (const tx of transactions) {
    if (tx.type !== 'income') continue;
    const txDate = new Date(tx.date);
    if (tx.recurring) {
      recurringMonthly += tx.amount;
      continue;
    }
    if (txDate >= cutoff) {
      nonRecurringTotal += tx.amount;
    }
  }

  const variableMonthly = (nonRecurringTotal / 90) * daysInMonth(now);
  return recurringMonthly + variableMonthly;
}

export function computeRunwaySummary(
  balance: number,
  currency: string,
  transactions: Transaction[],
  now = new Date(),
): RunwaySummary {
  const monthlyBurn = computeMonthlyBurn(transactions, now);
  const monthlyIncome = computeMonthlyIncome(transactions, now);
  const netBurn = Math.max(0, monthlyBurn - monthlyIncome);
  const monthsRemaining =
    netBurn > 0 && balance > 0 ? Math.round((balance / netBurn) * 10) / 10 : balance > 0 ? null : 0;

  return {
    balance,
    currency,
    monthlyBurn: Math.round(monthlyBurn * 100) / 100,
    monthlyIncome: Math.round(monthlyIncome * 100) / 100,
    netBurn: Math.round(netBurn * 100) / 100,
    monthsRemaining,
    lowRunway: monthsRemaining !== null && monthsRemaining < 6,
  };
}
