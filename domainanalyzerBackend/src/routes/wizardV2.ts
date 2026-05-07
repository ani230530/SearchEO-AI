/**
 * Wizard v2 — read-only endpoints
 *
 * - POST /api/wizard/validate         — HTTP HEAD + robots.txt + DB existence (no writes)
 * - GET  /api/wizard/domain/:id/state — phase status + profile + selection draft (resume support)
 *
 * Mutations live in other PRs (atomic crawl/competitors/topics phases).
 */

import { Router, Request, Response } from 'express';
import { PrismaClient } from '../../generated/prisma';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';

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

export default router;
