/**
 * runService — Step 5 of the wizard.
 *
 * Fans each user-selected prompt across multiple LLMs through OpenRouter and
 * scores every response twice:
 *
 *   1. Deterministic — fast regex/keyword extraction (citations, hostname
 *      matches). Used as the immediate fallback if the LLM scorer fails.
 *   2. LLM scorer    — second OpenRouter call with strict JSON schema, returns
 *      alias-aware presence, real sentiment, real relevance, rank position,
 *      factual-claim verdicts, and per-competitor sentiment. When this returns
 *      successfully, its numbers override the heuristic ones.
 *
 * Any competitor the scorer surfaces in the response that isn't already in
 * the Competitor table gets auto-added (source: 'mention') so the next Step 3
 * regen builds on real-world signal.
 */

import OpenAI from 'openai';
import axios from 'axios';
import crypto from 'crypto';
import type { PrismaClient } from '../../generated/prisma';
import { scoreResponse as llmScoreResponse } from './scoreService';
import { recordCompetitorMention } from './competitorService';
import { extractHost } from './urlNormalize';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const SERPAPI_KEY = process.env.SERP_API_KEY || process.env.SERPAPI_KEY;
const APP_URL = process.env.OPENROUTER_REFERRER || 'http://localhost:3002';
const APP_TITLE = 'AI Visibility Wizard';

const router = OPENROUTER_API_KEY
  ? new OpenAI({
      apiKey: OPENROUTER_API_KEY,
      baseURL: 'https://openrouter.ai/api/v1',
      // OpenRouter requires these headers for analytics + ranking on their end.
      defaultHeaders: {
        'HTTP-Referer': APP_URL,
        'X-Title': APP_TITLE,
      },
    })
  : null;

const QUERY_TIMEOUT_MS = 60_000;
// Bounded worker pool over (prompt × model) work. The pool already lets the
// three models for a single prompt run in parallel — the only effective
// knob is the pool size. Raised from 4 → 6 because OpenRouter comfortably
// handles 8 concurrent requests on standard accounts; 6 leaves headroom
// for the per-result scoring LLM call (gpt-4o-mini) that follows each
// model response. Net effect: ~33% faster audits without a meaningful
// rate-limit risk.
const MAX_PARALLEL = 6;

/**
 * The roster — three frontier models routed via OpenRouter, configured to
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
    // `:online` wraps the model in OpenRouter's Exa-backed web search.
    // Best parity available — OpenRouter can't passthrough Google's native
    // google_search grounding tool. For true Gemini grounding we'd need to
    // call Vertex/AI Studio direct (future work).
    openrouterModel: 'google/gemini-2.0-flash-001:online',
    webSearchMode: 'online_shim',
    productName: 'Gemini',
    knowledgeCutoff: 'early 2025',
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

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)),
  ]);
}

interface CallOutcome {
  response: string;
  latencyMs: number;
  costUsd: number | null;
}

export class RunPipelineError extends Error {
  constructor(
    message: string,
    public code: string,
    public status = 502,
    public details: Record<string, unknown> | null = null,
  ) {
    super(message);
    this.name = 'RunPipelineError';
  }
}

function readErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message.trim()) return err.message.trim();
  if (typeof err === 'string' && err.trim()) return err.trim();
  return 'Unknown error';
}

function readErrorStatus(err: unknown): number | null {
  if (!err || typeof err !== 'object') return null;
  const record = err as Record<string, unknown> & { response?: { status?: unknown; data?: unknown } };
  if (typeof record.status === 'number') return record.status;
  if (typeof record.statusCode === 'number') return record.statusCode;
  if (typeof record.response?.status === 'number') return record.response.status;
  return null;
}

function readErrorDetails(err: unknown): unknown {
  if (!err || typeof err !== 'object') return null;
  const record = err as Record<string, unknown> & { response?: { data?: unknown } };
  if (record.response?.data !== undefined) return record.response.data;
  if ('details' in record) return record.details;
  return null;
}

function normalizeRunError(
  err: unknown,
  context: { domainId: number; host: string; model?: string; promptId?: number },
): RunPipelineError {
  if (err instanceof RunPipelineError) return err;

  const upstreamStatus = readErrorStatus(err);
  const upstreamMessage = readErrorMessage(err);
  const upstreamDetails = readErrorDetails(err);
  const message = `Refresh failed for ${context.host}${context.model ? ` (${context.model})` : ''}${context.promptId ? ` prompt ${context.promptId}` : ''}: ${upstreamMessage}`;

  let code = 'RUN_PIPELINE_FAILED';
  let status = 500;
  if (upstreamStatus === 401 && /Missing Authentication header/i.test(upstreamMessage)) {
    code = 'OPENROUTER_AUTH_MISSING';
    status = 502;
  } else if (upstreamStatus === 401 || upstreamStatus === 403) {
    code = 'OPENROUTER_AUTH_FAILED';
    status = 502;
  } else if (upstreamStatus === 429) {
    code = 'OPENROUTER_RATE_LIMITED';
    status = 502;
  } else if (upstreamStatus !== null && upstreamStatus >= 500) {
    code = 'OPENROUTER_UPSTREAM_ERROR';
    status = 502;
  }

  return new RunPipelineError(message, code, status, {
    domainId: context.domainId,
    host: context.host,
    model: context.model ?? null,
    promptId: context.promptId ?? null,
    upstreamStatus,
    upstreamMessage,
    upstreamDetails,
  });
}

type AnalysisPromptSnapshotItem = {
  id: number;
  text: string;
  intent: string | null;
  source: string;
  keywordId: number | null;
  category: string | null;
  intentStage: string | null;
  persona: string | null;
  useCase: string | null;
  constraint: string | null;
  isBranded: boolean;
  competitorMentioned: string | null;
};

const normalizeSnapshotText = (value: string | null | undefined): string => (value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

function buildAnalysisFingerprint(prompts: AnalysisPromptSnapshotItem[]): string {
  const payload = prompts
    .map((p) => ({
      text: normalizeSnapshotText(p.text),
      intent: normalizeSnapshotText(p.intent),
      source: normalizeSnapshotText(p.source),
      keywordId: p.keywordId ?? null,
      category: normalizeSnapshotText(p.category),
      intentStage: normalizeSnapshotText(p.intentStage),
      persona: normalizeSnapshotText(p.persona),
      useCase: normalizeSnapshotText(p.useCase),
      constraint: normalizeSnapshotText(p.constraint),
      isBranded: Boolean(p.isBranded),
      competitorMentioned: normalizeSnapshotText(p.competitorMentioned),
    }))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function buildAnalysisSnapshot(prompts: AnalysisPromptSnapshotItem[]) {
  return prompts
    .map((p) => ({
      id: p.id,
      text: p.text,
      intent: p.intent,
      source: p.source,
      keywordId: p.keywordId,
      category: p.category,
      intentStage: p.intentStage,
      persona: p.persona,
      useCase: p.useCase,
      constraint: p.constraint,
      isBranded: p.isBranded,
      competitorMentioned: p.competitorMentioned,
    }))
    .sort((a, b) => a.id - b.id);
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

async function callModel(model: ModelDef, promptText: string, loc: UserLocation): Promise<CallOutcome> {
  const startedAt = Date.now();

  if (model.webSearchMode === 'serpapi_sge') {
    if (!SERPAPI_KEY) throw new Error('SERP_API_KEY not configured for Google AI Overview');
    const iso = isoCountry(loc.country);
    const locationParam = iso ? COUNTRY_TO_ISO[iso.toLowerCase()] || iso : undefined;
    
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

    const aiOverview = res.data?.ai_overview?.text ?? '';
    const organic = res.data?.organic_results?.[0]?.snippet ?? '';
    
    // Fallback to organic snippet if AI overview is not present
    const responseText = aiOverview || organic;
    
    return {
      response: responseText,
      latencyMs: Date.now() - startedAt,
      costUsd: 0.005, // Approximation of SerpAPI per-request cost
    };
  }

  if (!router) throw new Error('OPENROUTER_API_KEY not configured');
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const payload = buildRequestPayload(model, promptText, today, loc);
  // We deliberately use the raw client.post rather than chat.completions.create
  // because OpenRouter's `tools`/`plugins` fields don't strictly match the
  // OpenAI SDK type definitions, and we want the request shape to be
  // verbatim what each provider expects.
  const completion = (await withTimeout(
    (router as any).chat.completions.create(payload),
    QUERY_TIMEOUT_MS
  )) as { choices?: Array<{ message?: { content?: string; annotations?: unknown[] } }>; usage?: { cost?: number }; citations?: unknown[] };
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
  // OpenRouter exposes per-call cost on response.usage.cost (USD) when available.
  const usage = (completion as unknown as { usage?: { cost?: number } }).usage;
  const costUsd = typeof usage?.cost === 'number' ? usage.cost : null;
  return { response: enrichedResponse, latencyMs: Date.now() - startedAt, costUsd };
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

// ── Public API ─────────────────────────────────────────────────────────────

export interface RunProgress {
  type: 'progress' | 'result' | 'complete' | 'error';
  message?: string;
  totalQueries?: number;
  completedQueries?: number;
  currentResult?: {
    promptId: number;
    model: string;
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
   * Which prompts to run. 'selected' (default) uses the active branch's
   * selected prompts. 'tracked' keeps the tracked-prompt convenience path.
   */
  selection?: 'selected' | 'tracked';
  /**
   * How this run is tagged on AiRun.kind. 'audit' is the wizard run,
   * 'refresh' is the manual branch refresh, and 'adhoc' is the single-prompt
   * path that must stay out of the branch charts.
   */
  kind?: 'audit' | 'refresh' | 'adhoc';
}

export async function runQueries({
  prisma,
  domainId,
  onProgress,
  selection = 'selected',
  kind = 'audit',
}: RunOptions): Promise<void> {
  if (!router) {
    throw new RunPipelineError('OPENROUTER_API_KEY not configured.', 'OPENROUTER_CLIENT_MISSING', 500, {
      domainId,
      host: null,
    });
  }

  // The only difference between run modes is which prompts we load and
  // whether we persist a branch fingerprint / refresh lock.
  const promptWhere =
    selection === 'tracked'
      ? { domainId, isTracked: true }
      : { domainId, isSelected: true };

  const [domain, latestCrawl, selectedPrompts, selectedCompetitors] = await Promise.all([
    prisma.domain.findUnique({
      where: { id: domainId },
      select: {
        host: true,
        currentAnalysisFingerprint: true,
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
      select: {
        id: true,
        text: true,
        intent: true,
        source: true,
        keywordId: true,
        category: true,
        intentStage: true,
        persona: true,
        useCase: true,
        constraint: true,
        isBranded: true,
        competitorMentioned: true,
      },
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
  if (selectedPrompts.length === 0) {
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
  const totalQueries = selectedPrompts.length * ROSTER.length;
  const crawledPages = Array.isArray(latestCrawl?.pages)
    ? (latestCrawl!.pages as Array<{ url?: string; title?: string | null }>).map((p) => ({
        url: p.url ?? '',
        title: p.title ?? null,
      })).filter((p) => p.url)
    : [];

  const promptSnapshot = buildAnalysisSnapshot(selectedPrompts as AnalysisPromptSnapshotItem[]);
  const analysisFingerprint = buildAnalysisFingerprint(selectedPrompts as AnalysisPromptSnapshotItem[]);
  const isRefresh = kind === 'refresh';

  const run = await prisma.aiRun.create({
    data: {
      domainId,
      status: 'running',
      kind,
      analysisFingerprint,
      analysisSnapshot: promptSnapshot as any,
    },
  });

  if (selection === 'selected' || isRefresh) {
    await prisma.domain.update({
      where: { id: domainId },
      data: {
        currentAnalysisFingerprint: analysisFingerprint,
      },
    });
  }

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
    { count: number; presence: number; overall: number; sentiment: number; sentimentCount: number }
  > = {};
  for (const m of ROSTER) {
    perModel[m.id] = { count: 0, presence: 0, overall: 0, sentiment: 0, sentimentCount: 0 };
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
  for (const prompt of selectedPrompts) for (const model of ROSTER) queue.push({ prompt, model });

  let completedQueries = 0;
  let firstFailure: RunPipelineError | null = null;

  async function worker() {
    while (queue.length > 0) {
      if (firstFailure) return;
      const item = queue.shift();
      if (!item) return;
      let response = '';
      let latencyMs = 0;
      let costUsd: number | null = null;
      try {
        const out = await callModel(item.model, item.prompt.text, userLocation);
        response = out.response;
        latencyMs = out.latencyMs;
        costUsd = out.costUsd;
      } catch (err) {
        firstFailure = normalizeRunError(err, {
          domainId,
          host: domain!.host,
          model: item.model.id,
          promptId: item.prompt.id,
        });
        console.error(
          `[RUN] model call failed domainId=${domainId} host=${domain!.host} promptId=${item.prompt.id} model=${item.model.id} code=${firstFailure.code} status=${firstFailure.status} message=${firstFailure.message}`,
          firstFailure.details,
        );
        return;
      }

      if (firstFailure) return;
      // Heuristic scoring is fast and runs unconditionally — used as the
      // baseline + safety net if the LLM scorer fails or times out.
      const heuristic = scoreResponse({
        ownDomainHost: domain!.host,
        competitorHosts,
        modelResponse: response,
      });

      // Accurate LLM scorer — costs ~$0.0001/call, returns alias-aware presence,
      // real sentiment, real relevance, rank position, factual claims.
      let llm = response.trim()
        ? await llmScoreResponse({
            prompt: item.prompt.text,
            response,
            brand: { name: brandName, aliases: [], host: domain!.host },
            competitors: competitorRoster,
            brandFacts,
          }).catch(() => null)
        : null;

      // Final values written to AiQueryResult. LLM scorer wins; heuristic
      // is the fallback. Honest semantics throughout — null = "not measurable
      // because the brand wasn't in the response."
      const final = llm
        ? {
            presence: llm.presence,
            // Relevance always meaningful — measures answer quality, not visibility.
            relevance: Math.round(llm.relevance),
            // Sentiment / accuracy are NULL when presence=0 (enforced by scorer
            // and re-checked here). The dashboard shows "Not mentioned"
            // instead of fabricating Neutral/Negative/etc.
            sentiment: llm.sentiment === null ? null : Math.round(llm.sentiment),
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
          }
        : {
            // Heuristic fallback — same null semantics so the rest of the
            // pipeline doesn't have to special-case the source.
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
            factualClaims: [] as Array<{ claim: string; verdict: 'true' | 'false' | 'uncertain' }>,
          };

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

      await prisma.aiQueryResult.create({
        data: {
          runId: run.id,
          promptId: item.prompt.id,
          model: item.model.id,
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

      completedQueries++;
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
      const pm = perModel[item.model.id];
      pm.count += 1;
      pm.presence += final.presence;
      pm.overall += final.overall;
      if (final.sentiment !== null) {
        pm.sentiment += final.sentiment;
        pm.sentimentCount = (pm.sentimentCount ?? 0) + 1;
      }

      onProgress({
        type: 'result',
        completedQueries,
        totalQueries,
        currentResult: {
          promptId: item.prompt.id,
          model: item.model.id,
          presence: final.presence,
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
    if (firstFailure) {
      throw firstFailure;
    }

    const summary = {
      totalQueries,
      models: ROSTER.map((r) => r.id),
      presenceRate: Number((summaryAccum.presence / totalQueries).toFixed(3)),
      avgRelevance: Number((summaryAccum.relevance / totalQueries).toFixed(2)),
      // avgSentiment is null if no row had a measurable sentiment — better
      // than reporting 0 which the UI would interpret as "Neutral".
      avgSentiment:
        summaryAccum.sentimentCount > 0
          ? Number((summaryAccum.sentiment / summaryAccum.sentimentCount).toFixed(2))
          : null,
      sentimentSampleSize: summaryAccum.sentimentCount,
      avgOverall: Number((summaryAccum.overall / totalQueries).toFixed(2)),
      perModel: Object.fromEntries(
        Object.entries(perModel).map(([model, m]) => [
          model,
          {
            queries: m.count,
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
          shareOfVoice: Number((v.mentions / totalQueries).toFixed(3)),
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
    };
    await prisma.aiRun.update({
      where: { id: run.id },
      data: { status: 'completed', endedAt: new Date(), summary: summary as any },
    });
    // Stamp the prompts we just re-tested so the dashboard can show
    // "last tested" without re-deriving it from run history.
    if (selection === 'selected' && kind === 'refresh') {
      await prisma.prompt.updateMany({
        where: { id: { in: selectedPrompts.map((p) => p.id) } },
        data: { lastTrackedRunAt: new Date() },
      });
    }
    onProgress({ type: 'complete', runId: run.id, summary });
  } catch (err) {
    await prisma.aiRun.update({
      where: { id: run.id },
      data: { status: 'failed', endedAt: new Date() },
    });
    const normalized = normalizeRunError(err, { domainId, host: domain!.host });
    onProgress({ type: 'error', error: normalized.message });
    throw normalized;
  }
}

/**
 * runTrackedQueries — convenience wrapper that re-tests the domain's
 * weekly-tracked prompts (isTracked=true) and tags the resulting AiRun as
 * kind='weekly'. Used by the weekly scheduler and the manual "Test tracked
 * now" trigger. onProgress defaults to a no-op for the headless scheduler.
 */
export async function runTrackedQueries(
  prisma: PrismaClient,
  domainId: number,
  onProgress: (event: RunProgress) => void = () => {},
): Promise<void> {
  return runQueries({ prisma, domainId, onProgress, selection: 'selected', kind: 'refresh' });
}

/**
 * runOnePrompt — single-prompt variant of runQueries.
 *
 * Fans ONE prompt across the ROSTER, scores each response with the same
 * heuristic + LLM scorer pipeline, persists AiQueryResult rows under a
 * fresh AiRun, and returns the new run's id + the persisted results so
 * the caller can shape them into a PromptTableRow.
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
  if (!router) {
    throw new Error('OPENROUTER_API_KEY not configured.');
  }
  const { domainId, promptId } = args;

  // Same context shape as runQueries — keeps the scorer apples-to-apples
  // with the full-wizard run.
  const [domain, latestCrawl, promptRow, selectedCompetitors] = await Promise.all([
    prisma.domain.findUnique({
      where: { id: domainId },
      select: {
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

  // Run each model in parallel — bounded by ROSTER size (currently 3), so
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
      try {
        const out = await callModel(model, promptRow.text, userLocation);
        response = out.response;
        latencyMs = out.latencyMs;
        costUsd = out.costUsd;
      } catch {
        response = '';
      }

      const heuristic = scoreResponse({
        ownDomainHost: domain.host,
        competitorHosts,
        modelResponse: response,
      });

      const llm = response.trim()
        ? await llmScoreResponse({
            prompt: promptRow.text,
            response,
            brand: { name: brandName, aliases: [], host: domain.host },
            competitors: competitorRoster,
            brandFacts,
          }).catch(() => null)
        : null;

      const final = llm
        ? {
            presence: llm.presence,
            relevance: Math.round(llm.relevance),
            sentiment: llm.sentiment === null ? null : Math.round(llm.sentiment),
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
          }
        : {
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
            factualClaims: [] as Array<{ claim: string; verdict: 'true' | 'false' | 'uncertain' }>,
          };

      const competitorHostsForRow = Array.from(
        new Set(final.competitorMentions.map((m) => m.host).filter(Boolean))
      );

      const created = await prisma.aiQueryResult.create({
        data: {
          runId: run.id,
          promptId: promptRow.id,
          model: model.id,
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
      persistedResults.push({
        id: created.id,
        model: model.id,
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
      summaryOverall += final.overall;
      if (final.sentiment !== null) sentimentSamples.push(final.sentiment);
      totalLatency += latencyMs;
      void costUsd; // accounted for elsewhere
    });
    await Promise.all(tasks);

    const totalQueries = ROSTER.length;
    const avgSentiment =
      sentimentSamples.length > 0
        ? Number((sentimentSamples.reduce((s, n) => s + n, 0) / sentimentSamples.length).toFixed(2))
        : null;
    const summary = {
      totalQueries,
      models: ROSTER.map((r) => r.id),
      presenceRate: Number((summaryPresence / totalQueries).toFixed(3)),
      avgOverall: Number((summaryOverall / totalQueries).toFixed(2)),
      avgSentiment,
      sentimentSampleSize: sentimentSamples.length,
      totalLatencyMs: totalLatency,
      singlePromptAnalysis: true, // discriminator for ops queries
    };
    await prisma.aiRun.update({
      where: { id: run.id },
      data: { status: 'completed', endedAt: new Date(), summary: summary as any },
    });
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
