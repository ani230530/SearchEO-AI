export type TrendDirection = 'up' | 'down' | 'neutral';
export type TrendSentiment = 'positive' | 'negative' | 'neutral';

export interface MetricTrend {
  value: string; // e.g., "12.3%"
  direction: TrendDirection;
  sentiment: TrendSentiment;
}

export type BadgeVariant = 'prompt' | 'keyword' | 'status';

export interface Badge {
  text: string;
  variant: BadgeVariant;
}

interface BaseCard {
  title: string;
  footer?: string; // Optional because not all boxes have a footer
  tooltipText?: string;
}

export interface CompetitorAnalysisData {
  aiVisibility: BaseCard & {
    score: number;
    maxScore: number;
    trend: MetricTrend;
  };
  bestCompetitor: BaseCard & {
    score: number;
    maxScore: number;
    trend: MetricTrend;
  };
  largestGap: BaseCard & {
    value: string;
    badge: Badge;
  };
  competitorSOV: BaseCard & {
    value: string;
  };
  topInsight: BaseCard & {
    insights: string[];
  };
}