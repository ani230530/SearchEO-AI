import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownRight,
  ArrowUpRight,
  Info,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { resolveAIResultsNavigation } from "@/features/sidebar-dashboard/navigation";
import { AIResultsBreadcrumbs } from "@/features/ai-results/components/AIResultsBreadcrumbs";

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { PromptTable, type PromptTableRow } from "@/features/ai-results/components/PromptTrackingTable";
import { useShellContext } from "@/features/ai-results/AIResultsShell";
import { aiResultsKeys, useReport, useTrackedPrompts } from "@/features/ai-results/queries";
import { apiGet, apiPost } from "@/services/apiClient";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

type PromptsTabId = "all-prompts" | "prompt-tracking" | "content-opportunities";

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

type PerformanceRange = "weekly" | "monthly" | "quarterly";

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

const PROMPT_TABS: Array<{ id: PromptsTabId; label: string }> = [
  { id: "all-prompts", label: "All Prompts" },
  { id: "prompt-tracking", label: "Prompt Tracking" },
  { id: "content-opportunities", label: "Content Opportunities" },
];

const METRIC_CARDS: MetricCardConfig[] = [
  {
    label: "New Prompts Found",
    tooltip: "How many new prompts were added to the current list.",
    subtitle: "New Prompts added",
    value: "120",
    trend: "+3.2%",
    tone: "positive",
    valueClassName: "text-[#2f6bff]",
  },
  {
    label: "Prompts Tracking",
    tooltip: "How many prompts are currently being monitored.",
    subtitle: "Prompts tracked",
    value: "45",
    trend: "+3.2%",
    tone: "positive",
    valueClassName: "text-[#2f6bff]",
  },
  {
    label: "Gap Opportunities",
    tooltip: "Prompts where coverage is weaker than expected this week.",
    subtitle: "This week",
    value: "+12%",
    trend: "+3.2%",
    tone: "positive",
    valueClassName: "text-[#2f6bff]",
  },
  {
    label: "Top Citations",
    tooltip: "Prompts that lost citations compared with the latest run.",
    subtitle: "Prompts dropped from results",
    value: "5",
    trend: "-0.5%",
    tone: "negative",
    valueClassName: "text-[#B23131]",
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
        value: "45",
        trend: "+3.2%",
        tone: "positive",
        valueClassName: "text-[#2f6bff]",
      },
      {
        label: "Average Visibility",
        tooltip: "Average visibility across all AI models.",
        subtitle: "Across all AI models",
        value: "68%",
        trend: "+3.2%",
        tone: "positive",
        valueClassName: "text-[#2f6bff]",
      },
      {
        label: "Prompts Gained",
        tooltip: "The share of prompts that improved this week.",
        subtitle: "This week",
        value: "+12%",
        trend: "+3.2%",
        tone: "positive",
        valueClassName: "text-[#2f6bff]",
      },
      {
        label: "Prompts Lost",
        tooltip: "Prompt rows that dropped from results.",
        subtitle: "Prompts dropped from results",
        value: "5",
        trend: "-0.5%",
        tone: "negative",
        valueClassName: "text-[#c81e1e]",
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
        value: "45",
        trend: "+8.6%",
        tone: "positive",
        valueClassName: "text-[#2f6bff]",
        showTrend: false,
      },
      {
        label: "Content Ideas Ready",
        tooltip: "High-confidence content opportunities ready to work on.",
        subtitle: "Ready to review",
        value: "16",
        trend: "+3.4%",
        tone: "positive",
        valueClassName: "text-[#2f6bff]",
        showTrend: false,
      },
      {
        label: "Content Drafts Ready",
        tooltip: "Content opportunities ready to turn into drafts.",
        subtitle: "Ready to brief",
        value: "9",
        trend: "+1.2%",
        tone: "warning",
        valueClassName: "text-[#b45309]",
        showTrend: false,
      },
      {
        label: "Projected Lift",
        tooltip: "Estimated visibility lift if the opportunities are created.",
        subtitle: "Estimated if published",
        value: "+12%",
        trend: "+0.9%",
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
  // weekly/monthly/quarterly aggregation lands.
  toggle: [
    { id: "weekly", label: "Weekly" },
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
  return MODEL_LABELS[model.toLowerCase()] ?? model.charAt(0).toUpperCase() + model.slice(1);
}

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
  const [range, setRange] = useState<PerformanceRange>("weekly");

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
    // Week-over-week movers among tracked prompts (delta is null until ≥2
    // weekly runs exist, so those rows count toward neither gained nor lost).
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

// Map the /report response's topPrompts (already PromptTableRow-shaped) into
// table rows. Keyword rollup rows are dropped — these tables show individual
// prompts only. Falls back to an empty list while loading or on error.
function mapReportRows(data: any): PromptTableRow[] {
  const rows = Array.isArray(data?.topPrompts) ? data.topPrompts : [];
  return (rows as PromptTableRow[]).filter((r) => r.type === "prompt");
}

// /tracked-prompts returns rows already shaped for the table plus tracking
// metadata (isTracked / lastTestedAt / weekTrend).
function mapTrackedRows(data: any): PromptTableRow[] {
  const rows = Array.isArray(data?.prompts) ? data.prompts : [];
  return rows as PromptTableRow[];
}

function PromptsTabBody({
  tabId,
  domainId,
  loading,
  isError,
  rows,
  onRetry,
  onTestNow,
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
            Tracked prompts are automatically re-tested every week. Trends update after each weekly run.
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
            Mark prompts for weekly tracking from the All Prompts tab to start seeing week-over-week trends here.
          </p>
        </div>
      ) : (
        <PromptTable
          data={rows}
          title={isTracking ? "Tracked Prompts" : "Trending Prompts"}
          domainId={domainId}
          trackedFilterOnly={isTracking}
          showMonitorAllButton={!isTracking}
          showPromptCategoryDropdown={!isTracking}
        />
      )}
    </div>
  );
}

const PromptsPage = () => {
  const { currentDomain } = useShellContext();
  const domainId = currentDomain?.id ?? null;
  const [activeTab, setActiveTab] = useState<PromptsTabId>("all-prompts");
  const [testingNow, setTestingNow] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const reportQuery = useReport<any>(domainId);
  const trackedQuery = useTrackedPrompts<any>(domainId);

  const reportRows = useMemo(() => mapReportRows(reportQuery.data), [reportQuery.data]);
  const trackedRows = useMemo(() => mapTrackedRows(trackedQuery.data), [trackedQuery.data]);

  // Real, data-derived KPI cards for the All Prompts tab. Each value comes from
  // data the page already fetches (/report + /tracked-prompts) — no fabricated
  // numbers, and trend badges are hidden since there's no stored period-over-
  // period history for these card-level totals.
  const allPromptsCards = useMemo<MetricCardConfig[]>(() => {
    const base =
      TAB_CONFIGS["all-prompts"].kind === "cards" ? TAB_CONFIGS["all-prompts"].kpis : [];

    // Card 1 — prompts added since the previous audit run (server-computed; 0
    // when there's no prior run to diff against).
    const newPrompts = Number(reportQuery.data?.metrics?.newPromptsSinceLastRun ?? 0);
    // Card 2 — prompts currently marked for weekly tracking.
    const trackedCount = trackedRows.length;
    // Card 3 — "gap" prompts: visibility (sov) below 30%.
    const gapCount = reportRows.filter((r) => {
      const v = Number.parseInt(String(r.sov ?? ""), 10);
      return Number.isFinite(v) && v < 30;
    }).length;
    // Card 4 — tracked prompts whose visibility dropped week-over-week.
    const droppedCount = trackedRows.filter(
      (r) => r.weekTrend?.delta != null && r.weekTrend.delta < 0,
    ).length;

    const valueByLabel: Record<string, string> = {
      "New Prompts Found": String(newPrompts),
      "Prompts Tracking": String(trackedCount),
      "Gap Opportunities": String(gapCount),
      "Top Citations": String(droppedCount),
    };

    return base.map((card) => ({
      ...card,
      value: valueByLabel[card.label] ?? card.value,
      showTrend: false,
    }));
  }, [reportQuery.data, reportRows, trackedRows]);

  // Real KPI cards for the Content Opportunities tab, derived from the
  // /report `opportunities` list (heuristic gaps enriched with a brief).
  // "Projected Lift" is dropped — there's no model or stored estimate for it.
  const contentOppsCards = useMemo<MetricCardConfig[]>(() => {
    const base =
      TAB_CONFIGS["content-opportunities"].kind === "cards"
        ? TAB_CONFIGS["content-opportunities"].kpis
        : [];
    const opportunities: any[] = Array.isArray(reportQuery.data?.opportunities)
      ? reportQuery.data.opportunities
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
  }, [reportQuery.data]);

  // Cancel any in-flight poll when the domain changes or the page unmounts.
  const pollRef = useRef<{ cancelled: boolean } | null>(null);
  useEffect(() => {
    return () => { if (pollRef.current) pollRef.current.cancelled = true; };
  }, [domainId]);

  const handleTestNow = async () => {
    if (!domainId || testingNow) return;
    setTestingNow(true);
    // latestRunAt advances only when a weekly run COMPLETES, so it's our
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

  const tabData = (tabId: PromptsTabId) => {
    if (tabId === "prompt-tracking") {
      return {
        rows: trackedRows,
        loading: trackedQuery.isLoading || domainId == null,
        isError: trackedQuery.isError,
        onRetry: () => queryClient.invalidateQueries({ queryKey: aiResultsKeys.trackedPrompts(domainId ?? "none") }),
      };
    }
    return {
      rows: reportRows,
      loading: reportQuery.isLoading || domainId == null,
      isError: reportQuery.isError,
      onRetry: () => queryClient.invalidateQueries({ queryKey: aiResultsKeys.report(domainId ?? "none") }),
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
                testingNow={testingNow}
                kpiOverride={
                  tab.id === "all-prompts"
                    ? allPromptsCards
                    : tab.id === "content-opportunities"
                      ? contentOppsCards
                      : undefined
                }
              />
            </TabsContent>
          );
        })}
      </Tabs>
    </section>
  );
};

export default PromptsPage;
