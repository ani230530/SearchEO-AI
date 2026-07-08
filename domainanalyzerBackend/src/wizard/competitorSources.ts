/**
 * Competitor candidate sources — stage A of the competitor pipeline.
 *
 * Each source is a function that produces CompetitorCandidate[] for a given
 * domain. They run in parallel; results are deduped by host. Sources that
 * need API keys silently return [] when unconfigured, so the pipeline keeps
 * working with whatever subset is available.
 *
 * Sources today:
 *   - llmContext: GPT proposes likely competitors from the crawled domain
 *                 context. Always available (uses OpenRouter), and the
 *                 verification step downstream filters hallucinations.
 *   - serpApi:    organic Google results — adds real SERP signal when
 *                 SERP_API_KEY is configured. No-op otherwise.
 *   - mentions:   hosts already cited by past AiQueryResult rows for this
 *                 domain (closes the AI-mention feedback loop).
 *   - enrichment: optional Clearbit/Apollo lookup (stubbed, key-gated).
 */

import axios from 'axios';
import crypto from 'crypto';
import type { PrismaClient } from '../../generated/prisma';
import type { CompetitorCandidate } from './types';
import { extractHost } from './urlNormalize';
import { redisService } from '../services/RedisService';
import { callOpenRouterChat, isOpenRouterConfigured } from '../services/openRouterClient';
import { logExternalUsage } from '../services/externalUsageClient';

// Accept either SERP_API_KEY (existing project convention) or SERPAPI_KEY.
const SERPAPI_KEY = process.env.SERP_API_KEY || process.env.SERPAPI_KEY;
const CLEARBIT_KEY = process.env.CLEARBIT_KEY;

const BLOCKED_HOSTS = new Set([
  'amazon.com', 'ebay.com', 'walmart.com', 'etsy.com', 'aliexpress.com',
  'facebook.com', 'twitter.com', 'x.com', 'linkedin.com', 'instagram.com', 'youtube.com',
  'reddit.com', 'medium.com', 'wikipedia.org', 'quora.com',
  'yelp.com', 'tripadvisor.com', 'trustpilot.com', 'g2.com', 'capterra.com',
]);

function isBlocked(host: string): boolean {
  return BLOCKED_HOSTS.has(host) || host.endsWith('.gov') || host.endsWith('.edu');
}

/**
 * SerpAPI organic results — optional polish layer on top of the LLM proposer.
 * If SerpAPI isn't configured this is a no-op; the pipeline continues with
 * just the LLM-proposed candidates.
 *
 * Caller composes the queries; we don't try to invent them here.
 *
 * Each (query, location) tuple is cached in Redis for 7 days. SerpAPI bills
 * per request (~$0.005 each), and "Retry" / re-run cycles ask the same
 * questions verbatim. The cache holds the raw `organic_results` array; the
 * candidate mapping logic runs locally on hit.
 */
const SERPAPI_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
const LLM_COMPETITOR_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
type SerpOrganicResult = { link?: string; title?: string; snippet?: string };

export async function fromSerpApi(
  ownDomainHost: string,
  queries: string[],
  location: string | null
): Promise<CompetitorCandidate[]> {
  if (!SERPAPI_KEY || queries.length === 0) return [];
  const out = new Map<string, CompetitorCandidate>();
  for (const q of queries.slice(0, 5)) {
    let organic: SerpOrganicResult[] | null = null;
    const cacheKey = `serp:${location ?? 'global'}:${q}`;

    // Fast path: Redis hit. We cache the raw organic array, not the
    // mapped candidates — that way an own-domain-host change doesn't
    // poison cross-domain reuse.
    try {
      const cached = await redisService.get(cacheKey);
      if (cached) {
        organic = JSON.parse(cached) as SerpOrganicResult[];
      }
    } catch {
      /* fall through to live fetch */
    }

    if (organic === null) {
      try {
        const res = await axios.get('https://serpapi.com/search', {
          params: {
            api_key: SERPAPI_KEY,
            engine: 'google',
            q,
            num: 10,
            location: location ?? undefined,
          },
          timeout: 15_000,
	        });
	        organic = res.data?.organic_results ?? [];
        await logExternalUsage({
          provider: 'serpapi',
          feature: 'competitor_intelligence',
          operation: 'competitor_serp_discovery',
          status: 'success',
          context: { domainHost: ownDomainHost },
          metadata: { query: q, location },
	        });
	        // Persist the response shape we actually consume (drops the heavy
        // ad/snippet/answer-box fields SerpAPI returns alongside).
        const slim: SerpOrganicResult[] = (organic ?? []).map((r) => ({
          link: r.link,
          title: r.title,
          snippet: r.snippet,
        }));
        redisService
          .set(cacheKey, JSON.stringify(slim), SERPAPI_CACHE_TTL_SECONDS)
          .catch((err) => console.warn('[SerpAPI cache] write failed', err));
      } catch {
        /* silent — try next query */
        continue;
      }
    }

    for (const r of organic ?? []) {
      const host = r.link ? extractHost(r.link) : null;
      if (!host || host === ownDomainHost || isBlocked(host)) continue;
      const existing = out.get(host);
      if (existing) {
        (existing.rawSignals.serpQueries as string[]).push(q);
      } else {
        out.set(host, {
          competitorHost: host,
          source: 'serp',
          rawSignals: { serpQueries: [q], firstSeenTitle: r.title ?? null, firstSeenSnippet: r.snippet ?? null },
        });
      }
    }
  }
  return Array.from(out.values());
}

/** AI mention loop — competitors already cited in past AiQueryResults. */
export async function fromAiMentions(
  prisma: PrismaClient,
  domainId: number,
  ownDomainHost: string
): Promise<CompetitorCandidate[]> {
  const results = await prisma.aiQueryResult.findMany({
    where: { prompt: { domainId } },
    select: { competitorHosts: true },
  });
  const counter = new Map<string, number>();
  for (const r of results) {
    const list = Array.isArray(r.competitorHosts) ? (r.competitorHosts as unknown[]) : [];
    for (const raw of list) {
      const host = typeof raw === 'string' ? extractHost(raw) : null;
      if (!host || host === ownDomainHost || isBlocked(host)) continue;
      counter.set(host, (counter.get(host) ?? 0) + 1);
    }
  }
  return Array.from(counter.entries()).map(([host, count]) => ({
    competitorHost: host,
    source: 'mention' as const,
    rawSignals: { aiMentionCount: count },
  }));
}

/** Clearbit/Apollo enrichment — stub for now. Returns [] without a key. */
export async function fromEnrichment(_industry: string | null): Promise<CompetitorCandidate[]> {
  if (!CLEARBIT_KEY) return [];
  // TODO: wire Clearbit/Apollo when key is provisioned. Returning [] keeps
  // the pipeline shape stable.
  return [];
}

/**
 * LLM-context proposer — asks GPT to name likely competitors based on the
 * crawled domain context (industry, products, location, summary). Output is
 * untrusted: every candidate goes through verification (mini re-crawl) so
 * hallucinated hosts are dropped before they ever reach the user.
 *
 * This is the primary discovery source when SerpAPI isn't configured.
 */
export async function fromLlmContext(args: {
  ownDomainHost: string;
  companyName: string | null;
  industry: string | null;
  products: string[];
  summary: string;
  location: string | null;
}): Promise<CompetitorCandidate[]> {
  if (!isOpenRouterConfigured()) {
    console.warn('[COMPETITOR] OpenRouter not initialized. OPENROUTER_API_KEY missing?');
    return [];
  }
  console.log(`[COMPETITOR] Discovering competitors for ${args.ownDomainHost}...`);
  const profileLines = [
    `Target company: ${args.companyName ?? args.ownDomainHost}`,
    `Domain: ${args.ownDomainHost}`,
    args.industry ? `Industry: ${args.industry}` : null,
    args.products.length ? `Products / services: ${args.products.slice(0, 6).join(', ')}` : null,
    args.location ? `Location / market: ${args.location}` : null,
    args.summary ? `Summary: ${args.summary.slice(0, 600)}` : null,
  ].filter(Boolean).join('\n');

  let payload: { competitors?: Array<{ host?: unknown; name?: unknown; reason?: unknown }> } = {};
  const cacheHash = crypto.createHash('sha256').update(profileLines).digest('hex').slice(0, 24);
  const cacheKey = `competitors:llm:${args.ownDomainHost}:${cacheHash}`;
  let cacheHit = false;

  try {
    const cached = await redisService.get(cacheKey);
    if (cached) {
      payload = JSON.parse(cached);
      cacheHit = Array.isArray(payload.competitors);
    }
  } catch {
    /* fall through to live LLM */
  }

  try {
    if (cacheHit) {
      console.log(`[COMPETITOR] LLM cache hit for ${args.ownDomainHost}`);
    } else {
      console.log(`[COMPETITOR] Calling OpenRouter for ${args.ownDomainHost}...`);
      const completion = await callOpenRouterChat({
        payload: {
          model: 'openai/gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content:
                'You identify direct competitors of a target company. ' +
                'Return real, verifiable companies that operate in the same market and serve a similar audience. ' +
                'Use lowercase host names without "www." (e.g. "stripe.com"). ' +
                'No marketplaces (amazon, ebay, walmart), no social platforms, no review aggregators. ' +
                'No fictional or generic names. ' +
                'Output strict JSON.',
            },
            {
              role: 'user',
              content: [
                'Propose 8–12 direct competitors for this company.',
                '',
                profileLines,
                '',
                'Return JSON: { "competitors": [ { "host": "example.com", "name": "Example Inc", "reason": "one sentence on why they compete" } ] }',
              ].join('\n'),
            },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.2,
          max_tokens: 1500,
        },
        context: {
          domainHost: args.ownDomainHost,
          feature: 'competitor_intelligence',
          operation: 'competitor_llm_discovery',
          modelRequested: 'openai/gpt-4o-mini',
        },
      });
      const text = completion.content ?? '';
      console.log(`[COMPETITOR] LLM response for ${args.ownDomainHost}: ${text.slice(0, 200)}...`);
      payload = JSON.parse(text);
      redisService
        .set(cacheKey, JSON.stringify({ competitors: payload.competitors ?? [] }), LLM_COMPETITOR_CACHE_TTL_SECONDS)
        .catch((err) => console.warn('[COMPETITOR] LLM cache write failed', err));
    }
  } catch (err) {
    console.error(`[COMPETITOR] ERROR discovering competitors for ${args.ownDomainHost}:`, err instanceof Error ? err.message : String(err));
    return [];
  }

  const out = new Map<string, CompetitorCandidate>();
  const arr = Array.isArray(payload.competitors) ? payload.competitors : [];
  console.log(`[COMPETITOR] Parsed ${arr.length} competitors from LLM for ${args.ownDomainHost}`);
  for (const raw of arr) {
    const hostRaw = typeof raw?.host === 'string' ? raw.host.trim() : '';
    const host = extractHost(hostRaw) ?? hostRaw.toLowerCase().replace(/^www\./, '').split('/')[0];
    if (!host || host === args.ownDomainHost || isBlocked(host)) {
      console.log(`[COMPETITOR] Filtered: host=${hostRaw}, reason=${!host ? 'invalid' : host === args.ownDomainHost ? 'self' : 'blocked'}`);
      continue;
    }
    const name = typeof raw?.name === 'string' ? raw.name.trim() : null;
    const reason = typeof raw?.reason === 'string' ? raw.reason.trim() : null;
    if (out.has(host)) continue;
    out.set(host, {
      competitorHost: host,
      source: 'llm-rank',
      rawSignals: { llmName: name, llmReason: reason },
    });
  }
  console.log(`[COMPETITOR] Final candidates for ${args.ownDomainHost}: ${out.size}`);
  return Array.from(out.values());
}

/**
 * Fan out across all configured sources in parallel, dedupe by host.
 *
 * Sources are key-gated — anything missing a key returns [] and the rest of
 * the pipeline keeps working. The LLM-context proposer is always-on (uses
 * OpenRouter) and is the primary source on a fresh domain with no SERP / AI
 * mention data yet.
 */
export async function discoverCandidates(args: {
  prisma: PrismaClient;
  domainId: number;
  ownDomainHost: string;
  companyName: string | null;
  industry: string | null;
  products: string[];
  summary: string;
  location: string | null;
  /** Empty on first run; populated once Step 4 has generated keywords. */
  seedKeywords: string[];
}): Promise<CompetitorCandidate[]> {
  const [llm, serp, mentions, enrich] = await Promise.all([
    fromLlmContext({
      ownDomainHost: args.ownDomainHost,
      companyName: args.companyName,
      industry: args.industry,
      products: args.products,
      summary: args.summary,
      location: args.location,
    }),
    fromSerpApi(args.ownDomainHost, args.seedKeywords, args.location),
    fromAiMentions(args.prisma, args.domainId, args.ownDomainHost),
    fromEnrichment(args.industry),
  ]);

  const merged = new Map<string, CompetitorCandidate>();
  for (const c of [...llm, ...serp, ...mentions, ...enrich]) {
    const existing = merged.get(c.competitorHost);
    if (existing) {
      const prevSources = (existing.rawSignals.sources as string[]) ?? [existing.source];
      existing.rawSignals = {
        ...existing.rawSignals,
        ...c.rawSignals,
        sources: Array.from(new Set([...prevSources, c.source])),
      };
    } else {
      merged.set(c.competitorHost, {
        ...c,
        rawSignals: { ...c.rawSignals, sources: [c.source] },
      });
    }
  }
  return Array.from(merged.values());
}
