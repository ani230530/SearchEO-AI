/**
 * Anti-abuse layer for the wizard.
 *
 * Three independent checks compose into `checkWizardAccess`:
 *
 *   1. Per-IP / per-cookie / per-fingerprint rate limit on starting NEW
 *      anonymous runs. Defense-in-depth against signup-flood attackers.
 *   2. Daily budget circuit breaker. Sums ApiSpendLog for the current UTC
 *      day; when total ≥ threshold, anonymous calls are denied. The
 *      already-authenticated path stays open so paying users aren't
 *      collateral damage.
 *   3. Per-user quota. `User.wizardRunsAllowed` minus runs counted in
 *      ApiSpendLog. Enforced for kind='user' identities; n/a for anon.
 *
 * Cost estimation
 * ---------------
 * `estimateOpenRouterCostUsd` is a static lookup keyed on model+token-count.
 * Numbers are approximate snapshots from the OpenRouter pricing page; the
 * goal is "right within 2x" so the budget breaker fires before runaway,
 * not exact cost accounting. If you migrate to per-token actual cost,
 * swap this function but keep the call signature.
 *
 * Determinism
 * -----------
 * All decision functions are pure and DB-only — no HTTP, no clock except
 * `Date.now()`. Easy to unit-test by stubbing prisma.
 */

import type { PrismaClient, WizardSession } from '../../generated/prisma';

// =============================================================================
// Cost estimation
// =============================================================================

/** Approximate USD per 1K input tokens, OpenRouter sticker prices May 2026. */
const OPENROUTER_INPUT_USD_PER_1K: Record<string, number> = {
  'openai/gpt-4o-mini': 0.00015,
  'openai/gpt-4o': 0.0025,
  'anthropic/claude-sonnet-4.5': 0.003,
  'anthropic/claude-3.5-sonnet': 0.003,
  'google/gemini-2.0-flash': 0.000075,
  'google/gemini-2.0-flash:online': 0.000075,
};

/** Approximate USD per 1K output tokens. */
const OPENROUTER_OUTPUT_USD_PER_1K: Record<string, number> = {
  'openai/gpt-4o-mini': 0.0006,
  'openai/gpt-4o': 0.01,
  'anthropic/claude-sonnet-4.5': 0.015,
  'anthropic/claude-3.5-sonnet': 0.015,
  'google/gemini-2.0-flash': 0.0003,
  'google/gemini-2.0-flash:online': 0.0003,
};

export interface OpenRouterCostInput {
  model: string;
  inputTokens?: number;
  outputTokens?: number;
}

/**
 * Estimate OpenRouter call cost in USD. Falls back to gpt-4o-mini pricing
 * for unknown models so the budget breaker still catches them.
 */
export const estimateOpenRouterCostUsd = (
  input: OpenRouterCostInput
): number => {
  const inPrice =
    OPENROUTER_INPUT_USD_PER_1K[input.model] ??
    OPENROUTER_INPUT_USD_PER_1K['openai/gpt-4o-mini'];
  const outPrice =
    OPENROUTER_OUTPUT_USD_PER_1K[input.model] ??
    OPENROUTER_OUTPUT_USD_PER_1K['openai/gpt-4o-mini'];
  const inCost = (input.inputTokens ?? 0) * (inPrice / 1000);
  const outCost = (input.outputTokens ?? 0) * (outPrice / 1000);
  return inCost + outCost;
};

/** Flat-rate cost per external service call (when no token info available). */
export const SERPAPI_CALL_USD = 0.005;
export const PAGESPEED_CALL_USD = 0.0;
export const N8N_CALL_USD = 0.0;

// =============================================================================
// Spend logging
// =============================================================================

export interface RecordSpendInput {
  service: 'openrouter' | 'serpapi' | 'pagespeed' | 'n8n';
  userId?: number | null;
  sessionId?: number | null;
  domainHost?: string | null;
  costEstimateUsd: number;
  metadata?: Record<string, unknown>;
}

/**
 * Log an external API call to ApiSpendLog. Never throws — spend tracking
 * shouldn't tear down a working request. Caller proceeds even if persistence
 * fails (we'd rather underreport than break the wizard).
 */
export async function recordApiSpend(
  prisma: PrismaClient,
  input: RecordSpendInput
): Promise<void> {
  try {
    await prisma.apiSpendLog.create({
      data: {
        service: input.service,
        userId: input.userId ?? null,
        sessionId: input.sessionId ?? null,
        domainHost: input.domainHost ?? null,
        costEstimateUsd: input.costEstimateUsd,
        metadata: (input.metadata ?? null) as any,
      },
    });
  } catch (err) {
    console.warn('[antiAbuse] recordApiSpend failed', { input, err });
  }
}

// =============================================================================
// Daily budget circuit breaker
// =============================================================================

/** Default daily budget threshold in USD. Overridable via env. */
export const DAILY_BUDGET_USD = Number(
  process.env.WIZARD_DAILY_BUDGET_USD ?? 50
);

/** When daily spend ≥ this fraction of the budget, anon requests are
 *  shed before paid ones. Default 80% — leaves runway for paying users. */
export const ANON_SHEDDING_FRACTION = 0.8;

/** Start-of-UTC-day for the supplied timestamp. */
const startOfUtcDay = (at: Date): Date => {
  const d = new Date(at);
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

export interface BudgetStatus {
  spentUsd: number;
  remainingUsd: number;
  capUsd: number;
  /** True when total daily spend has hit the absolute cap (100%). */
  totalCapReached: boolean;
  /** True when anon shedding fraction has been reached (≥80%). Anon
   *  identities should be denied. */
  anonShedding: boolean;
}

/** Sum ApiSpendLog.costEstimateUsd for the current UTC day. */
export async function getDailyBudgetStatus(
  prisma: PrismaClient,
  capUsd: number = DAILY_BUDGET_USD,
  now: Date = new Date()
): Promise<BudgetStatus> {
  const since = startOfUtcDay(now);
  const agg = await prisma.apiSpendLog.aggregate({
    _sum: { costEstimateUsd: true },
    where: { createdAt: { gte: since } },
  });
  const spent = agg._sum.costEstimateUsd ?? 0;
  const remaining = Math.max(0, capUsd - spent);
  return {
    spentUsd: spent,
    remainingUsd: remaining,
    capUsd,
    totalCapReached: spent >= capUsd,
    anonShedding: spent >= capUsd * ANON_SHEDDING_FRACTION,
  };
}

// =============================================================================
// Rate limits — per-IP, per-cookie, per-fingerprint, per-day
// =============================================================================

/** Anonymous-side cap: 1 fresh wizard run per (cookie, ip, fingerprint)
 *  per 24h. Whichever fires first denies. */
export const ANON_RUNS_PER_IDENTITY_PER_DAY = Number(
  process.env.WIZARD_ANON_DAILY_LIMIT ?? 1
);

/** Soft per-authenticated-user cooldown to avoid double-clicks running
 *  twice. 30s is plenty for legit UX and stops most accidental dupes. */
export const USER_COOLDOWN_MS = 30_000;

export interface RateLimitDecision {
  allowed: boolean;
  reason?: string;
  /** Suggested HTTP code when blocking. 429 for rate-limited, 402 for
   *  budget/quota exceeded. */
  status?: number;
}

const ALLOWED: RateLimitDecision = { allowed: true };

/**
 * Decide whether an anonymous identity can start a new wizard run.
 *
 * "Start a new run" means transitioning the session's step from `idle` →
 * something. Subsequent calls within the same session (resume, fetch
 * cached step) are NOT blocked.
 */
export async function checkAnonRunRateLimit(
  prisma: PrismaClient,
  session: WizardSession,
  ip: string | null,
  fingerprintHash: string | null,
  now: Date = new Date()
): Promise<RateLimitDecision> {
  const dayStart = startOfUtcDay(now);

  // Same cookie can only mint one fresh start per day — second attempt
  // either resumes or is denied.
  // We count `crawlData != null` as "this cookie already started a run today".
  if (session.crawlData !== null && session.createdAt >= dayStart) {
    return {
      allowed: false,
      reason: 'This browser has already used its free audit today. Sign up to run more.',
      status: 429,
    };
  }

  // Per-IP count of sessions created today (any cookie).
  if (ip) {
    const ipCount = await prisma.wizardSession.count({
      where: { ip, createdAt: { gte: dayStart } },
    });
    if (ipCount > ANON_RUNS_PER_IDENTITY_PER_DAY) {
      return {
        allowed: false,
        reason: 'Too many audits from this network today. Try again tomorrow or sign up.',
        status: 429,
      };
    }
  }

  if (fingerprintHash) {
    const fpCount = await prisma.wizardSession.count({
      where: { fingerprintHash, createdAt: { gte: dayStart } },
    });
    if (fpCount > ANON_RUNS_PER_IDENTITY_PER_DAY) {
      return {
        allowed: false,
        reason: 'Too many audits from this device today. Try again tomorrow or sign up.',
        status: 429,
      };
    }
  }

  return ALLOWED;
}

/**
 * Decide whether an authenticated user can start a new wizard run.
 *
 * Checks two things:
 *   - `lastWizardRunAt` cooldown — prevents accidental double-runs.
 *   - `wizardRunsAllowed` minus historical runs in ApiSpendLog (proxy for
 *     "number of paid wizard runs this user has had"). When the quota is
 *     reached we deny with status 402 (Payment Required) so the UI can
 *     prompt to upgrade.
 */
export async function checkUserRunQuota(
  prisma: PrismaClient,
  userId: number,
  now: Date = new Date()
): Promise<RateLimitDecision> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return { allowed: false, reason: 'User not found', status: 401 };
  }

  if (user.lastWizardRunAt) {
    const since = now.getTime() - user.lastWizardRunAt.getTime();
    if (since < USER_COOLDOWN_MS) {
      return {
        allowed: false,
        reason: 'Please wait a moment before starting another audit.',
        status: 429,
      };
    }
  }

  // Count this user's wizard "runs" — proxied by openrouter spend rows.
  // Each Step-5 run produces multiple openrouter rows; we count distinct
  // (userId, domainHost, day) tuples instead, but that's hard in a single
  // query without a window function. For the backbone we use a simpler
  // proxy: the number of openrouter rows / 70 (rough per-run call count).
  // This is intentionally approximate — exact accounting will move to a
  // dedicated `WizardRunLog` table in the follow-up.
  const spendRows = await prisma.apiSpendLog.count({
    where: { userId, service: 'openrouter' },
  });
  const runsUsed = Math.ceil(spendRows / 70);
  if (runsUsed >= user.wizardRunsAllowed) {
    return {
      allowed: false,
      reason: `You've used all ${user.wizardRunsAllowed} of your audits. Upgrade to run more.`,
      status: 402,
    };
  }

  return ALLOWED;
}

// =============================================================================
// Composite decision
// =============================================================================

export interface WizardAccessInput {
  /** Identity from authenticateOrSession middleware. */
  identity:
    | { kind: 'user'; userId: number; email: string }
    | { kind: 'anon'; session: WizardSession };
  /** Source IP from extractIp(req). */
  ip: string | null;
  /** Optional client fingerprint header. */
  fingerprintHash?: string | null;
  /**
   * Whether the request would TRIGGER a paid external call. When false,
   * cache-only reads bypass all checks (resume/refresh views don't burn
   * any anti-abuse budget).
   */
  triggersPaidCall: boolean;
  /** Dependency-injectable now for testing. */
  now?: Date;
}

/**
 * The single decision used by wizard route handlers. Returns the first
 * blocking reason. Caller respects the .status code in the response.
 */
export async function checkWizardAccess(
  prisma: PrismaClient,
  input: WizardAccessInput
): Promise<RateLimitDecision> {
  const now = input.now ?? new Date();

  // Cache-only paths never burn budget; let them through.
  if (!input.triggersPaidCall) return ALLOWED;

  // Daily budget breaker. Hard cap denies everyone; anon-shedding
  // denies anon only.
  const budget = await getDailyBudgetStatus(prisma, DAILY_BUDGET_USD, now);
  if (budget.totalCapReached) {
    return {
      allowed: false,
      reason: 'Daily audit capacity reached. Try again tomorrow.',
      status: 503,
    };
  }
  if (input.identity.kind === 'anon' && budget.anonShedding) {
    return {
      allowed: false,
      reason: 'Free audit capacity full for today. Sign up to be queued.',
      status: 503,
    };
  }

  // Per-identity checks.
  if (input.identity.kind === 'anon') {
    return checkAnonRunRateLimit(
      prisma,
      input.identity.session,
      input.ip,
      input.fingerprintHash ?? null,
      now
    );
  }

  return checkUserRunQuota(prisma, input.identity.userId, now);
}
