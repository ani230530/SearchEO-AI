export type WizardStep = 1 | 2 | 3 | 4 | 5;

export interface WizardProfile {
  country: string;
  state: string;
  industry: string;
  customKeywords: string;
  customPrompts: string;
}

export interface WizardCompetitor {
  name: string;
  domain: string;
  url: string;
  logoUrl: string;
  reasoning?: string;
  threatLevel?: 'High' | 'Medium' | 'Low';
  confidence?: 'High' | 'Medium' | 'Low';
}

export type PromptCategory =
  | 'unbranded_recommendation'
  | 'top_n_listicle'
  | 'alternatives_to_competitor'
  | 'problem_statement'
  | 'brand_vs_competitor'
  | 'branded_trust';

export type IntentStage = 'awareness' | 'consideration' | 'decision';

export interface WizardItem {
  id: number;
  type: 'keyword' | 'prompt';
  text: string;
  intent: string | null;
  source: 'ai' | 'custom';
  isSelected?: boolean;
  hasRun?: boolean;
  lastRunAt?: string | null;
  parentKeywordId?: number;
  // Audit-research metadata (prompts only).
  category?: PromptCategory | null;
  intentStage?: IntentStage | null;
  persona?: string | null;
  useCase?: string | null;
  constraint?: string | null;
  isBranded?: boolean;
  competitorMentioned?: string | null;
}

/** Human label for each prompt category — used in badges and group headers. */
export const CATEGORY_LABELS: Record<PromptCategory, string> = {
  unbranded_recommendation: 'Unbranded recommendation',
  top_n_listicle:           'Top-N listicle',
  alternatives_to_competitor: 'Alternatives to competitor',
  problem_statement:        'Problem statement',
  brand_vs_competitor:      'Brand vs competitor',
  branded_trust:            'Branded trust',
};

/** Tailwind colour pair (bg + text) per category — keeps the palette consistent. */
export const CATEGORY_BADGE_CLASS: Record<PromptCategory, string> = {
  unbranded_recommendation: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  top_n_listicle:           'bg-sky-50 text-sky-700 border-sky-200',
  alternatives_to_competitor: 'bg-violet-50 text-violet-700 border-violet-200',
  problem_statement:        'bg-amber-50 text-amber-700 border-amber-200',
  brand_vs_competitor:      'bg-rose-50 text-rose-700 border-rose-200',
  branded_trust:            'bg-slate-100 text-slate-700 border-slate-200',
};

export interface WizardStateResponse {
  domainId: number;
  url: string;
  /**
   * `profile` is null when a Domain row exists but its DomainProfile row
   * hasn't been written yet. Happens when the user arrives from the
   * anonymous audit funnel — signup materializes only the Domain shell,
   * and Step 1 of the wizard is where country / state / industry are
   * captured. Callers must handle the null case rather than blindly
   * indexing into `.country`.
   */
  profile: {
    country: string | null;
    state: string | null;
    industry: string | null;
    companySize: string | null;
  } | null;
  customSeeds: { keywords?: string[]; prompts?: string[] } | null;
  selectedCompetitors: string[] | null;
  selectionDraft: { keywordIds?: number[]; promptIds?: number[] } | null;
  currentStep: number;
  phases: Array<{
    phase: string;
    status: string;
    progress: number;
    error: string | null;
    updatedAt: string;
  }>;
  canResumeAt: string | null;
}

/**
 * Backend phase → frontend step mapping (5-step flow).
 *   1  add domain          (URL + profile form)
 *   2  crawl               (extracts site context)
 *   3  competitors         (user picks who to track)
 *   4  topics              (user picks prompts → click "Run AI Analysis")
 *   5  run                 (per-prompt × per-model live progress → /ai-results)
 */
export const PHASE_TO_STEP: Record<string, WizardStep> = {
  crawl: 2,
  profile: 2,
  competitors: 3,
  topics: 4,
  select: 4,
  run: 5,
};
