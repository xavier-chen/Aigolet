export type GoalHorizon = 'year' | 'quarter' | 'week' | 'day';
export type GoalStatus = 'active' | 'completed' | 'paused' | 'cancelled';

export interface Goal {
  id: string;
  horizon: GoalHorizon;
  title: string;
  description?: string;
  status: GoalStatus;
  progress: number;
  parentId?: string;
  dueDate?: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateGoalInput {
  horizon: GoalHorizon;
  title: string;
  description?: string;
  status?: GoalStatus;
  progress?: number;
  parentId?: string;
  dueDate?: string;
  sortOrder?: number;
}

export interface UpdateGoalInput {
  title?: string;
  description?: string;
  status?: GoalStatus;
  progress?: number;
  parentId?: string | null;
  dueDate?: string | null;
  sortOrder?: number;
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
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Principle {
  id: string;
  category: 'brand' | 'product' | 'pricing' | 'other';
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

export type ArtifactType = 'pitch' | 'contract' | 'report' | 'invoice' | 'other';

export interface Artifact {
  id: string;
  title: string;
  type: ArtifactType;
  filePath?: string;
  contentPreview?: string;
  goalId?: string;
  customerId?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export type TransactionType = 'income' | 'expense';

export interface Transaction {
  id: string;
  type: TransactionType;
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

export type ProposalType = 'followup' | 'decision' | 'reminder';
export type ProposalStatus = 'pending' | 'approved' | 'dismissed';

export interface Proposal {
  id: string;
  type: ProposalType;
  title: string;
  body?: string;
  status: ProposalStatus;
  relatedCustomerId?: string;
  createdAt: string;
  updatedAt: string;
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

export interface TodayPriority {
  rank: number;
  title: string;
  reason: string;
  action?: string;
}

export interface RiskItem {
  id: string;
  severity: 'high' | 'medium' | 'low';
  category: string;
  title: string;
  detail?: string;
}

export interface TodayPlan {
  greeting: string;
  date: string;
  priorities: TodayPriority[];
  briefing?: string;
  generatedAt: string;
}

export interface TimelineEntry {
  id: string;
  type: string;
  title: string;
  summary?: string;
  occurredAt: string;
  link?: string;
}

export interface GoalBreakdownTask {
  title: string;
  description?: string;
  dueDate?: string;
}
