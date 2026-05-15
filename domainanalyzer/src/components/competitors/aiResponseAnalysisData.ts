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
}

export interface AiResponseAnalysisData {
  title: string;
  subtitle: string;
  promptLabel: string;
  metrics: AiResponseAnalysisMetric[];
  rankings: AiResponseAnalysisRankItem[];
  performance: AiResponseAnalysisPerformanceItem[];
  insights: string[];
}

export interface PromptGapContext {
  title: string;
  importance: string;
  competitors: string[];
  promptIds: number[];
  opportunityKey: string;
  recommendedAngle?: string;
}
