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

import { Router, Request, Response } from 'express';
import { Prisma, PrismaClient } from '../../generated/prisma';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import {
  authenticateOrSession,
  getOwnerUserId,
} from '../middleware/authenticateOrSession';
import { extractHost, normalizeUrl } from './urlNormalize';
import { crawlDomain, inferCompanySize, synthesizeContext } from './crawlService';
import { embedText } from './llmClient';
import { runCompetitorPipeline, persistCompetitors } from './competitorService';
import { generateAuditPrompts, persistAuditPrompts, type PromptCategory } from './topicsService';
import { generateKeywordsForDomain, persistKeywords } from './keywordsService';
import { enrichDomainContext } from './enrichmentService';
import { setPhase, readState } from './wizardState';
import { runOnePrompt, runQueries } from './runService';
import { computePhraseVisibility, computeOpportunities, computeCompetitorAnalysis } from './analyticsService';
import { enrichOpportunities, type EnrichedOpportunity } from './opportunityEnrichment';
import { enrichCompetitorInsights, type CompetitorInsight } from './competitorInsightEnrichment';

const prisma = new PrismaClient();
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

router.get('/domains', authenticateToken, async (req: Request, res: Response) => {
  const userId = authReq(req).user.userId;
  const domains = await prisma.domain.findMany({
    where: { userId },
    include: {
      profile: { select: { country: true, state: true, industry: true, targetLocation: true } },
      inferred: { select: { companyName: true, companySize: true, summary: true } },
      wizardState: { select: { phases: true } },
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

  // Derive currentStep + visibilityScore per row.
  const rows = await Promise.all(
    domains.map(async (d) => {
      const phases = (d.wizardState?.phases as Record<string, string> | undefined) ?? {};
      let currentStep = 0;
      for (const [phase, status] of Object.entries(phases)) {
        if (status === 'completed') {
          currentStep = Math.max(currentStep, PHASE_STEP[phase] ?? 0);
        }
      }

      const latestRun = await prisma.aiRun.findFirst({
        where: { domainId: d.id, status: 'completed' },
        orderBy: { startedAt: 'desc' },
        select: { summary: true },
      });
      const visibilityScore =
        (latestRun?.summary as Record<string, unknown> | null | undefined)?.avgOverall ?? null;

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
        },
      };
    })
  );

  return res.json({ domains: rows });
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
    send({ type: 'domain_created', domainId: domain.id });

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

    // Phase: crawl.
    await setPhase(prisma, domain.id, 'crawl', 'running');
    send({ type: 'progress', phase: 'crawl', progress: 5, step: 'Discovering pages…' });
    const crawl = await crawlDomain(norm.canonicalUrl);
    send({ type: 'progress', phase: 'crawl', progress: 70, step: `Scanned ${crawl.pagesScanned} pages` });

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
    const embedding = await embedText(crawl.rawText.slice(0, 8000));
    const companySize = inferCompanySize(crawl.rawText);
    await prisma.domainInferred.upsert({
      where: { domainId: domain.id },
      update: {
        companyName: crawl.contextJson?.companyName ?? null,
        companySize,
        productsJson: (crawl.contextJson?.products ?? []) as any,
        schemaOrgJson: (crawl.contextJson?.schemaOrg ?? null) as any,
        embedding: embedding as any,
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
        summary: crawl.contextJson?.summary ?? null,
      },
    });
    await setPhase(prisma, domain.id, 'profile', 'completed');

    send({
      type: 'complete',
      domainId: domain.id,
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
  return res.json({ domain, crawls, competitors, keywords, prompts, runs });
});

// ── GET /domain/:id/report ─────────────────────────────────────────────────
//
// Dashboard-shaped read for the AI Results page (replaces /api/dashboard/:id).
// Returns flat metrics + topPrompts list derived from the latest completed
// AiRun and the user's selected keywords/prompts.

router.get('/domain/:id/report', authenticateToken, async (req: Request, res: Response) => {
  const got = await ensureDomain(req, req.params.id);
  if (!got.ok) return res.status(got.status).json({ error: got.error });
  const { domain } = got;

  // ?runId= scopes every metric to a specific past run. Without it we use
  // the latest completed run for this domain (existing behaviour).
  const runIdParam = typeof req.query.runId === 'string' ? Number(req.query.runId) : NaN;
  const useSpecificRun = Number.isFinite(runIdParam) && runIdParam > 0;

  const [latestRun, allResults, keywords, prompts] = await Promise.all([
    useSpecificRun
      ? prisma.aiRun.findFirst({
          where: { id: runIdParam, domainId: domain.id, status: 'completed' },
        })
      : prisma.aiRun.findFirst({
          where: { domainId: domain.id, status: 'completed' },
          orderBy: { startedAt: 'desc' },
        }),
    prisma.aiQueryResult.findMany({
      where: useSpecificRun
        ? { runId: runIdParam, run: { domainId: domain.id } }
        : { run: { domainId: domain.id, status: 'completed' } },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    }),
    // Load ALL keywords for this domain (not just isSelected). Many AI-generated
    // keywords have isSelected=false because the user picked the child prompts
    // rather than the keyword itself, but we still need the keyword rows so the
    // rollup at line ~398 can render parent rows for queried prompts. Filtering
    // by `queriedKeywordIds.has(k.id)` further down keeps the result set tight.
    prisma.keyword.findMany({ where: { domainId: domain.id } }),
    prisma.prompt.findMany({ where: { domainId: domain.id, isSelected: true } }),
  ]);

  const summary = (latestRun?.summary as Record<string, unknown> | null) ?? null;
  const perModelRaw = (summary?.perModel as Record<string, { presenceRate?: number; avgOverall?: number; avgSentiment?: number; queries?: number }> | undefined) ?? {};

  // Per-model mention totals (count of presence=1) — the dashboard reads
  // `modelStats[i].mentions` directly, so we surface it here.
  const mentionsByModel = new Map<string, number>();
  for (const r of allResults) {
    mentionsByModel.set(r.model, (mentionsByModel.get(r.model) ?? 0) + r.presence);
  }

  const modelPerformance = Object.entries(perModelRaw).map(([model, m]) => ({
    model,
    visibility: Math.round(((m.presenceRate ?? 0) as number) * 100),
    accuracy: Number((((m.avgOverall ?? 0) as number) * 10).toFixed(1)),
    sentiment: Number(((m.avgSentiment ?? 0) as number).toFixed(2)),
    queries: m.queries ?? 0,
    mentions: mentionsByModel.get(model) ?? 0,
  }));

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
  //   - Only return prompts that were actually queried in some run (skip
  //     selected-but-never-run rows so the dashboard isn't padded with zeros).
  //   - Include keywords whose child prompts were queried, so the keyword
  //     table has rollup rows.
  const queriedPromptIds = new Set(resultsByPrompt.keys());
  const queriedPrompts = prompts.filter((p) => queriedPromptIds.has(p.id));

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

  // Convert raw -10..10 sentiment into the 0..10 scale the page expects:
  //   raw  -10 →  0    (Negative)
  //   raw    0 →  5    (Neutral)
  //   raw  +10 → 10    (Positive)
  // Page thresholds: ≥7 Positive, ≥4 Neutral, else Negative.
  // NULL passes through as NULL — meaning "brand not mentioned, no sentiment to measure".
  const toDisplaySentiment = (raw: number | null): number | null =>
    raw === null ? null : Math.max(0, Math.min(10, (raw + 10) / 2));

  type ResponseCitation = { title: string | null; url: string; host: string };

  function buildModelResults(rs: typeof allResults) {
    return rs.map((r) => {
      const cits = Array.isArray(r.citations) ? (r.citations as ResponseCitation[]) : [];
      const compMentions = Array.isArray(r.competitorMentions)
        ? (r.competitorMentions as Array<{ host: string; count: number; sentiment: number | null }>)
        : [];
      const sentimentDisplay = toDisplaySentiment(r.sentiment);
      return {
        id: `res-${r.id}`,
        model: r.model,
        presence: r.presence,
        // overall is always 0 when presence=0 (visibility metric)
        overall: r.overall,
        // accuracy is null when presence=0 (no claims to verify)
        accuracy: r.accuracy,
        // relevance is always meaningful (answer quality, not visibility)
        relevance: r.relevance,
        // sentiment is null when presence=0 — front end shows "Not mentioned"
        // instead of fabricating Neutral/Negative
        sentiment: sentimentDisplay === null ? null : Number(sentimentDisplay.toFixed(2)),
        sentimentRaw: r.sentiment,
        rankPosition: r.rankPosition,
        scorerSummary: r.scorerSummary,
        factualClaims: r.factualClaims ?? [],
        response: r.response,
        citations: cits.map((c) => ({
          title: c.title ?? c.host,
          url: c.url,
          snippet: c.host,
        })),
        sources: Array.from(new Set(cits.map((c) => c.host))).filter(Boolean),
        competitorMentions: compMentions,
        competitorHosts: Array.isArray(r.competitorHosts) ? (r.competitorHosts as string[]) : [],
        latencyMs: r.latencyMs,
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

  const topPrompts = [
    ...queriedKeywords.map((k) => {
      const childPromptIds = queriedPrompts.filter((p) => p.keywordId === k.id).map((p) => p.id);
      const childResults = childPromptIds.flatMap((pid) => resultsByPrompt.get(pid) ?? []);
      const built = buildModelResults(childResults);
      const mentions = built.reduce((s, r) => s + r.presence, 0);
      const total = built.length;
      const sovPct = total > 0 ? Math.round((mentions / total) * 100) : 0;
      // Average sentiment only across rows where the brand was actually
      // mentioned. Returns 5 (Neutral) only when there's literally a 5-score
      // measurement; rows without measurement are excluded, not zeroed.
      const sentimentMeasurements = built.map((r) => r.sentiment).filter((s): s is number => s !== null);
      const avgSentiment = sentimentMeasurements.length > 0
        ? Number((sentimentMeasurements.reduce((s, n) => s + n, 0) / sentimentMeasurements.length).toFixed(2))
        : null;
      const competitors = rollupCompetitors(built);
      return {
        id: `kw-${k.id}`,
        rawId: k.id,
        type: 'keyword' as const,
        // Field names PromptTable consumes:
        phrase: k.term,
        text: k.term,
        intent: k.intent,
        source: k.source,
        sov: `${sovPct}%`,
        mentions,
        bestRank: mentions,
        avgSentiment,
        competitors,
        competitorCount: competitors.length,
        results: built,
        metrics: { visibility: sovPct, avgOverall: total > 0 ? Number((built.reduce((s, r) => s + r.overall, 0) / total).toFixed(2)) : 0, runs: total },
      };
    }),
    ...queriedPrompts.map((p) => {
      const rs = resultsByPrompt.get(p.id) ?? [];
      const built = buildModelResults(rs);
      const mentions = built.reduce((s, r) => s + r.presence, 0);
      const total = built.length;
      const sovPct = total > 0 ? Math.round((mentions / total) * 100) : 0;
      // Average sentiment only across rows where the brand was actually
      // mentioned. Returns 5 (Neutral) only when there's literally a 5-score
      // measurement; rows without measurement are excluded, not zeroed.
      const sentimentMeasurements = built.map((r) => r.sentiment).filter((s): s is number => s !== null);
      const avgSentiment = sentimentMeasurements.length > 0
        ? Number((sentimentMeasurements.reduce((s, n) => s + n, 0) / sentimentMeasurements.length).toFixed(2))
        : null;
      const avgOverall = total > 0
        ? Number((built.reduce((s, r) => s + r.overall, 0) / total).toFixed(2))
        : 0;
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
        keywordId: p.keywordId,
        keyword: parentKw?.term ?? null,
        keywordIntent: parentKw?.intent ?? null,
        sov: `${sovPct}%`,
        mentions,
        bestRank: mentions,
        avgSentiment,
        competitors,
        competitorCount: competitors.length,
        results: built,
        metrics: { visibility: sovPct, avgOverall, runs: total },
      };
    }),
  ];

  // Brand vs competitor "share of voice" — count of presence vs competitor mentions.
  const totalQueries = (summary?.totalQueries as number | undefined) ?? allResults.length;
  const brandMentions = allResults.reduce((sum, r) => sum + r.presence, 0);
  const competitorMentions = allResults.reduce((sum, r) => {
    const arr = Array.isArray(r.competitorHosts) ? (r.competitorHosts as unknown[]) : [];
    return sum + arr.length;
  }, 0);
  const totalMentions = brandMentions + competitorMentions;
  const mentionRate = totalMentions > 0
    ? Math.round((brandMentions / totalMentions) * 100)
    : 0;

  // ── Phrase Visibility Map + Outrank Opportunities ─────────────────────
  // Pulled from the same data we already loaded above; no extra DB hits.
  const selectedCompetitors = await prisma.competitor.findMany({
    where: { domainId: domain.id, isSelected: true },
    select: { competitorHost: true },
  });
  const phraseVisibility = computePhraseVisibility({
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
      competitorMentions: r.competitorMentions,
      competitorHosts: r.competitorHosts,
      citations: r.citations,
    })),
  });
  const heuristicOpportunities = computeOpportunities(
    {
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
        competitorMentions: r.competitorMentions,
        competitorHosts: r.competitorHosts,
        citations: r.citations,
      })),
    },
    phraseVisibility
  );

  // ── LLM enrichment with per-AiRun cache ────────────────────────────────
  // The LLM rewrites the heuristic titles/rationales into specific, named
  // action items + a real content brief. We cache the result on
  // AiRun.summary.opportunities so subsequent /report loads are free.
  // Cache key includes the heuristic keys so a re-run with different
  // opportunities re-enriches.
  let opportunities: EnrichedOpportunity[] = [];
  if (heuristicOpportunities.length > 0) {
    const cached = (summary?.opportunitiesEnriched as EnrichedOpportunity[] | undefined) ?? null;
    const cachedKeys = (summary?.opportunitiesEnrichedKeys as string[] | undefined) ?? null;
    const currentKeys = heuristicOpportunities.map((o) => o.key);
    const cacheValid =
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
      opportunities = await enrichOpportunities(heuristicOpportunities, {
        brandName: domain.inferred?.companyName ?? domain.host,
        brandHost: domain.host,
        industry: domain.profile?.industry ?? null,
        brandSummary: domain.inferred?.summary ?? null,
        promptsById,
      });

      // Persist the enriched payload onto the latest run so future /report
      // reads skip the LLM. Best-effort — don't fail the request if write
      // fails (read-only fallback still works).
      if (latestRun?.id) {
        const existingSummary = (summary as Record<string, unknown> | null) ?? {};
        const updatedSummary = {
          ...existingSummary,
          opportunitiesEnriched: opportunities,
          opportunitiesEnrichedKeys: currentKeys,
          opportunitiesEnrichedAt: new Date().toISOString(),
        };
        prisma.aiRun
          .update({ where: { id: latestRun.id }, data: { summary: updatedSummary as any } })
          .catch((err) => console.warn('[opportunities] cache write failed', err));
      }
    }
  }

  return res.json({
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
      visibilityScore: Math.round(((summary?.presenceRate as number | undefined) ?? 0) * 100),
      avgOverall: (summary?.avgOverall as number | undefined) ?? 0,
      avgSentiment: (summary?.avgSentiment as number | undefined) ?? 0,
      avgAccuracy: Math.round(((summary?.avgOverall as number | undefined) ?? 0) * 10),
      mentionRate,
      brandPages: brandMentions,
      competitorPages: competitorMentions,
      totalQueries,
      modelPerformance,
    },
    topPrompts,
    phraseVisibility,
    opportunities,
  });
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

  return res.json({ prompt: updated });
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
      run: { domainId: domain.id, status: 'completed' },
    },
    select: {
      runId: true,
      presence: true,
      sentiment: true,
      run: { select: { startedAt: true } },
    },
  });

  // Bucket per run.
  type Bucket = { runId: number; startedAt: Date; mentions: number; total: number; sentSum: number; sentCount: number };
  const byRun = new Map<number, Bucket>();
  for (const r of rows) {
    let b = byRun.get(r.runId);
    if (!b) {
      b = { runId: r.runId, startedAt: r.run.startedAt, mentions: 0, total: 0, sentSum: 0, sentCount: 0 };
      byRun.set(r.runId, b);
    }
    b.total += 1;
    b.mentions += r.presence;
    if (r.presence === 1 && r.sentiment !== null) {
      // Convert raw -10..10 into displayed 0..10 (matches /report transform).
      b.sentSum += Math.max(0, Math.min(10, (r.sentiment + 10) / 2));
      b.sentCount += 1;
    }
  }

  const runs = [...byRun.values()]
    .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())
    .map((b) => ({
      runId: b.runId,
      startedAt: b.startedAt,
      presenceRate: b.total > 0 ? Math.round((b.mentions / b.total) * 100) : 0,
      mentions: b.mentions,
      total: b.total,
      avgSentiment: b.sentCount > 0 ? Number((b.sentSum / b.sentCount).toFixed(2)) : null,
    }));

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
      run: { domainId: domain.id, status: 'completed' },
    },
    select: {
      runId: true,
      presence: true,
      sentiment: true,
      run: { select: { startedAt: true } },
    },
  });

  type Bucket = { runId: number; startedAt: Date; mentions: number; total: number; sentSum: number; sentCount: number };
  const byRun = new Map<number, Bucket>();
  for (const r of rows) {
    let b = byRun.get(r.runId);
    if (!b) {
      b = { runId: r.runId, startedAt: r.run.startedAt, mentions: 0, total: 0, sentSum: 0, sentCount: 0 };
      byRun.set(r.runId, b);
    }
    b.total += 1;
    b.mentions += r.presence;
    if (r.presence === 1 && r.sentiment !== null) {
      b.sentSum += Math.max(0, Math.min(10, (r.sentiment + 10) / 2));
      b.sentCount += 1;
    }
  }

  const runs = [...byRun.values()]
    .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())
    .map((b) => ({
      runId: b.runId,
      startedAt: b.startedAt,
      presenceRate: b.total > 0 ? Math.round((b.mentions / b.total) * 100) : 0,
      mentions: b.mentions,
      total: b.total,
      avgSentiment: b.sentCount > 0 ? Number((b.sentSum / b.sentCount).toFixed(2)) : null,
    }));

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
    where: { domainId: domain.id },
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

  // Latest 12 completed runs gives ~3 months of weekly history without
  // overflowing the chart card. Ordered ascending so the chart reads L→R.
  const runs = await prisma.aiRun.findMany({
    where: { domainId: domain.id, status: 'completed' },
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
    select: { runId: true, model: true, presence: true, citations: true, competitorHosts: true },
  });

  type Bucket = {
    runId: number;
    startedAt: Date;
    endedAt: Date | null;
    perModel: Record<string, { cites: number; presenceCount: number }>;
    brandMentions: number;
    competitorMentions: number;
    perCompetitor: Record<string, number>;
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
      perCompetitor: {},
    });
  }

  // Single pass over results — bump the right bucket for each row.
  for (const row of allResults) {
    const b = byRun.get(row.runId);
    if (!b) continue;
    if (!b.perModel[row.model]) b.perModel[row.model] = { cites: 0, presenceCount: 0 };
    b.perModel[row.model].presenceCount += row.presence;
    const cits = Array.isArray(row.citations) ? row.citations : [];
    b.perModel[row.model].cites += cits.length;
    b.brandMentions += row.presence;
    const compHosts = Array.isArray(row.competitorHosts) ? (row.competitorHosts as string[]) : [];
    b.competitorMentions += compHosts.length;
    for (const h of compHosts) {
      if (!h) continue;
      b.perCompetitor[h] = (b.perCompetitor[h] ?? 0) + 1;
    }
  }

  // Top competitors = the 4 most-frequently-mentioned hosts in the LATEST
  // run, so the SoV chart legend reflects who actually competes today (not
  // who was relevant 6 audits ago). Falls back to whichever runs had data.
  const latestBucket = [...byRun.values()].reverse().find((b) => Object.keys(b.perCompetitor).length > 0);
  const topCompetitors = latestBucket
    ? Object.entries(latestBucket.perCompetitor)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([host]) => host)
    : [];

  return res.json({
    runs: [...byRun.values()].map((b) => ({
      runId: b.runId,
      startedAt: b.startedAt,
      endedAt: b.endedAt,
      perModel: b.perModel,
      brandMentions: b.brandMentions,
      competitorMentions: b.competitorMentions,
      perCompetitor: b.perCompetitor,
    })),
    topCompetitors,
  });
});

// ── POST /domain/:id/restart  (Re-audit + Pick prompts again from dashboard) ──
//
// Two modes:
//   from='crawl'  — wipe everything downstream of the URL/profile (crawl,
//                   competitors, topics, prompts, runs) and reset phases so
//                   the wizard runs fresh from Step 2 with the same profile.
//   from='topics' — wipe only topics+select+run; keep crawl + competitors so
//                   the user re-picks prompts on top of the existing context.
//
// User-supplied selections (Competitor.isSelected, custom prompts/keywords)
// are preserved on a 'topics' restart; both kinds are wiped on 'crawl'.
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
  if (from !== 'crawl' && from !== 'topics') {
    return res.status(400).json({ error: "from must be 'crawl' or 'topics'" });
  }

  if (from === 'crawl') {
    // Hard reset — keep Domain + DomainProfile, wipe everything generated.
    await prisma.$transaction([
      prisma.aiQueryResult.deleteMany({ where: { run: { domainId: domain.id } } }),
      prisma.aiRun.deleteMany({ where: { domainId: domain.id } }),
      prisma.prompt.deleteMany({ where: { domainId: domain.id } }),
      prisma.keyword.deleteMany({ where: { domainId: domain.id } }),
      prisma.competitor.deleteMany({ where: { domainId: domain.id } }),
      prisma.crawlSnapshot.deleteMany({ where: { domainId: domain.id } }),
      // Reset wizard phases to "nothing done".
      prisma.wizardState.upsert({
        where: { domainId: domain.id },
        update: { phases: {} as any, selectionDraft: { set: undefined } as any },
        create: { domainId: domain.id, phases: {} as any },
      }),
    ]);
  } else {
    // Soft reset — keep crawl, competitors, custom prompts/keywords.
    // Drop AI-source prompts/keywords + every run.
    const aiKeywords = await prisma.keyword.findMany({
      where: { domainId: domain.id, source: 'ai' },
      select: { id: true },
    });
    const aiKwIds = aiKeywords.map((k) => k.id);

    // Soft reset: drop AI prompts/keywords. We deliberately keep AiRun rows
    // (and let AiQueryResult cascade-delete via the prompt FK) so the
    // dashboard's "latest completed run" lookup still finds the previous
    // run's summary.avgOverall while the user re-picks prompts. Without this,
    // the Domain History card flips from "Visibility 72%" to "Pick prompts"
    // the moment the user enters Step 4 from the AI Dashboard, which is
    // disorienting — the prior result hasn't been replaced yet.
    await prisma.$transaction([
      prisma.prompt.deleteMany({
        where: {
          domainId: domain.id,
          OR: [{ source: 'ai' }, { keywordId: { in: aiKwIds } }],
        },
      }),
      prisma.keyword.deleteMany({ where: { id: { in: aiKwIds } } }),
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

router.get('/domain/:id/competitor-analysis', authenticateToken, async (req: Request, res: Response) => {
  const got = await ensureDomain(req, req.params.id);
  if (!got.ok) return res.status(got.status).json({ error: got.error });
  const { domain } = got;

  const runIdParam = typeof req.query.runId === 'string' ? Number(req.query.runId) : NaN;
  const useSpecificRun = Number.isFinite(runIdParam) && runIdParam > 0;

  const [latestRun, selectedCompetitors, prompts, keywords] = await Promise.all([
    useSpecificRun
      ? prisma.aiRun.findFirst({ where: { id: runIdParam, domainId: domain.id, status: 'completed' } })
      : prisma.aiRun.findFirst({ where: { domainId: domain.id, status: 'completed' }, orderBy: { startedAt: 'desc' } }),
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

router.post('/domain/:id/competitors', authenticateOrSession(), async (req: Request, res: Response) => {
  const got = await ensureDomain(req, req.params.id);
  if (!got.ok) return res.status(got.status).json({ error: got.error });
  const { domain } = got;
  await setPhase(prisma, domain.id, 'competitors', 'running');
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
      stats: { discovered: result.candidates.length, verified: result.verified.length, ranked: result.ranked.length },
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

// ── POST /domain/:id/topics ────────────────────────────────────────────────

router.post('/domain/:id/topics', authenticateOrSession(), async (req: Request, res: Response) => {
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
    const [latestCrawl, competitors] = await Promise.all([
      prisma.crawlSnapshot.findFirst({ where: { domainId: domain.id }, orderBy: { createdAt: 'desc' } }),
      prisma.competitor.findMany({
        where: { domainId: domain.id, isSelected: true },
        select: { competitorHost: true },
      }),
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
      context: enriched,
      onlyCategories: categoryFilter,
    });

    if (prompts.length === 0) {
      await setPhase(prisma, domain.id, 'topics', 'failed');
      return res.status(500).json({ error: 'Generator returned no prompts' });
    }

    await persistAuditPrompts({ prisma, domainId: domain.id, prompts, append });
    await setPhase(prisma, domain.id, 'topics', 'completed');

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
router.post('/domain/:id/prompts/custom', authenticateToken, async (req: Request, res: Response) => {
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
      isSelected: false,
    },
  });

  // Return the canonical updated list so the UI just replaces its state.
  const items = await listAllTopicItems(prisma, domain.id);
  return res.json({ domainId: domain.id, prompt: { id: created.id, keywordId: created.keywordId }, items });
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

  // 4. Build a PromptTableRow-shaped response. Same construction as the
  //    /report endpoint's per-prompt loop, but for just this one prompt.
  const toDisplaySentiment = (raw: number | null): number | null =>
    raw === null ? null : Math.max(0, Math.min(10, (raw + 10) / 2));

  const built = runResult.persistedResults.map((r) => ({
    id: `res-${r.id}`,
    model: r.model,
    presence: r.presence,
    overall: r.overall,
    accuracy: r.accuracy,
    relevance: r.relevance,
    sentiment:
      toDisplaySentiment(r.sentiment) === null
        ? null
        : Number((toDisplaySentiment(r.sentiment) as number).toFixed(2)),
    sentimentRaw: r.sentiment,
    rankPosition: r.rankPosition,
    scorerSummary: r.scorerSummary,
    factualClaims: r.factualClaims ?? [],
    response: r.response,
    citations: Array.isArray(r.citations)
      ? (r.citations as Array<{ title?: string | null; url: string; host: string }>).map((c) => ({
          title: c.title ?? c.host,
          url: c.url,
          snippet: c.host,
        }))
      : [],
    sources: Array.isArray(r.citations)
      ? Array.from(
          new Set(
            (r.citations as Array<{ host: string }>).map((c) => c.host).filter(Boolean)
          )
        )
      : [],
    competitorMentions: r.competitorMentions ?? [],
    competitorHosts: Array.isArray(r.competitorHosts)
      ? (r.competitorHosts as string[])
      : [],
    latencyMs: r.latencyMs,
  }));

  const mentions = built.reduce((s, r) => s + (r.presence ?? 0), 0);
  const total = built.length;
  const sovPct = total > 0 ? Math.round((mentions / total) * 100) : 0;
  const sentimentMeasurements = built.map((r) => r.sentiment).filter((s): s is number => s !== null);
  const avgSentiment =
    sentimentMeasurements.length > 0
      ? Number(
          (sentimentMeasurements.reduce((s, n) => s + n, 0) / sentimentMeasurements.length).toFixed(2)
        )
      : null;
  const competitorsSet = new Set<string>();
  for (const r of built) {
    for (const h of r.competitorHosts) competitorsSet.add(h);
  }
  const competitors = Array.from(competitorsSet);

  const row = {
    id: `pr-${prompt.id}`,
    rawId: prompt.id,
    type: 'prompt' as const,
    phrase: prompt.text,
    text: prompt.text,
    intent: prompt.intent,
    source: prompt.source,
    keywordId: prompt.keywordId,
    sov: `${sovPct}%`,
    mentions,
    bestRank: mentions,
    avgSentiment,
    competitors,
    competitorCount: competitors.length,
    results: built,
    metrics: {
      visibility: sovPct,
      avgOverall:
        total > 0
          ? Number((built.reduce((s, r) => s + (r.overall ?? 0), 0) / total).toFixed(2))
          : 0,
      runs: total,
    },
  };

  return res.json({
    runId: runResult.runId,
    prompt: { id: prompt.id, keywordId: prompt.keywordId, text: prompt.text },
    row,
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
    parentKeywordId?: number;
    category?: string | null;
    intentStage?: string | null;
    persona?: string | null;
    useCase?: string | null;
    constraint?: string | null;
    isBranded?: boolean;
    competitorMentioned?: string | null;
  }> = [];
  const keywordById = new Map(keywords.map((k) => [k.id, k]));
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
    items.push({
      id: p.id,
      type: 'prompt',
      text: p.text,
      intent: p.intent,
      source: (p.source as 'ai' | 'custom') ?? 'ai',
      parentKeywordId: p.keywordId && keywordById.has(p.keywordId) ? p.keywordId : undefined,
      category: p.category ?? null,
      intentStage: p.intentStage ?? null,
      persona: p.persona ?? null,
      useCase: p.useCase ?? null,
      constraint: p.constraint ?? null,
      isBranded: p.isBranded ?? false,
      competitorMentioned: p.competitorMentioned ?? null,
    });
  }
  return items;
}

// ── PATCH /domain/:id/draft ────────────────────────────────────────────────

router.patch('/domain/:id/draft', authenticateOrSession(), async (req: Request, res: Response) => {
  const got = await ensureDomain(req, req.params.id);
  if (!got.ok) return res.status(got.status).json({ error: got.error });
  const { domain } = got;
  const { keywordIds, promptIds } = (req.body ?? {}) as { keywordIds?: number[]; promptIds?: number[] };
  const draft = {
    keywordIds: Array.isArray(keywordIds) ? keywordIds.filter((n): n is number => Number.isFinite(n)) : [],
    promptIds: Array.isArray(promptIds) ? promptIds.filter((n): n is number => Number.isFinite(n)) : [],
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
  const { keywordIds, promptIds } = (req.body ?? {}) as { keywordIds?: number[]; promptIds?: number[] };
  const kwIdsRaw = Array.isArray(keywordIds) ? keywordIds.filter((n): n is number => Number.isFinite(n)) : [];
  const prIds = Array.isArray(promptIds) ? promptIds.filter((n): n is number => Number.isFinite(n)) : [];
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
  await setPhase(prisma, domain.id, 'select', 'completed');
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
  await prisma.domain.delete({ where: { id: got.domain.id } });
  return res.json({ ok: true });
});

export default router;
