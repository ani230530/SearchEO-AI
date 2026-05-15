import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  Info,
  Search,
  Sparkles,
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
import { CompetitorDetail } from '@/components/competitors/CompetitorDetail';
import { AiResponseAnalysis } from '@/components/competitors/AiResponseAnalysis';
import type {
  CompetitorDetailData,
  CompetitorInsightRow,
  CompetitorInsightPriority,
} from '@/components/competitors/competitorDetailData';
import type {
  AiResponseAnalysisData,
  PromptGapContext,
} from '@/components/competitors/aiResponseAnalysisData';
import { apiGet } from '../services/apiClient';
import { AIResultsLayout } from '@/features/ai-results/components/AIResultsLayout';
import { maskDomainId } from '@/lib/domainUtils';
import { useNavigate } from 'react-router-dom';

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
}

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
  };
  topPrompts: Array<{
    rawId: number;
    type: 'keyword' | 'prompt';
    phrase: string;
    text: string;
    competitors: string[];
    results: Array<{
      model: string;
      presence: number;
      sentiment: number | null;
      rankPosition: number | null;
      competitorMentions: Array<{ host: string; count: number; sentiment: number | null; rankPosition?: number | null }>;
    }>;
  }>;
  opportunities: ReportOpportunity[];
}

interface TrendsResponse {
  runs: Array<{
    runId: number;
    startedAt: string;
    endedAt: string | null;
    perModel: Record<string, { cites: number; presenceCount: number }>;
    brandMentions: number;
    competitorMentions: number;
    perCompetitor: Record<string, number>;
  }>;
  topCompetitors: string[];
}

// ── helpers ────────────────────────────────────────────────────────────────

const LOGO_TOKEN = 'pk_DTdFFG1JT9WOCjATvZEzIA';
const competitorLogo = (host: string, size = 32) =>
  `https://img.logo.dev/${host}?token=${LOGO_TOKEN}&size=${size}`;

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

const priorityFromServer = (p: 'high' | 'medium' | 'low'): CompetitorInsightPriority => p;

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
      title: 'Book a Free Strategy Call',
      description:
        'Receive a customized, data-driven strategy designed to help you outperform this competitor in AI search.',
      buttonLabel: 'Schedule a call',
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

function GenerateContentButton({ className = '' }: { className?: string }) {
  return (
    <button
      type="button"
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
    <article className="flex h-[106px] min-w-0 flex-col rounded-lg border border-slate-200 bg-white px-6 py-4">
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
    <article className="flex h-[106px] min-w-0 flex-col rounded-lg border border-slate-200 bg-white px-6 py-4">
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
    <article className="flex h-[106px] min-w-0 flex-col rounded-lg border border-slate-200 bg-white px-6 py-4">
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

function CompetitorSelector({ competitors, onAdd }: { competitors: SelectedCompetitor[]; onAdd: () => void }) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    if (!search.trim()) return competitors;
    const q = search.toLowerCase();
    return competitors.filter((c) => c.host.toLowerCase().includes(q));
  }, [competitors, search]);

  return (
    <section className="flex flex-col gap-3">
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
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex h-9 items-center gap-2 rounded bg-[#243B5A] px-4 text-xs font-semibold text-white shadow-sm transition hover:bg-[#1F334D]"
        >
          Manage list
        </button>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
          {competitors.length === 0
            ? 'No competitors selected yet. Run the audit wizard to discover competitors for this domain.'
            : 'No competitors match the current search.'}
        </p>
      ) : (
        <div className="flex flex-wrap gap-3">
          {filtered.map((c, idx) => (
            <span
              key={c.host}
              className="inline-flex h-9 items-center gap-2 rounded border border-slate-200 bg-white px-3 text-xs font-semibold text-[#2D4059] shadow-sm"
            >
              <span className="grid h-6 w-6 place-items-center overflow-hidden rounded" style={{ backgroundColor: `${colorForHost(c.host, idx)}22` }}>
                <img src={c.logoUrl} alt="" className="h-5 w-5 object-contain" />
              </span>
              {c.host}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

// ── Trend comparison panels ────────────────────────────────────────────────

type TrendChartPoint = { label: string } & Record<string, number | string>;

function TrendComparisonPanel({ trends }: { trends: TrendsResponse | null }) {
  const hasData = trends && trends.runs.length >= 2;

  const { visibilityData, citationData, sovData, models, topCompetitors } = useMemo(() => {
    if (!trends || trends.runs.length === 0) {
      return { visibilityData: [] as TrendChartPoint[], citationData: [] as TrendChartPoint[], sovData: [] as TrendChartPoint[], models: [] as string[], topCompetitors: [] as string[] };
    }
    const modelsSet = new Set<string>();
    for (const r of trends.runs) for (const m of Object.keys(r.perModel)) modelsSet.add(m);
    const modelList = [...modelsSet];

    const visibility: TrendChartPoint[] = trends.runs.map((r) => {
      const point: TrendChartPoint = { label: new Date(r.startedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) };
      for (const m of modelList) {
        const cell = r.perModel[m];
        // presenceCount / queries is a rough visibility %; runs without a model emit 0
        const queries = cell ? Object.values(r.perModel).reduce((s, x) => s + (x?.presenceCount ?? 0), 0) : 0;
        point[m] = cell ? cell.presenceCount : 0;
      }
      return point;
    });

    const citation: TrendChartPoint[] = trends.runs.map((r) => {
      const point: TrendChartPoint = { label: new Date(r.startedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) };
      for (const m of modelList) point[m] = r.perModel[m]?.cites ?? 0;
      return point;
    });

    const sov: TrendChartPoint[] = trends.runs.map((r) => {
      const total = r.brandMentions + r.competitorMentions;
      const point: TrendChartPoint = { label: new Date(r.startedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) };
      point['You'] = total > 0 ? Math.round((r.brandMentions / total) * 100) : 0;
      for (const host of trends.topCompetitors) {
        point[host] = total > 0 ? Math.round(((r.perCompetitor[host] ?? 0) / total) * 100) : 0;
      }
      return point;
    });

    return { visibilityData: visibility, citationData: citation, sovData: sov, models: modelList, topCompetitors: trends.topCompetitors };
  }, [trends]);

  return (
    <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="text-base font-semibold text-[#2D4059]">Competitor Trend Comparison</h3>
        <span className="text-xs text-[#7B8494]">Last {trends?.runs.length ?? 0} runs</span>
      </div>

      {!hasData ? (
        <p className="mt-6 rounded-md border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
          Need at least two completed audits to plot trends. Re-run the audit to start building history.
        </p>
      ) : (
        <div className="mt-3 space-y-6">
          <ChartBlock title="AI Visibility Trend" subtitle="Brand mentions by model across the last runs.">
            <ResponsiveContainer width="100%" height={170}>
              <LineChart data={visibilityData} margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
                <CartesianGrid stroke="#EEF1F5" strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#98A2B3' }} />
                <YAxis tick={{ fontSize: 10, fill: '#98A2B3' }} />
                <Tooltip />
                <RLegend wrapperStyle={{ fontSize: 10 }} />
                {models.map((m, i) => (
                  <Line key={m} type="monotone" dataKey={m} stroke={COMPETITOR_COLORS[i % COMPETITOR_COLORS.length]} strokeWidth={2} dot={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </ChartBlock>

          <ChartBlock title="Citation Volume" subtitle="Citation count per AI model across runs.">
            <ResponsiveContainer width="100%" height={170}>
              <LineChart data={citationData} margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
                <CartesianGrid stroke="#EEF1F5" strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#98A2B3' }} />
                <YAxis tick={{ fontSize: 10, fill: '#98A2B3' }} />
                <Tooltip />
                <RLegend wrapperStyle={{ fontSize: 10 }} />
                {models.map((m, i) => (
                  <Line key={m} type="monotone" dataKey={m} stroke={COMPETITOR_COLORS[i % COMPETITOR_COLORS.length]} strokeWidth={2} dot={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </ChartBlock>

          <ChartBlock title="Share of Voice" subtitle="Mention share — you vs your tracked competitors.">
            <ResponsiveContainer width="100%" height={170}>
              <LineChart data={sovData} margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
                <CartesianGrid stroke="#EEF1F5" strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#98A2B3' }} />
                <YAxis unit="%" tick={{ fontSize: 10, fill: '#98A2B3' }} />
                <Tooltip />
                <RLegend wrapperStyle={{ fontSize: 10 }} />
                <Line type="monotone" dataKey="You" stroke="#2D4059" strokeWidth={2.5} dot={{ r: 3 }} />
                {topCompetitors.map((host, i) => (
                  <Line key={host} type="monotone" dataKey={host} stroke={COMPETITOR_COLORS[i % COMPETITOR_COLORS.length]} strokeWidth={2} dot={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </ChartBlock>
        </div>
      )}
    </section>
  );
}

function ChartBlock({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="mb-2">
        <h4 className="text-sm font-semibold text-[#2D4059]">{title}</h4>
        <p className="text-xs text-[#7B8494]">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}

// ── Opportunity / Prompt Gap card ──────────────────────────────────────────

function OpportunityCard({ item, onAiResponse }: { item: ReportOpportunity; onAiResponse: (o: ReportOpportunity) => void }) {
  const importanceScore = Math.round(item.severityScore * 10);
  const badgeLabel = item.severity === 'critical' ? 'Critical' : item.severity === 'high' ? 'High Impact' : item.severity === 'medium' ? 'Medium' : 'Low';
  const opportunityPct = Math.min(100, Math.round(item.severityScore * 10));

  return (
    <article className="relative overflow-hidden rounded-xl border border-[#E8ECF2] bg-white py-5 pl-6 pr-5 shadow-[0_10px_24px_rgba(15,23,42,0.08)]">
      <div className="absolute inset-y-0 left-0 w-1.5 bg-[#7EA6FF]" />
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_128px] sm:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex h-5 items-center rounded-full bg-[#FFE9E9] px-2.5 text-[10px] font-medium text-[#F05F5F]">
              {badgeLabel}
            </span>
            <span className="text-sm font-medium text-[#7B8494]">Importance: {importanceScore}/100</span>
          </div>
          <h4 className="mt-4 max-w-[480px] text-base font-medium italic leading-6 text-[#2D4059]">
            {item.title}
          </h4>
          {item.competitors.length > 0 ? (
            <p className="mt-5 text-sm font-medium leading-5 text-[#426185]">
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
            <p className="mt-5 text-sm font-medium leading-5 text-[#426185]">{item.rationale}</p>
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
            <GenerateContentButton className="w-full" />
          </div>
        </div>
      </div>
    </article>
  );
}

function PromptGapPanel({
  opportunities,
  onAiResponse,
  onViewAll,
}: {
  opportunities: ReportOpportunity[];
  onAiResponse: (o: ReportOpportunity) => void;
  onViewAll: () => void;
}) {
  const shown = opportunities.slice(0, 4);
  return (
    <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-xl font-semibold leading-none text-[#2D4059]">Prompt Gaps Opportunities</h3>
          <p className="mt-3 text-base text-[#7B8494]">Turn missed prompts into content</p>
        </div>
        <button
          type="button"
          onClick={onViewAll}
          className="inline-flex h-10 shrink-0 items-center gap-3 rounded-md border border-[#D7DDE6] bg-white px-4 text-xs font-semibold text-[#7B8494] shadow-sm"
        >
          View all
          <ChevronDown className="h-3.5 w-3.5 -rotate-90" />
        </button>
      </div>

      <div className="mt-8 space-y-6">
        {shown.length === 0 ? (
          <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
            No prompt gaps yet — you're holding your own across the tracked prompts.
          </p>
        ) : (
          shown.map((item) => <OpportunityCard key={item.key} item={item} onAiResponse={onAiResponse} />)
        )}
      </div>
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
    <article className="grid min-w-0 grid-cols-[minmax(0,1fr)_56px] overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="min-w-0 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <span className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-[#EEF4FF]">
              <img src={competitorLogo(competitor.host, 64)} alt="" className="h-10 w-10 object-contain" />
            </span>
            <div className="min-w-0">
              <h4 className="truncate text-xl font-semibold leading-6 text-[#1F2937]">{competitor.host}</h4>
              <p className="mt-2 truncate text-sm font-medium text-[#7B8494]">Market Share: {Math.round(competitor.marketShare * 100)}%</p>
            </div>
          </div>
          <span className={`inline-flex h-5 shrink-0 items-center rounded-full border px-2.5 text-[10px] font-medium ${threatStyles}`}>
            {threatLabel}
          </span>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
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
        <ChevronRight className="h-9 w-9" strokeWidth={2.25} />
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
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <h3 className="text-xl font-semibold leading-none text-[#2D4059]">AI-Based Competitor Analysis Results</h3>
        <p className="mt-5 text-sm text-[#7B8494]">Per-competitor performance across the latest run.</p>
      </div>

      <div className="mt-7 grid grid-cols-1 gap-6 xl:grid-cols-2">
        {competitors.length === 0 ? (
          <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500 xl:col-span-2">
            No competitors mentioned in this audit yet. Re-run the audit, or add competitors in the wizard.
          </p>
        ) : (
          competitors.map((c) => (
            <AnalysisResultCard key={c.host} competitor={c} onOpenDetail={onOpenDetail} />
          ))
        )}
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
    <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-xl font-semibold leading-none text-[#2D4059]">Positioning Comparison</h3>
          <p className="mt-5 text-sm text-[#7B8494]">Market share vs sentiment for your tracked competitors.</p>
        </div>
      </div>

      <div className="mt-6">
        {data.length === 0 ? (
          <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-4 py-12 text-center text-sm text-slate-500">
            No competitor positioning data yet.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={360}>
            <ScatterChart margin={{ top: 20, right: 20, bottom: 30, left: 10 }}>
              <CartesianGrid stroke="#EEF1F5" strokeDasharray="2 2" />
              <XAxis
                type="number"
                dataKey="x"
                domain={[0, 100]}
                tick={{ fontSize: 11, fill: '#667085' }}
                label={{ value: 'Market Share %', position: 'insideBottom', offset: -10, fill: '#2D5B93', fontSize: 12 }}
              />
              <YAxis
                type="number"
                dataKey="y"
                domain={[0, 100]}
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
                  const radius = Math.sqrt((payload.z ?? 100) / Math.PI) * 1.2;
                  return (
                    <g>
                      <circle cx={cx} cy={cy} r={radius} fill={payload.color} fillOpacity={0.7} stroke={payload.color} />
                      <text x={cx} y={cy + radius + 12} textAnchor="middle" fontSize={10} fill="#2D4059">{payload.name}</text>
                    </g>
                  );
                }}
              />
            </ScatterChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}

// ── Content opportunities ─────────────────────────────────────────────────

function ContentOpportunityCard({ item }: { item: ReportOpportunity }) {
  const impact = item.trafficPotential === 'very_high' ? 'Very High' : item.trafficPotential === 'high' ? 'High' : item.trafficPotential === 'medium' ? 'Medium' : 'Low';
  const priority = item.severity === 'critical' ? 'Critical' : item.severity === 'high' ? 'High' : item.severity === 'medium' ? 'Medium' : 'Low';
  const relatedTo = item.competitors[0] ?? item.keyword ?? '—';

  return (
    <article className="relative overflow-hidden rounded-lg border border-[#E8ECF2] bg-white px-6 py-5 shadow-[0_8px_18px_rgba(15,23,42,0.06)]">
      <div className="absolute inset-y-0 left-0 w-1.5 bg-[#7EA6FF]" />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h4 className="line-clamp-2 text-base font-semibold text-[#2D4059]">{item.title}</h4>
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
        <GenerateContentButton className="w-full sm:w-auto sm:self-center" />
      </div>
    </article>
  );
}

function ContentOpportunitiesToCreate({ opportunities }: { opportunities: ReportOpportunity[] }) {
  // Use bottom-half (after the 4 surfaced in Prompt Gaps) — same pool, no duplicates.
  const list = opportunities.slice(4, 9);
  return (
    <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-6">
      <div className="flex items-start justify-between gap-4">
        <h3 className="text-xl font-semibold leading-none text-[#2D4059]">Content Opportunities to Create</h3>
      </div>
      <div className="mt-6 space-y-4">
        {list.length === 0 ? (
          <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
            No additional content opportunities right now.
          </p>
        ) : (
          list.map((item) => <ContentOpportunityCard key={item.key} item={item} />)
        )}
      </div>
    </section>
  );
}

// ── Build AiResponseAnalysisData from selected opportunity ─────────────────

function buildAiResponseAnalysis(opp: ReportOpportunity, report: ReportPayload | null): AiResponseAnalysisData {
  const promptIdSet = new Set(opp.promptIds);
  const relevantPrompts = (report?.topPrompts ?? []).filter((p) => p.type === 'prompt' && promptIdSet.has(p.rawId));
  const allResults = relevantPrompts.flatMap((p) => p.results);

  // Mentions / sentiment aggregates
  const competitorMentions = allResults.flatMap((r) => r.competitorMentions ?? []);
  const totalMentions = competitorMentions.reduce((s, m) => s + (m.count ?? 1), 0);
  let positive = 0, negative = 0, neutral = 0;
  for (const m of competitorMentions) {
    if (typeof m.sentiment !== 'number') { neutral += 1; continue; }
    if (m.sentiment > 3) positive += 1;
    else if (m.sentiment < -3) negative += 1;
    else neutral += 1;
  }
  const sentimentTotal = positive + negative + neutral || 1;

  // Competitor ranking — coverage × bestPosition heuristic.
  const compStats = new Map<string, { mentions: number; bestPos: number | null; sentimentSum: number; sentimentCount: number }>();
  for (const m of competitorMentions) {
    const host = m.host?.toLowerCase();
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
  const totalCompMentions = [...compStats.values()].reduce((s, v) => s + v.mentions, 0) || 1;
  const rankings = [...compStats.entries()].slice(0, 8).map(([host, v]) => {
    const share = v.mentions / totalCompMentions; // 0..1
    const score5 = Math.round(share * 5 * 10) / 10; // 0..5 with one decimal
    const avgSentiment = v.sentimentCount > 0 ? v.sentimentSum / v.sentimentCount : 0;
    const status: 'Strong' | 'Medium' | 'Low' = avgSentiment > 3 ? 'Strong' : avgSentiment < -3 ? 'Low' : 'Medium';
    return {
      name: host,
      domain: host,
      logo: competitorLogo(host, 64),
      score: `${score5.toFixed(1)} / 5`,
      status,
      statusTone: (status === 'Strong' ? 'green' : status === 'Low' ? 'red' : 'yellow') as 'green' | 'red' | 'yellow',
      barWidth: Math.max(8, Math.round(share * 100)),
    };
  });
  rankings.sort((a, b) => b.barWidth - a.barWidth);

  // Per-model performance: average presence × normalized sentiment.
  const perModel = new Map<string, { presenceSum: number; count: number; sentimentSum: number; sentimentCount: number }>();
  for (const r of allResults) {
    const m = perModel.get(r.model) ?? { presenceSum: 0, count: 0, sentimentSum: 0, sentimentCount: 0 };
    m.presenceSum += r.presence;
    m.count += 1;
    if (typeof r.sentiment === 'number') {
      m.sentimentSum += r.sentiment;
      m.sentimentCount += 1;
    }
    perModel.set(r.model, m);
  }
  const performance = [...perModel.entries()].map(([name, v]) => {
    const presence = v.count > 0 ? v.presenceSum / v.count : 0; // 0..1
    const sentiment = v.sentimentCount > 0 ? v.sentimentSum / v.sentimentCount : 0; // -10..10
    const score5 = ((presence * 5) + ((sentiment + 10) / 20) * 5) / 2; // average of presence & sentiment-scaled
    return {
      name,
      value: `${score5.toFixed(1)} / 5`,
      barWidth: Math.round((score5 / 5) * 100),
    };
  });

  const insights: string[] = [];
  insights.push(opp.rationale);
  if (opp.recommendedAngle) insights.push(opp.recommendedAngle);
  if (opp.brief?.keyPoints && opp.brief.keyPoints.length > 0) {
    insights.push(`Cover: ${opp.brief.keyPoints.slice(0, 3).join('; ')}`);
  }

  return {
    title: 'AI Response Analysis',
    subtitle: 'Understand how AI interprets each competitor for this prompt cluster.',
    promptLabel: opp.title,
    metrics: [
      { label: 'Total Mentions', value: String(totalMentions), tone: 'blue' },
      { label: 'Positive Sentiment', value: `${Math.round((positive / sentimentTotal) * 100)}%`, tone: 'green' },
      { label: 'Negative Sentiment', value: `${Math.round((negative / sentimentTotal) * 100)}%`, tone: 'red' },
      { label: 'Neutral Sentiment', value: `${Math.round((neutral / sentimentTotal) * 100)}%`, tone: 'blue' },
    ],
    rankings,
    performance,
    insights,
  };
}

// ── Page component ─────────────────────────────────────────────────────────

interface PageState {
  report: ReportPayload | null;
  analysis: CompetitorAnalysisResponse | null;
  trends: TrendsResponse | null;
  selected: SelectedCompetitor[];
}

export default function CompetitorsPage() {
  const navigate = useNavigate();
  const storedSlug = localStorage.getItem('ai-visibility:lastDomainSlug');
  const [allDomains, setAllDomains] = useState<any[]>([]);
  const [currentDomain, setCurrentDomain] = useState<any | null>(null);
  const [state, setState] = useState<PageState>({ report: null, analysis: null, trends: null, selected: [] });
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedCompetitor, setSelectedCompetitor] = useState<CompetitorDetailData | null>(null);
  const [selectedPromptGap, setSelectedPromptGap] = useState<PromptGapContext | null>(null);
  const [selectedAnalysisData, setSelectedAnalysisData] = useState<AiResponseAnalysisData | null>(null);
  const [activeDrawer, setActiveDrawer] = useState<'competitor' | 'prompt-gap' | null>(null);

  // Load domain list + pick current.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const resp = await apiGet<any>('/wizard/domains');
        const domains: any[] = Array.isArray(resp?.domains) ? resp.domains : [];
        if (!alive) return;
        setAllDomains(domains);
        let selected = storedSlug ? domains.find((d) => maskDomainId(d.id) === storedSlug) : null;
        if (!selected && domains.length > 0) {
          selected = [...domains].sort((a, b) => {
            const aT = a.lastAnalyzed ? new Date(a.lastAnalyzed).getTime() : 0;
            const bT = b.lastAnalyzed ? new Date(b.lastAnalyzed).getTime() : 0;
            return bT - aT;
          })[0];
        }
        if (selected && alive) {
          setCurrentDomain(selected);
          localStorage.setItem('ai-visibility:lastDomainSlug', maskDomainId(selected.id));
        }
      } catch (err) {
        console.error('[Competitors] Failed to load domains:', err);
        if (alive) setError('Failed to load domains.');
      }
    })();
    return () => { alive = false; };
  }, [storedSlug]);

  // Load report + competitor-analysis + trends + selected competitors in parallel.
  useEffect(() => {
    if (!currentDomain?.id) return;
    let alive = true;
    setLoading(true);
    setError(null);

    const id = currentDomain.id;
    Promise.all([
      apiGet<ReportPayload>(`/wizard/domain/${id}/report`).catch((e) => { console.warn('[Competitors] /report failed', e); return null; }),
      apiGet<CompetitorAnalysisResponse>(`/wizard/domain/${id}/competitor-analysis`).catch((e) => { console.warn('[Competitors] /competitor-analysis failed', e); return null; }),
      apiGet<TrendsResponse>(`/wizard/domain/${id}/trends`).catch((e) => { console.warn('[Competitors] /trends failed', e); return null; }),
      apiGet<{ competitors: SelectedCompetitor[] }>(`/wizard/domain/${id}/competitors`).catch((e) => { console.warn('[Competitors] /competitors failed', e); return null; }),
    ]).then(([report, analysis, trends, sel]) => {
      if (!alive) return;
      setState({
        report,
        analysis,
        trends,
        selected: sel?.competitors ?? [],
      });
      setLoading(false);
    });

    return () => { alive = false; };
  }, [currentDomain?.id]);

  // Derived metrics for the top cards.
  const headerMetrics = useMemo(() => {
    const visibility = state.report?.metrics.visibilityScore ?? 0;
    const competitorSOV = state.report ? Math.max(0, 100 - state.report.metrics.mentionRate) : 0;

    const analysisCompetitors = state.analysis?.competitors ?? [];
    const bestCompetitor = analysisCompetitors[0] ?? null;
    const bestScore = bestCompetitor ? Math.round(bestCompetitor.coveragePct * 100) : 0;

    let largestGapPct = 0;
    let largestGapPrompt = '';
    if (state.report?.topPrompts) {
      for (const p of state.report.topPrompts) {
        if (p.type !== 'prompt') continue;
        const total = p.results.length;
        if (total === 0) continue;
        const presence = p.results.reduce((s, r) => s + r.presence, 0);
        const ourCov = presence / total;
        let bestCompCov = 0;
        const compHosts = new Set<string>();
        for (const r of p.results) for (const m of r.competitorMentions ?? []) compHosts.add(m.host);
        for (const host of compHosts) {
          const cnt = p.results.filter((r) => (r.competitorMentions ?? []).some((m) => m.host === host)).length;
          bestCompCov = Math.max(bestCompCov, cnt / total);
        }
        const gap = bestCompCov - ourCov;
        if (gap > largestGapPct) {
          largestGapPct = gap;
          largestGapPrompt = p.text;
        }
      }
    }

    const topInsights: string[] = (state.report?.opportunities ?? []).slice(0, 3).map((o) => o.title);

    return {
      visibility,
      competitorSOV,
      bestCompetitorHost: bestCompetitor?.host ?? null,
      bestScore,
      largestGapPct: Math.round(largestGapPct * 100),
      largestGapPrompt,
      topInsights,
    };
  }, [state.report, state.analysis]);

  const visibilityTrend = useMemo(() => {
    if (!state.trends || state.trends.runs.length < 2) return null;
    const runs = state.trends.runs;
    const totalPromptsFor = (r: TrendsResponse['runs'][number]) =>
      Object.values(r.perModel).reduce((s, x) => s + (x?.presenceCount ?? 0), 0);
    const prev = totalPromptsFor(runs[runs.length - 2]);
    const curr = totalPromptsFor(runs[runs.length - 1]);
    if (prev === 0) return null;
    const diff = ((curr - prev) / prev) * 100;
    return { value: `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%`, positive: diff >= 0 };
  }, [state.trends]);

  const closeDrawer = () => {
    setActiveDrawer(null);
    setSelectedCompetitor(null);
    setSelectedPromptGap(null);
    setSelectedAnalysisData(null);
  };

  const openCompetitorDrawer = (c: CompetitorAnalysisRow) => {
    setSelectedPromptGap(null);
    setSelectedAnalysisData(null);
    setSelectedCompetitor(buildCompetitorDetail(c));
    setActiveDrawer('competitor');
  };

  const openPromptGapDrawer = (o: ReportOpportunity) => {
    setSelectedCompetitor(null);
    setSelectedPromptGap(buildPromptGapContext(o));
    setSelectedAnalysisData(buildAiResponseAnalysis(o, state.report));
    setActiveDrawer('prompt-gap');
  };

  const openPromptGapsReport = () => navigate('/ai-results-prompt-gaps');

  const hasRun = state.report?.runStatus === 'completed' && (state.analysis?.runId ?? null) !== null;

  return (
    <AIResultsLayout
      activeItem="competitors"
      allDomains={allDomains}
      currentDomainId={currentDomain?.id}
      currentDomainUrl={currentDomain?.url}
      currentDomainHost={currentDomain?.host}
      currentDomainName={currentDomain?.companyName ?? currentDomain?.host}
      maskedDomainId={currentDomain ? maskDomainId(currentDomain.id) : storedSlug ?? undefined}
      title="Competitors"
    >
      <div className="min-h-0 w-full flex-1 overflow-y-auto bg-white">
        <div className="mx-auto flex w-full max-w-[1530px] flex-col gap-5 px-5 py-3">
          {loading ? (
            <LoadingSkeleton />
          ) : error ? (
            <p className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</p>
          ) : !hasRun ? (
            <EmptyState onRun={() => navigate('/ai-checker-v2')} />
          ) : (
            <>
              <section className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold leading-none text-[#2D4059]">Competitor Analysis</h2>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
                  <ScoreCard
                    title="AI Visibility Score"
                    score={headerMetrics.visibility}
                    maxScore={100}
                    footer="Across all tracked prompts"
                    trend={visibilityTrend ?? undefined}
                  />
                  <ScoreCard
                    title="Best Competitor"
                    score={headerMetrics.bestScore}
                    maxScore={100}
                    footer={headerMetrics.bestCompetitorHost ?? 'Awaiting data'}
                  />
                  <ValueCard
                    title="Largest Gap"
                    value={headerMetrics.largestGapPct > 0 ? `${headerMetrics.largestGapPct}%` : '—'}
                    footer={headerMetrics.largestGapPrompt || 'No gap detected'}
                    badge="Prompt"
                  />
                  <ValueCard
                    title="Competitor SOV"
                    value={`${headerMetrics.competitorSOV}%`}
                    footer="Share of voice held by competitors"
                  />
                  <InsightCard title="Top Insight" items={headerMetrics.topInsights} />
                </div>
              </section>

              <CompetitorSelector competitors={state.selected} onAdd={() => navigate('/ai-checker-v2')} />

              <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.85fr)]">
                <TrendComparisonPanel trends={state.trends} />
                <PromptGapPanel
                  opportunities={state.report?.opportunities ?? []}
                  onAiResponse={openPromptGapDrawer}
                  onViewAll={openPromptGapsReport}
                />
              </div>

              <AICompetitorAnalysisResults
                competitors={state.analysis?.competitors ?? []}
                onOpenDetail={openCompetitorDrawer}
              />

              <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <PositioningComparison analysis={state.analysis} />
                <ContentOpportunitiesToCreate opportunities={state.report?.opportunities ?? []} />
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
          <AiResponseAnalysis data={selectedAnalysisData} prompt={selectedPromptGap} />
        ) : null}
      </Drawer>
    </AIResultsLayout>
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
