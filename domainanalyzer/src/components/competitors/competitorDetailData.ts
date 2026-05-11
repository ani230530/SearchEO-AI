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

export const AHREFS_COMPETITOR_DETAIL: CompetitorDetailData = {
  name: 'Ahrefs',
  domain: 'ahrefs.com',
  logo: 'https://img.logo.dev/ahrefs.com?token=pk_DTdFFG1JT9WOCjATvZEzIA&size=64',
  logoBackground: '#0B5CFF',
  badgeLabel: 'Market Leader',
  subtitle: 'Comprehensive analysis and strategic insights for this competitor',
  stats: [
    { label: 'Visibility Score', value: '79' },
    { label: 'Citation Strength', value: '85' },
    { label: 'Avg Rank', value: '1.5' },
    { label: 'Prompt Coverage', value: '360' },
  ],
  performanceOverview: [
    { label: 'Strongest Prompt Cluster', value: 'Backlink Analysis (92% dominance)' },
    { label: 'Top Cited Source Types', value: 'Tutorial content, Case studies' },
  ],
  insights: [
    {
      category: 'Strength',
      insight: 'Best backlink database',
      aiPromptSource: 'Which tool has the most comprehensive backlink data?',
      priority: 'high',
    },
    {
      category: 'Strength',
      insight: 'Fast crawling speed',
      aiPromptSource: 'What SEO tools have the fastest website crawlers?',
      priority: 'low',
    },
    {
      category: 'Strength',
      insight: 'Clean interface',
      aiPromptSource: 'Which SEO platforms have the most intuitive dashboard design?',
      priority: 'medium',
    },
    {
      category: 'Weakness',
      insight: 'Limited rank tracking',
      aiPromptSource: 'What are the best tools for tracking keyword rankings?',
      priority: 'high',
    },
    {
      category: 'Weakness',
      insight: 'No free tier',
      aiPromptSource: 'Which professional SEO tools offer free plans?',
      priority: 'low',
    },
    {
      category: 'Weakness',
      insight: 'Weaker content marketing tools',
      aiPromptSource: 'Best SEO tools with built-in content optimization features?',
      priority: 'high',
    },
    {
      category: 'Competitive Edge',
      insight: 'Offer robust free tier',
      aiPromptSource: 'What SEO tools provide the best free tier features?',
      priority: 'medium',
    },
    {
      category: 'Competitive Edge',
      insight: 'Enhance rank tracking',
      aiPromptSource: 'Which tools offer real-time keyword rank tracking?',
      priority: 'low',
    },
    {
      category: 'Competitive Edge',
      insight: 'Build content marketing suite',
      aiPromptSource: 'What platforms combine SEO and content marketing?',
      priority: 'high',
    },
  ],
  cta: {
    title: 'Book a Free Strategy Call',
    description:
      'Receive a customized, data-driven strategy designed to help you outperform competitors and improve your visibility based on these insights.',
    buttonLabel: 'Schedule a call',
  },
};

export const competitorPriorityStyles: Record<CompetitorInsightPriority, string> = {
  high: 'border-rose-200 bg-rose-50 text-rose-700',
  medium: 'border-amber-200 bg-amber-50 text-amber-700',
  low: 'border-emerald-200 bg-emerald-50 text-emerald-700',
};
