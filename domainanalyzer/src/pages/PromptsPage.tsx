import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowDownRight,
  ArrowUpRight,
  Info,
} from "lucide-react";
import { resolveAIResultsNavigation } from "@/features/sidebar-dashboard/navigation";

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
  series: Record<PerformanceRange, PerformanceRowConfig[]>;
};

const PERFORMANCE_ROW_ICON_SRC: Record<string, string> = {
  "AI Overview": "/overview-avatar-label-group.svg",
  ChatGPT: "/report-icons/chat-gpt.svg",
  Claude: "/report-icons/claude.svg",
  Gemini: "/report-icons/gemini.svg",
};

const getPerformanceRowIconSrc = (label: string): string | null => {
  return PERFORMANCE_ROW_ICON_SRC[label] ?? null;
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
    valueClassName: "text-[#3393F2]",
  },
  {
    label: "Prompts Tracking",
    tooltip: "How many prompts are currently being monitored.",
    subtitle: "Prompts tracked",
    value: "45",
    trend: "+3.2%",
    tone: "positive",
    valueClassName: "text-[#3393F2]",
  },
  {
    label: "Gap Opportunities",
    tooltip: "Prompts where coverage is weaker than expected this week.",
    subtitle: "This week",
    value: "+12%",
    trend: "+3.2%",
    tone: "positive",
    valueClassName: "text-[#3393F2]",
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
        valueClassName: "text-[#3393F2]",
      },
      {
        label: "Average Visibility",
        tooltip: "Average visibility across all AI models.",
        subtitle: "Across all AI models",
        value: "68%",
        trend: "+3.2%",
        tone: "positive",
        valueClassName: "text-[#3393F2]",
      },
      {
        label: "Prompts Gained",
        tooltip: "The share of prompts that improved this week.",
        subtitle: "This week",
        value: "+12%",
        trend: "+3.2%",
        tone: "positive",
        valueClassName: "text-[#3393F2]",
      },
      {
        label: "Prompts Lost",
        tooltip: "Prompt rows that dropped from results.",
        subtitle: "Prompts dropped from results",
        value: "5",
        trend: "-0.5%",
        tone: "negative",
        valueClassName: "text-[#B23131]",
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
        valueClassName: "text-[#3393F2]",
        showTrend: false,
      },
      {
        label: "Content Ideas Ready",
        tooltip: "High-confidence content opportunities ready to work on.",
        subtitle: "Ready to review",
        value: "16",
        trend: "+3.4%",
        tone: "positive",
        valueClassName: "text-[#3393F2]",
        showTrend: false,
      },
      {
        label: "Content Drafts Ready",
        tooltip: "Content opportunities ready to turn into drafts.",
        subtitle: "Ready to brief",
        value: "9",
        trend: "+1.2%",
        tone: "warning",
        valueClassName: "text-[#B23131]",
        showTrend: false,
      },
      {
        label: "Projected Lift",
        tooltip: "Estimated visibility lift if the opportunities are created.",
        subtitle: "Estimated if published",
        value: "+12%",
        trend: "+0.9%",
        tone: "positive",
        valueClassName: "text-[#3393F2]",
        showTrend: false,
      },
    ],
  },
};

const PROMPT_TRACKING_PERFORMANCE: PerformanceConfig = {
  title: "Performance over LLMs",
  tooltip: "Compare how AI models are surfacing your prompts across the selected period.",
  toggle: [
    { id: "weekly", label: "Weekly" },
    { id: "monthly", label: "Monthly" },
    { id: "quarterly", label: "Quarterly" },
  ],
  series: {
    weekly: [
      { label: "AI Overview", value: "33.2k", percent: 60, barClassName: "bg-[#7395dd]" },
      { label: "ChatGPT", value: "12.5k", percent: 20, barClassName: "bg-[#8aa6e8]" },
      { label: "Claude", value: "4.3k", percent: 10, barClassName: "bg-[#9ab5ef]" },
      { label: "Gemini", value: "1.5k", percent: 5, barClassName: "bg-[#b0c2f2]" },
    ],
    monthly: [
      { label: "AI Overview", value: "34.1k", percent: 58, barClassName: "bg-[#7395dd]" },
      { label: "ChatGPT", value: "13.8k", percent: 22, barClassName: "bg-[#8aa6e8]" },
      { label: "Claude", value: "4.8k", percent: 10, barClassName: "bg-[#9ab5ef]" },
      { label: "Gemini", value: "1.7k", percent: 5, barClassName: "bg-[#b0c2f2]" },
    ],
    quarterly: [
      { label: "AI Overview", value: "31.9k", percent: 62, barClassName: "bg-[#7395dd]" },
      { label: "ChatGPT", value: "9.3k", percent: 18, barClassName: "bg-[#8aa6e8]" },
      { label: "Claude", value: "4.1k", percent: 10, barClassName: "bg-[#9ab5ef]" },
      { label: "Gemini", value: "2.0k", percent: 5, barClassName: "bg-[#b0c2f2]" },
    ],
  },
};

const PROMPT_PHRASES = [
  "Compare Semrush, Ahrefs, AtheneHQ in AI keyword research software results",
  "Best SEO tools for AI visibility tracking in 2026",
  "How to improve brand citations in AI answers",
  "Top content gap opportunities for SaaS visibility",
  "Which platforms mention our brand the most?",
  "Prompts that uncover competitor citations in AI search",
  "High intent prompts for AI content discovery",
  "Prompt ideas for ranking content opportunities",
  "AI visibility monitoring prompts for marketing teams",
  "Best alternatives for prompt tracking dashboards",
];

const MODEL_IDS = [
  "openai/gpt-4o-mini",
  "anthropic/claude-3.5-haiku",
  "google/gemini-2.0-flash-001",
];

const makeResult = (promptIndex: number, modelIndex: number) => ({
  id: `prompt-${promptIndex}-model-${modelIndex}`,
  model: MODEL_IDS[modelIndex],
  presence: promptIndex % 4 === 0 ? 0 : modelIndex < 2 ? 1 : 0,
  rankPosition: modelIndex === 0 ? 16 + promptIndex : undefined,
  accuracy: 72 - modelIndex * 4,
  overall: 76 - modelIndex * 3,
  relevance: 84 - modelIndex * 2,
  response: "Dummy response content for the prompt tracking shell.",
  sentiment: promptIndex % 4 === 0 ? null : modelIndex === 2 ? -0.2 : 0.7,
  sources: [`example-source-${promptIndex + 1}.com`],
  citations: [
    {
      title: "Example source",
      url: `https://example.com/source-${promptIndex + 1}`,
      snippet: "Dummy citation used to populate the prompts table shell.",
    },
  ],
});

const DUMMY_PROMPT_ROWS: PromptTableRow[] = PROMPT_PHRASES.map((phrase, index) => {
  const results = MODEL_IDS.map((_, modelIndex) => makeResult(index, modelIndex));
  const mentions = results.filter((result) => (result.presence ?? 0) > 0).length;
  const avgSentiment = mentions === 0
    ? null
    : index % 3 === 0
      ? 7.8
      : index % 3 === 1
        ? 5.9
        : 3.6;

  return {
    id: `prompt-row-${index + 1}`,
    rawId: 1000 + index,
    type: "prompt",
    phrase,
    sov: `${12 + index}%`,
    mentions,
    bestRank: 16 + index,
    avgSentiment,
    competitors: ["Semrush", "Ahrefs", "AtheneHQ"],
    competitorCount: 3,
    results,
  };
});

function MetricTooltip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex h-3 w-3 items-center justify-center rounded-full text-slate-400 transition hover:text-slate-600"
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
            <h3 className="truncate text-base font-semibold text-slate-600">{label}</h3>
            <MetricTooltip text={tooltip} />
          </div>
          <p className="mt-2 text-xs font-medium text-slate-600">{subtitle}</p>
        </div>
        {showTrend ? (
          <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium", toneClasses)}>
            <TrendIcon className="h-3 w-3" />
            {trend}
          </span>
        ) : null}
      </div>

      <div className={cn("mt-2 flex items-end justify-between gap-4", showTrend ? "" : "pt-0.5")}>
        <div className={cn("text-2xl font-semibold leading-none tracking-[-0.04em]", valueClassName)}>
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
  config,
  range,
  onRangeChange,
}: {
  config: PerformanceConfig;
  range: PerformanceRange;
  onRangeChange: (value: PerformanceRange) => void;
}) {
  const rows = config.series[range];

  return (
    <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className="text-[15px] font-semibold leading-tight text-slate-700">{config.title}</h3>
              <MetricTooltip text={config.tooltip} />
            </div>
            <div className="mt-4">
              <PerformanceRangeToggle value={range} onChange={onRangeChange} items={config.toggle} />
            </div>
          </div>
        </div>

        <div className="mt-5 space-y-3.5">
          {rows.map((row) => (
            <div key={row.label} className="grid grid-cols-[minmax(0,132px)_minmax(0,1fr)_auto_auto] items-center gap-3">
              <div className="flex min-w-0 items-center gap-2">
                {getPerformanceRowIconSrc(row.label) ? (
                  <img
                    src={getPerformanceRowIconSrc(row.label) ?? undefined}
                    alt={row.label}
                    aria-hidden="true"
                    className="h-4 w-4 shrink-0 object-contain"
                  />
                ) : (
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded text-[10px] font-semibold text-slate-500">
                    •
                  </span>
                )
                }
                <span className="truncate text-[12px] font-medium text-slate-600">{row.label}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                <div className={cn("h-full rounded-full", row.barClassName)} style={{ width: `${row.percent}%` }} />
              </div>
              <span className="text-[12px] font-medium text-[#3393f2] tabular-nums">{row.value}</span>
              <span className="text-[11px] font-medium text-slate-500 tabular-nums">{row.percent}%</span>
            </div>
          ))}
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

function PromptTrackingKpiPanel({ loading }: { loading: boolean }) {
  const [range, setRange] = useState<PerformanceRange>("weekly");

  return loading ? (
    <PromptTrackingKpiSkeleton />
  ) : (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
      <PromptTrackingPerformanceCard config={PROMPT_TRACKING_PERFORMANCE} range={range} onRangeChange={setRange} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {TAB_CONFIGS["prompt-tracking"].kind === "tracking"
          ? TAB_CONFIGS["prompt-tracking"].summaryCards.map((metric) => (
              <MetricCard key={metric.label} {...metric} />
            ))
          : null}
      </div>
    </div>
  );
}

function PromptsTabBody({
  tabId,
  domainId,
  loading,
}: {
  tabId: PromptsTabId;
  domainId: number | null;
  loading: boolean;
}) {
  const tabConfig = TAB_CONFIGS[tabId];

  return (
    <div className="space-y-6">
      <TooltipProvider delayDuration={120}>
        {tabConfig.kind === "tracking" ? (
          <PromptTrackingKpiPanel loading={loading} />
        ) : (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
            {loading
              ? tabConfig.kpis.map((metric) => (
                  <MetricCardSkeleton key={metric.label} showTrend={metric.showTrend ?? true} />
                ))
              : tabConfig.kpis.map((metric) => (
                  <MetricCard key={metric.label} {...metric} />
                ))}
          </div>
        )}
      </TooltipProvider>

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="space-y-4">
            <div className="h-6 w-48 animate-pulse rounded bg-slate-200" />
            <div className="h-4 w-80 animate-pulse rounded bg-slate-200" />
            <div className="h-[420px] rounded-xl border border-slate-200 bg-slate-50/70" />
          </div>
        </div>
      ) : (
        <PromptTable
          data={DUMMY_PROMPT_ROWS}
          title="Trending Prompts"
          domainId={domainId}
          showMonitorAllButton={tabId !== "prompt-tracking"}
          showPromptCategoryDropdown={tabId !== "prompt-tracking"}
        />
      )}
    </div>
  );
}

const PromptsPage = () => {
  const { currentDomain, maskedDomainId } = useShellContext();
  const domainId = currentDomain?.id ?? null;
  const [searchParams] = useSearchParams();
  
  // URL-driven tab state
  const activeTab = (searchParams.get("tab") as PromptsTabId) || "all-prompts";

  // Dummy-data first. Keep the loading branch in place so real data wiring
  // can drop in later without reshaping the component tree.
  const loading = false;

  return (
    <section className="w-full bg-white px-6 pb-6 pt-2">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex h-auto gap-1 rounded-[14px] bg-transparent p-0">
            {PROMPT_TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              const targetPath = maskedDomainId 
                ? resolveAIResultsNavigation("prompts", maskedDomainId, tab.id)
                : "#";

              return (
                <Link
                  key={tab.id}
                  to={targetPath}
                  className={cn(
                    "rounded-[10px] px-4 py-2 text-[13px] font-medium transition",
                    isActive 
                      ? "bg-[#F1F6FF] border-b-2 border-[#7E9BD7]" 
                      : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                  )}
                >
                  {tab.label}
                </Link>
              );
            })}
          </div>
        </div>

        <div className="mt-0">
          <PromptsTabBody tabId={activeTab} domainId={domainId} loading={loading} />
        </div>
      </div>
    </section>
  );
};

export default PromptsPage;

