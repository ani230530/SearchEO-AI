export type CompetitorInsightPriority = 'high' | 'medium' | 'low';

export interface CompetitorStat {
  label: string;
  value: string;
}

export interface CompetitorPerformanceItem {
  label: string;
  value: string;
}

export interface CompetitorInsightRow {
  category: 'Strength' | 'Weakness' | 'Competitive Edge';
  insight: string;
  aiPromptSource: string;
  priority: CompetitorInsightPriority;
}

export interface CompetitorDetailData {
  name: string;
  domain: string;
  logo: string;
  logoBackground: string;
  badgeLabel: string;
  subtitle: string;
  stats: CompetitorStat[];
  performanceOverview: CompetitorPerformanceItem[];
  insights: CompetitorInsightRow[];
  cta: {
    title: string;
    description: string;
    buttonLabel: string;
  };
}

export const competitorPriorityStyles: Record<CompetitorInsightPriority, string> = {
  high: 'border-rose-200 bg-rose-50 text-rose-700',
  medium: 'border-amber-200 bg-amber-50 text-amber-700',
  low: 'border-emerald-200 bg-emerald-50 text-emerald-700',
};
