/**
 * Wizard v2 — read-only endpoints
 *
 * - POST /api/wizard/validate         — HTTP HEAD + robots.txt + DB existence (no writes)
 * - GET  /api/wizard/domain/:id/state — phase status + profile + selection draft (resume support)
 *
 * Mutations live in other PRs (atomic crawl/competitors/topics phases).
 */

import { Router, Request, Response } from 'express';
import OpenAI from 'openai';
import { PrismaClient } from '../../generated/prisma';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { analyzeStandalonePeerCompetitors } from '../services/standaloneCompetitorAnalysisService';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;
const TOPICS_MODEL = 'gpt-4o-mini';

const LOGO_DEV_TOKEN = 'pk_DTdFFG1JT9WOCjATvZEzIA';
const buildLogoUrl = (host: string) =>
  `https://img.logo.dev/${host.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]}?token=${LOGO_DEV_TOKEN}&size=64`;

const prisma = new PrismaClient();
const router = Router();

const HEAD_TIMEOUT_MS = 5000;
const ROBOTS_TIMEOUT_MS = 4000;

interface NormalizedUrl {
  hostname: string;
  href: string;
  origin: string;
}

function normalizeUrl(input: string): NormalizedUrl | null {
  if (!input || typeof input !== 'string') return null;
  let candidate = input.trim();
  if (!candidate) return null;
  if (!/^https?:\/\//i.test(candidate)) candidate = `https://${candidate}`;
  try {
    const u = new URL(candidate);
    const host = u.hostname.replace(/^www\./i, '');
    const href = `${u.protocol}//${host}${u.pathname.replace(/\/$/, '') || ''}`;
    return { hostname: host, href, origin: `${u.protocol}//${host}` };
  } catch {
    return null;
  }
}

type FetchResponse = Awaited<ReturnType<typeof fetch>>;

async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<FetchResponse | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Minimal robots.txt parser. We only care whether `*` user-agent disallows
 * the entire site. That's enough for a "can we crawl this?" indicator —
 * users can still proceed if their site has more nuanced rules.
 */
function isPathAllowedByRobots(robotsTxt: string, path = '/'): boolean {
  if (!robotsTxt) return true;
  const lines = robotsTxt.split(/\r?\n/);
  let inStarBlock = false;
  let blockHasMatchingDisallow = false;
  let blockHasMatchingAllow = false;
  let sawAnyStarBlock = false;

  const checkBlock = () => {
    if (sawAnyStarBlock && blockHasMatchingDisallow && !blockHasMatchingAllow) return false;
    return null;
  };

  for (const raw of lines) {
    const stripped = raw.split('#')[0].trim();
    if (!stripped) continue;
    const idx = stripped.indexOf(':');
    if (idx < 0) continue;
    const key = stripped.slice(0, idx).trim().toLowerCase();
    const value = stripped.slice(idx + 1).trim();
    if (key === 'user-agent') {
      const wasStar = inStarBlock;
      inStarBlock = value === '*';
      if (wasStar && !inStarBlock) {
        const decided = checkBlock();
        if (decided === false) return false;
      }
      if (inStarBlock) {
        sawAnyStarBlock = true;
        blockHasMatchingDisallow = false;
        blockHasMatchingAllow = false;
      }
    } else if (inStarBlock && (key === 'disallow' || key === 'allow')) {
      // Empty Disallow means "allow everything" per spec.
      const isMatch = value === '' ? false : path.startsWith(value);
      if (isMatch) {
        if (key === 'disallow') blockHasMatchingDisallow = true;
        else blockHasMatchingAllow = true;
      }
    }
  }
  const decided = checkBlock();
  return decided === false ? false : true;
}

/**
 * POST /api/wizard/validate
 * Body: { url: string }
 * Response: {
 *   ok, normalizedUrl, reachable, robotsAllowed, finalUrl?,
 *   dbExistsForUser, existingDomainId?, lastAnalyzedAt?, reason?
 * }
 *
 * Stateless — no DB writes. Pure pre-flight check before the user
 * commits to creating a Domain row in PR 3.
 */
router.post('/validate', authenticateToken, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { url } = (req.body ?? {}) as { url?: string };
  const normalized = normalizeUrl(url ?? '');
  if (!normalized) {
    return res.status(400).json({ ok: false, reason: 'Invalid URL' });
  }

  // HEAD probe (best-effort; some hosts reject HEAD, fall back to GET range)
  let reachable = false;
  let finalUrl: string | undefined;
  let head = await fetchWithTimeout(normalized.href, { method: 'HEAD', redirect: 'follow' }, HEAD_TIMEOUT_MS);
  if (!head || (head.status >= 400 && head.status < 600)) {
    const get = await fetchWithTimeout(normalized.href, {
      method: 'GET',
      redirect: 'follow',
      headers: { Range: 'bytes=0-1023' },
    }, HEAD_TIMEOUT_MS);
    if (get && get.status < 400) {
      reachable = true;
      finalUrl = get.url;
    }
  } else {
    reachable = true;
    finalUrl = head.url;
  }

  // robots.txt — fetch from the origin (after redirects if any)
  let robotsAllowed = true;
  if (reachable) {
    const robotsOrigin = finalUrl ? new URL(finalUrl).origin : normalized.origin;
    const robotsRes = await fetchWithTimeout(`${robotsOrigin}/robots.txt`, { method: 'GET' }, ROBOTS_TIMEOUT_MS);
    if (robotsRes && robotsRes.status >= 200 && robotsRes.status < 300) {
      const text = await robotsRes.text().catch(() => '');
      robotsAllowed = isPathAllowedByRobots(text, '/');
    }
    // robots missing / 404 / network error → assume allowed (per spec)
  }

  // DB existence per current user (same domain on different users is allowed)
  const candidateUrls = [
    normalized.href,
    normalized.hostname,
    `https://${normalized.hostname}`,
    `http://${normalized.hostname}`,
    `https://www.${normalized.hostname}`,
  ];
  const existing = await prisma.domain.findFirst({
    where: { userId: authReq.user.userId, url: { in: candidateUrls } },
    select: { id: true, updatedAt: true },
  });

  const ok = reachable && robotsAllowed;
  const reason = !reachable
    ? 'Site is unreachable. Check the URL and try again.'
    : !robotsAllowed
      ? 'robots.txt disallows crawling this site.'
      : undefined;

  return res.json({
    ok,
    normalizedUrl: normalized.href,
    reachable,
    robotsAllowed,
    finalUrl,
    dbExistsForUser: Boolean(existing),
    existingDomainId: existing?.id ?? undefined,
    lastAnalyzedAt: existing?.updatedAt ?? undefined,
    reason,
  });
});

/**
 * GET /api/wizard/domain/:id/state
 * Returns the phase ledger, profile fields, and any saved selection draft
 * so the wizard can resume from the right step on remount.
 */
router.get('/domain/:id/state', authenticateToken, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const domainId = Number(req.params.id);
  if (!domainId || Number.isNaN(domainId)) {
    return res.status(400).json({ error: 'Invalid domainId' });
  }

  const domain = await prisma.domain.findUnique({
    where: { id: domainId },
    select: {
      id: true,
      userId: true,
      url: true,
      country: true,
      state: true,
      industry: true,
      companySize: true,
      customSeeds: true,
      selectedCompetitors: true,
      selectionDraft: true,
      currentStep: true,
      analysisPhases: {
        select: {
          phase: true,
          status: true,
          progress: true,
          error: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: 'asc' },
      },
    },
  });

  if (!domain || domain.userId !== authReq.user.userId) {
    return res.status(404).json({ error: 'Domain not found' });
  }

  // Wizard v2 phase order — deciding which step the UI lands on.
  const ORDER = ['crawl', 'profile', 'competitors', 'topics', 'select', 'run_queries'] as const;
  const phaseMap = new Map(domain.analysisPhases.map((p) => [p.phase, p]));
  let canResumeAt: string | null = null;
  for (const phase of ORDER) {
    const p = phaseMap.get(phase);
    if (!p || p.status !== 'completed') {
      canResumeAt = phase;
      break;
    }
  }

  return res.json({
    domainId: domain.id,
    url: domain.url,
    profile: {
      country: domain.country,
      state: domain.state,
      industry: domain.industry,
      companySize: domain.companySize,
    },
    customSeeds: domain.customSeeds ?? null,
    selectedCompetitors: domain.selectedCompetitors ?? null,
    selectionDraft: domain.selectionDraft ?? null,
    currentStep: domain.currentStep,
    phases: domain.analysisPhases,
    canResumeAt,
  });
});

async function recordPhase(domainId: number, phase: string, status: string, progress: number, error?: string, result?: unknown) {
  await prisma.analysisPhase.upsert({
    where: { domainId_phase: { domainId, phase } },
    update: {
      status,
      progress,
      error: error ?? null,
      result: result ? (JSON.stringify(result) as any) : undefined,
      endTime: status === 'completed' || status === 'failed' ? new Date() : undefined,
    },
    create: {
      domainId,
      phase,
      status,
      progress,
      startTime: new Date(),
      error: error ?? null,
      result: result ? (JSON.stringify(result) as any) : undefined,
    },
  });
}

/**
 * POST /api/wizard/domain/:id/competitors
 * Generates 5–10 same-tier peer competitors based on the domain profile
 * (country/state/industry/companySize) — keywords are NOT required at this
 * stage, which is the structural change vs the old wizard.
 *
 * Idempotent: replaces the previous CompetitorAnalysis row for the domain
 * (each domain has at most one persisted suggestion set).
 */
router.post('/domain/:id/competitors', authenticateToken, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const domainId = Number(req.params.id);
  if (!domainId || Number.isNaN(domainId)) {
    return res.status(400).json({ error: 'Invalid domainId' });
  }

  const domain = await prisma.domain.findUnique({
    where: { id: domainId },
    select: {
      id: true,
      userId: true,
      url: true,
      context: true,
      country: true,
      state: true,
      industry: true,
      companySize: true,
      location: true,
    },
  });
  if (!domain || domain.userId !== authReq.user.userId) {
    return res.status(404).json({ error: 'Domain not found' });
  }

  await recordPhase(domainId, 'competitors', 'running', 5);

  // Build a profile-enriched context. analyzeStandalonePeerCompetitors reads
  // location separately; the rest go in the context string.
  const profileLines = [
    domain.country ? `Country: ${domain.country}` : null,
    domain.state ? `State: ${domain.state}` : null,
    domain.industry ? `Industry: ${domain.industry}` : null,
    domain.companySize ? `Company size: ${domain.companySize}` : null,
  ].filter(Boolean).join('\n');
  const enrichedContext = [profileLines, domain.context ?? ''].filter(Boolean).join('\n\n');
  const locationLabel = [domain.country, domain.state].filter(Boolean).join(', ') || domain.location || null;

  try {
    const result = await analyzeStandalonePeerCompetitors({
      domain: domain.url,
      context: enrichedContext,
      location: locationLabel,
    });

    const competitorsWithLogos = result.competitors.map((c) => ({
      name: c.name,
      domain: c.domain,
      url: c.domain.startsWith('http') ? c.domain : `https://${c.domain}`,
      logoUrl: buildLogoUrl(c.domain),
      reasoning: c.peerFitReason,
      threatLevel: c.threatLevel,
      confidence: c.confidence,
      marketTier: c.marketTier,
      operatesInTargetLocation: c.operatesInTargetLocation,
    }));

    // Replace previous suggestion set for this domain (idempotent re-run).
    await prisma.competitorAnalysis.deleteMany({ where: { domainId } });
    const saved = await prisma.competitorAnalysis.create({
      data: {
        domainId,
        competitors: competitorsWithLogos as any,
        marketInsights: result.marketInsights as any,
        strategicRecommendations: result.strategicRecommendations as any,
        competitiveAnalysis: result.competitiveAnalysis as any,
        competitorList: result.competitorList,
      },
    });

    await recordPhase(domainId, 'competitors', 'completed', 100, undefined, { count: competitorsWithLogos.length });

    return res.json({
      domainId,
      competitors: competitorsWithLogos,
      marketInsights: result.marketInsights,
      analysisId: saved.id,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Competitor generation failed';
    await recordPhase(domainId, 'competitors', 'failed', 0, message);
    return res.status(500).json({ error: message });
  }
});

/**
 * POST /api/wizard/domain/:id/competitors/select
 * Body: { urls: string[] }
 * Persists the user-chosen subset onto Domain.selectedCompetitors so future
 * topics/AI-query phases know which competitors the user actually cares about.
 */
router.post('/domain/:id/competitors/select', authenticateToken, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const domainId = Number(req.params.id);
  const { urls } = (req.body ?? {}) as { urls?: string[] };
  if (!domainId || Number.isNaN(domainId)) {
    return res.status(400).json({ error: 'Invalid domainId' });
  }
  if (!Array.isArray(urls)) {
    return res.status(400).json({ error: 'urls must be an array' });
  }

  const domain = await prisma.domain.findUnique({
    where: { id: domainId },
    select: { id: true, userId: true },
  });
  if (!domain || domain.userId !== authReq.user.userId) {
    return res.status(404).json({ error: 'Domain not found' });
  }

  const cleaned = Array.from(new Set(
    urls
      .filter((u): u is string => typeof u === 'string' && u.trim().length > 0)
      .map((u) => u.trim())
  ));

  await prisma.domain.update({
    where: { id: domainId },
    data: { selectedCompetitors: cleaned as any },
  });

  return res.json({ domainId, selectedCompetitors: cleaned });
});

// ─────────────────────────────────────────────────────────────────────────────
// Topics phase — generates keywords + prompts together in a single LLM call,
// flattened into a tagged list the UI renders directly.
// ─────────────────────────────────────────────────────────────────────────────

type Intent = 'Informational' | 'Transactional' | 'Commercial' | 'Navigational';

interface GeneratedTopic {
  keyword: string;
  intent: Intent;
  prompts: string[];
}

const VALID_INTENTS: Intent[] = ['Informational', 'Transactional', 'Commercial', 'Navigational'];
const sanitizeIntent = (raw: unknown): Intent =>
  typeof raw === 'string' && (VALID_INTENTS as string[]).includes(raw) ? (raw as Intent) : 'Commercial';

function buildTopicsPrompt(args: {
  url: string;
  context: string;
  industry: string | null;
  companySize: string | null;
  country: string | null;
  state: string | null;
  competitors: string[];
  customKeywords: string[];
  customPrompts: string[];
}): string {
  const profile = [
    `Domain: ${args.url}`,
    args.industry ? `Industry: ${args.industry}` : null,
    args.companySize ? `Company size: ${args.companySize}` : null,
    [args.country, args.state].filter(Boolean).join(', ') ? `Location: ${[args.country, args.state].filter(Boolean).join(', ')}` : null,
    args.competitors.length ? `Known competitors: ${args.competitors.join(', ')}` : null,
  ].filter(Boolean).join('\n');

  const seeds = [
    args.customKeywords.length ? `User-supplied keyword seeds (must be included verbatim as keywords): ${args.customKeywords.join(', ')}` : null,
    args.customPrompts.length ? `User-supplied prompt seeds (must be included verbatim as prompts under the most relevant keyword): ${args.customPrompts.join(', ')}` : null,
  ].filter(Boolean).join('\n');

  return [
    'Generate 6–10 topics for testing this brand\'s AI search visibility.',
    'Each topic = one short keyword phrase plus 2–3 natural-language prompts a real person might ask ChatGPT/Claude/Gemini.',
    'Prompts MUST be full questions or task descriptions, not bare phrases.',
    'Spread intents across Informational / Commercial / Transactional. Keep prompts diverse — different angles, not paraphrases.',
    'Avoid generic prompts that don\'t reference the domain\'s actual niche.',
    '',
    profile,
    '',
    seeds,
    '',
    'Return JSON: { "topics": [ { "keyword": string, "intent": "Informational"|"Commercial"|"Transactional"|"Navigational", "prompts": string[] } ] }',
  ].filter(Boolean).join('\n');
}

async function generateTopicsViaLLM(args: Parameters<typeof buildTopicsPrompt>[0]): Promise<GeneratedTopic[]> {
  if (!openai) throw new Error('OPENAI_API_KEY not configured');
  const response = await openai.chat.completions.create({
    model: TOPICS_MODEL,
    messages: [
      { role: 'system', content: 'You output strict JSON for AI search visibility audits. Quality over quantity. No filler.' },
      { role: 'user', content: buildTopicsPrompt(args) },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.3,
    max_tokens: 2200,
  });
  const text = response.choices[0]?.message?.content ?? '';
  let parsed: any;
  try { parsed = JSON.parse(text); } catch { throw new Error('LLM did not return valid JSON'); }
  const arr = Array.isArray(parsed?.topics) ? parsed.topics : [];
  return arr
    .map((t: any): GeneratedTopic | null => {
      const keyword = typeof t?.keyword === 'string' ? t.keyword.trim() : '';
      if (!keyword) return null;
      const prompts = Array.isArray(t?.prompts)
        ? t.prompts.filter((p: unknown): p is string => typeof p === 'string' && p.trim().length > 0).map((p: string) => p.trim())
        : [];
      return { keyword, intent: sanitizeIntent(t?.intent), prompts };
    })
    .filter((t: GeneratedTopic | null): t is GeneratedTopic => t !== null);
}

interface FlatItem {
  id: number;
  type: 'keyword' | 'prompt';
  text: string;
  intent: string | null;
  source: 'ai' | 'custom';
  parentKeywordId?: number;
}

/**
 * POST /api/wizard/domain/:id/topics
 * One LLM call → keyword+prompt tree → persisted Keyword + GeneratedIntentPhrase
 * rows → returned as a flat tagged list the wizard renders directly.
 *
 * Idempotent re-run: deletes existing AI-generated rows (Keyword.isCustom=false
 * and their child phrases) and recreates. Custom-source rows survive.
 */
router.post('/domain/:id/topics', authenticateToken, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const domainId = Number(req.params.id);
  if (!domainId || Number.isNaN(domainId)) {
    return res.status(400).json({ error: 'Invalid domainId' });
  }

  const domain = await prisma.domain.findUnique({
    where: { id: domainId },
    select: {
      id: true, userId: true, url: true, context: true,
      country: true, state: true, industry: true, companySize: true,
      customSeeds: true, selectedCompetitors: true,
    },
  });
  if (!domain || domain.userId !== authReq.user.userId) {
    return res.status(404).json({ error: 'Domain not found' });
  }

  await recordPhase(domainId, 'topics', 'running', 5);

  const seeds = (domain.customSeeds as { keywords?: string[]; prompts?: string[] } | null) ?? {};
  const competitorList = Array.isArray(domain.selectedCompetitors)
    ? (domain.selectedCompetitors as string[]).filter((c) => typeof c === 'string')
    : [];

  try {
    const topics = await generateTopicsViaLLM({
      url: domain.url,
      context: domain.context ?? '',
      industry: domain.industry,
      companySize: domain.companySize,
      country: domain.country,
      state: domain.state,
      competitors: competitorList,
      customKeywords: Array.isArray(seeds.keywords) ? seeds.keywords : [],
      customPrompts: Array.isArray(seeds.prompts) ? seeds.prompts : [],
    });

    if (topics.length === 0) throw new Error('LLM returned no topics');

    // Reset AI-generated rows for this domain. Keep isCustom=true rows.
    const existingAiKeywords = await prisma.keyword.findMany({
      where: { domainId, isCustom: false },
      select: { id: true },
    });
    const existingAiKeywordIds = existingAiKeywords.map((k) => k.id);
    if (existingAiKeywordIds.length > 0) {
      await prisma.generatedIntentPhrase.deleteMany({
        where: { domainId, keywordId: { in: existingAiKeywordIds } },
      });
      await prisma.keyword.deleteMany({ where: { id: { in: existingAiKeywordIds } } });
    }

    // Insert fresh AI-generated keywords + their prompts.
    const aiCustomSeedKeywords = new Set(
      (Array.isArray(seeds.keywords) ? seeds.keywords : []).map((k) => k.toLowerCase().trim())
    );

    const flatItems: FlatItem[] = [];
    for (const topic of topics) {
      const isCustom = aiCustomSeedKeywords.has(topic.keyword.toLowerCase().trim());
      const keyword = await prisma.keyword.upsert({
        where: { term_domainId: { term: topic.keyword, domainId } },
        update: { intent: topic.intent, isCustom },
        create: {
          term: topic.keyword,
          domainId,
          intent: topic.intent,
          isCustom,
          isSelected: false,
          volume: 0,
          difficulty: 'Medium',
          cpc: 0,
        },
      });
      flatItems.push({
        id: keyword.id,
        type: 'keyword',
        text: keyword.term,
        intent: keyword.intent,
        source: isCustom ? 'custom' : 'ai',
      });

      for (const promptText of topic.prompts) {
        const phrase = await prisma.generatedIntentPhrase.create({
          data: {
            domainId,
            keywordId: keyword.id,
            phrase: promptText,
            intent: topic.intent,
            isSelected: false,
            sources: ['ai'] as any,
          },
        });
        flatItems.push({
          id: phrase.id,
          type: 'prompt',
          text: phrase.phrase,
          intent: phrase.intent,
          source: 'ai',
          parentKeywordId: keyword.id,
        });
      }
    }

    // Layer in user-supplied custom prompts that the LLM didn't already cover.
    const customPromptTexts = Array.isArray(seeds.prompts) ? seeds.prompts : [];
    for (const promptText of customPromptTexts) {
      const trimmed = promptText.trim();
      if (!trimmed) continue;
      const exists = flatItems.some((i) => i.type === 'prompt' && i.text.toLowerCase() === trimmed.toLowerCase());
      if (exists) continue;
      const phrase = await prisma.generatedIntentPhrase.create({
        data: {
          domainId,
          phrase: trimmed,
          intent: 'Commercial',
          isSelected: false,
          sources: ['user-custom'] as any,
        },
      });
      flatItems.push({
        id: phrase.id,
        type: 'prompt',
        text: phrase.phrase,
        intent: 'Commercial',
        source: 'custom',
      });
    }

    await recordPhase(domainId, 'topics', 'completed', 100, undefined, { count: flatItems.length });
    return res.json({ domainId, items: flatItems });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Topic generation failed';
    await recordPhase(domainId, 'topics', 'failed', 0, message);
    return res.status(500).json({ error: message });
  }
});

/**
 * POST /api/wizard/domain/:id/select
 * Body: { keywordIds: number[], promptIds: number[] }
 * Sets isSelected for the given ids, clears it for everything else on the domain.
 * This is the action behind "Generate Report" — turns the user's checkbox state
 * into the selection that the AI-queries phase will run.
 */
router.post('/domain/:id/select', authenticateToken, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const domainId = Number(req.params.id);
  if (!domainId || Number.isNaN(domainId)) {
    return res.status(400).json({ error: 'Invalid domainId' });
  }
  const { keywordIds, promptIds } = (req.body ?? {}) as { keywordIds?: number[]; promptIds?: number[] };
  const domain = await prisma.domain.findUnique({ where: { id: domainId }, select: { id: true, userId: true } });
  if (!domain || domain.userId !== authReq.user.userId) {
    return res.status(404).json({ error: 'Domain not found' });
  }

  const kwIds = Array.isArray(keywordIds) ? keywordIds.filter((n): n is number => Number.isFinite(n)) : [];
  const phIds = Array.isArray(promptIds) ? promptIds.filter((n): n is number => Number.isFinite(n)) : [];

  await prisma.$transaction([
    prisma.keyword.updateMany({ where: { domainId }, data: { isSelected: false } }),
    prisma.generatedIntentPhrase.updateMany({ where: { domainId }, data: { isSelected: false } }),
    ...(kwIds.length > 0 ? [prisma.keyword.updateMany({ where: { id: { in: kwIds }, domainId }, data: { isSelected: true } })] : []),
    ...(phIds.length > 0 ? [prisma.generatedIntentPhrase.updateMany({ where: { id: { in: phIds }, domainId }, data: { isSelected: true } })] : []),
  ]);

  await recordPhase(domainId, 'select', 'completed', 100);
  return res.json({ domainId, selectedKeywords: kwIds.length, selectedPrompts: phIds.length });
});

/**
 * PATCH /api/wizard/domain/:id/selection-draft
 * Body: { keywordIds: number[], promptIds: number[] }
 * Debounced auto-save of the user's checkbox state on Step 4 so closing the
 * tab restores selections on next mount. Does NOT set isSelected on the rows.
 */
router.patch('/domain/:id/selection-draft', authenticateToken, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const domainId = Number(req.params.id);
  if (!domainId || Number.isNaN(domainId)) {
    return res.status(400).json({ error: 'Invalid domainId' });
  }
  const { keywordIds, promptIds } = (req.body ?? {}) as { keywordIds?: number[]; promptIds?: number[] };
  const domain = await prisma.domain.findUnique({ where: { id: domainId }, select: { id: true, userId: true } });
  if (!domain || domain.userId !== authReq.user.userId) {
    return res.status(404).json({ error: 'Domain not found' });
  }

  const draft = {
    keywordIds: Array.isArray(keywordIds) ? keywordIds.filter((n): n is number => Number.isFinite(n)) : [],
    promptIds: Array.isArray(promptIds) ? promptIds.filter((n): n is number => Number.isFinite(n)) : [],
  };
  await prisma.domain.update({ where: { id: domainId }, data: { selectionDraft: draft as any } });
  return res.json({ domainId, selectionDraft: draft });
});

export default router;
