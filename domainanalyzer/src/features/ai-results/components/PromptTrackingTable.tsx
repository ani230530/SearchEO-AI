import { Fragment, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiGet, apiPost } from "@/services/apiClient";
import { useToast } from "@/components/ui/use-toast";
import { maskDomainId } from "@/lib/domainUtils";
import ReactMarkdown from "react-markdown";
import {
  AlignLeft,
  ArrowUp,
  BarChart3,
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
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceDot,
  ResponsiveContainer,
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

export type PromptModelResult = {
  accuracy?: number | null;
  citations?: Array<{ title?: string; url: string; citedText?: string; snippet?: string; content?: string }>;
  id: string;
  model: string;
  overall?: number | null;
  phrase?: string;
  presence?: number;
  relevance?: number;
  response?: string;
  sentiment?: number | null;  // null when presence=0 (not mentioned)
  sources?: string[];
};

export type PromptTableRow = {
  /** Average sentiment ON A 0..10 SCALE — null if no model in this row mentioned the brand. */
  avgSentiment: number | null;
  bestRank: number;
  competitorCount: number;
  competitors: string[];
  id: string;
  /** Raw DB id (Prompt.id or Keyword.id). Used to fetch /history for this row. */
  rawId?: number;
  mentions: number;
  phrase: string;
  results: PromptModelResult[];
  sov: string;
  type: "prompt" | "keyword";
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
  { test: /gemini|google/i,      src: "/report-icons/gemini.svg" },
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
};

const getModelLabel = (model?: string): string => {
  if (!model) return "Unknown model";
  if (MODEL_LABELS[model]) return MODEL_LABELS[model];
  const lower = model.toLowerCase();
  if (/gpt|openai/.test(lower)) return "ChatGPT";
  if (/claude|anthropic/.test(lower)) return "Claude";
  if (/gemini|google/.test(lower)) return "Gemini";
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
    return target;
  } catch {
    const query = value.includes("://") ? value.split("://")[1] : value;
    return `https://www.google.com/search?q=${encodeURIComponent(decodeURIComponent(query))}`;
  }
};

/**
 * Per-model presence rollup for THIS row's results in the current run.
 * Replaces the old hardcoded "ChatGPT 24/100, Gemini 27/100, Claude 16/100"
 * — those numbers were never wired to anything. Now: count how many of this
 * model's responses for this prompt actually mentioned the brand.
 */
const buildModelPresenceRows = (results: ProcessedPromptResult[]) => {
  const byModel = new Map<string, { total: number; mentions: number }>();
  for (const r of results) {
    const k = r.model;
    if (!byModel.has(k)) byModel.set(k, { total: 0, mentions: 0 });
    const slot = byModel.get(k)!;
    slot.total += 1;
    slot.mentions += r.presence > 0 ? 1 : 0;
  }
  return Array.from(byModel.entries()).map(([model, v]) => ({
    label: getModelLabel(model),
    model,
    score: `${v.mentions}/${v.total}`,
  }));
};

/**
 * Per-prompt history chart. Fetches /history for this prompt on mount and
 * renders presence-rate% over each completed audit run.
 *   - 0 runs   → empty pill overlay ("No runs yet")
 *   - 1 run    → single dot + "Trend appears after your next audit"
 *   - 2+ runs  → real area chart with auto-scaled Y axis (0..100)
 */
const PromptVisibilityComparisonGraph = ({
  results,
  domainId,
  promptRawId,
  rowType,
}: {
  results: ProcessedPromptResult[];
  domainId?: number | null;
  promptRawId?: number | null;
  rowType: "prompt" | "keyword";
}) => {
  const presenceRows = buildModelPresenceRows(results);
  const [history, setHistory] = useState<Array<{ runId: number; startedAt: string; presenceRate: number; mentions: number; total: number }>>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!domainId || !promptRawId) {
      setHistory([]);
      return;
    }
    setLoadingHistory(true);
    // Same payload shape from both endpoints — only the path segment changes
    // ('prompts/:id' vs 'keywords/:id') so the component can render either.
    const path = rowType === "keyword"
      ? `/wizard/domain/${domainId}/keywords/${promptRawId}/history`
      : `/wizard/domain/${domainId}/prompts/${promptRawId}/history`;
    apiGet<{ runs: Array<{ runId: number; startedAt: string; presenceRate: number; mentions: number; total: number }> }>(path)
      .then((res) => { if (alive) setHistory(res.runs ?? []); })
      .catch(() => { if (alive) setHistory([]); })
      .finally(() => { if (alive) setLoadingHistory(false); });
    return () => { alive = false; };
  }, [domainId, promptRawId, rowType]);

  const chartData = history.map((h, i) => ({
    x: i,
    presence: h.presenceRate,
    label: new Date(h.startedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
  }));
  const ticks = chartData.length > 0
    ? [0, Math.floor(chartData.length / 2), chartData.length - 1].filter((v, i, a) => a.indexOf(v) === i)
    : [];
  const lastIdx = chartData.length - 1;
  const emptyMessage = !domainId || !promptRawId
    ? "Open from a tracked domain to see history"
    : loadingHistory
      ? "Loading history…"
      : history.length === 0
        ? "No audit history for this prompt yet"
        : history.length === 1
          ? "Trend appears after your next audit"
          : null;

  return (
    <div className="relative border-r border-[#e7ebf2] pr-3">
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
            <Area dataKey="presence" fill="url(#prompt-detail-fill)" stroke="#83a9da" strokeWidth={1.5} type="monotone" />
            {lastIdx >= 0 ? (
              <ReferenceDot
                fill="#83a9da"
                isFront
                r={4.5}
                stroke="#83a9da"
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
  const logo = host ? `https://img.logo.dev/${host}?token=pk_DTdFFG1JT9WOCjATvZEzIA&size=64` : null;
  const title = citation.title?.trim() || host || "Source";
  const blurb = (citation.snippet || citation.citedText || "")?.toString().trim();
  return (
    <a
      href={citation.url ?? `https://${host}`}
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
  const logo = host ? `https://img.logo.dev/${host}?token=pk_DTdFFG1JT9WOCjATvZEzIA&size=64` : null;
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
      href={host ? `https://${host}` : "#"}
      target="_blank"
      rel="noreferrer"
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition hover:shadow-sm ${tone}`}
    >
      {logo ? (
        <img
          src={logo}
          alt=""
          aria-hidden
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
              <ReactMarkdown>{activeResult.response}</ReactMarkdown>
            </article>
          ) : (
            <p className="text-[13px] italic text-slate-400">
              {activeResult.mentioned ? "No response captured." : "This model didn't mention your brand."}
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

const PromptExpandedDetails = ({
  results,
  phrase,
  domainId,
  rawId,
  rowType,
}: {
  results: PromptModelResult[];
  phrase: string;
  domainId?: number | null;
  rawId?: number | null;
  rowType: "prompt" | "keyword";
}) => {
  const processedResults = useMemo<ProcessedPromptResult[]>(() => {
    const grouped = new Map<string, ProcessedPromptResult>();

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
        <h4 className="text-[15px] font-medium text-[#3f4754]">Detailed prompt analysis</h4>
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
      <div className="grid grid-cols-[0.98fr_1.08fr] gap-3 border-t border-[#eef2f6] pt-4">
        <PromptVisibilityComparisonGraph
          results={processedResults}
          domainId={domainId}
          promptRawId={rawId}
          rowType={rowType}
        />
        <PromptAIResponsePanel
          phrase={phrase}
          results={processedResults}
          selectedModel={selectedModel}
          setSelectedModel={setSelectedModel}
        />
      </div>
    </div>
  );
};

export const PromptTable = ({
  data,
  title = "Top searched Prompts",
  domainId,
}: {
  data: PromptTableRow[];
  title?: string;
  /** Real Domain.id used by the expanded row to fetch /history. */
  domainId?: number | null;
}) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  // Worksheet / Draft Blog buttons in this table navigate to the
  // dashboard with ?openWorksheet=<rowId> so the existing modal there
  // handles the rest. Avoids duplicating ~200 lines of orchestration.
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
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [tableFilter, setTableFilter] = useState<"all" | "prompt" | "keyword">("all");
  const [tableMetric, setTableMetric] = useState<string | null>(null);
  // Page-based pagination (10 rows / page). Replaces the prior
  // View all / Show less toggle — both because page navigation is more
  // predictable for large lists, and because the parent flow can now
  // create many new rows via Analyze Prompt.
  const PAGE_SIZE = 10;
  const [currentPage, setCurrentPage] = useState(1);

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
    let items = [...data];

    if (tableFilter === "prompt") {
      items = items.filter((item) => item.type === "prompt");
    } else if (tableFilter === "keyword") {
      items = items.filter((item) => item.type === "keyword");
    }

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

    // Dedupe parent rows that match a row we just analyzed — the
    // newly-analyzed copy has the fresher result data and wins.
    const mergedNewIds = new Set(
      newlyAnalyzedRows.map((r) => r.rawId).filter((id): id is number => typeof id === "number"),
    );
    const baseItems = items.filter(
      (item) => !(typeof item.rawId === "number" && mergedNewIds.has(item.rawId)),
    );

    // Without a metric sort, newly-analyzed rows pin to the top — that
    // matches the user's expectation that the result they JUST produced
    // is most relevant. With a metric sort, we don't pin (that would
    // lie about the sort order).
    if (!tableMetric) {
      return [...newlyAnalyzedRows, ...baseItems];
    }
    return baseItems;
  }, [data, tableFilter, tableMetric, newlyAnalyzedRows]);

  const totalCount = fullSortedData.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  useEffect(() => {
    setCurrentPage(1);
  }, [tableFilter, tableMetric]);
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
              How AI actually talks and ranks content — track language patterns that drive visibility
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
                  <span className="text-[13px] font-medium">{tableFilter === "all" ? "Sort" : tableFilter}</span>
                  <ChevronDown className="ml-1 h-3.5 w-3.5 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[150px]">
                <DropdownMenuItem onClick={() => setTableFilter("all")}>Mixed View</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTableFilter("prompt")}>Prompts Only</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTableFilter("keyword")}>Keywords Only</DropdownMenuItem>
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
                  <TableCell colSpan={6} className="px-2 py-3">
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
                      {/* Coverage = how many models out of total mentioned the brand */}
                      <Badge
                        variant="outline"
                        className={`rounded-full px-2.5 py-[2px] text-[10px] font-medium tracking-normal shadow-sm ${
                          row.mentions === 0
                            ? "border-slate-200 bg-slate-50 text-slate-500"
                            : row.mentions === row.results.length
                              ? "border-[#a8dab5] bg-[#e6f4ea] text-[#1e8e3e]"
                              : "border-amber-200 bg-amber-50 text-amber-700"
                        }`}
                      >
                        {row.mentions === 0 ? "0 of " + row.results.length : `${row.mentions}/${row.results.length} models`}
                      </Badge>
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
                        const positions = row.results
                          .map((r: any) => r.rankPosition)
                          .filter((p: any): p is number => typeof p === "number" && p > 0);
                        if (positions.length > 0) {
                          return <span>#{Math.min(...positions)}</span>;
                        }
                        if (row.mentions > 0) {
                          return <span className="text-emerald-600">Mentioned</span>;
                        }
                        return <span className="text-slate-400">—</span>;
                      })()}
                    </TableCell>
                    <TableCell className="px-2 py-3">
                      <span className="text-[11px] font-medium text-slate-600">500</span>
                    </TableCell>
                    <TableCell className="px-2 py-3">
                      {row.avgSentiment === null || row.mentions === 0 ? (
                        // No model mentioned the brand → there's no sentiment
                        // to measure. Honest display instead of a fake badge.
                        <span className="text-[10px] font-medium text-slate-400 italic">
                          Not mentioned
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
                        <PromptExpandedDetails
                          results={row.results}
                          phrase={row.phrase}
                          domainId={domainId}
                          rawId={row.rawId}
                          rowType={row.type}
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
          <span className="text-[11px] font-medium tracking-tight text-gray-500">
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
