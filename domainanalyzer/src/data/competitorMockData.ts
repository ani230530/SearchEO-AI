import { CompetitorAnalysisData } from '../types/competitor.ts';

export const MOCK_ANALYSIS_DATA: CompetitorAnalysisData = {
  aiVisibility: {
    title: "Your AI Visibility Score",
    score: 75,
    maxScore: 100,
    footer: "Above industry avg. (68)",
    tooltipText: "Calculated based on your brand's presence across top AI search models.",
    trend: {
      value: "12.3%",
      direction: "up",
      sentiment: "positive"
    }
  },
  bestCompetitor: {
    title: "Best Competitor",
    score: 82,
    maxScore: 100,
    footer: "semrush.com",
    tooltipText: "The competitor with the highest overall visibility in your niche.",
    trend: {
      value: "10.5%",
      direction: "down",
      sentiment: "negative"
    }
  },
  largestGap: {
    title: "Largest Gap",
    value: "95%",
    footer: "Resonates SEO tools",
    badge: {
      text: "Range",
      variant: "status"
    }
  },
  competitorSOV: {
    title: "Competitor SOV",
    value: "45%",
    footer: "Top 5 organic share",
    tooltipText: "Share of Voice represents how much of the market conversation your competitors own."
  },
  topInsight: {
    title: "Top Competitor Insight",
    insights: [
      "Competitor.com leads in AI content.",
      "High authority domains prioritize visibility.",
      "Content clusters are driving 40% growth."
    ]
  }
};