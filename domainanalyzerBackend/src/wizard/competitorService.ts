/**
 * competitorService — discovery-only competitor pipeline.
 *
 * The hot path now stops after candidate discovery so competitor fetching can
 * run in parallel with crawl work instead of waiting on validation, scoring,
 * and ranking.
 */

import type { PrismaClient } from '../../generated/prisma';
import { CompanySize, CompetitorCandidate, RankedCompetitor, ThreatLevel, VerifiedCompetitor } from './types';
import { discoverCandidates } from './competitorSources';

const MAX_COMPETITORS = 12;

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

function candidateReasoning(candidate: CompetitorCandidate): string {
  const signals = candidate.rawSignals ?? {};
  if (typeof signals.llmReason === 'string' && signals.llmReason.trim()) return signals.llmReason.trim();
  if (typeof signals.firstSeenSnippet === 'string' && signals.firstSeenSnippet.trim()) {
    return signals.firstSeenSnippet.trim().slice(0, 240);
  }
  if (typeof signals.aiMentionCount === 'number' && signals.aiMentionCount > 0) {
    return `Already appeared in ${signals.aiMentionCount} AI response${signals.aiMentionCount === 1 ? '' : 's'} for this domain.`;
  }
  const sources = Array.isArray(signals.sources) ? signals.sources.join(', ') : candidate.source;
  return `Discovered from ${sources} competitor signals.`;
}

function threatForRank(rank: number): ThreatLevel {
  if (rank <= 3) return 'High';
  if (rank <= 8) return 'Medium';
  return 'Low';
}

export async function runCompetitorPipeline(args: RunCompetitorPipelineArgs): Promise<CompetitorPipelineResult> {
  // Stage A — discover only. No verification, scoring, or ranking here.
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

  const ranked: RankedCompetitor[] = candidates.slice(0, MAX_COMPETITORS).map((candidate, index) => ({
    ...candidate,
    verified: true,
    industry: args.industry,
    location: ownLocationStr,
    companySize: args.ownSize,
    candidateText: candidateReasoning(candidate),
    similarityScore: Number(Math.max(0.5, 1 - index * 0.04).toFixed(2)),
    rank: index + 1,
    threatLevel: threatForRank(index + 1),
    reasoning: candidateReasoning(candidate),
  }));

  return { candidates, verified: [], ranked };
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
