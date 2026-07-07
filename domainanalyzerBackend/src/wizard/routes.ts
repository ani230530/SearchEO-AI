/**
 * Wizard routes — the single, unified API surface for the add-domain flow.
 *
 *   POST   /validate                              preflight (no DB writes)
 *   POST   /domain                                create + crawl (SSE)
 *   GET    /domain/:id                            full read
 *   GET    /domain/:id/state                      resume support
 *   DELETE /domain/:id                            cascade delete
 *   POST   /domain/:id/competitors                run discovery pipeline
 *   POST   /domain/:id/competitors/select         persist user's competitor picks
 *   POST   /domain/:id/topics                     generate keywords + prompts
 *   POST   /domain/:id/keywords                    keyword-only (audit setup)
 *   PATCH  /domain/:id/draft                      auto-save selection draft
 *   POST   /domain/:id/select                     mark final selections (Generate Report)
 *   POST   /domain/:id/run                        run AI queries (SSE) — wired in slice 2
 *
 * Mounted at /api/wizard.
 */

import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import { Prisma } from '../../generated/prisma';
import { prisma } from '../lib/prisma';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import {
  authenticateOrSession,
  getOwnerUserId,
} from '../middleware/authenticateOrSession';
import { extractHost, normalizeUrl } from './urlNormalize';
import { crawlDomain, inferCompanySize, inferDomainFromHomepage, synthesizeContext } from './crawlService';
import { embedText } from './llmClient';
import { runCompetitorPipeline, persistCompetitors } from './competitorService';
import { generateAuditPrompts, persistAuditPrompts, type PromptCategory } from './topicsService';
import { generateKeywordsForDomain, persistKeywords } from './keywordsService';
import { enrichDomainContext } from './enrichmentService';
import { setPhase, readState } from './wizardState';
import { queueDeepScoringForRun, runOnePrompt, runQueries } from './runService';
import { computePhraseVisibility, computeOpportunities, computeCompetitorAnalysis } from './analyticsService';
import { enrichOpportunities, withDefaultBrief, type EnrichedOpportunity } from './opportunityEnrichment';
import { enrichCompetitorInsights, type CompetitorInsight } from './competitorInsightEnrichment';
import { scoreResponse as llmScoreResponse } from './scoreService';
import { redisService } from '../services/RedisService';
import {
  getTrackedPromptSchedule,
  serializeTrackedPromptSchedule,
  TRACKED_PROMPT_SCHEDULE_OPTIONS,
} from '../services/trackedPromptSchedule';
import { timed } from '../lib/timed';
import {
  REPORT_LITE_CACHE_TTL_SECONDS,
  invalidateReportCacheForDomain,
  reportCacheKey,
} from './reportCache';

const router = Router();

// ── helpers ────────────────────────────────────────────────────────────────

function authReq(req: Request) {
  return req as AuthenticatedRequest;
}

type DomainWithRelations = Awaited<ReturnType<typeof prisma.domain.findUnique>> & {
  profile: any;
  inferred: any;
};
type EnsureResult =
  | { ok: true; domain: NonNullable<DomainWithRelations> }
  | { ok: false; error: string; status: 400 | 404 };

const competitorWarmups = new Map<number, Promise<void>>();

type PromptRunMetadata = {
  hasRun: boolean;
  lastRunAt: Date | null;
};

async function ensureDomain(req: Request, idParam: string | undefined): Promise<EnsureResult> {
  const id = idParam ? Number(idParam) : NaN;
  if (!id || Number.isNaN(id)) return { ok: false, error: 'Invalid domainId', status: 400 };
  const domain = await prisma.domain.findUnique({
    where: { id },
    include: { profile: true, inferred: true },
  });
  // Owner can be either the JWT user OR the anon session's shadow user.
  // getOwnerUserId resolves both. Anon callers only see their own shadow-
  // owned Domain, since the shadow user id is private to their cookie.
  const ownerId = getOwnerUserId(req);
  if (!ownerId || !domain || domain.userId !== ownerId) {
    return { ok: false, error: 'Domain not found', status: 404 };
  }
  return { ok: true, domain: domain as NonNullable<DomainWithRelations> };
}

async function getPromptRunMetadata(prismaClient: typeof prisma, promptIds: number[]) {
  const ids = Array.from(new Set(promptIds.filter((id) => Number.isFinite(id))));
  const meta = new Map<number, PromptRunMetadata>();
  for (const id of ids) {
    meta.set(id, { hasRun: false, lastRunAt: null });
  }
  if (ids.length === 0) return meta;

  const rows = await prismaClient.aiQueryResult.findMany({
    where: { promptId: { in: ids } },
    select: { promptId: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  for (const row of rows) {
    const existing = meta.get(row.promptId);
    if (!existing || existing.hasRun) continue;
    meta.set(row.promptId, { hasRun: true, lastRunAt: row.createdAt });
  }
  return meta;
}

function formatCompetitorRows(rows: Array<{
  competitorHost: string;
  similarityScore: number | null;
  threatLevel: string | null;
  rank: number | null;
  reasoning: string | null;
  industry: string | null;
  location: string | null;
  companySize: string | null;
  source: string;
}>) {
  return rows.map((c) => ({
    name: c.competitorHost,
    domain: c.competitorHost,
    url: `https://${c.competitorHost}`,
    logoUrl: `https://img.logo.dev/${c.competitorHost}?token=pk_DTdFFG1JT9WOCjATvZEzIA&size=64`,
    competitorHost: c.competitorHost,
    similarityScore: c.similarityScore,
    threatLevel: c.threatLevel,
    rank: c.rank,
    reasoning: c.reasoning,
    industry: c.industry,
    location: c.location,
    companySize: c.companySize,
    source: c.source,
  }));
}

function queueCompetitorWarmup(args: { domain: NonNullable<DomainWithRelations>; seedKeywords: string[] }) {
  const existing = competitorWarmups.get(args.domain.id);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const result = await runCompetitorPipeline({
        prisma,
        domainId: args.domain.id,
        ownDomainHost: args.domain.host,
        ownDomainSummary: '',
        ownEmbedding: null,
        ownSeedKeywords: args.seedKeywords,
        ownLocation: { country: args.domain.profile?.country ?? null, state: args.domain.profile?.state ?? null },
        ownSize: null,
        industry: args.domain.profile?.industry ?? null,
        companyName: null,
        products: [],
      });
      await persistCompetitors(prisma, args.domain.id, result);
    } finally {
      competitorWarmups.delete(args.domain.id);
    }
  })();

  competitorWarmups.set(args.domain.id, promise);
  return promise;
}

function parseIdList(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const out: number[] = [];
  const seen = new Set<number>();
  const push = (raw: unknown) => {
    const num = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() ? Number(raw) : NaN;
    if (!Number.isFinite(num) || seen.has(num)) return;
    seen.add(num);
    out.push(num);
  };
  for (const entry of value) {
    if (typeof entry === 'number' || typeof entry === 'string') {
      push(entry);
      continue;
    }
    if (entry && typeof entry === 'object') {
      const record = entry as Record<string, unknown>;
      if ('id' in record) push(record.id);
      if ('promptId' in record) push(record.promptId);
      if ('keywordId' in record) push(record.keywordId);
      if ('promptIds' in record) for (const nested of parseIdList(record.promptIds)) push(nested);
      if ('selectedPromptIds' in record) for (const nested of parseIdList(record.selectedPromptIds)) push(nested);
      if ('selectedPrompts' in record) for (const nested of parseIdList(record.selectedPrompts)) push(nested);
      if ('prompts' in record) for (const nested of parseIdList(record.prompts)) push(nested);
      if ('items' in record) for (const nested of parseIdList(record.items)) push(nested);
      if ('selected' in record) for (const nested of parseIdList(record.selected)) push(nested);
      if ('selection' in record) for (const nested of parseIdList(record.selection)) push(nested);
    }
  }
  return out;
}

const CUSTOM_KEYWORD_STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'best',
  'for',
  'from',
  'how',
  'in',
  'is',
  'me',
  'of',
  'on',
  'or',
  'recommend',
  'should',
  'the',
  'to',
  'tool',
  'tools',
  'what',
  'which',
  'with',
]);

function normalizePromptSeed(value: string): string {
  return value
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function keywordTokens(value: string): Set<string> {
  return new Set(
    normalizePromptSeed(value)
      .split(/\s+/)
      .filter((word) => word.length > 2 && !CUSTOM_KEYWORD_STOP_WORDS.has(word))
  );
}

function deriveCustomKeywordTerm(prompt: string): string {
  const words = Array.from(keywordTokens(prompt)).slice(0, 4);
  return (words.length > 0 ? words.join(' ') : normalizePromptSeed(prompt).split(/\s+/).slice(0, 4).join(' ')).slice(0, 80) || 'custom prompt';
}

async function persistCustomPromptSeeds(prismaClient: typeof prisma, domainId: number, rawPrompts: string[]) {
  const prompts = Array.from(
    new Set(
      rawPrompts
        .map((prompt) => prompt.trim())
        .filter(Boolean)
        .map((prompt) => prompt.slice(0, 800))
    )
  );
  if (prompts.length === 0) return [];

  const [keywordRows, existingPromptRows] = await Promise.all([
    prismaClient.keyword.findMany({
      where: { domainId },
      select: { id: true, term: true, intent: true },
    }),
    prismaClient.prompt.findMany({
      where: { domainId },
      select: { id: true, text: true, source: true },
    }),
  ]);

  const keywords = [...keywordRows];
  const existingByText = new Map<string, { id: number; text: string; source: string }>();
  for (const row of existingPromptRows) {
    const key = normalizePromptSeed(row.text);
    if (key) existingByText.set(key, row);
  }
  const createdIds: number[] = [];

  for (const text of prompts) {
    const promptKey = normalizePromptSeed(text);
    if (!promptKey) continue;

    const existing = existingByText.get(promptKey);
    if (existing) {
      if (existing.source === 'custom') {
        await prismaClient.prompt.update({
          where: { id: existing.id },
          data: { isSelected: true },
        });
      }
      continue;
    }

    const promptTokens = keywordTokens(text);
    const bestMatch = keywords
      .map((keyword) => {
        const tokens = keywordTokens(keyword.term);
        let score = 0;
        for (const token of promptTokens) if (tokens.has(token)) score += 1;
        return { keyword, score };
      })
      .sort((a, b) => b.score - a.score)[0];
    let assignedKeyword = bestMatch && bestMatch.score > 0 ? bestMatch.keyword : undefined;

    if (!assignedKeyword) {
      const term = deriveCustomKeywordTerm(text);
      assignedKeyword = await prismaClient.keyword.upsert({
        where: { domainId_term: { domainId, term } },
        update: {},
        create: {
          domainId,
          term,
          intent: 'Commercial',
          source: 'custom',
          isSelected: false,
        },
      });
      keywords.push(assignedKeyword);
    }

    const created = await prismaClient.prompt.create({
      data: {
        domainId,
        keywordId: assignedKeyword.id,
        text,
        intent: assignedKeyword.intent ?? 'Commercial',
        source: 'custom',
        isSelected: true,
      },
      select: { id: true, text: true, source: true },
    });
    existingByText.set(promptKey, created);
    createdIds.push(created.id);
  }

  return createdIds;
}

// Resolve the AiRun.kind filter for audit-facing endpoints from a `?kind=`
// query param. Defaults to 'audit' so tracked-prompt runs never leak
// into the audit dashboard's report/trends/runs/history (this is a no-op for
// all pre-existing data, which is kind='audit'). Pass ?kind=weekly to scope to
// tracked recurring runs, or ?kind=all to include both.
function runKindFilter(req: Request): { kind?: string } {
  const raw = typeof req.query.kind === 'string' ? req.query.kind.toLowerCase() : 'audit';
  if (raw === 'all') return {};
  if (raw === 'weekly') return { kind: 'weekly' };
  return { kind: 'audit' };
}

// ── Per-prompt row builders (shared by /report and /tracked-prompts) ──────
// AiQueryResult fields needed to render a PromptTable row's per-model results.
type AiResultRow = {
  id: number;
  promptId: number;
  model: string;
  status?: string | null;
  errorMessage?: string | null;
  response: string;
  presence: number;
  relevance: number;
  sentiment: number | null;
  accuracy: number | null;
  rankPosition: number | null;
  overall: number;
  scorerSummary: string | null;
  factualClaims: unknown;
  competitorHosts: unknown;
  citations: unknown;
  competitorMentions: unknown;
  latencyMs: number | null;
};

// Convert raw -10..10 sentiment into the 0..10 scale the page expects:
//   raw -10 → 0 (Negative), raw 0 → 5 (Neutral), raw +10 → 10 (Positive).
// Page thresholds: ≥7 Positive, ≥4 Neutral, else Negative. NULL passes through
// as "brand not mentioned, no sentiment to measure".
const toDisplaySentiment = (raw: number | null): number | null =>
  raw === null ? null : Math.max(0, Math.min(10, (raw + 10) / 2));

type ResponseCitation = { title: string | null; url: string; host: string };

// One entry per model for a prompt — the dashboard renders the per-model
// breakdown without an extra round trip.
function buildModelResults(rs: AiResultRow[], options: { verbose?: boolean } = {}) {
  const verbose = options.verbose ?? true;
  return rs.map((r) => {
    const cits = Array.isArray(r.citations) ? (r.citations as ResponseCitation[]) : [];
    const compMentions = Array.isArray(r.competitorMentions)
      ? (r.competitorMentions as Array<{ host: string; count: number; sentiment: number | null; rankPosition?: number | null }>)
      : [];
    const sentimentDisplay = toDisplaySentiment(r.sentiment);
    return {
      id: `res-${r.id}`,
      model: r.model,
      status: r.status ?? 'success',
      errorMessage: r.errorMessage ?? null,
      presence: r.presence,
      overall: r.overall,
      accuracy: r.accuracy,
      relevance: r.relevance,
      sentiment: sentimentDisplay === null ? null : Number(sentimentDisplay.toFixed(2)),
      sentimentRaw: r.sentiment,
      rankPosition: r.rankPosition,
      scorerSummary: verbose ? r.scorerSummary : null,
      factualClaims: verbose ? (r.factualClaims ?? []) : [],
      response: verbose ? r.response : '',
      citations: cits.map((c) => ({ title: c.title ?? c.host, url: c.url, snippet: c.host })),
      sources: Array.from(new Set(cits.map((c) => c.host))).filter(Boolean),
      competitorMentions: compMentions,
      competitorHosts: Array.isArray(r.competitorHosts) ? (r.competitorHosts as string[]) : [],
      latencyMs: verbose ? r.latencyMs : null,
    };
  });
}

function rollupCompetitors(rs: ReturnType<typeof buildModelResults>) {
  const set = new Set<string>();
  for (const r of rs) {
    for (const h of r.competitorHosts) set.add(h);
    for (const m of r.competitorMentions) set.add(m.host);
  }
  return Array.from(set);
}

function normalizeMetricHost(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '');
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

type BuiltModelResult = ReturnType<typeof buildModelResults>[number];

function isFailedAiResult(row: AiResultRow): boolean {
  if (row.status === 'failed') return true;
  const hasResponse = typeof row.response === 'string' && row.response.trim().length > 0;
  const hasEvidence =
    asArray(row.citations).length > 0 ||
    asArray(row.competitorHosts).length > 0 ||
    asArray(row.competitorMentions).length > 0 ||
    (typeof row.scorerSummary === 'string' && row.scorerSummary.trim().length > 0);
  // Legacy rows created before AiQueryResult.status used empty responses with
  // zeroed scores for provider failures. Treat only fully-empty rows as failed;
  // a real non-mention still has response text and relevance.
  return !hasResponse && !hasEvidence && row.presence === 0 && row.overall === 0 && row.relevance <= 1;
}

function countCompetitorEventsFromValues(competitorMentions: unknown, competitorHosts: unknown, ownHost: string) {
  let events = 0;
  let ownExcluded = 0;
  const seenResponseHosts = new Set<string>();
  const mentions = asArray(competitorMentions) as Array<{ host?: unknown; name?: unknown; count?: unknown }>;

  if (mentions.length > 0) {
    for (const mention of mentions) {
      const host = normalizeMetricHost(mention.host);
      const count = typeof mention.count === 'number' && Number.isFinite(mention.count) && mention.count > 0
        ? mention.count
        : 1;
      if (host && host === ownHost) {
        ownExcluded += count;
        continue;
      }
      if (host) {
        events += count;
        seenResponseHosts.add(host);
      }
    }
  } else {
    for (const rawHost of asArray(competitorHosts)) {
      const host = normalizeMetricHost(rawHost);
      if (!host) continue;
      if (host === ownHost) {
        ownExcluded += 1;
        continue;
      }
      events += 1;
      seenResponseHosts.add(host);
    }
  }

  return { events, ownExcluded, responseHasCompetitor: seenResponseHosts.size > 0 };
}

function countCompetitorEvents(row: AiResultRow, ownHost: string) {
  return countCompetitorEventsFromValues(row.competitorMentions, row.competitorHosts, ownHost);
}

function isSuccessfulBuiltResult(row: BuiltModelResult): boolean {
  return row.status !== 'failed';
}

function rankPositionsForResults(rows: BuiltModelResult[]) {
  return rows
    .map((r) => Number(r.rankPosition))
    .filter((rank): rank is number => Number.isFinite(rank) && rank > 0);
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
}

function buildPromptRowMetrics(built: BuiltModelResult[], ownDomainHost: string) {
  const ownHost = normalizeMetricHost(ownDomainHost);
  const successful = built.filter(isSuccessfulBuiltResult);
  const successfulResponses = successful.length;
  const mentions = successful.reduce((sum, row) => sum + (row.presence === 1 ? 1 : 0), 0);
  const visibilityPct = successfulResponses > 0
    ? Math.round((mentions / successfulResponses) * 100)
    : 0;

  const sentimentMeasurements = successful
    .map((row) => row.sentiment)
    .filter((sentiment): sentiment is number => typeof sentiment === 'number');
  const avgSentiment = average(sentimentMeasurements);

  const rankedPositions = rankPositionsForResults(successful);
  const bestRankPosition = rankedPositions.length > 0 ? Math.min(...rankedPositions) : null;
  const avgRankPosition = average(rankedPositions);

  const competitorMentionEvents = successful.reduce((sum, row) => (
    sum + countCompetitorEventsFromValues(row.competitorMentions, row.competitorHosts, ownHost).events
  ), 0);
  const brandMentionEvents = mentions;
  const totalMentionEvents = brandMentionEvents + competitorMentionEvents;
  const aiSovPct = totalMentionEvents > 0
    ? Math.round((brandMentionEvents / totalMentionEvents) * 100)
    : null;

  const avgOverall = successfulResponses > 0
    ? Number((successful.reduce((sum, row) => sum + (row.overall ?? 0), 0) / successfulResponses).toFixed(2))
    : 0;

  return {
    totalResponses: built.length,
    successfulResponses,
    mentions,
    visibilityPct,
    avgSentiment,
    bestRankPosition,
    avgRankPosition,
    rankedResponses: rankedPositions.length,
    brandMentionEvents,
    competitorMentionEvents,
    totalMentionEvents,
    aiSovPct,
    aiSov: aiSovPct === null ? '—' : `${aiSovPct}%`,
    avgOverall,
  };
}

type PromptForResultRow = {
  id: number;
  keywordId: number | null;
  text: string;
  intent: string | null;
  source: string;
};

function buildPromptTableRowForSingleRun(
  prompt: PromptForResultRow,
  persistedResults: Awaited<ReturnType<typeof runOnePrompt>>['persistedResults'],
  ownDomainHost: string,
) {
  const rows: AiResultRow[] = persistedResults.map((result) => ({
    ...result,
    promptId: prompt.id,
  }));
  const built = buildModelResults(rows);
  const promptMetrics = buildPromptRowMetrics(built, ownDomainHost);
  const competitors = rollupCompetitors(built);

  return {
    id: `pr-${prompt.id}`,
    rawId: prompt.id,
    type: 'prompt' as const,
    phrase: prompt.text,
    text: prompt.text,
    intent: prompt.intent,
    source: prompt.source,
    keywordId: prompt.keywordId,
    sov: `${promptMetrics.visibilityPct}%`,
    aiSov: promptMetrics.aiSov,
    aiSovPercent: promptMetrics.aiSovPct,
    mentions: promptMetrics.mentions,
    successfulResponses: promptMetrics.successfulResponses,
    bestRank: promptMetrics.bestRankPosition ?? 0,
    rankingPosition: promptMetrics.bestRankPosition,
    avgRankPosition: promptMetrics.avgRankPosition,
    rankedResponses: promptMetrics.rankedResponses,
    brandMentionEvents: promptMetrics.brandMentionEvents,
    competitorMentionEvents: promptMetrics.competitorMentionEvents,
    totalMentionEvents: promptMetrics.totalMentionEvents,
    avgSentiment: promptMetrics.avgSentiment,
    competitors,
    competitorCount: competitors.length,
    results: built,
    metrics: {
      visibility: promptMetrics.visibilityPct,
      aiSov: promptMetrics.aiSovPct,
      avgOverall: promptMetrics.avgOverall,
      runs: promptMetrics.successfulResponses,
      attemptedRuns: promptMetrics.totalResponses,
    },
  };
}

function buildCanonicalReportMetrics(args: {
  rows: AiResultRow[];
  ownDomainHost: string;
  promptInventory: { generated: number; selected: number; run: number; tracked: number };
}) {
  const ownHost = normalizeMetricHost(args.ownDomainHost);
  const attemptedResponses = args.rows.length;
  const successfulRows = args.rows.filter((row) => !isFailedAiResult(row));
  const successfulResponses = successfulRows.length;
  const failedResponses = attemptedResponses - successfulResponses;

  const brandMentionResponses = successfulRows.reduce((sum, row) => sum + (row.presence === 1 ? 1 : 0), 0);
  const visibilityRate = successfulResponses > 0 ? Math.round((brandMentionResponses / successfulResponses) * 100) : 0;

  let competitorMentionEvents = 0;
  let competitorMentionResponses = 0;
  let ownHostExcludedMentions = 0;
  let totalCitations = 0;
  let citedResponses = 0;
  const sentimentSamples: number[] = [];
  const accuracySamples: number[] = [];

  const modelBuckets = new Map<string, {
    attempted: number;
    successful: number;
    failed: number;
    brandMentions: number;
    citations: number;
  }>();

  for (const row of args.rows) {
    const bucket = modelBuckets.get(row.model) ?? { attempted: 0, successful: 0, failed: 0, brandMentions: 0, citations: 0 };
    bucket.attempted += 1;
    if (isFailedAiResult(row)) {
      bucket.failed += 1;
      modelBuckets.set(row.model, bucket);
      continue;
    }

    bucket.successful += 1;
    bucket.brandMentions += row.presence === 1 ? 1 : 0;
    const citations = asArray(row.citations);
    bucket.citations += citations.length;
    modelBuckets.set(row.model, bucket);

    totalCitations += citations.length;
    if (citations.length > 0) citedResponses += 1;

    const competitorCounts = countCompetitorEvents(row, ownHost);
    competitorMentionEvents += competitorCounts.events;
    ownHostExcludedMentions += competitorCounts.ownExcluded;
    if (competitorCounts.responseHasCompetitor) competitorMentionResponses += 1;

    if (row.presence === 1 && typeof row.sentiment === 'number') sentimentSamples.push(row.sentiment);
    if (row.presence === 1 && typeof row.accuracy === 'number') accuracySamples.push(row.accuracy);
  }

  const totalMentionEvents = brandMentionResponses + competitorMentionEvents;
  const aiShareOfVoice = totalMentionEvents > 0
    ? Math.round((brandMentionResponses / totalMentionEvents) * 100)
    : 0;
  const competitorResponseRate = successfulResponses > 0
    ? Math.round((competitorMentionResponses / successfulResponses) * 100)
    : 0;

  const avgSentimentRaw = sentimentSamples.length > 0
    ? Number((sentimentSamples.reduce((sum, value) => sum + value, 0) / sentimentSamples.length).toFixed(2))
    : null;
  const avgSentimentDisplay = avgSentimentRaw === null
    ? null
    : Number(Math.max(0, Math.min(10, (avgSentimentRaw + 10) / 2)).toFixed(2));
  const sentimentLabel = avgSentimentDisplay === null
    ? 'Not scored'
    : avgSentimentDisplay >= 7
      ? 'Positive'
      : avgSentimentDisplay >= 4
        ? 'Neutral'
        : 'Negative';

  const avgAccuracy = accuracySamples.length > 0
    ? Number((accuracySamples.reduce((sum, value) => sum + value, 0) / accuracySamples.length).toFixed(2))
    : null;
  const accuracyPercent = avgAccuracy === null ? null : Math.round(avgAccuracy * 10);
  const accuracyReliable = accuracySamples.length >= Math.min(3, Math.max(1, brandMentionResponses));

  const preferredModelOrder = ['google-gre', 'gpt-4o-mini', 'claude-sonnet-4-5', 'gemini-2.0-flash'];
  const modelPerformance = Array.from(modelBuckets.entries())
    .sort(([a], [b]) => {
      const ai = preferredModelOrder.indexOf(a);
      const bi = preferredModelOrder.indexOf(b);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi) || a.localeCompare(b);
    })
    .map(([model, bucket]) => ({
      model,
      attemptedResponses: bucket.attempted,
      successfulResponses: bucket.successful,
      failedResponses: bucket.failed,
      brandMentions: bucket.brandMentions,
      visibilityRate: bucket.successful > 0 ? Math.round((bucket.brandMentions / bucket.successful) * 100) : null,
      citationCount: bucket.citations,
    }));

  return {
    responseHealth: {
      attemptedResponses,
      successfulResponses,
      failedResponses,
      excludedFromScoring: failedResponses,
    },
    modelPerformance,
    promptInventory: args.promptInventory,
    citations: {
      total: totalCitations,
      citedResponses,
      successfulResponses,
    },
    mentions: {
      brandMentionResponses,
      brandResponseRate: visibilityRate,
      competitorMentionEvents,
      competitorMentionResponses,
      competitorResponseRate,
      ownHostExcludedMentions,
    },
    sentiment: {
      label: sentimentLabel,
      avgRaw: avgSentimentRaw,
      avgDisplay: avgSentimentDisplay,
      sampleSize: sentimentSamples.length,
      brandMentionResponses,
      status: sentimentSamples.length > 0 ? 'measured' : brandMentionResponses > 0 ? 'missing_scores' : 'no_brand_mentions',
    },
    accuracy: {
      percent: accuracyPercent,
      avg: avgAccuracy,
      sampleSize: accuracySamples.length,
      brandMentionResponses,
      status: avgAccuracy === null ? 'missing_scores' : accuracyReliable ? 'measured' : 'low_sample',
    },
    aiShareOfVoice: {
      percent: aiShareOfVoice,
      brandMentionEvents: brandMentionResponses,
      competitorMentionEvents,
      totalMentionEvents,
    },
    visibility: {
      percent: visibilityRate,
      brandMentionResponses,
      successfulResponses,
      failedResponses,
    },
  };
}

// Legacy helper kept for route tests and older imports. Dynamic schedule reads
// should use getTrackedPromptScheduleMeta below.
export function nextDailyRunAt(now = new Date()): Date {
  const next = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 3, 0, 0, 0,
  ));
  if (now.getTime() >= next.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

async function getTrackedPromptScheduleMeta(now = new Date()) {
  const schedule = await getTrackedPromptSchedule(prisma as any, now);
  const serialized = serializeTrackedPromptSchedule(schedule);
  return {
    cadence: serialized.cadence,
    nextTestAt: serialized.nextTestAt,
    schedule: serialized,
    scheduleOptions: TRACKED_PROMPT_SCHEDULE_OPTIONS,
  };
}

function dailyBucketStartUtc(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
}

function dailyBucketKey(date: Date): string {
  return dailyBucketStartUtc(date).toISOString().slice(0, 10);
}

function weeklyBucketStartUtc(date: Date): Date {
  const start = dailyBucketStartUtc(date);
  const day = start.getUTCDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  start.setUTCDate(start.getUTCDate() - daysSinceMonday);
  return start;
}

function weeklyBucketKey(date: Date): string {
  return weeklyBucketStartUtc(date).toISOString().slice(0, 10);
}

function isWeeklyHistoryRequest(req: Request): boolean {
  return typeof req.query.kind === 'string' && req.query.kind.toLowerCase() === 'weekly';
}

function collapseRunHistoryToDays<T extends { startedAt: Date | string; total?: number }>(runs: T[]): T[] {
  const grouped = new Map<string, T[]>();
  for (const run of runs) {
    const date = run.startedAt instanceof Date ? run.startedAt : new Date(run.startedAt);
    const key = dailyBucketKey(date);
    grouped.set(key, [...(grouped.get(key) ?? []), run]);
  }

  return [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, bucket]) => {
      const sorted = [...bucket].sort(
        (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
      );
      return [...sorted].reverse().find((run) => Number(run.total) > 0) ?? sorted[sorted.length - 1];
    });
}

// A tracked prompt that has never been through a tracked run yet — zeroed
// metrics so the table can render "Not yet tested".
function emptyTrackedRow(
  p: { id: number; text: string; intent: string | null; source: string; keywordId: number | null; lastTrackedRunAt: Date | null },
  nextTestAt: Date,
) {
  return {
    id: `pr-${p.id}`,
    rawId: p.id,
    type: 'prompt' as const,
    phrase: p.text,
    text: p.text,
    intent: p.intent,
    source: p.source,
    keywordId: p.keywordId,
    sov: '0%',
    aiSov: '—',
    aiSovPercent: null as number | null,
    mentions: 0,
    successfulResponses: 0,
    bestRank: 0,
    rankingPosition: null as number | null,
    avgRankPosition: null as number | null,
    rankedResponses: 0,
    brandMentionEvents: 0,
    competitorMentionEvents: 0,
    totalMentionEvents: 0,
    avgSentiment: null as number | null,
    competitors: [] as string[],
    competitorCount: 0,
    results: [] as ReturnType<typeof buildModelResults>,
    metrics: { visibility: 0, aiSov: null as number | null, avgOverall: 0, runs: 0, attemptedRuns: 0 },
    isTracked: true,
    lastTestedAt: p.lastTrackedRunAt,
    nextTestAt,
    weekTrend: { delta: null as number | null, lastVisibility: 0, points: [] as Array<{ runId: number; startedAt: Date; visibility: number }> },
  };
}

// ── GET /domains  (list for the user, with derived metrics + step) ────────
//
// Replaces the legacy GET /api/dashboard/all. Returns one row per domain
// owned by the caller, joined with profile/inferred/wizardState and
// counts derived from Keyword/Prompt/AiQueryResult.

// Phase → "highest completed step" mapping (5-step wizard).
// Used by /api/wizard/domains to derive currentStep for the history cards.
//   1  crawl/profile completed → next is "Pick competitors" (Step 3)
//   2  competitors picked      → next is "Pick prompts" (Step 4)
//   3  topics generated        → next is "Run AI Analysis" (still on Step 4)
//   4  select completed        → next is "View results" (Step 5 / dashboard)
//   5  run completed           → final, render visibility score
const PHASE_STEP: Record<string, number> = {
  crawl: 1,
  profile: 1,
  competitors: 2,
  topics: 3,
  select: 4,
  run: 5,
};

/** Cache key for the user's domain list. Invalidated on POST /domain and DELETE /domain/:id. */
const domainsCacheKey = (userId: number) => `wizard:domains:${userId}`;
const DOMAINS_CACHE_TTL_SECONDS = 60;
const DOMAINS_DB_TIMEOUT_MS = Number(process.env.DOMAINS_DB_TIMEOUT_MS) || 12000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function invalidateDomainReportCache(domain: { id: number; userId: number }): void {
  invalidateReportCacheForDomain(domain.userId, domain.id).catch((err) => {
    console.warn('[wizard/report] cache invalidation failed', err);
  });
}

router.get('/domains', timed('GET /domains', 300), authenticateToken, async (req: Request, res: Response) => {
  const userId = authReq(req).user.userId;

  // Fast path: Redis hit. The cache TTL is short (60s) so a newly created
  // domain shows up within a minute even if we miss an invalidation; the
  // explicit invalidations on POST /domain and DELETE /domain/:id keep the
  // common case (user adds a domain, then loads the dashboard) instant.
  try {
    const cached = await redisService.get(domainsCacheKey(userId));
    if (cached) {
      res.setHeader('X-Domains-Cache', 'hit');
      return res.json(JSON.parse(cached));
    }
  } catch (err) {
    // Don't fail the request just because Redis is down — fall through to the
    // real query. RedisService's graceful-degradation also short-circuits
    // here, but we belt-and-suspender it.
    console.warn('[wizard/domains] Redis read failed', err);
  }

  const domainsQuery = prisma.domain.findMany({
    where: { userId },
    include: {
      profile: { select: { country: true, state: true, industry: true, targetLocation: true } },
      inferred: { select: { companyName: true, companySize: true, summary: true } },
      wizardState: { select: { phases: true } },
      runs: {
        where: { status: 'completed', kind: 'audit' },
        orderBy: { startedAt: 'desc' },
        take: 1,
        select: { summary: true },
      },
      _count: {
        select: {
          keywords: { where: { isSelected: true } },
          prompts: { where: { isSelected: true } },
          runs: true,
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
  });
  let domains: Awaited<typeof domainsQuery>;
  try {
    domains = await withTimeout(
      domainsQuery,
      DOMAINS_DB_TIMEOUT_MS,
      'wizard domains query',
    );
  } catch (err) {
    if (err instanceof Error && err.message.includes('timed out')) {
      console.error(`[wizard/domains] ${err.message}`);
      return res.status(503).json({
        error: 'Domain list is temporarily unavailable',
        code: 'DOMAINS_DB_TIMEOUT',
      });
    }
    throw err;
  }

  // Derive currentStep + visibilityScore per row.
  const rows = domains.map((d) => {
      const phases = (d.wizardState?.phases as Record<string, string> | undefined) ?? {};
      let currentStep = 0;
      for (const [phase, status] of Object.entries(phases)) {
        if (status === 'completed') {
          currentStep = Math.max(currentStep, PHASE_STEP[phase] ?? 0);
        }
      }

      const latestRun = d.runs[0] ?? null;
      const summary = latestRun?.summary as Record<string, unknown> | null;
      const avgPresence = summary?.presenceRate as number | undefined;
      const avgOverall = summary?.avgOverall as number | undefined;
      const avgSentiment = summary?.avgSentiment as number | undefined;
      const totalQueries = summary?.totalQueries as number | undefined;

      const visibilityScore = avgPresence !== undefined ? Math.round(avgPresence * 100) : (avgOverall ?? null);
      const brandAccuracy = avgOverall !== undefined ? Math.round(avgOverall * 10) : null;
      const shareOfVoice = avgPresence !== undefined ? Math.round(avgPresence * 100) : null;
      const mentions = (avgPresence !== undefined && totalQueries !== undefined) ? Math.round(avgPresence * totalQueries) : 0;
      const overallHealth = (visibilityScore !== null && brandAccuracy !== null) ? Math.round((visibilityScore + brandAccuracy) / 2) : visibilityScore;

      return {
        id: d.id,
        url: d.url,
        host: d.host,
        isCompanyDomain: d.isCompanyDomain,
        lastAnalyzed: d.updatedAt,
        currentStep,
        industry: d.profile?.industry ?? null,
        companyName: d.inferred?.companyName ?? null,
        companySize: d.inferred?.companySize ?? null,
        summary: d.inferred?.summary ?? null,
        metrics: {
          keywordCount: d._count.keywords,
          phraseCount: d._count.prompts,
          totalQueries: d._count.runs,
          visibilityScore,
          shareOfVoice,
          brandAccuracy,
          brandSentiment: avgSentiment ?? null,
          mentions,
          overallHealth,
        },
      };
  });

  const payload = { domains: rows };
  // Best-effort write — don't block the response if Redis is degraded.
  redisService
    .set(domainsCacheKey(userId), JSON.stringify(payload), DOMAINS_CACHE_TTL_SECONDS)
    .catch((err) => console.warn('[wizard/domains] Redis write failed', err));
  res.setHeader('X-Domains-Cache', 'miss');
  return res.json(payload);
});

// ── POST /validate ─────────────────────────────────────────────────────────

// POST /validate accepts EITHER a JWT (existing dashboard usage) OR an anon
// wizard cookie (the new pre-signup funnel). Anon callers get back the same
// canonical-url + reachability info but with no `dbExistsForUser` since
// they don't own any rows yet — the WizardSession plays that role.
router.post('/validate', authenticateOrSession(), async (req: Request, res: Response) => {
  const { url } = (req.body ?? {}) as { url?: string };
  const norm = normalizeUrl(url ?? '');
  if (!norm) {
    // 200 with ok:false — the apiClient throws on any non-2xx, and a malformed
    // URL is a user-facing validation result, not a transport-level failure.
    return res.status(200).json({ ok: false, reason: 'Please enter a valid URL like example.com' });
  }

  // Reachability — HEAD then GET. Send a real Chrome UA + Accept header
  // so Cloudflare/WAF doesn't bounce us with a 403, and treat ANY HTTP
  // response (even 403/406) as "reachable enough" — the crawlService has
  // a Puppeteer fallback for WAF-blocked sites, so a non-2xx here doesn't
  // mean the wizard can't crawl it. Only DNS / network failures should
  // surface as "Site is unreachable".
  const REACH_HEADERS = {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
  };
  let reachable = false;
  let finalUrl: string | undefined;
  try {
    const head = await fetch(norm.canonicalUrl, {
      method: 'HEAD',
      redirect: 'follow',
      headers: REACH_HEADERS,
      signal: AbortSignal.timeout(5000),
    });
    // Anything that produced a status code → the host resolved and the
    // server answered, even if it returned 403/405/501.
    reachable = head.status > 0;
    finalUrl = head.url;
  } catch {
    /* try GET */
  }
  if (!reachable) {
    try {
      const get = await fetch(norm.canonicalUrl, {
        method: 'GET',
        redirect: 'follow',
        headers: REACH_HEADERS,
        signal: AbortSignal.timeout(5000),
      });
      reachable = get.status > 0;
      finalUrl = get.url;
    } catch {
      /* DNS / network failure — actually unreachable */
    }
  }

  // Look up an existing Domain only when the caller is an authenticated
  // user. Anonymous callers get dbExistsForUser=false because they don't
  // own anything yet — their WizardSession will hold the host until signup.
  let existing: { id: number; updatedAt: Date } | null = null;
  if (req.identity?.kind === 'user') {
    existing = await prisma.domain.findUnique({
      where: { userId_host: { userId: req.identity.userId, host: norm.host } },
      select: { id: true, updatedAt: true },
    });
  } else if (req.identity?.kind === 'anon') {
    // Best-effort: stash the entered host on the session so the signup
    // linkage handler can materialize a Domain shell for the new user.
    // Updates are fire-and-forget; a failure doesn't tear down validation.
    void prisma.wizardSession
      .update({
        where: { id: req.identity.session.id },
        data: {
          domainUrl: norm.canonicalUrl,
          domainHost: norm.host,
          step: 'profile',
        },
      })
      .catch((err: unknown) => {
        console.warn('[wizard/validate] session snapshot failed', err);
      });
  }

  return res.json({
    ok: reachable,
    canonicalUrl: norm.canonicalUrl,
    // `normalizedUrl` is the legacy name the wizard front end reads from.
    // Keep both populated so callers don't have to choose.
    normalizedUrl: norm.canonicalUrl,
    host: norm.host,
    reachable,
    finalUrl,
    dbExistsForUser: Boolean(existing),
    existingDomainId: existing?.id ?? undefined,
    lastAnalyzedAt: existing?.updatedAt ?? undefined,
    reason: reachable ? undefined : 'Site is unreachable. Check the URL and try again.',
    // Mode hint for the frontend — anonymous callers should hit the
    // signup wall at Step 4-5; authenticated callers see full results.
    mode: req.identity?.kind ?? 'anon',
  });
});

// ── POST /domain  (create + crawl, SSE) ────────────────────────────────────
//
// Dual-identity: JWT or anonymous wizard cookie. For anon callers the
// Domain is owned by the shadow user; on signup the linkage handler
// transfers Domain.userId to the real account. Step 5 (`/run`) stays
// auth-only because it triggers expensive LLM/SerpAPI calls.

router.post('/domain', authenticateOrSession(), async (req: Request, res: Response) => {
  const ownerId = getOwnerUserId(req);
  if (!ownerId) {
    return res.status(401).json({ error: 'No identity attached to request' });
  }

  const { url, country, state, industry, targetLocation, customSeeds } = (req.body ?? {}) as {
    url?: string;
    country?: string;
    state?: string;
    industry?: string;
    targetLocation?: string;
    customSeeds?: { keywords?: string[]; prompts?: string[] };
  };

  const norm = normalizeUrl(url ?? '');
  if (!norm) return res.status(400).json({ error: 'Invalid URL' });

  // SSE setup.
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  const send = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);
  const wizardSessionToken =
    req.identity?.kind === 'anon' && req.wizardSessionToken
      ? req.wizardSessionToken
      : undefined;

  try {
    // Upsert Domain (identity row only). For anon callers `ownerId` is the
    // shadow user's id; transfer happens at signup.
    const domain = await prisma.domain.upsert({
      where: { userId_host: { userId: ownerId, host: norm.host } },
      update: { url: norm.canonicalUrl },
      create: {
        userId: ownerId,
        url: norm.canonicalUrl,
        host: norm.host,
        isCompanyDomain: false,
      },
    });

    // Record the Domain id on the WizardSession so the post-signup
    // linkage handler can find it and the redirect target is known.
    if (req.identity?.kind === 'anon') {
      void prisma.wizardSession
        .update({
          where: { id: req.identity.session.id },
          data: { linkedDomainId: domain.id, domainHost: norm.host, domainUrl: norm.canonicalUrl, step: 'crawl' },
        })
        .catch((err: unknown) => {
          console.warn('[wizard/domain] session update failed', err);
        });
    }
    send({ type: 'domain_created', domainId: domain.id, wizardSessionToken });

    // Bust the user's domain-list cache so the new row appears on the
    // next /domains call without waiting for the 60s TTL.
    redisService.del(domainsCacheKey(ownerId)).catch(() => {});

    // Persist user-supplied profile.
    const seeds = {
      keywords: Array.isArray(customSeeds?.keywords) ? customSeeds!.keywords.filter((s) => typeof s === 'string') : [],
      prompts: Array.isArray(customSeeds?.prompts) ? customSeeds!.prompts.filter((s) => typeof s === 'string') : [],
    };
    await prisma.domainProfile.upsert({
      where: { domainId: domain.id },
      update: { country: country ?? null, state: state ?? null, industry: industry ?? null, targetLocation: targetLocation ?? null, customSeeds: seeds as any },
      create: { domainId: domain.id, country: country ?? null, state: state ?? null, industry: industry ?? null, targetLocation: targetLocation ?? null, customSeeds: seeds as any },
    });

    void queueCompetitorWarmup({
      domain: {
        ...domain,
        profile: {
          country: country ?? null,
          state: state ?? null,
          industry: industry ?? null,
          targetLocation: targetLocation ?? null,
          customSeeds: seeds as any,
        },
        inferred: null,
      } as NonNullable<DomainWithRelations>,
      seedKeywords: seeds.keywords,
    }).catch((err) => console.warn('[wizard/domain] competitor warmup failed', err));

    // Phase: crawl.
    await setPhase(prisma, domain.id, 'crawl', 'running');
    send({ type: 'progress', phase: 'crawl', progress: 5, step: 'Discovering pages…' });
    // LLM-first fast path: fetch only the homepage and let synthesizeContext
    // produce the full 8-section profile. Falls back to the multi-page
    // crawler when the adequacy gate fails (thin homepage, missing sections,
    // unknown company). Produces an identical CrawlOutput shape either way.
    const crawlStart = Date.now();
    let crawl = await inferDomainFromHomepage(norm.canonicalUrl);
    if (crawl) {
      console.log(`[PERF] crawl.total ${Date.now() - crawlStart}ms via=fastpath`);
      send({ type: 'progress', phase: 'crawl', progress: 70, step: 'Inferred company profile from homepage' });
    } else {
      send({ type: 'progress', phase: 'crawl', progress: 25, step: 'Homepage too thin — scanning full site…' });
      crawl = await crawlDomain(norm.canonicalUrl);
      console.log(`[PERF] crawl.total ${Date.now() - crawlStart}ms via=fullcrawl pages=${crawl.pagesScanned}`);
      send({ type: 'progress', phase: 'crawl', progress: 70, step: `Scanned ${crawl.pagesScanned} pages` });
    }

    // Start the embedding work before the crawl snapshot write. The input is
    // already final, and the DB write is independent, so this saves a small
    // serial wait without changing the crawl/profile output.
    const embedSource = crawl.rawText.slice(0, 8000);
    const crawlHash = crypto.createHash('sha256').update(embedSource).digest('hex');
    const embeddingPromise = prisma.domainInferred
      .findUnique({
        where: { domainId: domain.id },
        select: { embedding: true, crawlHash: true },
      })
      .then((existingInferred) => {
        const cachedEmbedding = Array.isArray(existingInferred?.embedding)
          ? (existingInferred!.embedding as number[])
          : null;
        if (cachedEmbedding && existingInferred?.crawlHash === crawlHash) {
          return cachedEmbedding;
        }
        return embedText(embedSource);
      });

    await prisma.crawlSnapshot.create({
      data: {
        domainId: domain.id,
        pagesScanned: crawl.pagesScanned,
        pages: crawl.pages as any,
        rawText: crawl.rawText,
        contextJson: crawl.contextJson as any,
        quality: crawl.quality as any,
        policy: crawl.policy as any,
        tokenUsage: crawl.tokenUsage,
      },
    });
    await setPhase(prisma, domain.id, 'crawl', 'completed');

    // Phase: profile (compute embedding + companySize, persist DomainInferred).
    await setPhase(prisma, domain.id, 'profile', 'running');
    send({ type: 'progress', phase: 'profile', progress: 85, step: 'Inferring profile…' });

    // Skips the embedding call when the crawl text is byte-identical to the
    // previous run for this domain — saves an OpenAI request and ~1–2 s.
    const embedding = await embeddingPromise;

    const companySize = inferCompanySize(crawl.rawText);
    await prisma.domainInferred.upsert({
      where: { domainId: domain.id },
      update: {
        companyName: crawl.contextJson?.companyName ?? null,
        companySize,
        productsJson: (crawl.contextJson?.products ?? []) as any,
        schemaOrgJson: (crawl.contextJson?.schemaOrg ?? null) as any,
        embedding: embedding as any,
        crawlHash,
        summary: crawl.contextJson?.summary ?? null,
        inferredAt: new Date(),
      },
      create: {
        domainId: domain.id,
        companyName: crawl.contextJson?.companyName ?? null,
        companySize,
        productsJson: (crawl.contextJson?.products ?? []) as any,
        schemaOrgJson: (crawl.contextJson?.schemaOrg ?? null) as any,
        embedding: embedding as any,
        crawlHash,
        summary: crawl.contextJson?.summary ?? null,
      },
    });
    await setPhase(prisma, domain.id, 'profile', 'completed');

    send({
      type: 'complete',
      domainId: domain.id,
      wizardSessionToken,
      profile: { companySize, summary: crawl.contextJson?.summary ?? null },
      crawlQuality: crawl.quality,
    });
    res.end();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    send({ type: 'error', error: 'Crawl failed', details: message });
    res.end();
  }
});

// ── GET /domain/:id ────────────────────────────────────────────────────────

router.get('/domain/:id', authenticateOrSession(), async (req: Request, res: Response) => {
  const got = await ensureDomain(req, req.params.id);
  if (!got.ok) return res.status(got.status).json({ error: got.error });
  const { domain } = got;
  const [crawls, competitors, keywords, prompts, runs] = await Promise.all([
    prisma.crawlSnapshot.findMany({ where: { domainId: domain.id }, orderBy: { createdAt: 'desc' }, take: 1 }),
    prisma.competitor.findMany({ where: { domainId: domain.id }, orderBy: { rank: 'asc' } }),
    prisma.keyword.findMany({ where: { domainId: domain.id } }),
    prisma.prompt.findMany({ where: { domainId: domain.id } }),
    prisma.aiRun.findMany({ where: { domainId: domain.id }, orderBy: { startedAt: 'desc' }, take: 5 }),
  ]);
  const promptRunMeta = await getPromptRunMetadata(prisma, prompts.map((prompt) => prompt.id));
  return res.json({
    domain,
    crawls,
    competitors,
    keywords,
    prompts: prompts.map((prompt) => ({
      ...prompt,
      ...(promptRunMeta.get(prompt.id) ?? { hasRun: false, lastRunAt: null }),
    })),
    runs,
  });
});

// ── GET /domain/:id/report ─────────────────────────────────────────────────
//
// Dashboard-shaped read for the AI Results page (replaces /api/dashboard/:id).
// Returns flat metrics + topPrompts list derived from the latest completed
// AiRun and the user's selected keywords/prompts.

router.get('/domain/:id/report', timed('GET /report', 800), authenticateToken, async (req: Request, res: Response) => {
  // ?runId= scopes every metric to a specific past run. Without it we use
  // the latest completed run for this domain (existing behaviour).
  const domainIdParam = req.params.id ? Number(req.params.id) : NaN;
  if (!domainIdParam || Number.isNaN(domainIdParam)) {
    return res.status(400).json({ error: 'Invalid domainId' });
  }
  const runIdParam = typeof req.query.runId === 'string' ? Number(req.query.runId) : NaN;
  const useSpecificRun = Number.isFinite(runIdParam) && runIdParam > 0;
  // Default to audit-kind runs so tracked-prompt runs don't become the
  // "latest run" the dashboard renders. ?kind=weekly|all overrides.
  const kindFilter = runKindFilter(req);
  const lite = req.query.lite === '1' || req.query.view === 'overview';
  const refreshInsights = req.query.refreshInsights === '1';
  const includeResultPayload = req.query.responses === '1' || req.query.verbose === '1';
  const verboseResultPayload = !lite || includeResultPayload;

  const ownerId = getOwnerUserId(req);
  const latestCacheScope = kindFilter.kind ?? 'all';
  const liteCacheKey = lite && !includeResultPayload && ownerId
    ? reportCacheKey(ownerId, domainIdParam, useSpecificRun ? runIdParam : `latest:${latestCacheScope}`, 'lite')
    : null;
  if (liteCacheKey) {
    try {
      const cached = await redisService.get(liteCacheKey);
      if (cached) {
        res.setHeader('X-Report-Cache', 'hit');
        return res.json(JSON.parse(cached));
      }
    } catch (err) {
      console.warn('[wizard/report] Redis read failed', err);
    }
  }

  const domain = ownerId
    ? await prisma.domain.findFirst({
        where: { id: domainIdParam, userId: ownerId },
        include: {
          profile: true,
          inferred: true,
          runs: {
            where: useSpecificRun
              ? { id: runIdParam, status: 'completed' }
              : { status: 'completed', ...kindFilter },
            orderBy: { startedAt: 'desc' },
            take: useSpecificRun ? 1 : 2,
            select: { id: true, status: true, startedAt: true, endedAt: true, summary: true },
          },
        },
      })
    : null;
  if (!domain) return res.status(404).json({ error: 'Domain not found' });

  const latestRun = domain.runs[0] ?? null;

  const reportRunId = latestRun?.id ?? -1;
  const [rawResults, keywords, prompts] = await Promise.all([
    // Explicit select — every field listed is consumed below. Omits
    // costUsd / createdAt / runId which the report doesn't need (the query
    // planner skips reading them; in particular costUsd is only used by the
    // billing summary on AiRun, not per-row). Keeps the response/JSONB
    // columns we need (they're surfaced verbatim in the API response).
    prisma.aiQueryResult.findMany({
      where: { runId: reportRunId },
      orderBy: { createdAt: 'desc' },
      take: 1000,
      select: {
        id: true,
        promptId: true,
        model: true,
        status: true,
        errorMessage: true,
        response: verboseResultPayload,
        presence: true,
        relevance: true,
        sentiment: true,
        accuracy: true,
        rankPosition: true,
        overall: true,
        scorerSummary: verboseResultPayload,
        factualClaims: verboseResultPayload,
        competitorHosts: true,
        citations: true,
        competitorMentions: true,
        latencyMs: verboseResultPayload,
      },
    }),
    // Load ALL keywords for this domain (not just isSelected). Many AI-generated
    // keywords have isSelected=false because the user picked the child prompts
    // rather than the keyword itself, but we still need the keyword rows so the
    // rollup at line ~398 can render parent rows for queried prompts. Filtering
    // by `queriedKeywordIds.has(k.id)` further down keeps the result set tight.
    prisma.keyword.findMany({
      where: { domainId: domain.id },
      select: { id: true, term: true, intent: true, source: true },
    }),
    prisma.prompt.findMany({
      where: { domainId: domain.id },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        text: true,
        intent: true,
        source: true,
        keywordId: true,
        isSelected: true,
        category: true,
        intentStage: true,
        persona: true,
        useCase: true,
        isBranded: true,
        competitorMentioned: true,
        isTracked: true,
        lastTrackedRunAt: true,
        createdAt: true,
      },
    }),
  ]);
  const allResults = rawResults.map((r: any) => ({
    ...r,
    response: typeof r.response === 'string' ? r.response : '',
    scorerSummary: typeof r.scorerSummary === 'string' ? r.scorerSummary : null,
    factualClaims: r.factualClaims ?? [],
    latencyMs: typeof r.latencyMs === 'number' ? r.latencyMs : null,
  })) as AiResultRow[];

  const summary = (latestRun?.summary as Record<string, unknown> | null) ?? null;
  if (
    latestRun?.id &&
    (summary?.scoringProvisional === true ||
      summary?.scoringStatus === 'queued' ||
      summary?.scoringStatus === 'enriching' ||
      summary?.scoringStatus === 'failed')
  ) {
    queueDeepScoringForRun({ prisma, domainId: domain.id, runId: latestRun.id });
  }
  // Group AiQueryResult rows by prompt — each prompt gets a `results` array
  // (one entry per model) so the dashboard can render the per-model breakdown
  // without an extra round trip.
  const resultsByPrompt = new Map<number, typeof allResults>();
  for (const r of allResults) {
    const arr = resultsByPrompt.get(r.promptId) ?? [];
    arr.push(r);
    resultsByPrompt.set(r.promptId, arr);
  }

  // Build the topPrompts list.
  //   - Return every saved prompt for the domain so the dashboard table is a
  //     true prompt inventory, not just the latest run's result set.
  //   - Keep keyword rollups scoped to prompts with results, because keyword
  //     rows are aggregate analytics and empty rollups add no signal.
  const queriedPromptIds = new Set(resultsByPrompt.keys());
  const queriedPrompts = prompts.filter((p) => queriedPromptIds.has(p.id));
  const selectedPrompts = prompts.filter((p) => p.isSelected);

  const queriedKeywordIds = new Set<number>();
  for (const p of queriedPrompts) if (p.keywordId) queriedKeywordIds.add(p.keywordId);
  const queriedKeywords = keywords.filter((k) => queriedKeywordIds.has(k.id));

  // Map keyword.id → { term, intent } so each prompt row can carry its source
  // keyword. The worksheet importer needs this to seed the topic's primary
  // keyword instead of regenerating one from the prompt phrase.
  const keywordById = new Map<number, { term: string; intent: string | null }>();
  for (const k of keywords) {
    keywordById.set(k.id, { term: k.term, intent: k.intent ?? null });
  }

  // Per-prompt row builders (toDisplaySentiment / buildModelResults /
  // rollupCompetitors) are module-level helpers shared with /tracked-prompts.

  const topPrompts = [
    ...queriedKeywords.map((k) => {
      const childPromptIds = queriedPrompts.filter((p) => p.keywordId === k.id).map((p) => p.id);
      const childResults = childPromptIds.flatMap((pid) => resultsByPrompt.get(pid) ?? []);
      const built = buildModelResults(childResults, { verbose: verboseResultPayload });
      const promptMetrics = buildPromptRowMetrics(built, domain.host);
      const competitors = rollupCompetitors(built);
      // A keyword row is "tracked" when all its child prompts are tracked.
      // Tracking the keyword toggles every child prompt (see childPromptIds).
      const childPrompts = queriedPrompts.filter((p) => p.keywordId === k.id);
      const keywordTracked = childPrompts.length > 0 && childPrompts.every((p) => p.isTracked);
      return {
        id: `kw-${k.id}`,
        rawId: k.id,
        type: 'keyword' as const,
        // Field names PromptTable consumes:
        phrase: k.term,
        text: k.term,
        intent: k.intent,
        source: k.source,
        // `sov` is retained as legacy visibility because other tracking UI
        // consumes it that way. The report table reads the explicit aiSov fields.
        sov: `${promptMetrics.visibilityPct}%`,
        aiSov: promptMetrics.aiSov,
        aiSovPercent: promptMetrics.aiSovPct,
        mentions: promptMetrics.mentions,
        successfulResponses: promptMetrics.successfulResponses,
        bestRank: promptMetrics.bestRankPosition ?? 0,
        rankingPosition: promptMetrics.bestRankPosition,
        avgRankPosition: promptMetrics.avgRankPosition,
        rankedResponses: promptMetrics.rankedResponses,
        brandMentionEvents: promptMetrics.brandMentionEvents,
        competitorMentionEvents: promptMetrics.competitorMentionEvents,
        totalMentionEvents: promptMetrics.totalMentionEvents,
        avgSentiment: promptMetrics.avgSentiment,
        competitors,
        competitorCount: competitors.length,
        results: built,
        metrics: {
          visibility: promptMetrics.visibilityPct,
          aiSov: promptMetrics.aiSovPct,
          avgOverall: promptMetrics.avgOverall,
          runs: promptMetrics.successfulResponses,
          attemptedRuns: promptMetrics.totalResponses,
        },
        // Tracking a keyword tracks all its child prompts.
        childPromptIds,
        isTracked: keywordTracked,
      };
    }),
    ...prompts.map((p) => {
      const rs = resultsByPrompt.get(p.id) ?? [];
      const built = buildModelResults(rs, { verbose: verboseResultPayload });
      const promptMetrics = buildPromptRowMetrics(built, domain.host);
      const competitors = rollupCompetitors(built);
      // Source keyword that produced this prompt — passed through so the
      // worksheet importer can seed the topic's primary keyword.
      const parentKw = p.keywordId ? keywordById.get(p.keywordId) ?? null : null;
      return {
        id: `pr-${p.id}`,
        rawId: p.id,
        type: 'prompt' as const,
        phrase: p.text,
        text: p.text,
        intent: p.intent,
        source: p.source,
        isSelected: p.isSelected,
        keywordId: p.keywordId,
        keyword: parentKw?.term ?? null,
        keywordIntent: parentKw?.intent ?? null,
        category: p.category,
        intentStage: p.intentStage,
        persona: p.persona,
        useCase: p.useCase,
        isBranded: p.isBranded,
        competitorMentioned: p.competitorMentioned,
        sov: `${promptMetrics.visibilityPct}%`,
        aiSov: promptMetrics.aiSov,
        aiSovPercent: promptMetrics.aiSovPct,
        mentions: promptMetrics.mentions,
        successfulResponses: promptMetrics.successfulResponses,
        bestRank: promptMetrics.bestRankPosition ?? 0,
        rankingPosition: promptMetrics.bestRankPosition,
        avgRankPosition: promptMetrics.avgRankPosition,
        rankedResponses: promptMetrics.rankedResponses,
        brandMentionEvents: promptMetrics.brandMentionEvents,
        competitorMentionEvents: promptMetrics.competitorMentionEvents,
        totalMentionEvents: promptMetrics.totalMentionEvents,
        avgSentiment: promptMetrics.avgSentiment,
        competitors,
        competitorCount: competitors.length,
        results: built,
        metrics: {
          visibility: promptMetrics.visibilityPct,
          aiSov: promptMetrics.aiSovPct,
          avgOverall: promptMetrics.avgOverall,
          runs: promptMetrics.successfulResponses,
          attemptedRuns: promptMetrics.totalResponses,
        },
        hasRun: promptMetrics.totalResponses > 0,
        resultCount: promptMetrics.totalResponses,
        isTracked: p.isTracked,
        lastTestedAt: p.lastTrackedRunAt,
      };
    }),
  ];

  const reportCards = buildCanonicalReportMetrics({
    rows: allResults,
    ownDomainHost: domain.host,
    promptInventory: {
      generated: prompts.length,
      selected: selectedPrompts.length,
      run: queriedPrompts.length,
      tracked: prompts.filter((p) => p.isTracked).length,
    },
  });
  const modelPerformance = reportCards.modelPerformance.map((model) => ({
    model: model.model,
    visibility: model.visibilityRate ?? 0,
    accuracy: 0,
    sentiment: 0,
    queries: model.successfulResponses,
    attemptedQueries: model.attemptedResponses,
    failedQueries: model.failedResponses,
    mentions: model.brandMentions,
  }));

  // "New prompts added since the previous run" — count selected prompts whose
  // createdAt is after the SECOND-most-recent completed audit run started.
  // With fewer than two audit runs there's no prior baseline to diff against,
  // so the count is 0 (drives the "New Prompts" card on the All Prompts tab).
  // Always scoped to kind='audit' so tracked-prompt runs don't move the
  // baseline, regardless of any ?kind override on this request.
  const previousAuditRunStartedAt = useSpecificRun ? null : domain.runs[1]?.startedAt ?? null;
  const newPromptsSinceLastRun = previousAuditRunStartedAt
    ? selectedPrompts.filter((p) => p.createdAt > previousAuditRunStartedAt).length
    : 0;

  const totalQueries = reportCards.responseHealth.successfulResponses;
  const brandMentions = reportCards.mentions.brandMentionResponses;
  const competitorMentions = reportCards.mentions.competitorMentionEvents;
  const mentionRate = reportCards.aiShareOfVoice.percent;

  // ── Phrase Visibility Map + Outrank Opportunities ─────────────────────
  // Pulled from the same data we already loaded above; no extra DB hits.
  let opportunities: EnrichedOpportunity[] = [];
  let phraseVisibility: ReturnType<typeof computePhraseVisibility> = [];
  let insightsStatus: 'deferred' | 'ready' | 'warming' | 'error' = lite ? 'deferred' : 'ready';
  let insightsError: string | null = null;

  if (!lite) {
    try {
      const selectedCompetitors = await prisma.competitor.findMany({
        where: { domainId: domain.id, isSelected: true },
        select: { competitorHost: true },
      });
      const analyticsInput = {
        ownDomainHost: domain.host,
        ownBrandName: domain.inferred?.companyName ?? null,
        selectedCompetitorHosts: selectedCompetitors.map((c) => c.competitorHost),
        keywords: keywords.map((k) => ({ id: k.id, term: k.term, intent: k.intent })),
        prompts: queriedPrompts.map((p) => ({
          id: p.id,
          text: p.text,
          intent: p.intent,
          keywordId: p.keywordId,
          category: p.category,
          intentStage: p.intentStage,
          persona: p.persona,
          useCase: p.useCase,
          isBranded: p.isBranded,
          competitorMentioned: p.competitorMentioned,
        })),
        results: allResults.map((r) => ({
          id: r.id,
          promptId: r.promptId,
          model: r.model,
          presence: r.presence,
          overall: r.overall,
          sentiment: r.sentiment,
          rankPosition: r.rankPosition,
          competitorMentions: r.competitorMentions as Prisma.JsonValue,
          competitorHosts: r.competitorHosts as Prisma.JsonValue,
          citations: r.citations as Prisma.JsonValue,
        })),
      };
      phraseVisibility = computePhraseVisibility(analyticsInput);
      const heuristicOpportunities = computeOpportunities(analyticsInput, phraseVisibility);

      // ── LLM enrichment with per-AiRun cache ──────────────────────────────
      // Never block /report on an LLM call. If the cache is missing/stale, return
      // usable heuristic opportunities immediately and warm the enriched cache in
      // the background for the next read.
      const cached = (summary?.opportunitiesEnriched as EnrichedOpportunity[] | undefined) ?? null;
      const cachedKeys = (summary?.opportunitiesEnrichedKeys as string[] | undefined) ?? null;
      const currentKeys = heuristicOpportunities.map((o) => o.key);
      const cacheValid =
        !refreshInsights &&
        cached &&
        cachedKeys &&
        cachedKeys.length === currentKeys.length &&
        cachedKeys.every((k, i) => k === currentKeys[i]);

      if (cacheValid) {
        // Hydrate cached enrichment back onto the freshly-computed opportunities
        // so volatile fields (severityScore, promptIds) reflect the latest data.
        const enrichedByKey = new Map(cached.map((c) => [c.key, c]));
        opportunities = heuristicOpportunities.map((o) => {
          const e = enrichedByKey.get(o.key);
          return e ? { ...o, title: e.title, rationale: e.rationale, recommendedAngle: e.recommendedAngle, brief: e.brief } : { ...o, recommendedAngle: '', brief: { audience: '', tone: 'Authoritative' as const, structure: '', keyPoints: [], wordCount: 1000, cta: '' } };
        });
      } else {
        opportunities = heuristicOpportunities.map((o) => withDefaultBrief(o));
        insightsStatus = 'warming';
        const promptsById = new Map(
          queriedPrompts.map((p) => [
            p.id,
            {
              text: p.text,
              persona: p.persona,
              useCase: p.useCase,
              category: p.category,
            },
          ])
        );

        if (latestRun?.id) {
          const existingSummary = (summary as Record<string, unknown> | null) ?? {};
          enrichOpportunities(heuristicOpportunities, {
            brandName: domain.inferred?.companyName ?? domain.host,
            brandHost: domain.host,
            industry: domain.profile?.industry ?? null,
            brandSummary: domain.inferred?.summary ?? null,
            promptsById,
          })
            .then((enriched) => {
              const updatedSummary = {
                ...existingSummary,
                opportunitiesEnriched: enriched,
                opportunitiesEnrichedKeys: currentKeys,
                opportunitiesEnrichedAt: new Date().toISOString(),
              };
              return prisma.aiRun.update({ where: { id: latestRun.id }, data: { summary: updatedSummary as any } });
            })
            .catch((err) => console.warn('[opportunities] background enrichment failed', err));
        }
      }
    } catch (err) {
      insightsStatus = 'error';
      insightsError = err instanceof Error ? err.message : 'Opportunity analysis failed';
      phraseVisibility = [];
      opportunities = [];
      console.warn('[wizard/report] opportunity insights failed', {
        domainId: domain.id,
        runId: latestRun?.id ?? null,
        error: insightsError,
      });
    }
  }

  const payload = {
    id: latestRun?.id ?? null,
    domainInfo: {
      id: domain.id,
      url: domain.url,
      host: domain.host,
      companyName: domain.inferred?.companyName ?? null,
      industry: domain.profile?.industry ?? null,
    },
    runStatus: latestRun?.status ?? 'pending',
    runStartedAt: latestRun?.startedAt ?? null,
    runEndedAt: latestRun?.endedAt ?? null,
    summary,
    metrics: {
      visibilityScore: reportCards.visibility.percent,
      avgOverall: (summary?.avgOverall as number | undefined) ?? 0,
      avgSentiment: (summary?.avgSentiment as number | undefined) ?? 0,
      avgAccuracy: reportCards.accuracy.percent ?? 0,
      mentionRate,
      brandPages: brandMentions,
      competitorPages: competitorMentions,
      totalQueries,
      newPromptsSinceLastRun,
      promptInventory: {
        ...reportCards.promptInventory,
      },
      reportCards,
      modelPerformance,
      insightsStatus,
      insightsError,
    },
    topPrompts,
    topAiSearchPrompts: topPrompts,
    phraseVisibility,
    opportunities,
  };
  if (liteCacheKey) {
    res.setHeader('X-Report-Cache', 'miss');
    redisService
      .set(liteCacheKey, JSON.stringify(payload), REPORT_LITE_CACHE_TTL_SECONDS)
      .catch((err) => console.warn('[wizard/report] Redis write failed', err));
  }
  return res.json(payload);
});

// ── GET /domain/:id/state ──────────────────────────────────────────────────

router.get('/domain/:id/state', authenticateOrSession(), async (req: Request, res: Response) => {
  const got = await ensureDomain(req, req.params.id);
  if (!got.ok) return res.status(got.status).json({ error: got.error });
  const { domain } = got;
  const state = await readState(prisma, domain.id);
  return res.json({
    domainId: domain.id,
    url: domain.url,
    host: domain.host,
    profile: domain.profile ?? null,
    inferred: domain.inferred ?? null,
    phases: state.phases,
    canResumeAt: state.canResumeAt,
    selectionDraft: state.selectionDraft,
  });
});

// ── PATCH /domain/:id/prompts/track  { promptIds: number[], tracked } ──────
//
// Bulk toggle recurring tracking for several prompts at once (the "Track all" /
// "Track selected" toolbar actions). updateMany is scoped to { id in, domainId }
// so a caller can't flip prompts on a domain they don't own.
//
// MUST be registered BEFORE `/prompts/:promptId` below: Express matches in
// order, and the literal `track` segment would otherwise be captured by the
// `:promptId` param, hitting the edit route with promptId="track" (NaN) and
// returning a spurious "Invalid promptId". Keep this route above that one.
router.patch('/domain/:id/prompts/track', authenticateOrSession(), async (req: Request, res: Response) => {
  const got = await ensureDomain(req, req.params.id);
  if (!got.ok) return res.status(got.status).json({ error: got.error });
  const { domain } = got;

  const body = (req.body ?? {}) as { promptIds?: unknown; tracked?: unknown };
  const promptIds = Array.isArray(body.promptIds)
    ? body.promptIds.map((n) => Number(n)).filter((n) => Number.isFinite(n))
    : [];
  if (promptIds.length === 0) return res.status(400).json({ error: 'promptIds (number[]) is required' });
  const tracked = Boolean(body.tracked);

  const result = await prisma.prompt.updateMany({
    where: { id: { in: promptIds }, domainId: domain.id },
    data: { isTracked: tracked },
  });
  invalidateDomainReportCache(domain);
  return res.json({ updated: result.count, tracked });
});

// ── PATCH /domain/:id/prompts/:promptId ───────────────────────────────────
//
// Lets the user edit a prompt's text in Step 4 before running. We
// intentionally allow editing AI-generated prompts (source='ai') in
// addition to custom ones — the value here is wording refinement, and
// the user knows their domain better than the generator.
//
// Body: { text: string }
//
// Returns the updated prompt. Domain ownership scoped via ensureDomain.
router.patch('/domain/:id/prompts/:promptId', authenticateOrSession(), async (req: Request, res: Response) => {
  const got = await ensureDomain(req, req.params.id);
  if (!got.ok) return res.status(got.status).json({ error: got.error });
  const { domain } = got;

  const promptId = Number(req.params.promptId);
  if (!Number.isFinite(promptId)) return res.status(400).json({ error: 'Invalid promptId' });

  const text = typeof (req.body ?? {}).text === 'string'
    ? (req.body as { text: string }).text.trim()
    : '';
  if (!text) return res.status(400).json({ error: 'text is required' });
  if (text.length > 800) return res.status(400).json({ error: 'Prompt is too long (max 800 chars)' });

  // Verify the prompt belongs to this domain BEFORE we update — a
  // missing-or-mismatched promptId becomes a 404 instead of leaking
  // existence via a Prisma not-found error.
  const existing = await prisma.prompt.findFirst({
    where: { id: promptId, domainId: domain.id },
    select: { id: true },
  });
  if (!existing) return res.status(404).json({ error: 'Prompt not found' });

  const updated = await prisma.prompt.update({
    where: { id: promptId },
    data: { text },
    select: {
      id: true,
      text: true,
      intent: true,
      source: true,
      keywordId: true,
      isSelected: true,
    },
  });

  invalidateDomainReportCache(domain);
  return res.json({ prompt: updated });
});

// ── PATCH /domain/:id/prompts/:promptId/track  { tracked: boolean } ────────
//
// Toggle a single prompt's recurring tracking flag. Tracked prompts are
// re-tested every day by the scheduler. Ownership scoped via ensureDomain; the prompt
// must belong to the domain.
router.patch('/domain/:id/prompts/:promptId/track', authenticateOrSession(), async (req: Request, res: Response) => {
  const got = await ensureDomain(req, req.params.id);
  if (!got.ok) return res.status(got.status).json({ error: got.error });
  const { domain } = got;

  const promptId = Number(req.params.promptId);
  if (!Number.isFinite(promptId)) return res.status(400).json({ error: 'Invalid promptId' });
  const tracked = Boolean((req.body ?? {}).tracked);

  const existing = await prisma.prompt.findFirst({
    where: { id: promptId, domainId: domain.id },
    select: { id: true },
  });
  if (!existing) return res.status(404).json({ error: 'Prompt not found' });

  const updated = await prisma.prompt.update({
    where: { id: promptId },
    data: { isTracked: tracked },
    select: { id: true, isTracked: true },
  });
  invalidateDomainReportCache(domain);
  return res.json({ prompt: updated });
});

// ── GET /domain/:id/tracked-prompts ───────────────────────────────────────
//
// The Prompt Tracking tab. Returns one PromptTable-shaped row per tracked
// prompt, built from the LATEST completed tracked run, plus a day-over-day
// delta vs the previous daily run and a sparkline trend across recent daily
// runs. Shape mirrors /report's topPrompts so the existing table renders it
// unchanged, with tracking metadata added.
router.get('/domain/:id/tracked-prompts', authenticateToken, async (req: Request, res: Response) => {
  const got = await ensureDomain(req, req.params.id);
  if (!got.ok) return res.status(got.status).json({ error: got.error });
  const { domain } = got;
  const scheduleMeta = await getTrackedPromptScheduleMeta();

  const trackedPrompts = await prisma.prompt.findMany({
    where: { domainId: domain.id, isTracked: true },
    select: { id: true, text: true, intent: true, source: true, keywordId: true, lastTrackedRunAt: true },
  });
  if (trackedPrompts.length === 0) {
    return res.json({
      ...scheduleMeta,
      prompts: [],
      latestRunAt: null,
    });
  }
  const promptIds = trackedPrompts.map((p) => p.id);

  // Recent tracked runs (newest first). We may have multiple runs inside the
  // same UTC day because "Test tracked now" uses kind='weekly' too.
  // Bucket by UTC day so the UI columns are truly daily, not "every manual run".
  const trackedRuns = await prisma.aiRun.findMany({
    where: { domainId: domain.id, kind: 'weekly', status: 'completed' },
    orderBy: { startedAt: 'desc' },
    take: 60,
    select: { id: true, startedAt: true },
  });

  if (trackedRuns.length === 0) {
    // Tracked but never run yet — return rows with no metrics so the UI can
    // show "Not yet tested".
    return res.json({
      ...scheduleMeta,
      latestRunAt: null,
      prompts: trackedPrompts.map((p) => emptyTrackedRow(p, scheduleMeta.nextTestAt)),
    });
  }

  type DailyRunBucket = {
    key: string;
    start: Date;
    runs: typeof trackedRuns;
  };
  const shouldUseRawRuns =
    scheduleMeta.schedule.cadence === 'every_6_hours' ||
    scheduleMeta.schedule.cadence === 'every_12_hours' ||
    scheduleMeta.schedule.cadence === 'custom';
  const groupedBuckets = shouldUseRawRuns
    ? trackedRuns.map((run) => ({ key: `run-${run.id}`, start: run.startedAt, runs: [run] }))
    : [...trackedRuns.reduce((map, run) => {
        const key = scheduleMeta.schedule.cadence === 'weekly'
          ? weeklyBucketKey(run.startedAt)
          : dailyBucketKey(run.startedAt);
        const bucket = map.get(key) ?? {
          key,
          start: scheduleMeta.schedule.cadence === 'weekly'
            ? weeklyBucketStartUtc(run.startedAt)
            : dailyBucketStartUtc(run.startedAt),
          runs: [] as typeof trackedRuns,
        };
        bucket.runs.push(run);
        map.set(key, bucket);
        return map;
      }, new Map<string, DailyRunBucket>()).values()]
      .map((bucket) => ({
        ...bucket,
        runs: [...bucket.runs].sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime()),
      }));

  const historyBuckets = groupedBuckets
    .sort((a, b) => b.start.getTime() - a.start.getTime())
    .slice(0, 14);
  const bucketRunsNewestFirst = historyBuckets.flatMap((bucket) => bucket.runs);
  const trendRunIds = bucketRunsNewestFirst.map((r) => r.id);
  const startedAtByRun = new Map(trackedRuns.map((r) => [r.id, r.startedAt] as const));

  const results = await prisma.aiQueryResult.findMany({
    where: { promptId: { in: promptIds }, runId: { in: trendRunIds } },
    select: {
      id: true, promptId: true, model: true, status: true, errorMessage: true, response: true, presence: true,
      relevance: true, sentiment: true, accuracy: true, rankPosition: true,
      overall: true, scorerSummary: true, factualClaims: true, competitorHosts: true,
      citations: true, competitorMentions: true, latencyMs: true,
      runId: true,
    },
  });

  // Index results: promptId -> runId -> rows.
  const byPromptRun = new Map<number, Map<number, AiResultRow[]>>();
  for (const r of results) {
    let perRun = byPromptRun.get(r.promptId);
    if (!perRun) { perRun = new Map(); byPromptRun.set(r.promptId, perRun); }
    const arr = perRun.get(r.runId) ?? [];
    arr.push(r as AiResultRow);
    perRun.set(r.runId, arr);
  }

  // Visibility % (presence/total) for a prompt in a given run.
  const visibilityFor = (promptId: number, runId: number): number | null => {
    const rows = byPromptRun.get(promptId)?.get(runId);
    if (!rows || rows.length === 0) return null;
    const metrics = buildPromptRowMetrics(buildModelResults(rows), domain.host);
    return metrics.successfulResponses > 0 ? metrics.visibilityPct : null;
  };

  const latestRunAt = trackedRuns[0].startedAt;

  const prompts = trackedPrompts.map((p) => {
    const latestRunForPrompt = bucketRunsNewestFirst.find((run) => {
      const rows = byPromptRun.get(p.id)?.get(run.id);
      return rows && rows.length > 0;
    });
    const latestRows = latestRunForPrompt ? (byPromptRun.get(p.id)?.get(latestRunForPrompt.id) ?? []) : [];
    const built = buildModelResults(latestRows);
    const promptMetrics = buildPromptRowMetrics(built, domain.host);
    const competitors = rollupCompetitors(built);

    // Sparkline: one point per UTC day that has data for this prompt,
    // oldest → newest. If a day has multiple manual tests, use the newest
    // scored run in that day.
    const trend = [...historyBuckets]
      .reverse()
      .map((bucket) => {
        for (const run of bucket.runs) {
          const vis = visibilityFor(p.id, run.id);
          if (vis != null) {
            return { runId: run.id, startedAt: bucket.start, visibility: vis };
          }
        }
        return null;
      })
      .filter((point): point is { runId: number; startedAt: Date; visibility: number } => point !== null);
    const latestTrendPoint = trend[trend.length - 1] ?? null;
    const prevTrendPoint = trend[trend.length - 2] ?? null;
    const visibilityDelta =
      latestTrendPoint && prevTrendPoint ? latestTrendPoint.visibility - prevTrendPoint.visibility : null;

    return {
      id: `pr-${p.id}`,
      rawId: p.id,
      type: 'prompt' as const,
      phrase: p.text,
      text: p.text,
      intent: p.intent,
      source: p.source,
      keywordId: p.keywordId,
      sov: `${promptMetrics.visibilityPct}%`,
      aiSov: promptMetrics.aiSov,
      aiSovPercent: promptMetrics.aiSovPct,
      mentions: promptMetrics.mentions,
      successfulResponses: promptMetrics.successfulResponses,
      bestRank: promptMetrics.bestRankPosition ?? 0,
      rankingPosition: promptMetrics.bestRankPosition,
      avgRankPosition: promptMetrics.avgRankPosition,
      rankedResponses: promptMetrics.rankedResponses,
      brandMentionEvents: promptMetrics.brandMentionEvents,
      competitorMentionEvents: promptMetrics.competitorMentionEvents,
      totalMentionEvents: promptMetrics.totalMentionEvents,
      avgSentiment: promptMetrics.avgSentiment,
      competitors,
      competitorCount: competitors.length,
      results: built,
      metrics: {
        visibility: promptMetrics.visibilityPct,
        aiSov: promptMetrics.aiSovPct,
        avgOverall: promptMetrics.avgOverall,
        runs: promptMetrics.successfulResponses,
        attemptedRuns: promptMetrics.totalResponses,
      },
      // Tracking metadata.
      isTracked: true,
      lastTestedAt: p.lastTrackedRunAt ?? (latestRunForPrompt ? startedAtByRun.get(latestRunForPrompt.id) ?? latestRunAt : null),
      nextTestAt: scheduleMeta.nextTestAt,
      weekTrend: { delta: visibilityDelta, lastVisibility: promptMetrics.visibilityPct, points: trend },
    };
  });

  return res.json({
    ...scheduleMeta,
    latestRunAt,
    prompts,
  });
});

// ── PATCH /domain/:id/tracked-prompts/schedule ────────────────────────────
//
// Updates the BullMQ repeatable schedule for the tracked-prompt sweeper. The
// current worker has one sweeper that processes all domains with tracked
// prompts, so this setting is global even though the route is scoped through a
// domain for ownership/auth consistency with the Prompt Tracking tab.
router.patch('/domain/:id/tracked-prompts/schedule', authenticateToken, async (req: Request, res: Response) => {
  const got = await ensureDomain(req, req.params.id);
  if (!got.ok) return res.status(got.status).json({ error: got.error });

  const { updateWeeklyTrackingSchedule } = require('../services/weeklyTrackingService');

  try {
    const schedule = await updateWeeklyTrackingSchedule(req.body ?? {});
    const serialized = serializeTrackedPromptSchedule(schedule);
    return res.json({
      cadence: serialized.cadence,
      nextTestAt: serialized.nextTestAt,
      schedule: serialized,
      scheduleOptions: TRACKED_PROMPT_SCHEDULE_OPTIONS,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid tracked prompt schedule';
    return res.status(400).json({ error: message });
  }
});

// ── POST /domain/:id/tracked-prompts/run-now ──────────────────────────────
//
// Manual "Test tracked now" trigger. Fire-and-forget: kicks the tracked run for
// this domain and returns immediately (the LLM sweep takes minutes). 400 if
// there are no tracked prompts.
router.post('/domain/:id/tracked-prompts/run-now', authenticateToken, async (req: Request, res: Response) => {
  const got = await ensureDomain(req, req.params.id);
  if (!got.ok) return res.status(got.status).json({ error: got.error });
  const { domain } = got;

  const count = await prisma.prompt.count({ where: { domainId: domain.id, isTracked: true } });
  if (count === 0) return res.status(400).json({ error: 'No tracked prompts to test' });

  const { runWeeklyForDomain } = require('../services/weeklyTrackingService');
  // Don't await — the sweep streams nothing and can take minutes.
  Promise.resolve(runWeeklyForDomain(domain.id)).catch((e: unknown) =>
    console.error(`[tracked-prompts] run-now for domain ${domain.id} failed`, e));
  return res.json({ started: true, trackedPrompts: count });
});

// ── GET /domain/:id/prompts/:promptId/history ─────────────────────────────
//
// Per-prompt time series for the Track Prompts inline detail chart. One row
// per completed AiRun, ordered ascending by startedAt. Y values come from
// the AiQueryResult rows tied to this promptId in each run.
//
//   {
//     prompt: { id, text },
//     runs: [{ runId, startedAt, presenceRate, mentions, total, avgSentiment }]
//   }
router.get('/domain/:id/prompts/:promptId/history', authenticateToken, async (req: Request, res: Response) => {
  const got = await ensureDomain(req, req.params.id);
  if (!got.ok) return res.status(got.status).json({ error: got.error });
  const { domain } = got;
  const promptId = Number(req.params.promptId);
  if (!Number.isFinite(promptId)) return res.status(400).json({ error: 'Invalid promptId' });

  const prompt = await prisma.prompt.findFirst({
    where: { id: promptId, domainId: domain.id },
    select: { id: true, text: true },
  });
  if (!prompt) return res.status(404).json({ error: 'Prompt not found' });

  const rows = await prisma.aiQueryResult.findMany({
    where: {
      promptId,
      run: { domainId: domain.id, status: 'completed', ...runKindFilter(req) },
    },
    select: {
      runId: true,
      model: true,
      status: true,
      presence: true,
      sentiment: true,
      run: { select: { startedAt: true } },
    },
  });

  // Bucket per run, tracking per-model presence so the UI can filter the
  // visibility chart to a single model (the "Models" dropdown) or show the
  // aggregate across all models.
  type ModelTally = { mentions: number; total: number };
  type Bucket = {
    runId: number;
    startedAt: Date;
    attempted: number;
    failed: number;
    mentions: number;
    total: number;
    sentSum: number;
    sentCount: number;
    byModel: Map<string, ModelTally>;
  };
  const byRun = new Map<number, Bucket>();
  for (const r of rows) {
    let b = byRun.get(r.runId);
    if (!b) {
      b = {
        runId: r.runId,
        startedAt: r.run.startedAt,
        attempted: 0,
        failed: 0,
        mentions: 0,
        total: 0,
        sentSum: 0,
        sentCount: 0,
        byModel: new Map(),
      };
      byRun.set(r.runId, b);
    }
    b.attempted += 1;
    if (r.status === 'failed') {
      b.failed += 1;
      continue;
    }
    b.total += 1;
    b.mentions += r.presence;
    const tally = b.byModel.get(r.model) ?? { mentions: 0, total: 0 };
    tally.total += 1;
    tally.mentions += r.presence;
    b.byModel.set(r.model, tally);
    if (r.presence === 1 && r.sentiment !== null) {
      // Convert raw -10..10 into displayed 0..10 (matches /report transform).
      b.sentSum += Math.max(0, Math.min(10, (r.sentiment + 10) / 2));
      b.sentCount += 1;
    }
  }

  const runHistory = [...byRun.values()]
    .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())
    .map((b) => ({
      runId: b.runId,
      startedAt: b.startedAt,
      presenceRate: b.total > 0 ? Math.round((b.mentions / b.total) * 100) : 0,
      mentions: b.mentions,
      attempted: b.attempted,
      failed: b.failed,
      total: b.total,
      avgSentiment: b.sentCount > 0 ? Number((b.sentSum / b.sentCount).toFixed(2)) : null,
      byModel: Object.fromEntries(
        [...b.byModel.entries()].map(([model, t]) => [
          model,
          { mentions: t.mentions, total: t.total, presenceRate: t.total > 0 ? Math.round((t.mentions / t.total) * 100) : 0 },
        ]),
      ),
    }));
  const runs = isWeeklyHistoryRequest(req) ? collapseRunHistoryToDays(runHistory) : runHistory;

  return res.json({ prompt, runs });
});

// ── GET /domain/:id/keywords/:keywordId/history ───────────────────────────
//
// Same shape as the prompt history endpoint, but rolls up across every
// child prompt belonging to the keyword. Drives the Track Keywords inline
// detail chart.
router.get('/domain/:id/keywords/:keywordId/history', authenticateToken, async (req: Request, res: Response) => {
  const got = await ensureDomain(req, req.params.id);
  if (!got.ok) return res.status(got.status).json({ error: got.error });
  const { domain } = got;
  const keywordId = Number(req.params.keywordId);
  if (!Number.isFinite(keywordId)) return res.status(400).json({ error: 'Invalid keywordId' });

  const keyword = await prisma.keyword.findFirst({
    where: { id: keywordId, domainId: domain.id },
    select: { id: true, term: true },
  });
  if (!keyword) return res.status(404).json({ error: 'Keyword not found' });

  // Pull the child prompt ids first so we can scope the result query.
  const childPrompts = await prisma.prompt.findMany({
    where: { domainId: domain.id, keywordId },
    select: { id: true },
  });
  const childIds = childPrompts.map((p) => p.id);
  if (childIds.length === 0) {
    return res.json({ keyword, runs: [] });
  }

  const rows = await prisma.aiQueryResult.findMany({
    where: {
      promptId: { in: childIds },
      run: { domainId: domain.id, status: 'completed', ...runKindFilter(req) },
    },
    select: {
      runId: true,
      model: true,
      status: true,
      presence: true,
      sentiment: true,
      run: { select: { startedAt: true } },
    },
  });

  // Per-run buckets with a per-model breakdown (mirrors the prompt endpoint) so
  // the expanded-graph "Models" filter works on keyword rollup rows too.
  type ModelTally = { mentions: number; total: number };
  type Bucket = {
    runId: number;
    startedAt: Date;
    attempted: number;
    failed: number;
    mentions: number;
    total: number;
    sentSum: number;
    sentCount: number;
    byModel: Map<string, ModelTally>;
  };
  const byRun = new Map<number, Bucket>();
  for (const r of rows) {
    let b = byRun.get(r.runId);
    if (!b) {
      b = {
        runId: r.runId,
        startedAt: r.run.startedAt,
        attempted: 0,
        failed: 0,
        mentions: 0,
        total: 0,
        sentSum: 0,
        sentCount: 0,
        byModel: new Map(),
      };
      byRun.set(r.runId, b);
    }
    b.attempted += 1;
    if (r.status === 'failed') {
      b.failed += 1;
      continue;
    }
    b.total += 1;
    b.mentions += r.presence;
    const tally = b.byModel.get(r.model) ?? { mentions: 0, total: 0 };
    tally.total += 1;
    tally.mentions += r.presence;
    b.byModel.set(r.model, tally);
    if (r.presence === 1 && r.sentiment !== null) {
      b.sentSum += Math.max(0, Math.min(10, (r.sentiment + 10) / 2));
      b.sentCount += 1;
    }
  }

  const runHistory = [...byRun.values()]
    .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())
    .map((b) => ({
      runId: b.runId,
      startedAt: b.startedAt,
      presenceRate: b.total > 0 ? Math.round((b.mentions / b.total) * 100) : 0,
      mentions: b.mentions,
      attempted: b.attempted,
      failed: b.failed,
      total: b.total,
      avgSentiment: b.sentCount > 0 ? Number((b.sentSum / b.sentCount).toFixed(2)) : null,
      byModel: Object.fromEntries(
        [...b.byModel.entries()].map(([model, t]) => [
          model,
          { mentions: t.mentions, total: t.total, presenceRate: t.total > 0 ? Math.round((t.mentions / t.total) * 100) : 0 },
        ]),
      ),
    }));
  const runs = isWeeklyHistoryRequest(req) ? collapseRunHistoryToDays(runHistory) : runHistory;

  return res.json({ keyword, runs });
});

// ── GET /domain/:id/runs  (past audit runs for the dashboard run-picker) ──
//
// Returns one row per completed AiRun for this domain, newest first. The
// dashboard's run dropdown uses this to let the user compare today's run
// against last week / last month.
router.get('/domain/:id/runs', authenticateToken, async (req: Request, res: Response) => {
  const got = await ensureDomain(req, req.params.id);
  if (!got.ok) return res.status(got.status).json({ error: got.error });
  const { domain } = got;
  const runs = await prisma.aiRun.findMany({
    where: { domainId: domain.id, ...runKindFilter(req) },
    orderBy: { startedAt: 'desc' },
    take: 30,
    select: { id: true, status: true, startedAt: true, endedAt: true, summary: true },
  });
  return res.json({
    domainId: domain.id,
    runs: runs.map((r) => ({
      id: r.id,
      status: r.status,
      startedAt: r.startedAt,
      endedAt: r.endedAt,
      visibilityScore: typeof (r.summary as Record<string, unknown> | null)?.presenceRate === 'number'
        ? Math.round(((r.summary as Record<string, unknown>).presenceRate as number) * 100)
        : null,
      totalQueries: ((r.summary as Record<string, unknown> | null)?.totalQueries as number | undefined) ?? null,
    })),
  });
});

// ── GET /domain/:id/trends  (real per-run rollups for the dashboard charts) ──
//
// Fuels the three trend charts (Citations / Mentions rate / Share of Voice).
// Every completed AiRun for this domain becomes one data point on the X axis,
// ordered ascending by startedAt. The frontend was previously rendering
// hardcoded mock arrays — this endpoint replaces them with real numbers
// computed from AiQueryResult rows.
//
// Returns:
//   {
//     runs: [{
//       runId, startedAt, endedAt,
//       perModel:    { 'openai/gpt-4o-mini': { cites, presenceCount } },
//       brandMentions, competitorMentions,           // for Mentions chart
//       perCompetitor: { 'shopify.com': 8, ... },    // for SoV chart
//     }],
//     topCompetitors: ['shopify.com', ...],          // top 4 by latest-run frequency
//   }
router.get('/domain/:id/trends', authenticateToken, async (req: Request, res: Response) => {
  const got = await ensureDomain(req, req.params.id);
  if (!got.ok) return res.status(got.status).json({ error: got.error });
  const { domain } = got;

  const daysParam = typeof req.query.days === 'string' ? Number(req.query.days) : NaN;
  const useWindow = Number.isFinite(daysParam) && daysParam > 0;

  const toUtcDayKey = (date: Date) => date.toISOString().slice(0, 10);
  const startOfUtcDay = (date: Date) => {
    const copy = new Date(date);
    copy.setUTCHours(0, 0, 0, 0);
    return copy;
  };
  const addUtcDays = (date: Date, days: number) => {
    const copy = new Date(date);
    copy.setUTCDate(copy.getUTCDate() + days);
    return copy;
  };

  type TrendRunBucket = {
    runId: number;
    startedAt: Date;
    endedAt: Date | null;
    perModel: Record<string, { cites: number; presenceCount: number }>;
    brandMentions: number;
    competitorMentions: number;
    totalResponses: number;
    totalCitations: number;
    perCompetitor: Record<string, number>;
    perCompetitorCitations: Record<string, number>;
  };
  type TrendDayBucket = TrendRunBucket & {
    date: string;
    label: string;
    runCount: number;
  };

  const selectResults = {
    runId: true,
    model: true,
    status: true,
    response: true,
    presence: true,
    relevance: true,
    overall: true,
    scorerSummary: true,
    citations: true,
    competitorHosts: true,
    competitorMentions: true,
  } as const;

  const buildBucket = (runId: number, startedAt: Date, endedAt: Date | null, date?: string): TrendDayBucket | TrendRunBucket => {
    const base = {
      runId,
      startedAt,
      endedAt,
      perModel: {},
      brandMentions: 0,
      competitorMentions: 0,
      totalResponses: 0,
      totalCitations: 0,
      perCompetitor: {},
      perCompetitorCitations: {},
    };
    return date
      ? {
          ...base,
          date,
          label: new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
          runCount: 0,
        }
      : base;
  };

  const isTrendRowFailed = (row: {
    status?: string | null;
    response?: string | null;
    presence: number;
    relevance?: number | null;
    overall?: number | null;
    scorerSummary?: string | null;
    citations: unknown;
    competitorHosts: unknown;
    competitorMentions: unknown;
  }) => {
    const hasResponse = typeof row.response === 'string' && row.response.trim().length > 0;
    const hasEvidence =
      asArray(row.citations).length > 0 ||
      asArray(row.competitorHosts).length > 0 ||
      asArray(row.competitorMentions).length > 0 ||
      (typeof row.scorerSummary === 'string' && row.scorerSummary.trim().length > 0);
    return (
      row.status === 'failed' ||
      (!hasResponse && !hasEvidence && row.presence === 0 && Number(row.overall ?? 0) === 0 && Number(row.relevance ?? 0) <= 1)
    );
  };

  const accumulateResult = (
    bucket: TrendRunBucket | TrendDayBucket,
    row: {
      model: string;
      status?: string | null;
      response?: string | null;
      presence: number;
      relevance?: number | null;
      overall?: number | null;
      scorerSummary?: string | null;
      citations: unknown;
      competitorHosts: unknown;
      competitorMentions: unknown;
    },
    ownHost: string,
  ) => {
    if (isTrendRowFailed(row)) return;

    bucket.totalResponses += 1;
    if (!bucket.perModel[row.model]) bucket.perModel[row.model] = { cites: 0, presenceCount: 0 };
    bucket.perModel[row.model].presenceCount += row.presence;

    const citations = Array.isArray(row.citations) ? row.citations : [];
    bucket.perModel[row.model].cites += citations.length;
    bucket.totalCitations += citations.length;

    bucket.brandMentions += row.presence;

    const compMentions = Array.isArray(row.competitorMentions) ? (row.competitorMentions as Array<{ host?: string; count?: number }>) : [];
    const compHosts = Array.isArray(row.competitorHosts) ? (row.competitorHosts as string[]) : [];
    if (compMentions.length > 0) {
      for (const mention of compMentions) {
        const host = normalizeMetricHost(mention.host);
        if (!host || host === ownHost) continue;
        const count = Number.isFinite(mention.count) && typeof mention.count === 'number' ? mention.count : 1;
        bucket.competitorMentions += count;
        bucket.perCompetitor[host] = (bucket.perCompetitor[host] ?? 0) + count;
      }
    } else {
      for (const hostRaw of compHosts) {
        const host = normalizeMetricHost(hostRaw);
        if (!host || host === ownHost) continue;
        bucket.competitorMentions += 1;
        bucket.perCompetitor[host] = (bucket.perCompetitor[host] ?? 0) + 1;
      }
    }

    for (const citation of citations as Array<{ host?: string }>) {
      const host = normalizeMetricHost(citation.host);
      if (!host || host === ownHost) continue;
      bucket.perCompetitorCitations[host] = (bucket.perCompetitorCitations[host] ?? 0) + 1;
    }
  };

  // Optional `?days=7` window mode powers the competitor trend charts.
  // Without it, we preserve the existing run-based payload used by the
  // report preview and older dashboard surfaces.
  if (useWindow) {
    const windowDays = Math.max(1, Math.floor(daysParam));
    const windowEnd = startOfUtcDay(addUtcDays(new Date(), 1));
    const windowStart = addUtcDays(windowEnd, -windowDays);

    const runs = await prisma.aiRun.findMany({
      where: {
        domainId: domain.id,
        status: 'completed',
        ...runKindFilter(req),
        startedAt: { gte: windowStart, lt: windowEnd },
      },
      orderBy: { startedAt: 'asc' },
      select: { id: true, startedAt: true, endedAt: true },
    });

    const dayBuckets = new Map<string, TrendDayBucket>();
    for (let i = 0; i < windowDays; i++) {
      const day = startOfUtcDay(addUtcDays(windowStart, i));
      const date = toUtcDayKey(day);
      dayBuckets.set(
        date,
        {
          ...(buildBucket(-1, day, null, date) as TrendDayBucket),
          runId: -1,
          startedAt: day,
          endedAt: null,
          runCount: 0,
        }
      );
    }

    if (runs.length === 0) {
      return res.json({
        windowDays,
        windowStart: windowStart.toISOString(),
        windowEnd: windowEnd.toISOString(),
        runs: [],
        days: [...dayBuckets.values()],
        topCompetitors: [],
      });
    }

    const runBuckets = new Map<number, TrendRunBucket>();
    for (const run of runs) {
      runBuckets.set(run.id, buildBucket(run.id, run.startedAt, run.endedAt) as TrendRunBucket);
      const dayKey = toUtcDayKey(run.startedAt);
      const dayBucket = dayBuckets.get(dayKey);
      if (dayBucket) dayBucket.runCount += 1;
    }

    const runIds = runs.map((r) => r.id);
    const allResults = await prisma.aiQueryResult.findMany({
      where: { runId: { in: runIds } },
      select: selectResults,
    });

    const competitorTotals = new Map<string, { mentions: number; citations: number }>();
    for (const row of allResults) {
      const runBucket = runBuckets.get(row.runId);
      if (!runBucket) continue;
      const dayKey = toUtcDayKey(runBucket.startedAt);
      const dayBucket = dayBuckets.get(dayKey);
      if (!dayBucket) continue;

      accumulateResult(runBucket, row, normalizeMetricHost(domain.host));
      accumulateResult(dayBucket, row, normalizeMetricHost(domain.host));
      if (isTrendRowFailed(row)) continue;

      const compMentions = Array.isArray(row.competitorMentions)
        ? (row.competitorMentions as Array<{ host?: string; count?: number }>)
        : [];
      if (compMentions.length > 0) {
        for (const mention of compMentions) {
          const host = normalizeMetricHost(mention.host);
          if (!host || host === normalizeMetricHost(domain.host)) continue;
          const count = Number.isFinite(mention.count) && typeof mention.count === 'number' ? mention.count : 1;
          const total = competitorTotals.get(host) ?? { mentions: 0, citations: 0 };
          total.mentions += count;
          competitorTotals.set(host, total);
        }
      } else {
        const compHosts = Array.isArray(row.competitorHosts) ? (row.competitorHosts as string[]) : [];
        for (const hostRaw of compHosts) {
          const host = normalizeMetricHost(hostRaw);
          if (!host || host === normalizeMetricHost(domain.host)) continue;
          const total = competitorTotals.get(host) ?? { mentions: 0, citations: 0 };
          total.mentions += 1;
          competitorTotals.set(host, total);
        }
      }
      for (const citation of Array.isArray(row.citations) ? (row.citations as Array<{ host?: string }>) : []) {
        const host = normalizeMetricHost(citation.host);
        if (!host || host === normalizeMetricHost(domain.host)) continue;
        const total = competitorTotals.get(host) ?? { mentions: 0, citations: 0 };
        total.citations += 1;
        competitorTotals.set(host, total);
      }
    }

    const topCompetitors = [...competitorTotals.entries()]
      .filter(([, totals]) => totals.mentions + totals.citations > 0)
      .sort((a, b) => {
        const scoreA = a[1].mentions + a[1].citations;
        const scoreB = b[1].mentions + b[1].citations;
        return scoreB - scoreA || b[1].mentions - a[1].mentions || b[1].citations - a[1].citations;
      })
      .slice(0, 4)
      .map(([host]) => host);

    return res.json({
      windowDays,
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
      runs: [...runBuckets.values()].map((b) => ({
        runId: b.runId,
        startedAt: b.startedAt,
        endedAt: b.endedAt,
        perModel: b.perModel,
        brandMentions: b.brandMentions,
        competitorMentions: b.competitorMentions,
        totalResponses: b.totalResponses,
        totalCitations: b.totalCitations,
        perCompetitor: b.perCompetitor,
        perCompetitorCitations: b.perCompetitorCitations,
      })),
      days: [...dayBuckets.values()].map((b) => ({
        date: b.date,
        label: b.label,
        runCount: b.runCount,
        startedAt: b.startedAt,
        endedAt: b.endedAt,
        perModel: b.perModel,
        brandMentions: b.brandMentions,
        competitorMentions: b.competitorMentions,
        totalResponses: b.totalResponses,
        totalCitations: b.totalCitations,
        perCompetitor: b.perCompetitor,
        perCompetitorCitations: b.perCompetitorCitations,
      })),
      topCompetitors,
    });
  }

  // Latest 12 completed runs gives a compact tracked-run history without
  // overflowing the chart card. Ordered ascending so the chart reads L→R.
  const runs = await prisma.aiRun.findMany({
    where: { domainId: domain.id, status: 'completed', ...runKindFilter(req) },
    orderBy: { startedAt: 'asc' },
    take: 12,
    select: { id: true, startedAt: true, endedAt: true },
  });
  if (runs.length === 0) {
    return res.json({ runs: [], topCompetitors: [] });
  }

  const runIds = runs.map((r) => r.id);
  // Pull only the fields needed to roll up — keeps the payload tight even
  // when a run has hundreds of (prompt × model) results.
  const allResults = await prisma.aiQueryResult.findMany({
    where: { runId: { in: runIds } },
    select: selectResults,
  });

  type Bucket = {
    runId: number;
    startedAt: Date;
    endedAt: Date | null;
    perModel: Record<string, { cites: number; presenceCount: number }>;
    brandMentions: number;
    competitorMentions: number;
    totalResponses: number;
    totalCitations: number;
    perCompetitor: Record<string, number>;
    perCompetitorCitations: Record<string, number>;
  };
  const byRun = new Map<number, Bucket>();
  for (const r of runs) {
    byRun.set(r.id, {
      runId: r.id,
      startedAt: r.startedAt,
      endedAt: r.endedAt,
      perModel: {},
      brandMentions: 0,
      competitorMentions: 0,
      totalResponses: 0,
      totalCitations: 0,
      perCompetitor: {},
      perCompetitorCitations: {},
    });
  }

  // Single pass over results — bump the right bucket for each row.
  for (const row of allResults) {
    const b = byRun.get(row.runId);
    if (!b) continue;
    accumulateResult(b, row, normalizeMetricHost(domain.host));
  }

  // Top competitors = the 4 most-frequently-mentioned hosts in the LATEST
  // run, so the SoV chart legend reflects who actually competes today (not
  // who was relevant 6 audits ago). Falls back to whichever runs had data.
  const latestBucket = [...byRun.values()]
    .reverse()
    .find((b) => Object.keys(b.perCompetitor).length > 0 || Object.keys(b.perCompetitorCitations).length > 0);
  const topCompetitors = latestBucket
    ? Array.from(new Set([
        ...Object.keys(latestBucket.perCompetitor),
        ...Object.keys(latestBucket.perCompetitorCitations),
      ]))
        .map((host) => ({
          host,
          mentions: latestBucket.perCompetitor[host] ?? 0,
          citations: latestBucket.perCompetitorCitations[host] ?? 0,
        }))
        .sort((a, b) => (b.mentions + b.citations) - (a.mentions + a.citations) || b.mentions - a.mentions || b.citations - a.citations)
        .slice(0, 4)
        .map(({ host }) => host)
    : [];

  return res.json({
    runs: [...byRun.values()].map((b) => ({
      runId: b.runId,
      startedAt: b.startedAt,
      endedAt: b.endedAt,
      perModel: b.perModel,
      brandMentions: b.brandMentions,
      competitorMentions: b.competitorMentions,
      totalResponses: b.totalResponses,
      totalCitations: b.totalCitations,
      perCompetitor: b.perCompetitor,
      perCompetitorCitations: b.perCompetitorCitations,
    })),
    topCompetitors,
  });
});

// ── POST /domain/:id/restart  (Re-audit + Pick prompts again from dashboard) ──
//
// Three modes:
//   from='crawl'       — wipe everything downstream of the URL/profile
//                        (crawl, competitors, topics, prompts, runs) and
//                        reset phases so the wizard runs fresh from Step 2.
//   from='competitors' — keep crawl/profile, but wipe competitors + topics
//                        + prompts + runs so the user restarts at Step 3.
//   from='topics'      — keep crawl, competitors, and prompt inventory; clear
//                        prompt selection state so the user can re-pick prompts.
//
// User-supplied competitors/custom prompts are preserved on a 'topics'
// restart; generated prompt rows are also preserved so historical reports,
// the Prompt Inventory, and already-ran badges do not disappear.
// ── POST /domain/:id/resync-context ──────────────────────────────────────
//
// Re-runs the LLM context synthesis from the latest CrawlSnapshot's raw text
// + schema, without re-crawling. Lets the dashboard's "Refresh" button
// regenerate the 8-section Domain Info summary for domains crawled before
// the synthesis prompt was upgraded — without forcing the user back through
// the wizard.
router.post('/domain/:id/resync-context', authenticateToken, async (req: Request, res: Response) => {
  const got = await ensureDomain(req, req.params.id);
  if (!got.ok) return res.status(got.status).json({ error: got.error });
  const { domain } = got;

  const latest = await prisma.crawlSnapshot.findFirst({
    where: { domainId: domain.id },
    orderBy: { createdAt: 'desc' },
  });
  if (!latest) return res.status(400).json({ error: 'No crawl snapshot available — run the wizard first.' });

  const rawText = (latest.contextJson as { rawText?: string })?.rawText
    ?? (latest as unknown as { rawText?: string }).rawText
    ?? '';
  const schemaJson = Array.isArray((latest.contextJson as { schemaOrg?: unknown[] })?.schemaOrg)
    ? ((latest.contextJson as { schemaOrg?: unknown[] }).schemaOrg as unknown[])
    : [];

  if (!rawText.trim()) {
    return res.status(400).json({ error: 'Latest crawl has no text — re-crawl the domain first.' });
  }

  const synthesized = await synthesizeContext(rawText, schemaJson);
  if (!synthesized) return res.status(502).json({ error: 'LLM synthesis failed — try again shortly.' });

  await prisma.crawlSnapshot.update({
    where: { id: latest.id },
    data: { contextJson: synthesized.context as unknown as Prisma.InputJsonValue },
  });
  await prisma.domainInferred.upsert({
    where: { domainId: domain.id },
    update: {
      companyName: synthesized.context.companyName,
      productsJson: synthesized.context.products as unknown as Prisma.InputJsonValue,
      schemaOrgJson: synthesized.context.schemaOrg as unknown as Prisma.InputJsonValue,
      summary: synthesized.context.summary,
      inferredAt: new Date(),
    },
    create: {
      domainId: domain.id,
      companyName: synthesized.context.companyName,
      productsJson: synthesized.context.products as unknown as Prisma.InputJsonValue,
      schemaOrgJson: synthesized.context.schemaOrg as unknown as Prisma.InputJsonValue,
      summary: synthesized.context.summary,
    },
  });

  return res.json({
    ok: true,
    summary: synthesized.context.summary,
    companyName: synthesized.context.companyName,
  });
});

router.post('/domain/:id/restart', authenticateToken, async (req: Request, res: Response) => {
  const got = await ensureDomain(req, req.params.id);
  if (!got.ok) return res.status(got.status).json({ error: got.error });
  const { domain } = got;
  const from = ((req.body ?? {}) as { from?: string }).from;
  if (from !== 'crawl' && from !== 'competitors' && from !== 'topics') {
    return res.status(400).json({ error: "from must be 'crawl', 'competitors', or 'topics'" });
  }

  if (from === 'crawl' || from === 'competitors') {
    // Hard reset — keep Domain + DomainProfile, wipe everything generated.
    // 'competitors' keeps the crawl snapshot intact, but otherwise clears
    // the wizard back to a fresh competitor-selection restart.
    const destructiveOps = [
      prisma.aiQueryResult.deleteMany({ where: { run: { domainId: domain.id } } }),
      prisma.aiRun.deleteMany({ where: { domainId: domain.id } }),
      prisma.prompt.deleteMany({ where: { domainId: domain.id } }),
      prisma.keyword.deleteMany({ where: { domainId: domain.id } }),
      prisma.competitor.deleteMany({ where: { domainId: domain.id } }),
      ...(from === 'crawl' ? [prisma.crawlSnapshot.deleteMany({ where: { domainId: domain.id } })] : []),
    ];
    await prisma.$transaction([
      ...destructiveOps,
      // Reset wizard phases to the appropriate resume point.
      prisma.wizardState.upsert({
        where: { domainId: domain.id },
        update: {
          phases:
            from === 'crawl'
              ? ({} as any)
              : ({ crawl: 'completed', profile: 'completed' } as any),
          selectionDraft: { set: undefined } as any,
        },
        create: {
          domainId: domain.id,
          phases: from === 'crawl' ? ({} as any) : ({ crawl: 'completed', profile: 'completed' } as any),
        },
      }),
    ]);
  } else {
    // Soft reset: preserve prompt inventory and historical AiQueryResult rows.
    // We only clear generated prompt selections so the next Step 4 visit loads
    // the saved inventory and lets the user pick a fresh audit set.
    await prisma.$transaction([
      prisma.keyword.updateMany({ where: { domainId: domain.id, source: 'ai' }, data: { isSelected: false } }),
      prisma.prompt.updateMany({ where: { domainId: domain.id, source: 'ai' }, data: { isSelected: false } }),
      // Drop topics/select/run phases; keep crawl + profile + competitors.
      prisma.wizardState.upsert({
        where: { domainId: domain.id },
        update: { selectionDraft: { set: undefined } as any },
        create: { domainId: domain.id, phases: {} as any },
      }),
    ]);
    const existing = await prisma.wizardState.findUnique({ where: { domainId: domain.id } });
    const phases = (existing?.phases as Record<string, string> | undefined) ?? {};
    delete phases.topics;
    delete phases.select;
    delete phases.run;
    await prisma.wizardState.update({
      where: { domainId: domain.id },
      data: { phases: phases as any },
    });
  }

  return res.json({ domainId: domain.id, restartedFrom: from });
});

// ── GET /domain/:id/competitors ────────────────────────────────────────────
//
// Cheap read of the currently-selected competitors. Used by the AI Checker
// "Competitors" page to populate the selector pills without triggering a
// fresh discovery pipeline (which is the POST sibling below).

router.get('/domain/:id/competitors', authenticateToken, async (req: Request, res: Response) => {
  const got = await ensureDomain(req, req.params.id);
  if (!got.ok) return res.status(got.status).json({ error: got.error });
  const { domain } = got;

  const rows = await prisma.competitor.findMany({
    where: { domainId: domain.id, isSelected: true },
    orderBy: [{ rank: 'asc' }, { similarityScore: 'desc' }, { id: 'asc' }],
  });

  return res.json({
    domainId: domain.id,
    competitors: rows.map((c) => ({
      host: c.competitorHost,
      url: `https://${c.competitorHost}`,
      logoUrl: `https://img.logo.dev/${c.competitorHost}?token=pk_DTdFFG1JT9WOCjATvZEzIA&size=64`,
      rank: c.rank,
      threatLevel: c.threatLevel,
      similarityScore: c.similarityScore,
      reasoning: c.reasoning,
      industry: c.industry,
      location: c.location,
      companySize: c.companySize,
      source: c.source,
    })),
  });
});

// ── GET /domain/:id/competitor-analysis ────────────────────────────────────
//
// Competitor-centric rollup powering the AI Checker "Competitors" page.
// Aggregates AiQueryResult.competitorMentions / citations into per-host
// metrics (mentions, market share, sentiment, prompt coverage, source mix)
// and joins the Competitor table for rank/threat/reasoning metadata.
// LLM-derived Strength / Weakness / Competitive-Edge insights are enriched
// once per AiRun and cached on AiRun.summary.competitorInsights.

router.get('/domain/:id/competitor-analysis', timed('GET /competitor-analysis', 1500), authenticateToken, async (req: Request, res: Response) => {
  const got = await ensureDomain(req, req.params.id);
  if (!got.ok) return res.status(got.status).json({ error: got.error });
  const { domain } = got;

  const runIdParam = typeof req.query.runId === 'string' ? Number(req.query.runId) : NaN;
  const useSpecificRun = Number.isFinite(runIdParam) && runIdParam > 0;

  const [latestRun, selectedCompetitors, prompts, keywords] = await Promise.all([
    useSpecificRun
      ? prisma.aiRun.findFirst({ where: { id: runIdParam, domainId: domain.id, status: 'completed' } })
      // Scope to kind='audit' (via runKindFilter) so the same single-prompt
      // tracked recurring runs that /report and /trends exclude can't
      // become the "latest run" here either. Without this filter a 1-prompt
      // re-test would define the competitor analysis and the page would read
      // "No competitors mentioned in this audit yet."
      : prisma.aiRun.findFirst({ where: { domainId: domain.id, status: 'completed', ...runKindFilter(req) }, orderBy: { startedAt: 'desc' } }),
    prisma.competitor.findMany({
      where: { domainId: domain.id, isSelected: true },
      orderBy: [{ rank: 'asc' }, { similarityScore: 'desc' }],
    }),
    prisma.prompt.findMany({ where: { domainId: domain.id, isSelected: true } }),
    prisma.keyword.findMany({ where: { domainId: domain.id } }),
  ]);

  if (!latestRun) {
    return res.json({
      runId: null,
      runStartedAt: null,
      competitors: selectedCompetitors.map((c) => emptyCompetitorRow(c)),
      ownBrand: { host: domain.host, mentions: 0, marketShare: 0, avgSentiment: null },
      totals: { prompts: 0, results: 0, competitorMentions: 0 },
    });
  }

  const allResults = await prisma.aiQueryResult.findMany({
    where: { runId: latestRun.id },
    select: {
      id: true,
      promptId: true,
      model: true,
      presence: true,
      overall: true,
      sentiment: true,
      rankPosition: true,
      competitorMentions: true,
      competitorHosts: true,
      citations: true,
    },
  });

  const analytics = computeCompetitorAnalysis({
    ownDomainHost: domain.host,
    ownBrandName: domain.inferred?.companyName ?? null,
    selectedCompetitorHosts: selectedCompetitors.map((c) => c.competitorHost),
    keywords: keywords.map((k) => ({ id: k.id, term: k.term, intent: k.intent })),
    prompts: prompts.map((p) => ({
      id: p.id,
      text: p.text,
      intent: p.intent,
      keywordId: p.keywordId,
      category: p.category,
      intentStage: p.intentStage,
      persona: p.persona,
      useCase: p.useCase,
      isBranded: p.isBranded,
      competitorMentioned: p.competitorMentioned,
    })),
    results: allResults,
  });

  // Join Competitor-table metadata onto the analytics rows.
  const metaByHost = new Map(selectedCompetitors.map((c) => [c.competitorHost.toLowerCase(), c]));
  const hydrated = analytics.competitors.map((row) => {
    const meta = metaByHost.get(row.host);
    if (!meta) return row;
    return {
      ...row,
      rank: meta.rank,
      threatLevel: (meta.threatLevel as 'High' | 'Medium' | 'Low' | null) ?? null,
      similarityScore: meta.similarityScore,
      reasoning: meta.reasoning,
      industry: meta.industry,
      companySize: meta.companySize,
    };
  });

  // ── LLM enrichment with per-AiRun cache (mirrors opportunities pattern). ──
  const summary = (latestRun.summary as Record<string, unknown> | null) ?? null;
  const cached = (summary?.competitorInsights as Record<string, CompetitorInsight[]> | undefined) ?? null;
  const cachedKeys = (summary?.competitorInsightsKeys as string[] | undefined) ?? null;
  const currentKeys = hydrated.map((c) => c.host).sort();
  const cacheValid =
    cached &&
    cachedKeys &&
    cachedKeys.length === currentKeys.length &&
    cachedKeys.every((k, i) => k === currentKeys[i]);

  let insightsByHost: Record<string, CompetitorInsight[]>;
  if (cacheValid) {
    insightsByHost = cached;
  } else {
    const promptsById = new Map(prompts.map((p) => [p.id, { text: p.text, category: p.category }]));
    insightsByHost = await enrichCompetitorInsights(hydrated, {
      brandName: domain.inferred?.companyName ?? domain.host,
      brandHost: domain.host,
      industry: domain.profile?.industry ?? null,
      promptsById,
    });
    const existingSummary = (summary as Record<string, unknown> | null) ?? {};
    const updatedSummary = {
      ...existingSummary,
      competitorInsights: insightsByHost,
      competitorInsightsKeys: currentKeys,
      competitorInsightsAt: new Date().toISOString(),
    };
    prisma.aiRun
      .update({ where: { id: latestRun.id }, data: { summary: updatedSummary as any } })
      .catch((err) => console.warn('[competitor-insights] cache write failed', err));
  }

  const competitorsWithInsights = hydrated.map((c) => ({
    ...c,
    insights: insightsByHost[c.host] ?? [],
  }));

  return res.json({
    runId: latestRun.id,
    runStartedAt: latestRun.startedAt,
    competitors: competitorsWithInsights,
    ownBrand: analytics.ownBrand,
    totals: analytics.totals,
  });
});

function emptyCompetitorRow(c: { competitorHost: string; rank: number | null; threatLevel: string | null; similarityScore: number | null; reasoning: string | null; industry: string | null; companySize: string | null }) {
  return {
    host: c.competitorHost,
    rank: c.rank,
    threatLevel: (c.threatLevel as 'High' | 'Medium' | 'Low' | null) ?? null,
    similarityScore: c.similarityScore,
    reasoning: c.reasoning,
    industry: c.industry,
    companySize: c.companySize,
    estimatedTraffic: 0,
    mentions: 0,
    promptCoverage: 0,
    coveragePct: 0,
    avgSentiment: null as number | null,
    avgRankPosition: null as number | null,
    marketShare: 0,
    strongestPromptCluster: null,
    topCitedSourceTypes: [],
    examplePromptIds: [],
    insights: [],
  };
}

// ── POST /domain/:id/competitors ───────────────────────────────────────────

router.post('/domain/:id/competitors', timed('POST /competitors', 5000), authenticateOrSession(), async (req: Request, res: Response) => {
  const got = await ensureDomain(req, req.params.id);
  if (!got.ok) return res.status(got.status).json({ error: got.error });
  const { domain } = got;
  await setPhase(prisma, domain.id, 'competitors', 'running');
  const warmup = competitorWarmups.get(domain.id);
  if (warmup) await warmup.catch(() => undefined);
  const existingRows = await prisma.competitor.findMany({
    where: { domainId: domain.id },
    orderBy: { rank: 'asc' },
  });
  if (existingRows.length > 0) {
    return res.json({
      domainId: domain.id,
      competitors: formatCompetitorRows(existingRows as any),
      stats: { discovered: existingRows.length, verified: 0, ranked: existingRows.length },
    });
  }
  try {
    const seedKw = await prisma.keyword.findMany({ where: { domainId: domain.id }, select: { term: true }, take: 30 });
    const result = await runCompetitorPipeline({
      prisma,
      domainId: domain.id,
      ownDomainHost: domain.host,
      ownDomainSummary: domain.inferred?.summary ?? '',
      ownEmbedding: (domain.inferred?.embedding as number[] | null) ?? null,
      // seedKeywords is empty on first run (Step 4 hasn't fired yet); the
      // LLM-context proposer doesn't need them — it works straight off the
      // domain context.
      ownSeedKeywords: seedKw.map((k) => k.term),
      ownLocation: { country: domain.profile?.country ?? null, state: domain.profile?.state ?? null },
      ownSize: (domain.inferred?.companySize as any) ?? null,
      industry: domain.profile?.industry ?? null,
      // Inferred context that feeds the LLM-based candidate proposer.
      companyName: domain.inferred?.companyName ?? null,
      products: Array.isArray(domain.inferred?.productsJson)
        ? (domain.inferred?.productsJson as string[])
        : [],
    });
    await persistCompetitors(prisma, domain.id, result);
    // Pipeline finished, but the user hasn't confirmed which competitors to
    // track yet. Keep the phase as 'running' so the wizard's resume logic
    // doesn't skip Step 3. The phase flips to 'completed' only when the
    // user clicks Continue (POST /competitors/select below).
    // Shape the response so it works with both the new wizard inline UI
    // (which expects name/domain/url/logoUrl) and the modal view (which
    // reads competitorHost / similarityScore directly).
    const enriched = result.ranked.map((c) => ({
      // legacy-compatible fields
      name: c.competitorHost,
      domain: c.competitorHost,
      url: `https://${c.competitorHost}`,
      logoUrl: `https://img.logo.dev/${c.competitorHost}?token=pk_DTdFFG1JT9WOCjATvZEzIA&size=64`,
      // new pipeline fields
      competitorHost: c.competitorHost,
      similarityScore: c.similarityScore,
      threatLevel: c.threatLevel,
      rank: c.rank,
      reasoning: c.reasoning,
      industry: c.industry,
      location: c.location,
      companySize: c.companySize,
      source: c.source,
    }));
    return res.json({
      domainId: domain.id,
      competitors: enriched,
      stats: { discovered: result.candidates.length, verified: result.verified.length, ranked: enriched.length },
    });
  } catch (err) {
    await setPhase(prisma, domain.id, 'competitors', 'failed');
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Competitor pipeline failed' });
  }
});

// ── POST /domain/:id/competitors/select ────────────────────────────────────

router.post('/domain/:id/competitors/select', authenticateOrSession(), async (req: Request, res: Response) => {
  const got = await ensureDomain(req, req.params.id);
  if (!got.ok) return res.status(got.status).json({ error: got.error });
  const { domain } = got;
  // Accept either `hosts: string[]` (new shape) or `urls: string[]` (legacy
  // wizard UI). Both get normalized to bare hosts before the DB write.
  const body = (req.body ?? {}) as { hosts?: string[]; urls?: string[] };
  const raw = Array.isArray(body.hosts) ? body.hosts : Array.isArray(body.urls) ? body.urls : null;
  if (!raw) return res.status(400).json({ error: 'hosts or urls must be an array' });
  const cleaned = Array.from(new Set(raw.map((h) => extractHost(h) ?? '').filter(Boolean)));
  await prisma.$transaction([
    prisma.competitor.updateMany({ where: { domainId: domain.id }, data: { isSelected: false } }),
    prisma.competitor.updateMany({ where: { domainId: domain.id, competitorHost: { in: cleaned } }, data: { isSelected: true } }),
  ]);
  // The user has confirmed their picks — now the competitors phase can be
  // marked complete. Until this fires, the wizard treats Step 3 as still
  // in-progress and resumes the user back to it on refresh.
  await setPhase(prisma, domain.id, 'competitors', 'completed');
  return res.json({ domainId: domain.id, selectedHosts: cleaned });
});

// ── POST /domain/:id/competitors/add ───────────────────────────────────────
//
// Inline "Add competitor" from the AI Checker Competitors page.
//
//   1. Upserts the Competitor row (isSelected=true, source='manual' for new
//      rows; preserves existing source for already-known rows so the next
//      pipeline run doesn't demote them).
//   2. Re-scores every AiQueryResult from the latest completed AiRun against
//      this single new competitor — reusing the saved response text, so we
//      don't pay for fresh ChatGPT/Claude/Gemini calls. Only the cheap
//      scorer LLM (gpt-4o-mini) runs.
//   3. Merges the new mentions back into each row's competitorMentions JSON
//      and adds the host to competitorHosts.
//   4. Invalidates the per-AiRun competitorInsights cache so the next
//      /competitor-analysis call re-enriches with the new competitor in the
//      mix.
//
// Cost: ~$0.0001 per AiQueryResult row. p95 ≈ 10s for a 90-row run with
// concurrency of 6.

router.post('/domain/:id/competitors/add', timed('POST /competitors/add', 5000), authenticateToken, async (req: Request, res: Response) => {
  const got = await ensureDomain(req, req.params.id);
  if (!got.ok) return res.status(got.status).json({ error: got.error });
  const { domain } = got;

  const rawHost = typeof (req.body ?? {}).host === 'string' ? (req.body as { host: string }).host : '';
  const newHost = extractHost(rawHost);
  if (!newHost) return res.status(400).json({ error: 'host must be a valid domain' });

  // ── 1. Upsert the Competitor row ──────────────────────────────────────
  const existing = await prisma.competitor.findUnique({
    where: { domainId_competitorHost: { domainId: domain.id, competitorHost: newHost } },
  });
  if (existing) {
    if (!existing.isSelected) {
      await prisma.competitor.update({ where: { id: existing.id }, data: { isSelected: true } });
    }
  } else {
    await prisma.competitor.create({
      data: {
        domainId: domain.id,
        competitorHost: newHost,
        source: 'manual',
        isSelected: true,
        verified: false,
        rawSignals: { sources: ['manual'] } as any,
      },
    });
  }

  // ── 2. Find the latest completed run ──────────────────────────────────
  const latestRun = await prisma.aiRun.findFirst({
    where: { domainId: domain.id, status: 'completed' },
    orderBy: { startedAt: 'desc' },
  });
  if (!latestRun) {
    return res.json({ host: newHost, scoredRows: 0, totalRows: 0, skipped: 'no-run' });
  }

  // ── 3. Load rows + prompt text for scoring ─────────────────────────────
  const allResults = await prisma.aiQueryResult.findMany({
    where: { runId: latestRun.id },
    select: {
      id: true,
      promptId: true,
      model: true,
      response: true,
      competitorMentions: true,
      competitorHosts: true,
    },
  });
  const scoreable = allResults.filter((r) => typeof r.response === 'string' && r.response.trim().length > 0);

  const promptIds = Array.from(new Set(scoreable.map((r) => r.promptId)));
  const prompts = await prisma.prompt.findMany({
    where: { id: { in: promptIds } },
    select: { id: true, text: true },
  });
  const promptText = new Map(prompts.map((p) => [p.id, p.text]));

  const brandName = domain.inferred?.companyName ?? domain.host;
  const brandFacts = domain.inferred?.summary ?? '';

  // ── 4. Concurrent batched re-scoring against ONLY the new competitor ──
  const CONCURRENCY = 6;
  let scoredRows = 0;
  for (let i = 0; i < scoreable.length; i += CONCURRENCY) {
    const batch = scoreable.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async (row) => {
      const text = promptText.get(row.promptId);
      if (!text) return;
      const result = await llmScoreResponse({
        prompt: text,
        response: row.response as string,
        brand: { name: brandName, aliases: [], host: domain.host },
        competitors: [{ name: newHost, host: newHost }],
        brandFacts,
      }).catch(() => null);
      if (!result) return;

      // Filter the result to mentions for the new host (LLM may also surface
      // others it "spots in the response" — we discard those here so we don't
      // pollute the row with un-tracked competitors).
      const matched = (result.competitorMentions ?? []).filter((m) => {
        const h = (m.host ?? m.name ?? '').toLowerCase();
        return h === newHost || h.endsWith(`.${newHost}`);
      });
      if (matched.length === 0) {
        // Even with no mention, ensure the row's competitorHosts array
        // doesn't need an update — short-circuit.
        return;
      }

      const newMention = {
        host: newHost,
        count: matched.reduce((s, m) => s + (m.mentionCount ?? 1), 0),
        sentiment: matched.find((m) => typeof m.sentiment === 'number')?.sentiment ?? null,
        rankPosition: matched.find((m) => typeof m.rankPosition === 'number')?.rankPosition ?? null,
      };

      const existingMentions = Array.isArray(row.competitorMentions) ? (row.competitorMentions as Array<{ host?: string }>) : [];
      const mergedMentions = [
        ...existingMentions.filter((m) => (m.host ?? '').toLowerCase() !== newHost),
        newMention,
      ];
      const existingHosts = Array.isArray(row.competitorHosts) ? (row.competitorHosts as string[]) : [];
      const mergedHosts = existingHosts.includes(newHost) ? existingHosts : [...existingHosts, newHost];

      await prisma.aiQueryResult.update({
        where: { id: row.id },
        data: {
          competitorMentions: mergedMentions as any,
          competitorHosts: mergedHosts as any,
        },
      });
      scoredRows += 1;
    }));
  }

  // ── 5. Invalidate the per-run insight cache ───────────────────────────
  const summary = (latestRun.summary as Record<string, unknown> | null) ?? null;
  if (summary && ('competitorInsights' in summary || 'competitorInsightsKeys' in summary)) {
    const { competitorInsights: _ci, competitorInsightsKeys: _ck, competitorInsightsAt: _ca, ...rest } = summary as any;
    await prisma.aiRun.update({
      where: { id: latestRun.id },
      data: { summary: rest as any },
    }).catch((err) => console.warn('[competitors/add] cache invalidation failed', err));
  }
  invalidateDomainReportCache(domain);

  return res.json({
    host: newHost,
    scoredRows,
    totalRows: scoreable.length,
    skipped: null,
  });
});

// ── POST /domain/:id/topics ────────────────────────────────────────────────

router.post('/domain/:id/topics', timed('POST /topics', 4000), authenticateOrSession(), async (req: Request, res: Response) => {
  const got = await ensureDomain(req, req.params.id);
  if (!got.ok) return res.status(got.status).json({ error: got.error });
  const { domain } = got;
  // ?append=true → "Load more" mode: keep existing AI rows, add new on top.
  // ?categories=… → restrict generation to a subset of the 6 categories
  // (used by per-category Load more, future filter UI).
  const append = req.query.append === 'true' || (req.body ?? {}).append === true;
  const categoryFilter = typeof req.query.categories === 'string'
    ? (req.query.categories.split(',').map((s) => s.trim()).filter(Boolean) as PromptCategory[])
    : undefined;
  await setPhase(prisma, domain.id, 'topics', 'running');
  try {
    const [latestCrawl, competitors, existingPrompts] = await Promise.all([
      prisma.crawlSnapshot.findFirst({ where: { domainId: domain.id }, orderBy: { createdAt: 'desc' } }),
      prisma.competitor.findMany({
        where: { domainId: domain.id, isSelected: true },
        select: { competitorHost: true },
      }),
      append
        ? prisma.prompt.findMany({
            where: { domainId: domain.id },
            select: { text: true },
          })
        : Promise.resolve([]),
    ]);

    // Stage 1 — enrich the crawl context into structured entities the
    // prompt generator can fill into category templates. Without this step
    // prompts come out generic (Radyant / Visiblie research).
    const enriched = await enrichDomainContext({
      url: domain.url,
      host: domain.host,
      companyName: domain.inferred?.companyName ?? null,
      rawText: latestCrawl?.rawText ?? '',
      inferredSummary: domain.inferred?.summary ?? null,
      inferredIndustry: domain.profile?.industry ?? null,
      knownCompetitors: competitors.map((c) => c.competitorHost),
      country: domain.profile?.country ?? null,
      state: domain.profile?.state ?? null,
    });

    // Stage 2 — generate 24 prompts in 6 categories (Soar/Profound taxonomy),
    // each filled with the real personas/use-cases/competitors from Stage 1.
    const prompts = await generateAuditPrompts({
      brand: domain.inferred?.companyName ?? domain.host,
      url: domain.url,
      host: domain.host,
      context: enriched,
      onlyCategories: categoryFilter,
      avoidPrompts: existingPrompts.map((prompt) => prompt.text),
    });

    if (prompts.length === 0) {
      await setPhase(prisma, domain.id, 'topics', 'failed');
      return res.status(500).json({ error: 'Generator returned no prompts' });
    }

    const persisted = await persistAuditPrompts({ prisma, domainId: domain.id, prompts, append });
    const customPromptSeeds = Array.isArray(domain.profile?.customSeeds?.prompts)
      ? domain.profile.customSeeds.prompts.filter((prompt: unknown): prompt is string => typeof prompt === 'string')
      : [];
    if (customPromptSeeds.length > 0) {
      await persistCustomPromptSeeds(prisma, domain.id, customPromptSeeds);
    }
    if (append && persisted.filter((item) => item.type === 'prompt').length === 0) {
      console.warn(`[PROMPTS] append generated no new unique prompts for domain ${domain.id}; duplicates were skipped`);
    }
    await setPhase(prisma, domain.id, 'topics', 'completed');
    invalidateDomainReportCache(domain);

    // Canonical full list — both fresh and append modes return the same shape.
    const items = await listAllTopicItems(prisma, domain.id);
    return res.json({
      domainId: domain.id,
      items,
      // Surface the enrichment so the UI can show what we extracted (real
      // category, personas, competitors) — useful for trust + debugging.
      enriched,
    });
  } catch (err) {
    await setPhase(prisma, domain.id, 'topics', 'failed');
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Topics generation failed' });
  }
});

/**
 * POST /api/wizard/domain/:id/keywords
 *
 * Keyword-only generation for the Website Audit inline setup flow. Unlike
 * /topics (which generates 24 prompts × 6 LLM calls), this hits the LLM
 * once and persists first-class Keyword rows with `isSelected: true` so
 * Domain Info can render them immediately.
 *
 * Phase ledger contract: writes `select: 'completed'` but leaves `topics`
 * unset. A user who later opens the standalone wizard for this domain will
 * therefore land on Step 4 (topics) — they can opt into prompt generation
 * and AI runs at that point without us having to backfill anything here.
 *
 * Idempotent: upsert by (domainId, term) + `replaceAi: true` deletes any
 * prior AI keywords first. Safe to retry from the frontend.
 */
router.post('/domain/:id/keywords', authenticateToken, async (req: Request, res: Response) => {
  const got = await ensureDomain(req, req.params.id);
  if (!got.ok) return res.status(got.status).json({ error: got.error });
  const { domain } = got;
  try {
    const [latestCrawl, competitors] = await Promise.all([
      prisma.crawlSnapshot.findFirst({
        where: { domainId: domain.id },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.competitor.findMany({
        where: { domainId: domain.id, isSelected: true },
        select: { competitorHost: true },
      }),
    ]);

    const enriched = await enrichDomainContext({
      url: domain.url,
      host: domain.host,
      companyName: domain.inferred?.companyName ?? null,
      rawText: latestCrawl?.rawText ?? '',
      inferredSummary: domain.inferred?.summary ?? null,
      inferredIndustry: domain.profile?.industry ?? null,
      knownCompetitors: competitors.map((c) => c.competitorHost),
      country: domain.profile?.country ?? null,
      state: domain.profile?.state ?? null,
    });

    const keywords = await generateKeywordsForDomain({
      brand: domain.inferred?.companyName ?? domain.host,
      context: enriched,
    });

    if (keywords.length === 0) {
      return res.status(500).json({ error: 'Generator returned no keywords' });
    }

    const persisted = await persistKeywords({
      prisma,
      domainId: domain.id,
      keywords,
      replaceAi: true,
    });
    await setPhase(prisma, domain.id, 'select', 'completed');
    invalidateDomainReportCache(domain);

    return res.json({ domainId: domain.id, keywords: persisted });
  } catch (err) {
    return res
      .status(500)
      .json({ error: err instanceof Error ? err.message : 'Keyword generation failed' });
  }
});

/**
 * POST /api/wizard/domain/:id/keywords/:kwId/prompts
 *
 * Generates 2–3 more prompts under one specific keyword (the per-keyword
 * "Load more" button on Step 4). Existing prompts for the keyword survive;
 * new ones are appended. Returns the canonical full list.
 */
router.post('/domain/:id/keywords/:kwId/prompts', authenticateToken, async (req: Request, res: Response) => {
  const got = await ensureDomain(req, req.params.id);
  if (!got.ok) return res.status(got.status).json({ error: got.error });
  const { domain } = got;
  const kwId = Number(req.params.kwId);
  if (!Number.isFinite(kwId)) return res.status(400).json({ error: 'Invalid keyword id' });

  const keyword = await prisma.keyword.findFirst({ where: { id: kwId, domainId: domain.id } });
  if (!keyword) return res.status(404).json({ error: 'Keyword not found for this domain' });

  if (!process.env.OPENROUTER_API_KEY) {
    return res.status(500).json({ error: 'OPENROUTER_API_KEY not configured' });
  }

  // Existing prompts for this keyword — fed into the LLM as exclusions so it
  // generates angles we don't already have.
  const existing = await prisma.prompt.findMany({
    where: { domainId: domain.id, keywordId: kwId },
    select: { text: true },
  });

  let newPrompts: string[] = [];
  try {
    const OpenAI = (await import('openai')).default;
    const router2 = new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'HTTP-Referer': process.env.OPENROUTER_REFERRER || 'http://localhost:3002',
        'X-Title': 'AI Visibility Wizard / Load more prompts',
      },
    });
    const completion = await router2.chat.completions.create({
      model: 'openai/gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You write natural prompts a real user would ask ChatGPT/Claude/Gemini. Output strict JSON only. Each prompt MUST be a full question or task — never a bare keyword phrase.',
        },
        {
          role: 'user',
          content: [
            `Domain: ${domain.url}`,
            domain.profile?.industry ? `Industry: ${domain.profile.industry}` : '',
            `Keyword: "${keyword.term}" (intent: ${keyword.intent})`,
            '',
            existing.length > 0
              ? `Already generated for this keyword (do not repeat or paraphrase):\n${existing.map((p) => `  - ${p.text}`).join('\n')}`
              : '',
            '',
            'Generate 3 NEW prompts under this keyword. Cover different angles: comparisons, "best X for Y", how-to, recommendations, etc.',
            '',
            'Return JSON: { "prompts": string[] }',
          ].filter(Boolean).join('\n'),
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.5,
      max_tokens: 600,
    });
    const parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}');
    if (Array.isArray(parsed.prompts)) {
      const seen = new Set(existing.map((p) => p.text.toLowerCase().trim()));
      newPrompts = parsed.prompts
        .filter((p: unknown): p is string => typeof p === 'string' && p.trim().length > 0)
        .map((p: string) => p.trim())
        .filter((p: string) => !seen.has(p.toLowerCase()))
        .slice(0, 5);
    }
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Could not generate prompts' });
  }

  if (newPrompts.length === 0) {
    return res.status(200).json({ domainId: domain.id, items: await listAllTopicItems(prisma, domain.id), added: 0 });
  }

  await prisma.$transaction(
    newPrompts.map((text) =>
      prisma.prompt.create({
        data: {
          domainId: domain.id,
          keywordId: kwId,
          text,
          intent: keyword.intent,
          source: 'ai',
          isSelected: false,
        },
      })
    )
  );
  invalidateDomainReportCache(domain);

  const items = await listAllTopicItems(prisma, domain.id);
  return res.json({ domainId: domain.id, items, added: newPrompts.length });
});

/**
 * POST /api/wizard/domain/:id/prompts/custom
 * Body: { text: string }
 *
 * Adds a user-supplied prompt to the wizard. The LLM auto-identifies which
 * existing keyword the prompt belongs to (or returns null if it's standalone),
 * so the prompt slots into the right group in the picker UI.
 */
router.post('/domain/:id/prompts/custom', authenticateOrSession(), async (req: Request, res: Response) => {
  const got = await ensureDomain(req, req.params.id);
  if (!got.ok) return res.status(got.status).json({ error: got.error });
  const { domain } = got;
  const text = typeof (req.body ?? {}).text === 'string' ? (req.body as { text: string }).text.trim() : '';
  if (!text) return res.status(400).json({ error: 'text is required' });

  // Fetch the current keyword list so the LLM can pick from real ids only.
  const keywords = await prisma.keyword.findMany({
    where: { domainId: domain.id },
    select: { id: true, term: true, intent: true },
  });

  let assignedKeywordId: number | null = null;
  let assignedIntent: string | null = null;
  // If the LLM can't match the prompt to an existing keyword, it suggests a
  // brand-new short term to attach. We then upsert that as a keyword and
  // attach the prompt to it — so every custom prompt always belongs to a
  // keyword group, never floats orphan.
  let newKeywordTerm: string | null = null;

  if (process.env.OPENROUTER_API_KEY) {
    try {
      const OpenAI = (await import('openai')).default;
      const router = new OpenAI({
        apiKey: process.env.OPENROUTER_API_KEY,
        baseURL: 'https://openrouter.ai/api/v1',
        defaultHeaders: {
          'HTTP-Referer': process.env.OPENROUTER_REFERRER || 'http://localhost:3002',
          'X-Title': 'AI Visibility Wizard / Custom prompt',
        },
      });
      const completion = await router.chat.completions.create({
        model: 'openai/gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'You assign a user-supplied prompt to a keyword group. ' +
              'First try to match it to one of the existing keywords. ' +
              'If none of them fits, propose a brand new short keyword (1–4 words, lowercase, no quotes) that captures the prompt\'s topic. ' +
              'Output strict JSON only.',
          },
          {
            role: 'user',
            content: [
              `User's prompt: "${text}"`,
              '',
              keywords.length > 0
                ? [
                    'Existing keywords for this domain:',
                    keywords.map((k) => `  - id=${k.id} term="${k.term}" intent=${k.intent}`).join('\n'),
                  ].join('\n')
                : '(no existing keywords yet — propose a new one)',
              '',
              'Return JSON exactly in this shape:',
              '{',
              '  "keywordId": <id of one of the existing keywords if a clean fit, else null>,',
              '  "newKeyword": <if keywordId is null, propose a 1–4 word keyword string, else null>,',
              '  "intent": "Informational"|"Commercial"|"Transactional"|"Navigational"',
              '}',
            ].join('\n'),
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
        max_tokens: 120,
      });
      const parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}');
      const allowedIds = new Set(keywords.map((k) => k.id));
      if (typeof parsed.keywordId === 'number' && allowedIds.has(parsed.keywordId)) {
        assignedKeywordId = parsed.keywordId;
        const parent = keywords.find((k) => k.id === parsed.keywordId);
        assignedIntent = parent?.intent ?? null;
      } else if (typeof parsed.newKeyword === 'string' && parsed.newKeyword.trim()) {
        newKeywordTerm = parsed.newKeyword.trim().toLowerCase().slice(0, 80);
      }
      if (typeof parsed.intent === 'string') assignedIntent = parsed.intent;
    } catch {
      // Ignore — fall through; the prompt will still be created (orphan if necessary).
    }
  }

  // If the LLM proposed a new keyword, create it (or grab existing if the
  // term already exists, so we don't double-up via case differences).
  if (assignedKeywordId === null && newKeywordTerm) {
    const newKw = await prisma.keyword.upsert({
      where: { domainId_term: { domainId: domain.id, term: newKeywordTerm } },
      update: {},
      create: {
        domainId: domain.id,
        term: newKeywordTerm,
        intent: assignedIntent ?? 'Commercial',
        source: 'custom',
        isSelected: false,
      },
    });
    assignedKeywordId = newKw.id;
  }

  const created = await prisma.prompt.create({
    data: {
      domainId: domain.id,
      keywordId: assignedKeywordId,
      text,
      intent: assignedIntent ?? 'Commercial',
      source: 'custom',
      isSelected: true,
    },
  });

  // Return the canonical updated list so the UI just replaces its state.
  const items = await listAllTopicItems(prisma, domain.id);
  invalidateDomainReportCache(domain);
  return res.json({ domainId: domain.id, prompt: { id: created.id, keywordId: created.keywordId }, items });
});

/**
 * POST /api/wizard/domain/:id/prompts/:promptId/rerun
 *
 * Re-runs one existing prompt across the model roster and returns the same
 * PromptTableRow-shaped payload used by /prompts/analyze. Unlike /analyze,
 * this does not create a duplicate custom prompt; it keeps the inventory stable
 * and gives the UI fresh per-model responses for retry buttons.
 */
router.post('/domain/:id/prompts/:promptId/rerun', authenticateToken, async (req: Request, res: Response) => {
  const got = await ensureDomain(req, req.params.id);
  if (!got.ok) return res.status(got.status).json({ error: got.error });
  const { domain } = got;
  const promptId = Number(req.params.promptId);
  if (!Number.isFinite(promptId)) return res.status(400).json({ error: 'Invalid promptId' });

  const prompt = await prisma.prompt.findFirst({
    where: { id: promptId, domainId: domain.id },
    select: { id: true, keywordId: true, text: true, intent: true, source: true },
  });
  if (!prompt) return res.status(404).json({ error: 'Prompt not found for this domain' });

  let runResult: Awaited<ReturnType<typeof runOnePrompt>>;
  try {
    runResult = await runOnePrompt(prisma, { domainId: domain.id, promptId: prompt.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'AI analysis failed';
    return res.status(502).json({
      error: 'Analysis service unavailable — please try again.',
      details: message,
      prompt: { id: prompt.id, keywordId: prompt.keywordId, text: prompt.text },
    });
  }

  invalidateDomainReportCache(domain);
  return res.json({
    runId: runResult.runId,
    prompt: { id: prompt.id, keywordId: prompt.keywordId, text: prompt.text },
    row: buildPromptTableRowForSingleRun(prompt, runResult.persistedResults, domain.host),
  });
});

/**
 * POST /api/wizard/domain/:id/prompts/analyze
 * Body: { text: string }
 *
 * The "Analyze Prompt" button on the AI Checker dashboard.
 *
 * Pipeline:
 *   1. LLM keyword-detect — find an existing Keyword that fits the prompt's
 *      topic, or propose+create a brand-new short Keyword. Same logic as
 *      /prompts/custom — kept inline rather than refactored out because
 *      the shape of the LLM call is small and shared logic would couple
 *      two routes that may diverge.
 *   2. Create the Prompt with isSelected=true (so the next full re-run
 *      also covers it) and source='custom'.
 *   3. Call runOnePrompt(prisma, { domainId, promptId }) — runs the
 *      prompt across the ROSTER (3 models), heuristic + LLM scoring,
 *      persists AiQueryResult rows under a fresh completed AiRun.
 *   4. Shape the persisted results into the PromptTableRow shape the
 *      frontend's PromptTable expects, and return.
 *
 * The new AiRun is status='completed', so the existing /report endpoint
 * (which aggregates across completed runs) starts surfacing this prompt
 * the next time the dashboard refreshes.
 */
router.post('/domain/:id/prompts/analyze', authenticateToken, async (req: Request, res: Response) => {
  const got = await ensureDomain(req, req.params.id);
  if (!got.ok) return res.status(got.status).json({ error: got.error });
  const { domain } = got;

  const text = typeof (req.body ?? {}).text === 'string' ? (req.body as { text: string }).text.trim() : '';
  if (!text) return res.status(400).json({ error: 'text is required' });
  if (text.length > 800) return res.status(400).json({ error: 'Prompt is too long (max 800 chars)' });

  // 1. LLM keyword-detect (same logic as /prompts/custom).
  const keywords = await prisma.keyword.findMany({
    where: { domainId: domain.id },
    select: { id: true, term: true, intent: true },
  });

  let assignedKeywordId: number | null = null;
  let assignedIntent: string | null = null;
  let newKeywordTerm: string | null = null;

  if (process.env.OPENROUTER_API_KEY) {
    try {
      const OpenAI = (await import('openai')).default;
      const llm = new OpenAI({
        apiKey: process.env.OPENROUTER_API_KEY,
        baseURL: 'https://openrouter.ai/api/v1',
        defaultHeaders: {
          'HTTP-Referer': process.env.OPENROUTER_REFERRER || 'http://localhost:3002',
          'X-Title': 'AI Visibility / Analyze prompt',
        },
      });
      const completion = await llm.chat.completions.create({
        model: 'openai/gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'You assign a user-supplied prompt to a keyword group. ' +
              'First try to match it to one of the existing keywords. ' +
              "If none fit, propose a brand new short keyword (1–4 words, lowercase, no quotes) that captures the prompt's topic. " +
              'Output strict JSON only.',
          },
          {
            role: 'user',
            content: [
              `User's prompt: "${text}"`,
              '',
              keywords.length > 0
                ? [
                    'Existing keywords for this domain:',
                    keywords.map((k) => `  - id=${k.id} term="${k.term}" intent=${k.intent}`).join('\n'),
                  ].join('\n')
                : '(no existing keywords yet — propose a new one)',
              '',
              'Return JSON exactly in this shape:',
              '{',
              '  "keywordId": <id of one of the existing keywords if a clean fit, else null>,',
              '  "newKeyword": <if keywordId is null, propose a 1–4 word keyword string, else null>,',
              '  "intent": "Informational"|"Commercial"|"Transactional"|"Navigational"',
              '}',
            ].join('\n'),
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
        max_tokens: 120,
      });
      const parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}');
      const allowedIds = new Set(keywords.map((k) => k.id));
      if (typeof parsed.keywordId === 'number' && allowedIds.has(parsed.keywordId)) {
        assignedKeywordId = parsed.keywordId;
        const parent = keywords.find((k) => k.id === parsed.keywordId);
        assignedIntent = parent?.intent ?? null;
      } else if (typeof parsed.newKeyword === 'string' && parsed.newKeyword.trim()) {
        newKeywordTerm = parsed.newKeyword.trim().toLowerCase().slice(0, 80);
      }
      if (typeof parsed.intent === 'string') assignedIntent = parsed.intent;
    } catch {
      // Fall through — prompt still gets created (orphan if necessary).
    }
  }

  if (assignedKeywordId === null && newKeywordTerm) {
    const newKw = await prisma.keyword.upsert({
      where: { domainId_term: { domainId: domain.id, term: newKeywordTerm } },
      update: {},
      create: {
        domainId: domain.id,
        term: newKeywordTerm,
        intent: assignedIntent ?? 'Commercial',
        source: 'custom',
        // The keyword is implicitly tracked via its child prompt; we don't
        // need to flip its own isSelected. Same convention as /prompts/custom.
        isSelected: false,
      },
    });
    assignedKeywordId = newKw.id;
  }

  // 2. Create the Prompt with isSelected=true — it WILL be tracked.
  const prompt = await prisma.prompt.create({
    data: {
      domainId: domain.id,
      keywordId: assignedKeywordId,
      text,
      intent: assignedIntent ?? 'Commercial',
      source: 'custom',
      isSelected: true,
    },
  });
  invalidateDomainReportCache(domain);

  // 3. Run the prompt across ROSTER and persist results.
  let runResult: Awaited<ReturnType<typeof runOnePrompt>>;
  try {
    runResult = await runOnePrompt(prisma, { domainId: domain.id, promptId: prompt.id });
  } catch (err) {
    // Persist context but tell the client the LLM run itself failed. The
    // Prompt row remains in the DB; a future full re-run will pick it up.
    const message = err instanceof Error ? err.message : 'AI analysis failed';
    return res.status(502).json({
      error: 'Analysis service unavailable — please try again.',
      details: message,
      // Surface the created Prompt so the client can still show "added".
      prompt: { id: prompt.id, keywordId: prompt.keywordId, text: prompt.text },
    });
  }

  return res.json({
    runId: runResult.runId,
    prompt: { id: prompt.id, keywordId: prompt.keywordId, text: prompt.text },
    row: buildPromptTableRowForSingleRun(prompt, runResult.persistedResults, domain.host),
  });
});

/**
 * Build the flat WizardItem list (keywords + prompts) from the DB.
 * Used by both /topics and /prompts/custom so the UI gets a single canonical
 * shape regardless of which endpoint produced the change.
 */
async function listAllTopicItems(prismaClient: typeof prisma, domainId: number) {
  const [keywords, prompts] = await Promise.all([
    prismaClient.keyword.findMany({ where: { domainId }, orderBy: { id: 'asc' } }),
    prismaClient.prompt.findMany({ where: { domainId }, orderBy: { id: 'asc' } }),
  ]);
  // Keep this object literal forgiving — the new audit-research metadata
  // (category / intentStage / persona / useCase / constraint / isBranded /
  // competitorMentioned) is included on every prompt row so the front end
  // can render category badges and the dashboard can do category-weighted
  // scoring without a separate fetch.
  const items: Array<{
    id: number;
    type: 'keyword' | 'prompt';
    text: string;
    intent: string | null;
    source: 'ai' | 'custom';
    isSelected?: boolean;
    parentKeywordId?: number;
    category?: string | null;
    intentStage?: string | null;
    persona?: string | null;
    useCase?: string | null;
    constraint?: string | null;
    isBranded?: boolean;
    competitorMentioned?: string | null;
    hasRun?: boolean;
    lastRunAt?: Date | null;
  }> = [];
  const keywordById = new Map(keywords.map((k) => [k.id, k]));
  const promptRunMeta = await getPromptRunMetadata(prismaClient, prompts.map((prompt) => prompt.id));
  for (const k of keywords) {
    items.push({
      id: k.id,
      type: 'keyword',
      text: k.term,
      intent: k.intent,
      source: (k.source as 'ai' | 'custom') ?? 'ai',
    });
  }
  for (const p of prompts) {
    const runMeta = promptRunMeta.get(p.id);
    items.push({
      id: p.id,
      type: 'prompt',
      text: p.text,
      intent: p.intent,
      source: (p.source as 'ai' | 'custom') ?? 'ai',
      isSelected: p.isSelected,
      parentKeywordId: p.keywordId && keywordById.has(p.keywordId) ? p.keywordId : undefined,
      category: p.category ?? null,
      intentStage: p.intentStage ?? null,
      persona: p.persona ?? null,
      useCase: p.useCase ?? null,
      constraint: p.constraint ?? null,
      isBranded: p.isBranded ?? false,
      competitorMentioned: p.competitorMentioned ?? null,
      hasRun: runMeta?.hasRun ?? false,
      lastRunAt: runMeta?.lastRunAt ?? null,
    });
  }
  return items;
}

// ── PATCH /domain/:id/draft ────────────────────────────────────────────────

router.patch('/domain/:id/draft', authenticateOrSession(), async (req: Request, res: Response) => {
  const got = await ensureDomain(req, req.params.id);
  if (!got.ok) return res.status(got.status).json({ error: got.error });
  const { domain } = got;
  const draft = {
    keywordIds: parseIdList((req.body as { keywordIds?: unknown; selectedKeywordIds?: unknown } | null)?.keywordIds)
      .concat(parseIdList((req.body as { keywordIds?: unknown; selectedKeywordIds?: unknown } | null)?.selectedKeywordIds)),
    promptIds: parseIdList((req.body as { promptIds?: unknown; selectedPromptIds?: unknown } | null)?.promptIds)
      .concat(parseIdList((req.body as { promptIds?: unknown; selectedPromptIds?: unknown } | null)?.selectedPromptIds))
      .concat(parseIdList((req.body as { selectedPrompts?: unknown } | null)?.selectedPrompts)),
  };
  await prisma.wizardState.upsert({
    where: { domainId: domain.id },
    update: { selectionDraft: draft as any },
    create: { domainId: domain.id, phases: {} as any, selectionDraft: draft as any },
  });
  return res.json({ domainId: domain.id, selectionDraft: draft });
});

// ── POST /domain/:id/select ────────────────────────────────────────────────

router.post('/domain/:id/select', authenticateOrSession(), async (req: Request, res: Response) => {
  const got = await ensureDomain(req, req.params.id);
  if (!got.ok) return res.status(got.status).json({ error: got.error });
  const { domain } = got;
  const body = (req.body ?? {}) as {
    keywordIds?: unknown;
    selectedKeywordIds?: unknown;
    promptIds?: unknown;
    selectedPromptIds?: unknown;
    selectedPrompts?: unknown;
    prompts?: unknown;
    items?: unknown;
    selection?: unknown;
  };
  const kwIdsRaw = parseIdList(body.keywordIds).concat(parseIdList(body.selectedKeywordIds));
  let prIds = parseIdList(body.promptIds)
    .concat(parseIdList(body.selectedPromptIds))
    .concat(parseIdList(body.selectedPrompts))
    .concat(parseIdList(body.prompts))
    .concat(parseIdList(body.items))
    .concat(parseIdList(body.selection));
  if (prIds.length === 0) {
    const state = await prisma.wizardState.findUnique({
      where: { domainId: domain.id },
      select: { selectionDraft: true },
    });
    const draft = state?.selectionDraft as { keywordIds?: unknown; promptIds?: unknown } | null;
    if (draft) {
      prIds = prIds.concat(parseIdList(draft.promptIds));
      kwIdsRaw.push(...parseIdList(draft.keywordIds));
    }
  }
  // The wizard only collects prompt selections — derive the keyword ids from
  // the selected prompts so Keyword.isSelected accurately reflects which
  // keywords drove the run. Otherwise the dashboard's "Top Keywords" count
  // is stuck at 0.
  const promptKwRows = prIds.length
    ? await prisma.prompt.findMany({
        where: { id: { in: prIds }, domainId: domain.id, keywordId: { not: null } },
        select: { keywordId: true },
        distinct: ['keywordId'],
      })
    : [];
  const derivedKwIds = promptKwRows
    .map((r) => r.keywordId)
    .filter((id): id is number => typeof id === 'number');
  const kwIds = Array.from(new Set([...kwIdsRaw, ...derivedKwIds]));
  await prisma.$transaction([
    prisma.keyword.updateMany({ where: { domainId: domain.id }, data: { isSelected: false } }),
    prisma.prompt.updateMany({ where: { domainId: domain.id }, data: { isSelected: false } }),
    ...(kwIds.length ? [prisma.keyword.updateMany({ where: { id: { in: kwIds }, domainId: domain.id }, data: { isSelected: true } })] : []),
    ...(prIds.length ? [prisma.prompt.updateMany({ where: { id: { in: prIds }, domainId: domain.id }, data: { isSelected: true } })] : []),
  ]);
  console.log(`[PROMPTS] selected domain=${domain.id} prompts=${prIds.length} keywords=${kwIds.length}`);
  await setPhase(prisma, domain.id, 'select', 'completed');
  invalidateDomainReportCache(domain);
  return res.json({ domainId: domain.id, selectedKeywords: kwIds.length, selectedPrompts: prIds.length });
});

// ── POST /domain/:id/run  (Step 5 — runs AI queries via SSE) ───────────────
//
// Auth gate: dual-identity middleware so the server-rendered identity is
// always available, but explicitly rejects anonymous callers with a 402
// + code 'SIGNUP_REQUIRED'. The frontend reads this to pop the signup
// wall modal. This keeps the actual signup gate server-enforced — we
// never trust the client to gate the paid LLM run.

router.post('/domain/:id/run', authenticateOrSession(), async (req: Request, res: Response) => {
  if (req.identity?.kind !== 'user') {
    return res.status(402).json({
      error: 'Sign up to view your full AI Visibility report.',
      code: 'SIGNUP_REQUIRED',
    });
  }
  const got = await ensureDomain(req, req.params.id);
  if (!got.ok) return res.status(got.status).json({ error: got.error });
  const { domain } = got;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Each event is named so the existing front-end SSE listener (Step5) can
  // switch on `ev.event`. Data payload is the rest of the RunProgress shape.
  const sendEvent = (name: string, payload: object) => {
    res.write(`event: ${name}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  await setPhase(prisma, domain.id, 'run', 'running');
  await runQueries({
    prisma,
    domainId: domain.id,
    onProgress: (event) => {
      const { type, ...rest } = event;
      sendEvent(type, rest);
    },
  });
  await setPhase(prisma, domain.id, 'run', 'completed');
  res.end();
});

// ── DELETE /domain/:id ─────────────────────────────────────────────────────

router.delete('/domain/:id', authenticateToken, async (req: Request, res: Response) => {
  const got = await ensureDomain(req, req.params.id);
  if (!got.ok) return res.status(got.status).json({ error: got.error });
  const userId = authReq(req).user.userId;
  await prisma.domain.delete({ where: { id: got.domain.id } });
  // Bust the user's domain-list cache so the next /domains call reflects the
  // delete immediately instead of waiting 60s for the TTL.
  redisService.del(domainsCacheKey(userId)).catch(() => {});
  return res.json({ ok: true });
});

export default router;
