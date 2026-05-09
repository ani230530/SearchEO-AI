/**
 * TrackKeywordsPage — real per-keyword visibility tracking.
 *
 * Mirrors TrackPromptsPage but scoped to keyword rows from /report. Adds
 * the same trend chart (presence-rate% across past audits, time-window
 * filtered), the same run picker, and the same empty states. The expanded
 * row inside KeywordTrackingTable now fetches /history per keyword.
 */
import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceDot,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { Calendar, ChevronDown, Info, Plus, RefreshCw } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AIResultsLayout } from "@/features/ai-results/components/AIResultsLayout";
import { apiGet } from "@/services/apiClient";
import { KeywordTrackingTable, type KeywordTableRow } from "@/features/ai-results/components/KeywordTrackingTable";
import { maskDomainId, unmaskDomainId } from "@/lib/domainUtils";

type DashboardDomain = { createdAt: string; id: number; url: string };
type DashboardAllResponse = { domains?: DashboardDomain[] };

type ReportKeyword = {
  id: string;
  rawId?: number;
  type: "prompt" | "keyword";
  phrase: string;
  sov: string;
  mentions: number;
  bestRank: number;
  avgSentiment: number | null;
  competitors: string[];
  competitorCount: number;
  results: Array<{
    id: string;
    model: string;
    presence?: number;
    sentiment?: number | null;
    accuracy?: number | null;
    overall?: number | null;
    relevance?: number;
    response?: string;
    citations?: Array<{ title?: string; url: string; snippet?: string }>;
    sources?: string[];
  }>;
};

type ReportResponse = {
  id: number | null;
  domainInfo: { id: number; url: string; host: string };
  topPrompts?: ReportKeyword[];
};

type RunListItem = { id: number; status: string; startedAt: string; visibilityScore: number | null; totalQueries: number | null };
type TrendsRun = {
  runId: number;
  startedAt: string;
  perModel: Record<string, { cites: number; presenceCount: number }>;
  brandMentions: number;
  competitorMentions: number;
};
type TrendsResponse = { runs: TrendsRun[] };

const TIME_WINDOWS: Array<{ label: string; days: number | null }> = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
  { label: "All time", days: null },
];

const formatRunDate = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

const KeywordVisibilityTrendsChart = ({
  trendRuns,
  timeWindowLabel,
  onTimeWindowChange,
}: {
  trendRuns: TrendsRun[];
  timeWindowLabel: string;
  onTimeWindowChange: (label: string) => void;
}) => {
  const chartData = trendRuns.map((r, i) => {
    const total = r.brandMentions + r.competitorMentions;
    const rate = total > 0 ? Math.round((r.brandMentions / total) * 100) : 0;
    return { x: i, presence: rate, label: formatRunDate(r.startedAt) };
  });
  const ticks = chartData.length > 0
    ? Array.from(new Set([0, Math.floor(chartData.length / 3), Math.floor((2 * chartData.length) / 3), chartData.length - 1])).filter((n) => n >= 0)
    : [];
  const lastIdx = chartData.length - 1;
  const emptyMessage = trendRuns.length === 0
    ? "No completed audits in this window"
    : trendRuns.length === 1
      ? "Trend appears after your next audit"
      : null;

  return (
    <section className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-[18px] font-semibold leading-none text-[#394150]">Keyword Visibility Trends</h2>
            <Info className="h-4 w-4 text-slate-400" />
          </div>
          <p className="mt-2 text-[13px] text-[#6b7280]">
            What % of model responses mentioned your brand for tracked keywords, per audit.
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="h-10 rounded-[10px] border-[#d9e0eb] px-4 text-[12px] text-[#667085] shadow-none">
              {timeWindowLabel}
              <ChevronDown className="ml-2 h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[140px]">
            {TIME_WINDOWS.map((w) => (
              <DropdownMenuItem key={w.label} onClick={() => onTimeWindowChange(w.label)}>
                {w.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex flex-wrap gap-4 text-[11px] text-[#6b7280]">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-[10px] w-[10px] rounded-[2px] border border-[#d8dee8] bg-[#a6c5ff]" />
          Brand presence %
        </span>
      </div>

      <div className="relative h-[260px] w-full">
        {emptyMessage ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <span className="rounded-full bg-white/95 border border-slate-200 px-3 py-1.5 text-[12px] text-slate-500 shadow-sm">
              {emptyMessage}
            </span>
          </div>
        ) : null}
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 16, right: 18, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="track-keywords-visibility" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#a6c5ff" stopOpacity={0.6} />
                <stop offset="100%" stopColor="#a6c5ff" stopOpacity={0.18} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="#ddd6cf" strokeDasharray="2 4" />
            <XAxis
              dataKey="x"
              type="number"
              domain={[0, Math.max(0, chartData.length - 1)]}
              ticks={ticks}
              tickFormatter={(value) => chartData[value]?.label ?? ""}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "#8b97a7", fontSize: 12 }}
            />
            <YAxis
              orientation="right"
              tickLine={false}
              axisLine={false}
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              tickFormatter={(v) => `${v}%`}
              tick={{ fill: "#bcc3cf", fontSize: 12 }}
            />
            {lastIdx >= 0 ? (
              <ReferenceDot x={lastIdx} y={chartData[lastIdx]?.presence ?? 0} r={5} fill="#5d8ad6" stroke="#ffffff" strokeWidth={2} />
            ) : null}
            <Area
              type="monotone"
              dataKey="presence"
              stroke="#7ea4e0"
              strokeWidth={1.5}
              fill="url(#track-keywords-visibility)"
              dot={false}
              activeDot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
};

const TrackKeywordsPage = () => {
  const navigate = useNavigate();
  const { domain: maskedDomainId } = useParams();

  const [allDomains, setAllDomains] = useState<DashboardDomain[]>([]);
  const [domainInfo, setDomainInfo] = useState<DashboardDomain | null>(null);
  const [reportData, setReportData] = useState<ReportResponse | null>(null);
  const [pastRuns, setPastRuns] = useState<RunListItem[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [trendsRuns, setTrendsRuns] = useState<TrendsRun[]>([]);
  const [timeWindow, setTimeWindow] = useState<string>("All time");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (maskedDomainId) localStorage.setItem("ai-visibility:lastDomainSlug", maskedDomainId);
  }, [maskedDomainId]);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      if (!maskedDomainId) return;
      setLoading(true);
      setErrorMsg(null);
      try {
        let realId = unmaskDomainId(maskedDomainId);
        const domainsResp = await apiGet<DashboardAllResponse>("/wizard/domains");
        const domains = domainsResp?.domains ?? [];
        if (!alive) return;
        setAllDomains(domains);
        if (!realId) {
          const matched = domains.find((d) => maskDomainId(d.id) === maskedDomainId);
          realId = matched?.id ?? null;
        }
        if (!realId) {
          setLoading(false);
          return;
        }
        const reportPath = selectedRunId
          ? `/wizard/domain/${realId}/report?runId=${selectedRunId}`
          : `/wizard/domain/${realId}/report`;
        const [report, runsResp, trendsResp] = await Promise.all([
          apiGet<ReportResponse>(reportPath),
          apiGet<{ runs: RunListItem[] }>(`/wizard/domain/${realId}/runs`).catch(() => ({ runs: [] })),
          apiGet<TrendsResponse>(`/wizard/domain/${realId}/trends`).catch(() => ({ runs: [] })),
        ]);
        if (!alive) return;
        setReportData(report);
        setDomainInfo({ id: report.domainInfo.id, url: report.domainInfo.url, createdAt: "" });
        setPastRuns((runsResp?.runs ?? []).filter((r) => r.status === "completed"));
        setTrendsRuns(trendsResp?.runs ?? []);
      } catch (err) {
        if (alive) setErrorMsg(err instanceof Error ? err.message : "Failed to load");
      } finally {
        if (alive) setLoading(false);
      }
    };
    run();
    return () => { alive = false; };
  }, [maskedDomainId, selectedRunId]);

  const filteredTrendRuns = useMemo(() => {
    const w = TIME_WINDOWS.find((x) => x.label === timeWindow);
    if (!w || w.days === null) return trendsRuns;
    const cutoff = Date.now() - w.days * 24 * 3600 * 1000;
    return trendsRuns.filter((r) => new Date(r.startedAt).getTime() >= cutoff);
  }, [trendsRuns, timeWindow]);

  const keywordRows = useMemo<KeywordTableRow[]>(() => {
    const items = (reportData?.topPrompts ?? []) as ReportKeyword[];
    return items
      .filter((k) => k.type === "keyword")
      .filter((k) => Array.isArray(k.results) && k.results.length > 0)
      .map((k) => ({
        id: k.id,
        rawId: k.rawId,
        type: k.type,
        phrase: k.phrase,
        sov: k.sov,
        mentions: k.mentions,
        bestRank: k.bestRank,
        avgSentiment: k.avgSentiment,
        competitors: k.competitors,
        competitorCount: k.competitorCount,
        results: k.results.map((r) => ({
          id: r.id,
          model: r.model,
          accuracy: r.accuracy ?? undefined,
          citations: r.citations ?? [],
          overall: r.overall ?? undefined,
          phrase: k.phrase,
          presence: r.presence ?? 0,
          relevance: r.relevance ?? undefined,
          response: r.response,
          sentiment: r.sentiment ?? undefined,
          sources: r.sources ?? [],
        })),
      }));
  }, [reportData]);

  const selectedRunLabel = !selectedRunId
    ? "Latest"
    : new Date(pastRuns.find((r) => r.id === selectedRunId)?.startedAt ?? Date.now())
        .toLocaleDateString(undefined, { month: "short", day: "numeric" });

  const showZeroAuditState = !loading && reportData !== null && pastRuns.length === 0;
  const showZeroKeywordsState = !loading && reportData !== null && pastRuns.length > 0 && keywordRows.length === 0;

  return (
    <AIResultsLayout
      activeItem="top-keywords"
      allDomains={allDomains}
      currentDomainId={domainInfo?.id}
      currentDomainUrl={domainInfo?.url}
      maskedDomainId={maskedDomainId}
      title="Track Keywords"
    >
      <section className="flex w-full flex-col gap-6 bg-white px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[12px] text-[#475569]">
            <Calendar className="h-4 w-4 text-slate-400" />
            <span>Showing audit:</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-8 rounded-[8px] border-[#d7dde7] bg-white px-2.5 text-[12px] font-medium text-[#475569] shadow-none">
                  {selectedRunLabel}
                  <ChevronDown className="ml-1.5 h-3.5 w-3.5 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[260px] p-1.5">
                <DropdownMenuItem onClick={() => setSelectedRunId(null)} className="rounded-md px-3 py-2">
                  <span className="text-[12px] font-medium">Latest</span>
                </DropdownMenuItem>
                {pastRuns.length > 0 ? <DropdownMenuSeparator /> : null}
                {pastRuns.map((r) => (
                  <DropdownMenuItem key={r.id} onClick={() => setSelectedRunId(r.id)} className="rounded-md px-3 py-2">
                    <div className="flex flex-col">
                      <span className="text-[12px] font-medium text-slate-900">
                        {new Date(r.startedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {r.visibilityScore !== null ? `${Math.round(r.visibilityScore)}% visibility` : "—"} · {r.totalQueries ?? "—"} queries
                      </span>
                    </div>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {errorMsg ? <span className="text-[11px] text-rose-500">{errorMsg}</span> : null}
        </div>

        {showZeroAuditState ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/40 px-8 py-16 text-center">
            <h3 className="text-[18px] font-semibold text-slate-700">No audits yet for this domain</h3>
            <p className="text-[13px] text-slate-500">Run an audit so we can measure which keywords surface your brand in AI answers.</p>
            <Button
              onClick={() => domainInfo?.id ? navigate(`/ai-checker-v2?domain=${domainInfo.id}`) : navigate("/ai-checker-v2")}
              className="mt-2 h-10 rounded-lg bg-gradient-to-r from-[#2D4059] to-[#4C74C2] px-4 text-white"
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Run an audit
            </Button>
          </div>
        ) : showZeroKeywordsState ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/40 px-8 py-16 text-center">
            <h3 className="text-[18px] font-semibold text-slate-700">No keywords tracked in this audit</h3>
            <p className="text-[13px] text-slate-500">Pick prompts grouped by keyword in the wizard so this view has data to roll up.</p>
            <Button
              onClick={() => domainInfo?.id ? navigate(`/ai-checker-v2?domain=${domainInfo.id}&restart=topics`) : navigate("/ai-checker-v2")}
              className="mt-2 h-10 rounded-lg bg-gradient-to-r from-[#2D4059] to-[#4C74C2] px-4 text-white"
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Pick prompts
            </Button>
          </div>
        ) : (
          <>
            <KeywordVisibilityTrendsChart
              trendRuns={filteredTrendRuns}
              timeWindowLabel={timeWindow}
              onTimeWindowChange={setTimeWindow}
            />
            {loading ? (
              <div className="h-[400px] w-full animate-pulse rounded-xl border border-slate-200 bg-slate-50" />
            ) : (
              <KeywordTrackingTable data={keywordRows} title="Keywords Tracking" domainId={domainInfo?.id} />
            )}
          </>
        )}
      </section>
    </AIResultsLayout>
  );
};

export default TrackKeywordsPage;
