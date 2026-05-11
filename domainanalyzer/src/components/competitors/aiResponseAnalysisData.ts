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
}

export const MOCK_AI_RESPONSE_ANALYSIS: AiResponseAnalysisData = {
  title: 'AI Response Analysis',
  subtitle: 'Understand how AI interprets and presents each competitor',
  promptLabel: 'How to track competitor backlinks effectively',
  metrics: [
    { label: 'Total Mentions', value: '47', tone: 'blue' },
    { label: 'Positive Sentiment', value: '68%', tone: 'green' },
    { label: 'Negative Sentiment', value: '11%', tone: 'red' },
    { label: 'Neutral Sentiment', value: '21%', tone: 'blue' },
  ],
  rankings: [
    {
      name: 'semrush.com',
      domain: 'semrush.com',
      logo: 'https://img.logo.dev/semrush.com?token=pk_DTdFFG1JT9WOCjATvZEzIA&size=64',
      score: '4.5 / 5',
      status: 'Strong',
      statusTone: 'green',
      barWidth: 88,
    },
    {
      name: 'ahrefs.com',
      domain: 'ahrefs.com',
      logo: 'https://img.logo.dev/ahrefs.com?token=pk_DTdFFG1JT9WOCjATvZEzIA&size=64',
      score: '4.2 / 5',
      status: 'Strong',
      statusTone: 'green',
      barWidth: 78,
    },
    {
      name: 'moz.com',
      domain: 'moz.com',
      logo: 'https://img.logo.dev/moz.com?token=pk_DTdFFG1JT9WOCjATvZEzIA&size=64',
      score: '3.5 / 5',
      status: 'Medium',
      statusTone: 'yellow',
      barWidth: 63,
    },
    {
      name: 'serpstat.com',
      domain: 'serpstat.com',
      logo: 'https://img.logo.dev/serpstat.com?token=pk_DTdFFG1JT9WOCjATvZEzIA&size=64',
      score: '3.1 / 5',
      status: 'Low',
      statusTone: 'red',
      barWidth: 56,
    },
    {
      name: 'spyfu.com',
      domain: 'spyfu.com',
      logo: 'https://img.logo.dev/spyfu.com?token=pk_DTdFFG1JT9WOCjATvZEzIA&size=64',
      score: '2.6 / 5',
      status: 'Low',
      statusTone: 'red',
      barWidth: 48,
    },
  ],
  performance: [
    { name: 'Chat GPT', value: '4.4 / 5', barWidth: 88 },
    { name: 'Claude', value: '4.1 / 5', barWidth: 82 },
    { name: 'Gemini', value: '3.9 / 5', barWidth: 77 },
    { name: 'Deepseek', value: '3.6 / 5', barWidth: 69 },
  ],
  insights: [
    'Ahrefs leads for real-time new/lost backlink detection with the deepest index.',
    'Semrush is preferred when combining backlink tracking with full SEO audits.',
    'Moz scores well on beginner-friendliness but lags on index freshness.',
  ],
};
