// Founder platform API types & helpers

const FOUNDER_BASE = `http://127.0.0.1:3847`;

export interface TodayPriority {
  rank: number;
  title: string;
  reason: string;
  action?: string;
}

export interface TodayPlan {
  greeting: string;
  date: string;
  priorities: TodayPriority[];
  briefing?: string;
  generatedAt: string;
}

export interface RiskItem {
  id: string;
  severity: 'high' | 'medium' | 'low';
  category: string;
  title: string;
  detail?: string;
}

export interface RunwaySummary {
  balance: number;
  currency: string;
  monthlyBurn: number;
  monthlyIncome: number;
  netBurn: number;
  monthsRemaining: number | null;
  lowRunway: boolean;
}

export interface Goal {
  id: string;
  horizon: 'year' | 'quarter' | 'week' | 'day';
  title: string;
  description?: string;
  status: string;
  progress: number;
  parentId?: string;
  dueDate?: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Decision {
  id: string;
  title: string;
  context?: string;
  options?: string[];
  chosen?: string;
  rationale?: string;
  assumptions?: string;
  reviewDate?: string;
  outcome?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Customer {
  id: string;
  name: string;
  company?: string;
  stage: string;
  lastContact?: string;
  nextAction?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Principle {
  id: string;
  category: string;
  content: string;
  createdAt: string;
}

export interface Retrospective {
  id: string;
  title: string;
  whatHappened?: string;
  lesson?: string;
  tags?: string[];
  decisionId?: string;
  goalId?: string;
  createdAt: string;
}

export interface BrainSummary {
  decisions: number;
  customers: number;
  principles: number;
  retrospectives: number;
  staleCustomers: number;
  pendingDecisions: number;
}

export interface BrainSearchResults {
  decisions: Decision[];
  customers: Customer[];
  principles: Principle[];
  retrospectives: Retrospective[];
  memories: Array<{ content: string; score?: number }>;
}

export interface QuickCaptureResult {
  type: 'decision' | 'customer' | 'principle' | 'retrospective';
  record: Decision | Customer | Principle | Retrospective;
}

export type CustomerStage = 'lead' | 'negotiating' | 'won' | 'lost';

export type PrincipleCategory = 'brand' | 'product' | 'pricing' | 'other';

export interface Artifact {
  id: string;
  title: string;
  type: string;
  filePath?: string;
  contentPreview?: string;
  goalId?: string;
  customerId?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface Transaction {
  id: string;
  type: 'income' | 'expense';
  amount: number;
  currency: string;
  category?: string;
  description?: string;
  date: string;
  recurring: boolean;
  createdAt: string;
}

export interface Reminder {
  id: string;
  title: string;
  dueDate: string;
  category?: string;
  notes?: string;
  completed: boolean;
  createdAt: string;
}

export interface Proposal {
  id: string;
  type: string;
  title: string;
  body?: string;
  status: string;
  relatedCustomerId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TimelineEntry {
  id: string;
  type: string;
  title: string;
  summary?: string;
  occurredAt: string;
  link?: string;
}

export interface FounderTodayResponse {
  plan: TodayPlan;
  risks: RiskItem[];
  runway: RunwaySummary;
  quarterGoals: Goal[];
  weekGoals: Goal[];
  pendingDecisions: Decision[];
  proposals: Proposal[];
}

export async function fetchFounderToday(locale?: string): Promise<FounderTodayResponse | null> {
  try {
    const params = locale ? `?locale=${encodeURIComponent(locale)}` : '';
    const res = await fetch(`${FOUNDER_BASE}/api/founder/today${params}`);
    if (!res.ok) return null;
    return (await res.json()) as FounderTodayResponse;
  } catch {
    return null;
  }
}

export async function refreshFounderToday(locale?: string): Promise<TodayPlan | null> {
  try {
    const res = await fetch(`${FOUNDER_BASE}/api/founder/today/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { plan: TodayPlan };
    return data.plan;
  } catch {
    return null;
  }
}

export async function fetchMorningBriefing(locale?: string): Promise<string | null> {
  try {
    const res = await fetch(`${FOUNDER_BASE}/api/founder/briefing/morning`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { briefing: string };
    return data.briefing;
  } catch {
    return null;
  }
}

export async function fetchGoals(horizon?: string): Promise<Goal[]> {
  try {
    const params = horizon ? `?horizon=${horizon}` : '';
    const res = await fetch(`${FOUNDER_BASE}/api/goals${params}`);
    if (!res.ok) return [];
    const data = (await res.json()) as { goals: Goal[] };
    return data.goals;
  } catch {
    return [];
  }
}

export async function createGoal(input: Partial<Goal> & { title: string; horizon: Goal['horizon'] }): Promise<Goal | null> {
  try {
    const res = await fetch(`${FOUNDER_BASE}/api/goals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { goal: Goal };
    return data.goal;
  } catch {
    return null;
  }
}

export async function updateGoal(id: string, input: Partial<Goal>): Promise<Goal | null> {
  try {
    const res = await fetch(`${FOUNDER_BASE}/api/goals/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { goal: Goal };
    return data.goal;
  } catch {
    return null;
  }
}

export async function breakdownGoal(goalId: string, locale?: string): Promise<{ created: number } | null> {
  try {
    const res = await fetch(`${FOUNDER_BASE}/api/goals/breakdown`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goalId, locale }),
    });
    if (!res.ok) return null;
    return (await res.json()) as { created: number };
  } catch {
    return null;
  }
}

export async function fetchDecisions(): Promise<Decision[]> {
  try {
    const res = await fetch(`${FOUNDER_BASE}/api/brain/decisions`);
    if (!res.ok) return [];
    const data = (await res.json()) as { decisions: Decision[] };
    return data.decisions;
  } catch {
    return [];
  }
}

export async function createDecision(input: Partial<Decision> & { title: string }): Promise<Decision | null> {
  try {
    const res = await fetch(`${FOUNDER_BASE}/api/brain/decisions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { decision: Decision };
    return data.decision;
  } catch {
    return null;
  }
}

export async function updateDecision(id: string, input: Partial<Decision>): Promise<Decision | null> {
  try {
    const res = await fetch(`${FOUNDER_BASE}/api/brain/decisions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { decision: Decision };
    return data.decision;
  } catch {
    return null;
  }
}

export async function deleteDecision(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${FOUNDER_BASE}/api/brain/decisions/${id}`, { method: 'DELETE' });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchCustomers(): Promise<Customer[]> {
  try {
    const res = await fetch(`${FOUNDER_BASE}/api/brain/customers`);
    if (!res.ok) return [];
    const data = (await res.json()) as { customers: Customer[] };
    return data.customers;
  } catch {
    return [];
  }
}

export async function createCustomer(input: Partial<Customer> & { name: string }): Promise<Customer | null> {
  try {
    const res = await fetch(`${FOUNDER_BASE}/api/brain/customers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { customer: Customer };
    return data.customer;
  } catch {
    return null;
  }
}

export async function updateCustomer(id: string, input: Partial<Customer>): Promise<Customer | null> {
  try {
    const res = await fetch(`${FOUNDER_BASE}/api/brain/customers/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { customer: Customer };
    return data.customer;
  } catch {
    return null;
  }
}

export async function deleteCustomer(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${FOUNDER_BASE}/api/brain/customers/${id}`, { method: 'DELETE' });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchPrinciples(): Promise<Principle[]> {
  try {
    const res = await fetch(`${FOUNDER_BASE}/api/brain/principles`);
    if (!res.ok) return [];
    const data = (await res.json()) as { principles: Principle[] };
    return data.principles;
  } catch {
    return [];
  }
}

export async function createPrinciple(category: string, content: string): Promise<Principle | null> {
  try {
    const res = await fetch(`${FOUNDER_BASE}/api/brain/principles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, content }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { principle: Principle };
    return data.principle;
  } catch {
    return null;
  }
}

export async function updatePrinciple(
  id: string,
  input: { category?: PrincipleCategory; content?: string },
): Promise<Principle | null> {
  try {
    const res = await fetch(`${FOUNDER_BASE}/api/brain/principles/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { principle: Principle };
    return data.principle;
  } catch {
    return null;
  }
}

export async function deletePrinciple(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${FOUNDER_BASE}/api/brain/principles/${id}`, { method: 'DELETE' });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchRetrospectives(): Promise<Retrospective[]> {
  try {
    const res = await fetch(`${FOUNDER_BASE}/api/brain/retrospectives`);
    if (!res.ok) return [];
    const data = (await res.json()) as { retrospectives: Retrospective[] };
    return data.retrospectives;
  } catch {
    return [];
  }
}

export async function createRetrospective(input: Partial<Retrospective> & { title: string }): Promise<Retrospective | null> {
  try {
    const res = await fetch(`${FOUNDER_BASE}/api/brain/retrospectives`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { retrospective: Retrospective };
    return data.retrospective;
  } catch {
    return null;
  }
}

export async function updateRetrospective(
  id: string,
  input: Partial<Retrospective>,
): Promise<Retrospective | null> {
  try {
    const res = await fetch(`${FOUNDER_BASE}/api/brain/retrospectives/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { retrospective: Retrospective };
    return data.retrospective;
  } catch {
    return null;
  }
}

export async function deleteRetrospective(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${FOUNDER_BASE}/api/brain/retrospectives/${id}`, { method: 'DELETE' });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchBrainSummary(): Promise<BrainSummary | null> {
  try {
    const res = await fetch(`${FOUNDER_BASE}/api/brain/summary`);
    if (!res.ok) return null;
    const data = (await res.json()) as { summary: BrainSummary };
    return data.summary;
  } catch {
    return null;
  }
}

export async function quickCaptureBrain(text: string, locale?: string): Promise<QuickCaptureResult | null> {
  try {
    const res = await fetch(`${FOUNDER_BASE}/api/brain/quick-capture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, locale }),
    });
    if (!res.ok) return null;
    return (await res.json()) as QuickCaptureResult;
  } catch {
    return null;
  }
}

export async function searchBrain(q: string): Promise<BrainSearchResults | null> {
  try {
    const res = await fetch(`${FOUNDER_BASE}/api/brain/search?q=${encodeURIComponent(q)}`);
    if (!res.ok) return null;
    return (await res.json()) as BrainSearchResults;
  } catch {
    return null;
  }
}

export async function fetchArtifacts(): Promise<Artifact[]> {
  try {
    const res = await fetch(`${FOUNDER_BASE}/api/artifacts`);
    if (!res.ok) return [];
    const data = (await res.json()) as { artifacts: Artifact[] };
    return data.artifacts;
  } catch {
    return [];
  }
}

export async function fetchArtifact(id: string): Promise<{ artifact: Artifact; content?: string } | null> {
  try {
    const res = await fetch(`${FOUNDER_BASE}/api/artifacts/${id}`);
    if (!res.ok) return null;
    return (await res.json()) as { artifact: Artifact; content?: string };
  } catch {
    return null;
  }
}

export async function generateArtifact(input: {
  title: string;
  type: string;
  template: string;
  goalId?: string;
  customerId?: string;
}): Promise<{ artifact: Artifact } | null> {
  try {
    const res = await fetch(`${FOUNDER_BASE}/api/artifacts/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) return null;
    return (await res.json()) as { artifact: Artifact };
  } catch {
    return null;
  }
}

export async function fetchTransactions(): Promise<Transaction[]> {
  try {
    const res = await fetch(`${FOUNDER_BASE}/api/finance/transactions`);
    if (!res.ok) return [];
    const data = (await res.json()) as { transactions: Transaction[] };
    return data.transactions;
  } catch {
    return [];
  }
}

export async function createTransaction(input: Partial<Transaction> & { type: 'income' | 'expense'; amount: number }): Promise<Transaction | null> {
  try {
    const res = await fetch(`${FOUNDER_BASE}/api/finance/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { transaction: Transaction };
    return data.transaction;
  } catch {
    return null;
  }
}

export async function fetchRunway(): Promise<{ runway: RunwaySummary; balance: number; currency: string } | null> {
  try {
    const res = await fetch(`${FOUNDER_BASE}/api/finance/runway`);
    if (!res.ok) return null;
    return (await res.json()) as { runway: RunwaySummary; balance: number; currency: string };
  } catch {
    return null;
  }
}

export async function updateFinanceSettings(balance: number, currency?: string): Promise<void> {
  await fetch(`${FOUNDER_BASE}/api/finance/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ balance, currency }),
  });
}

export async function fetchReminders(): Promise<Reminder[]> {
  try {
    const res = await fetch(`${FOUNDER_BASE}/api/finance/reminders`);
    if (!res.ok) return [];
    const data = (await res.json()) as { reminders: Reminder[] };
    return data.reminders;
  } catch {
    return [];
  }
}

export async function createReminder(input: Partial<Reminder> & { title: string; dueDate: string }): Promise<Reminder | null> {
  try {
    const res = await fetch(`${FOUNDER_BASE}/api/finance/reminders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { reminder: Reminder };
    return data.reminder;
  } catch {
    return null;
  }
}

export async function fetchProposals(status = 'pending'): Promise<Proposal[]> {
  try {
    const res = await fetch(`${FOUNDER_BASE}/api/proposals?status=${status}`);
    if (!res.ok) return [];
    const data = (await res.json()) as { proposals: Proposal[] };
    return data.proposals;
  } catch {
    return [];
  }
}

export async function approveProposal(id: string): Promise<void> {
  await fetch(`${FOUNDER_BASE}/api/proposals/${id}/approve`, { method: 'POST' });
}

export async function dismissProposal(id: string): Promise<void> {
  await fetch(`${FOUNDER_BASE}/api/proposals/${id}/dismiss`, { method: 'POST' });
}

export async function fetchTimeline(limit = 50): Promise<TimelineEntry[]> {
  try {
    const res = await fetch(`${FOUNDER_BASE}/api/timeline?limit=${limit}`);
    if (!res.ok) return [];
    const data = (await res.json()) as { entries: TimelineEntry[] };
    return data.entries;
  } catch {
    return [];
  }
}
