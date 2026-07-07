import { Fragment, useEffect, useMemo, useState, type ComponentPropsWithoutRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { apiPatch, apiPost } from "@/services/apiClient";
import { aiResultsKeys, useCampaigns, usePromptHistory } from "@/features/ai-results/queries";
import {
  buildProjectsWorksheetPath,
  openWorksheetInNewTab,
  writeWorksheetHandoff,
  WorksheetPickerModal,
  CreateWorksheetModal,
  type WorksheetOption,
} from "@/features/ai-results/components/WorksheetPickerModals";
import { useToast } from "@/components/ui/use-toast";
import { logoUrl as logoUrlHelper } from "@/lib/logoUrl";
import { TrackToggleButton } from "@/features/ai-results/components/TrackToggleButton";
import ReactMarkdown from "react-markdown";
import {
  AlignLeft,
  ArrowDownRight,
  ArrowUp,
  Bot,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  Filter,
  Globe2,
  Info,
  LayoutGrid,
  Languages,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  Search,
  Zap,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SortableTableHeader } from "@/features/ai-results/components/SortableTableHeader";
import { compareNumbers, compareStrings, type SortState } from "../sort";

export type PromptModelResult = {
  accuracy?: number | null;
  citations?: Array<{ title?: string; url: string; citedText?: string; snippet?: string; content?: string }>;
  competitorHosts?: string[];
  competitorMentions?: Array<{ host?: string; count?: number; rankPosition?: number | null; sentiment?: number | null }>;
  id: string;
  model: string;
  overall?: number | null;
  phrase?: string;
  presence?: number;
  rankPosition?: number | null;
  relevance?: number;
  response?: string;
  sentiment?: number | null;  // null when presence=0 (not mentioned)
  sources?: string[];
  status?: string | null;
};

export type PromptWeekTrend = {
  /** Day-over-day visibility change in percentage points (null if <2 tracked runs). */
  delta: number | null;
  lastVisibility: number;
  points: Array<{ runId: number; startedAt: string; visibility: number }>;
};

export type PromptTableRow = {
  /** Average sentiment ON A 0..10 SCALE — null if no model in this row mentioned the brand. */
  avgSentiment: number | null;
  aiSov?: string | null;
  aiSovPercent?: number | null;
  avgRankPosition?: number | null;
  bestRank: number;
  brandMentionEvents?: number;
  competitorCount: number;
  competitorMentionEvents?: number;
  competitors: string[];
  id: string;
  /** Raw DB id (Prompt.id or Keyword.id). Used to fetch /history for this row. */
  rawId?: number;
  mentions: number;
  phrase: string;
  results: PromptModelResult[];
  rankedResponses?: number;
  rankingPosition?: number | null;
  sov: string;
  successfulResponses?: number;
  totalMentionEvents?: number;
  type: "prompt" | "keyword";
  /** True if the user marked this prompt for daily tracking. */
  isTracked?: boolean;
  /** ISO timestamp of the most recent tracked run that included this prompt. */
  lastTestedAt?: string | null;
  /** ISO timestamp of the next scheduled daily run. */
  nextTestAt?: string | null;
  /** Day-over-day visibility trend (present on tracked-prompt rows). */
  weekTrend?: PromptWeekTrend | null;
  /** Which historical run family should drive the expanded detail chart. */
  historyKind?: "audit" | "weekly";
  /** For keyword rows: the child prompt ids. Tracking a keyword tracks them all. */
  childPromptIds?: number[];
};

type ProcessedPromptResult = PromptModelResult & {
  citations: Array<{ title?: string; url: string; citedText?: string; snippet?: string; content?: string }>;
  displayAccuracy: number | null;
  displayOverall: number | null;
  displayRelevance: number | null;
  displaySentiment: number | null;
  mentioned: boolean;
  presence: number;
  sources: string[];
};

type PromptSortMetric =
  | "prompts"
  | "visibility"
  | "coverage"
  | "ranking"
  | "volume"
  | "sentiment"
  | "trending";

const PROMPT_SORT_LABELS: Record<PromptSortMetric, string> = {
  prompts: "Prompts",
  visibility: "Visibility",
  coverage: "Coverage",
  ranking: "Ranking",
  volume: "Volume",
  sentiment: "Sentiment",
  trending: "Trending",
};

const getPromptSortLabel = (sort: SortState<PromptSortMetric>) => {
  if (!sort) return "Sort";
  return `${PROMPT_SORT_LABELS[sort.metric]} ${sort.direction === "asc" ? "↑" : "↓"}`;
};

// The Figma "Sort" popover exposes four business-friendly options; each maps to
// a real metric we already compute (no invented "impact/gap" numbers — see the
// data-honesty note). Impact = search volume, Trending = day-over-day delta,
// Gap score = lowest visibility first, Brand accuracy = sentiment.
type PromptSortPreset = {
  key: string;
  label: string;
  metric: PromptSortMetric;
  direction: "asc" | "desc";
};

const PROMPT_SORT_PRESETS: PromptSortPreset[] = [
  { key: "impact", label: "Impact", metric: "volume", direction: "desc" },
  { key: "trending", label: "Trending", metric: "trending", direction: "desc" },
  { key: "gap", label: "Gap score", metric: "visibility", direction: "asc" },
  { key: "accuracy", label: "Brand accuracy", metric: "sentiment", direction: "desc" },
];

// The Figma "Filters" popover lists six checkboxes. We only wire the four that
// map to real per-row data; "Prompts"/"Keywords" have no meaning in this
// prompts-only table, so they're rendered disabled rather than faked.
type PromptFilterOption = {
  key: string;
  label: string;
  /** null → shown disabled (no backing data in this view). */
  predicate: ((row: PromptTableRow) => boolean) | null;
};

const PROMPT_FILTER_OPTIONS: PromptFilterOption[] = [
  {
    key: "mention_rate",
    label: "Mention rate",
    predicate: (row) => Number(row.mentions ?? 0) > 0,
  },
  {
    key: "citations",
    label: "Citations",
    predicate: (row) => (row.results ?? []).some((r) => (r.citations?.length ?? 0) > 0),
  },
  { key: "prompts", label: "Prompts", predicate: null },
  { key: "keywords", label: "Keywords", predicate: null },
  {
    key: "gap_score",
    label: "Gap score",
    predicate: (row) => {
      const v = Number.parseFloat(String(row.sov ?? "").replace("%", ""));
      return Number.isFinite(v) && v < 30;
    },
  },
  {
    key: "brand_accuracy",
    label: "Brand accuracy",
    predicate: (row) => typeof row.avgSentiment === "number" && row.avgSentiment >= 7,
  },
];

const CATEGORY_LABELS: Record<string, string> = {
  unbranded_recommendation: "Unbranded recommendation",
  top_n_listicle: "Top-N listicle",
  alternatives_to_competitor: "Alternatives to competitor",
  problem_statement: "Problem statement",
  brand_vs_competitor: "Brand vs competitor",
  branded_trust: "Branded trust",
};

const getPromptCategoryLabel = (category?: string | null) => {
  if (!category) return "Uncategorized";
  return CATEGORY_LABELS[category] ?? category.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
};

const getPromptVisibilityScore = (row: PromptTableRow) => {
  const value = Number.parseFloat(String(row.sov ?? "").replace("%", ""));
  return Number.isFinite(value) ? value : null;
};

const getPromptCoverageScore = (row: PromptTableRow) => {
  const total = getSuccessfulResponseCount(row);
  if (!Number.isFinite(total) || total <= 0) return null;
  return Number(row.mentions ?? 0) / total;
};

const getSuccessfulResponseCount = (row: PromptTableRow) => {
  const direct = Number(row.successfulResponses);
  if (Number.isFinite(direct) && direct >= 0) return direct;
  return (row.results ?? []).filter((result) => result.status !== "failed").length;
};

const getPromptRankingScore = (row: PromptTableRow) => {
  const direct = Number(row.rankingPosition ?? row.bestRank);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const positions = (row.results ?? [])
    .map((result) => Number((result as { rankPosition?: number | null }).rankPosition))
    .filter((position): position is number => Number.isFinite(position) && position > 0);
  return positions.length > 0 ? Math.min(...positions) : null;
};

const getPromptVolumeScore = (row: PromptTableRow) => getSuccessfulResponseCount(row);

const formatRankValue = (value: number | null | undefined) => {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return Number.isInteger(value) ? `#${value}` : `#${value.toFixed(1)}`;
};

// detailGraphData / detailGraphTicks / detailGraphHighlight removed — the
// per-prompt detail chart now derives from the live /history endpoint
// (see PromptVisibilityComparisonGraph below) so a single audit shows one
// honest dot instead of a fabricated 17–24 April series.

const getSentimentColor = (sentiment: string) => {
  const s = sentiment.toLowerCase();
  if (s === "positive") return "bg-[#e6f4ea] text-[#1e8e3e] border border-[#a8dab5]";
  if (s === "neutral") return "bg-blue-50 text-blue-600 border border-blue-200";
  if (s === "negative") return "bg-amber-50 text-amber-600 border border-amber-200";
  return "bg-slate-50 text-slate-500 border border-slate-200";
};

/**
 * Real-asset model icons (PNG/SVG in /report-icons/) — replaces the previous
 * lucide-react placeholder shapes. Falls back to a neutral lucide icon if
 * we hit a model id we don't recognise.
 */
const MODEL_ICON_SRC: Array<{ test: RegExp; src: string }> = [
  { test: /gpt|openai|chatgpt/i, src: "/report-icons/chat-gpt.svg" },
  { test: /claude|anthropic/i,   src: "/report-icons/claude.svg" },
  { test: /google-gre|google.*overview|overview|serpapi/i, src: "/report-icons/google.svg" },
  { test: /gemini/i,      src: "/report-icons/gemini.svg" },
];

/** Human-friendly label for a model id. */
const MODEL_LABELS: Record<string, string> = {
  "gpt-4o-mini": "ChatGPT",
  "openai/gpt-4o-mini": "ChatGPT",
  "claude-3-5-haiku": "Claude",
  "claude-sonnet-4-5": "Claude",
  "anthropic/claude-3.5-haiku": "Claude",
  "gemini-2.0-flash": "Gemini",
  "gemini-1.5-flash": "Gemini",
  "google/gemini-2.0-flash-001": "Gemini",
  "google-gre": "AI Overview",
};

const getModelLabel = (model?: string): string => {
  if (!model) return "Unknown model";
  if (MODEL_LABELS[model]) return MODEL_LABELS[model];
  const lower = model.toLowerCase();
  if (/gpt|openai/.test(lower)) return "ChatGPT";
  if (/claude|anthropic/.test(lower)) return "Claude";
  if (/google-gre|google.*overview|overview|serpapi/.test(lower)) return "AI Overview";
  if (/gemini/.test(lower)) return "Gemini";
  if (/deep/.test(lower)) return "DeepSeek";
  // last resort: humanise the slug
  return model.replace(/[-_/]/g, " ");
};

const getModelIcon = (model?: string, size: "sm" | "md" = "sm") => {
  const px = size === "md" ? "h-5 w-5" : "h-4 w-4";
  if (model) {
    const match = MODEL_ICON_SRC.find((m) => m.test.test(model));
    if (match) {
      return <img src={match.src} alt="" aria-hidden className={`${px} object-contain`} />;
    }
  }
  return <Bot className={`${px} text-slate-400`} />;
};

const getDisplayUrl = (value: string) => {
  try {
    let text = value;
    if (value.startsWith("http")) {
      const url = new URL(value);
      text = url.hostname.replace("www.", "");
      if (url.hostname.includes("google.com")) {
        text = url.searchParams.get("q") || text;
      }
    }
    const decoded = decodeURIComponent(text);
    return decoded.length > 25 ? `${decoded.substring(0, 25)}...` : decoded;
  } catch {
    const decoded = decodeURIComponent(value);
    return decoded.length > 25 ? `${decoded.substring(0, 25)}...` : decoded;
  }
};

const getHref = (value: string) => {
  if (!value) return "#";

  let target = value;
  if (!value.startsWith("http")) {
    if (value.includes(".") && !value.includes(" ") && !value.includes("%20")) {
      target = `https://${value}`;
    } else {
      return `https://www.google.com/search?q=${encodeURIComponent(decodeURIComponent(value))}`;
    }
  }

  try {
    const url = new URL(target);
    if (url.hostname.includes(" ") || url.hostname.includes("%20") || !url.hostname.includes(".")) {
      throw new Error("Invalid hostname");
    }
    url.searchParams.set("utm_source", "searcheo_ai");
    return url.toString();
  } catch {
    const query = value.includes("://") ? value.split("://")[1] : value;
    return `https://www.google.com/search?q=${encodeURIComponent(decodeURIComponent(query))}`;
  }
};

const markdownLinkComponents = {
  a: ({ href, children, ...props }: ComponentPropsWithoutRef<"a">) => {
    const resolvedHref = getHref(typeof href === "string" ? href : "");
    return (
      <a href={resolvedHref} target="_blank" rel="noopener noreferrer" {...props}>
        {children}
      </a>
    );
  },
};

/**
 * Per-model presence rollup for THIS row's results in the current run.
 * Replaces the old hardcoded "ChatGPT 24/100, Gemini 27/100, Claude 16/100"
 * — those numbers were never wired to anything. Now: count how many of this
 * model's responses for this prompt actually mentioned the brand.
 */
const buildModelPresenceRows = (results: ProcessedPromptResult[]) => {
  const byModel = new Map<string, { total: number; mentions: number; failed: number }>();
  for (const r of results) {
    const k = r.model;
    if (!byModel.has(k)) byModel.set(k, { total: 0, mentions: 0, failed: 0 });
    const slot = byModel.get(k)!;
    if (r.status === "failed") {
      slot.failed += 1;
      continue;
    }
    slot.total += 1;
    slot.mentions += r.presence > 0 ? 1 : 0;
  }
  return Array.from(byModel.entries()).map(([model, v]) => ({
    label: getModelLabel(model),
    model,
    score: v.total > 0 ? `${v.mentions}/${v.total}` : v.failed > 0 ? "Failed" : "0/0",
    failed: v.failed,
  }));
};

/**
 * Per-prompt history chart. Fetches /history for this prompt on mount and
 * renders presence-rate% over each completed audit run.
 *   - 0 runs   → empty pill overlay ("No runs yet")
 *   - 1 run    → single dot + "Trend appears after your next audit"
 *   - 2+ runs  → real area chart with auto-scaled Y axis (0..100)
 */
type HistoryRun = {
  runId: number;
  startedAt: string;
  presenceRate: number;
  mentions: number;
  attempted?: number;
  failed?: number;
  total: number;
  avgSentiment?: number | null;
  byModel?: Record<string, { mentions: number; total: number; presenceRate: number }>;
};

// Options for the expanded-graph time-window dropdown ("7 days" button).
// "All time" is the default so the full trend is always visible.
const GRAPH_TIME_WINDOWS: Array<{ label: string; days: number | null }> = [
  { label: "All time", days: null },
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
];

const TRACKED_DETAIL_SLOTS = ["Week 1", "Week 2", "Week 3", "Week 4"];

const formatHistoryDate = (value?: string | Date | null) => {
  if (!value) return "Not tracked";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Not tracked";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

const getLatestHistorySlots = (runs: HistoryRun[]) => {
  const ordered = [...runs]
    .filter((run) => Number.isFinite(new Date(run.startedAt).getTime()))
    .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime())
    .slice(-TRACKED_DETAIL_SLOTS.length);

  return TRACKED_DETAIL_SLOTS.map((label, index) => {
    const run = ordered[index] ?? null;
    const previous = index > 0 ? ordered[index - 1] ?? null : null;
    const delta = run && previous ? run.presenceRate - previous.presenceRate : null;
    return { label, run, delta };
  });
};

const getHistoryRunModels = (run?: HistoryRun | null) => {
  if (!run?.byModel) return [];
  return Object.entries(run.byModel)
    .map(([model, stats]) => ({ model, ...stats }))
    .sort((a, b) => getModelLabel(a.model).localeCompare(getModelLabel(b.model)));
};

const PromptVisibilityComparisonGraph = ({
  results,
  domainId,
  promptRawId,
  rowType,
  trackedView = false,
  historyKind,
  timeWindowDays = null,
  modelFilter = null,
  wide = false,
}: {
  results: ProcessedPromptResult[];
  domainId?: number | null;
  promptRawId?: number | null;
  rowType: "prompt" | "keyword";
  /** When true, the chart shows the tracked recurring series (kind=weekly runs). */
  trackedView?: boolean;
  historyKind?: "audit" | "weekly";
  /** Limit the chart to runs within the last N days (null = all history). */
  timeWindowDays?: number | null;
  /** Plot a single model's presence (raw model key) instead of the aggregate. */
  modelFilter?: string | null;
  /** Expanded tracking graph tab uses the full row width instead of split-panel chrome. */
  wide?: boolean;
}) => {
  // When a single model is selected, scope the per-model summary box to it too.
  const presenceRows = buildModelPresenceRows(results).filter(
    (r) => !modelFilter || r.model === modelFilter,
  );
  // History is fetched through React Query (see usePromptHistory) so collapsing
  // and re-expanding a row is instant and shared across tabs. Same payload
  // shape from the prompt and keyword endpoints; trackedView scopes to tracked
  // recurring runs so the chart is a clean day-over-day series.
  const { data: historyData, isLoading: loadingHistory } = usePromptHistory<{
    runs: HistoryRun[];
  }>(domainId ?? null, promptRawId ?? null, rowType, historyKind ?? (trackedView ? "weekly" : "audit"));
  const history = historyData?.runs ?? [];
  const weeklyHistory = (historyKind ?? (trackedView ? "weekly" : "audit")) === "weekly";

  // Apply the "7 days" time-window filter, then map each run's Y value to the
  // selected model's presence (or the aggregate when no model is chosen).
  const cutoff = timeWindowDays && timeWindowDays > 0
    ? Date.now() - timeWindowDays * 24 * 60 * 60 * 1000
    : null;
  const windowed = cutoff != null
    ? history.filter((h) => new Date(h.startedAt).getTime() >= cutoff)
    : history;
  const scoredWindowed = windowed.filter((h) => h.total > 0);
  const chartData = scoredWindowed.map((h, i) => ({
    x: i,
    presence: modelFilter ? (h.byModel?.[modelFilter]?.presenceRate ?? 0) : h.presenceRate,
    label: new Date(h.startedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    mentions: modelFilter ? (h.byModel?.[modelFilter]?.mentions ?? 0) : h.mentions,
    total: modelFilter ? (h.byModel?.[modelFilter]?.total ?? 0) : h.total,
    attempted: h.attempted ?? h.total,
    failed: h.failed ?? 0,
  }));
  const ticks = chartData.length > 0
    ? [0, Math.floor(chartData.length / 2), chartData.length - 1].filter((v, i, a) => a.indexOf(v) === i)
    : [];
  const lastIdx = chartData.length - 1;
  // Only overlay a message when there's genuinely nothing to plot. A single
  // run IS real data (one dot + the per-model breakdown below), so we render
  // it instead of a "come back after the next audit" pill. A trend line simply
  // needs a 2nd run, which we can't fabricate.
  const emptyMessage = !domainId || !promptRawId
    ? "Open from a tracked domain to see history"
    : loadingHistory
      ? "Loading history…"
      : history.length === 0
        ? (weeklyHistory ? "No daily history yet — runs every day" : "No audit history for this prompt yet")
        : windowed.length === 0
          ? "No runs in this time range"
          : chartData.length === 0
            ? "No successful model responses in this range"
          : null;
  const singleRun = chartData.length === 1 ? chartData[0] : null;

  return (
    <div className={`relative ${wide ? "" : "border-r border-[#e7ebf2] pr-3"}`}>
      {/* Real per-model presence summary — one row per model with the live
          mention/total ratio for this prompt. Falls back to nothing if no
          results were captured. */}
      {presenceRows.length > 0 ? (
        <div className="absolute left-[102px] top-[24px] z-10 w-max rounded-[8px] border border-[#f1f3f7] bg-white px-3 py-2.5 shadow-[0_4px_16px_rgba(15,23,42,0.06)]">
          <p className="text-[11px] font-semibold text-[#1e293b]">Mentioned per model</p>
          <div className="mt-2 space-y-2">
            {presenceRows.map((item) => (
              <div key={item.model} className="flex items-center justify-between gap-5 text-[9px] font-medium text-[#475569]">
                <span className="flex items-center gap-1.5">
                  {getModelIcon(item.model)}
                  {item.label}
                </span>
                <span>{item.score}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
        <div className="relative h-[246px]">
          {singleRun ? (
            <div className="pointer-events-none absolute bottom-3 left-3 z-10 max-w-[260px] rounded-[8px] border border-slate-200 bg-white/95 px-3 py-2 text-[11px] leading-snug text-slate-600 shadow-sm">
              <span className="font-semibold text-slate-800">
                {weeklyHistory ? "Single daily run" : "Single audit run"}: {singleRun.presence}% visibility.
              </span>{" "}
              Trend line appears after the next scored run.
              {singleRun.failed > 0 ? (
                <span className="mt-1 block text-slate-500">
                  {singleRun.failed} failed provider attempt{singleRun.failed === 1 ? "" : "s"} excluded from the denominator.
                </span>
              ) : null}
            </div>
          ) : null}
          {emptyMessage ? (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <span className="rounded-full bg-white/95 border border-slate-200 px-3 py-1.5 text-[11px] text-slate-500 shadow-sm">
              {emptyMessage}
            </span>
          </div>
        ) : null}
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 6, right: 10, left: -18, bottom: 0 }}>
            <defs>
              <linearGradient id="prompt-detail-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#c8d9f3" stopOpacity={0.95} />
                <stop offset="100%" stopColor="#c8d9f3" stopOpacity={0.88} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#dcdfe6" strokeDasharray="2 3" vertical={false} />
            <XAxis
              axisLine={false}
              dataKey="x"
              domain={[0, Math.max(0, chartData.length - 1)]}
              tick={{ fill: "#8d97a6", fontSize: 12 }}
              tickFormatter={(value) => chartData[value]?.label ?? ""}
              tickLine={false}
              ticks={ticks}
              type="number"
            />
            <YAxis axisLine={false} domain={[0, 100]} hide tickLine={false} />
            <ChartTooltip
              cursor={{ stroke: "#83a9da", strokeWidth: 1 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const point = payload[0]?.payload as
                  | {
                      label?: string;
                      presence?: number;
                      mentions?: number;
                      total?: number;
                      attempted?: number;
                      failed?: number;
                    }
                  | undefined;
                if (!point) return null;
                return (
                  <div className="min-w-[190px] rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-[11px] shadow-[0_10px_30px_rgba(15,23,42,0.12)]">
                    <p className="font-semibold text-slate-900">{point.label ?? "Tracked run"}</p>
                    <div className="mt-1 space-y-0.5 text-slate-600">
                      <p>Visibility: <span className="font-semibold text-slate-900">{point.presence ?? 0}%</span></p>
                      <p>Mentions: {point.mentions ?? 0} of {point.total ?? 0} scored responses</p>
                      {point.failed ? <p>Failed provider attempts: {point.failed}</p> : null}
                    </div>
                  </div>
                );
              }}
            />
            <Area dataKey="presence" fill="url(#prompt-detail-fill)" stroke="#83a9da" strokeWidth={1.5} type="monotone" />
            {lastIdx >= 0 ? (
              <ReferenceDot
                fill="#83a9da"
                isFront
                r={chartData.length === 1 ? 6 : 4.5}
                stroke="#83a9da"
                strokeWidth={chartData.length === 1 ? 3 : 1}
                x={lastIdx}
                y={chartData[lastIdx]?.presence ?? 0}
              />
            ) : null}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

/**
 * Single citation card — renders a real link the model returned. Logo
 * comes from logo.dev based on the citation's host so every source has a
 * consistent favicon-style avatar.
 */
type CitationLike = {
  url?: string;
  title?: string | null;
  host?: string | null;
  type?: "direct" | "indirect";
  snippet?: string | null;
  citedText?: string | null;
};

const hostFromCitation = (c: CitationLike): string => {
  if (c.host) return c.host;
  if (!c.url) return "";
  try {
    return new URL(c.url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

const CitationCard = ({ citation }: { citation: CitationLike }) => {
  const host = hostFromCitation(citation);
  const logo = logoUrlHelper(host, 64);
  const title = citation.title?.trim() || host || "Source";
  const blurb = (citation.snippet || citation.citedText || "")?.toString().trim();
  return (
    <a
      href={getHref(citation.url ?? `https://${host}`)}
      target="_blank"
      rel="noreferrer"
      className="group block rounded-[10px] border border-slate-200 bg-white p-3 transition hover:border-slate-300 hover:shadow-sm"
    >
      <div className="flex items-start gap-2.5">
        {logo ? (
          <img
            src={logo}
            alt=""
            aria-hidden
            loading="lazy"
            className="h-7 w-7 shrink-0 rounded-md object-contain bg-slate-50"
            onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
          />
        ) : (
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-slate-50 text-slate-400">
            <Link2 className="h-3.5 w-3.5" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold text-slate-900 leading-snug line-clamp-2">{title}</p>
          {host ? <p className="mt-0.5 text-[10px] text-slate-400">{host}</p> : null}
        </div>
        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-300 transition group-hover:text-blue-500" />
      </div>
      {blurb ? (
        <p className="mt-2 text-[11px] text-slate-500 leading-relaxed line-clamp-2">{blurb}</p>
      ) : null}
      <div className="mt-2 flex items-center gap-1.5">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
            citation.type === "indirect"
              ? "border border-slate-200 bg-slate-50 text-slate-500"
              : "bg-blue-50 text-blue-600"
          }`}
        >
          {citation.type === "indirect" ? "Indirect" : "Direct citation"}
        </span>
      </div>
    </a>
  );
};

/**
 * Per-competitor mention pill. Renders the brand's logo + name; intent is
 * to match the "Direct citation" pill density so the right column feels
 * like one composed list rather than two stacked feeds.
 */
const CompetitorPill = ({ host, name, sentiment }: { host: string; name?: string | null; sentiment?: number | null }) => {
  const logo = logoUrlHelper(host, 64);
  const tone =
    typeof sentiment === "number"
      ? sentiment > 2
        ? "text-emerald-700 bg-emerald-50 border-emerald-200"
        : sentiment < -2
          ? "text-rose-700 bg-rose-50 border-rose-200"
          : "text-slate-700 bg-slate-50 border-slate-200"
      : "text-slate-700 bg-slate-50 border-slate-200";
  return (
    <a
      href={host ? getHref(`https://${host}`) : "#"}
      target="_blank"
      rel="noreferrer"
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition hover:shadow-sm ${tone}`}
    >
      {logo ? (
        <img
          src={logo}
          alt=""
          aria-hidden
          loading="lazy"
          className="h-3.5 w-3.5 rounded-full object-contain"
          onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
        />
      ) : null}
      <span>{name ?? host}</span>
    </a>
  );
};

const PromptAIResponsePanel = ({
  phrase,
  results,
  selectedModel,
  setSelectedModel,
}: {
  phrase: string;
  results: ProcessedPromptResult[];
  selectedModel: string;
  setSelectedModel: (value: string) => void;
}) => {
  const activeResult = results.find((result) => result.model === selectedModel) || results[0];

  if (!activeResult) return null;

  // The scorer attaches per-competitor mentions to each row; types.ts only
  // declares the legacy fields, so we read the extra payload defensively.
  const mentions = ((activeResult as unknown as { competitorMentions?: Array<{ host?: string; name?: string | null; sentiment?: number | null }> }).competitorMentions) ?? [];
  const citations = (activeResult.citations ?? []) as CitationLike[];

  return (
    <div className="flex h-full flex-col rounded-[12px] border border-slate-200 bg-white">
      {/* Header — model picker on the right, prompt title on the left. */}
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">Response</p>
          <p className="truncate text-[13px] font-medium text-slate-700">{phrase}</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="h-8 shrink-0 gap-2 rounded-lg border-slate-200 bg-white px-2.5 text-[12px] font-medium text-slate-600 shadow-none hover:bg-slate-50"
            >
              {getModelIcon(activeResult.model, "sm")}
              <span>{getModelLabel(activeResult.model)}</span>
              <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[180px] p-1">
            {results.map((result) => (
              <DropdownMenuItem
                key={result.id}
                onClick={() => setSelectedModel(result.model)}
                className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-[12px] font-medium ${
                  result.model === selectedModel ? "bg-slate-50" : ""
                }`}
              >
                {getModelIcon(result.model, "sm")}
                {getModelLabel(result.model)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Body — response on the left, citations + competitors on the right.
          Stacks on mobile, side-by-side from `lg` up. */}
      <div className="flex flex-1 flex-col overflow-hidden lg:grid lg:grid-cols-[1.4fr_1fr]">
        <div className="min-h-[260px] flex-1 overflow-y-auto px-4 py-4 lg:max-h-[420px] lg:border-r lg:border-slate-100 custom-scrollbar">
          {activeResult.response?.trim() ? (
            <article className="prose prose-sm prose-slate max-w-none prose-headings:font-semibold prose-headings:text-slate-900 prose-h1:text-[15px] prose-h2:text-[14px] prose-h3:text-[13px] prose-p:text-[13px] prose-p:leading-relaxed prose-p:text-slate-700 prose-li:text-[13px] prose-li:text-slate-700 prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline prose-strong:text-slate-900 prose-code:rounded prose-code:bg-slate-100 prose-code:px-1 prose-code:py-0.5 prose-code:text-[12px] prose-code:font-medium prose-code:text-slate-800">
              <ReactMarkdown components={markdownLinkComponents}>{activeResult.response}</ReactMarkdown>
            </article>
          ) : (
            <p className="text-[13px] italic text-slate-400">
              {activeResult.status === "failed"
                ? activeResult.errorMessage
                  ? `Provider failed: ${activeResult.errorMessage}`
                  : "Provider failed before a response was captured."
                : activeResult.mentioned ? "No response captured." : "This model didn't mention your brand."}
            </p>
          )}
        </div>

        <div className="min-h-[140px] flex-1 overflow-y-auto px-4 py-4 lg:max-h-[420px] custom-scrollbar">
          {mentions.length > 0 ? (
            <section className="mb-4">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">
                Competitors mentioned
              </p>
              <div className="flex flex-wrap gap-1.5">
                {mentions.map((m, i) => (
                  <CompetitorPill key={`${m.host ?? m.name ?? "c"}-${i}`} host={m.host ?? ""} name={m.name ?? null} sentiment={m.sentiment ?? null} />
                ))}
              </div>
            </section>
          ) : null}

          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">
            Sources cited ({citations.length})
          </p>
          {citations.length > 0 ? (
            <div className="flex flex-col gap-2">
              {citations.map((c, i) => (
                <CitationCard key={`${c.url ?? c.host ?? "src"}-${i}`} citation={c} />
              ))}
            </div>
          ) : (
            <p className="text-[12px] italic text-slate-400">No sources cited in this response.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export const PromptExpandedDetails = ({
  results,
  phrase,
  domainId,
  rawId,
  rowType,
  trackedView = false,
  historyKind,
  lastTestedAt,
  nextTestAt,
}: {
  results: PromptModelResult[];
  phrase: string;
  domainId?: number | null;
  rawId?: number | null;
  rowType: "prompt" | "keyword";
  trackedView?: boolean;
  historyKind?: "audit" | "weekly";
  lastTestedAt?: string | null;
  nextTestAt?: string | null;
}) => {
  const fmtDate = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : null;
  const processedResults = useMemo<ProcessedPromptResult[]>(() => {
    const grouped = new Map<string, ProcessedPromptResult>();
    const counts = new Map<string, {
      accuracy: number;
      overall: number;
      relevance: number;
      sentiment: number;
      scored: number;
    }>();

    for (const result of results) {
      const existing = grouped.get(result.model);
      const successful = result.status !== "failed";
      const presence = successful ? result.presence || 0 : 0;
      const mentioned = presence > 0;
      const citations = Array.isArray(result.citations) ? result.citations : [];
      const sources = Array.isArray(result.sources) ? result.sources : [];

      if (!existing) {
        grouped.set(result.model, {
          ...result,
          accuracy: mentioned && typeof result.accuracy === "number" ? result.accuracy : 0,
          citations: [...citations],
          displayAccuracy: mentioned && typeof result.accuracy === "number" ? result.accuracy : null,
          displayOverall: mentioned && typeof result.overall === "number" ? result.overall : null,
          displayRelevance: mentioned && typeof result.relevance === "number" ? result.relevance : null,
          displaySentiment: mentioned && typeof result.sentiment === "number" ? result.sentiment : null,
          mentioned,
          overall: mentioned && typeof result.overall === "number" ? result.overall : 0,
          phrase,
          presence,
          relevance: mentioned && typeof result.relevance === "number" ? result.relevance : 0,
          sentiment: mentioned && typeof result.sentiment === "number" ? result.sentiment : 0,
          sources: [...sources],
        });
        counts.set(result.model, {
          accuracy: mentioned && typeof result.accuracy === "number" ? 1 : 0,
          overall: mentioned && typeof result.overall === "number" ? 1 : 0,
          relevance: mentioned && typeof result.relevance === "number" ? 1 : 0,
          sentiment: mentioned && typeof result.sentiment === "number" ? 1 : 0,
          scored: mentioned ? 1 : 0,
        });
        continue;
      }

      existing.presence += presence;
      if (mentioned) {
        const modelCounts = counts.get(result.model) ?? { accuracy: 0, overall: 0, relevance: 0, sentiment: 0, scored: 0 };
        modelCounts.scored += 1;
        if (typeof result.accuracy === "number") {
          existing.accuracy = (existing.accuracy || 0) + result.accuracy;
          modelCounts.accuracy += 1;
        }
        if (typeof result.overall === "number") {
          existing.overall = (existing.overall || 0) + result.overall;
          modelCounts.overall += 1;
        }
        if (typeof result.relevance === "number") {
          existing.relevance = (existing.relevance || 0) + result.relevance;
          modelCounts.relevance += 1;
        }
        if (typeof result.sentiment === "number") {
          existing.sentiment = (existing.sentiment || 0) + result.sentiment;
          modelCounts.sentiment += 1;
        }
        counts.set(result.model, modelCounts);
      }

      for (const source of sources) {
        if (!existing.sources.includes(source)) {
          existing.sources.push(source);
        }
      }

      for (const citation of citations) {
        if (!existing.citations.find((item) => item.url === citation.url)) {
          existing.citations.push(citation);
        }
      }
    }

    return Array.from(grouped.values()).map((item) => {
      const mentions = item.presence > 0 ? item.presence : 0;
      const modelCounts = counts.get(item.model) ?? { accuracy: 0, overall: 0, relevance: 0, sentiment: 0, scored: 0 };
      return {
        ...item,
        displayAccuracy: modelCounts.accuracy > 0 ? Number(item.accuracy || 0) / modelCounts.accuracy : null,
        displayOverall: modelCounts.overall > 0 ? Number(item.overall || 0) / modelCounts.overall : null,
        displayRelevance: modelCounts.relevance > 0 ? Number(item.relevance || 0) / modelCounts.relevance : null,
        displaySentiment: modelCounts.sentiment > 0 ? Number(item.sentiment || 0) / modelCounts.sentiment : null,
        mentioned: mentions > 0,
      };
    });
  }, [results, phrase]);

  const [selectedModel, setSelectedModel] = useState(processedResults[0]?.model || "");
  useEffect(() => {
    if (processedResults.length === 0) return;
    if (!processedResults.some((result) => result.model === selectedModel)) {
      setSelectedModel(processedResults[0]?.model || "");
    }
  }, [processedResults, selectedModel]);
  // Graph filters driven by the header dropdowns.
  const [windowIdx, setWindowIdx] = useState(0); // default: All time
  const [graphModel, setGraphModel] = useState<string | null>(null); // default: All models
  const graphModelLabel = graphModel ? getModelLabel(graphModel) : "All models";
  const effectiveHistoryKind = historyKind ?? (trackedView ? "weekly" : "audit");
  const weeklyHistory = effectiveHistoryKind === "weekly";
  const [detailTab, setDetailTab] = useState<"table" | "graph">("table");
  const { data: historyData, isLoading: loadingHistory } = usePromptHistory<{
    runs: HistoryRun[];
  }>(domainId ?? null, rawId ?? null, rowType, effectiveHistoryKind);
  const historyRuns = useMemo(() => historyData?.runs ?? [], [historyData?.runs]);
  const historyRunsInWindow = useMemo(() => {
    const days = GRAPH_TIME_WINDOWS[windowIdx].days;
    if (!days) return historyRuns;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return historyRuns.filter((run) => new Date(run.startedAt).getTime() >= cutoff);
  }, [historyRuns, windowIdx]);
  const historySlots = useMemo(() => getLatestHistorySlots(historyRunsInWindow), [historyRunsInWindow]);
  const mentionPills = useMemo(() => buildModelPresenceRows(processedResults), [processedResults]);

  if (processedResults.length === 0) {
    return (
      <div className="bg-[#fcfcfd] px-4 py-4">
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-[15px] font-medium text-[#3f4754]">Detailed prompt analysis</h4>
        </div>
        <div className="rounded-[12px] border border-dashed border-slate-200 bg-white px-4 py-5">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-500">
              <Info className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-slate-700">No model responses saved for this prompt yet</p>
              <p className="mt-1 max-w-[720px] text-[12px] leading-relaxed text-slate-500">
                This prompt is in the inventory, but it has not been analyzed in the current result set. Use Analyze Prompt or include it in the next audit to collect ChatGPT, Claude, and Gemini responses.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white px-4 py-4">
      <div className="rounded-[12px] border border-[#e5ebf4] bg-white p-4 shadow-[0_1px_4px_rgba(15,23,42,0.04)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h4 className="text-[17px] font-semibold text-[#3f4754]">Prompt position trend</h4>
            <p className="mt-2 text-[12px] font-medium text-slate-600">
              Prompt: <span className="font-normal italic text-[#58606f]">{phrase}</span>
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {mentionPills.length > 0 ? (
                mentionPills.map((item) => (
                  <span
                    key={item.model}
                    className="inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-[#d9e2f2] bg-white px-2.5 text-[11px] font-medium text-[#47608a]"
                  >
                    {getModelIcon(item.model, "sm")}
                    {item.label} mentions <span className="font-semibold text-[#2f6bff]">{item.score}</span>
                  </span>
                ))
              ) : (
                <span className="inline-flex h-8 items-center rounded-[8px] border border-dashed border-slate-200 bg-slate-50 px-2.5 text-[11px] text-slate-500">
                  No model mention data
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            {weeklyHistory ? (
              <span className="inline-flex h-8 items-center gap-1.5 rounded-[8px] bg-[#0d7c1c] px-3 text-[11px] font-semibold text-white">
                <Check className="h-3.5 w-3.5" />
                Tracked
              </span>
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="h-8 rounded-[8px] border-[#d7dde7] bg-white px-3 text-[11px] font-medium text-[#717b8b] shadow-none"
                >
                  <Calendar className="mr-1.5 h-3.5 w-3.5" />
                  {GRAPH_TIME_WINDOWS[windowIdx].label}
                  <ChevronDown className="ml-2 h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[140px]">
                {GRAPH_TIME_WINDOWS.map((w, i) => (
                  <DropdownMenuItem
                    key={w.label}
                    onClick={() => setWindowIdx(i)}
                    className={i === windowIdx ? "bg-slate-50" : ""}
                  >
                    {w.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <span className="inline-flex h-8 items-center rounded-[8px] border border-[#d7dde7] bg-white px-3 text-[11px] font-medium text-[#717b8b]">
              {fmtDate(lastTestedAt) ? `Last ${fmtDate(lastTestedAt)}` : "No completed run"}
              {weeklyHistory && fmtDate(nextTestAt) ? ` · Next ${fmtDate(nextTestAt)}` : ""}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="h-8 rounded-[8px] border-[#d7dde7] bg-white px-3 text-[11px] font-medium text-[#717b8b] shadow-none"
                >
                  {graphModelLabel}
                  <ChevronDown className="ml-2 h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[180px] p-1">
                <DropdownMenuItem
                  onClick={() => setGraphModel(null)}
                  className={`rounded-md px-2 py-1.5 text-[12px] font-medium ${graphModel === null ? "bg-slate-50" : ""}`}
                >
                  All models
                </DropdownMenuItem>
                {processedResults.map((result) => (
                  <DropdownMenuItem
                    key={result.model}
                    onClick={() => setGraphModel(result.model)}
                    className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-[12px] font-medium ${
                      result.model === graphModel ? "bg-slate-50" : ""
                    }`}
                  >
                    {getModelIcon(result.model, "sm")}
                    {getModelLabel(result.model)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <div className="inline-flex h-8 rounded-[8px] bg-slate-100 p-0.5">
              {(["table", "graph"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setDetailTab(tab)}
                  className={`rounded-[7px] px-3 text-[11px] font-semibold capitalize transition ${
                    detailTab === tab
                      ? "bg-[#7395dd] text-white shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 border-t border-dashed border-[#e5ebf4] pt-4">
          {detailTab === "table" ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              {historySlots.map(({ label, run, delta }) => {
                const models = getHistoryRunModels(run);
                const tracked = Boolean(run);
                return (
                  <div key={label} className="min-h-[132px] rounded-[12px] border border-[#edf1f7] bg-[#fbfcff] p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-[12px] font-semibold text-[#1f2937]">{label}</p>
                        <p className="mt-1 text-[10px] text-slate-400">{formatHistoryDate(run?.startedAt)}</p>
                      </div>
                      {tracked ? (
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            delta == null || delta >= 0
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-rose-50 text-rose-700"
                          }`}
                        >
                          {delta == null || delta >= 0 ? (
                            <ArrowUp className="h-3 w-3" />
                          ) : (
                            <ArrowDownRight className="h-3 w-3" />
                          )}
                          {delta == null ? "Tracked" : `${Math.abs(delta)}%`}
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                          Not tracked
                        </span>
                      )}
                    </div>
                    {tracked ? (
                      <>
                        <div className="mt-3 flex items-baseline gap-2">
                          <span className="text-[22px] font-semibold leading-none text-[#2d3748]">{run?.presenceRate ?? 0}%</span>
                          <span className="text-[10px] font-medium text-slate-500">
                            {run?.mentions ?? 0}/{run?.total ?? 0} cited
                          </span>
                        </div>
                        <div className="mt-3 space-y-2">
                          {models.length > 0 ? (
                            models.slice(0, 3).map((model) => (
                              <div key={model.model} className="flex items-center justify-between gap-2 text-[10px] text-slate-600">
                                <span className="flex min-w-0 items-center gap-1.5">
                                  {model.presenceRate > 0 ? (
                                    <Check className="h-3.5 w-3.5 shrink-0 rounded-full bg-[#0d7c1c] p-0.5 text-white" />
                                  ) : (
                                    <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-rose-300" />
                                  )}
                                  {getModelIcon(model.model, "sm")}
                                  <span className="truncate">{getModelLabel(model.model)}</span>
                                </span>
                                <span className="shrink-0 font-semibold text-[#47608a]">{model.presenceRate}%</span>
                              </div>
                            ))
                          ) : (
                            <p className="text-[11px] text-slate-400">No per-model breakdown saved.</p>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="mt-6 rounded-[8px] border border-dashed border-slate-200 bg-white px-3 py-4 text-center text-[11px] text-slate-400">
                        {loadingHistory ? "Loading run history..." : "No completed tracked run in this slot."}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-[12px] border border-[#edf1f7] bg-[#fbfcff] p-3">
              <PromptVisibilityComparisonGraph
                results={processedResults}
                domainId={domainId}
                promptRawId={rawId}
                rowType={rowType}
                trackedView={trackedView}
                historyKind={effectiveHistoryKind}
                timeWindowDays={GRAPH_TIME_WINDOWS[windowIdx].days}
                modelFilter={graphModel}
                wide
              />
            </div>
          )}
        </div>

        <div className="mt-4">
          <PromptAIResponsePanel
            phrase={phrase}
            results={processedResults}
            selectedModel={selectedModel}
            setSelectedModel={setSelectedModel}
          />
        </div>
      </div>
    </div>
  );
};

export const PromptTable = ({
  data,
  title = "Top searched Prompts",
  domainId,
  showMonitorAllButton = false,
  showPromptCategoryDropdown = false,
  trackedFilterOnly = false,
}: {
  data: PromptTableRow[];
  title?: string;
  /** Real Domain.id used by the expanded row to fetch /history. */
  domainId?: number | null;
  showMonitorAllButton?: boolean;
  showPromptCategoryDropdown?: boolean;
  /** When true (Prompt Tracking tab), only show tracked rows + daily trends. */
  trackedFilterOnly?: boolean;
}) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Worksheet picker state — the "Draft Blog" (per-row) and "Add to Worksheet"
  // (selection) actions open the picker popup inline on THIS tab instead of
  // navigating to the dashboard. Choosing/creating a worksheet then hands the
  // selection off to the Projects worksheet page (same end behavior as before).
  const campaignsQuery = useCampaigns<{ campaigns: Array<{ id: number; title: string; description?: string | null }> }>();
  const worksheetOptions: WorksheetOption[] = useMemo(
    () =>
      (campaignsQuery.data?.campaigns ?? []).map((c) => ({
        id: String(c.id),
        name: c.title,
        description: c.description ?? null,
      })),
    [campaignsQuery.data],
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerRowIds, setPickerRowIds] = useState<string[]>([]);
  const [activeWorksheetId, setActiveWorksheetId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newWorksheetName, setNewWorksheetName] = useState("");
  const [creatingWorksheet, setCreatingWorksheet] = useState(false);
  const [createWorksheetError, setCreateWorksheetError] = useState<string | null>(null);
  const activeWorksheet = useMemo(
    () => worksheetOptions.find((worksheet) => worksheet.id === activeWorksheetId) ?? null,
    [activeWorksheetId, worksheetOptions]
  );

  // Open the picker for a single row (Draft Blog) or the current selection.
  const navigateToWorksheet = (rowId?: string) => {
    if (!domainId) {
      toast({
        title: "No domain context",
        description: "Domain not loaded yet — try again in a moment.",
        variant: "destructive",
      });
      return;
    }
    const ids = rowId ? [rowId] : Array.from(selectedIds);
    setPickerRowIds(ids);
    setActiveWorksheetId(null);
    setPickerOpen(true);
  };
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Prompt rows whose full text is revealed (click the prompt to toggle).
  const [openPhrases, setOpenPhrases] = useState<Set<string>>(new Set());
  const togglePhrase = (id: string) =>
    setOpenPhrases((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const [tableSort, setTableSort] = useState<SortState<PromptSortMetric>>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const categoryOptions = useMemo(() => {
    const categories = new Set<string>();
    for (const row of data) {
      if (row.type !== "prompt") continue;
      const category = (row as PromptTableRow & { category?: string | null }).category;
      if (category) categories.add(category);
    }
    return Array.from(categories)
      .sort((a, b) => getPromptCategoryLabel(a).localeCompare(getPromptCategoryLabel(b)))
      .map((value) => ({ value, label: getPromptCategoryLabel(value) }));
  }, [data]);
  const toggleTableSort = (metric: PromptSortMetric) => {
    setTableSort((current) => {
      if (current?.metric === metric) {
        return {
          metric,
          direction: current.direction === "asc" ? "desc" : "asc",
        };
      }
      return { metric, direction: "asc" };
    });
  };
  // Page-based pagination with a user-selectable page size ("how many prompts
  // in the table"). Page navigation is predictable for large lists and for rows
  // created via Analyze Prompt.
  const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0]);
  const [currentPage, setCurrentPage] = useState(1);

  // ── Daily tracking ───────────────────────────────────────────────────────
  // Source of truth is row.isTracked from the server; trackOverrides holds the
  // optimistic value so the toggle flips instantly. trackPending disables the
  // button mid-request. selectedIds drives the bulk "Track selected" action.
  const [trackOverrides, setTrackOverrides] = useState<Record<string, boolean>>({});
  const [trackPending, setTrackPending] = useState<Record<string, boolean>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const isRowTracked = (row: PromptTableRow) => trackOverrides[row.id] ?? row.isTracked ?? false;

  useEffect(() => {
    setSelectedIds(new Set());
  }, [categoryFilter]);

  // Clear optimistic overrides when the domain changes (fresh server data).
  useEffect(() => {
    setTrackOverrides({});
    setSelectedIds(new Set());
  }, [domainId]);

  // ── Worksheet hand-off ─────────────────────────────────────────────────────
  // Mirrors the dashboard's "Add to Worksheet" orchestration: shape the chosen
  // rows into the importer payload, stash it for the Projects worksheet page,
  // then navigate there. The picker popup itself now lives on this tab.
  const buildWorksheetRows = (rows: PromptTableRow[]) =>
    rows.map((row) => {
      const r = row as PromptTableRow & {
        keyword?: string;
        keywordIntent?: string;
        prompt?: string;
        text?: string;
      };
      const primaryKeyword =
        row.type === "keyword" ? (r.phrase ?? r.text ?? null) : (r.keyword ?? null);
      const primaryIntent =
        row.type === "keyword" ? (r.intent ?? null) : (r.keywordIntent ?? r.intent ?? null);
      return {
        id: String(row.id),
        prompt: r.phrase ?? r.prompt ?? "",
        type: row.type ?? null,
        primaryKeyword: primaryKeyword || null,
        primaryIntent: primaryIntent || null,
      };
    });

  const pickerRows = useMemo(() => {
    const byId = new Map(data.map((r) => [r.id, r]));
    return pickerRowIds.map((id) => byId.get(id)).filter(Boolean) as PromptTableRow[];
  }, [pickerRowIds, data]);

  const navigateToWorksheetFromPicker = (worksheetId: string) => {
    const payload = {
      activeWorksheetId: worksheetId,
      selectedItemIds: pickerRowIds,
      selectedRows: buildWorksheetRows(pickerRows),
    };
    writeWorksheetHandoff({ worksheetId, importPayload: payload });
    localStorage.setItem("activeTab", "projects");
    navigate(buildProjectsWorksheetPath(worksheetId, activeWorksheet?.name));
  };

  const handleAddToWorksheet = () => {
    if (!activeWorksheetId) return;
    const openedTab = openWorksheetInNewTab(activeWorksheetId, {
      activeWorksheetId,
      selectedItemIds: pickerRowIds,
      selectedRows: buildWorksheetRows(pickerRows),
    }, activeWorksheet?.name);
    if (!openedTab) return;
    localStorage.setItem("activeTab", "projects");
    setPickerOpen(false);
    setActiveWorksheetId(null);
  };

  const handleCreateNewWorksheet = () => {
    setCreateWorksheetError(null);
    setNewWorksheetName("");
    setCreateOpen(true);
  };

  const handleConfirmCreateWorksheet = async () => {
    const name = newWorksheetName.trim();
    if (!name || creatingWorksheet) return;
    setCreatingWorksheet(true);
    setCreateWorksheetError(null);
    try {
      const created = await apiPost<{ campaign?: { id: number; title: string } }>("/campaigns", { title: name });
      const newId = created?.campaign?.id;
      if (!newId) return;
      await queryClient.invalidateQueries({ queryKey: aiResultsKeys.campaigns() });
      setCreateOpen(false);
      setNewWorksheetName("");
      navigateToWorksheetFromPicker(String(newId));
    } catch (err) {
      setCreateWorksheetError("Failed to create worksheet. Please try again.");
    } finally {
      setCreatingWorksheet(false);
    }
  };

  const invalidateTracking = () => {
    if (domainId == null) return;
    queryClient.invalidateQueries({ queryKey: aiResultsKeys.trackedPrompts(domainId) });
    queryClient.invalidateQueries({ queryKey: ["ai-results", "report", domainId] });
  };

  const toggleTracking = async (row: PromptTableRow, next: boolean) => {
    // Prompt rows track themselves; keyword rows track all their child prompts.
    const keywordChildIds = row.type === "keyword" ? row.childPromptIds ?? [] : [];
    const canToggle = row.type === "prompt" ? row.rawId != null : keywordChildIds.length > 0;
    if (domainId == null || !canToggle || trackPending[row.id]) return;
    setTrackOverrides((p) => ({ ...p, [row.id]: next }));
    setTrackPending((p) => ({ ...p, [row.id]: true }));
    try {
      if (row.type === "keyword") {
        await apiPatch<{ updated: number }>(
          `/wizard/domain/${domainId}/prompts/track`,
          { promptIds: keywordChildIds, tracked: next },
        );
      } else {
        await apiPatch<{ prompt: { id: number; isTracked: boolean } }>(
          `/wizard/domain/${domainId}/prompts/${row.rawId}/track`,
          { tracked: next },
        );
      }
      invalidateTracking();
      toast({
        title: next ? "Tracking daily" : "Tracking stopped",
        description: next
          ? "This prompt is re-tested automatically every day."
          : "Removed from daily tests.",
      });
    } catch (err) {
      // Revert the optimistic flip on failure.
      setTrackOverrides((p) => {
        const copy = { ...p };
        delete copy[row.id];
        return copy;
      });
      toast({
        title: "Couldn't update tracking",
        description: err instanceof Error ? err.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setTrackPending((p) => {
        const copy = { ...p };
        delete copy[row.id];
        return copy;
      });
    }
  };

  const [bulkPending, setBulkPending] = useState(false);
  const bulkTrack = async (rows: PromptTableRow[], next: boolean) => {
    if (domainId == null || bulkPending) return;
    // Prompt rows contribute their own id; keyword rows contribute every child.
    const promptIds = Array.from(
      new Set(
        rows.flatMap((r) =>
          r.type === "prompt"
            ? (typeof r.rawId === "number" ? [r.rawId] : [])
            : (r.childPromptIds ?? []),
        ),
      ),
    );
    if (promptIds.length === 0) return;
    setBulkPending(true);
    // Optimistic flip for every affected row.
    setTrackOverrides((p) => {
      const copy = { ...p };
      for (const r of rows) copy[r.id] = next;
      return copy;
    });
    try {
      await apiPatch<{ updated: number }>(
        `/wizard/domain/${domainId}/prompts/track`,
        { promptIds, tracked: next },
      );
      invalidateTracking();
      setSelectedIds(new Set());
      toast({
        title: next ? `Tracking ${promptIds.length} prompt${promptIds.length === 1 ? "" : "s"}` : "Tracking stopped",
        description: next ? "Re-tested automatically every day." : "Removed from daily tests.",
      });
    } catch (err) {
      setTrackOverrides((p) => {
        const copy = { ...p };
        for (const r of rows) delete copy[r.id];
        return copy;
      });
      toast({
        title: "Couldn't update tracking",
        description: err instanceof Error ? err.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setBulkPending(false);
    }
  };

  const toggleRowSelected = (rowId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  };

  // Analyze Prompt state.
  // - `analyzeText` is the input.
  // - `analyzing` flips the button to a spinner + disables it.
  // - `newlyAnalyzedRows` are prompts the user just ran via the button.
  //   They're kept in insertion order (newest first) so they always sort
  //   to the top of the table when no filter is applied.
  // - `pendingRows` are optimistic placeholder rows shown immediately on
  //   submit so the user sees that something is happening; replaced by
  //   real rows once the backend returns.
  const [analyzeText, setAnalyzeText] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [newlyAnalyzedRows, setNewlyAnalyzedRows] = useState<PromptTableRow[]>([]);
  const [pendingRows, setPendingRows] = useState<
    Array<{ id: string; phrase: string }>
  >([]);
  const handleAnalyzePrompt = async () => {
    const text = analyzeText.trim();
    if (!text || analyzing) return;
    if (!domainId) {
      toast({
        title: "No domain context",
        description: "Open a domain's report before analyzing a prompt.",
        variant: "destructive",
      });
      return;
    }
    const optimisticId = `pending-${Date.now()}`;
    setAnalyzing(true);
    setPendingRows((prev) => [{ id: optimisticId, phrase: text }, ...prev]);
    try {
      const res = await apiPost<{
        runId: number;
        prompt: { id: number; keywordId: number | null; text: string };
        row: PromptTableRow;
      }>(`/wizard/domain/${domainId}/prompts/analyze`, { text });
      setNewlyAnalyzedRows((prev) => [res.row, ...prev]);
      setAnalyzeText("");
      toast({
        title: "Prompt analyzed",
        description: `Tracked across ${res.row.results.length} model${res.row.results.length === 1 ? "" : "s"}.`,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not analyze prompt. Try again.";
      toast({
        title: "Analyze failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setPendingRows((prev) => prev.filter((p) => p.id !== optimisticId));
      setAnalyzing(false);
    }
  };

  // Full sorted/filtered list (before pagination).
  const fullSortedData = useMemo(() => {
    let items = [...data].filter((item) => item.type === "prompt");

    // Prompt Tracking tab: only tracked rows (honor optimistic overrides).
    if (trackedFilterOnly) {
      items = items.filter((item) => trackOverrides[item.id] ?? item.isTracked ?? false);
    }
    if (categoryFilter) {
      items = items.filter((item) => (item as PromptTableRow & { category?: string | null }).category === categoryFilter);
    }

    if (tableSort) {
      items.sort((a, b) => {
        switch (tableSort.metric) {
          case "prompts":
            return compareStrings(a.phrase, b.phrase, tableSort.direction);
          case "visibility":
            return compareNumbers(getPromptVisibilityScore(a), getPromptVisibilityScore(b), tableSort.direction);
          case "coverage":
            return compareNumbers(getPromptCoverageScore(a), getPromptCoverageScore(b), tableSort.direction);
          case "ranking":
            return compareNumbers(getPromptRankingScore(a), getPromptRankingScore(b), tableSort.direction);
          case "volume":
            return compareNumbers(getPromptVolumeScore(a), getPromptVolumeScore(b), tableSort.direction);
          case "sentiment":
            return compareNumbers(a.avgSentiment, b.avgSentiment, tableSort.direction);
          case "trending":
            return compareNumbers(a.weekTrend?.delta ?? null, b.weekTrend?.delta ?? null, tableSort.direction);
          default:
            return 0;
        }
      });
    }

    // Dedupe parent rows that match a row we just analyzed — the
    // newly-analyzed copy has the fresher result data and wins.
    const visibleNewlyAnalyzedRows = categoryFilter
      ? newlyAnalyzedRows.filter((row) => (row as PromptTableRow & { category?: string | null }).category === categoryFilter)
      : newlyAnalyzedRows;
    const mergedNewIds = new Set(
      visibleNewlyAnalyzedRows.map((r) => r.rawId).filter((id): id is number => typeof id === "number"),
    );
    const baseItems = items.filter(
      (item) => !(typeof item.rawId === "number" && mergedNewIds.has(item.rawId)),
    );

    // Without a metric sort, newly-analyzed rows pin to the top — that
    // matches the user's expectation that the result they JUST produced
    // is most relevant. With a metric sort, we don't pin (that would
    // lie about the sort order).
    if (!tableSort) {
      return [...visibleNewlyAnalyzedRows, ...baseItems];
    }
    return baseItems;
  }, [categoryFilter, data, tableSort, newlyAnalyzedRows, trackedFilterOnly, trackOverrides]);

  // Figma "Filters" popover — active filter keys, AND-combined against the
  // already-sorted list. Only keys with a real predicate narrow anything.
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());
  const toggleFilter = (key: string) =>
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const filteredData = useMemo(() => {
    const preds = PROMPT_FILTER_OPTIONS.filter(
      (option) => activeFilters.has(option.key) && option.predicate,
    ).map((option) => option.predicate!);
    if (preds.length === 0) return fullSortedData;
    return fullSortedData.filter((row) => preds.every((predicate) => predicate(row)));
  }, [fullSortedData, activeFilters]);

  const totalCount = filteredData.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const pageResetKey = useMemo(
    () => filteredData.map((row) => String(row.id)).join("|"),
    [filteredData],
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [tableSort, categoryFilter, trackedFilterOnly, pageResetKey, pageSize]);
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const displayData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredData.slice(start, start + pageSize);
  }, [filteredData, currentPage, pageSize]);

  // Rows on the current page that are selected (for the bulk action).
  const selectedRows = useMemo(
    () => filteredData.filter((r) => selectedIds.has(r.id)),
    [filteredData, selectedIds],
  );

  return (
    <>
    <Card className="border-none bg-transparent shadow-none">
      <CardHeader className="space-y-4 px-0 pb-6 pt-0">
        <div className="flex flex-wrap items-center justify-between gap-4 w-full">
          <div className="flex flex-col gap-1.5">
            <CardTitle className="text-[20px] font-bold text-[#334155]">{title}</CardTitle>
            <p className="text-[14px] text-[#64748b]">
              Track emerging prompts and understand how AI platforms evaluate content.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="mr-1 flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="h-[38px] w-[38px] rounded-lg border-transparent bg-gray-50 hover:bg-gray-100"
              >
                <Languages className="h-[18px] w-[18px] text-slate-600" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-[38px] w-[38px] rounded-lg border-transparent bg-gray-50 hover:bg-gray-100"
              >
                <Download className="h-[18px] w-[18px] text-slate-600" />
              </Button>
            </div>

            <Button
              variant="outline"
              disabled
              className="h-[38px] gap-2 rounded-lg border-slate-200 px-3 text-slate-500 shadow-none disabled:cursor-default disabled:opacity-100"
            >
              <Calendar className="h-[16px] w-[16px]" />
              <span className="text-[13px] font-medium">Current result set</span>
            </Button>

            {/* Filters popover (funnel) — multi-select, stays open while checking. */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="relative h-[38px] w-[38px] rounded-lg border-slate-200 text-slate-600 shadow-none hover:bg-gray-50"
                  aria-label="Filters"
                >
                  <Filter className="h-[16px] w-[16px]" />
                  {activeFilters.size > 0 ? (
                    <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#4b6eb8] px-1 text-[9px] font-semibold text-white">
                      {activeFilters.size}
                    </span>
                  ) : null}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[240px] p-0">
                <div className="flex items-center justify-between px-3 py-2.5">
                  <span className="text-[13px] font-semibold text-slate-700">Filters</span>
                  <button
                    type="button"
                    onClick={() => setActiveFilters(new Set())}
                    className="text-[11px] font-medium text-slate-400 transition hover:text-slate-600"
                  >
                    Clear All
                  </button>
                </div>
                <DropdownMenuSeparator className="my-0" />
                <div className="p-1.5">
                  {PROMPT_FILTER_OPTIONS.map((option) => {
                    const disabled = option.predicate == null;
                    const checked = activeFilters.has(option.key);
                    return (
                      <DropdownMenuItem
                        key={option.key}
                        disabled={disabled}
                        onSelect={(event) => {
                          event.preventDefault();
                          if (!disabled) toggleFilter(option.key);
                        }}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[12px]"
                      >
                        <span
                          className={`flex h-4 w-4 items-center justify-center rounded border ${
                            checked ? "border-[#4b6eb8] bg-[#4b6eb8] text-white" : "border-slate-300 bg-white"
                          }`}
                        >
                          {checked ? <Check className="h-3 w-3" /> : null}
                        </span>
                        <span className={disabled ? "text-slate-400" : "text-slate-700"}>
                          {option.label}
                          {disabled ? <span className="ml-1 text-[10px] text-slate-400">(n/a here)</span> : null}
                        </span>
                      </DropdownMenuItem>
                    );
                  })}
                </div>
                <DropdownMenuSeparator className="my-0" />
                <div className="px-3 py-2 text-[11px] font-medium text-slate-500">
                  Selected ({activeFilters.size})
                </div>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Sort popover (sliders) — single choice, maps to a real metric. */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-[38px] gap-2 rounded-lg border-slate-200 px-3 text-slate-600 shadow-none hover:bg-gray-50">
                  <AlignLeft className="h-[16px] w-[16px]" />
                  <span className="text-[13px] font-medium">{getPromptSortLabel(tableSort)}</span>
                  <ChevronDown className="ml-1 h-3.5 w-3.5 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[190px] p-1">
                <div className="px-2 py-1.5 text-[13px] font-semibold text-slate-700">Sort</div>
                <DropdownMenuSeparator />
                {PROMPT_SORT_PRESETS.map((preset) => {
                  const active = tableSort?.metric === preset.metric && tableSort?.direction === preset.direction;
                  return (
                    <DropdownMenuItem
                      key={preset.key}
                      onClick={() => setTableSort({ metric: preset.metric, direction: preset.direction })}
                      className="flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-[12px]"
                    >
                      {preset.label}
                      {active ? <Check className="h-3.5 w-3.5 text-blue-600" /> : null}
                    </DropdownMenuItem>
                  );
                })}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setTableSort(null)}
                  className="cursor-pointer rounded-md px-2 py-1.5 text-[12px] text-slate-500"
                >
                  Default order
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                onClick={() => navigateToWorksheet()}
                className="h-[38px] gap-2 rounded-lg border-none bg-[#2d3748] px-4 text-white shadow-none transition-all hover:bg-[#1a202c]"
              >
                <LayoutGrid className="h-4 w-4" />
                <span className="text-[13px] font-medium">Add to Worksheet</span>
              </Button>

              {selectedRows.length > 0 ? (
                <Button
                  type="button"
                  onClick={() => void bulkTrack(selectedRows, true)}
                  disabled={bulkPending}
                  className="h-[38px] gap-2 rounded-lg border-none bg-[#4b6eb8] px-4 text-white shadow-none transition-all hover:bg-[#3f5d9c] disabled:opacity-60"
                >
                  {bulkPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  <span className="text-[13px] font-medium">Track selected ({selectedRows.length})</span>
                </Button>
              ) : showMonitorAllButton ? (
                <Button
                  type="button"
                  onClick={() => void bulkTrack(fullSortedData, true)}
                  disabled={bulkPending}
                  className="h-[38px] gap-2 rounded-[8px] border-0 bg-[linear-gradient(90deg,#2D4059_0%,#4C74C2_100%)] px-4 text-white shadow-[0_1px_2px_0_rgba(16,24,40,0.05)] transition-all hover:brightness-95 disabled:opacity-60"
                >
                  {bulkPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <img
                      src="/report-icons/target-03.svg"
                      alt=""
                      aria-hidden="true"
                      className="h-4 w-4 shrink-0 object-contain"
                    />
                  )}
                  <span className="text-[13px] font-medium">Track all</span>
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="grid w-full grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <div className="relative w-[320px] max-w-full shrink-0">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Enter your custom prompt to track"
              value={analyzeText}
              onChange={(e) => setAnalyzeText(e.target.value)}
              disabled={analyzing}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleAnalyzePrompt();
                }
              }}
              className="h-[38px] w-full rounded-lg border border-slate-200 pl-10 pr-4 text-[13px] outline-none transition-all placeholder:text-gray-400 focus:border-slate-300 focus:ring-1 focus:ring-slate-300 disabled:bg-slate-50 disabled:cursor-not-allowed"
            />
          </div>

          <Button
            type="button"
            onClick={() => void handleAnalyzePrompt()}
            disabled={analyzing || !analyzeText.trim()}
            className="h-[38px] shrink-0 gap-1.5 rounded-lg bg-[#4b6eb8] px-4 text-white transition-all hover:bg-[#3f5d9c] disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {analyzing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-[13px] font-medium">Analyzing…</span>
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" />
                <span className="text-[13px] font-medium">Analyze Prompt</span>
              </>
            )}
          </Button>

          </div>

          {showPromptCategoryDropdown ? (
            <div className="justify-self-start lg:justify-self-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    className="h-[38px] gap-2 rounded-lg border-slate-200 px-3 text-slate-600 shadow-none hover:bg-gray-50"
                  >
                    <LayoutGrid className="h-[16px] w-[16px]" />
                    <span className="text-[13px] font-medium">
                      {categoryFilter ? getPromptCategoryLabel(categoryFilter) : "All Categories"}
                    </span>
                    <ChevronDown className="ml-1 h-3.5 w-3.5 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-[220px]">
                  <DropdownMenuItem onClick={() => setCategoryFilter(null)}>
                    All Categories
                  </DropdownMenuItem>
                  {categoryOptions.length === 0 ? (
                    <DropdownMenuItem disabled>No categories in this data</DropdownMenuItem>
                  ) : (
                    categoryOptions.map((category) => (
                      <DropdownMenuItem
                        key={category.value}
                        onClick={() => setCategoryFilter(category.value)}
                        className={categoryFilter === category.value ? "bg-slate-50" : ""}
                      >
                        {category.label}
                      </DropdownMenuItem>
                    ))
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="px-0 pb-3">
        <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-gray-200">
              <Table>
            <TableHeader>
              <TableRow className="border-b-0 bg-[#f1f1f1] hover:bg-[#f1f1f1]">
                <TableHead className="w-8 px-4 rounded-tl-lg">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 rounded border-gray-300 accent-blue-600"
                    aria-label="Select all on this page"
                    checked={displayData.length > 0 && displayData.every((r) => selectedIds.has(r.id))}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setSelectedIds((prev) => {
                        const next = new Set(prev);
                        for (const r of displayData) {
                          if (checked) next.add(r.id);
                          else next.delete(r.id);
                        }
                        return next;
                      });
                    }}
                  />
                </TableHead>
                <TableHead className="px-2 text-[11px] font-semibold text-[#31415f]">
                  <SortableTableHeader
                    label="Prompts"
                    tooltip={<Info className="h-[10px] w-[10px] text-slate-400" />}
                    activeDirection={tableSort?.metric === "prompts" ? tableSort.direction : null}
                    onToggleSort={() => toggleTableSort("prompts")}
                  />
                </TableHead>
                <TableHead className="px-2 text-[11px] font-semibold text-[#31415f]">
                  <SortableTableHeader
                    label="Ranking"
                    tooltip={<Info className="h-[10px] w-[10px] text-slate-400" />}
                    activeDirection={tableSort?.metric === "ranking" ? tableSort.direction : null}
                    onToggleSort={() => toggleTableSort("ranking")}
                  />
                </TableHead>
                <TableHead className="px-2 text-[11px] font-semibold text-[#31415f]">
                  <SortableTableHeader
                    label="Volume"
                    tooltip={<Info className="h-[10px] w-[10px] text-slate-400" />}
                    activeDirection={tableSort?.metric === "volume" ? tableSort.direction : null}
                    onToggleSort={() => toggleTableSort("volume")}
                  />
                </TableHead>
                <TableHead className="px-2 text-[11px] font-semibold text-[#31415f]">
                  <SortableTableHeader
                    label="Coverage"
                    tooltip={<Info className="h-[10px] w-[10px] text-slate-400" />}
                    activeDirection={tableSort?.metric === "coverage" ? tableSort.direction : null}
                    onToggleSort={() => toggleTableSort("coverage")}
                  />
                </TableHead>
                <TableHead className="px-2 text-[11px] font-semibold text-[#31415f]">
                  <SortableTableHeader
                    label="Visibility"
                    tooltip={<Info className="h-[10px] w-[10px] text-slate-400" />}
                    activeDirection={tableSort?.metric === "visibility" ? tableSort.direction : null}
                    onToggleSort={() => toggleTableSort("visibility")}
                  />
                </TableHead>
                <TableHead className="px-2 text-[11px] font-semibold text-[#31415f]">
                  <SortableTableHeader
                    label="Sentiment"
                    tooltip={<Info className="h-[10px] w-[10px] text-slate-400" />}
                    activeDirection={tableSort?.metric === "sentiment" ? tableSort.direction : null}
                    onToggleSort={() => toggleTableSort("sentiment")}
                  />
                </TableHead>
                <TableHead className="px-2 text-[11px] font-semibold text-[#31415f]">
                  <div className="flex items-center gap-1">
                    Model <Info className="h-[10px] w-[10px] text-slate-400" />
                  </div>
                </TableHead>
                <TableHead className="px-4 text-right text-[11px] font-semibold text-[#31415f] rounded-tr-lg">
                  <div className="flex items-center justify-end gap-1">
                    Action <Info className="h-[10px] w-[10px] text-slate-400" />
                  </div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {/*
                Optimistic skeleton rows for prompts currently being
                analyzed. Rendered above real rows so the user sees
                immediate feedback. Removed when the backend responds
                (the real row gets prepended via newlyAnalyzedRows).
                Matches the table's design system — Loader2 spinner
                inline, slate-50 row background, slate-400 muted text.
              */}
              {pendingRows.map((p) => (
                <TableRow
                  key={p.id}
                  className="border-b border-slate-200 bg-slate-50/60"
                >
                  <TableCell className="w-8 px-4 py-3">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
                  </TableCell>
                  <TableCell className="max-w-[340px] px-2 py-3">
                    <div className="flex flex-col gap-1">
                      <span className="truncate text-[12px] italic text-slate-500">
                        {p.phrase}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        Asking ChatGPT, Claude, and Gemini…
                      </span>
                    </div>
                  </TableCell>
                  <TableCell colSpan={7} className="px-2 py-3">
                    <div className="flex items-center gap-2 text-[12px] font-light text-slate-400">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Running across models — typically 15–30s
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {displayData.map((row) => (
                <Fragment key={row.id}>
                  <TableRow
                    className={`group border-b transition-all duration-200 hover:bg-slate-50/80 ${
                      expandedId === row.id ? "border-slate-300 bg-slate-50 shadow-sm" : "border-slate-200"
                    }${isRowTracked(row) ? " border-l-[3px] border-l-[#7f9fe8]" : ""}`}
                  >
                    <TableCell className="w-8 px-4 py-3">
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 rounded border-gray-300 accent-blue-600"
                        aria-label="Select prompt"
                        checked={selectedIds.has(row.id)}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => toggleRowSelected(row.id)}
                      />
                    </TableCell>
                    <TableCell className="max-w-[340px] px-2 py-2">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            aria-label={expandedId === row.id ? "Collapse row details" : "Expand row details"}
                            aria-expanded={expandedId === row.id}
                            onClick={(event) => {
                              event.stopPropagation();
                              setExpandedId(expandedId === row.id ? null : row.id);
                            }}
                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] bg-[#f8f9fc] border border-slate-200 text-slate-500 hover:bg-slate-100 transition-colors"
                          >
                            {expandedId === row.id ? (
                              <ChevronDown className="h-[14px] w-[14px]" />
                            ) : (
                              <ChevronRight className="h-[14px] w-[14px]" />
                            )}
                          </button>
                          <span
                            onClick={(event) => {
                              event.stopPropagation();
                              togglePhrase(row.id);
                            }}
                            title={openPhrases.has(row.id) ? "Click to collapse" : "Click to show full prompt"}
                            className={`cursor-pointer text-[12px] text-[#58606f] italic ${
                              openPhrases.has(row.id) ? "whitespace-normal break-words" : "truncate"
                            }`}
                          >
                            {row.phrase}
                          </span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="px-2 py-3 text-[11px] font-medium text-slate-600">
                      {/* Ranking column with three honest states:
                          1. Brand IS in a ranked list (rankPosition > 0) → "#N" (best)
                          2. Brand mentioned but never in a ranked list → "Mentioned"
                             (most prose AI responses fall here)
                          3. Brand not mentioned anywhere → "—"
                          Previous version collapsed cases 2 + 3 into a single
                          "—" which made the column look uniformly broken. */}
                      {(() => {
                        const formatted = formatRankValue(getPromptRankingScore(row));
                        if (formatted) return <span>{formatted}</span>;
                        if (row.mentions > 0) {
                          return <span className="text-emerald-600">Mentioned</span>;
                        }
                        return <span className="text-slate-400">—</span>;
                      })()}
                    </TableCell>
                    <TableCell className="px-2 py-3">
                      <span className="text-[11px] font-medium text-slate-600">
                        {getSuccessfulResponseCount(row) || "—"}
                      </span>
                    </TableCell>
                    <TableCell className="px-2 py-3">
                      {/* Coverage = how many models out of total mentioned the brand */}
                      {(() => {
                        const successfulResponses = getSuccessfulResponseCount(row);
                        const fullCoverage = successfulResponses > 0 && row.mentions === successfulResponses;
                        return (
                      <Badge
                        variant="outline"
                        className={`rounded-full px-2.5 py-[2px] text-[10px] font-medium tracking-normal shadow-sm ${
                          row.mentions === 0
                            ? "border-slate-200 bg-slate-50 text-slate-500"
                            : fullCoverage
                              ? "border-[#a8dab5] bg-[#e6f4ea] text-[#1e8e3e]"
                              : "border-amber-200 bg-amber-50 text-amber-700"
                        }`}
                      >
                        {successfulResponses === 0
                          ? "No scored models"
                          : row.mentions === 0
                            ? `0 of ${successfulResponses}`
                            : `${row.mentions}/${successfulResponses} models`}
                      </Badge>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="px-2 py-3 text-[11px] font-medium text-slate-600">
                      <span className="inline-flex items-center gap-1">
                        {row.sov}
                        {(() => {
                          const delta = row.weekTrend?.delta;
                          if (typeof delta !== "number" || delta === 0) return null;
                          const up = delta > 0;
                          return (
                            <span className={`inline-flex items-center text-[10px] font-semibold ${up ? "text-emerald-600" : "text-rose-600"}`}>
                              {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                              {Math.abs(delta)}%
                            </span>
                          );
                        })()}
                      </span>
                    </TableCell>
                    <TableCell className="px-2 py-3">
                      {row.avgSentiment === null ? (
                        <span
                          title={row.mentions > 0 ? "Brand was mentioned, but sentiment was not scored for this prompt." : "Brand was not mentioned for this prompt."}
                          className="text-[10px] font-medium text-slate-400 italic"
                        >
                          {row.mentions > 0 ? "No sentiment" : "Not mentioned"}
                        </span>
                      ) : (
                        <Badge
                          variant="outline"
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${getSentimentColor(
                            row.avgSentiment > 7 ? "Positive" : row.avgSentiment >= 4 ? "Neutral" : "Negative"
                          )}`}
                        >
                          {row.avgSentiment > 7 ? "Positive" : row.avgSentiment >= 4 ? "Neutral" : "Negative"}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="px-2 py-3">
                      <div className="flex items-center gap-1">
                        {(() => {
                          const models = Array.from(
                            new Set(
                              (row.results ?? [])
                                .filter((result) => result.status !== "failed" && result.model)
                                .map((result) => result.model),
                            ),
                          );
                          if (models.length === 0) return <span className="text-[11px] text-slate-400">—</span>;
                          return models.slice(0, 3).map((model) => (
                            <span key={model} title={getModelLabel(model)}>
                              {getModelIcon(model)}
                            </span>
                          ));
                        })()}
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <TrackToggleButton
                          tracked={isRowTracked(row)}
                          loading={trackPending[row.id]}
                          disabled={
                            row.type === "prompt"
                              ? row.rawId == null
                              : (row.childPromptIds?.length ?? 0) === 0
                          }
                          onClick={(e) => {
                            e.stopPropagation();
                            void toggleTracking(row, !isRowTracked(row));
                          }}
                        />

                        <Button
                          type="button"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigateToWorksheet(row.id);
                          }}
                          className="h-[38px] rounded-[14px] border-[#e8eef8] bg-[#eff4ff] px-3.5 text-[11px] font-semibold text-[#3b5d9c] shadow-none hover:bg-[#e7efff]"
                        >
                          <FileText className="mr-1.5 h-3.5 w-3.5" />
                          Draft Blog
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  {expandedId === row.id ? (
                    <TableRow className="border-b border-slate-300 bg-white hover:bg-white">
                      <TableCell colSpan={9} className="p-0">
                        <PromptExpandedDetails
                          results={row.results}
                          phrase={row.phrase}
                          domainId={domainId}
                          rawId={row.rawId}
                          rowType={row.type}
                          trackedView={trackedFilterOnly}
                          historyKind={row.historyKind}
                          lastTestedAt={row.lastTestedAt}
                          nextTestAt={row.nextTestAt}
                        />
                      </TableCell>
                    </TableRow>
                  ) : null}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="mt-2 flex flex-col gap-3 border-t border-slate-200 px-6 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-medium tracking-tight text-gray-500">
              {totalCount === 0
                ? "No rows"
                : `Showing ${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, totalCount)} of ${totalCount}`}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex h-7 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-medium text-slate-600 transition-colors hover:bg-slate-50"
                  aria-label="Rows per page"
                >
                  {pageSize} / page
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[120px]">
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <DropdownMenuItem
                    key={size}
                    onClick={() => setPageSize(size)}
                    className={size === pageSize ? "bg-slate-50" : ""}
                  >
                    {size} / page
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Prev
            </button>
            <span className="px-2 text-[11px] font-medium text-slate-500 tabular-nums">
              {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </CardContent>
    </Card>

    <WorksheetPickerModal
      open={pickerOpen}
      selectedCount={pickerRowIds.length}
      activeWorksheetId={activeWorksheetId}
      worksheets={worksheetOptions}
      loading={campaignsQuery.isLoading}
      onOpenChange={setPickerOpen}
      onWorksheetSelect={setActiveWorksheetId}
      onAddToWorksheet={handleAddToWorksheet}
      onCreateNewWorksheet={handleCreateNewWorksheet}
    />
    <CreateWorksheetModal
      open={createOpen}
      name={newWorksheetName}
      isSubmitting={creatingWorksheet}
      error={createWorksheetError}
      onOpenChange={setCreateOpen}
      onNameChange={setNewWorksheetName}
      onSubmit={handleConfirmCreateWorksheet}
    />
    </>
  );
};
