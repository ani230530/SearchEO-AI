/**
 * runService — Step 5 of the wizard.
 *
 * Fans each user-selected prompt across multiple LLMs through OpenRouter and
 * writes fast deterministic scores immediately:
 *
 *   1. Deterministic — fast regex/keyword extraction (citations, hostname
 *      matches). Used as the immediate fallback if the LLM scorer fails.
 *   2. LLM scorer    — second OpenRouter call with strict JSON schema. By
 *      default it runs in the background after model answers are collected,
 *      then overwrites provisional scores with alias-aware presence, real
 *      sentiment, relevance, rank position, factual-claim verdicts, and
 *      per-competitor sentiment.
 *
 * Any competitor the scorer surfaces in the response that isn't already in
 * the Competitor table gets auto-added (source: 'mention') so the next Step 3
 * regen builds on real-world signal.
 */

import axios from 'axios';
import type { PrismaClient } from '../../generated/prisma';
import {
  scoreResponse as llmScoreResponse,
  shouldUseLlmScorer,
  type ScoreInput as LlmScoreInput,
} from './scoreService';
import { recordCompetitorMention } from './competitorService';
import { extractHost } from './urlNormalize';
import { invalidateReportCacheForDomain } from './reportCache';
import { callOpenRouterChat, isOpenRouterConfigured } from '../services/openRouterClient';
import { logExternalUsage } from '../services/externalUsageClient';

const SERPAPI_KEY = process.env.SERP_API_KEY || process.env.SERPAPI_KEY;
const SERPER_API_KEY = process.env.SERPER_API_KEY || process.env.SERPER_KEY;

function invalidateRunReportCache(userId: number | null | undefined, domainId: number): void {
  invalidateReportCacheForDomain(userId, domainId).catch((err) => {
    console.warn(`[run:${domainId}] report cache invalidation failed`, err);
  });
}

const QUERY_TIMEOUT_MS = 60_000;
const DEEP_SCORING_IN_BACKGROUND = process.env.DEEP_SCORING_IN_BACKGROUND !== 'false';
const DEEP_SCORING_PARALLEL = Number(process.env.DEEP_SCORING_PARALLEL ?? 3);
const DEEP_SCORING_RETRIES = Number(process.env.DEEP_SCORING_RETRIES ?? 2);
const DEEP_ANSWER_RETRIES = Number(process.env.DEEP_ANSWER_RETRIES ?? 2);
const deepScoringInFlight = new Set<number>();
// Bounded worker pool over (prompt × model) work. The pool lets all models for
// a single prompt run in parallel while leaving headroom for provider variance,
// retries, and the background scorer.
const MAX_PARALLEL = 6;

/**
 * The roster — the models we audit against, configured to
 * mirror what real users see in the consumer chat products as closely as
 * possible. The single biggest accuracy lever is whether the model can
 * actually browse the web (Seer / Ahrefs / Search Engine Land research) —
 * so each entry below opts into the most-faithful web-search path that
 * OpenRouter exposes for that provider.
 *
 * Per-provider routing:
 *   - OpenAI: native `web_search` tool passthrough (matches SearchGPT).
 *   - Anthropic: native `web_search_20250305` tool passthrough.
 *   - Google: no native passthrough yet, so we use the `:online` shim
 *     (Exa-backed search) — best parity available without a direct AI Studio
 *     call. Citations come back through the assistant message as URLs.
 *
 * Friendly id is what we persist + show in the UI; openrouterModel is the
 * exact slug OpenRouter understands. `useWebSearch` flips on per-provider
 * native tool injection in callModel().
 */
type WebSearchMode = 'native_openai' | 'native_anthropic' | 'online_shim' | 'serpapi_sge' | 'none';

interface ModelDef {
  id: string;
  openrouterModel: string;
  webSearchMode: WebSearchMode;
  /** UI label used in the chat product, prepended to the system prompt. */
  productName: 'ChatGPT' | 'Claude' | 'Gemini' | 'Google AI Overview';
  /** Knowledge cutoff string the chat product surfaces — keeps the model
   *  grounded so it browses for fresher info instead of hallucinating. */
  knowledgeCutoff: string;
  /** Maker org for the system prompt preamble. */
  maker: string;
}

const ROSTER: ReadonlyArray<ModelDef> = [
  {
    id: 'gpt-4o-mini',
    openrouterModel: 'openai/gpt-4o-mini',
    webSearchMode: 'native_openai',
    productName: 'ChatGPT',
    knowledgeCutoff: 'October 2024',
    maker: 'OpenAI',
  },
  {
    // Sonnet, not Haiku — Anthropic's native `web_search_20250305` tool is
    // not supported on Haiku via OpenRouter (returns 400). Sonnet 4.5 is also
    // what real users get at claude.ai (it's the free-tier default). Slightly
    // pricier than Haiku but accuracy matters more for an audit.
    id: 'claude-sonnet-4-5',
    openrouterModel: 'anthropic/claude-sonnet-4.5',
    webSearchMode: 'native_anthropic',
    productName: 'Claude',
    knowledgeCutoff: 'early 2025',
    maker: 'Anthropic',
  },
  {
    id: 'gemini-2.0-flash',
    // Keep the persisted id stable for existing UI/report data, but route to
    // a live OpenRouter Gemini endpoint. The old 2.0 Flash slug now returns
    // 404, which was silently creating blank Gemini rows.
    openrouterModel: 'google/gemini-2.5-flash:online',
    webSearchMode: 'online_shim',
    productName: 'Gemini',
    knowledgeCutoff: 'June 2025',
    maker: 'Google',
  },
  {
    id: 'google-gre',
    openrouterModel: 'serpapi', // Placeholder, not used via OpenRouter
    webSearchMode: 'serpapi_sge',
    productName: 'Google AI Overview',
    knowledgeCutoff: 'real-time',
    maker: 'Google',
  },
];

function describeModelError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    const data = err.response?.data;
    const detail =
      typeof data === 'string'
        ? data
        : typeof data?.error === 'string'
          ? data.error
          : typeof data?.message === 'string'
            ? data.message
            : err.message;
    return `${status ? `${status} ` : ''}${String(detail).slice(0, 240)}`;
  }
  return err instanceof Error ? err.message.slice(0, 240) : String(err).slice(0, 240);
}

function searchResultText(data: any): string {
  const lines: string[] = [];
  const push = (value: unknown) => {
    const text = String(value ?? '').replace(/\s+/g, ' ').trim();
    if (text && !lines.includes(text)) lines.push(text);
  };

  if (typeof data?.ai_overview?.text === 'string') push(data.ai_overview.text);
  if (Array.isArray(data?.ai_overview?.text_blocks)) {
    for (const block of data.ai_overview.text_blocks) {
      push(block?.snippet);
      push(block?.text);
    }
  }
  push(data?.answer_box?.answer);
  push(data?.answer_box?.snippet);
  push(data?.knowledge_graph?.description);

  for (const item of (data?.organic_results ?? data?.organic ?? []).slice(0, 5)) {
    const title = item?.title;
    const snippet = item?.snippet;
    if (title || snippet) push([title, snippet].filter(Boolean).join(': '));
  }

  return lines.slice(0, 6).join('\n\n').slice(0, 2400);
}

interface CallOutcome {
  response: string;
  latencyMs: number;
  costUsd: number | null;
  usageLedgerEntryId?: number | null;
}

interface ModelUsageContext {
  userId: number | null;
  domainId: number;
  domainHost: string;
  runId: number;
  promptId: number;
  feature: string;
  operation: string;
}

/**
 * Approximate user location passed to provider web-search tools so localized
 * results match the brand's actual market (not the audit server's IP). Built
 * from the country / state / targetLocation the user filled in on Step 1.
 */
export interface UserLocation {
  country: string | null;
  state: string | null;
  city: string | null;
  timezone: string | null;
}

/**
 * Build the production-style system prompt for a given chat product.
 * Mirrors the leaked / published preambles each product injects today: the
 * model's identity, knowledge cutoff, current date, web-tool hint, plus the
 * user's market so the model frames recommendations regionally.
 */
function buildSystemPrompt(model: ModelDef, today: string, hasWebTool: boolean, loc: UserLocation): string {
  const toolHint = hasWebTool
    ? `You have a web-search tool. Use it whenever the question is time-sensitive, brand-specific, or asks about recent / current information. When you cite information, use markdown links to the source.`
    : `When you cite information, use markdown links to the source.`;
  const locParts = [loc.city, loc.state, loc.country].filter(Boolean).join(', ');
  const locLine = locParts
    ? `User location: ${locParts}. Bias your recommendations and citations to providers and sources relevant to this market.`
    : '';
  return [
    `You are ${model.productName}, a large language model made by ${model.maker}.`,
    `Knowledge cutoff: ${model.knowledgeCutoff}.`,
    `Current date: ${today}.`,
    locLine,
    '',
    toolHint,
  ].filter(Boolean).join('\n');
}

/**
 * Map a freeform country/state pair to an ISO-3166-1 alpha-2 code.
 * The native provider tools require ISO codes; we keep the mapping small
 * and additive — anything we don't recognise falls through to undefined,
 * and the tool defaults to the request-IP location (server's location).
 */
const COUNTRY_TO_ISO: Record<string, string> = {
  'united states': 'US', 'usa': 'US', 'us': 'US', 'america': 'US',
  'united kingdom': 'GB', 'uk': 'GB', 'britain': 'GB', 'england': 'GB',
  'india': 'IN', 'canada': 'CA', 'australia': 'AU', 'germany': 'DE',
  'france': 'FR', 'spain': 'ES', 'italy': 'IT', 'netherlands': 'NL',
  'brazil': 'BR', 'mexico': 'MX', 'japan': 'JP', 'china': 'CN',
  'singapore': 'SG', 'uae': 'AE', 'united arab emirates': 'AE',
  'saudi arabia': 'SA', 'south africa': 'ZA', 'ireland': 'IE',
  'sweden': 'SE', 'norway': 'NO', 'denmark': 'DK', 'finland': 'FI',
  'switzerland': 'CH', 'austria': 'AT', 'belgium': 'BE', 'poland': 'PL',
  'portugal': 'PT', 'turkey': 'TR', 'israel': 'IL', 'argentina': 'AR',
  'chile': 'CL', 'colombia': 'CO', 'new zealand': 'NZ',
};

function isoCountry(country: string | null): string | undefined {
  if (!country) return undefined;
  // Already a 2-letter ISO code? Pass through.
  if (/^[A-Za-z]{2}$/.test(country)) return country.toUpperCase();
  return COUNTRY_TO_ISO[country.trim().toLowerCase()];
}

/** Build the per-provider request shape that mirrors the consumer chat product. */
function buildRequestPayload(
  model: ModelDef,
  promptText: string,
  today: string,
  loc: UserLocation
): Record<string, unknown> {
  const hasWebTool = model.webSearchMode !== 'none';
  const system = buildSystemPrompt(model, today, hasWebTool, loc);
  const iso = isoCountry(loc.country);

  // Common chat-completion shape (OpenAI compatible).
  const base: Record<string, unknown> = {
    model: model.openrouterModel,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: promptText },
    ],
    // Match the consumer chat UIs (1.0). Lower temps make the API output too
    // deterministic and skew brand-mention frequencies vs what real users see.
    temperature: 1.0,
    max_tokens: 4096,
  };

  switch (model.webSearchMode) {
    case 'native_openai': {
      // OpenAI native web_search tool — passthrough through OpenRouter.
      // Matches what SearchGPT does in chat.openai.com. user_location
      // overrides the request-IP default so results match the brand's market.
      const webSearchCfg: Record<string, unknown> = {};
      if (iso) {
        webSearchCfg.user_location = {
          type: 'approximate',
          country: iso,
          ...(loc.city ? { city: loc.city } : {}),
          ...(loc.timezone ? { timezone: loc.timezone } : {}),
        };
      }
      base.tools = [
        Object.keys(webSearchCfg).length > 0
          ? { type: 'web_search', web_search: webSearchCfg }
          : { type: 'web_search' },
      ];
      base.tool_choice = 'auto';
      break;
    }
    case 'native_anthropic': {
      // Anthropic native web_search_20250305 tool. user_location is on the
      // tool definition itself per the Anthropic spec.
      const tool: Record<string, unknown> = {
        type: 'web_search_20250305',
        name: 'web_search',
        max_uses: 5,
      };
      if (iso) {
        tool.user_location = {
          type: 'approximate',
          country: iso,
          ...(loc.city ? { city: loc.city } : {}),
          ...(loc.timezone ? { timezone: loc.timezone } : {}),
        };
      }
      base.tools = [tool];
      base.tool_choice = 'auto';
      break;
    }
    case 'online_shim':
      // OpenRouter's `:online` variant doesn't accept location config — the
      // best we can do is the system-prompt hint added in buildSystemPrompt.
      base.plugins = [{ id: 'web', engine: 'exa', max_results: 5 }];
      break;
    case 'none':
    default:
      break;
  }

  return base;
}

async function callModel(
  model: ModelDef,
  promptText: string,
  loc: UserLocation,
  usageContext: ModelUsageContext
): Promise<CallOutcome> {
  const startedAt = Date.now();

  if (model.webSearchMode === 'serpapi_sge') {
    const iso = isoCountry(loc.country);
    let responseText = '';
    let provider: 'serpapi' | 'serper' = 'serpapi';
    if (SERPAPI_KEY) {
      const res = await axios.get('https://serpapi.com/search', {
        params: {
          api_key: SERPAPI_KEY,
          engine: 'google',
          q: promptText,
          gl: iso?.toLowerCase() || 'us',
          hl: 'en',
        },
        timeout: QUERY_TIMEOUT_MS,
      });
      responseText = searchResultText(res.data);
    } else if (SERPER_API_KEY) {
      provider = 'serper';
      const res = await axios.post(
        'https://google.serper.dev/search',
        { q: promptText, gl: iso?.toLowerCase() || 'us', hl: 'en', num: 6 },
        {
          headers: { 'X-API-KEY': SERPER_API_KEY, 'Content-Type': 'application/json' },
          timeout: QUERY_TIMEOUT_MS,
        }
      );
      responseText = searchResultText(res.data);
    } else {
      throw new Error('SERP_API_KEY or SERPER_API_KEY not configured for Google AI Overview');
    }
    const latencyMs = Date.now() - startedAt;
    const ledgerEntry = await logExternalUsage({
      provider,
      feature: usageContext.feature,
      operation: usageContext.operation,
      status: 'success',
      latencyMs,
      context: {
        userId: usageContext.userId,
        domainId: usageContext.domainId,
        domainHost: usageContext.domainHost,
        runId: usageContext.runId,
        promptId: usageContext.promptId,
        modelRequested: model.id,
      },
      metadata: { model: model.id, gl: iso?.toLowerCase() || 'us' },
    });

    return {
      response: responseText,
      latencyMs,
      costUsd: SERPAPI_KEY ? 0.005 : 0.001,
      usageLedgerEntryId: ledgerEntry?.id ?? null,
    };
  }

  if (!isOpenRouterConfigured()) throw new Error('OPENROUTER_API_KEY not configured');
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const payload = buildRequestPayload(model, promptText, today, loc);
  // Keep the prompt payload small: this call is latency-sensitive in the run worker.
  // because OpenRouter's `tools`/`plugins` fields don't strictly match the
  // OpenAI SDK type definitions, and we want the request shape to be
  // verbatim what each provider expects.
  const out = await callOpenRouterChat<{
    choices?: Array<{ message?: { content?: string; annotations?: unknown[] } }>;
    usage?: { cost?: number };
    citations?: unknown[];
  }>({
    payload,
    timeoutMs: QUERY_TIMEOUT_MS,
    context: {
      userId: usageContext.userId,
      domainId: usageContext.domainId,
      domainHost: usageContext.domainHost,
      runId: usageContext.runId,
      promptId: usageContext.promptId,
      feature: usageContext.feature,
      operation: usageContext.operation,
      modelRequested: model.openrouterModel,
      metadata: { displayModel: model.id, webSearchMode: model.webSearchMode },
    },
  });
  const completion = out.completion;
  const choice = completion.choices?.[0];
  const response = choice?.message?.content ?? '';
  // Some providers attach `annotations` (OpenAI web_search) or `citations`
  // (OpenRouter `:online`) on the message — surface both so the citation
  // extractor downstream can pick up structured URLs in addition to the
  // markdown links inside the text.
  const annotations = (choice?.message as Record<string, unknown> | undefined)?.annotations as unknown[] | undefined;
  const citations = (completion as unknown as { citations?: unknown[] }).citations;
  const structuredUrls: string[] = [];
  if (Array.isArray(annotations)) {
    for (const a of annotations) {
      const url = (a as { url?: string; url_citation?: { url?: string } }).url
        ?? (a as { url_citation?: { url?: string } }).url_citation?.url;
      if (typeof url === 'string') structuredUrls.push(url);
    }
  }
  if (Array.isArray(citations)) {
    for (const c of citations) {
      if (typeof c === 'string') structuredUrls.push(c);
    }
  }
  // Inline any structured URLs the regex-based citation extractor would
  // otherwise miss — they end up parseable as bare URLs in the response text.
  const enrichedResponse =
    structuredUrls.length > 0
      ? `${response}\n\nSources:\n${structuredUrls.map((u) => `- ${u}`).join('\n')}`
      : response;
  return {
    response: enrichedResponse,
    latencyMs: out.latencyMs,
    costUsd: out.costUsd,
    usageLedgerEntryId: out.ledgerEntryId ?? null,
  };
}

// ── Response analysis ──────────────────────────────────────────────────────

const URL_REGEX = /\bhttps?:\/\/[^\s)>\]"'`]+/gi;
const MARKDOWN_LINK_REGEX = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gi;

interface Citation {
  url: string;
  title: string | null;
  host: string;
}

interface CompetitorMention {
  host: string;
  count: number;
  sentiment: number; // -10..10, sentiment in the ±100-char window around mentions
}

const POS_RE = /\b(best|excellent|great|recommend|powerful|industry-leading|trusted|popular|reliable|robust|leader|top|strong|favorite|preferred)\b/gi;
const NEG_RE = /\b(worst|bad|avoid|outdated|expensive|slow|poor|unreliable|limited|broken|issue|problem|disappointing|weak|lacking)\b/gi;

function hostFromUrl(u: string): string {
  try {
    return new URL(u).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return '';
  }
}

function extractCitations(text: string): Citation[] {
  if (!text) return [];
  const seen = new Map<string, Citation>();
  // Markdown links first (they have titles).
  let m: RegExpExecArray | null;
  MARKDOWN_LINK_REGEX.lastIndex = 0;
  while ((m = MARKDOWN_LINK_REGEX.exec(text))) {
    const url = m[2];
    const host = hostFromUrl(url);
    if (!host || seen.has(url)) continue;
    seen.set(url, { url, title: m[1].trim() || null, host });
  }
  // Bare URLs — only add if not already captured by a markdown link.
  URL_REGEX.lastIndex = 0;
  while ((m = URL_REGEX.exec(text))) {
    const url = m[0].replace(/[.,)\]]+$/, ''); // trim trailing punctuation
    const host = hostFromUrl(url);
    if (!host || seen.has(url)) continue;
    seen.set(url, { url, title: null, host });
  }
  return Array.from(seen.values());
}

function sentimentInWindow(text: string, around: string): number {
  const lower = text.toLowerCase();
  const idx = lower.indexOf(around.toLowerCase());
  if (idx < 0) return 0;
  const window = lower.slice(Math.max(0, idx - 100), idx + around.length + 100);
  const pos = (window.match(POS_RE) || []).length;
  const neg = (window.match(NEG_RE) || []).length;
  return Math.max(-10, Math.min(10, (pos - neg) * 2));
}

function countMatches(text: string, needle: string): number {
  if (!needle) return 0;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`\\b${escaped}\\b`, 'gi');
  return (text.match(re) || []).length;
}

interface ScoreInputs {
  ownDomainHost: string;
  competitorHosts: string[];
  modelResponse: string;
}

interface ScoreOutput {
  presence: number;        // 0|1 — was the user's domain mentioned?
  relevance: number;       // 0..10
  sentiment: number;       // -10..10 — sentiment around the user's brand
  overall: number;         // 0..10 — weighted final score
  citations: Citation[];
  competitorHosts: string[];                // legacy: just hosts mentioned
  competitorMentions: CompetitorMention[];  // detailed per-competitor breakdown
}

function scoreResponse({ ownDomainHost, competitorHosts, modelResponse }: ScoreInputs): ScoreOutput {
  const text = modelResponse || '';
  const citations = extractCitations(text);

  // Brand presence = host substring OR a citation pointing to that host.
  const ownMentionCount = countMatches(text, ownDomainHost);
  const ownCitedCount = citations.filter((c) => c.host === ownDomainHost).length;
  const presence = ownMentionCount + ownCitedCount > 0 ? 1 : 0;

  const relevance = Math.min(10, presence ? 5 + (ownMentionCount + ownCitedCount) * 2 : 1);
  const sentiment = presence ? sentimentInWindow(text, ownDomainHost) : 0;

  const overall = presence
    ? Math.max(0, Math.min(10, relevance * 0.6 + (sentiment + 10) * 0.5 * 0.4))
    : 0;

  // Per-competitor analytics — count mentions + sentiment around each.
  const competitorMentions: CompetitorMention[] = [];
  const mentionedCompetitorHosts: string[] = [];
  for (const host of competitorHosts) {
    const mentionCount = countMatches(text, host);
    const citedCount = citations.filter((c) => c.host === host).length;
    const totalCount = mentionCount + citedCount;
    if (totalCount === 0) continue;
    competitorMentions.push({
      host,
      count: totalCount,
      sentiment: sentimentInWindow(text, host),
    });
    mentionedCompetitorHosts.push(host);
  }

  return {
    presence,
    relevance,
    sentiment,
    overall: Number(overall.toFixed(2)),
    citations,
    competitorHosts: mentionedCompetitorHosts,
    competitorMentions,
  };
}

// ── Cross-scorer reconciliation helpers ────────────────────────────────────

/**
 * Merge LLM-classified citations (which carry direct/indirect labels) with
 * any extra URLs the deterministic regex pulled. Dedupe by URL; LLM entries
 * win on conflict because they have the type label.
 */
function mergeCitations(
  llmCitations: Array<{ url: string | null; title: string | null; host: string | null; type: 'direct' | 'indirect' }>,
  heuristicCitations: Array<{ url: string; title: string | null; host: string }>
): Array<{ url: string | null; title: string | null; host: string | null; type: 'direct' | 'indirect' }> {
  const out = new Map<string, { url: string | null; title: string | null; host: string | null; type: 'direct' | 'indirect' }>();
  for (const c of llmCitations) {
    const key = (c.url ?? `${c.host}::${c.title ?? ''}`).toLowerCase();
    if (!key) continue;
    out.set(key, c);
  }
  for (const h of heuristicCitations) {
    const key = h.url.toLowerCase();
    if (out.has(key)) continue;
    out.set(key, { url: h.url, title: h.title, host: h.host, type: 'direct' });
  }
  return Array.from(out.values());
}

/**
 * The LLM scorer sometimes returns a competitor name without a host. If the
 * name matches one of the rosters we already know about (case-insensitive,
 * substring), borrow the host from there so the row is dedupable.
 */
function resolveHostFromRoster(
  name: string | null | undefined,
  roster: Array<{ name: string | null; host: string }>
): string | null {
  if (!name) return null;
  const needle = name.toLowerCase().trim();
  if (!needle) return null;
  for (const r of roster) {
    const candidate = (r.name ?? '').toLowerCase().trim();
    if (candidate && (candidate.includes(needle) || needle.includes(candidate))) return r.host;
  }
  // Last-resort: the name may itself be a host string ("stripe.com").
  const asHost = extractHost(needle);
  if (asHost && asHost === needle) return asHost;
  return null;
}

type FinalScore = {
  presence: number;
  relevance: number;
  sentiment: number | null;
  accuracy: number | null;
  overall: number;
  rankPosition: number | null;
  summary: string;
  citations: Array<{ url: string | null; title: string | null; host: string | null; type: 'direct' | 'indirect' }>;
  competitorMentions: Array<{
    host: string;
    name?: string | null;
    count: number;
    sentiment: number | null;
    rankPosition: number | null;
  }>;
  factualClaims: Array<{ claim: string; verdict: 'true' | 'false' | 'uncertain' }>;
};

function failedFinalScore(): FinalScore {
  return {
    presence: 0,
    relevance: 0,
    sentiment: null,
    accuracy: null,
    overall: 0,
    rankPosition: null,
    summary: '',
    citations: [],
    competitorMentions: [],
    factualClaims: [],
  };
}

function finalFromLlmOrHeuristic(args: {
  llm: Awaited<ReturnType<typeof llmScoreResponse>>;
  heuristic: ScoreOutput;
  competitorRoster: Array<{ name: string | null; host: string }>;
}): FinalScore {
  const { llm, heuristic, competitorRoster } = args;
  if (llm) {
    const sentiment = llm.presence === 1
      ? llm.sentiment === null
        ? heuristic.sentiment
        : Math.round(llm.sentiment)
      : null;

    return {
      presence: llm.presence,
      relevance: Math.round(llm.relevance),
      sentiment,
      accuracy: llm.accuracy,
      overall: Number(llm.overall.toFixed(2)),
      rankPosition: llm.rankPosition,
      summary: llm.summary,
      citations: mergeCitations(llm.citationsClassified, heuristic.citations),
      competitorMentions: llm.competitorMentions.map((c) => ({
        host: c.host ?? resolveHostFromRoster(c.name, competitorRoster) ?? '',
        name: c.name,
        count: c.mentionCount,
        sentiment: c.sentiment,
        rankPosition: c.rankPosition,
      })).filter((c) => c.host || c.name),
      factualClaims: llm.factualClaims,
    };
  }

  return {
    presence: heuristic.presence,
    relevance: heuristic.relevance,
    sentiment: heuristic.presence === 1 ? heuristic.sentiment : null,
    accuracy: null,
    overall: heuristic.presence === 1 ? heuristic.overall : 0,
    rankPosition: null,
    summary: '',
    citations: heuristic.citations.map((c) => ({ ...c, type: 'direct' as const })),
    competitorMentions: heuristic.competitorMentions.map((m) => ({
      ...m,
      name: m.host,
      rankPosition: null,
    })),
    factualClaims: [],
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function scoreWithRetry(
  input: LlmScoreInput,
  usageContext?: {
    userId: number | null;
    domainId: number;
    domainHost: string;
    runId: number;
    promptId: number;
    feature: string;
    operation?: string;
  }
): Promise<Awaited<ReturnType<typeof llmScoreResponse>>> {
  if (!shouldUseLlmScorer(input)) return null;
  const attempts = Math.max(1, DEEP_SCORING_RETRIES);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const scored = await llmScoreResponse(input, usageContext ? {
      userId: usageContext.userId,
      domainId: usageContext.domainId,
      domainHost: usageContext.domainHost,
      runId: usageContext.runId,
      promptId: usageContext.promptId,
      feature: usageContext.feature,
      operation: usageContext.operation ?? 'score_response',
      metadata: { attempt: attempt + 1 },
    } : undefined).catch(() => null);
    if (scored) return scored;
    if (attempt < attempts - 1) await sleep(350 * (attempt + 1));
  }
  return null;
}

async function callModelWithRetry(
  model: ModelDef,
  promptText: string,
  loc: UserLocation,
  usageContext: ModelUsageContext
): Promise<CallOutcome> {
  const attempts = Math.max(1, DEEP_ANSWER_RETRIES);
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await callModel(model, promptText, loc, usageContext);
    } catch (err) {
      lastErr = err;
      if (attempt < attempts - 1) await sleep(500 * (attempt + 1));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Model call failed');
}

function crawledPagesFromSnapshot(latestCrawl: { pages: unknown; pagesScanned?: number | null } | null | undefined) {
  return Array.isArray(latestCrawl?.pages)
    ? (latestCrawl!.pages as Array<{ url?: string; title?: string | null }>).map((p) => ({
        url: p.url ?? '',
        title: p.title ?? null,
      })).filter((p) => p.url)
    : [];
}

function buildRunSummaryFromRows(args: {
  rows: Array<{
    model: string;
    status?: string | null;
    presence: number;
    relevance: number;
    sentiment: number | null;
    overall: number;
    competitorMentions: unknown;
    citations: unknown;
  }>;
  crawledPages: Array<{ url: string; title: string | null }>;
  pagesScanned: number;
  scoringStatus: 'queued' | 'enriching' | 'completed' | 'failed';
  scoringProvisional: boolean;
  extra?: Record<string, unknown>;
}): Record<string, unknown> {
  const attemptedQueries = args.rows.length;
  const scoredRows = args.rows.filter((row) => row.status !== 'failed');
  const totalQueries = scoredRows.length;
  const summaryAccum = { presence: 0, relevance: 0, sentiment: 0, sentimentCount: 0, overall: 0 };
  const attemptedByModel = new Map<string, number>();
  for (const row of args.rows) attemptedByModel.set(row.model, (attemptedByModel.get(row.model) ?? 0) + 1);
  const perModel: Record<string, { count: number; presence: number; overall: number; sentiment: number; sentimentCount: number }> = {};
  for (const m of ROSTER) perModel[m.id] = { count: 0, presence: 0, overall: 0, sentiment: 0, sentimentCount: 0 };
  const competitorRollup: Record<string, { mentions: number; sentimentSum: number; sentimentCount: number }> = {};
  const citationRollup: Record<string, { count: number; titles: string[] }> = {};

  for (const row of scoredRows) {
    summaryAccum.presence += row.presence;
    summaryAccum.relevance += row.relevance;
    summaryAccum.overall += row.overall;
    if (row.sentiment !== null) {
      summaryAccum.sentiment += row.sentiment;
      summaryAccum.sentimentCount += 1;
    }

    const pm = perModel[row.model] ?? { count: 0, presence: 0, overall: 0, sentiment: 0, sentimentCount: 0 };
    pm.count += 1;
    pm.presence += row.presence;
    pm.overall += row.overall;
    if (row.sentiment !== null) {
      pm.sentiment += row.sentiment;
      pm.sentimentCount += 1;
    }
    perModel[row.model] = pm;

    const mentions = Array.isArray(row.competitorMentions)
      ? (row.competitorMentions as Array<{ host?: string; count?: number; sentiment?: number | null }>)
      : [];
    for (const mention of mentions) {
      const host = mention.host?.toLowerCase();
      if (!host) continue;
      const r = competitorRollup[host] ?? { mentions: 0, sentimentSum: 0, sentimentCount: 0 };
      r.mentions += typeof mention.count === 'number' && mention.count > 0 ? mention.count : 1;
      if (typeof mention.sentiment === 'number') {
        r.sentimentSum += mention.sentiment;
        r.sentimentCount += 1;
      }
      competitorRollup[host] = r;
    }

    const citations = Array.isArray(row.citations)
      ? (row.citations as Array<{ host?: string | null; title?: string | null }>)
      : [];
    for (const citation of citations) {
      const host = citation.host?.toLowerCase();
      if (!host) continue;
      if (!citationRollup[host]) citationRollup[host] = { count: 0, titles: [] };
      citationRollup[host].count += 1;
      if (citation.title && citationRollup[host].titles.length < 3) citationRollup[host].titles.push(citation.title);
    }
  }

  return {
    ...(args.extra ?? {}),
    totalQueries,
    attemptedQueries,
    successfulQueries: totalQueries,
    failedQueries: attemptedQueries - totalQueries,
    models: ROSTER.map((r) => r.id),
    presenceRate: totalQueries > 0 ? Number((summaryAccum.presence / totalQueries).toFixed(3)) : 0,
    avgRelevance: totalQueries > 0 ? Number((summaryAccum.relevance / totalQueries).toFixed(2)) : 0,
    avgSentiment:
      summaryAccum.sentimentCount > 0
        ? Number((summaryAccum.sentiment / summaryAccum.sentimentCount).toFixed(2))
        : null,
    sentimentSampleSize: summaryAccum.sentimentCount,
    avgOverall: totalQueries > 0 ? Number((summaryAccum.overall / totalQueries).toFixed(2)) : 0,
    perModel: Object.fromEntries(
      Object.entries(perModel).map(([model, m]) => [
        model,
        {
          queries: m.count,
          attemptedQueries: attemptedByModel.get(model) ?? m.count,
          failedQueries: Math.max(0, (attemptedByModel.get(model) ?? m.count) - m.count),
          presenceRate: Number((m.presence / Math.max(1, m.count)).toFixed(3)),
          avgOverall: Number((m.overall / Math.max(1, m.count)).toFixed(2)),
          avgSentiment:
            m.sentimentCount > 0
              ? Number((m.sentiment / m.sentimentCount).toFixed(2))
              : null,
          sentimentSampleSize: m.sentimentCount,
        },
      ])
    ),
    competitors: Object.entries(competitorRollup)
      .filter(([, v]) => v.mentions > 0)
      .map(([host, v]) => ({
        host,
        mentions: v.mentions,
        avgSentiment: v.sentimentCount > 0 ? Number((v.sentimentSum / v.sentimentCount).toFixed(2)) : null,
        shareOfVoice: totalQueries > 0 ? Number((v.mentions / totalQueries).toFixed(3)) : 0,
      }))
      .sort((a, b) => b.mentions - a.mentions),
    topCitedDomains: Object.entries(citationRollup)
      .map(([host, v]) => ({ host, count: v.count, sampleTitles: v.titles }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
    crawled: {
      pagesScanned: args.pagesScanned,
      pages: args.crawledPages.slice(0, 20),
    },
    scoringStatus: args.scoringStatus,
    scoringProvisional: args.scoringProvisional,
  };
}

// ── Public API ─────────────────────────────────────────────────────────────

export interface RunProgress {
  type: 'progress' | 'result' | 'complete' | 'error';
  message?: string;
  totalQueries?: number;
  completedQueries?: number;
  currentResult?: {
    promptId: number;
    model: string;
    status?: 'success' | 'failed';
    presence: number;
    relevance: number;
    sentiment: number | null;  // null when presence=0
    overall: number;
    citationCount: number;
    competitorMentionCount: number;
  };
  runId?: number;
  summary?: Record<string, unknown>;
  error?: string;
}

export interface RunOptions {
  prisma: PrismaClient;
  domainId: number;
  onProgress: (event: RunProgress) => void;
  /**
   * Which prompts to run. 'selected' (default) uses the wizard audit set
   * (isSelected=true). 'tracked' uses the recurring tracking set (isTracked=true).
   */
  selection?: 'selected' | 'tracked';
  /**
   * How this run is tagged on AiRun.kind. 'audit' (default) is the manual
   * wizard run; 'weekly' is the tracked-prompt re-test family. Keeping them
   * distinct prevents tracked runs from polluting the audit trend/runs charts.
   */
  kind?: 'audit' | 'weekly';
}

export function queueDeepScoringForRun(args: {
  prisma: PrismaClient;
  domainId: number;
  runId: number;
}): void {
  if (!DEEP_SCORING_IN_BACKGROUND) return;
  if (deepScoringInFlight.has(args.runId)) return;
  deepScoringInFlight.add(args.runId);
  setTimeout(() => {
    runDeepScoringForRun(args)
      .catch((err) => console.warn(`[run:${args.runId}] background scoring failed`, err))
      .finally(() => deepScoringInFlight.delete(args.runId));
  }, 0);
}

export async function runDeepScoringForRun(args: {
  prisma: PrismaClient;
  domainId: number;
  runId: number;
}): Promise<void> {
  const { prisma, domainId, runId } = args;

  const [run, domain, latestCrawl, selectedCompetitors, rows] = await Promise.all([
    prisma.aiRun.findFirst({
      where: { id: runId, domainId },
      select: { id: true, summary: true },
    }),
    prisma.domain.findUnique({
      where: { id: domainId },
      select: {
        userId: true,
        host: true,
        inferred: { select: { companyName: true, summary: true } },
        profile: { select: { country: true, state: true, targetLocation: true } },
      },
    }),
    prisma.crawlSnapshot.findFirst({
      where: { domainId },
      orderBy: { createdAt: 'desc' },
      select: { pages: true, pagesScanned: true, rawText: true },
    }),
    prisma.competitor.findMany({
      where: { domainId, isSelected: true },
      select: { competitorHost: true, rawSignals: true },
    }),
    prisma.aiQueryResult.findMany({
      where: { runId },
      select: {
        id: true,
        promptId: true,
        model: true,
        status: true,
        response: true,
        prompt: { select: { text: true } },
      },
    }),
  ]);

  if (!run || !domain || rows.length === 0) return;
  const domainRow = domain;

  const existingSummary = (run.summary as Record<string, unknown> | null) ?? {};
  await prisma.aiRun.update({
    where: { id: runId },
    data: {
      summary: {
        ...existingSummary,
        scoringStatus: 'enriching',
        scoringProvisional: true,
        scoringStartedAt: new Date().toISOString(),
      } as any,
    },
  }).catch(() => undefined);

  const competitorHosts = selectedCompetitors.map((c) => c.competitorHost);
  const competitorRoster = selectedCompetitors.map((c) => ({
    host: c.competitorHost,
    name:
      typeof (c.rawSignals as Record<string, unknown> | null)?.llmName === 'string'
        ? ((c.rawSignals as Record<string, unknown>).llmName as string)
        : null,
  }));
  const brandName = domainRow.inferred?.companyName ?? null;
  const brandFacts = domainRow.inferred?.summary ?? latestCrawl?.rawText?.slice(0, 1500) ?? '';
  const userLocation: UserLocation = {
    country: domainRow.profile?.country ?? null,
    state: domainRow.profile?.state ?? null,
    city: domainRow.profile?.targetLocation ?? null,
    timezone: null,
  };

  let cursor = 0;
  async function worker() {
    while (cursor < rows.length) {
      const row = rows[cursor++];
      const model = ROSTER.find((item) => item.id === row.model);
      let response = row.response ?? '';
      let latencyMs: number | null = null;
      let costUsd: number | null = null;
      let usageLedgerEntryId: number | null = null;
      let resultStatus: 'success' | 'failed' = row.status === 'failed' ? 'failed' : 'success';
      let errorMessage: string | null = null;

      if (!response.trim() && model) {
        try {
          const retried = await callModelWithRetry(model, row.prompt.text, userLocation, {
            userId: domainRow.userId,
            domainId,
            domainHost: domainRow.host,
            runId,
            promptId: row.promptId,
            feature: 'prompt_tracking',
            operation: 'background_answer_retry',
          });
          response = retried.response;
          latencyMs = retried.latencyMs;
          costUsd = retried.costUsd;
          usageLedgerEntryId = retried.usageLedgerEntryId ?? null;
          if (!response.trim()) {
            console.warn(`[run:${runId}] ${model.id} returned an empty response during background retry for prompt ${row.promptId}`);
            resultStatus = 'failed';
            errorMessage = 'Empty response from provider';
          } else {
            resultStatus = 'success';
          }
        } catch (err) {
          errorMessage = describeModelError(err);
          console.warn(`[run:${runId}] ${model.id} background retry failed for prompt ${row.promptId}: ${errorMessage}`);
          response = '';
          resultStatus = 'failed';
        }
      }

      const heuristic = resultStatus === 'success'
        ? scoreResponse({
            ownDomainHost: domainRow.host,
            competitorHosts,
            modelResponse: response,
          })
        : null;

      const scoreInput: LlmScoreInput = {
        prompt: row.prompt.text,
        response,
        brand: { name: brandName, aliases: [], host: domainRow.host },
        competitors: competitorRoster,
        brandFacts,
      };
      const llm = resultStatus === 'success' && response.trim() ? await scoreWithRetry(scoreInput, {
        userId: domainRow.userId,
        domainId,
        domainHost: domainRow.host,
        runId,
        promptId: row.promptId,
        feature: 'scorer',
      }) : null;
      const final = resultStatus === 'success' && heuristic
        ? finalFromLlmOrHeuristic({ llm, heuristic, competitorRoster })
        : failedFinalScore();

      if (llm) {
        for (const mention of llm.competitorMentions) {
          const host = mention.host ?? resolveHostFromRoster(mention.name, competitorRoster);
          if (!host || host === domainRow.host || competitorHosts.includes(host)) continue;
          await recordCompetitorMention(prisma, domainId, {
            host,
            name: mention.name,
            sentiment: mention.sentiment ?? 0,
          }).catch(() => undefined);
        }
      }

      const competitorHostsForRow = Array.from(new Set(final.competitorMentions.map((m) => m.host).filter(Boolean)));
      await prisma.aiQueryResult.update({
        where: { id: row.id },
        data: {
          response,
          status: resultStatus,
          errorMessage,
          presence: final.presence,
          relevance: final.relevance,
          sentiment: final.sentiment,
          accuracy: final.accuracy,
          rankPosition: final.rankPosition,
          overall: final.overall,
          scorerSummary: final.summary || null,
          factualClaims: final.factualClaims as any,
          competitorHosts: competitorHostsForRow as any,
          citations: final.citations as any,
          competitorMentions: final.competitorMentions as any,
          ...(latencyMs !== null ? { latencyMs } : {}),
          ...(costUsd !== null ? { costUsd } : {}),
        },
      });
      if (usageLedgerEntryId) {
        await prisma.usageLedgerEntry.update({
          where: { id: usageLedgerEntryId },
          data: { aiQueryResultId: row.id },
        }).catch(() => undefined);
      }
    }
  }

  try {
    await Promise.all(Array.from({ length: Math.max(1, DEEP_SCORING_PARALLEL) }, worker));
    const refreshed = await prisma.aiQueryResult.findMany({
      where: { runId },
      select: {
        model: true,
        status: true,
        presence: true,
        relevance: true,
        sentiment: true,
        overall: true,
        competitorMentions: true,
        citations: true,
      },
    });
    const latestRun = await prisma.aiRun.findUnique({ where: { id: runId }, select: { summary: true } });
    const preserved = (latestRun?.summary as Record<string, unknown> | null) ?? existingSummary;
    const summary = buildRunSummaryFromRows({
      rows: refreshed,
      crawledPages: crawledPagesFromSnapshot(latestCrawl),
      pagesScanned: latestCrawl?.pagesScanned ?? 0,
      scoringStatus: 'completed',
      scoringProvisional: false,
      extra: {
        ...preserved,
        scoringCompletedAt: new Date().toISOString(),
      },
    });
    await prisma.aiRun.update({
      where: { id: runId },
      data: { summary: summary as any },
    });
    invalidateRunReportCache(domainRow.userId, domainId);
  } catch (err) {
    const latestRun = await prisma.aiRun.findUnique({ where: { id: runId }, select: { summary: true } });
    const preserved = (latestRun?.summary as Record<string, unknown> | null) ?? existingSummary;
    await prisma.aiRun.update({
      where: { id: runId },
      data: {
        summary: {
          ...preserved,
          scoringStatus: 'failed',
          scoringProvisional: true,
          scoringError: err instanceof Error ? err.message : 'background scoring failed',
          scoringFailedAt: new Date().toISOString(),
        } as any,
      },
    }).catch(() => undefined);
    invalidateRunReportCache(domainRow.userId, domainId);
    throw err;
  }
}

export async function runQueries({
  prisma,
  domainId,
  onProgress,
  selection = 'selected',
  kind = 'audit',
}: RunOptions): Promise<void> {
  if (!isOpenRouterConfigured()) {
    onProgress({ type: 'error', error: 'OPENROUTER_API_KEY not configured.' });
    return;
  }

  // The only difference between an audit run and a tracked run is which
  // prompts we load — everything downstream (worker pool, scoring, summary) is
  // identical.
  const promptWhere =
    selection === 'tracked'
      ? { domainId, isTracked: true }
      : { domainId, isSelected: true };

  const [domain, latestCrawl, selectedPrompts, selectedCompetitors] = await Promise.all([
    prisma.domain.findUnique({
      where: { id: domainId },
      select: {
        userId: true,
        host: true,
        inferred: { select: { companyName: true, summary: true } },
        // Pull the user-supplied profile so we can localize the LLM calls
        // to the brand's actual market instead of defaulting to US (the
        // audit server's IP).
        profile: { select: { country: true, state: true, targetLocation: true } },
      },
    }),
    prisma.crawlSnapshot.findFirst({
      where: { domainId },
      orderBy: { createdAt: 'desc' },
      select: { pages: true, pagesScanned: true, rawText: true },
    }),
    prisma.prompt.findMany({
      where: promptWhere,
      select: { id: true, text: true },
    }),
    prisma.competitor.findMany({
      where: { domainId, isSelected: true },
      select: { competitorHost: true, rawSignals: true },
    }),
  ]);

  if (!domain) {
    onProgress({ type: 'error', error: 'Domain not found' });
    return;
  }
  let effectiveSelectedPrompts = selectedPrompts;
  if (effectiveSelectedPrompts.length === 0 && selection !== 'tracked') {
    const state = await prisma.wizardState.findUnique({
      where: { domainId },
      select: { selectionDraft: true },
    });
    const draft = state?.selectionDraft as { promptIds?: unknown } | null;
    const promptIds = Array.isArray(draft?.promptIds)
      ? draft!.promptIds
          .map((entry) => {
            if (typeof entry === 'number') return entry;
            if (typeof entry === 'string' && entry.trim()) return Number(entry);
            if (entry && typeof entry === 'object') {
              const record = entry as { id?: unknown; promptId?: unknown };
              const maybeId = record.id ?? record.promptId;
              return typeof maybeId === 'number' ? maybeId : typeof maybeId === 'string' ? Number(maybeId) : NaN;
            }
            return NaN;
          })
          .filter((n): n is number => Number.isFinite(n))
      : [];
    if (promptIds.length > 0) {
      effectiveSelectedPrompts = await prisma.prompt.findMany({
        where: { domainId, id: { in: promptIds } },
        select: { id: true, text: true },
      });
    }
  }

  if (effectiveSelectedPrompts.length === 0) {
    onProgress({
      type: 'error',
      error: selection === 'tracked' ? 'No prompts tracked' : 'No prompts selected',
    });
    return;
  }

  // Brand identity for the scorer — pass name + host so alias-aware presence
  // detection works (catches "Bajaj Finserv" without the URL).
  const brandName = domain.inferred?.companyName ?? null;
  const brandFacts = domain.inferred?.summary ?? latestCrawl?.rawText?.slice(0, 1500) ?? '';

  const competitorHosts = selectedCompetitors.map((c) => c.competitorHost);
  const competitorRoster = selectedCompetitors.map((c) => ({
    host: c.competitorHost,
    name:
      typeof (c.rawSignals as Record<string, unknown> | null)?.llmName === 'string'
        ? ((c.rawSignals as Record<string, unknown>).llmName as string)
        : null,
  }));

  // Compose the location passed to every chat call. targetLocation (a free
  // string the user can fill in Step 1's advanced field) takes precedence
  // because it represents where the user actually wants to be visible —
  // could be a city like "Bangalore" or a region like "EMEA".
  const userLocation: UserLocation = {
    country: domain.profile?.country ?? null,
    state: domain.profile?.state ?? null,
    city: domain.profile?.targetLocation ?? null,
    timezone: null,
  };
  const totalQueries = effectiveSelectedPrompts.length * ROSTER.length;
  const crawledPages = crawledPagesFromSnapshot(latestCrawl);

  const run = await prisma.aiRun.create({ data: { domainId, status: 'running', kind } });

  onProgress({
    type: 'progress',
    message: `Asking each AI assistant your prompts (${totalQueries} total)…`,
    totalQueries,
    completedQueries: 0,
    runId: run.id,
  });

  // Aggregate accumulators for the run summary.
  // sentimentCount tracks how many rows actually had a measurable sentiment
  // (presence=1) so we can average sentiment honestly — over rows where it
  // exists, not over all queries (which would dilute the signal with zeros
  // from non-mention rows).
  const summaryAccum: { presence: number; relevance: number; sentiment: number; sentimentCount: number; overall: number } = {
    presence: 0,
    relevance: 0,
    sentiment: 0,
    sentimentCount: 0,
    overall: 0,
  };
  const perModel: Record<
    string,
    { attempted: number; count: number; failed: number; presence: number; overall: number; sentiment: number; sentimentCount: number }
  > = {};
  for (const m of ROSTER) {
    perModel[m.id] = { attempted: 0, count: 0, failed: 0, presence: 0, overall: 0, sentiment: 0, sentimentCount: 0 };
  }

  // Per-competitor totals across the whole run — feeds the "competitor share-of-voice" UI.
  const competitorRollup: Record<string, { mentions: number; sentimentSum: number; sentimentCount: number }> = {};
  for (const host of competitorHosts) competitorRollup[host] = { mentions: 0, sentimentSum: 0, sentimentCount: 0 };

  // Citation rollup — host → { count, sample titles } for the top-domain UI.
  const citationRollup: Record<string, { count: number; titles: string[] }> = {};

  // Build the work queue (prompt × model) and run with bounded concurrency.
  interface WorkItem {
    prompt: { id: number; text: string };
    model: ModelDef;
  }
  const queue: WorkItem[] = [];
  for (const prompt of effectiveSelectedPrompts) for (const model of ROSTER) queue.push({ prompt, model });

  let completedQueries = 0;

  async function worker() {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) return;
      let response = '';
      let latencyMs = 0;
      let costUsd: number | null = null;
      let usageLedgerEntryId: number | null = null;
      let resultStatus: 'success' | 'failed' = 'success';
      let errorMessage: string | null = null;
      try {
        const out = await callModel(item.model, item.prompt.text, userLocation, {
          userId: domain!.userId,
          domainId,
          domainHost: domain!.host,
          runId: run.id,
          promptId: item.prompt.id,
          feature: kind === 'weekly' ? 'prompt_tracking' : 'domain_analysis',
          operation: 'answer_generation',
        });
        response = out.response;
        latencyMs = out.latencyMs;
        costUsd = out.costUsd;
        usageLedgerEntryId = out.usageLedgerEntryId ?? null;
        if (!response.trim()) {
          console.warn(`[run:${run.id}] ${item.model.id} returned an empty response for prompt ${item.prompt.id}`);
          resultStatus = 'failed';
          errorMessage = 'Empty response from provider';
        }
      } catch (err) {
        errorMessage = describeModelError(err);
        console.warn(`[run:${run.id}] ${item.model.id} failed for prompt ${item.prompt.id}: ${errorMessage}`);
        response = '';
        resultStatus = 'failed';
      }
      // Heuristic scoring is fast and runs unconditionally — used as the
      // baseline + safety net if the LLM scorer fails or times out.
      const heuristic = resultStatus === 'success'
        ? scoreResponse({
            ownDomainHost: domain!.host,
            competitorHosts,
            modelResponse: response,
          })
        : null;

      // Foreground runs stay fast: write heuristic/provisional scores now.
      // Set DEEP_SCORING_IN_BACKGROUND=false to restore the old fully-inline
      // scorer behavior for debugging or one-off quality checks.
      const llm = resultStatus === 'success' && !DEEP_SCORING_IN_BACKGROUND && response.trim()
        ? await scoreWithRetry({
            prompt: item.prompt.text,
            response,
            brand: { name: brandName, aliases: [], host: domain!.host },
            competitors: competitorRoster,
            brandFacts,
          }, {
            userId: domain!.userId,
            domainId,
            domainHost: domain!.host,
            runId: run.id,
            promptId: item.prompt.id,
            feature: 'scorer',
          })
        : null;
      const final = resultStatus === 'success' && heuristic
        ? finalFromLlmOrHeuristic({ llm, heuristic, competitorRoster })
        : failedFinalScore();

      // Auto-add any LLM-discovered competitor that isn't already tracked
      // for this domain — closes the AI-mention feedback loop.
      if (llm) {
        for (const m of llm.competitorMentions) {
          const host = m.host ?? resolveHostFromRoster(m.name, competitorRoster);
          if (!host) continue; // can't dedupe without a host; skip
          if (host === domain!.host) continue; // not a competitor of self
          if (competitorHosts.includes(host)) continue; // already in user's tracked set
          await recordCompetitorMention(prisma, domainId, {
            host,
            name: m.name,
            // Mention sentiment can be null (LLM said competitor was just
            // named, not commented on). recordCompetitorMention only stores
            // numeric values, so coalesce to 0 = neutral marker.
            sentiment: m.sentiment ?? 0,
          }).catch(() => undefined);
        }
      }

      // Roll up competitor mentions across the whole run.
      for (const m of final.competitorMentions) {
        if (!m.host) continue;
        const r = competitorRollup[m.host] ?? { mentions: 0, sentimentSum: 0, sentimentCount: 0 };
        r.mentions += m.count ?? 1;
        r.sentimentSum += m.sentiment ?? 0;
        r.sentimentCount += 1;
        competitorRollup[m.host] = r;
      }

      // Roll up citations across the whole run.
      for (const c of final.citations) {
        if (!c.host) continue;
        if (!citationRollup[c.host]) citationRollup[c.host] = { count: 0, titles: [] };
        citationRollup[c.host].count += 1;
        if (c.title && citationRollup[c.host].titles.length < 3) citationRollup[c.host].titles.push(c.title);
      }

      // Build the legacy `competitorHosts` array column from final.competitorMentions.
      const competitorHostsForRow = Array.from(new Set(final.competitorMentions.map((m) => m.host).filter(Boolean)));

      const created = await prisma.aiQueryResult.create({
        data: {
          runId: run.id,
          promptId: item.prompt.id,
          model: item.model.id,
          status: resultStatus,
          errorMessage,
          response,
          presence: final.presence,
          relevance: final.relevance,
          sentiment: final.sentiment,            // null when presence=0
          accuracy: final.accuracy,               // null when presence=0
          rankPosition: final.rankPosition,       // null unless brand was in a list
          overall: final.overall,                 // 0 when presence=0
          scorerSummary: final.summary || null,
          factualClaims: final.factualClaims as any,
          competitorHosts: competitorHostsForRow as any,
          citations: final.citations as any,
          competitorMentions: final.competitorMentions as any,
          latencyMs,
          costUsd,
        },
      });
      if (usageLedgerEntryId) {
        await prisma.usageLedgerEntry.update({
          where: { id: usageLedgerEntryId },
          data: { aiQueryResultId: created.id },
        }).catch(() => undefined);
      }

      completedQueries++;
      const pm = perModel[item.model.id];
      pm.attempted += 1;
      if (resultStatus === 'failed') {
        pm.failed += 1;
      } else {
        summaryAccum.presence += final.presence;
        summaryAccum.relevance += final.relevance;
        // Sentiment averages only across rows where the brand was actually
        // mentioned — averaging in nulls/zeros from non-mention rows would
        // mask the real sentiment signal.
        if (final.sentiment !== null) {
          summaryAccum.sentiment += final.sentiment;
          summaryAccum.sentimentCount = (summaryAccum.sentimentCount ?? 0) + 1;
        }
        summaryAccum.overall += final.overall;
        pm.count += 1;
        pm.presence += final.presence;
        pm.overall += final.overall;
        if (final.sentiment !== null) {
          pm.sentiment += final.sentiment;
          pm.sentimentCount = (pm.sentimentCount ?? 0) + 1;
        }
      }

      onProgress({
        type: 'result',
        completedQueries,
        totalQueries,
        currentResult: {
          promptId: item.prompt.id,
          model: item.model.id,
          presence: final.presence,
          status: resultStatus,
          relevance: final.relevance,
          sentiment: final.sentiment,
          overall: final.overall,
          citationCount: final.citations.length,
          competitorMentionCount: final.competitorMentions.length,
        },
      });
    }
  }

  try {
    await Promise.all(Array.from({ length: MAX_PARALLEL }, worker));

    const successfulQueries = Object.values(perModel).reduce((sum, m) => sum + m.count, 0);
    const failedQueries = Math.max(0, totalQueries - successfulQueries);
    const summary = {
      totalQueries: successfulQueries,
      attemptedQueries: totalQueries,
      successfulQueries,
      failedQueries,
      models: ROSTER.map((r) => r.id),
      presenceRate: successfulQueries > 0 ? Number((summaryAccum.presence / successfulQueries).toFixed(3)) : 0,
      avgRelevance: successfulQueries > 0 ? Number((summaryAccum.relevance / successfulQueries).toFixed(2)) : 0,
      // avgSentiment is null if no row had a measurable sentiment — better
      // than reporting 0 which the UI would interpret as "Neutral".
      avgSentiment:
        summaryAccum.sentimentCount > 0
          ? Number((summaryAccum.sentiment / summaryAccum.sentimentCount).toFixed(2))
          : null,
      sentimentSampleSize: summaryAccum.sentimentCount,
      avgOverall: successfulQueries > 0 ? Number((summaryAccum.overall / successfulQueries).toFixed(2)) : 0,
      perModel: Object.fromEntries(
        Object.entries(perModel).map(([model, m]) => [
          model,
          {
            queries: m.count,
            attemptedQueries: m.attempted,
            failedQueries: m.failed,
            presenceRate: Number((m.presence / Math.max(1, m.count)).toFixed(3)),
            avgOverall: Number((m.overall / Math.max(1, m.count)).toFixed(2)),
            // Same null-honest averaging here.
            avgSentiment:
              m.sentimentCount > 0
                ? Number((m.sentiment / m.sentimentCount).toFixed(2))
                : null,
            sentimentSampleSize: m.sentimentCount,
          },
        ])
      ),
      competitors: Object.entries(competitorRollup)
        .filter(([, v]) => v.mentions > 0)
        .map(([host, v]) => ({
          host,
          mentions: v.mentions,
          // sentiment averaged only across responses where the competitor was actually mentioned
          avgSentiment: Number(((v.sentimentSum / Math.max(1, v.sentimentCount))).toFixed(2)),
          // share = competitor mentions / total queries (not /total mentions — that double-counts)
          shareOfVoice: successfulQueries > 0 ? Number((v.mentions / successfulQueries).toFixed(3)) : 0,
        }))
        .sort((a, b) => b.mentions - a.mentions),
      topCitedDomains: Object.entries(citationRollup)
        .map(([host, v]) => ({ host, count: v.count, sampleTitles: v.titles }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
      // Provenance — what we crawled to ground this analysis
      crawled: {
        pagesScanned: latestCrawl?.pagesScanned ?? 0,
        pages: crawledPages.slice(0, 20),
      },
      scoringStatus: DEEP_SCORING_IN_BACKGROUND ? 'queued' : 'completed',
      scoringProvisional: DEEP_SCORING_IN_BACKGROUND,
      scoringQueuedAt: DEEP_SCORING_IN_BACKGROUND ? new Date().toISOString() : null,
    };
    await prisma.aiRun.update({
      where: { id: run.id },
      data: { status: 'completed', endedAt: new Date(), summary: summary as any },
    });
    // Stamp the prompts we just re-tested so the dashboard can show
    // "last tested" without re-deriving it from run history.
    if (kind === 'weekly') {
      await prisma.prompt.updateMany({
        where: { id: { in: effectiveSelectedPrompts.map((p) => p.id) } },
        data: { lastTrackedRunAt: new Date() },
      });
    }
    invalidateRunReportCache(domain.userId, domainId);
    queueDeepScoringForRun({ prisma, domainId, runId: run.id });
    onProgress({ type: 'complete', runId: run.id, summary });
  } catch (err) {
    await prisma.aiRun.update({
      where: { id: run.id },
      data: { status: 'failed', endedAt: new Date() },
    });
    onProgress({ type: 'error', error: err instanceof Error ? err.message : 'AI queries failed' });
  }
}

/**
 * runTrackedQueries — convenience wrapper that re-tests the domain's
 * tracked prompts (isTracked=true) and tags the resulting AiRun as
 * kind='weekly'. Used by the daily scheduler and the manual "Test tracked
 * now" trigger. onProgress defaults to a no-op for the headless scheduler.
 */
export async function runTrackedQueries(
  prisma: PrismaClient,
  domainId: number,
  onProgress: (event: RunProgress) => void = () => {},
): Promise<void> {
  return runQueries({ prisma, domainId, onProgress, selection: 'tracked', kind: 'weekly' });
}

/**
 * runOnePrompt — single-prompt variant of runQueries.
 *
 * Fans ONE prompt across the ROSTER, persists fast provisional AiQueryResult
 * rows under a fresh AiRun, and returns the new run's id + persisted results
 * so the caller can shape them into a PromptTableRow. The deeper scorer is
 * queued in the background just like the full wizard run.
 *
 * Used by POST /api/wizard/domain/:id/prompts/analyze — the "Analyze
 * Prompt" button on the AI Checker dashboard. The dashboard never wants
 * a full re-run of every selected prompt when the user adds a single
 * one; that would be both slow and budget-amplifying.
 *
 * The AiRun this creates is marked `status='completed'` on success, so
 * the existing /report endpoint (which aggregates across all completed
 * runs for the domain) picks up the new results without any further
 * plumbing.
 */
export interface RunOnePromptResult {
  runId: number;
  persistedResults: Array<{
    id: number;
    model: string;
    status: 'success' | 'failed';
    errorMessage: string | null;
    presence: number;
    overall: number;
    relevance: number;
    sentiment: number | null;
    accuracy: number | null;
    rankPosition: number | null;
    scorerSummary: string | null;
    response: string;
    citations: unknown;
    competitorMentions: unknown;
    competitorHosts: unknown;
    factualClaims: unknown;
    latencyMs: number;
  }>;
}

export async function runOnePrompt(
  prisma: PrismaClient,
  args: { domainId: number; promptId: number }
): Promise<RunOnePromptResult> {
  if (!isOpenRouterConfigured()) {
    throw new Error('OPENROUTER_API_KEY not configured.');
  }
  const { domainId, promptId } = args;

  // Same context shape as runQueries — keeps the scorer apples-to-apples
  // with the full-wizard run.
  const [domain, latestCrawl, promptRow, selectedCompetitors] = await Promise.all([
    prisma.domain.findUnique({
      where: { id: domainId },
      select: {
        userId: true,
        host: true,
        inferred: { select: { companyName: true, summary: true } },
        profile: { select: { country: true, state: true, targetLocation: true } },
      },
    }),
    prisma.crawlSnapshot.findFirst({
      where: { domainId },
      orderBy: { createdAt: 'desc' },
      select: { rawText: true },
    }),
    prisma.prompt.findUnique({
      where: { id: promptId },
      select: { id: true, text: true, domainId: true },
    }),
    prisma.competitor.findMany({
      where: { domainId, isSelected: true },
      select: { competitorHost: true, rawSignals: true },
    }),
  ]);

  if (!domain) throw new Error('Domain not found');
  if (!promptRow || promptRow.domainId !== domainId) throw new Error('Prompt not found');

  const brandName = domain.inferred?.companyName ?? null;
  const brandFacts =
    domain.inferred?.summary ?? latestCrawl?.rawText?.slice(0, 1500) ?? '';
  const competitorHosts = selectedCompetitors.map((c) => c.competitorHost);
  const competitorRoster = selectedCompetitors.map((c) => ({
    host: c.competitorHost,
    name:
      typeof (c.rawSignals as Record<string, unknown> | null)?.llmName === 'string'
        ? ((c.rawSignals as Record<string, unknown>).llmName as string)
        : null,
  }));
  const userLocation: UserLocation = {
    country: domain.profile?.country ?? null,
    state: domain.profile?.state ?? null,
    city: domain.profile?.targetLocation ?? null,
    timezone: null,
  };

  // kind='adhoc' — this run covers a SINGLE prompt (the /prompts/analyze
  // endpoint). It must never masquerade as the domain's latest full audit:
  // the audit dashboards (/report, /trends, /competitor-analysis) all read the
  // latest completed kind='audit' run, so a 1-prompt run defaulting to 'audit'
  // would replace the real audit and collapse the dashboard to one prompt
  // (competitor analysis goes empty, trends gains a junk point). The endpoint
  // returns this run's results to the caller directly, so isolating its kind
  // costs nothing while keeping the aggregate dashboards honest.
  const run = await prisma.aiRun.create({ data: { domainId, status: 'running', kind: 'adhoc' } });

  // Run each model in parallel — bounded by ROSTER size, so
  // we don't bother with the worker-queue concurrency control runQueries
  // uses for tens of prompts.
  let summaryPresence = 0;
  let summaryOverall = 0;
  const sentimentSamples: number[] = [];
  let totalLatency = 0;

  const persistedResults: RunOnePromptResult['persistedResults'] = [];

  try {
    const tasks = ROSTER.map(async (model) => {
      let response = '';
      let latencyMs = 0;
      let costUsd: number | null = null;
      let usageLedgerEntryId: number | null = null;
      let resultStatus: 'success' | 'failed' = 'success';
      let errorMessage: string | null = null;
      try {
        const out = await callModel(model, promptRow.text, userLocation, {
          userId: domain.userId,
          domainId,
          domainHost: domain.host,
          runId: run.id,
          promptId: promptRow.id,
          feature: 'prompt_tracking',
          operation: 'adhoc_answer_generation',
        });
        response = out.response;
        latencyMs = out.latencyMs;
        costUsd = out.costUsd;
        usageLedgerEntryId = out.usageLedgerEntryId ?? null;
        if (!response.trim()) {
          console.warn(`[run:${run.id}] ${model.id} returned an empty response for ad-hoc prompt ${promptRow.id}`);
          resultStatus = 'failed';
          errorMessage = 'Empty response from provider';
        }
      } catch (err) {
        errorMessage = describeModelError(err);
        console.warn(`[run:${run.id}] ${model.id} failed for ad-hoc prompt ${promptRow.id}: ${errorMessage}`);
        response = '';
        resultStatus = 'failed';
      }

      const heuristic = resultStatus === 'success'
        ? scoreResponse({
            ownDomainHost: domain.host,
            competitorHosts,
            modelResponse: response,
          })
        : null;

      const llm = resultStatus === 'success' && !DEEP_SCORING_IN_BACKGROUND && response.trim()
        ? await scoreWithRetry({
            prompt: promptRow.text,
            response,
            brand: { name: brandName, aliases: [], host: domain.host },
            competitors: competitorRoster,
            brandFacts,
          }, {
            userId: domain.userId,
            domainId,
            domainHost: domain.host,
            runId: run.id,
            promptId: promptRow.id,
            feature: 'scorer',
          })
        : null;
      const final = resultStatus === 'success' && heuristic
        ? finalFromLlmOrHeuristic({ llm, heuristic, competitorRoster })
        : failedFinalScore();

      const competitorHostsForRow = Array.from(
        new Set(final.competitorMentions.map((m) => m.host).filter(Boolean))
      );

      const created = await prisma.aiQueryResult.create({
        data: {
          runId: run.id,
          promptId: promptRow.id,
          model: model.id,
          status: resultStatus,
          errorMessage,
          response,
          presence: final.presence,
          relevance: final.relevance,
          sentiment: final.sentiment,
          accuracy: final.accuracy,
          rankPosition: final.rankPosition,
          overall: final.overall,
          scorerSummary: final.summary || null,
          factualClaims: final.factualClaims as any,
          competitorHosts: competitorHostsForRow as any,
          citations: final.citations as any,
          competitorMentions: final.competitorMentions as any,
          latencyMs,
          costUsd,
        },
      });
      if (usageLedgerEntryId) {
        await prisma.usageLedgerEntry.update({
          where: { id: usageLedgerEntryId },
          data: { aiQueryResultId: created.id },
        }).catch(() => undefined);
      }
      persistedResults.push({
        id: created.id,
        model: model.id,
        status: resultStatus,
        errorMessage,
        presence: final.presence,
        overall: final.overall,
        relevance: final.relevance,
        sentiment: final.sentiment,
        accuracy: final.accuracy,
        rankPosition: final.rankPosition,
        scorerSummary: final.summary || null,
        response,
        citations: final.citations,
        competitorMentions: final.competitorMentions,
        competitorHosts: competitorHostsForRow,
        factualClaims: final.factualClaims,
        latencyMs,
      });

      summaryPresence += final.presence;
      if (resultStatus === 'success') {
        summaryOverall += final.overall;
        if (final.sentiment !== null) sentimentSamples.push(final.sentiment);
      }
      totalLatency += latencyMs;
      void costUsd; // accounted for elsewhere
    });
    await Promise.all(tasks);

    const attemptedQueries = ROSTER.length;
    const successfulQueries = persistedResults.filter((result) => result.status !== 'failed').length;
    const failedQueries = attemptedQueries - successfulQueries;
    const avgSentiment =
      sentimentSamples.length > 0
        ? Number((sentimentSamples.reduce((s, n) => s + n, 0) / sentimentSamples.length).toFixed(2))
        : null;
    const summary = {
      totalQueries: successfulQueries,
      attemptedQueries,
      successfulQueries,
      failedQueries,
      models: ROSTER.map((r) => r.id),
      presenceRate: successfulQueries > 0 ? Number((summaryPresence / successfulQueries).toFixed(3)) : 0,
      avgOverall: successfulQueries > 0 ? Number((summaryOverall / successfulQueries).toFixed(2)) : 0,
      avgSentiment,
      sentimentSampleSize: sentimentSamples.length,
      totalLatencyMs: totalLatency,
      singlePromptAnalysis: true, // discriminator for ops queries
      scoringStatus: DEEP_SCORING_IN_BACKGROUND ? 'queued' : 'completed',
      scoringProvisional: DEEP_SCORING_IN_BACKGROUND,
      scoringQueuedAt: DEEP_SCORING_IN_BACKGROUND ? new Date().toISOString() : null,
    };
    await prisma.aiRun.update({
      where: { id: run.id },
      data: { status: 'completed', endedAt: new Date(), summary: summary as any },
    });
    invalidateRunReportCache(domain.userId, domainId);
    queueDeepScoringForRun({ prisma, domainId, runId: run.id });
  } catch (err) {
    await prisma.aiRun
      .update({
        where: { id: run.id },
        data: { status: 'failed', endedAt: new Date() },
      })
      .catch(() => undefined);
    throw err;
  }

  return { runId: run.id, persistedResults };
}
