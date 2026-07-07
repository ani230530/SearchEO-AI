import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronRight,
  Filter,
  Info,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import {
  CartesianGrid,
  Legend as RLegend,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import { Drawer } from '@/components/Drawer';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CompetitorDetail } from '@/components/competitors/CompetitorDetail';
import { AiResponseAnalysis } from '@/components/competitors/AiResponseAnalysis';
import { cn } from '@/lib/utils';
import type {
  CompetitorDetailData,
  CompetitorInsightRow,
  CompetitorInsightPriority,
} from '@/components/competitors/competitorDetailData';
import type {
  AiResponseAnalysisData,
  PromptGapContext,
} from '@/components/competitors/aiResponseAnalysisData';
import { apiPost } from '../services/apiClient';
import { logoUrl as logoUrlHelper } from '@/lib/logoUrl';
import { buildDomainSlug } from '@/lib/domainUtils';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useShellContext } from '@/features/ai-results/AIResultsShell';
import { AIResultsBreadcrumbs } from '@/features/ai-results/components/AIResultsBreadcrumbs';
import { resolveAIResultsNavigation, resolveSidebarNavigation } from '@/features/sidebar-dashboard/navigation';
import { useScrollSpyBreadcrumbs } from '@/features/ai-results/useScrollSpyBreadcrumbs';
import {
  aiResultsKeys,
  useCampaigns,
  useCompetitorAnalysis,
  useCompetitors,
  useReport,
  useTrends,
} from '@/features/ai-results/queries';
import {
  buildProjectsWorksheetPath,
  openWorksheetPlaceholderTab,
  writeWorksheetHandoff,
  WorksheetPickerModal,
  CreateWorksheetModal,
  type WorksheetOption,
} from '@/features/ai-results/components/WorksheetPickerModals';

// ── API shapes ─────────────────────────────────────────────────────────────

type ServerCompetitorInsight = {
  category: 'Strength' | 'Weakness' | 'Competitive Edge';
  insight: string;
  aiPromptSource: string;
  priority: 'high' | 'medium' | 'low';
};

interface CompetitorAnalysisRow {
  host: string;
  rank: number | null;
  threatLevel: 'High' | 'Medium' | 'Low' | null;
  similarityScore: number | null;
  reasoning: string | null;
  industry: string | null;
  companySize: string | null;
  mentions: number;
  promptCoverage: number;
  coveragePct: number;
  avgSentiment: number | null;
  avgRankPosition: number | null;
  marketShare: number;
  strongestPromptCluster: { category: string; count: number } | null;
  topCitedSourceTypes: Array<{ type: string; count: number }>;
  examplePromptIds: number[];
  insights: ServerCompetitorInsight[];
}

interface CompetitorAnalysisResponse {
  runId: number | null;
  runStartedAt: string | null;
  competitors: CompetitorAnalysisRow[];
  ownBrand: { host: string; mentions: number; marketShare: number; avgSentiment: number | null };
  totals: { prompts: number; results: number; competitorMentions: number };
}

interface SelectedCompetitor {
  host: string;
  url: string;
  logoUrl: string;
  rank: number | null;
  threatLevel: string | null;
  /** True while an inline-add re-scoring pass is in flight for this competitor. */
  loading?: boolean;
}

const MAX_COMPETITORS = 10;

interface ReportOpportunity {
  key: string;
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  severityScore: number;
  trafficPotential: string;
  title: string;
  rationale: string;
  recommendedAngle: string;
  competitors: string[];
  promptIds: number[];
  keyword: string | null;
  brief?: {
    audience: string;
    tone: string;
    structure: string;
    keyPoints: string[];
    wordCount: number;
    cta: string;
  };
}

interface ReportPayload {
  id: number | null;
  domainInfo: { id: number; url: string; host: string; companyName: string | null; industry: string | null };
  runStatus: string;
  metrics: {
    visibilityScore: number;
    avgOverall: number;
    avgSentiment: number;
    avgAccuracy: number;
    mentionRate: number;
    brandPages: number;
    competitorPages: number;
    totalQueries: number;
    reportCards?: {
      aiShareOfVoice?: {
        percent: number;
        brandMentionEvents: number;
        competitorMentionEvents: number;
        totalMentionEvents: number;
      };
    };
  };
  topPrompts: Array<{
    rawId: number;
    type: 'keyword' | 'prompt';
    phrase: string;
    text: string;
    competitors: string[];
    results: Array<{
      id?: string;
      model: string;
      status?: string;
      errorMessage?: string | null;
      presence: number;
      overall?: number | null;
      relevance?: number | null;
      accuracy?: number | null;
      sentiment: number | null;
      rankPosition: number | null;
      response?: string;
      latencyMs?: number | null;
      competitorHosts?: string[];
      competitorMentions: Array<{ host: string; count: number; sentiment: number | null; rankPosition?: number | null }>;
    }>;
    metrics?: {
      avgOverall?: number | null;
      visibility?: number | null;
      aiSov?: number | null;
      runs?: number | null;
      attemptedRuns?: number | null;
    };
  }>;
  opportunities: ReportOpportunity[];
}

type OpportunitySeverityFilter = 'all' | 'critical' | 'high' | 'medium' | 'low';
type OpportunitySort = 'priority' | 'impact' | 'title';
type CompetitorThreatFilter = 'all' | 'High' | 'Medium' | 'Low';
type CompetitorSort = 'threat' | 'mentions' | 'coverage' | 'rank';

const OPPORTUNITY_SEVERITY_OPTIONS: Array<{ value: OpportunitySeverityFilter; label: string }> = [
  { value: 'all', label: 'All priorities' },
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

const OPPORTUNITY_SORT_OPTIONS: Array<{ value: OpportunitySort; label: string }> = [
  { value: 'priority', label: 'Priority' },
  { value: 'impact', label: 'Impact' },
  { value: 'title', label: 'Title A-Z' },
];

const COMPETITOR_THREAT_OPTIONS: Array<{ value: CompetitorThreatFilter; label: string }> = [
  { value: 'all', label: 'All threats' },
  { value: 'High', label: 'High threat' },
  { value: 'Medium', label: 'Medium threat' },
  { value: 'Low', label: 'Low threat' },
];

const COMPETITOR_SORT_OPTIONS: Array<{ value: CompetitorSort; label: string }> = [
  { value: 'threat', label: 'Threat' },
  { value: 'mentions', label: 'Mentions' },
  { value: 'coverage', label: 'Coverage' },
  { value: 'rank', label: 'Rank' },
];

const opportunitySeverityWeight = (severity?: string | null) => {
  switch (severity) {
    case 'critical':
      return 4;
    case 'high':
      return 3;
    case 'medium':
      return 2;
    case 'low':
      return 1;
    default:
      return 0;
  }
};

const opportunityTrafficWeight = (traffic?: string | null) => {
  switch (traffic) {
    case 'very_high':
      return 4;
    case 'high':
      return 3;
    case 'medium':
      return 2;
    case 'low':
      return 1;
    default:
      return 0;
  }
};

const competitorThreatWeight = (threatLevel: CompetitorAnalysisRow['threatLevel']) => {
  switch (threatLevel) {
    case 'High':
      return 3;
    case 'Medium':
      return 2;
    case 'Low':
      return 1;
    default:
      return 0;
  }
};

interface TrendsResponse {
  runs: Array<{
    runId: number;
    startedAt: string;
    endedAt: string | null;
    perModel: Record<string, { cites: number; presenceCount: number }>;
    brandMentions: number;
    competitorMentions: number;
    totalResponses?: number;
    totalCitations?: number;
    perCompetitor: Record<string, number>;
    perCompetitorCitations?: Record<string, number>;
  }>;
  topCompetitors: string[];
}

type GenerationPayload = {
  title: string;
  rationale: string;
  primaryKeyword: string | null;
  suggestedTemplate: 'blog';
  recommendedAngle?: string;
  brief?: ReportOpportunity['brief'];
};

const COMPETITOR_SCROLL_SECTIONS = [
  { id: 'competitors-tracked', label: 'Tracked Competitors' },
  { id: 'competitors-trends', label: 'Trend Comparison' },
  { id: 'competitors-gaps', label: 'Prompt Gaps' },
  { id: 'competitors-analysis', label: 'Analysis Results' },
  { id: 'competitors-positioning', label: 'Positioning' },
] as const;

// ── helpers ────────────────────────────────────────────────────────────────

const competitorLogo = (host: string, size = 32) => logoUrlHelper(host, size) ?? '';

const COMPETITOR_COLORS = ['#2F86D3', '#33485E', '#F26B57', '#2BB673', '#7BC7ED', '#9F7AEA', '#F59E0B', '#EC4899'];
const colorForHost = (host: string, idx: number) => COMPETITOR_COLORS[idx % COMPETITOR_COLORS.length];

const formatPct = (v: number) => `${Math.round(v * 100)}%`;

const sentimentToScore = (raw: number | null): number => {
  // -10..10 → 0..100; null becomes neutral mid-point so chart still places dot
  if (raw === null) return 50;
  return Math.max(0, Math.min(100, Math.round(((raw + 10) / 20) * 100)));
};

const friendlyCategory = (cat: string): string => {
  return cat.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
};

const friendlySourceType = (t: string): string => {
  switch (t) {
    case 'blog': return 'Blog posts';
    case 'docs': return 'Documentation';
    case 'case_study': return 'Case studies';
    case 'comparison': return 'Comparison pages';
    case 'product': return 'Product pages';
    default: return 'Other pages';
  }
};

const formatSourceTypes = (sources: Array<{ type: string; count: number }>): string => {
  if (sources.length === 0) return 'No citations yet';
  return sources.slice(0, 2).map((s) => friendlySourceType(s.type)).join(', ');
};

const formatStrongestCluster = (c: CompetitorAnalysisRow): string => {
  if (!c.strongestPromptCluster) return 'No prompt cluster yet';
  const total = c.mentions || 1;
  const pct = Math.round((c.strongestPromptCluster.count / total) * 100);
  return `${friendlyCategory(c.strongestPromptCluster.category)} (${pct}% of mentions)`;
};

const formatDeltaLabel = (delta: number): string => {
  const sign = delta >= 0 ? '+' : '-';
  return `${sign}${Math.abs(delta).toFixed(1)} pts`;
};

const priorityFromServer = (p: 'high' | 'medium' | 'low'): CompetitorInsightPriority => p;
const INDUSTRY_AVERAGE_VISIBILITY = 68;

type PromptResult = ReportPayload['topPrompts'][number]['results'][number];

const normalizeComparisonHost = (host: unknown): string =>
  String(host ?? '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '');

const isSuccessfulPromptResult = (result: PromptResult): boolean => result.status !== 'failed';

const resultMentionsCompetitor = (result: PromptResult, competitorHost: string): boolean => {
  const target = normalizeComparisonHost(competitorHost);
  if (!target) return false;
  const mentions = Array.isArray(result.competitorMentions) ? result.competitorMentions : [];
  if (mentions.some((mention) => normalizeComparisonHost(mention.host) === target)) return true;
  const hosts = Array.isArray(result.competitorHosts) ? result.competitorHosts : [];
  return hosts.some((host) => normalizeComparisonHost(host) === target);
};

const buildCompetitorDetail = (c: CompetitorAnalysisRow): CompetitorDetailData => {
  const visibilityScore = Math.round(c.coveragePct * 100);
  const citationStrength = c.avgSentiment === null ? Math.round(c.marketShare * 100) : sentimentToScore(c.avgSentiment);
  const avgRank = c.avgRankPosition !== null ? c.avgRankPosition.toFixed(1) : '—';
  const promptCoverage = String(c.promptCoverage);

  const badgeLabel = c.threatLevel
    ? `${c.threatLevel} Threat`
    : c.rank === 1
      ? 'Top Competitor'
      : 'Tracked Competitor';

  const subtitle = c.reasoning ?? `Mentioned in ${c.promptCoverage} prompt${c.promptCoverage === 1 ? '' : 's'} across the last audit.`;

  const insights: CompetitorInsightRow[] = c.insights.map((i) => ({
    category: i.category,
    insight: i.insight,
    aiPromptSource: i.aiPromptSource,
    priority: priorityFromServer(i.priority),
  }));

  return {
    name: c.host,
    domain: c.host,
    logo: competitorLogo(c.host, 64),
    logoBackground: '#EEF4FF',
    badgeLabel,
    subtitle,
    stats: [
      { label: 'Visibility Score', value: String(visibilityScore) },
      { label: 'Citation Strength', value: String(citationStrength) },
      { label: 'Avg Rank', value: avgRank },
      { label: 'Prompt Coverage', value: promptCoverage },
    ],
    performanceOverview: [
      { label: 'Strongest Prompt Cluster', value: formatStrongestCluster(c) },
      { label: 'Top Cited Source Types', value: formatSourceTypes(c.topCitedSourceTypes) },
    ],
    insights,
    cta: {
      title: 'Book A Demo',
      description:
        'Review your Al visibility gaps with our experts and receive a customized action plan based on this competitor analysis',
      buttonLabel: 'Schedule My Strategy Session',
    },
  };
};

const buildPromptGapContext = (o: ReportOpportunity): PromptGapContext => ({
  title: o.title,
  importance: `${Math.round(o.severityScore * 10)}/100`,
  competitors: o.competitors,
  promptIds: o.promptIds,
  opportunityKey: o.key,
  recommendedAngle: o.recommendedAngle,
});

// ── tiny UI helpers ────────────────────────────────────────────────────────

function GenerateContentButton({ className = '', onClick }: { className?: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-10 min-w-0 items-center justify-center gap-2.5 rounded-md border-2 border-[#F1F6FF] bg-white px-4 text-[14px] font-semibold leading-[150%] tracking-[0%] shadow-[0_1px_2px_0_#1018280D] transition hover:bg-[#F9FBFF] ${className}`}
    >
      <img src="/icons/target-04.svg" alt="" aria-hidden="true" className="h-5 w-5 shrink-0" />
      <span className="whitespace-nowrap bg-gradient-to-r from-[#2D4059] to-[#4C74C2] bg-clip-text text-transparent">
        Generate Content
      </span>
    </button>
  );
}




function InfoIcon({ label }: { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-[#7B8494] transition hover:text-[#2D4059]"
    >
      <Info className="h-3 w-3" strokeWidth={2} />
    </button>
  );
}

function TrendPill({ value, positive }: { value: string; positive: boolean }) {
  const styles = positive
    ? 'border-[#BCECC5] bg-[#DFFBE4] text-[#087B25]'
    : 'border-[#FFC9C9] bg-[#FFE5E5] text-[#D83A3A]';
  return (
    <span className={`inline-flex h-6 items-center gap-1 rounded-full border px-2 text-xs font-medium ${styles}`}>
      <ArrowUpRight className={`h-3.5 w-3.5 ${positive ? '' : 'rotate-90'}`} strokeWidth={2} />
      {value}
    </span>
  );
}

function ScoreCard({
  title,
  score,
  maxScore,
  footer,
  tooltipText,
  trend,
}: {
  title: string;
  score: number;
  maxScore: number;
  footer?: string;
  tooltipText?: string;
  trend?: { value: string; positive: boolean };
}) {
  return (
    <article className="flex h-full min-h-0 min-w-0 flex-col rounded-lg border border-slate-200 bg-white px-6 py-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="truncate text-sm font-medium leading-5 text-[#5F6877]">{title}</h3>
        <InfoIcon label={tooltipText ?? title} />
      </div>
      <div className="mt-2 flex min-w-0 items-center gap-3">
        <div className="flex items-baseline whitespace-nowrap text-[#2D4059]">
          <span className="text-[26px] font-semibold leading-none">{score}</span>
          <span className="ml-0.5 text-base font-medium leading-none">/</span>
          <span className="text-base font-medium leading-none">{maxScore}</span>
        </div>
        {trend ? <TrendPill value={trend.value} positive={trend.positive} /> : null}
      </div>
      {footer ? <p className="mt-auto truncate text-xs font-medium text-[#6E7480]">{footer}</p> : null}
    </article>
  );
}

function TopCompetitorCard({
  title,
  competitorHost,
  competitorScoreDelta,
  tooltipText,
}: {
  title: string;
  competitorHost: string | null;
  competitorScoreDelta: number;
  tooltipText?: string;
}) {
  const displayHost = competitorHost?.replace(/^www\./i, '') ?? null;
  const hasCompetitor = Boolean(displayHost);
  const isTied = Math.abs(competitorScoreDelta) < 0.05;
  const deltaLabel = isTied ? '0.0 pts' : formatDeltaLabel(competitorScoreDelta);
  const deltaIcon = competitorScoreDelta > 0 ? ArrowUpRight : ArrowDownRight;
  const deltaStyles = isTied
    ? 'border-slate-200 bg-slate-50 text-slate-500'
    : competitorScoreDelta > 0
      ? 'border-[#FFC9C9] bg-[#FFE5E5] text-[#D83A3A]'
      : 'border-[#BCECC5] bg-[#DFFBE4] text-[#087B25]';

  return (
    <article className="flex min-w-0 flex-col rounded-lg border border-slate-200 bg-white px-6 py-4 shadow-[0_1px_2px_0_#1018280D]">
      <div className="flex items-start justify-between gap-3">
        <h3 className="truncate text-sm font-medium leading-5 text-[#5F6877]">{title}</h3>
        <InfoIcon label={tooltipText ?? title} />
      </div>

      <div className="mt-3 flex min-w-0 items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            {hasCompetitor ? (
              <img
                src={competitorLogo(displayHost ?? '', 64)}
                alt=""
                className="h-6 w-6 object-contain"
                onError={(event) => ((event.currentTarget as HTMLImageElement).style.display = 'none')}
              />
            ) : null}
            <span className={`inline-flex h-7 shrink-0 items-center gap-1 rounded-full border px-2.5 text-[11px] font-semibold leading-none shadow-none ${deltaStyles}`}>
              {isTied ? null : React.createElement(deltaIcon, { className: 'h-3.5 w-3.5' })}
              {deltaLabel}
            </span>
          </div>
          <p className="mt-2 truncate text-sm font-medium text-[#7B8494]">
            {hasCompetitor ? displayHost : 'Awaiting data'}
          </p>
        </div>
      </div>
    </article>
  );
}

function ValueCard({
  title,
  value,
  footer,
  tooltipText,
  badge,
}: {
  title: string;
  value: string;
  footer?: string;
  tooltipText?: string;
  badge?: string;
}) {
  return (
    <article className="flex h-full min-h-0 min-w-0 flex-col rounded-lg border border-slate-200 bg-white px-6 py-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="truncate text-sm font-medium leading-5 text-[#5F6877]">{title}</h3>
        <InfoIcon label={tooltipText ?? title} />
      </div>
      <div className="mt-2 flex min-w-0 items-center gap-3">
        <span className="whitespace-nowrap text-[26px] font-semibold leading-none text-[#2D4059]">{value}</span>
        {badge ? (
          <span className="inline-flex h-5 items-center rounded-full border border-[#F6D985] bg-[#FFF8D9] px-2 text-[11px] font-medium text-[#D49A00]">
            {badge}
          </span>
        ) : null}
      </div>
      {footer ? <p className="mt-auto truncate text-xs font-medium text-[#6E7480]">{footer}</p> : null}
    </article>
  );
}

function InsightCard({ title, items }: { title: string; items: string[] }) {
  const shown = items.slice(0, 2);
  return (
    <article className="flex h-full min-h-0 min-w-0 flex-col rounded-lg border border-slate-200 bg-white px-6 py-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="truncate text-sm font-medium leading-5 text-[#5F6877]">{title}</h3>
        <InfoIcon label={title} />
      </div>
      <ul className="mt-3 list-disc space-y-1 pl-4 text-[11px] font-semibold leading-[1.25] text-[#2D4059]">
        {shown.length > 0
          ? shown.map((insight) => <li key={insight} className="line-clamp-1">{insight}</li>)
          : <li>No competitor insights yet — run an audit to populate.</li>}
      </ul>
    </article>
  );
}

// ── Competitor selector pills ──────────────────────────────────────────────

function normalizeHostInput(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;
  // Strip protocol + www + trailing path/slash.
  const cleaned = trimmed
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, '');
  // Basic shape check — at least one dot, no spaces, valid chars.
  if (!/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(cleaned)) return null;
  return cleaned;
}

function CompetitorSelector({
  competitors,
  onAdd,
  onRemove,
}: {
  competitors: SelectedCompetitor[];
  onAdd: (host: string) => Promise<void>;
  onRemove: (host: string) => Promise<void>;
}) {
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [removingHost, setRemovingHost] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const canAddMore = competitors.length < MAX_COMPETITORS;

  const filtered = useMemo(() => {
    if (!search.trim()) return competitors;
    const q = search.toLowerCase();
    return competitors.filter((c) => c.host.toLowerCase().includes(q));
  }, [competitors, search]);

  const cancelAdd = () => {
    setAdding(false);
    setDraft('');
    setLocalError(null);
  };

  const handleRemove = async (host: string) => {
    setLocalError(null);
    setRemovingHost(host);
    try {
      await onRemove(host);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to remove competitor.';
      setLocalError(msg);
    } finally {
      setRemovingHost((current) => (current === host ? null : current));
    }
  };

  const submitAdd = async () => {
    const host = normalizeHostInput(draft);
    if (!host) {
      setLocalError('Enter a valid domain (e.g. example.com).');
      return;
    }
    if (competitors.some((c) => c.host.toLowerCase() === host)) {
      setLocalError('Already tracked.');
      return;
    }
    if (!canAddMore) {
      setLocalError(`You can track up to ${MAX_COMPETITORS} competitors only.`);
      return;
    }
    setLocalError(null);
    setSubmitting(true);
    try {
      await onAdd(host);
      setAdding(false);
      setDraft('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to add competitor.';
      setLocalError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section id="competitors-tracked" data-title="Tracked Competitors" className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-[#2D4059]">Tracked Competitors</h2>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-[315px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#A0A7B2]" />
          <input
            aria-label="Search competitor"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 w-full rounded border border-slate-200 bg-white pl-9 pr-3 text-xs text-[#2D4059] outline-none placeholder:text-[#A0A7B2] focus:border-[#1E9BFF]"
            placeholder="Filter tracked competitors"
          />
        </div>

        {adding ? (
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <input
              autoFocus
              aria-label="New competitor domain"
              value={draft}
              onChange={(e) => { setDraft(e.target.value); if (localError) setLocalError(null); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); void submitAdd(); }
                else if (e.key === 'Escape') { e.preventDefault(); cancelAdd(); }
              }}
              disabled={submitting}
              placeholder="e.g. stripe.com"
              className="h-9 w-full rounded border border-slate-300 bg-white px-3 text-xs text-[#2D4059] outline-none placeholder:text-[#A0A7B2] focus:border-[#1E9BFF] sm:w-[240px]"
            />
            <button
              type="button"
              onClick={() => void submitAdd()}
              disabled={submitting}
              className="inline-flex h-9 items-center gap-2 rounded bg-[#243B5A] px-4 text-xs font-semibold text-white shadow-sm transition hover:bg-[#1F334D] disabled:opacity-60"
            >
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Add
            </button>
            <button
              type="button"
              onClick={cancelAdd}
              disabled={submitting}
              className="inline-flex h-9 items-center gap-1 rounded border border-slate-200 bg-white px-3 text-xs font-semibold text-[#5F6877] transition hover:bg-slate-50 disabled:opacity-60"
            >
              <X className="h-3.5 w-3.5" />
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              if (!canAddMore) {
                setLocalError(`You can track up to ${MAX_COMPETITORS} competitors only.`);
                return;
              }
              setAdding(true);
            }}
            disabled={!canAddMore}
            className="inline-flex h-9 items-center gap-2 rounded bg-[#243B5A] px-4 text-xs font-semibold text-white shadow-sm transition hover:bg-[#1F334D] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Plus className="h-3.5 w-3.5" />
            {canAddMore ? 'Add competitor' : 'Limit reached'}
          </button>
        )}
      </div>

      {localError ? (
        <p className="text-xs font-medium text-[#D83A3A]">{localError}</p>
      ) : null}

      {filtered.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
          {competitors.length === 0
            ? 'No competitors selected yet. Add one above or run the audit wizard to discover competitors for this domain.'
            : 'No competitors match the current search.'}
        </p>
      ) : (
        <div className="flex flex-wrap gap-3">
          {filtered.map((c, idx) => (
            <div
              key={c.host}
              title={c.loading ? 'Scoring against saved AI responses…' : c.host}
              className={`group inline-flex h-9 items-center gap-2 rounded-full border px-3 text-xs font-semibold shadow-sm transition ${
                c.loading
                  ? 'border-slate-200 bg-slate-50 text-[#7B8494]'
                  : 'border-slate-200 bg-white text-[#2D4059] hover:border-[#B7C8E8] hover:bg-[#F8FBFF]'
              }`}
            >
              <span className="relative grid h-6 w-6 place-items-center overflow-hidden rounded-full" style={{ backgroundColor: `${colorForHost(c.host, idx)}22` }}>
                {c.loading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[#5F6877]" />
                ) : (
                  <img src={c.logoUrl} alt="" className="h-5 w-5 object-contain" />
                )}
              </span>
              <span className="max-w-[180px] truncate">{c.host}</span>
              {c.loading ? <span className="ml-1 text-[10px] font-normal text-[#7B8494]">Scoring…</span> : null}
              <button
                type="button"
                aria-label={`Remove ${c.host}`}
                disabled={c.loading || removingHost === c.host}
                onClick={() => void handleRemove(c.host)}
                className="ml-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full text-[#98A2B3] transition hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {removingHost === c.host ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3.5 w-3.5" />}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ── Trend comparison panels ────────────────────────────────────────────────

type TrendChartPoint = { label: string } & Record<string, number | string>;

function TrendComparisonPanel({ trends }: { trends: TrendsResponse | null }) {
  const runCount = trends?.runs.length ?? 0;
  const hasData = runCount >= 1;
  // With a single completed run a <Line> has only one point — recharts cannot
  // draw a segment from one point, so without visible dots the chart renders
  // blank. Show dots whenever the series is sparse (1–2 runs, e.g. right after
  // a fresh re-audit that wiped history) so day-one data is always visible.
  const sparse = runCount < 3;
  const dotProp = sparse ? ({ r: 4 } as const) : (false as const);

  const formatTooltipValue = React.useCallback(
    (dataArray: TrendChartPoint[], unit: string = '') =>
      (value: number | string, name: string, props: { payload?: TrendChartPoint }) => {
        const point = props.payload;
        const numericValue = typeof value === 'number' ? value : Number(value);
        let slopeStr = '';

        if (point && dataArray) {
          const currentIndex = dataArray.findIndex((d) => d.label === point.label);
          if (currentIndex > 0) {
            const prevPoint = dataArray[currentIndex - 1];
            const prevValue = prevPoint[name];
            if (typeof prevValue === 'number' && typeof numericValue === 'number') {
              const slope = numericValue - prevValue;
              const sign = slope > 0 ? '+' : '';
              slopeStr = ` (Slope: ${sign}${slope.toFixed(1)}${unit})`;
            }
          }
        }

        return [`${numericValue}${unit}${slopeStr}`, name];
      },
    [],
  );

  const { visibilityData, citationData, sovData, visibilitySeries, citationSeries, topCompetitors, hasSignal } = useMemo(() => {
    if (!trends || trends.runs.length === 0) {
      return {
        visibilityData: [] as TrendChartPoint[],
        citationData: [] as TrendChartPoint[],
        sovData: [] as TrendChartPoint[],
        visibilitySeries: [] as Array<{ key: string; label: string; stroke: string }>,
        citationSeries: [] as Array<{ key: string; label: string; stroke: string }>,
        topCompetitors: [] as string[],
        hasSignal: false,
      };
    }
    const competitorHosts = trends.topCompetitors.slice(0, 4);
    const brandSeries = { key: 'You', label: 'You', stroke: '#2D4059' };
    const competitorSeries = competitorHosts.map((host, i) => ({
      key: host,
      label: host,
      stroke: COMPETITOR_COLORS[i % COMPETITOR_COLORS.length],
    }));
    const visibilitySeries = [brandSeries, ...competitorSeries];
    const citationSeries = competitorSeries;

    const visibility: TrendChartPoint[] = trends.runs.map((r) => {
      const point: TrendChartPoint = { label: new Date(r.startedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) };
      point['You'] = r.brandMentions;
      for (const host of competitorHosts) point[host] = r.perCompetitor?.[host] ?? 0;
      return point;
    });

    const citation: TrendChartPoint[] = trends.runs.map((r) => {
      const point: TrendChartPoint = { label: new Date(r.startedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) };
      for (const host of competitorHosts) point[host] = r.perCompetitorCitations?.[host] ?? 0;
      return point;
    });

    const sov: TrendChartPoint[] = trends.runs.map((r) => {
      const total = r.brandMentions + r.competitorMentions;
      const point: TrendChartPoint = { label: new Date(r.startedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) };
      point['You'] = total > 0 ? Math.round((r.brandMentions / total) * 100) : 0;
      for (const host of competitorHosts) {
        point[host] = total > 0 ? Math.round(((r.perCompetitor[host] ?? 0) / total) * 100) : 0;
      }
      return point;
    });

    const signal =
      trends.runs.some((r) => r.brandMentions > 0 || r.competitorMentions > 0) ||
      trends.runs.some((r) => Number(r.totalCitations ?? 0) > 0 || Object.values(r.perCompetitorCitations ?? {}).some((count) => count > 0));

    return { visibilityData: visibility, citationData: citation, sovData: sov, visibilitySeries, citationSeries, topCompetitors: competitorHosts, hasSignal: signal };
  }, [trends]);

  return (
    <section id="competitors-trends" data-title="Competitor Trend Comparison" className="min-w-0 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="text-base font-semibold text-[#2D4059]">Competitor Trend Comparison</h3>
        <span className="text-xs text-[#7B8494]">Last {trends?.runs.length ?? 0} runs</span>
      </div>

      {!hasData ? (
        <p className="mt-6 rounded-md border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
          Run an audit on this domain to start seeing competitor visibility data here.
        </p>
      ) : (
        <div className="mt-3 space-y-6">
          <ChartBlock title="AI Visibility Trend" subtitle="Compare brand and competitor mention events across scored AI responses.">
            <ResponsiveContainer width="100%" height={240}>
              <LineChart syncId="competitorTrends" data={visibilityData} margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
                <CartesianGrid stroke="#EEF1F5" strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#98A2B3' }} />
                <YAxis tick={{ fontSize: 10, fill: '#98A2B3' }} />
                <Tooltip
                  contentStyle={{
                    fontSize: '12px'
                  }}
                  labelStyle={{
                    fontSize: '14px',
                    fontWeight: '600',
                  }}
                  formatter={formatTooltipValue(visibilityData)}
                />
                <RLegend wrapperStyle={{ fontSize: 10 }} />
                {visibilitySeries.map((series) => (
                  <Line key={series.key} type="monotone" dataKey={series.key} name={series.label} stroke={series.stroke} strokeWidth={series.key === 'You' ? 2.5 : 2} dot={dotProp} activeDot={{ r: 5 }} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </ChartBlock>

          <ChartBlock title="Citation Share Comparison" subtitle="See which competitors are earning cited-source authority.">
            <ResponsiveContainer width="100%" height={240}>
              <LineChart syncId="competitorTrends" data={citationData} margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
                <CartesianGrid stroke="#EEF1F5" strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#98A2B3' }} />
                <YAxis tick={{ fontSize: 10, fill: '#98A2B3' }} />
                <Tooltip
                  contentStyle={{
                    fontSize: '12px'
                  }}
                  labelStyle={{
                    fontSize: '14px',
                    fontWeight: '600',
                  }}
                  formatter={formatTooltipValue(citationData)}
                />
                <RLegend wrapperStyle={{ fontSize: 10 }} />
                {citationSeries.length > 0 ? (
                  citationSeries.map((series) => (
                    <Line key={series.key} type="monotone" dataKey={series.key} name={series.label} stroke={series.stroke} strokeWidth={2} dot={dotProp} activeDot={{ r: 5 }} />
                  ))
                ) : (
                  <Line type="monotone" dataKey="No competitor citations" stroke="#CBD5E1" strokeWidth={2} dot={dotProp} activeDot={{ r: 5 }} />
                )}
              </LineChart>
            </ResponsiveContainer>
          </ChartBlock>

          <ChartBlock title="Share of Voice" subtitle="Evaluate competitor visibility and market presence.">
            <ResponsiveContainer width="100%" height={240}>
              <LineChart syncId="competitorTrends" data={sovData} margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
                <CartesianGrid stroke="#EEF1F5" strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#98A2B3' }} />
                <YAxis unit="%" tick={{ fontSize: 10, fill: '#98A2B3' }} />
                <Tooltip
                  contentStyle={{
                    fontSize: '12px'
                  }}
                  labelStyle={{
                    fontSize: '14px',
                    fontWeight: '600',
                  }}
                  formatter={formatTooltipValue(sovData, '%')}
                />
                <RLegend wrapperStyle={{ fontSize: 10 }} />
                <Line type="monotone" dataKey="You" stroke="#2D4059" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                {topCompetitors.map((host, i) => (
                  <Line key={host} type="monotone" dataKey={host} stroke={COMPETITOR_COLORS[i % COMPETITOR_COLORS.length]} strokeWidth={2} dot={dotProp} activeDot={{ r: 5 }} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </ChartBlock>

          {!hasSignal ? (
            <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-center text-xs text-slate-500">
              This run recorded no brand mentions, competitor mentions, or citations yet. Charts will fill in as the AI models start surfacing these domains.
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}

function ChartBlock({
  title,
  subtitle,
  children,
  dataTitle,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  dataTitle?: string;
}) {
  return (
    <div className="min-w-0" data-title={dataTitle ?? title}>
      <div className="mb-2">
        <h4 className="text-sm font-semibold text-[#2D4059]">{title}</h4>
        <p className="text-xs text-[#7B8494]">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}

// ── Opportunity / Prompt Gap card ──────────────────────────────────────────

function OpportunityCard({
  item,
  onAiResponse,
  onGenerate,
}: {
  item: ReportOpportunity;
  onAiResponse: (o: ReportOpportunity) => void;
  onGenerate: (o: ReportOpportunity) => void;
}) {
  const importanceScore = Math.round(item.severityScore * 10);
  const badgeLabel = item.severity === 'critical' ? 'Critical' : item.severity === 'high' ? 'High Impact' : item.severity === 'medium' ? 'Medium' : 'Low';
  const opportunityPct = Math.min(100, Math.round(item.severityScore * 10));

  return (
    <article className="relative overflow-hidden rounded-xl border border-[#E8ECF2] bg-white py-5 pl-6 pr-5 shadow-[0_10px_24px_rgba(15,23,42,0.08)]">
      <div className="absolute inset-y-0 left-0 w-1.5 bg-[#7EA6FF]" />
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex h-5 items-center rounded-full bg-[#FFE9E9] px-2.5 text-[10px] font-medium text-[#F05F5F]">
              {badgeLabel}
            </span>
            <span className="text-sm font-medium text-[#7B8494]">Importance: {importanceScore}/100</span>
          </div>
          <h4 className="mt-4 max-w-[480px] text-base font-normal italic leading-6 text-[#2D4059] break-words">
            {item.title}
          </h4>
          {item.competitors.length > 0 ? (
            <p className="mt-5 text-sm font-medium leading-5 text-[#426185] break-words">
              Appearing:{' '}
              <span className="font-bold text-[#2D4059]">
                {item.competitors.map((competitor, index) => (
                  <React.Fragment key={competitor}>
                    {competitor}
                    {index < item.competitors.length - 1 ? ', ' : ''}
                  </React.Fragment>
                ))}
              </span>
            </p>
          ) : (
            <p className="mt-5 text-sm font-medium leading-5 text-[#426185] break-words">{item.rationale}</p>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-start gap-4 sm:items-end">
          <div className="whitespace-nowrap text-left sm:text-right">
            <span className="text-2xl font-semibold leading-none text-[#D49A00]">{opportunityPct}%</span>
            <span className="ml-1 text-sm font-medium text-[#58657A]">Opportunity</span>
          </div>
          <div className="flex w-full flex-col gap-3 sm:min-w-[176px] sm:max-w-[208px]">
            <button
              type="button"
              onClick={() => onAiResponse(item)}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-[#D5D7DA] bg-[#F9F9F9] px-3 text-[14px] font-semibold leading-[150%] text-[#40516A] shadow-none transition hover:bg-[#F4F4F5]"
            >
              <Sparkles className="h-3.5 w-3.5" />
              AI Response
            </button>
            <GenerateContentButton className="w-full" onClick={() => onGenerate(item)} />
          </div>
        </div>
      </div>
    </article>
  );
}

function PromptGapPanel({
  opportunities,
  loading = false,
  onAiResponse,
  onGenerate,
}: {
  opportunities: ReportOpportunity[];
  loading?: boolean;
  onAiResponse: (o: ReportOpportunity) => void;
  onGenerate: (o: ReportOpportunity) => void;
}) {
  const PAGE_SIZE = 4;
  const [severityFilter, setSeverityFilter] = useState<OpportunitySeverityFilter>('all');
  const [sortBy, setSortBy] = useState<OpportunitySort>('priority');
  const [currentPage, setCurrentPage] = useState(1);

  const filtered = useMemo(() => {
    return opportunities
      .filter((item) => severityFilter === 'all' || item.severity === severityFilter)
      .sort((a, b) => {
        if (sortBy === 'impact') {
          return (
            opportunityTrafficWeight(b.trafficPotential) - opportunityTrafficWeight(a.trafficPotential) ||
            opportunitySeverityWeight(b.severity) - opportunitySeverityWeight(a.severity) ||
            a.title.localeCompare(b.title)
          );
        }
        if (sortBy === 'title') {
          return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
        }
        return (
          opportunitySeverityWeight(b.severity) - opportunitySeverityWeight(a.severity) ||
          Number(b.severityScore ?? 0) - Number(a.severityScore ?? 0) ||
          opportunityTrafficWeight(b.trafficPotential) - opportunityTrafficWeight(a.trafficPotential) ||
          a.title.localeCompare(b.title)
        );
      });
  }, [opportunities, severityFilter, sortBy]);

  const totalCount = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const pageResetKey = useMemo(() => filtered.map((item) => item.key).join('|'), [filtered]);

  useEffect(() => {
    setCurrentPage(1);
  }, [pageResetKey, severityFilter, sortBy]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const shown = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [currentPage, filtered]);

  return (
    <section id="competitors-gaps" data-title="Prompt Gaps Opportunities" className="min-w-0 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-xl font-semibold leading-none text-[#2D4059]">Prompt Gaps Opportunities</h3>
          <p className="mt-3 text-base text-[#7B8494]">Identify missed prompts and turn them into content opportunities.</p>
        </div>
        {opportunities.length > 0 ? (
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex h-10 items-center gap-2 rounded-md border border-[#D7DDE6] bg-white px-3 text-xs font-semibold text-[#7B8494] shadow-sm transition hover:bg-slate-50"
                >
                  <ArrowDownRight className="h-3.5 w-3.5" />
                  {OPPORTUNITY_SORT_OPTIONS.find((option) => option.value === sortBy)?.label ?? 'Priority'}
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[160px] p-1">
                {OPPORTUNITY_SORT_OPTIONS.map((option) => (
                  <DropdownMenuItem
                    key={option.value}
                    onClick={() => setSortBy(option.value)}
                    className="flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-[12px]"
                  >
                    {option.label}
                    {sortBy === option.value ? <Check className="h-3.5 w-3.5 text-blue-600" /> : null}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex h-10 items-center gap-2 rounded-md border border-[#D7DDE6] bg-white px-3 text-xs font-semibold text-[#7B8494] shadow-sm transition hover:bg-slate-50"
                >
                  <Filter className="h-3.5 w-3.5" />
                  {OPPORTUNITY_SEVERITY_OPTIONS.find((option) => option.value === severityFilter)?.label ?? 'All priorities'}
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[180px] p-1">
                {OPPORTUNITY_SEVERITY_OPTIONS.map((option) => (
                  <DropdownMenuItem
                    key={option.value}
                    onClick={() => setSeverityFilter(option.value)}
                    className="flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-[12px]"
                  >
                    {option.label}
                    {severityFilter === option.value ? <Check className="h-3.5 w-3.5 text-blue-600" /> : null}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : null}
      </div>

      <div className="mt-8 space-y-6">
        {loading ? (
          <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
            Checking prompt gaps from the latest completed audit…
          </p>
        ) : shown.length === 0 ? (
          <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
            {opportunities.length === 0
              ? "No prompt gaps yet — you're holding your own across the tracked prompts."
              : 'No prompt gaps match the current filters.'}
          </p>
        ) : (
          shown.map((item) => (
            <OpportunityCard
              key={item.key}
              item={item}
              onAiResponse={onAiResponse}
              onGenerate={onGenerate}
            />
          ))
        )}
      </div>
      {opportunities.length > 0 ? (
        <div className="mt-6 flex items-center justify-between gap-3 border-t border-slate-200 pt-3">
          <span className="text-[11px] font-semibold tracking-tight text-gray-500">
            {totalCount === 0
              ? 'No rows'
              : `Showing ${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, totalCount)} of ${totalCount}`}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              disabled={currentPage <= 1}
              className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Prev
            </button>
            <span className="px-2 text-[11px] font-medium text-slate-500 tabular-nums">
              {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
              disabled={currentPage >= totalPages}
              className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

// ── AI-based competitor analysis cards ─────────────────────────────────────

function AnalysisInfoBox({ title, value }: { title: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-200 bg-white px-4 py-4">
      <p className="truncate text-sm font-medium text-[#7B8494]">{title}</p>
      <p className="mt-3 truncate text-xs font-semibold text-[#1F2937]">{value}</p>
    </div>
  );
}

function AnalysisResultCard({
  competitor,
  onOpenDetail,
}: {
  competitor: CompetitorAnalysisRow;
  onOpenDetail: (c: CompetitorAnalysisRow) => void;
}) {
  const tone = competitor.threatLevel === 'High' ? 'high' : competitor.threatLevel === 'Medium' ? 'medium' : 'low';
  const threatStyles = tone === 'high'
    ? 'border-[#FFC9C9] bg-[#FFF2F2] text-[#F05F5F]'
    : tone === 'medium'
      ? 'border-[#F6D985] bg-[#FFF8D9] text-[#C99714]'
      : 'border-[#BCECC5] bg-[#DFFBE4] text-[#087B25]';
  const threatLabel = competitor.threatLevel ? `${competitor.threatLevel} Threat` : 'Unranked';

  return (
    <article className="shrink-0 grid min-w-0 grid-cols-[minmax(0,1fr)_44px] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="min-w-0 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-lg bg-[#EEF4FF]">
              <img src={competitorLogo(competitor.host, 64)} alt="" className="h-8 w-8 object-contain" />
            </span>
            <div className="min-w-0">
              <h4 className="truncate text-base font-semibold leading-5 text-[#1F2937]">{competitor.host}</h4>
              <p className="mt-1 truncate text-xs font-medium text-[#7B8494]">Market Share: {Math.round(competitor.marketShare * 100)}%</p>
            </div>
          </div>
          <span className={`inline-flex h-5 shrink-0 items-center rounded-full border px-2 text-[10px] font-medium ${threatStyles}`}>
            {threatLabel}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <AnalysisInfoBox title="Strongest Prompt Cluster" value={formatStrongestCluster(competitor)} />
          <AnalysisInfoBox title="Top Cited Source Types" value={formatSourceTypes(competitor.topCitedSourceTypes)} />
        </div>
      </div>

      <button
        type="button"
        aria-label={`View ${competitor.host} competitor analysis`}
        onClick={() => onOpenDetail(competitor)}
        className="flex h-full items-center justify-center border-l border-[#D5D7DA] bg-[#F9F9F9] text-[#8A93A3] transition hover:bg-[#F4F4F5] hover:text-[#2D4059]"
      >
        <ChevronRight className="h-7 w-7" strokeWidth={2.25} />
      </button>
    </article>
  );
}

function AICompetitorAnalysisResults({
  competitors,
  onOpenDetail,
}: {
  competitors: CompetitorAnalysisRow[];
  onOpenDetail: (c: CompetitorAnalysisRow) => void;
}) {
  const PAGE_SIZE = 6;
  const [query, setQuery] = useState('');
  const [threatFilter, setThreatFilter] = useState<CompetitorThreatFilter>('all');
  const [sortBy, setSortBy] = useState<CompetitorSort>('threat');
  const [currentPage, setCurrentPage] = useState(1);

  const visibleCompetitors = useMemo(() => {
    const q = query.trim().toLowerCase();

    return competitors
      .map((competitor, index) => ({ competitor, index }))
      .filter(({ competitor }) => {
        if (threatFilter !== 'all' && competitor.threatLevel !== threatFilter) return false;
        if (!q) return true;
        const haystack = [
          competitor.host,
          competitor.industry,
          competitor.companySize,
          competitor.strongestPromptCluster?.category,
          ...(competitor.insights ?? []).map((insight) => insight.insight),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(q);
      })
      .sort(
        (a, b) => {
          if (sortBy === 'mentions') {
            return b.competitor.mentions - a.competitor.mentions || a.index - b.index;
          }
          if (sortBy === 'coverage') {
            return b.competitor.promptCoverage - a.competitor.promptCoverage || a.index - b.index;
          }
          if (sortBy === 'rank') {
            return (
              (a.competitor.rank ?? Number.MAX_SAFE_INTEGER) -
              (b.competitor.rank ?? Number.MAX_SAFE_INTEGER) ||
              a.index - b.index
            );
          }
          return (
            competitorThreatWeight(b.competitor.threatLevel) - competitorThreatWeight(a.competitor.threatLevel) ||
            b.competitor.mentions - a.competitor.mentions ||
            a.index - b.index
          );
        }
      )
      .map(({ competitor }) => competitor);
  }, [competitors, query, sortBy, threatFilter]);

  const totalCount = visibleCompetitors.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const pageResetKey = useMemo(() => visibleCompetitors.map((competitor) => competitor.host).join('|'), [visibleCompetitors]);

  useEffect(() => {
    setCurrentPage(1);
  }, [pageResetKey, query, sortBy, threatFilter]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const pageCompetitors = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return visibleCompetitors.slice(start, start + PAGE_SIZE);
  }, [currentPage, visibleCompetitors]);

  return (
    <section id="competitors-analysis" data-title="AI-Based Competitor Analysis Results" className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-lg font-semibold leading-none text-[#2D4059]">AI-Based Competitor Analysis Results</h3>
          <p className="mt-3 text-sm text-[#7B8494]">Compare AI analysis of competitor performance and visibility.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search competitors"
            className="h-9 w-full rounded-md border border-slate-200 px-3 text-xs outline-none transition focus:border-slate-300 focus:ring-1 focus:ring-slate-300 sm:w-[210px]"
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-[#5F6877] shadow-sm transition hover:bg-slate-50"
              >
                <ArrowDownRight className="h-3.5 w-3.5" />
                {COMPETITOR_SORT_OPTIONS.find((option) => option.value === sortBy)?.label ?? 'Threat'}
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[150px] p-1">
              {COMPETITOR_SORT_OPTIONS.map((option) => (
                <DropdownMenuItem
                  key={option.value}
                  onClick={() => setSortBy(option.value)}
                  className="flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-[12px]"
                >
                  {option.label}
                  {sortBy === option.value ? <Check className="h-3.5 w-3.5 text-blue-600" /> : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-[#5F6877] shadow-sm transition hover:bg-slate-50"
              >
                <Filter className="h-3.5 w-3.5" />
                {COMPETITOR_THREAT_OPTIONS.find((option) => option.value === threatFilter)?.label ?? 'All threats'}
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[170px] p-1">
              {COMPETITOR_THREAT_OPTIONS.map((option) => (
                <DropdownMenuItem
                  key={option.value}
                  onClick={() => setThreatFilter(option.value)}
                  className="flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-[12px]"
                >
                  {option.label}
                  {threatFilter === option.value ? <Check className="h-3.5 w-3.5 text-blue-600" /> : null}
                </DropdownMenuItem>
              ))}
              {(threatFilter !== 'all' || query.trim()) ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      setThreatFilter('all');
                      setQuery('');
                    }}
                    className="cursor-pointer rounded-md px-2 py-1.5 text-[12px] text-slate-500"
                  >
                    Clear filters
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="mt-5 flex max-h-[700px] flex-col gap-4 overflow-y-auto pr-1 border">
        {pageCompetitors.length === 0 ? (
          <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
            {competitors.length === 0
              ? 'No competitors mentioned in this audit yet. Re-run the audit, or add competitors in the wizard.'
              : 'No competitors match the current filters.'}
          </p>
        ) : (
          pageCompetitors.map((c) => (
            <AnalysisResultCard key={c.host} competitor={c} onOpenDetail={onOpenDetail} />
          ))
        )}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-200 pt-3">
        <span className="text-[11px] font-semibold tracking-tight text-gray-500">
          {totalCount === 0
            ? 'No rows'
            : `Showing ${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, totalCount)} of ${totalCount}`}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
            disabled={currentPage <= 1}
            className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Prev
          </button>
          <span className="px-2 text-[11px] font-medium text-slate-500 tabular-nums">
            {currentPage} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
            disabled={currentPage >= totalPages}
            className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
}

// ── Positioning bubble chart ───────────────────────────────────────────────

function PositioningComparison({ analysis }: { analysis: CompetitorAnalysisResponse | null }) {
  const data = useMemo(() => {
    if (!analysis) return [] as Array<{ name: string; x: number; y: number; z: number; color: string }>;
    const rows = analysis.competitors
      .filter((c) => c.mentions > 0)
      .map((c, i) => ({
        name: c.host,
        x: Math.round(c.marketShare * 100),
        y: sentimentToScore(c.avgSentiment),
        z: Math.max(60, c.promptCoverage * 30),
        color: colorForHost(c.host, i),
      }));
    rows.push({
      name: `You (${analysis.ownBrand.host})`,
      x: Math.round(analysis.ownBrand.marketShare * 100),
      y: sentimentToScore(analysis.ownBrand.avgSentiment),
      z: 200,
      color: '#2D4059',
    });
    return rows;
  }, [analysis]);

  return (
    <section id="competitors-positioning" data-title="Positioning Comparison" className="min-w-0 rounded-xl border border-slate-200 bg-white p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-xl font-semibold leading-none text-[#2D4059]">Positioning Comparison</h3>
          <p className="mt-5 text-sm text-[#7B8494]">Compare competitor positioning by market share and sentiment.</p>
        </div>
      </div>

      <div className="mt-8">
        {data.length === 0 ? (
          <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-4 py-12 text-center text-sm text-slate-500">
            No competitor positioning data yet.
          </p>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={560}>
              <ScatterChart margin={{ top: 20, right: 20, bottom: 30, left: 10 }}>
                <CartesianGrid stroke="#EEF1F5" strokeDasharray="2 2" />
                <XAxis
                  type="number"
                  dataKey="x"
                  domain={[0, 100]}
                  ticks={[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]}
                  tick={{ fontSize: 11, fill: '#667085' }}
                  label={{ value: 'Market Share %', position: 'insideBottom', offset: -10, fill: '#2D5B93', fontSize: 12 }}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  domain={[0, 100]}
                  ticks={[0, 20, 40, 60, 80, 100]}
                  tick={{ fontSize: 11, fill: '#667085' }}
                  label={{ value: 'Sentiment %', angle: -90, position: 'insideLeft', fill: '#2D5B93', fontSize: 12 }}
                />
                <ZAxis type="number" dataKey="z" range={[60, 400]} />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  content={({ active, payload }) => {
                    if (!active || !payload || payload.length === 0) return null;
                    const p = payload[0].payload as { name: string; x: number; y: number };
                    return (
                      <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
                        <p className="font-semibold text-[#2D4059]">{p.name}</p>
                        <p className="text-[#7B8494]">Market share: {p.x}%</p>
                        <p className="text-[#7B8494]">Sentiment: {p.y}/100</p>
                      </div>
                    );
                  }}
                />
                <Scatter
                  data={data}
                  shape={(props: any) => {
                    const { cx, cy, payload } = props;
                    const radius = Math.sqrt((payload.z ?? 100) / Math.PI) * 2.8;
                    return (
                      <circle cx={cx} cy={cy} r={radius} fill={payload.color} fillOpacity={0.7} stroke={payload.color} />
                    );
                  }}
                />
              </ScatterChart>
            </ResponsiveContainer>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-8 gap-y-4 px-4">
              {data.map((d) => (
                <div key={d.name} className="flex items-center gap-2">
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: d.color }} />
                  <span className="text-sm font-medium text-[#5F6877]">{d.name}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

// ── Content opportunities ─────────────────────────────────────────────────

function ContentOpportunityCard({ item, onGenerate }: { item: ReportOpportunity; onGenerate: (item: ReportOpportunity) => void }) {
  const impact = item.trafficPotential === 'very_high' ? 'Very High' : item.trafficPotential === 'high' ? 'High' : item.trafficPotential === 'medium' ? 'Medium' : 'Low';
  const priority = item.severity === 'critical' ? 'Critical' : item.severity === 'high' ? 'High' : item.severity === 'medium' ? 'Medium' : 'Low';
  const relatedTo = item.competitors[0] ?? item.keyword ?? '—';

  return (
    <article className="relative overflow-hidden rounded-lg border border-[#E8ECF2] bg-white px-6 py-5 shadow-[0_8px_18px_rgba(15,23,42,0.06)]">
      <div className="absolute inset-y-0 left-0 w-1.5 bg-[#7EA6FF]" />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <h4 className="line-clamp-2 text-base font-semibold text-[#2D4059] break-words">{item.title}</h4>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="inline-flex h-5 items-center rounded-full bg-[#FFE9E9] px-2.5 text-[10px] font-medium text-[#F05F5F]">
              {priority}
            </span>
            <span className="text-sm font-semibold text-[#2DA855]">↗ {impact}</span>
          </div>
          <p className="mt-5 text-sm font-medium text-[#7B8494]">
            Related to: <span className="ml-5 text-[#2D4059]">{relatedTo}</span>
          </p>
        </div>
        <GenerateContentButton className="w-full sm:w-auto sm:self-center" onClick={() => onGenerate(item)} />
      </div>
    </article>
  );
}

function ContentOpportunitiesToCreate({
  opportunities,
  onGenerate,
}: {
  opportunities: ReportOpportunity[];
  onGenerate: (item: ReportOpportunity) => void;
}) {
  const PAGE_SIZE = 5;
  const [currentPage, setCurrentPage] = useState(1);
  // Use bottom-half (after the first page surfaced in Prompt Gaps) — same pool, no duplicates.
  const list = useMemo(() => opportunities.slice(4), [opportunities]);
  const totalCount = list.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const pageResetKey = useMemo(() => list.map((item) => item.key).join('|'), [list]);

  useEffect(() => {
    setCurrentPage(1);
  }, [pageResetKey]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const visibleList = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return list.slice(start, start + PAGE_SIZE);
  }, [currentPage, list]);

  return (
    <section id="competitors-content" data-title="Content Opportunities to Create" className="min-w-0 rounded-xl border border-slate-200 bg-white p-6">
      <div className="flex items-start justify-between gap-4">
        <h3 className="text-xl font-semibold leading-none text-[#2D4059]">Content Opportunities to Create</h3>
      </div>
      <div className="mt-6 space-y-4">
        {visibleList.length === 0 ? (
          <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
            No additional content opportunities right now.
          </p>
        ) : (
          visibleList.map((item) => <ContentOpportunityCard key={item.key} item={item} onGenerate={onGenerate} />)
        )}
      </div>
      {list.length > 0 ? (
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-200 pt-3">
          <span className="text-[11px] font-semibold tracking-tight text-gray-500">
            Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, totalCount)} of {totalCount}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              disabled={currentPage <= 1}
              className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Prev
            </button>
            <span className="px-2 text-[11px] font-medium text-slate-500 tabular-nums">
              {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
              disabled={currentPage >= totalPages}
              className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

// ── Build AiResponseAnalysisData from selected opportunity ─────────────────

type PromptResultRow = ReportPayload['topPrompts'][number];
type PromptResultModel = PromptResultRow['results'][number];

function normalizeHostLabel(value: string) {
  return value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
}

function isSuccessfulModelResult(result: PromptResultModel) {
  return result.status !== 'failed';
}

function getPromptVisibility(row: PromptResultRow) {
  const successful = row.results.filter(isSuccessfulModelResult);
  if (successful.length === 0) return Number.POSITIVE_INFINITY;
  const mentions = successful.filter((result) => result.presence === 1).length;
  return mentions / successful.length;
}

function pickPrimaryPromptRow(rows: PromptResultRow[]) {
  return [...rows].sort((a, b) => getPromptVisibility(a) - getPromptVisibility(b) || a.rawId - b.rawId)[0] ?? null;
}

function buildAiResponseAnalysis(
  opp: ReportOpportunity,
  report: ReportPayload | null,
  overrideRow?: PromptResultRow | null,
): AiResponseAnalysisData {
  const promptIdSet = new Set(opp.promptIds);
  const relevantPrompts = overrideRow
    ? [overrideRow]
    : (report?.topPrompts ?? []).filter((p) => p.type === 'prompt' && promptIdSet.has(p.rawId));
  const primaryPrompt = pickPrimaryPromptRow(relevantPrompts);
  const allResults = primaryPrompt?.results ?? [];
  const successfulResults = allResults.filter(isSuccessfulModelResult);
  const attemptedResponses = allResults.length;
  const successfulResponses = successfulResults.length;
  const brandName = report?.domainInfo?.companyName ?? report?.domainInfo?.host ?? 'your brand';

  const brandMentions = successfulResults.filter((result) => result.presence === 1).length;
  const sentimentSamples = successfulResults
    .filter((result) => result.presence === 1 && typeof result.sentiment === 'number')
    .map((result) => result.sentiment as number);
  const sentimentTotal = sentimentSamples.length;

  // Competitor ranking — exact mention count in the selected prompt's model responses.
  const competitorMentions = successfulResults.flatMap((r) => r.competitorMentions ?? []);
  const compStats = new Map<string, { mentions: number; bestPos: number | null; sentimentSum: number; sentimentCount: number }>();
  for (const m of competitorMentions) {
    const host = normalizeHostLabel(m.host ?? '');
    if (!host) continue;
    const cur = compStats.get(host) ?? { mentions: 0, bestPos: null, sentimentSum: 0, sentimentCount: 0 };
    cur.mentions += m.count ?? 1;
    if (typeof m.rankPosition === 'number' && m.rankPosition > 0) {
      cur.bestPos = cur.bestPos === null ? m.rankPosition : Math.min(cur.bestPos, m.rankPosition);
    }
    if (typeof m.sentiment === 'number') {
      cur.sentimentSum += m.sentiment;
      cur.sentimentCount += 1;
    }
    compStats.set(host, cur);
  }
  const totalCompMentions = [...compStats.values()].reduce((s, v) => s + v.mentions, 0);
  const aiSov = brandMentions + totalCompMentions > 0
    ? Math.round((brandMentions / (brandMentions + totalCompMentions)) * 100)
    : null;
  const rankings = [...compStats.entries()].slice(0, 8).map(([host, v]) => {
    const share = totalCompMentions > 0 ? v.mentions / totalCompMentions : 0;
    const avgSentiment = v.sentimentCount > 0 ? v.sentimentSum / v.sentimentCount : 0;
    const status: 'Strong' | 'Medium' | 'Low' = share >= 0.5 || avgSentiment > 3 ? 'Strong' : share >= 0.2 ? 'Medium' : 'Low';
    return {
      name: host,
      domain: host,
      logo: competitorLogo(host, 64),
      score: `${v.mentions} ${v.mentions === 1 ? 'mention' : 'mentions'}`,
      status,
      statusTone: (status === 'Strong' ? 'green' : status === 'Low' ? 'red' : 'yellow') as 'green' | 'red' | 'yellow',
      barWidth: Math.max(8, Math.round(share * 100)),
    };
  });
  rankings.sort((a, b) => b.barWidth - a.barWidth);

  const avgOverall = successfulResults.length > 0
    ? successfulResults.reduce((sum, result) => sum + (typeof result.overall === 'number' ? result.overall : 0), 0) / successfulResults.length
    : 0;

  const performance = allResults.map((result) => {
    const competitors = Array.from(new Set([
      ...(result.competitorHosts ?? []),
      ...(result.competitorMentions ?? []).map((mention) => mention.host),
    ].map(normalizeHostLabel).filter(Boolean)));
    const overall = typeof result.overall === 'number' ? Math.max(0, Math.min(10, result.overall)) : 0;
    return {
      name: result.model,
      value: result.status === 'failed' ? 'Failed' : `${overall.toFixed(1)} / 10`,
      barWidth: result.status === 'failed' ? 0 : Math.round(overall * 10),
      status: result.status === 'failed' ? 'failed' as const : 'success' as const,
      mentioned: result.presence === 1,
      rankPosition: typeof result.rankPosition === 'number' && result.rankPosition > 0 ? result.rankPosition : null,
      competitors,
      response: result.response ?? '',
      errorMessage: result.errorMessage ?? null,
      latencyMs: result.latencyMs ?? null,
    };
  });

  const insights: string[] = [];
  if (!primaryPrompt) {
    insights.push('This opportunity is not tied to a saved prompt row yet, so there are no model responses to inspect.');
  } else if (successfulResponses === 0) {
    insights.push('No successful model responses are stored for this prompt yet. Use Retry to run this prompt again.');
  } else if (brandMentions === 0) {
    insights.push(`Lost on this prompt — ${successfulResponses} successful models answered without mentioning ${brandName}.`);
  } else {
    insights.push(`${brandName} was mentioned by ${brandMentions} of ${successfulResponses} successful models for this prompt.`);
  }
  if (totalCompMentions > 0) {
    const topCompetitors = rankings.slice(0, 3).map((item) => item.domain).join(', ');
    insights.push(`Competitors appeared ${totalCompMentions} times in this prompt's answers${topCompetitors ? `, led by ${topCompetitors}` : ''}.`);
  } else if (successfulResponses > 0) {
    insights.push('No competitors were detected in the successful responses for this prompt.');
  }
  if (sentimentTotal === 0 && successfulResponses > 0) {
    insights.push('No brand sentiment is shown because the brand was not mentioned by any successful model response.');
  }
  if (opp.rationale) insights.push(opp.rationale);
  if (opp.recommendedAngle) insights.push(`Recommended angle: ${opp.recommendedAngle}`);
  if (opp.brief?.keyPoints && opp.brief.keyPoints.length > 0) {
    insights.push(`Cover: ${opp.brief.keyPoints.slice(0, 3).join('; ')}`);
  }

  return {
    title: 'AI Response Analysis',
    subtitle: primaryPrompt
      ? 'Exact model responses and scoring for the lowest-visibility prompt tied to this opportunity.'
      : 'No saved prompt responses are available for this opportunity yet.',
    promptLabel: primaryPrompt?.phrase ?? primaryPrompt?.text ?? opp.title,
    sourcePromptId: primaryPrompt?.rawId ?? null,
    sourcePromptText: primaryPrompt?.phrase ?? primaryPrompt?.text ?? null,
    attemptedResponses,
    successfulResponses,
    brandName,
    metrics: [
      { label: 'Brand Mentions', value: `${brandMentions}/${successfulResponses}`, tone: 'blue' },
      { label: 'Competitor Mentions', value: String(totalCompMentions), tone: 'slate' },
      { label: 'AI Share of Voice', value: aiSov === null ? '—' : `${aiSov}%`, tone: brandMentions > 0 ? 'green' : 'red' },
      { label: 'Avg Brand Score', value: `${avgOverall.toFixed(1)}/10`, tone: avgOverall >= 7 ? 'green' : avgOverall >= 4 ? 'blue' : 'red' },
    ],
    rankings,
    performance,
    insights,
    emptyState:
      primaryPrompt && successfulResponses > 0
        ? 'No competitor mentions were detected in the successful model responses for this prompt.'
        : 'No successful model responses are available yet. Retry this prompt to collect fresh responses.',
  };
}

// ── Page component ─────────────────────────────────────────────────────────

export default function CompetitorsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { currentDomain, domainsLoading } = useShellContext();
  const domainId = currentDomain?.id ?? null;
  const { currentTitle: currentCompetitorSectionTitle } = useScrollSpyBreadcrumbs({});
  const maskedDomainId = currentDomain ? buildDomainSlug(currentDomain) : undefined;

  // Core data loads first; opportunity enrichment and chart history are
  // secondary so the page doesn't block on lower-priority panels.
  const reportQuery = useReport<ReportPayload>(domainId, null, { includeInsights: false });
  const reportReady = Boolean(reportQuery.data);
  const [insightsEnabled, setInsightsEnabled] = useState(false);
  const insightsQuery = useReport<ReportPayload>(domainId, null, {
    includeInsights: true,
    enabled: reportReady && insightsEnabled,
  });
  const analysisQuery = useCompetitorAnalysis<CompetitorAnalysisResponse>(domainId, null, { enabled: reportReady });
  const trendsQuery = useTrends<TrendsResponse>(domainId, undefined, { enabled: reportReady && insightsEnabled });
  const competitorsQuery = useCompetitors<{ competitors: SelectedCompetitor[] }>(domainId);

  useEffect(() => {
    setInsightsEnabled(false);
  }, [domainId]);

  useEffect(() => {
    if (!reportReady || insightsEnabled) return;
    const hydrationId = window.setTimeout(() => setInsightsEnabled(true), 1400);
    return () => window.clearTimeout(hydrationId);
  }, [insightsEnabled, reportReady]);

  const report = useMemo<ReportPayload | null>(() => {
    if (!reportQuery.data) return null;
    return {
      ...reportQuery.data,
      opportunities: insightsQuery.data?.opportunities ?? [],
    };
  }, [insightsQuery.data, reportQuery.data]);
  const analysis = analysisQuery.data ?? null;
  const trends = trendsQuery.data ?? null;
  const remoteSelected = competitorsQuery.data?.competitors ?? [];

  // Optimistic pills (loading=true) are stored locally; they merge with the
  // server-confirmed list from React Query. As soon as a refetch lands and
  // includes the new host, the optimistic copy is dropped.
  const [optimisticPills, setOptimisticPills] = useState<SelectedCompetitor[]>([]);
  const selected = useMemo<SelectedCompetitor[]>(() => {
    const remoteHosts = new Set(remoteSelected.map((c) => c.host.toLowerCase()));
    const pending = optimisticPills.filter((c) => !remoteHosts.has(c.host.toLowerCase()));
    return [...remoteSelected, ...pending];
  }, [remoteSelected, optimisticPills]);

  const loading = domainsLoading || reportQuery.isLoading;
  const error = reportQuery.error;
  const promptGapsLoading = reportReady && !insightsQuery.data && !insightsQuery.isError;

  const [selectedCompetitor, setSelectedCompetitor] = useState<CompetitorDetailData | null>(null);
  const [selectedPromptGap, setSelectedPromptGap] = useState<PromptGapContext | null>(null);
  const [selectedPromptOpportunity, setSelectedPromptOpportunity] = useState<ReportOpportunity | null>(null);
  const [selectedAnalysisData, setSelectedAnalysisData] = useState<AiResponseAnalysisData | null>(null);
  const [analysisRetrying, setAnalysisRetrying] = useState(false);
  const [analysisRetryError, setAnalysisRetryError] = useState<string | null>(null);
  const [activeDrawer, setActiveDrawer] = useState<'competitor' | 'prompt-gap' | null>(null);
  const [activeWorksheetId, setActiveWorksheetId] = useState<string | null>(null);
  const [isWorksheetModalOpen, setIsWorksheetModalOpen] = useState(false);
  const [isCreateWorksheetModalOpen, setIsCreateWorksheetModalOpen] = useState(false);
  const [pendingGeneration, setPendingGeneration] = useState<{ key: string; payload: GenerationPayload } | null>(null);
  const [newWorksheetName, setNewWorksheetName] = useState('');
  const [createWorksheetError, setCreateWorksheetError] = useState<string | null>(null);
  const [isCreatingWorksheet, setIsCreatingWorksheet] = useState(false);
  const campaignsQuery = useCampaigns<{ campaigns: Array<{ id: number; title: string; description?: string | null }> }>({
    enabled: isWorksheetModalOpen || isCreateWorksheetModalOpen,
  });
  const worksheetOptions: WorksheetOption[] = useMemo(() => {
    const campaigns = Array.isArray(campaignsQuery.data?.campaigns) ? campaignsQuery.data.campaigns : [];
    return campaigns.map((c) => ({
      id: String(c.id),
      name: c.title,
      description: c.description?.trim() ? c.description.trim() : null,
    }));
  }, [campaignsQuery.data]);

  // Derived metrics for the top cards.
  const headerMetrics = useMemo(() => {
    const visibility = report?.metrics.visibilityScore ?? 0;
    const canonicalSov = report?.metrics.reportCards?.aiShareOfVoice ?? null;
    const totalMentionEvents =
      canonicalSov?.totalMentionEvents ??
      ((analysis?.ownBrand.mentions ?? 0) + (analysis?.totals.competitorMentions ?? 0));
    const brandMentionEvents =
      canonicalSov?.brandMentionEvents ??
      (analysis?.ownBrand.mentions ?? 0);
    const competitorMentionEvents =
      canonicalSov?.competitorMentionEvents ??
      (analysis?.totals.competitorMentions ?? 0);
    const brandSov = totalMentionEvents > 0
      ? (brandMentionEvents / totalMentionEvents) * 100
      : (report?.metrics.mentionRate ?? 0);
    const competitorSOV = totalMentionEvents > 0
      ? Math.round((competitorMentionEvents / totalMentionEvents) * 100)
      : 0;
    const visibilityComparison =
      visibility > INDUSTRY_AVERAGE_VISIBILITY
        ? `Above industry average (${INDUSTRY_AVERAGE_VISIBILITY})`
        : visibility < INDUSTRY_AVERAGE_VISIBILITY
          ? `Below industry average (${INDUSTRY_AVERAGE_VISIBILITY})`
          : `At industry average (${INDUSTRY_AVERAGE_VISIBILITY})`;

    const analysisCompetitors = analysis?.competitors ?? [];
    const bestCompetitor =
      analysisCompetitors
        .filter((competitor) => competitor.mentions > 0)
        .slice()
        .sort((a, b) =>
          b.mentions - a.mentions ||
          (b.promptCoverage ?? 0) - (a.promptCoverage ?? 0) ||
          ((a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER))
        )[0] ??
      analysisCompetitors
        .slice()
        .sort((a, b) => (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER))[0] ??
      null;
    const bestScoreRaw = bestCompetitor && totalMentionEvents > 0
      ? (bestCompetitor.mentions / totalMentionEvents) * 100
      : 0;
    const bestScoreDelta = bestCompetitor ? bestScoreRaw - brandSov : 0;

    let largestGapPct = 0;
    let largestGapPrompt = '';
    if (report?.topPrompts) {
      for (const p of report.topPrompts) {
        if (p.type !== 'prompt') continue;
        const successfulResults = p.results.filter(isSuccessfulPromptResult);
        const total = successfulResults.length;
        if (total === 0) continue;
        const presence = successfulResults.reduce((s, r) => s + r.presence, 0);
        const ourCov = presence / total;
        let bestCompCov = 0;
        const compHosts = new Set<string>();
        for (const r of successfulResults) {
          for (const m of r.competitorMentions ?? []) {
            const host = normalizeComparisonHost(m.host);
            if (host) compHosts.add(host);
          }
          for (const hostRaw of r.competitorHosts ?? []) {
            const host = normalizeComparisonHost(hostRaw);
            if (host) compHosts.add(host);
          }
        }
        for (const host of compHosts) {
          const cnt = successfulResults.filter((r) => resultMentionsCompetitor(r, host)).length;
          bestCompCov = Math.max(bestCompCov, cnt / total);
        }
        const gap = bestCompCov - ourCov;
        if (gap > largestGapPct) {
          largestGapPct = gap;
          largestGapPrompt = p.text;
        }
      }
    }

    const priorityWeight: Record<ServerCompetitorInsight['priority'], number> = { high: 3, medium: 2, low: 1 };
    const competitorInsights = analysisCompetitors
      .flatMap((competitor) =>
        (competitor.insights ?? []).map((insight) => ({
          host: competitor.host,
          mentions: competitor.mentions,
          priority: insight.priority,
          text: insight.insight,
        }))
      )
      .sort((a, b) => priorityWeight[b.priority] - priorityWeight[a.priority] || b.mentions - a.mentions)
      .map((insight) => `${insight.host}: ${insight.text}`);
    const opportunityInsights = (report?.opportunities ?? []).slice(0, 3).map((o) => o.title);
    const topInsights: string[] = competitorInsights.length > 0 ? competitorInsights.slice(0, 3) : opportunityInsights;

    return {
      visibility,
      visibilityComparison,
      competitorSOV,
      bestCompetitorHost: bestCompetitor?.host ?? null,
      bestScoreRaw,
      bestScoreDelta,
      largestGapPct: Math.round(largestGapPct * 100),
      largestGapPrompt,
      topInsights,
    };
  }, [report, analysis]);

  const visibilityTrend = useMemo(() => {
    if (!trends || trends.runs.length < 2) return null;
    const runs = trends.runs;
    const visibilityRateFor = (r: TrendsResponse['runs'][number]) => {
      const totalResponses = Number(r.totalResponses ?? 0);
      return totalResponses > 0 ? (r.brandMentions / totalResponses) * 100 : null;
    };
    const prev = visibilityRateFor(runs[runs.length - 2]);
    const curr = visibilityRateFor(runs[runs.length - 1]);
    if (prev === null || curr === null) return null;
    const diff = curr - prev;
    return { value: `${diff >= 0 ? '+' : ''}${diff.toFixed(1)} pts`, positive: diff >= 0 };
  }, [trends]);

  // Inline add: push an optimistic "loading" pill, POST to the backend
  // (which re-scores every saved AiQueryResult against the new competitor),
  // then invalidate the React Query caches for this domain so the cards /
  // bubble chart / detail drawer refetch the freshly-extracted data. The
  // optimistic pill is dropped as soon as the new selected-competitors
  // list lands.
  const handleAddCompetitor = async (host: string): Promise<void> => {
    if (!domainId) throw new Error('No domain selected.');
    if (selected.length >= MAX_COMPETITORS) {
      throw new Error(`You can track up to ${MAX_COMPETITORS} competitors only.`);
    }
    if (selected.some((c) => c.host.toLowerCase() === host.toLowerCase())) {
      throw new Error('Already tracked.');
    }
    setOptimisticPills((p) => [
      ...p,
      { host, url: `https://${host}`, logoUrl: competitorLogo(host, 32), rank: null, threatLevel: null, loading: true },
    ]);
    try {
      await apiPost(`/wizard/domain/${domainId}/competitors/add`, { host });
      // Invalidate exactly the two queries that change when a competitor is added.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: aiResultsKeys.competitors(domainId) }),
        queryClient.invalidateQueries({ queryKey: aiResultsKeys.competitorAnalysis(domainId) }),
      ]);
    } catch (err) {
      setOptimisticPills((p) => p.filter((c) => c.host !== host));
      throw err;
    }
  };

  const handleRemoveCompetitor = async (host: string): Promise<void> => {
    if (!domainId) throw new Error('No domain selected.');
    const remainingHosts = selected
      .filter((competitor) => competitor.host.toLowerCase() !== host.toLowerCase())
      .map((competitor) => competitor.host);
    await apiPost(`/wizard/domain/${domainId}/competitors/select`, { hosts: remainingHosts });
    setOptimisticPills((p) => p.filter((c) => c.host.toLowerCase() !== host.toLowerCase()));
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: aiResultsKeys.competitors(domainId) }),
      queryClient.invalidateQueries({ queryKey: aiResultsKeys.competitorAnalysis(domainId) }),
    ]);
  };

  // Manual refresh — invalidate every run-derived query for this domain so the
  // page re-pulls report / trends / competitor-analysis / selected-competitors
  // from the server. This is the escape hatch for the case where a re-audit
  // finished in another tab (or the global 5-min staleTime is still holding a
  // pre-audit copy) and the user wants to force the freshest numbers.
  const isRefreshing =
    reportQuery.isFetching ||
    insightsQuery.isFetching ||
    analysisQuery.isFetching ||
    trendsQuery.isFetching ||
    competitorsQuery.isFetching;

  const handleRefresh = useCallback(() => {
    if (domainId == null) return;
    void queryClient.invalidateQueries({
      predicate: (query) =>
        Array.isArray(query.queryKey) &&
        query.queryKey[0] === 'ai-results' &&
        query.queryKey[2] === domainId,
    });
  }, [domainId, queryClient]);

  const closeDrawer = () => {
    setActiveDrawer(null);
    setSelectedCompetitor(null);
    setSelectedPromptGap(null);
    setSelectedPromptOpportunity(null);
    setSelectedAnalysisData(null);
    setAnalysisRetrying(false);
    setAnalysisRetryError(null);
  };

  const openCompetitorDrawer = (c: CompetitorAnalysisRow) => {
    setSelectedPromptGap(null);
    setSelectedPromptOpportunity(null);
    setSelectedAnalysisData(null);
    setAnalysisRetryError(null);
    setSelectedCompetitor(buildCompetitorDetail(c));
    setActiveDrawer('competitor');
  };

  const openPromptGapDrawer = (o: ReportOpportunity) => {
    setSelectedCompetitor(null);
    setSelectedPromptGap(buildPromptGapContext(o));
    setSelectedPromptOpportunity(o);
    setSelectedAnalysisData(buildAiResponseAnalysis(o, report));
    setAnalysisRetryError(null);
    setActiveDrawer('prompt-gap');
  };

  const handleRetryPromptAnalysis = useCallback(async () => {
    if (!domainId || !selectedPromptOpportunity || !selectedAnalysisData?.sourcePromptId) return;
    setAnalysisRetrying(true);
    setAnalysisRetryError(null);
    try {
      const res = await apiPost<{
        row: PromptResultRow;
        prompt?: { id: number; keywordId: number | null; text: string };
      }>(`/wizard/domain/${domainId}/prompts/${selectedAnalysisData.sourcePromptId}/rerun`);
      setSelectedAnalysisData(buildAiResponseAnalysis(selectedPromptOpportunity, report, res.row));
      void queryClient.invalidateQueries({
        predicate: (query) =>
          Array.isArray(query.queryKey) &&
          query.queryKey[0] === 'ai-results' &&
          query.queryKey[2] === domainId,
      });
    } catch (err) {
      setAnalysisRetryError(err instanceof Error ? err.message : 'Could not retry this prompt. Please try again.');
    } finally {
      setAnalysisRetrying(false);
    }
  }, [domainId, queryClient, report, selectedAnalysisData?.sourcePromptId, selectedPromptOpportunity]);

  const handleGenerateContent = useCallback((item: ReportOpportunity) => {
    if (!report?.domainInfo?.id) return;
    setPendingGeneration({
      key: item.key,
      payload: {
        title: item.title,
        rationale: item.rationale,
        primaryKeyword: item.keyword ?? null,
        suggestedTemplate: 'blog',
        recommendedAngle: item.recommendedAngle,
        brief: item.brief,
      },
    });
    setActiveWorksheetId(null);
    setIsWorksheetModalOpen(true);
  }, [report]);

  const runGeneration = useCallback(async (key: string, payload: GenerationPayload, campaignId: number | null, worksheetTab: Window | null = null) => {
    if (!report?.domainInfo?.id) return false;
    try {
      const built = await apiPost<{ campaignId: number }>('/campaigns/topics/from-opportunity', {
        domainId: report.domainInfo.id,
        opportunityKey: key,
        campaignId,
        title: payload.title,
        rationale: payload.rationale,
        primaryKeyword: payload.primaryKeyword,
        longtailKeywords: [],
        suggestedTemplate: payload.suggestedTemplate,
        recommendedAngle: payload.recommendedAngle,
        brief: payload.brief,
      });
      writeWorksheetHandoff({ worksheetId: built.campaignId });
      localStorage.setItem('activeTab', 'projects');
      const worksheetPath = buildProjectsWorksheetPath(built.campaignId);
      if (worksheetTab) {
        worksheetTab.location.href = worksheetPath;
      } else {
        navigate(worksheetPath);
      }
      return true;
    } catch (err) {
      if (worksheetTab) {
        worksheetTab.close();
      }
      console.error('[AIResults Competitors] Failed to add to worksheet:', err);
      return false;
    }
  }, [navigate, report]);

  const handleAddToWorksheet = useCallback(() => {
    if (!activeWorksheetId || !pendingGeneration) return;
    const campaignId = Number(activeWorksheetId);
    const { key, payload } = pendingGeneration;
    const worksheetTab = openWorksheetPlaceholderTab();
    if (!worksheetTab) return;
    void runGeneration(
      key,
      payload,
      Number.isFinite(campaignId) ? campaignId : null,
      worksheetTab
    ).then((success) => {
      if (!success) return;
      setIsWorksheetModalOpen(false);
      setPendingGeneration(null);
      setActiveWorksheetId(null);
    });
  }, [activeWorksheetId, pendingGeneration, runGeneration]);

  const handleCreateWorksheet = useCallback(async () => {
    const name = newWorksheetName.trim();
    if (!name || isCreatingWorksheet) return;
    setIsCreatingWorksheet(true);
    setCreateWorksheetError(null);
    try {
      const created = await apiPost<{ campaign?: { id: number; title: string } }>('/campaigns', { title: name });
      const newId = created?.campaign?.id;
      if (!newId) {
        setCreateWorksheetError('Failed to create worksheet.');
        return;
      }
      await queryClient.invalidateQueries({ queryKey: aiResultsKeys.campaigns() });
      setIsCreateWorksheetModalOpen(false);
      setNewWorksheetName('');
      setActiveWorksheetId(String(newId));
      if (pendingGeneration) {
        const { key, payload } = pendingGeneration;
        setIsWorksheetModalOpen(false);
        setPendingGeneration(null);
        setActiveWorksheetId(null);
        void runGeneration(key, payload, newId);
      }
    } catch {
      setCreateWorksheetError('Failed to create worksheet.');
    } finally {
      setIsCreatingWorksheet(false);
    }
  }, [isCreatingWorksheet, newWorksheetName, pendingGeneration, queryClient, runGeneration]);

  const hasRun = report?.runStatus === 'completed';

  return (
    <>
      <div className="w-full bg-white">
        <div className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/90">
          <div className="mx-auto flex w-full max-w-[1530px] items-center px-5 py-3">
            <AIResultsBreadcrumbs
              mode="static"
              prefixLabel="AI Visibility"
              prefixHref={resolveSidebarNavigation('ai-visibility').path}
              pageLabel="Competitors Intelligence"
              pageHref={maskedDomainId ? resolveAIResultsNavigation('competitors', maskedDomainId) : undefined}
              currentLabel={currentCompetitorSectionTitle ?? 'Tracked Competitors'}
            />
          </div>
        </div>

        <div className="mx-auto flex w-full max-w-[1530px] flex-col gap-5 px-5 py-3 pb-6">
          {loading ? (
            <LoadingSkeleton />
          ) : error ? (
            <p className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
              {error instanceof Error ? error.message : 'Failed to load competitor data.'}
            </p>
          ) : !hasRun ? (
            <EmptyState onRun={() => navigate('/ai-checker-v2')} />
          ) : (
            <>
              <section className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold leading-none text-[#2D4059]">Competitor Analysis</h2>
                  <button
                    type="button"
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                    title="Refresh competitor data"
                    className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-[#5F6877] shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                    {isRefreshing ? 'Refreshing…' : 'Refresh'}
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
                  <ScoreCard
                    title="AI Visibility Score"
                    score={headerMetrics.visibility}
                    maxScore={100}
                    footer={headerMetrics.visibilityComparison}
                    trend={visibilityTrend ?? undefined}
                    tooltipText="Brand-mentioned successful model responses divided by successful model responses in the latest audit."
                  />
                  <TopCompetitorCard
                    title="Top Competitor"
                    competitorHost={headerMetrics.bestCompetitorHost}
                    competitorScoreDelta={headerMetrics.bestScoreDelta}
                    tooltipText="Competitor with the most mention events in the latest audit. Delta compares that competitor's share of all brand + competitor mention events against your brand share."
                  />
                  <ValueCard
                    title="Largest Prompt Gap"
                    value={headerMetrics.largestGapPct > 0 ? `${headerMetrics.largestGapPct}%` : '—'}
                    footer={headerMetrics.largestGapPrompt || 'No gap detected'}
                    badge="Prompt"
                    tooltipText="Largest successful-response coverage gap where a competitor appeared more often than your brand on one prompt."
                  />
                  <ValueCard
                    title="Competitor SOV"
                    value={`${headerMetrics.competitorSOV}%`}
                    footer="Across all competitor mention events"
                    tooltipText="Competitor mention events divided by brand + competitor mention events in the latest audit."
                  />
                  <InsightCard title="Top Insight" items={headerMetrics.topInsights} />
                </div>
              </section>

              <CompetitorSelector competitors={selected} onAdd={handleAddCompetitor} onRemove={handleRemoveCompetitor} />

              <div className="grid grid-cols-1 gap-5">
                <TrendComparisonPanel trends={trends} />
              </div>

              <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <PositioningComparison analysis={analysis} />
                <AICompetitorAnalysisResults
                  competitors={analysis?.competitors ?? []}
                  onOpenDetail={openCompetitorDrawer}
                />
              </div>
            </>
          )}
        </div>
      </div>

      <Drawer open={activeDrawer !== null} onOpenChange={(open) => !open && closeDrawer()}>
        {activeDrawer === 'competitor' && selectedCompetitor ? (
          <CompetitorDetail competitor={selectedCompetitor} />
        ) : null}
        {activeDrawer === 'prompt-gap' && selectedPromptGap ? (
          <AiResponseAnalysis
            data={selectedAnalysisData}
            prompt={selectedPromptGap}
            onRetry={selectedAnalysisData?.sourcePromptId ? handleRetryPromptAnalysis : undefined}
            retrying={analysisRetrying}
            retryError={analysisRetryError}
          />
        ) : null}
      </Drawer>
      <WorksheetPickerModal
        open={isWorksheetModalOpen}
        selectedCount={1}
        worksheets={worksheetOptions}
        activeWorksheetId={activeWorksheetId}
        loading={campaignsQuery.isLoading}
        onOpenChange={(open) => {
          setIsWorksheetModalOpen(open);
          if (!open) {
            setPendingGeneration(null);
            setActiveWorksheetId(null);
            setIsCreateWorksheetModalOpen(false);
            setCreateWorksheetError(null);
            setNewWorksheetName('');
          }
        }}
        onWorksheetSelect={setActiveWorksheetId}
        onAddToWorksheet={handleAddToWorksheet}
        onCreateNewWorksheet={() => {
          setCreateWorksheetError(null);
          setNewWorksheetName('');
          setIsCreateWorksheetModalOpen(true);
        }}
      />
      <CreateWorksheetModal
        open={isCreateWorksheetModalOpen}
        name={newWorksheetName}
        error={createWorksheetError}
        isSubmitting={isCreatingWorksheet}
        onOpenChange={(open) => {
          if (!isCreatingWorksheet) setIsCreateWorksheetModalOpen(open);
          if (!open) {
            setCreateWorksheetError(null);
            setNewWorksheetName('');
          }
        }}
        onNameChange={setNewWorksheetName}
        onSubmit={() => void handleCreateWorksheet()}
      />
    </>
  );
}

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-[106px] rounded-lg bg-slate-100" />)}
      </div>
      <div className="h-12 rounded-lg bg-slate-100" />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.85fr)]">
        <div className="h-[540px] rounded-lg bg-slate-100" />
        <div className="h-[540px] rounded-lg bg-slate-100" />
      </div>
      <div className="h-[280px] rounded-lg bg-slate-100" />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="h-[360px] rounded-lg bg-slate-100" />
        <div className="h-[360px] rounded-lg bg-slate-100" />
      </div>
    </div>
  );
}

function EmptyState({ onRun }: { onRun: () => void }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      <h2 className="text-xl font-semibold text-[#2D4059]">No competitor data yet</h2>
      <p className="text-sm text-[#7B8494]">
        Run an audit on this domain to surface competitor visibility, prompt gaps, share of voice, and content opportunities.
      </p>
      <button
        type="button"
        onClick={onRun}
        className="inline-flex h-10 items-center gap-2 rounded-md bg-[#243B5A] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1F334D]"
      >
        Run audit
      </button>
    </div>
  );
}
