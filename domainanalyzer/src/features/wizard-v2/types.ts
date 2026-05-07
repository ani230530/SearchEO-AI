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

export interface WizardItem {
  id: number;
  type: 'keyword' | 'prompt';
  text: string;
  intent: string | null;
  source: 'ai' | 'custom';
  parentKeywordId?: number;
}

export interface WizardStateResponse {
  domainId: number;
  url: string;
  profile: {
    country: string | null;
    state: string | null;
    industry: string | null;
    companySize: string | null;
  };
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

export const PHASE_TO_STEP: Record<string, WizardStep> = {
  crawl: 2,
  profile: 2,
  competitors: 3,
  topics: 4,
  select: 4,
  run_queries: 5,
};
