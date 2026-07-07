import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  ArrowDownRight,
  ArrowUpRight,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  Filter,
  Info,
  LayoutGrid,
  Loader2,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
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
import { TrackToggleButton } from "@/features/ai-results/components/TrackToggleButton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { PromptExpandedDetails, PromptTable, type PromptTableRow } from "@/features/ai-results/components/PromptTrackingTable";
import {
  buildProjectsWorksheetPath,
  CreateWorksheetModal,
  openWorksheetInNewTab,
  WorksheetPickerModal,
  writeWorksheetHandoff,
  type WorksheetOption,
} from "@/features/ai-results/components/WorksheetPickerModals";
import { useShellContext } from "@/features/ai-results/AIResultsShell";
import { aiResultsKeys, useCampaigns, useReport, useTrackedPrompts } from "@/features/ai-results/queries";
import { apiGet, apiPatch, apiPost } from "@/services/apiClient";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

type PromptsTabId = "all-prompts" | "prompt-tracking" | "content-opportunities";

type PromptContentOpportunity = {
  key: string;
  title: string;
  severity?: "critical" | "high" | "medium" | "low" | string | null;
  severityScore?: number | null;
  trafficPotential?: "very_high" | "high" | "medium" | "low" | string | null;
  category?: string | null;
  keyword?: string | null;
  competitors?: string[];
  rationale?: string | null;
  recommendedAngle?: string | null;
  brief?: {
    audience?: string | null;
    keyPoints?: string[];
    structure?: string | null;
  } | null;
};

type MetricCardConfig = {
  label: string;
  tooltip: string;
  subtitle: string;
  value: string;
  trend: string;
  tone: "positive" | "warning" | "negative";
  valueClassName: string;
  showTrend?: boolean;
};

type PromptTabConfig =
  | {
      kind: "cards";
      kpis: MetricCardConfig[];
    }
  | {
      kind: "tracking";
      summaryCards: MetricCardConfig[];
    };

type PerformanceRange = "daily" | "monthly" | "quarterly";

type PerformanceRowConfig = {
  label: string;
  value: string;
  percent: number;
  barClassName: string;
};

type PerformanceConfig = {
  title: string;
  tooltip: string;
  toggle: Array<{ id: PerformanceRange; label: string }>;
};

// The Trending Prompts table + KPI cards now live inside the Content
// Opportunities tab (Figma merge), so the standalone "All Prompts" tab is gone.
const PROMPT_TABS: Array<{ id: PromptsTabId; label: string }> = [
  { id: "content-opportunities", label: "Content Opportunities" },
  { id: "prompt-tracking", label: "Tracked Prompts" },
];

const METRIC_CARDS: MetricCardConfig[] = [
  {
    label: "New Prompt Opportunities",
    tooltip: "How many new prompts were added to the current list.",
    subtitle: "New Prompts added",
    value: "0",
    trend: "",
    tone: "positive",
    valueClassName: "text-[#2f6bff]",
    showTrend: false,
  },
  {
    label: "Tracked Prompts",
    tooltip: "How many prompts are currently being monitored.",
    subtitle: "Prompts tracked",
    value: "0",
    trend: "",
    tone: "positive",
    valueClassName: "text-[#2f6bff]",
    showTrend: false,
  },
  {
    label: "Competitive Visibility Gaps",
    tooltip: "Prompts where coverage is weaker than expected this week.",
    subtitle: "This week",
    value: "0",
    trend: "",
    tone: "positive",
    valueClassName: "text-[#2f6bff]",
    showTrend: false,
  },
  {
    label: "Visibility Drops",
    tooltip: "Tracked prompts whose visibility declined compared with the previous daily run.",
    subtitle: "Tracked prompts down",
    value: "0",
    trend: "",
    tone: "negative",
    valueClassName: "text-[#B23131]",
    showTrend: false,
  },
];

const TAB_CONFIGS: Record<PromptsTabId, PromptTabConfig> = {
  "all-prompts": {
    kind: "cards",
    kpis: METRIC_CARDS,
  },
  "prompt-tracking": {
    kind: "tracking",
    summaryCards: [
      {
        label: "Monitored Prompts",
        tooltip: "Total prompts currently tracked in this workspace.",
        subtitle: "Prompts tracked",
        value: "0",
        trend: "",
        tone: "positive",
        valueClassName: "text-[#2f6bff]",
        showTrend: false,
      },
      {
        label: "Average Visibility",
        tooltip: "Average visibility across all AI models.",
        subtitle: "Across all AI models",
        value: "0%",
        trend: "",
        tone: "positive",
        valueClassName: "text-[#2f6bff]",
        showTrend: false,
      },
      {
        label: "Prompts Gained",
        tooltip: "The share of prompts that improved since the previous daily run.",
        subtitle: "Daily trend",
        value: "0",
        trend: "",
        tone: "positive",
        valueClassName: "text-[#2f6bff]",
        showTrend: false,
      },
      {
        label: "Prompts Lost",
        tooltip: "Prompt rows that dropped from results.",
        subtitle: "Prompts dropped from results",
        value: "0",
        trend: "",
        tone: "negative",
        valueClassName: "text-[#c81e1e]",
        showTrend: false,
      },
    ],
  },
  "content-opportunities": {
    kind: "cards",
    kpis: [
      {
        label: "Content Gaps Found",
        tooltip: "How many content opportunities are missing coverage.",
        subtitle: "Missing content opportunities",
        value: "0",
        trend: "",
        tone: "positive",
        valueClassName: "text-[#2f6bff]",
        showTrend: false,
      },
      {
        label: "Content Ideas Ready",
        tooltip: "High-confidence content opportunities ready to work on.",
        subtitle: "Ready to review",
        value: "0",
        trend: "",
        tone: "positive",
        valueClassName: "text-[#2f6bff]",
        showTrend: false,
      },
      {
        label: "Content Drafts Ready",
        tooltip: "Content opportunities ready to turn into drafts.",
        subtitle: "Ready to brief",
        value: "0",
        trend: "",
        tone: "warning",
        valueClassName: "text-[#b45309]",
        showTrend: false,
      },
      {
        label: "Projected Lift",
        tooltip: "Estimated visibility lift if the opportunities are created.",
        subtitle: "Estimated if published",
        value: "0%",
        trend: "",
        tone: "positive",
        valueClassName: "text-[#2f6bff]",
        showTrend: false,
      },
    ],
  },
};

const PROMPT_TRACKING_PERFORMANCE: PerformanceConfig = {
  title: "Performance over LLMs",
  tooltip: "Each AI model's share of your brand mentions in the latest run.",
  // No time-bucketed history yet, so the range toggle is hidden (see
  // PromptTrackingKpiPanel, which passes toggle={[]}). Kept for when real
  // daily/monthly/quarterly aggregation lands.
  toggle: [
    { id: "daily", label: "Daily" },
    { id: "monthly", label: "Monthly" },
    { id: "quarterly", label: "Quarterly" },
  ],
};

// Friendly display names for the raw model keys stored on AiQueryResult.model.
// Unknown keys fall back to a capitalized version of the raw key.
const MODEL_LABELS: Record<string, string> = {
  chatgpt: "ChatGPT",
  "gpt-4o": "ChatGPT",
  gpt4o: "ChatGPT",
  "gpt-4": "ChatGPT",
  openai: "ChatGPT",
  claude: "Claude",
  anthropic: "Claude",
  gemini: "Gemini",
  google: "Gemini",
  perplexity: "Perplexity",
  deepseek: "Deep Seek",
  "deep-seek": "Deep Seek",
  aio: "AI Overview",
  ai_overview: "AI Overview",
  "ai-overview": "AI Overview",
};

function prettyModel(model: string): string {
  if (!model) return "Unknown";
  const lower = model.toLowerCase();
  if (MODEL_LABELS[lower]) return MODEL_LABELS[lower];
  if (/gpt|openai|chatgpt/.test(lower)) return "ChatGPT";
  if (/claude|anthropic/.test(lower)) return "Claude";
  if (/gemini/.test(lower)) return "Gemini";
  if (/google-gre|overview|serpapi/.test(lower)) return "Google AI Overview";
  if (/deep/.test(lower)) return "Deep Seek";
  return model.replace(/[-_/]/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

// Friendly display names for the prompt-category keys stored on Prompt.category.
// Mirrors the map in PromptTrackingTable so both tables label categories the same.
const PROMPT_CATEGORY_LABELS: Record<string, string> = {
  unbranded_recommendation: "Unbranded recommendation",
  top_n_listicle: "Top-N listicle",
  alternatives_to_competitor: "Alternatives to competitor",
  problem_statement: "Problem statement",
  brand_vs_competitor: "Brand vs competitor",
  branded_trust: "Branded trust",
};

function promptCategoryLabel(category?: string | null): string {
  if (!category) return "Uncategorized";
  return (
    PROMPT_CATEGORY_LABELS[category] ??
    category.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase())
  );
}

// Time-window options for the tracked table's date-range control. Each value
// sets how many trailing daily columns the table renders (kept as daily data —
// no weekly aggregation). "7 days" is the default so the layout is unchanged.
const TRACKED_WINDOW_OPTIONS: Array<{ label: string; days: number }> = [
  { label: "7 days", days: 7 },
  { label: "14 days", days: 14 },
  { label: "30 days", days: 30 },
];

// Rows-per-page choices for the tracked table. This is the "how many prompts in
// the table" control — the user picks the page size, default 10.
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

// Bar palette reused from the original static panel so the look is unchanged.
const MODEL_BAR_CLASSES = [
  "bg-[#7395dd]",
  "bg-[#8aa6e8]",
  "bg-[#9ab5ef]",
  "bg-[#b0c2f2]",
  "bg-[#c2cff4]",
];

function MetricTooltip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex h-4 w-4 items-center justify-center rounded-full text-slate-400 transition hover:text-slate-600"
          aria-label={text}
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{text}</TooltipContent>
    </Tooltip>
  );
}

function MetricCard({
  label,
  tooltip,
  subtitle,
  value,
  trend,
  tone,
  valueClassName,
  showTrend = true,
}: MetricCardConfig) {
  const toneClasses =
    tone === "positive"
      ? "bg-emerald-50 text-emerald-600 border-emerald-200"
      : tone === "warning"
        ? "bg-amber-50 text-amber-600 border-amber-200"
        : "bg-rose-50 text-rose-600 border-rose-200";
  const TrendIcon = tone === "negative" ? ArrowDownRight : ArrowUpRight;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="truncate text-[12px] font-semibold text-slate-600">{label}</h3>
            <MetricTooltip text={tooltip} />
          </div>
          <p className="mt-4 text-[12px] font-medium text-slate-600">{subtitle}</p>
        </div>
        {showTrend ? (
          <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium", toneClasses)}>
            <TrendIcon className="h-3 w-3" />
            {trend}
          </span>
        ) : null}
      </div>

      <div className={cn("mt-1 flex items-end justify-between gap-4", showTrend ? "" : "pt-0.5")}>
        <div className={cn("text-[31px] font-semibold leading-none tracking-[-0.04em]", valueClassName)}>
          {value}
        </div>
      </div>
    </div>
  );
}

function MetricCardSkeleton({ showTrend = true }: { showTrend?: boolean }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="h-3.5 w-28 animate-pulse rounded bg-slate-200" />
          <div className="mt-4 h-3 w-24 animate-pulse rounded bg-slate-200" />
        </div>
        {showTrend ? <div className="h-5 w-16 animate-pulse rounded-full bg-slate-200" /> : null}
      </div>
      <div className="mt-2 h-8 w-16 animate-pulse rounded bg-slate-200" />
    </div>
  );
}

function PerformanceRangeToggle({
  value,
  onChange,
  items,
}: {
  value: PerformanceRange;
  onChange: (value: PerformanceRange) => void;
  items: PerformanceConfig["toggle"];
}) {
  return (
    <div className="inline-flex rounded-lg bg-slate-50 p-1">
      {items.map((item) => {
        const active = value === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={cn(
              "rounded-md px-3 py-1.5 text-[12px] font-medium transition",
              active ? "bg-white text-slate-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

function PromptTrackingPerformanceCard({
  title,
  tooltip,
  rows,
  range,
  onRangeChange,
  toggle,
}: {
  title: string;
  tooltip: string;
  rows: PerformanceRowConfig[];
  range: PerformanceRange;
  onRangeChange: (value: PerformanceRange) => void;
  // Empty array hides the range toggle (used when there's no time-bucketed
  // data to switch between — the panel shows the latest run only).
  toggle: PerformanceConfig["toggle"];
}) {
  return (
    <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className="text-[15px] font-semibold leading-tight text-slate-700">{title}</h3>
              <MetricTooltip text={tooltip} />
            </div>
            {toggle.length > 0 ? (
              <div className="mt-4">
                <PerformanceRangeToggle value={range} onChange={onRangeChange} items={toggle} />
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-5 space-y-3.5">
          {rows.length === 0 ? (
            <p className="text-[12px] text-slate-500">No model data in the latest run yet.</p>
          ) : (
            rows.map((row, index) => (
              <div key={row.label} className="grid grid-cols-[minmax(0,132px)_minmax(0,1fr)_auto_auto] items-center gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded text-[10px] font-semibold text-slate-500">
                    {index === 0 ? "◉" : "•"}
                  </span>
                  <span className="truncate text-[12px] font-medium text-slate-600">{row.label}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                  <div className={cn("h-full rounded-full", row.barClassName)} style={{ width: `${row.percent}%` }} />
                </div>
                <span className="text-[12px] font-medium text-[#2f6bff] tabular-nums">{row.value}</span>
                <span className="text-[11px] font-medium text-slate-500 tabular-nums">{row.percent}%</span>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function PromptTrackingKpiSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="h-4 w-52 animate-pulse rounded bg-slate-200" />
            <div className="mt-4 h-9 w-40 animate-pulse rounded-lg bg-slate-200" />
          </div>
          <div className="h-5 w-16 animate-pulse rounded-full bg-slate-200" />
        </div>
        <div className="mt-5 space-y-3.5">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="grid grid-cols-[minmax(0,132px)_minmax(0,1fr)_auto_auto] items-center gap-3">
              <div className="h-3.5 w-28 animate-pulse rounded bg-slate-200" />
              <div className="h-2 animate-pulse rounded-full bg-slate-200" />
              <div className="h-3.5 w-12 animate-pulse rounded bg-slate-200" />
              <div className="h-3.5 w-8 animate-pulse rounded bg-slate-200" />
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <MetricCardSkeleton key={index} />
        ))}
      </div>
    </div>
  );
}

function PromptTrackingKpiPanel({ loading, rows }: { loading: boolean; rows: PromptTableRow[] }) {
  const [range, setRange] = useState<PerformanceRange>("daily");

  // All four cards are derived from real tracked-prompt data. Trend badges are
  // hidden — there's no stored period-over-period history for these totals.
  const summaryCards = useMemo<MetricCardConfig[]>(() => {
    const base = TAB_CONFIGS["prompt-tracking"].kind === "tracking"
      ? TAB_CONFIGS["prompt-tracking"].summaryCards
      : [];
    const monitored = rows.length;
    const visibilityValues = rows
      .map((r) => Number.parseInt(String(r.sov ?? ""), 10))
      .filter((n) => Number.isFinite(n));
    const avgVisibility = visibilityValues.length > 0
      ? Math.round(visibilityValues.reduce((s, n) => s + n, 0) / visibilityValues.length)
      : 0;
    // Day-over-day movers among tracked prompts (delta is null until at least
    // two daily runs exist, so those rows count toward neither gained nor lost).
    const gained = rows.filter((r) => r.weekTrend?.delta != null && r.weekTrend.delta > 0).length;
    const lost = rows.filter((r) => r.weekTrend?.delta != null && r.weekTrend.delta < 0).length;
    return base.map((card) => {
      if (card.label === "Monitored Prompts") return { ...card, value: String(monitored), showTrend: false };
      if (card.label === "Average Visibility") return { ...card, value: `${avgVisibility}%`, showTrend: false };
      if (card.label === "Prompts Gained") return { ...card, value: String(gained), showTrend: false };
      if (card.label === "Prompts Lost") return { ...card, value: String(lost), showTrend: false };
      return card;
    });
  }, [rows]);

  // Real per-model share for the latest run: sum brand-mention presence across
  // every tracked prompt's per-model results, then take each model's share.
  const performanceRows = useMemo<PerformanceRowConfig[]>(() => {
    const mentionsByModel = new Map<string, number>();
    for (const r of rows) {
      for (const res of r.results ?? []) {
        if (!res.model) continue;
        const presence = typeof res.presence === "number" ? res.presence : 0;
        mentionsByModel.set(res.model, (mentionsByModel.get(res.model) ?? 0) + presence);
      }
    }
    const entries = Array.from(mentionsByModel.entries());
    const total = entries.reduce((s, [, n]) => s + n, 0);
    return entries
      .sort((a, b) => b[1] - a[1])
      .map(([model, mentions], i) => ({
        label: prettyModel(model),
        value: String(mentions),
        percent: total > 0 ? Math.round((mentions / total) * 100) : 0,
        barClassName: MODEL_BAR_CLASSES[i % MODEL_BAR_CLASSES.length],
      }));
  }, [rows]);

  return loading ? (
    <PromptTrackingKpiSkeleton />
  ) : (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
      <PromptTrackingPerformanceCard
        title={PROMPT_TRACKING_PERFORMANCE.title}
        tooltip={PROMPT_TRACKING_PERFORMANCE.tooltip}
        rows={performanceRows}
        range={range}
        onRangeChange={setRange}
        toggle={[]}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {summaryCards.map((metric) => (
          <MetricCard key={metric.label} {...metric} />
        ))}
      </div>
    </div>
  );
}

type TrackedHistoryCell = {
  label: string;
  tracked: boolean;
  delta: number | null;
  startedAt: string | null;
  visibility: number | null;
};

const TRACKED_HISTORY_COLUMNS = ["Week 1", "Week 2", "Week 3", "Week 4"];

function formatTrackedPointDate(value?: string | null): string {
  if (!value) return "Not tracked";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not tracked";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function getTrackedHistoryCells(row: PromptTableRow, windowDays: number): TrackedHistoryCell[] {
  const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;
  const points = [...(row.weekTrend?.points ?? [])]
    .filter((point) => {
      const time = new Date(point.startedAt).getTime();
      return Number.isFinite(time) && time >= cutoff;
    })
    .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime())
    .slice(-TRACKED_HISTORY_COLUMNS.length);

  return TRACKED_HISTORY_COLUMNS.map((label, index) => {
    const point = points[index] ?? null;
    const previous = index > 0 ? points[index - 1] ?? null : null;
    return {
      label,
      tracked: Boolean(point),
      delta: point && previous ? point.visibility - previous.visibility : null,
      startedAt: point ? String(point.startedAt) : null,
      visibility: point ? point.visibility : null,
    };
  });
}

function getTrackedRunStatus(row: PromptTableRow): {
  attempted: number;
  failed: number;
  label: string;
  percent: number;
  successful: number;
  tone: string;
} {
  const results = row.results ?? [];
  const attempted = results.length;
  const successfulFromMetric = Number(row.successfulResponses);
  const successful = Number.isFinite(successfulFromMetric)
    ? successfulFromMetric
    : results.filter((result) => result.status !== "failed").length;
  const failed = results.filter((result) => result.status === "failed").length;
  const percent = attempted > 0 ? Math.round((successful / attempted) * 100) : 0;
  const label =
    attempted === 0 ? "Not scanned"
    : failed > 0 ? "Error occurred"
    : successful < attempted ? "Scanning"
    : "Scanned";
  const tone =
    attempted === 0 ? "bg-slate-300"
    : failed > 0 ? "bg-[#c43d3d]"
    : successful < attempted ? "bg-[#e6a700]"
    : "bg-[#0d7c1c]";
  return { attempted, failed, label, percent, successful, tone };
}

function getTrackedModel(row: PromptTableRow): { label: string; iconSrc: string | null; extra: number } {
  const successfulResults = (row.results ?? []).filter((result) => result.status !== "failed");
  const uniqueModels = Array.from(new Set(successfulResults.map((result) => result.model).filter(Boolean)));
  const model = uniqueModels[0] ?? "";
  const status = getTrackedRunStatus(row);
  const label = status.attempted > 0 && model ? prettyModel(model) : "No run yet";
  const lower = model.toLowerCase();
  const iconSrc =
    /claude|anthropic/.test(lower) ? "/report-icons/claude.svg"
    : /gpt|openai|chatgpt/.test(lower) ? "/report-icons/chat-gpt.svg"
    : /google-gre|overview|serpapi/.test(lower) ? "/report-icons/google.svg"
    : /gemini|google/.test(lower) ? "/report-icons/gemini.svg"
    : null;
  return { label, iconSrc, extra: Math.max(0, uniqueModels.length - 1) };
}

function TrackedPromptsDailyTable({
  domainId,
  rows,
  onDraftBlog,
}: {
  domainId: number | null;
  rows: PromptTableRow[];
  onDraftBlog: (rowId: string) => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0]);
  const [currentPage, setCurrentPage] = useState(1);
  const [trackOverrides, setTrackOverrides] = useState<Record<string, boolean>>({});
  const [trackPending, setTrackPending] = useState<Record<string, boolean>>({});

  // ── Figma filter bar state ────────────────────────────────────────────────
  // query doubles as search (live-filters the visible rows) and as the text for
  // "Monitor new Prompt". windowDays drives how many daily columns render.
  const [query, setQuery] = useState("");
  const [modelFilter, setModelFilter] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [windowDays, setWindowDays] = useState(TRACKED_WINDOW_OPTIONS[0].days);
  const [monitoring, setMonitoring] = useState(false);

  const historyColumns = TRACKED_HISTORY_COLUMNS;
  const colSpan = historyColumns.length + 5; // checkbox + prompt + 4 history slots + model + status + actions

  // Filter options derived from the real rows (models actually run, categories present).
  const modelOptions = useMemo(() => {
    const set = new Set<string>();
    for (const row of rows) {
      for (const res of row.results ?? []) {
        if (res.model) set.add(prettyModel(res.model));
      }
    }
    return Array.from(set).sort();
  }, [rows]);

  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    for (const row of rows) {
      const category = (row as PromptTableRow & { category?: string | null }).category;
      if (category) set.add(category);
    }
    return Array.from(set).sort((a, b) => promptCategoryLabel(a).localeCompare(promptCategoryLabel(b)));
  }, [rows]);

  // Working filters — search text, model, and category all narrow the list
  // before pagination.
  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (q && !row.phrase.toLowerCase().includes(q)) return false;
      if (categoryFilter && (row as PromptTableRow & { category?: string | null }).category !== categoryFilter) {
        return false;
      }
      if (modelFilter) {
        const hasModel = (row.results ?? []).some((res) => res.model && prettyModel(res.model) === modelFilter);
        if (!hasModel) return false;
      }
      return true;
    });
  }, [rows, query, categoryFilter, modelFilter]);

  const totalCount = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const activeFilterCount = (categoryFilter ? 1 : 0) + (modelFilter ? 1 : 0);
  const pageResetKey = useMemo(() => filteredRows.map((row) => row.id).join("|"), [filteredRows]);

  useEffect(() => {
    setCurrentPage(1);
  }, [pageResetKey, pageSize]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const visibleRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [currentPage, filteredRows, pageSize]);
  const visibleIds = visibleRows.map((row) => row.id);

  // "Monitor new Prompt" — analyze the typed prompt across models, then mark it
  // tracked so it joins the daily list. Reuses the same endpoints as the All
  // Prompts tab's Analyze + Track flow.
  const handleMonitorNew = async () => {
    const text = query.trim();
    if (!text || monitoring || domainId == null) return;
    setMonitoring(true);
    try {
      const res = await apiPost<{ prompt?: { id: number }; row?: PromptTableRow }>(
        `/wizard/domain/${domainId}/prompts/analyze`,
        { text },
      );
      const newId = res?.prompt?.id ?? res?.row?.rawId ?? null;
      if (newId != null) {
        await apiPatch(`/wizard/domain/${domainId}/prompts/${newId}/track`, { tracked: true });
      }
      setQuery("");
      queryClient.invalidateQueries({ queryKey: aiResultsKeys.trackedPrompts(domainId) });
      queryClient.invalidateQueries({ queryKey: ["ai-results", "report", domainId] });
      toast({
        title: "Prompt added to monitoring",
        description: "It's now tracked and re-tested automatically every day.",
      });
    } catch (err) {
      toast({
        title: "Couldn't add prompt",
        description: err instanceof Error ? err.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setMonitoring(false);
    }
  };
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const isRowTracked = (row: PromptTableRow) => trackOverrides[row.id] ?? row.isTracked ?? true;

  const toggleTracking = async (row: PromptTableRow, next: boolean) => {
    if (domainId == null || row.rawId == null || trackPending[row.id]) return;
    setTrackOverrides((prev) => ({ ...prev, [row.id]: next }));
    setTrackPending((prev) => ({ ...prev, [row.id]: true }));
    try {
      await apiPatch<{ prompt: { id: number; isTracked: boolean } }>(
        `/wizard/domain/${domainId}/prompts/${row.rawId}/track`,
        { tracked: next },
      );
      queryClient.invalidateQueries({ queryKey: aiResultsKeys.trackedPrompts(domainId) });
      queryClient.invalidateQueries({ queryKey: ["ai-results", "report", domainId] });
      toast({
        title: next ? "Tracking daily" : "Tracking stopped",
        description: next
          ? "This prompt is re-tested automatically every day."
          : "Removed from daily tests.",
      });
    } catch (err) {
      setTrackOverrides((prev) => {
        const copy = { ...prev };
        delete copy[row.id];
        return copy;
      });
      toast({
        title: "Couldn't update tracking",
        description: err instanceof Error ? err.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setTrackPending((prev) => {
        const copy = { ...prev };
        delete copy[row.id];
        return copy;
      });
    }
  };

  return (
    <Card className="border-none bg-transparent shadow-none">
      <div className="mb-4 flex flex-col gap-1.5">
        <h2 className="text-[20px] font-bold text-[#334155]">Prompt Monitor</h2>
        <p className="text-[14px] text-[#64748b]">
          Track emerging prompts and understand how AI platforms evaluate content.
        </p>
      </div>

      <CardContent className="rounded-2xl border border-slate-200 bg-white px-0 pb-3 shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-6 py-4 lg:flex-row lg:items-center lg:justify-between">
          {/* Search doubles as "add a prompt to monitor" (matches the Figma). */}
          <div className="flex w-full items-center gap-2 lg:max-w-[520px]">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void handleMonitorNew();
                  }
                }}
                placeholder="Search or add a prompt to monitor"
                className="h-9 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-[13px] outline-none transition placeholder:text-slate-400 focus:border-slate-300 focus:ring-1 focus:ring-slate-300"
              />
            </div>
            <button
              type="button"
              onClick={() => void handleMonitorNew()}
              disabled={monitoring || !query.trim() || domainId == null}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-[#2d3748] px-3.5 text-[13px] font-medium text-white transition hover:bg-[#1a202c] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {monitoring ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Monitor new Prompt
            </button>
          </div>

          {/* Working filters: date window · model · category. */}
          <div className="flex flex-wrap items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-[12px] font-medium text-slate-600 transition hover:bg-slate-50"
                >
                  <Calendar className="h-3.5 w-3.5" />
                  {TRACKED_WINDOW_OPTIONS.find((option) => option.days === windowDays)?.label ?? "7 days"}
                  <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[150px] p-1">
                {TRACKED_WINDOW_OPTIONS.map((option) => (
                  <DropdownMenuItem
                    key={option.days}
                    onClick={() => setWindowDays(option.days)}
                    className="flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-[12px]"
                  >
                    {option.label}
                    {windowDays === option.days ? <Check className="h-3.5 w-3.5 text-blue-600" /> : null}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-[12px] font-medium text-slate-600 transition hover:bg-slate-50"
                >
                  <Filter className="h-3.5 w-3.5" />
                  {modelFilter ?? "All models"}
                  <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[180px] p-1">
                <DropdownMenuItem
                  onClick={() => setModelFilter(null)}
                  className="flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-[12px]"
                >
                  All models
                  {modelFilter === null ? <Check className="h-3.5 w-3.5 text-blue-600" /> : null}
                </DropdownMenuItem>
                {modelOptions.length === 0 ? (
                  <DropdownMenuItem disabled>No models run yet</DropdownMenuItem>
                ) : (
                  modelOptions.map((model) => (
                    <DropdownMenuItem
                      key={model}
                      onClick={() => setModelFilter(model)}
                      className="flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-[12px]"
                    >
                      {model}
                      {modelFilter === model ? <Check className="h-3.5 w-3.5 text-blue-600" /> : null}
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-[12px] font-medium text-slate-600 transition hover:bg-slate-50"
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                  {categoryFilter ? promptCategoryLabel(categoryFilter) : "Select Prompt Category"}
                  <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[240px] p-1">
                <DropdownMenuItem
                  onClick={() => setCategoryFilter(null)}
                  className="flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-[12px]"
                >
                  All categories
                  {categoryFilter === null ? <Check className="h-3.5 w-3.5 text-blue-600" /> : null}
                </DropdownMenuItem>
                {categoryOptions.length === 0 ? (
                  <DropdownMenuItem disabled>No categories in this data</DropdownMenuItem>
                ) : (
                  categoryOptions.map((category) => (
                    <DropdownMenuItem
                      key={category}
                      onClick={() => setCategoryFilter(category)}
                      className="flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-[12px]"
                    >
                      {promptCategoryLabel(category)}
                      {categoryFilter === category ? <Check className="h-3.5 w-3.5 text-blue-600" /> : null}
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {activeFilterCount > 0 || query.trim() ? (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setModelFilter(null);
                  setCategoryFilter(null);
                }}
                className="px-2 text-[12px] font-medium text-slate-500 transition hover:text-slate-700"
              >
                Clear
              </button>
            ) : null}
          </div>
        </div>
        <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-gray-200">
          <Table>
            <TableHeader>
              <TableRow className="border-b-0 bg-[#f1f1f1] hover:bg-[#f1f1f1]">
                <TableHead className="w-8 px-4 rounded-tl-lg">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    aria-label="Select all visible tracked prompts"
                    className="h-3.5 w-3.5 rounded border-gray-300 accent-blue-600"
                    onChange={() => {
                      setSelectedIds((prev) => {
                        const next = new Set(prev);
                        if (allVisibleSelected) visibleIds.forEach((id) => next.delete(id));
                        else visibleIds.forEach((id) => next.add(id));
                        return next;
                      });
                    }}
                  />
                </TableHead>
                <TableHead className="min-w-[280px] px-2 text-[11px] font-semibold text-[#31415f]">
                  <div className="flex items-center gap-1">
                    Prompts <Info className="h-[10px] w-[10px] text-slate-400" />
                  </div>
                </TableHead>
                {historyColumns.map((label) => (
                  <TableHead key={label} className="px-2 text-[11px] font-semibold text-[#31415f]">
                    <div className="flex items-center gap-1">
                      {label} <Info className="h-[10px] w-[10px] text-slate-400" />
                    </div>
                  </TableHead>
                ))}
                <TableHead className="min-w-[150px] px-2 text-[11px] font-semibold text-[#31415f]">
                  <div className="flex items-center gap-1">
                    Model <Info className="h-[10px] w-[10px] text-slate-400" />
                  </div>
                </TableHead>
                <TableHead className="min-w-[190px] px-2 text-[11px] font-semibold text-[#31415f]">
                  <div className="flex items-center gap-1">
                    Status <Info className="h-[10px] w-[10px] text-slate-400" />
                  </div>
                </TableHead>
                <TableHead className="min-w-[130px] px-4 text-right text-[11px] font-semibold text-[#31415f] rounded-tr-lg">
                  <div className="flex items-center justify-end gap-1">
                    Actions <Info className="h-[10px] w-[10px] text-slate-400" />
                  </div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRows.length === 0 ? (
                <TableRow className="border-b border-slate-200">
                  <TableCell colSpan={colSpan} className="px-4 py-10 text-center text-[12px] text-slate-500">
                    No tracked prompts match these filters.
                  </TableCell>
                </TableRow>
              ) : null}
              {visibleRows.map((row) => {
                const historyCells = getTrackedHistoryCells(row, windowDays);
                const runStatus = getTrackedRunStatus(row);
                const model = getTrackedModel(row);
                const expanded = expandedIds.has(row.id);
                return (
                  <Fragment key={row.id}>
                    <TableRow className="border-b border-slate-200 transition-colors hover:bg-slate-50/80">
                      <TableCell className="w-8 px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(row.id)}
                          aria-label="Select tracked prompt"
                          className="h-3.5 w-3.5 rounded border-gray-300 accent-blue-600"
                          onChange={() => toggleSelected(row.id)}
                        />
                      </TableCell>
                      <TableCell className="max-w-[340px] px-2 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            aria-label={expanded ? "Collapse prompt details" : "Expand prompt details"}
                            aria-expanded={expanded}
                            onClick={() => toggleExpanded(row.id)}
                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] bg-[#f8f9fc] text-slate-500 transition-colors hover:bg-slate-100"
                          >
                            <ChevronRight className={cn("h-[14px] w-[14px] transition-transform", expanded && "rotate-90")} />
                          </button>
                          <span
                            className={cn(
                              "text-[12px] italic leading-relaxed text-[#58606f]",
                              expanded ? "whitespace-normal break-words" : "line-clamp-2",
                            )}
                            title={row.phrase}
                          >
                            {row.phrase}
                          </span>
                        </div>
                      </TableCell>
                      {historyCells.map((cell, index) => {
                        const delta = cell.delta;
                        const deltaUp = delta == null || delta >= 0;
                        return (
                          <TableCell key={`${row.id}-day-${index}`} className="px-2 py-3">
                            {cell.tracked ? (
                              <div className="inline-flex items-center gap-2" title={formatTrackedPointDate(cell.startedAt)}>
                                <span className="text-[12px] font-semibold text-[#30343b]">
                                  {Math.round(cell.visibility ?? 0)}%
                                </span>
                                <span
                                  className={cn(
                                    "inline-flex h-6 min-w-9 items-center justify-center gap-1 rounded-full px-2 text-[10px] font-semibold",
                                    deltaUp
                                      ? "border border-emerald-200 bg-emerald-50 text-[#0d7c1c]"
                                      : "border border-rose-200 bg-rose-50 text-[#c43d3d]",
                                  )}
                                >
                                  {deltaUp ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                                  {delta == null ? "New" : `${Math.abs(delta)}%`}
                                </span>
                              </div>
                            ) : (
                              <span className="text-[11px] font-medium text-slate-400" title={cell.label}>
                                Not Tracked
                              </span>
                            )}
                          </TableCell>
                        );
                      })}
                      <TableCell className="px-2 py-3">
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
                          {model.iconSrc ? (
                            <img src={model.iconSrc} alt="" className="h-4 w-4 object-contain" />
                          ) : null}
                          {model.label}
                          {model.extra > 0 ? (
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-500">
                              +{model.extra}
                            </span>
                          ) : null}
                        </span>
                      </TableCell>
                      <TableCell className="px-2 py-3">
                        <div className="flex w-[155px] flex-col gap-1.5">
                          <div className="flex items-baseline gap-2">
                            <span className="text-[18px] font-semibold leading-none text-[#30343b]">{runStatus.percent}%</span>
                            <span className={cn(
                              "text-[9px]",
                              runStatus.attempted === 0 ? "text-slate-500"
                              : runStatus.failed > 0 ? "text-[#c43d3d]"
                              : runStatus.successful < runStatus.attempted ? "text-[#9a6a00]"
                              : "text-slate-500",
                            )}>
                              {runStatus.label}
                            </span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                            <div className={cn("h-full rounded-full", runStatus.tone)} style={{ width: `${runStatus.percent}%` }} />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <TrackToggleButton
                            className="h-[38px] w-[38px]"
                            tracked={isRowTracked(row)}
                            loading={trackPending[row.id]}
                            disabled={row.rawId == null}
                            onClick={() => void toggleTracking(row, !isRowTracked(row))}
                          />
                          <button
                            type="button"
                            onClick={() => onDraftBlog(row.id)}
                            className="inline-flex h-[38px] items-center gap-1.5 rounded-[14px] border border-[#e8eef8] bg-[#eff4ff] px-3.5 text-[11px] font-semibold text-[#3b5d9c] transition hover:bg-[#e7efff]"
                          >
                            <FileText className="h-3.5 w-3.5" />
                            Draft Blog
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {expanded ? (
                      <TableRow className="border-b border-slate-300 bg-white hover:bg-white">
                        <TableCell colSpan={colSpan} className="p-0">
                          <PromptExpandedDetails
                            results={row.results}
                            phrase={row.phrase}
                            domainId={domainId}
                            rawId={row.rawId}
                            rowType={row.type}
                            trackedView
                            lastTestedAt={row.lastTestedAt}
                            nextTestAt={row.nextTestAt}
                          />
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <div className="mt-2 flex flex-col gap-3 border-t border-slate-200 px-6 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-semibold tracking-tight text-gray-500">
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
              <DropdownMenuContent align="start" className="w-[120px] p-1">
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <DropdownMenuItem
                    key={size}
                    onClick={() => setPageSize(size)}
                    className="flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-[12px]"
                  >
                    {size} / page
                    {pageSize === size ? <Check className="h-3.5 w-3.5 text-blue-600" /> : null}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
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
              onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
              disabled={currentPage >= totalPages}
              className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

type PromptReportData = {
  topPrompts?: PromptTableRow[];
  opportunities?: PromptContentOpportunity[];
};

type TrackedPromptsData = {
  prompts?: PromptTableRow[];
};

type WorksheetPromptRow = PromptTableRow & {
  keyword?: string | null;
  keywordIntent?: string | null;
  prompt?: string | null;
  text?: string | null;
};

// Map the /report response's topPrompts (already PromptTableRow-shaped) into
// table rows. Keyword rollup rows are dropped — these tables show individual
// prompts only. Falls back to an empty list while loading or on error.
function mapReportRows(data: PromptReportData | undefined): PromptTableRow[] {
  const rows = Array.isArray(data?.topPrompts) ? data.topPrompts : [];
  return rows.filter((r) => r.type === "prompt");
}

// /tracked-prompts returns rows already shaped for the table plus tracking
// metadata (isTracked / lastTestedAt / weekTrend).
function mapTrackedRows(data: TrackedPromptsData | undefined): PromptTableRow[] {
  const rows = Array.isArray(data?.prompts) ? data.prompts : [];
  return rows.filter((r) => r.type === "prompt");
}

function hasScoredPromptResults(row: PromptTableRow): boolean {
  const successful = Number(row.successfulResponses);
  if (Number.isFinite(successful) && successful > 0) return true;
  return (row.results ?? []).some((result) => result.status !== "failed");
}

function mergeTrackedResultsIntoPromptInventory(
  reportRows: PromptTableRow[],
  trackedRows: PromptTableRow[],
): PromptTableRow[] {
  const trackedById = new Map(trackedRows.map((row) => [row.id, row]));

  return reportRows.map((row) => {
    if (hasScoredPromptResults(row)) return row;
    const tracked = trackedById.get(row.id);
    if (!tracked || !hasScoredPromptResults(tracked)) return row;

    return {
      ...row,
      aiSov: tracked.aiSov,
      aiSovPercent: tracked.aiSovPercent,
      avgRankPosition: tracked.avgRankPosition,
      avgSentiment: tracked.avgSentiment,
      bestRank: tracked.bestRank,
      brandMentionEvents: tracked.brandMentionEvents,
      competitorCount: tracked.competitorCount,
      competitorMentionEvents: tracked.competitorMentionEvents,
      competitors: tracked.competitors,
      mentions: tracked.mentions,
      rankedResponses: tracked.rankedResponses,
      rankingPosition: tracked.rankingPosition,
      results: tracked.results,
      sov: tracked.sov,
      successfulResponses: tracked.successfulResponses,
      totalMentionEvents: tracked.totalMentionEvents,
      isTracked: tracked.isTracked ?? row.isTracked,
      historyKind: "weekly",
      lastTestedAt: tracked.lastTestedAt ?? row.lastTestedAt,
      nextTestAt: tracked.nextTestAt ?? row.nextTestAt,
      weekTrend: tracked.weekTrend ?? row.weekTrend,
    };
  });
}

function buildWorksheetRows(rows: PromptTableRow[]) {
  return rows.map((row) => {
    const r = row as WorksheetPromptRow;
    const primaryKeyword = row.type === "keyword" ? (r.phrase ?? r.text ?? null) : (r.keyword ?? null);
    const primaryIntent = row.type === "keyword" ? (r.intent ?? null) : (r.keywordIntent ?? r.intent ?? null);
    return {
      id: String(row.id),
      prompt: r.phrase ?? r.prompt ?? "",
      type: row.type ?? null,
      primaryKeyword: primaryKeyword || null,
      primaryIntent: primaryIntent || null,
    };
  });
}

function PromptsTabBody({
  tabId,
  domainId,
  loading,
  isError,
  rows,
  onRetry,
  onTestNow,
  onDraftBlog,
  testingNow,
  kpiOverride,
}: {
  tabId: PromptsTabId;
  domainId: number | null;
  loading: boolean;
  isError: boolean;
  rows: PromptTableRow[];
  onRetry: () => void;
  onTestNow?: () => void;
  onDraftBlog?: (rowId: string) => void;
  testingNow?: boolean;
  // Real, data-derived KPI cards for the "cards" tabs. When provided, these
  // replace the static template cards in TAB_CONFIGS (see PromptsPage).
  kpiOverride?: MetricCardConfig[];
}) {
  const tabConfig = TAB_CONFIGS[tabId];
  const isTracking = tabId === "prompt-tracking";
  const kpis = kpiOverride ?? (tabConfig.kind === "cards" ? tabConfig.kpis : []);

  return (
    <div className="space-y-6">
      <TooltipProvider delayDuration={120}>
        {tabConfig.kind === "tracking" ? (
          <PromptTrackingKpiPanel loading={loading} rows={rows} />
        ) : (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
            {loading
              ? kpis.map((metric) => (
                  <MetricCardSkeleton key={metric.label} showTrend={metric.showTrend ?? true} />
                ))
              : kpis.map((metric) => (
                  <MetricCard key={metric.label} {...metric} />
                ))}
          </div>
        )}
      </TooltipProvider>

      {isTracking ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-[12px] text-slate-500">
            Tracked prompts are automatically re-tested every day. Trends update after each daily run.
          </p>
          <button
            type="button"
            onClick={onTestNow}
            disabled={testingNow || rows.length === 0}
            className="inline-flex items-center gap-1.5 rounded-[10px] border border-[#cdd9f3] bg-white px-3 py-2 text-[12px] font-medium text-[#2f5fd1] transition hover:bg-[#eef4ff] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {testingNow ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Test tracked now
          </button>
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="space-y-4">
            <div className="h-6 w-48 animate-pulse rounded bg-slate-200" />
            <div className="h-4 w-80 animate-pulse rounded bg-slate-200" />
            <div className="h-[420px] rounded-xl border border-slate-200 bg-slate-50/70" />
          </div>
        </div>
      ) : isError ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <p className="text-[13px] text-slate-600">Couldn't load prompts.</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 inline-flex items-center gap-1.5 rounded-[10px] border border-slate-200 px-3 py-2 text-[12px] font-medium text-slate-600 transition hover:bg-slate-50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </button>
        </div>
      ) : isTracking && rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center shadow-sm">
          <p className="text-[13px] font-medium text-slate-600">No tracked prompts yet</p>
          <p className="mt-1 text-[12px] text-slate-500">
            Mark prompts for daily tracking from the Content Opportunities tab to start seeing day-over-day trends here.
          </p>
        </div>
      ) : tabId === "content-opportunities" ? (
        <PromptTable
          data={rows}
          title="Trending Prompts"
          domainId={domainId}
          showMonitorAllButton
          showPromptCategoryDropdown
        />
      ) : isTracking ? (
        <TrackedPromptsDailyTable
          domainId={domainId}
          rows={rows}
          onDraftBlog={onDraftBlog ?? (() => undefined)}
        />
      ) : (
        <PromptTable
          data={rows}
          title="Trending Prompts"
          domainId={domainId}
          showMonitorAllButton
          showPromptCategoryDropdown
        />
      )}
    </div>
  );
}

const PromptsPage = () => {
  const navigate = useNavigate();
  const { currentDomain } = useShellContext();
  const domainId = currentDomain?.id ?? null;
  const [activeTab, setActiveTab] = useState<PromptsTabId>("content-opportunities");
  const [testingNow, setTestingNow] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const reportQuery = useReport<PromptReportData>(domainId, null, { includeInsights: false });
  const reportReady = Boolean(reportQuery.data);
  const [responsesEnabled, setResponsesEnabled] = useState(false);
  const insightsQuery = useReport<PromptReportData>(domainId, null, {
    includeInsights: true,
    enabled: activeTab === "content-opportunities",
  });
  const responseReportQuery = useReport<PromptReportData>(domainId, null, {
    includeInsights: false,
    includeResponses: true,
    // Both tabs render prompt rows now (Content Opportunities hosts the Trending
    // Prompts table), so hydrate full responses regardless of the active tab.
    enabled: reportReady && responsesEnabled,
  });
  const trackedQuery = useTrackedPrompts<TrackedPromptsData>(domainId, {
    // Needed by both tabs: the tracked daily table AND the merged All-Prompts rows.
    enabled: true,
  });
  const reportData = responseReportQuery.data ?? reportQuery.data;

  useEffect(() => {
    setResponsesEnabled(false);
  }, [domainId]);

  useEffect(() => {
    if (!reportReady || responsesEnabled) return;
    const hydrationId = window.setTimeout(() => setResponsesEnabled(true), 1200);
    return () => window.clearTimeout(hydrationId);
  }, [reportReady, responsesEnabled]);

  const reportRows = useMemo(() => mapReportRows(reportData), [reportData]);
  const trackedRows = useMemo(() => mapTrackedRows(trackedQuery.data), [trackedQuery.data]);
  const allPromptRows = useMemo(
    () => mergeTrackedResultsIntoPromptInventory(reportRows, trackedRows),
    [reportRows, trackedRows],
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerRowIds, setPickerRowIds] = useState<string[]>([]);
  const [activeWorksheetId, setActiveWorksheetId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newWorksheetName, setNewWorksheetName] = useState("");
  const [creatingWorksheet, setCreatingWorksheet] = useState(false);
  const [createWorksheetError, setCreateWorksheetError] = useState<string | null>(null);
  const campaignsQuery = useCampaigns<{ campaigns: Array<{ id: number; title: string; description?: string | null }> }>({
    enabled: pickerOpen || createOpen,
  });
  const worksheetOptions: WorksheetOption[] = useMemo(
    () =>
      (campaignsQuery.data?.campaigns ?? []).map((campaign) => ({
        id: String(campaign.id),
        name: campaign.title,
        description: campaign.description ?? null,
      })),
    [campaignsQuery.data],
  );
  const activeWorksheet = useMemo(
    () => worksheetOptions.find((worksheet) => worksheet.id === activeWorksheetId) ?? null,
    [activeWorksheetId, worksheetOptions]
  );

  const pickerRows = useMemo(() => {
    const byId = new Map([...allPromptRows, ...trackedRows].map((row) => [row.id, row]));
    return pickerRowIds.map((id) => byId.get(id)).filter(Boolean) as PromptTableRow[];
  }, [pickerRowIds, allPromptRows, trackedRows]);

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
    } catch {
      setCreateWorksheetError("Failed to create worksheet. Please try again.");
    } finally {
      setCreatingWorksheet(false);
    }
  };

  // Real, data-derived KPI cards for the All Prompts tab. Each value comes from
  // data the page already fetches (/report + /tracked-prompts) — no fabricated
  // numbers, and trend badges are hidden since there's no stored period-over-
  // period history for these card-level totals.
  const allPromptsCards = useMemo<MetricCardConfig[]>(() => {
    const base =
      TAB_CONFIGS["all-prompts"].kind === "cards" ? TAB_CONFIGS["all-prompts"].kpis : [];

    // Card 1 — prompts added since the previous audit run (server-computed; 0
    // when there's no prior run to diff against).
    const newPrompts = Number(reportData?.metrics?.newPromptsSinceLastRun ?? 0);
    // Card 2 — prompts currently marked for daily tracking.
    const trackedCount = trackedRows.length;
    // Card 3 — "gap" prompts: visibility (sov) below 30%.
    const gapCount = allPromptRows.filter((r) => {
      const v = Number.parseInt(String(r.sov ?? ""), 10);
      return Number.isFinite(v) && v < 30;
    }).length;
    // Card 4 — tracked prompts whose visibility dropped day-over-day.
    const droppedCount = trackedRows.filter(
      (r) => r.weekTrend?.delta != null && r.weekTrend.delta < 0,
    ).length;

    const valueByLabel: Record<string, string> = {
      "New Prompt Opportunities": String(newPrompts),
      "Tracked Prompts": String(trackedCount),
      "Competitive Visibility Gaps": String(gapCount),
      "Visibility Drops": String(droppedCount),
    };

    return base.map((card) => ({
      ...card,
      value: valueByLabel[card.label] ?? card.value,
      showTrend: false,
    }));
  }, [reportData, allPromptRows, trackedRows]);

  // Real KPI cards for the Content Opportunities tab, derived from the
  // /report `opportunities` list (heuristic gaps enriched with a brief).
  // "Projected Lift" is dropped — there's no model or stored estimate for it.
  const contentOppsCards = useMemo<MetricCardConfig[]>(() => {
    const base =
      TAB_CONFIGS["content-opportunities"].kind === "cards"
        ? TAB_CONFIGS["content-opportunities"].kpis
        : [];
    const opportunities: PromptContentOpportunity[] = Array.isArray(insightsQuery.data?.opportunities)
      ? insightsQuery.data.opportunities
      : [];

    // Card 1 — every content gap surfaced by the analyzer.
    const gaps = opportunities.length;
    // Card 2 — high-confidence gaps worth working on now (critical/high severity).
    const ideas = opportunities.filter(
      (o) => o?.severity === "critical" || o?.severity === "high",
    ).length;
    // Card 3 — gaps that already carry an enriched content brief.
    const drafts = opportunities.filter((o) => o?.brief != null).length;

    const valueByLabel: Record<string, string> = {
      "Content Gaps Found": String(gaps),
      "Content Ideas Ready": String(ideas),
      "Content Drafts Ready": String(drafts),
    };

    return base
      .filter((card) => card.label !== "Projected Lift")
      .map((card) => ({ ...card, value: valueByLabel[card.label] ?? card.value }));
  }, [insightsQuery.data]);

  // Cancel any in-flight poll when the domain changes or the page unmounts.
  const pollRef = useRef<{ cancelled: boolean } | null>(null);
  useEffect(() => {
    return () => { if (pollRef.current) pollRef.current.cancelled = true; };
  }, [domainId]);

  const handleTestNow = async () => {
    if (!domainId || testingNow) return;
    setTestingNow(true);
    // latestRunAt advances only when a tracked run COMPLETES, so it's our
    // completion signal. Capture the current value to diff against while polling.
    const startLatest = (trackedQuery.data?.latestRunAt ?? null) as string | null;

    try {
      await apiPost(`/wizard/domain/${domainId}/tracked-prompts/run-now`);
    } catch (err) {
      setTestingNow(false);
      toast({
        title: "Couldn't start the test",
        description: err instanceof Error ? err.message : "Try again.",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Re-testing tracked prompts",
      description: "Runs in the background (a few minutes). The graph updates automatically when it finishes.",
    });

    // Poll until the new run completes, then refresh the tracked list, the KPI
    // cards, and every per-prompt history graph so the new point appears.
    const token = { cancelled: false };
    pollRef.current = token;
    const startedAt = Date.now();
    const POLL_MS = 15_000;
    const TIMEOUT_MS = 10 * 60 * 1000;

    const poll = async () => {
      if (token.cancelled || !domainId) return;
      if (Date.now() - startedAt > TIMEOUT_MS) {
        setTestingNow(false);
        toast({ title: "Still running", description: "The test is taking a while — it'll show up once it finishes." });
        return;
      }
      try {
        const data = await apiGet<{ latestRunAt: string | null }>(`/wizard/domain/${domainId}/tracked-prompts`);
        if (token.cancelled) return;
        if ((data?.latestRunAt ?? null) !== startLatest) {
          queryClient.invalidateQueries({ queryKey: aiResultsKeys.trackedPrompts(domainId) });
          // Partial key — refetches every open per-prompt/keyword history graph.
          queryClient.invalidateQueries({ queryKey: ["ai-results", "prompt-history"] });
          setTestingNow(false);
          toast({ title: "Tracked prompts updated", description: "Latest run is in — the graph now includes it." });
          return;
        }
      } catch {
        // Transient error — keep polling until the timeout.
      }
      setTimeout(poll, POLL_MS);
    };
    setTimeout(poll, POLL_MS);
  };

  const handleDraftBlog = (rowId: string) => {
    if (!domainId) {
      toast({
        title: "No domain context",
        description: "Domain not loaded yet. Try again in a moment.",
        variant: "destructive",
      });
      return;
    }
    setPickerRowIds([rowId]);
    setActiveWorksheetId(null);
    setPickerOpen(true);
  };

  const tabData = (tabId: PromptsTabId) => {
    if (tabId === "prompt-tracking") {
      return {
        rows: trackedRows,
        loading: trackedQuery.isLoading || domainId == null,
        isError: trackedQuery.isError,
        onRetry: () => queryClient.invalidateQueries({ queryKey: aiResultsKeys.trackedPrompts(domainId ?? "none") }),
      };
    }
    if (tabId === "content-opportunities") {
      return {
        // Now hosts the Trending Prompts table, so it needs the full prompt rows.
        rows: allPromptRows,
        // Gate on the report only — the content-gap panel/insights fill in after
        // and have their own loading/empty states, so the table shows sooner.
        loading: reportQuery.isLoading || domainId == null,
        isError: reportQuery.isError,
        onRetry: () => {
          queryClient.invalidateQueries({ queryKey: aiResultsKeys.report(domainId ?? "none", null, "lite") });
          queryClient.invalidateQueries({ queryKey: aiResultsKeys.report(domainId ?? "none", null, "responses") });
          queryClient.invalidateQueries({ queryKey: aiResultsKeys.report(domainId ?? "none", null, "full") });
        },
      };
    }
    return {
      rows: allPromptRows,
      loading: reportQuery.isLoading || domainId == null,
      isError: reportQuery.isError,
      onRetry: () => {
        queryClient.invalidateQueries({ queryKey: aiResultsKeys.report(domainId ?? "none", null, "lite") });
        queryClient.invalidateQueries({ queryKey: aiResultsKeys.report(domainId ?? "none", null, "responses") });
      },
    };
  };

  return (
    <section className="w-full bg-white px-6 pb-6 pt-2">
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as PromptsTabId)} className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <TabsList className="h-auto gap-1 rounded-[14px] bg-transparent p-0">
            {PROMPT_TABS.map((tab) => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className={cn(
                  "rounded-[10px] px-4 py-2 text-[13px] font-medium text-slate-500 shadow-none transition data-[state=active]:bg-[#eef4ff] data-[state=active]:text-[#2f5fd1] data-[state=active]:shadow-[inset_0_0_0_1px_rgba(79,110,200,0.18)]"
                )}
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {PROMPT_TABS.map((tab) => {
          const { rows, loading, isError, onRetry } = tabData(tab.id);
          return (
            <TabsContent key={tab.id} value={tab.id} className="mt-0">
              <PromptsTabBody
                tabId={tab.id}
                domainId={domainId}
                loading={loading}
                isError={isError}
                rows={rows}
                onRetry={onRetry}
                onTestNow={tab.id === "prompt-tracking" ? handleTestNow : undefined}
                onDraftBlog={tab.id === "prompt-tracking" ? handleDraftBlog : undefined}
                testingNow={testingNow}
                kpiOverride={
                  tab.id === "content-opportunities"
                    ? [...allPromptsCards, ...contentOppsCards]
                    : undefined
                }
              />
            </TabsContent>
          );
        })}
      </Tabs>
      <WorksheetPickerModal
        open={pickerOpen}
        selectedCount={pickerRows.length}
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
    </section>
  );
};

export default PromptsPage;
