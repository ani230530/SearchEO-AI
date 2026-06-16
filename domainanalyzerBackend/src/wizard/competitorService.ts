/**
 * competitorService — orchestrates the 4-stage competitor pipeline.
 *
 *   A. discoverCandidates  (competitorSources.ts)         → CompetitorCandidate[]
 *   B. verifyCandidates    (re-crawl + reject markets)    → VerifiedCompetitor[]
 *   C. scoreCandidates     (deterministic, no LLM)        → ScoredCompetitor[]
 *   D. rankWithLlm         (LLM ranks ONLY supplied list) → RankedCompetitor[]
 *
 * The LLM never invents names. It ranks, labels threat level, and writes a
 * one-line reasoning grounded in the verified signals. Same inputs → same
 * candidate set (with caching by seed-keyword hash).
 */

import type { PrismaClient } from '../../generated/prisma';
import {
  CompetitorCandidate,
  CompanySize,
  RankedCompetitor,
  ScoredCompetitor,
  ThreatLevel,
  VerifiedCompetitor,
} from './types';
import { crawlDomain, inferCompanySize } from './crawlService';
import { discoverCandidates } from './competitorSources';
import { embedText, callJson, Models } from './llmClient';
import { scoreCandidate, topN } from './scoring';

const MAX_VERIFY_CONCURRENCY = 6;
const MAX_VERIFIED = 15;

/** Quick page check + mini-crawl (3 pages, no LLM synthesis) per candidate. */
async function verifyOne(host: string, source: string): Promise<VerifiedCompetitor | null> {
  try {
    const result = await crawlDomain(`https://${host}`, { maxPages: 3, skipSynthesis: true });
    if (result.pagesScanned === 0) return null;
    const text = result.rawText;
    if (!text || text.length < 200) return null;
    return {
      competitorHost: host,
      source: source as VerifiedCompetitor['source'],
      rawSignals: {},
      verified: true,
      industry: result.contextJson?.industry ?? null,
      location: result.contextJson?.location ?? null,
      companySize: inferCompanySize(text),
      candidateText: text.slice(0, 4000),
    };
  } catch {
    return null;
  }
}

interface LlmVerifyContext {
  ownDomainHost: string;
  ownDomainSummary: string;
  industry: string | null;
  location: string | null;
}

interface LlmVerifyEntry {
  competitorHost: string;
  knownToModel: boolean;
  fitScore: number;          // 0..1
  industry: string | null;
  location: string | null;
  companySize: CompanySize | null;
  description: string;       // 1–2 sentences; becomes candidateText for embedding
}

const VALID_SIZES: CompanySize[] = ['solo', 'smb', 'mid', 'enterprise'];

/**
 * Ask the LLM to verify a batch of candidate hosts in ONE call instead of
 * doing 15 × 3-page mini-crawls. For well-known brands the model already
 * knows industry/location/size + can describe them; we only fall back to a
 * real mini-crawl for the ones it flags `knownToModel: false`.
 *
 * Expected effect: competitor verify drops from 30–60s to 3–8s on the happy
 * path. The LLM is constrained to "only mark knownToModel=true if you'd
 * recognize this brand without guessing" so hallucinations show up as
 * `knownToModel: false` and route to the crawler.
 */
async function llmVerifyBatch(
  candidates: CompetitorCandidate[],
  ctx: LlmVerifyContext
): Promise<Map<string, LlmVerifyEntry>> {
  if (!candidates.length) return new Map();

  const hostList = candidates.map((c, i) => `${i + 1}. ${c.competitorHost}`).join('\n');
  const allowedHosts = new Set(candidates.map((c) => c.competitorHost.toLowerCase()));

  try {
    const payload = await callJson<{ entries: LlmVerifyEntry[] }>({
      model: Models.competitors,
      system:
        'You verify whether candidate domains are real competitors of a target company. For each host, only set knownToModel=true if you genuinely recognize the brand and can describe it without guessing. If you would have to invent details, set knownToModel=false and leave fields null. Output strict JSON.',
      user: [
        `Target company host: ${ctx.ownDomainHost}`,
        `Target industry: ${ctx.industry ?? 'unknown'}`,
        `Target location: ${ctx.location ?? 'unknown'}`,
        `Target summary: ${ctx.ownDomainSummary.slice(0, 1500) || '(no summary)'}`,
        '',
        'Candidate hosts:',
        hostList,
        '',
        'For EACH host listed above, return one entry with this shape:',
        '{ "competitorHost": <one of the listed hosts>,',
        '  "knownToModel": boolean,',
        '  "fitScore": number 0..1 (how strongly this is a real competitor of the target),',
        '  "industry": string|null,',
        '  "location": string|null (city/country if known),',
        '  "companySize": "solo"|"smb"|"mid"|"enterprise"|null,',
        '  "description": string (1–2 sentences describing what this company does — empty string if unknown) }',
        '',
        'Return strict JSON: { "entries": [ ... ] }. Include every candidate host exactly once.',
      ].join('\n'),
      temperature: 0.1,
      maxTokens: 2200,
    });
    const map = new Map<string, LlmVerifyEntry>();
    for (const e of payload.entries ?? []) {
      if (!e || typeof e.competitorHost !== 'string') continue;
      const host = e.competitorHost.toLowerCase().trim();
      if (!allowedHosts.has(host)) continue; // drop hallucinated hosts
      map.set(host, {
        competitorHost: host,
        knownToModel: Boolean(e.knownToModel),
        fitScore: typeof e.fitScore === 'number' ? Math.max(0, Math.min(1, e.fitScore)) : 0,
        industry: typeof e.industry === 'string' && e.industry.trim() ? e.industry.trim() : null,
        location: typeof e.location === 'string' && e.location.trim() ? e.location.trim() : null,
        companySize: VALID_SIZES.includes(e.companySize as CompanySize) ? (e.companySize as CompanySize) : null,
        description: typeof e.description === 'string' ? e.description.trim() : '',
      });
    }
    return map;
  } catch {
    return new Map();
  }
}

async function verifyCandidates(
  candidates: CompetitorCandidate[],
  ctx: LlmVerifyContext
): Promise<VerifiedCompetitor[]> {
  const t0 = Date.now();
  // Pass 1: batch-ask the LLM. Cheap (one call), no crawls.
  const llmMap = await llmVerifyBatch(candidates, ctx);
  console.log(`[PERF] competitor.verify.llm ${Date.now() - t0}ms candidates=${candidates.length} known=${[...llmMap.values()].filter((e) => e.knownToModel && e.description.length > 40).length}`);

  const out: VerifiedCompetitor[] = [];
  const needsCrawl: CompetitorCandidate[] = [];

  for (const c of candidates) {
    const entry = llmMap.get(c.competitorHost.toLowerCase());
    // Accept LLM result only if it's confident AND produced a usable
    // description (which becomes the embedding source). Otherwise fall back
    // to a real mini-crawl.
    if (entry && entry.knownToModel && entry.description.length >= 40) {
      out.push({
        competitorHost: c.competitorHost,
        source: c.source,
        rawSignals: { ...c.rawSignals, verifiedVia: 'llm' },
        verified: true,
        industry: entry.industry,
        location: entry.location,
        companySize: entry.companySize,
        candidateText: entry.description,
      });
    } else {
      needsCrawl.push(c);
    }
  }

  // Pass 2: crawl the unknowns in parallel — usually 0–4 of 30.
  if (needsCrawl.length > 0) {
    const t1 = Date.now();
    const queue = [...needsCrawl];
    async function worker() {
      while (queue.length) {
        const c = queue.shift();
        if (!c) return;
        const v = await verifyOne(c.competitorHost, c.source);
        if (v) out.push({ ...v, rawSignals: { ...c.rawSignals, verifiedVia: 'crawl' } });
      }
    }
    await Promise.all(Array.from({ length: MAX_VERIFY_CONCURRENCY }, worker));
    console.log(`[PERF] competitor.verify.crawl ${Date.now() - t1}ms crawled=${needsCrawl.length}`);
  }

  return out;
}

interface RankInputs {
  ownDomainHost: string;
  ownDomainSummary: string;
  scored: ScoredCompetitor[];
}

interface LlmRankPayload {
  rankings: Array<{
    competitorHost: string;
    rank: number;
    threatLevel: ThreatLevel;
    reasoning: string;
  }>;
}

const VALID_THREATS: ThreatLevel[] = ['High', 'Medium', 'Low'];

async function rankWithLlm({ ownDomainHost, ownDomainSummary, scored }: RankInputs): Promise<RankedCompetitor[]> {
  if (!scored.length) return [];

  // Constrained list — LLM is forbidden from adding hosts.
  const candidateBlock = scored
    .map((c, i) => {
      return [
        `${i + 1}. ${c.competitorHost}`,
        `   industry: ${c.industry ?? 'unknown'}`,
        `   location: ${c.location ?? 'unknown'}`,
        `   size: ${c.companySize ?? 'unknown'}`,
        `   similarity: ${c.similarityScore.toFixed(2)}`,
        `   sources: ${(c.rawSignals.sources as string[] | undefined)?.join(',') ?? 'none'}`,
      ].join('\n');
    })
    .join('\n\n');

  const allowedHosts = new Set(scored.map((c) => c.competitorHost));

  let payload: LlmRankPayload;
  try {
    payload = await callJson<LlmRankPayload>({
      model: Models.competitors,
      system:
        'You rank verified competitor candidates. You may only output hosts from the supplied list. You must NEVER invent or add new hosts. Output strict JSON.',
      user: [
        `Target company: ${ownDomainHost}`,
        `Summary: ${ownDomainSummary || '(no summary available)'}`,
        '',
        'Candidates:',
        candidateBlock,
        '',
        'Return JSON: { "rankings": [{ "competitorHost": <one of the listed hosts>, "rank": 1..N, "threatLevel": "High"|"Medium"|"Low", "reasoning": "one sentence grounded in the supplied signals" }] }. Order matters: rank 1 = strongest competitor.',
      ].join('\n'),
      temperature: 0.1,
      maxTokens: 1500,
    });
  } catch {
    // Fallback: rank purely by similarityScore if LLM fails.
    return scored.map((c, i) => ({
      ...c,
      rank: i + 1,
      threatLevel: 'Medium' as ThreatLevel,
      reasoning: `Ranked by deterministic similarity score (${c.similarityScore.toFixed(2)}).`,
    }));
  }

  const seen = new Set<string>();
  const ranked: RankedCompetitor[] = [];
  for (const r of payload.rankings ?? []) {
    if (!r || typeof r.competitorHost !== 'string') continue;
    const host = r.competitorHost.toLowerCase().trim();
    if (!allowedHosts.has(host) || seen.has(host)) continue; // drop hallucinations + dupes
    const candidate = scored.find((c) => c.competitorHost === host);
    if (!candidate) continue;
    seen.add(host);
    ranked.push({
      ...candidate,
      rank: ranked.length + 1,
      threatLevel: VALID_THREATS.includes(r.threatLevel) ? r.threatLevel : 'Medium',
      reasoning: typeof r.reasoning === 'string' && r.reasoning.trim().length > 0 ? r.reasoning.trim() : 'Ranked by similarity to your domain.',
    });
  }
  // Append any candidates the LLM dropped, in original score order.
  for (const c of scored) {
    if (!seen.has(c.competitorHost)) {
      ranked.push({
        ...c,
        rank: ranked.length + 1,
        threatLevel: 'Medium',
        reasoning: 'Auto-included by similarity score; LLM did not return a label.',
      });
    }
  }
  return ranked;
}

export interface RunCompetitorPipelineArgs {
  prisma: PrismaClient;
  domainId: number;
  ownDomainHost: string;
  ownDomainSummary: string;
  ownEmbedding: number[] | null;
  ownSeedKeywords: string[];
  ownLocation: { country: string | null; state: string | null } | null;
  ownSize: CompanySize | null;
  industry: string | null;
  // Inferred context surfaced from the latest CrawlSnapshot — feeds the
  // LLM proposer so it can pick competitors without needing keywords yet.
  companyName?: string | null;
  products?: string[];
}

export interface CompetitorPipelineResult {
  candidates: CompetitorCandidate[];
  verified: VerifiedCompetitor[];
  ranked: RankedCompetitor[];
}

export async function runCompetitorPipeline(args: RunCompetitorPipelineArgs): Promise<CompetitorPipelineResult> {
  // Stage A — discover. LLM-context proposer is the always-on baseline; the
  // other sources layer on top when their keys are configured.
  const tDiscover = Date.now();
  const ownLocationStr =
    [args.ownLocation?.country, args.ownLocation?.state].filter(Boolean).join(', ') || null;
  const candidates = await discoverCandidates({
    prisma: args.prisma,
    domainId: args.domainId,
    ownDomainHost: args.ownDomainHost,
    companyName: args.companyName ?? null,
    industry: args.industry,
    products: args.products ?? [],
    summary: args.ownDomainSummary,
    location: ownLocationStr,
    seedKeywords: args.ownSeedKeywords,
  });
  console.log(`[PERF] competitor.discover ${Date.now() - tDiscover}ms candidates=${candidates.length}`);
  if (candidates.length === 0) {
    console.error('[COMPETITOR] WARNING: No candidates discovered. Check OPENROUTER_API_KEY and LLM response.');
  }

  // Stage B — verify. Batch LLM check first; mini-crawl only the unknowns.
  const tVerify = Date.now();
  const verified = await verifyCandidates(candidates, {
    ownDomainHost: args.ownDomainHost,
    ownDomainSummary: args.ownDomainSummary,
    industry: args.industry,
    location: ownLocationStr,
  });
  console.log(`[PERF] competitor.verify.total ${Date.now() - tVerify}ms verified=${verified.length}`);

  // Stage C — score deterministically (with embeddings if we have them).
  const tScore = Date.now();
  const scored: ScoredCompetitor[] = [];
  for (const v of verified) {
    const candidateEmbedding = args.ownEmbedding ? await embedText(v.candidateText) : null;
    scored.push(
      scoreCandidate({
        domainEmbedding: args.ownEmbedding,
        domainSeedKeywords: args.ownSeedKeywords,
        domainLocation: args.ownLocation,
        domainSize: args.ownSize,
        candidate: v,
        candidateEmbedding,
        candidateSeedKeywords: [], // we don't extract candidate seed keywords yet — future work
      })
    );
  }
  const top = topN(scored, MAX_VERIFIED);
  console.log(`[PERF] competitor.score ${Date.now() - tScore}ms top=${top.length}`);

  // Stage D — LLM ranks only.
  const tRank = Date.now();
  const ranked = await rankWithLlm({
    ownDomainHost: args.ownDomainHost,
    ownDomainSummary: args.ownDomainSummary,
    scored: top,
  });
  console.log(`[PERF] competitor.rank ${Date.now() - tRank}ms ranked=${ranked.length}`);

  return { candidates, verified, ranked };
}

/** Persist a competitor pipeline result. Replaces previous Competitor rows for this domain. */
/**
 * Persist a competitor pipeline result without losing prior data.
 *
 * Strategy:
 *  - Upsert each row by (domainId, competitorHost). For an existing row we
 *    keep `isSelected` (so user picks survive a regenerate) AND we keep the
 *    original source if it was 'mention' (auto-discovered from past AI
 *    responses — those are real data, not pipeline output).
 *  - Re-run drops the rank+similarity for rows the new pipeline didn't return,
 *    so they fall off the leaderboard, but the row itself stays — meaning
 *    user selections, mention-source competitors, and prior signals are never
 *    silently destroyed.
 */
export async function persistCompetitors(
  prisma: PrismaClient,
  domainId: number,
  result: CompetitorPipelineResult
) {
  const newHosts = new Set(result.ranked.map((r) => r.competitorHost));

  // Step 1 — clear stale rank metadata on rows the new pipeline didn't return.
  // We don't delete; we just demote them off the leaderboard.
  await prisma.competitor.updateMany({
    where: {
      domainId,
      competitorHost: { notIn: Array.from(newHosts) },
      // Only demote rows that came from a pipeline source — never touch
      // mention-discovered or user-added rows.
      source: { in: ['llm-rank', 'serp', 'overlap', 'enrichment'] },
    },
    data: { rank: null, similarityScore: null, threatLevel: null },
  });

  // Step 2 — upsert each new pipeline result. Existing rows keep isSelected
  // and (if previously mention-sourced) keep their source label.
  for (const r of result.ranked) {
    const existing = await prisma.competitor.findUnique({
      where: { domainId_competitorHost: { domainId, competitorHost: r.competitorHost } },
      select: { id: true, source: true, isSelected: true, rawSignals: true },
    });
    const sourceToWrite = existing?.source === 'mention' ? 'mention' : r.source;
    const mergedSignals = existing?.rawSignals
      ? { ...(existing.rawSignals as Record<string, unknown>), ...r.rawSignals }
      : r.rawSignals;

    await prisma.competitor.upsert({
      where: { domainId_competitorHost: { domainId, competitorHost: r.competitorHost } },
      update: {
        source: sourceToWrite,
        rawSignals: mergedSignals as any,
        verified: true,
        industry: r.industry ?? existing?.source === 'mention' ? r.industry : null,
        location: r.location,
        companySize: r.companySize,
        similarityScore: r.similarityScore,
        threatLevel: r.threatLevel,
        rank: r.rank,
        reasoning: r.reasoning,
        // isSelected intentionally NOT overwritten — preserve user selection.
      },
      create: {
        domainId,
        competitorHost: r.competitorHost,
        source: r.source,
        rawSignals: r.rawSignals as any,
        verified: true,
        industry: r.industry,
        location: r.location,
        companySize: r.companySize,
        similarityScore: r.similarityScore,
        threatLevel: r.threatLevel,
        rank: r.rank,
        reasoning: r.reasoning,
        isSelected: false,
      },
    });
  }
}

/**
 * Append a competitor that surfaced from an AI response (Step 5 scorer).
 *
 * Idempotent: if the host already exists for this domain, we only bump the
 * mention count in rawSignals — never touch rank/source/selection.
 *
 * Returns true if a new row was created (caller may want to log discovery).
 */
export async function recordCompetitorMention(
  prisma: PrismaClient,
  domainId: number,
  args: { host: string; name: string | null; sentiment: number }
): Promise<boolean> {
  const existing = await prisma.competitor.findUnique({
    where: { domainId_competitorHost: { domainId, competitorHost: args.host } },
    select: { id: true, rawSignals: true },
  });

  if (existing) {
    const signals = (existing.rawSignals as Record<string, unknown> | null) ?? {};
    const mentionCount = ((signals.aiMentionCount as number | undefined) ?? 0) + 1;
    const sentiments = Array.isArray(signals.aiMentionSentiments)
      ? [...(signals.aiMentionSentiments as number[]), args.sentiment]
      : [args.sentiment];
    await prisma.competitor.update({
      where: { id: existing.id },
      data: {
        rawSignals: { ...signals, aiMentionCount: mentionCount, aiMentionSentiments: sentiments } as any,
      },
    });
    return false;
  }

  await prisma.competitor.create({
    data: {
      domainId,
      competitorHost: args.host,
      source: 'mention',
      rawSignals: {
        llmName: args.name,
        aiMentionCount: 1,
        aiMentionSentiments: [args.sentiment],
        firstSeenAt: new Date().toISOString(),
      } as any,
      verified: false,    // not re-crawled yet
      isSelected: false,  // user can opt in via Step 3 next time
    },
  });
  return true;
}
