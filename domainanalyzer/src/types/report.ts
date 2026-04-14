export interface ReportData {
  domain: {
    id: number;
    url: string;
    context: string;
    location: string;
  };
  selectedKeywords: Array<{
    id: number;
    keyword: string;
    volume: number;
    difficulty: string;
    cpc: number;
    isSelected: boolean;
  }>;
  intentPhrases: Array<{
    id: string;
    phrase: string;
    relevance: number;
    trend: string;
    sources: string[];
    parentKeyword: string;
  }>;
  llmResults: Array<{
    model: string;
    avgConfidence: number;
    responses: number;
    topSource: string;
  }>;
  overallScore: number;
  scoreBreakdown: {
    phrasePerformance: { weight: number; score: number };
    keywordOpportunity: { weight: number; score: number };
    domainAuthority: { weight: number; score: number };
    onPageOptimization: { weight: number; score: number };
    competitorGaps: { weight: number; score: number };
  };
  recommendations: Array<{
    priority: string;
    type: string;
    description: string;
    impact: string;
  }>;
  analysis: {
    semanticAnalysis: Record<string, unknown>;
    keywordAnalysis: Record<string, unknown>;
    searchVolumeClassification: Record<string, unknown>;
    intentClassification: Record<string, unknown>;
  };
  additionalInsights?: {
    topCompetitors: Array<{ domain: string; frequency: number; url?: string; name?: string; sampleContext?: string }>;
    modelInsights: Array<{ model: string; insight: string; avgScore: number; presenceRate: number }>;
    totalQueries: number;
    avgResponseTime: number;
    totalCost: number;
    sourceDistribution: Record<string, number>;
  };
  aiResults?: AIQueryResult[];
}

export interface AIQueryResult {
  phrase: string;
  keyword: string;
  model: string;
  response: string;
  latency: number;
  cost: number;
  scores: {
    presence: number;
    relevance: number;
    accuracy: number;
    sentiment: number;
    overall: number;
    domainRank?: number;
    foundDomains?: string[];
    confidence?: number;
    sources?: string[];
    competitorUrls?: string[];
    competitorMatchScore?: number;
    highlightContext?: string;
    detectionMethod?: string;
    mentions?: number;
    // Added fields returned by backend scoring for enhanced analysis
    context?: string;
    domainSentiment?: 'positive' | 'neutral' | 'negative';
    aiConfidence?: number;
    rankingFactors?: {
      position: number;
      prominence: number;
      contextQuality: number;
      mentionType: number;
    };
    competitors?: {
      names: string[];
      mentions: Array<{
        name: string;
        domain: string;
        position: number;
        context: string;
        sentiment: 'positive' | 'neutral' | 'negative';
        mentionType: 'url' | 'text' | 'brand';
      }>;
      totalMentions: number;
    };
  };
  progress: number;
  citations?: Array<{
    url: string;
    title: string;
    citedText?: string;
    startIndex?: number;
    endIndex?: number;
    confidenceScore?: number;
  }>;
  searchQueries?: string[];
}