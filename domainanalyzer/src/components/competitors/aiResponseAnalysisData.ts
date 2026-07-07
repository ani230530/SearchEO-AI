export interface AiResponseAnalysisMetric {
  label: string;
  value: string;
  tone: 'blue' | 'green' | 'red' | 'slate';
}

export interface AiResponseAnalysisRankItem {
  name: string;
  domain: string;
  logo: string;
  score: string;
  status: 'Strong' | 'Medium' | 'Low';
  statusTone: 'green' | 'yellow' | 'red';
  barWidth: number;
}

export interface AiResponseAnalysisPerformanceItem {
  name: string;
  value: string;
  barWidth: number;
  status: 'success' | 'failed' | 'empty';
  mentioned: boolean;
  rankPosition: number | null;
  competitors: string[];
  response: string;
  errorMessage?: string | null;
  latencyMs?: number | null;
}

export interface AiResponseAnalysisData {
  title: string;
  subtitle: string;
  promptLabel: string;
  sourcePromptId: number | null;
  sourcePromptText: string | null;
  attemptedResponses: number;
  successfulResponses: number;
  brandName: string;
  metrics: AiResponseAnalysisMetric[];
  rankings: AiResponseAnalysisRankItem[];
  performance: AiResponseAnalysisPerformanceItem[];
  insights: string[];
  emptyState?: string;
}

export interface PromptGapContext {
  title: string;
  importance: string;
  competitors: string[];
  promptIds: number[];
  opportunityKey: string;
  recommendedAngle?: string;
}
