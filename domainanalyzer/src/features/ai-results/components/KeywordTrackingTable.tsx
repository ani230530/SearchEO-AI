import { Fragment, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiGet, apiPost } from "@/services/apiClient";
import { useToast } from "@/components/ui/use-toast";
import { maskDomainId } from "@/lib/domainUtils";
import ReactMarkdown from "react-markdown";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceDot,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlignLeft,
  ArrowUp,
  Bot,
  Calendar,
  ChevronDown,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  Filter,
  Globe2,
  Info,
  Languages,
  LayoutGrid,
  Link2,
  Loader2,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
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

export type KeywordModelResult = {
  accuracy?: number;
  citations?: Array<{ title?: string; url: string; citedText?: string; snippet?: string; content?: string }>;
  id: string;
  model: string;
  overall?: number;
  phrase?: string;
  presence?: number;
  relevance?: number;
  response?: string;
  sentiment?: number;
  sources?: string[];
};

export type KeywordTableRow = {
  /** 0..10 average across rows where the brand was mentioned. null when nothing was measurable. */
  avgSentiment: number | null;
  bestRank: number;
  competitorCount: number;
  competitors: string[];
  id: string;
  /** Raw DB id (Keyword.id) — used by the expanded row to fetch /history. */
  rawId?: number;
  mentions: number;
  phrase: string;
  results: KeywordModelResult[];
  sov: string;
  type: "prompt" | "keyword";
};

type ProcessedKeywordResult = KeywordModelResult & {
  citations: Array<{ title?: string; url: string; citedText?: string; snippet?: string; content?: string }>;
  displayAccuracy: number | null;
  displayOverall: number | null;
  displayRelevance: number | null;
  displaySentiment: number | null;
  mentioned: boolean;
  presence: number;
  sources: string[];
};

// detailGraphData / detailGraphTicks / detailGraphHighlight removed —
// the keyword detail chart now derives from the live /history endpoint
// (see KeywordVisibilityComparisonGraph below).

const getSentimentColor = (sentiment: string) => {
  const s = sentiment.toLowerCase();
  if (s === "positive") return "bg-[#e6f4ea] text-[#1e8e3e] border border-[#a8dab5]";
  if (s === "neutral") return "bg-blue-50 text-blue-600 border border-blue-200";
  if (s === "negative") return "bg-amber-50 text-amber-600 border border-amber-200";
  return "bg-slate-50 text-slate-500 border border-slate-200";
};

const getModelIcon = (model?: string, size: "sm" | "md" = "sm") => {
  const className = size === "md" ? "h-4.5 w-4.5" : "h-4 w-4";
  if (!model) return <Bot className={`${className} text-gray-400`} />;
  const normalized = model.toLowerCase();
  if (normalized.includes("gpt")) return <Bot className={`${className} text-[#16a34a]`} />;
  if (normalized.includes("claude")) return <Sparkles className={`${className} text-[#d97706]`} />;
  if (normalized.includes("gemini")) return <Globe2 className={`${className} text-[#2563eb]`} />;
  if (normalized.includes("deep")) return <Zap className={`${className} text-[#4f46e5]`} />;
  return <Zap className={`${className} text-purple-500`} />;
};

const CitationCard = () => (
  <div className="rounded-[6px] border border-[#e2e8f0] p-2.5 bg-white">
    <h4 className="text-[10px] font-semibold text-[#334155] mb-1.5 leading-snug">
      Understanding G2 Reviews: A<br />Comprehensive Guide
    </h4>
    <p className="text-[8.5px] text-[#94a3b8] leading-[1.4] mb-2.5">
      G2 reviews revolutionize business software by offering real-world insights into tools' performance, user experience, and satisfaction. Their transparency helps businesses make informed ...
    </p>
    <div className="flex gap-1.5">
      <div className="inline-flex items-center gap-1 bg-[#eff6ff] text-[#3b82f6] px-2 py-1 rounded-[4px] text-[8px] font-medium">
        Visit Source <Link2 className="h-2 w-2" />
      </div>
      <div className="inline-flex items-center gap-1 border border-[#e2e8f0] text-[#64748b] px-2 py-1 rounded-[4px] text-[8px] font-medium">
        In-Direct Citation
      </div>
    </div>
  </div>
);

/** Friendly model label — mirrors the prompt-table mapping. */
const getKeywordModelLabel = (model?: string): string => {
  if (!model) return "Unknown model";
  const lower = model.toLowerCase();
  if (/gpt|openai/.test(lower)) return "ChatGPT";
  if (/claude|anthropic/.test(lower)) return "Claude";
  if (/gemini|google/.test(lower)) return "Gemini";
  if (/deep/.test(lower)) return "DeepSeek";
  return model.replace(/[-_/]/g, " ");
};

/** Real per-model presence rollup for THIS keyword's results. */
const buildKeywordModelPresenceRows = (results: ProcessedKeywordResult[]) => {
  const byModel = new Map<string, { total: number; mentions: number }>();
  for (const r of results) {
    if (!byModel.has(r.model)) byModel.set(r.model, { total: 0, mentions: 0 });
    const slot = byModel.get(r.model)!;
    slot.total += 1;
    slot.mentions += r.presence > 0 ? 1 : 0;
  }
  return Array.from(byModel.entries()).map(([model, v]) => ({
    label: getKeywordModelLabel(model),
    model,
    score: `${v.mentions}/${v.total}`,
  }));
};

/**
 * Per-keyword history chart. Fetches /history for this keyword (which
 * rolls up across all child prompts) and renders presence-rate% over each
 * completed audit run. Same empty-state ladder as the prompt chart.
 */
const KeywordVisibilityComparisonGraph = ({
  results,
  domainId,
  keywordRawId,
}: {
  results: ProcessedKeywordResult[];
  domainId?: number | null;
  keywordRawId?: number | null;
}) => {
  const presenceRows = buildKeywordModelPresenceRows(results);
  const [history, setHistory] = useState<Array<{ runId: number; startedAt: string; presenceRate: number; mentions: number; total: number }>>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!domainId || !keywordRawId) {
      setHistory([]);
      return;
    }
    setLoadingHistory(true);
    apiGet<{ runs: Array<{ runId: number; startedAt: string; presenceRate: number; mentions: number; total: number }> }>(
      `/wizard/domain/${domainId}/keywords/${keywordRawId}/history`
    )
      .then((res) => { if (alive) setHistory(res.runs ?? []); })
      .catch(() => { if (alive) setHistory([]); })
      .finally(() => { if (alive) setLoadingHistory(false); });
    return () => { alive = false; };
  }, [domainId, keywordRawId]);

  const chartData = history.map((h, i) => ({
    x: i,
    presence: h.presenceRate,
    label: new Date(h.startedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
  }));
  const ticks = chartData.length > 0
    ? [0, Math.floor(chartData.length / 2), chartData.length - 1].filter((v, i, a) => a.indexOf(v) === i)
    : [];
  const lastIdx = chartData.length - 1;
  const emptyMessage = !domainId || !keywordRawId
    ? "Open from a tracked domain to see history"
    : loadingHistory
      ? "Loading history…"
      : history.length === 0
        ? "No audit history for this keyword yet"
        : history.length === 1
          ? "Trend appears after your next audit"
          : null;

  return (
    <div className="relative border-r border-[#e7ebf2] pr-3">
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
              <linearGradient id="keyword-detail-fill" x1="0" y1="0" x2="0" y2="1">
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
            <Area dataKey="presence" fill="url(#keyword-detail-fill)" stroke="#83a9da" strokeWidth={1.5} type="monotone" />
            {lastIdx >= 0 ? (
              <ReferenceDot fill="#83a9da" isFront r={4.5} stroke="#83a9da" x={lastIdx} y={chartData[lastIdx]?.presence ?? 0} />
            ) : null}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

const KeywordAIResponsePanel = ({
  results,
  selectedModel,
  setSelectedModel,
}: {
  results: ProcessedKeywordResult[];
  selectedModel: string;
  setSelectedModel: (value: string) => void;
}) => {
  const activeResult = results.find((result) => result.model === selectedModel) || results[0];

  if (!activeResult) return null;

  return (
    <div className="flex flex-col gap-2.5 rounded-[8px] border border-[#e2e8f0] bg-white p-3.5 h-[246px] w-full">
      <div className="flex items-center justify-between pb-0.5">
        <h4 className="text-[12px] font-semibold leading-none text-[#334155]">AI Response</h4>
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-medium text-[#64748b]">Select Model</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="h-[22px] min-w-[90px] justify-between rounded-[4px] border-[#cbd5e1] bg-white px-2 text-[9px] font-medium text-[#475569] shadow-none"
              >
                <span className="flex items-center gap-1.5">
                  <Bot className="h-3 w-3 text-[#10b981]" />
                  {selectedModel}
                </span>
                <ChevronDown className="h-3 w-3 text-[#94a3b8]" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[160px] p-1.5">
              {results.map((result) => (
                <DropdownMenuItem
                  key={result.id}
                  onClick={() => setSelectedModel(result.model)}
                  className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-[10px] font-medium ${
                    result.model === selectedModel ? "bg-gray-50" : ""
                  }`}
                >
                  {getModelIcon(result.model, "sm")}
                  {result.model}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="grid grid-cols-[1.6fr_1fr] gap-3 flex-1 overflow-hidden">
        {/* Left: AI Response Content */}
        <div className="relative rounded-[6px] bg-[#f8fafc] p-3 pr-5 overflow-y-auto scrollbar-none">
          <h3 className="mb-2 text-[12px] font-semibold text-[#1e293b]">
            Free Trial Options for Prototyping Software
          </h3>
          <div className="text-[8.5px] leading-[1.5] text-[#64748b]">
            <p className="mb-2.5">
              Prototyping software is essential for designers and developers to visualize and test their ideas before full-scale development. Many prototyping tools offer free.
            </p>
            <h4 className="mb-2 text-[9px] font-semibold text-[#475569]">
              Popular Prototyping Tools with Free Trials
            </h4>
            <div className="space-y-2.5">
              <div>
                <p className="mb-1 font-semibold text-[#334155]">1. Figma</p>
                <ul className="mb-2 list-outside list-disc space-y-1 pl-4">
                  <li>
                    Free Trial/Plan: <span className="text-[#3b82f6]">Figma</span> offers a free plan that includes basic prototyping features, which is ideal for individuals or small teams.
                  </li>
                  <li>
                    Features: Collaborative design, vector networks, and prototyping capabilities.
                  </li>
                </ul>
                <div className="flex items-center gap-1.5 mt-2">
                  <div className="inline-flex items-center gap-1 rounded-[4px] bg-[#eff6ff] px-1.5 py-1 text-[8px] font-medium text-[#3b82f6]">
                    Figma <ExternalLink className="h-2 w-2" />
                  </div>
                  <div className="inline-flex items-center gap-1 rounded-[4px] bg-[#eff6ff] px-1.5 py-1 text-[8px] font-medium text-[#3b82f6]">
                    Figma's Free Plan <ExternalLink className="h-2 w-2" />
                  </div>
                </div>
              </div>
              <div>
                <p className="font-semibold text-[#334155]">2. Adobe XD</p>
              </div>
            </div>
          </div>
          {/* Scrollbar Mock */}
          <div className="absolute bottom-3 right-1 top-3 w-[3px] rounded-full bg-[#cbd5e1] opacity-60"></div>
        </div>

        {/* Right: Citations */}
        <div className="flex flex-col gap-2 overflow-y-auto scrollbar-none">
          <CitationCard />
          <CitationCard />
        </div>
      </div>
    </div>
  );
};

const KeywordExpandedDetails = ({
  results,
  phrase,
  domainId,
  rawId,
}: {
  results: KeywordModelResult[];
  phrase: string;
  domainId?: number | null;
  rawId?: number | null;
}) => {
  const processedResults = useMemo<ProcessedKeywordResult[]>(() => {
    const grouped = new Map<string, ProcessedKeywordResult>();

    for (const result of results) {
      const existing = grouped.get(result.model);
      const presence = result.presence || 0;
      const citations = Array.isArray(result.citations) ? result.citations : [];
      const sources = Array.isArray(result.sources) ? result.sources : [];

      if (!existing) {
        grouped.set(result.model, {
          ...result,
          accuracy: presence > 0 ? result.accuracy || 0 : 0,
          citations: [...citations],
          displayAccuracy: presence > 0 ? result.accuracy || 0 : null,
          displayOverall: presence > 0 ? result.overall || 0 : null,
          displayRelevance: presence > 0 ? result.relevance || 0 : null,
          displaySentiment: presence > 0 ? result.sentiment || 0 : null,
          mentioned: presence > 0,
          overall: presence > 0 ? result.overall || 0 : 0,
          phrase,
          presence,
          relevance: presence > 0 ? result.relevance || 0 : 0,
          sentiment: presence > 0 ? result.sentiment || 0 : 0,
          sources: [...sources],
        });
        continue;
      }

      existing.presence += presence;
      if (presence > 0) {
        existing.accuracy = (existing.accuracy || 0) + (result.accuracy || 0);
        existing.overall = (existing.overall || 0) + (result.overall || 0);
        existing.relevance = (existing.relevance || 0) + (result.relevance || 0);
        existing.sentiment = (existing.sentiment || 0) + (result.sentiment || 0);
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
      return {
        ...item,
        displayAccuracy: mentions > 0 ? Number(item.accuracy || 0) / mentions : null,
        displayOverall: mentions > 0 ? Number(item.overall || 0) / mentions : null,
        displayRelevance: mentions > 0 ? Number(item.relevance || 0) / mentions : null,
        displaySentiment: mentions > 0 ? Number(item.sentiment || 0) / mentions : null,
        mentioned: mentions > 0,
      };
    });
  }, [results]);

  const [selectedModel, setSelectedModel] = useState(processedResults[0]?.model || "");

  return (
    <div className="bg-[#fcfcfd] px-4 py-4">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-[15px] font-medium text-[#3f4754]">Detailed keyword analysis</h4>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="h-8 rounded-[8px] border-[#d7dde7] bg-white px-3 text-[11px] font-medium text-[#717b8b] shadow-none"
          >
            7 days
            <ChevronDown className="ml-2 h-3.5 w-3.5" />
          </Button>
          <Button
            variant="outline"
            className="h-8 rounded-[8px] border-[#d7dde7] bg-white px-3 text-[11px] font-medium text-[#717b8b] shadow-none"
          >
            Models
            <ChevronDown className="ml-2 h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-[1fr_2.4fr] gap-3 border-t border-[#eef2f6] pt-4">
        <KeywordVisibilityComparisonGraph
          results={processedResults}
          domainId={domainId}
          keywordRawId={rawId}
        />
        <KeywordAIResponsePanel
          results={processedResults}
          selectedModel={selectedModel}
          setSelectedModel={setSelectedModel}
        />
      </div>
    </div>
  );
};

export const KeywordTrackingTable = ({
  data,
  title = "Keywords Tracking",
  domainId,
}: {
  data: KeywordTableRow[];
  title?: string;
  /** Real Domain.id used by the expanded row to fetch /history. */
  domainId?: number | null;
}) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [tableMetric, setTableMetric] = useState<string | null>(null);
  // Page-based pagination (10 rows / page). Replaces the prior
  // View all / Show less toggle.
  const PAGE_SIZE = 10;
  const [currentPage, setCurrentPage] = useState(1);

  // Analyze Keywords state — same shape as Analyze Prompt in
  // PromptTrackingTable. Reuses the /prompts/analyze backend endpoint
  // (the endpoint auto-detects keyword and creates one if missing, so
  // it works for both "prompt" and "keyword" intents).
  const [analyzeText, setAnalyzeText] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [newlyAnalyzedRows, setNewlyAnalyzedRows] = useState<KeywordTableRow[]>([]);
  const [pendingRows, setPendingRows] = useState<Array<{ id: string; phrase: string }>>([]);

  const handleAnalyzeKeyword = async () => {
    const text = analyzeText.trim();
    if (!text || analyzing) return;
    if (!domainId) {
      toast({
        title: "No domain loaded",
        description: "Wait for the report to finish loading.",
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
        row: KeywordTableRow;
      }>(`/wizard/domain/${domainId}/prompts/analyze`, { text });
      setNewlyAnalyzedRows((prev) => [res.row, ...prev]);
      setAnalyzeText("");
      toast({
        title: "Keyword analyzed",
        description: `Tracked across ${res.row?.results?.length ?? 3} models.`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Analyze failed";
      toast({ title: "Analyze failed", description: message, variant: "destructive" });
    } finally {
      setPendingRows((prev) => prev.filter((p) => p.id !== optimisticId));
      setAnalyzing(false);
    }
  };

  // Add to Worksheet / Draft Blog handlers. Both navigate to the AI
  // Checker dashboard with query params so the existing modal there
  // handles the worksheet flow — avoids duplicating ~200 lines of
  // worksheet orchestration here. The dashboard reads ?openWorksheet=
  // and opens the picker prefilled with the row id.
  const navigateToWorksheet = (rowId?: string) => {
    if (!domainId) {
      toast({
        title: "No domain context",
        description: "Domain not loaded yet — try again in a moment.",
        variant: "destructive",
      });
      return;
    }
    const slug = maskDomainId(domainId);
    const url = rowId
      ? `/ai-results/${slug}?openWorksheet=${encodeURIComponent(rowId)}`
      : `/ai-results/${slug}?openWorksheet=1`;
    navigate(url);
  };

  // Full sorted list (before pagination).
  const fullSortedData = useMemo(() => {
    let items = [...data];

    if (tableMetric) {
      const num = (v: number | null | undefined) => (typeof v === "number" ? v : -1);
      items.sort((a, b) => {
        if (tableMetric === "Ranking") return b.mentions - a.mentions;
        if (tableMetric === "Position") return a.bestRank - b.bestRank;
        if (tableMetric === "SOV") return Number.parseInt(b.sov, 10) - Number.parseInt(a.sov, 10);
        if (tableMetric === "Competitors") return b.competitorCount - a.competitorCount;
        return num(b.avgSentiment) - num(a.avgSentiment);
      });
    }

    // Dedupe rows that are already in newlyAnalyzedRows so they don't
    // double-render after the parent /report refetches.
    const newIds = new Set(
      newlyAnalyzedRows.map((r) => r.rawId).filter((id): id is number => typeof id === "number"),
    );
    const base = items.filter(
      (item) => !(typeof item.rawId === "number" && newIds.has(item.rawId)),
    );

    if (!tableMetric) {
      return [...newlyAnalyzedRows, ...base];
    }
    return base;
  }, [data, tableMetric, newlyAnalyzedRows]);

  const totalCount = fullSortedData.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  useEffect(() => {
    setCurrentPage(1);
  }, [tableMetric]);
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const displayData = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return fullSortedData.slice(start, start + PAGE_SIZE);
  }, [fullSortedData, currentPage]);

  return (
    <Card className="border-none bg-transparent shadow-none">
      <CardHeader className="space-y-4 px-0 pb-6 pt-0">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <CardTitle className="text-[22px] font-bold text-[#334155]">{title}</CardTitle>
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

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-[38px] gap-2 rounded-lg border-slate-200 px-3 text-slate-600 shadow-none hover:bg-gray-50">
                  <Calendar className="h-[16px] w-[16px]" />
                  <span className="text-[13px] font-medium">7 days</span>
                  <ChevronDown className="ml-1 h-3.5 w-3.5 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[150px]">
                <DropdownMenuItem>7 days</DropdownMenuItem>
                <DropdownMenuItem>14 days</DropdownMenuItem>
                <DropdownMenuItem>30 days</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-[38px] gap-2 rounded-lg border-slate-200 px-3 capitalize text-slate-600 shadow-none hover:bg-gray-50">
                  <AlignLeft className="h-[16px] w-[16px]" />
                  <span className="text-[13px] font-medium">Sort</span>
                  <ChevronDown className="ml-1 h-3.5 w-3.5 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[150px]">
                <DropdownMenuItem>Sort by Relevance</DropdownMenuItem>
                <DropdownMenuItem>Sort by Sentiment</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-[38px] gap-2 rounded-lg border-slate-200 px-3 text-slate-600 shadow-none hover:bg-gray-50">
                  <Filter className="h-[16px] w-[16px]" />
                  <span className="text-[13px] font-medium">{tableMetric || "Filters"}</span>
                  <ChevronDown className="ml-1 h-3.5 w-3.5 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[180px]">
                <DropdownMenuItem onClick={() => setTableMetric(null)}>Clear Filters</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setTableMetric("Sentiment")}>Sentiment Score</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTableMetric("Ranking")}>Ranking</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTableMetric("Position")}>Position</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTableMetric("SOV")}>SOV %</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTableMetric("Competitors")}>Competitor Count</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              type="button"
              onClick={() => navigateToWorksheet()}
              className="h-[38px] gap-2 rounded-lg border-none bg-[#2d3748] px-4 text-white shadow-none transition-all hover:bg-[#1a202c]"
            >
              <LayoutGrid className="h-4 w-4" />
              <span className="text-[13px] font-medium">Add to Worksheet</span>
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative w-[320px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Enter your custom keyword to track"
              value={analyzeText}
              onChange={(e) => setAnalyzeText(e.target.value)}
              disabled={analyzing}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleAnalyzeKeyword();
                }
              }}
              className="h-[38px] w-full rounded-lg border border-slate-200 pl-10 pr-4 text-[13px] outline-none transition-all placeholder:text-gray-400 focus:border-slate-300 focus:ring-1 focus:ring-slate-300 disabled:bg-slate-50 disabled:cursor-not-allowed"
            />
          </div>

          <Button
            type="button"
            onClick={() => void handleAnalyzeKeyword()}
            disabled={analyzing || !analyzeText.trim() || !domainId}
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
                <span className="text-[13px] font-medium">Analyze Keywords</span>
              </>
            )}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="px-0 pb-3">
        <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-gray-200">
          <Table>
            <TableHeader>
              <TableRow className="border-b-0 bg-[#f1f1f1] hover:bg-[#f1f1f1]">
                <TableHead className="w-8 px-4 rounded-tl-lg">
                  <input type="checkbox" className="h-3.5 w-3.5 rounded border-gray-300 accent-blue-600" />
                </TableHead>
                <TableHead className="px-2 text-[11px] font-semibold text-[#31415f]">
                  <div className="flex items-center gap-1">
                    Prompts <Info className="h-[10px] w-[10px] text-slate-400" /> <ArrowUp className="h-3 w-3 text-slate-600" />
                  </div>
                </TableHead>
                <TableHead className="px-2 text-[11px] font-semibold text-[#31415f]">
                  <div className="flex items-center gap-1">
                    Visibility <Info className="h-[10px] w-[10px] text-slate-400" /> <ArrowUp className="h-3 w-3 text-slate-600" />
                  </div>
                </TableHead>
                <TableHead className="px-2 text-[11px] font-semibold text-[#31415f]">
                  <div className="flex items-center gap-1">
                    Coverage <Info className="h-[10px] w-[10px] text-slate-400" /> <ArrowUp className="h-3 w-3 text-slate-600" />
                  </div>
                </TableHead>
                <TableHead className="px-2 text-[11px] font-semibold text-[#31415f]">
                  <div className="flex items-center gap-1">
                    Ranking <Info className="h-[10px] w-[10px] text-slate-400" /> <ArrowUp className="h-3 w-3 text-slate-600" />
                  </div>
                </TableHead>
                <TableHead className="px-2 text-[11px] font-semibold text-[#31415f]">
                  <div className="flex items-center gap-1">
                    Sentiment <Info className="h-[10px] w-[10px] text-slate-400" /> <ArrowUp className="h-3 w-3 text-slate-600" />
                  </div>
                </TableHead>
                <TableHead className="px-2 text-[11px] font-semibold text-[#31415f]">
                  <div className="flex items-center gap-1">
                    Volume <Info className="h-[10px] w-[10px] text-slate-400" /> <ArrowUp className="h-3 w-3 text-slate-600" />
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
              {displayData.map((row) => (
                <Fragment key={row.id}>
                  <TableRow
                    className={`group cursor-pointer border-b transition-all duration-200 hover:bg-slate-50/80 ${
                      expandedId === row.id ? "border-slate-300 bg-slate-50 shadow-sm" : "border-slate-200"
                    }`}
                    onClick={() => setExpandedId(expandedId === row.id ? null : row.id)}
                  >
                    <TableCell className="w-8 px-4 py-3">
                      <input type="checkbox" className="h-3.5 w-3.5 rounded border-gray-300 accent-blue-600" />
                    </TableCell>
                    <TableCell className="max-w-[340px] px-2 py-2">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <button
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
                          <span className="truncate text-[12px] text-[#58606f] italic">
                            {row.phrase}
                          </span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="px-2 py-3 text-[11px] font-medium text-slate-600">
                      {row.sov}
                    </TableCell>
                    <TableCell className="px-2 py-3">
                      <Badge
                        variant="outline"
                        className="rounded-full border-[#a8dab5] bg-[#e6f4ea] text-[#1e8e3e] px-2.5 py-[2px] text-[10px] font-medium tracking-normal shadow-sm"
                      >
                        {row.mentions > 0 ? "Yes" : "No"}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-2 py-3 text-[11px] font-medium text-slate-600">
                      {row.bestRank}/{row.results.length}
                    </TableCell>
                    <TableCell className="px-2 py-3">
                      <span className="text-[11px] font-medium text-slate-600">500</span>
                    </TableCell>
                    <TableCell className="px-2 py-3">
                      {row.avgSentiment === null || row.mentions === 0 ? (
                        // Honest empty: no model mentioned the brand for this
                        // keyword, so there's nothing to label Positive/Neg.
                        <span className="text-[10px] font-medium text-slate-400 italic">Not mentioned</span>
                      ) : (
                        <Badge
                          variant="outline"
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${getSentimentColor(
                            row.avgSentiment >= 7 ? "Positive" : row.avgSentiment >= 4 ? "Neutral" : "Negative"
                          )}`}
                        >
                          {row.avgSentiment >= 7 ? "Positive" : row.avgSentiment >= 4 ? "Neutral" : "Negative"}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigateToWorksheet(row.id);
                          }}
                          className="h-8 rounded-[8px] border-[#e2e8f0] bg-[#f8fafc] px-3 text-[11px] font-semibold text-[#3b82f6] shadow-none hover:bg-slate-100"
                        >
                          <FileText className="mr-1.5 h-3.5 w-3.5" />
                          Draft Blog
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  {expandedId === row.id ? (
                    <TableRow className="border-b border-slate-300 bg-white hover:bg-white">
                      <TableCell colSpan={8} className="p-0">
                        <KeywordExpandedDetails
                          results={row.results}
                          phrase={row.phrase}
                          domainId={domainId}
                          rawId={row.rawId}
                        />
                      </TableCell>
                    </TableRow>
                  ) : null}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="mt-2 flex items-center justify-between gap-3 border-t border-slate-200 px-6 py-3">
          <span className="text-[11px] font-medium tracking-tight text-[#64748b]">
            {totalCount === 0
              ? "No rows"
              : `Showing ${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, totalCount)} of ${totalCount}`}
          </span>
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
  );
};
