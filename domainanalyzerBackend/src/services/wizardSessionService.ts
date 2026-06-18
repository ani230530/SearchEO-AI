/**
 * Wizard session service — backbone for the anonymous AI Visibility audit.
 *
 * Identity model
 * --------------
 * Anonymous users carry an opaque random token in an HTTP-only cookie.
 * sha256(token) lives in WizardSession.cookieTokenHash; the plaintext
 * token is never persisted. A leaked cookie can be revoked by deleting
 * the row.
 *
 * Each WizardSession also owns a "shadow User" row created at issue time
 * (anon-{token-fragment}@system.local, unusable password). The shadow
 * user is the owner of all Domain / CrawlSnapshot / Competitor / Prompt
 * rows the anon browser produces during Steps 1-4. That makes the
 * existing wizard schema work unchanged — every query that does
 * `WHERE userId = X` continues to work; X is just the shadow user during
 * the anon flow.
 *
 * On signup the linkage handler TRANSFERS Domain.userId from the shadow
 * user to the real new user (a single UPDATE, cascading to all the
 * related Domain-scoped rows by FK ownership). The shadow user is then
 * deleted. Idempotent.
 *
 * Public surface
 * --------------
 *   issueSession(prisma, ctx)         — mint a new session + token + shadow user
 *   lookupSession(prisma, token)      — verify a cookie token, return session or null
 *   touchSession(prisma, id)          — slide the expiry forward on every use
 *   linkSessionToUser(prisma, sid, u) — transfer Domain ownership shadow→real
 *   COOKIE_NAME / TTL_MS              — for the cookie issuance middleware
 */

import * as crypto from 'crypto';
import type { PrismaClient, Prisma, WizardSession } from '../../generated/prisma';

export const WIZARD_COOKIE_NAME = 'aiv_ws';
export const WIZARD_SESSION_HEADER = 'x-wizard-session';
export const WIZARD_SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24h sliding

/** Local-part prefix on shadow user emails. Keeps them clearly separable
 *  from real signups in audits and ops queries. */
export const SHADOW_USER_EMAIL_PREFIX = 'anon-';
export const SHADOW_USER_EMAIL_DOMAIN = '@system.local';
/** bcrypt-shaped placeholder that nothing can match. The shadow user can
 *  never log in via /api/auth/login; the only way to assume that identity
 *  is via the cookie. */
const SHADOW_USER_PASSWORD_PLACEHOLDER = '__shadow_user_no_login__';

export interface IssueSessionContext {
  ip?: string | null;
  userAgent?: string | null;
  fingerprintHash?: string | null;
}

export interface IssuedSession {
  /** Opaque token to set as cookie value. NEVER persisted in plaintext. */
  token: string;
  /** Row id of the new WizardSession. */
  sessionId: number;
  /** Row id of the shadow User created for this session. Wizard handlers
   *  use this as the "current user id" for anon callers. */
  anonUserId: number;
  /** Cookie expiry as a JS Date. */
  expiresAt: Date;
}

/** sha256 hex of the cookie token. Used as the DB lookup key. */
export const hashCookieToken = (token: string): string =>
  crypto.createHash('sha256').update(token).digest('hex');

/** crypto.randomBytes wrapped to base64url for cookie-safe characters. */
export const generateCookieToken = (): string =>
  crypto.randomBytes(32).toString('base64url');

/**
 * Issue a new wizard session.
 *
 * Creates two rows atomically in a single transaction:
 *   1. A shadow `User` row representing the anonymous browser.
 *   2. A `WizardSession` row carrying the cookie hash + anonUserId.
 *
 * If either insert fails the transaction rolls back and no half-state is
 * left in the DB. The shadow user's email is deterministic-by-token
 * (anon-<sha256-first-16-chars>@system.local) so a race that re-issues
 * with the same token doesn't collide on User.email unique.
 */
export async function issueSession(
  prisma: PrismaClient,
  ctx: IssueSessionContext = {}
): Promise<IssuedSession> {
  const token = generateCookieToken();
  const cookieTokenHash = hashCookieToken(token);
  const expiresAt = new Date(Date.now() + WIZARD_SESSION_TTL_MS);

  // Email derived from the hash so a same-token replay maps to the same
  // shadow user (unique-email constraint would otherwise reject a second
  // create on retry).
  const shadowEmail =
    `${SHADOW_USER_EMAIL_PREFIX}${cookieTokenHash.slice(0, 16)}${SHADOW_USER_EMAIL_DOMAIN}`;

  const { session, anonUserId } = await prisma.$transaction(async (tx) => {
    const anonUser = await tx.user.create({
      data: {
        email: shadowEmail,
        password: SHADOW_USER_PASSWORD_PLACEHOLDER,
        // Mark shadow users with a non-null name we recognize in audits.
        name: 'Anonymous wizard session',
        // Inherits all defaults (wizardRunsAllowed=1 etc); the shadow user
        // is never going to consume that quota — it's our handle, not a
        // real account.
      },
    });
    const session = await tx.wizardSession.create({
      data: {
        cookieTokenHash,
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
        fingerprintHash: ctx.fingerprintHash ?? null,
        anonUserId: anonUser.id,
        expiresAt,
      },
    });
    return { session, anonUserId: anonUser.id };
  });

  return { token, sessionId: session.id, anonUserId, expiresAt };
}

/**
 * Look up a session by cookie token. Returns null when:
 *   - token is empty / malformed
 *   - no matching row in DB
 *   - row is past its expiresAt
 *   - row has already been linked to a user (use the JWT instead)
 *
 * Callers that need to read+touch atomically should compose lookupSession
 * with touchSession in their handler.
 */
export async function lookupSession(
  prisma: PrismaClient,
  token: string | null | undefined
): Promise<WizardSession | null> {
  if (!token || typeof token !== 'string' || token.length < 16) return null;
  const cookieTokenHash = hashCookieToken(token);
  const session = await prisma.wizardSession.findUnique({
    where: { cookieTokenHash },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now()) return null;
  if (session.linkedUserId !== null) return null;
  return session;
}

/** Slide the expiry forward. Best-effort; failures don't bubble. */
export async function touchSession(
  prisma: PrismaClient,
  sessionId: number
): Promise<void> {
  const newExpiry = new Date(Date.now() + WIZARD_SESSION_TTL_MS);
  try {
    await prisma.wizardSession.update({
      where: { id: sessionId },
      data: { expiresAt: newExpiry },
    });
  } catch (err) {
    console.warn('[wizardSession] touch failed', { sessionId, err });
  }
}

export interface LinkSessionResult {
  /** Whether anything was linked at all. */
  linked: boolean;
  /** Number of Domain rows whose ownership was transferred from shadow→real. */
  domainsTransferred: number;
  /** The primary domain id (if any) — the wizard results page can redirect here. */
  primaryDomainId: number | null;
}

/**
 * Link a session to a freshly-signed-up user.
 *
 * Behavior
 * --------
 *   - Marks the WizardSession as linked (linkedUserId, linkedAt).
 *   - Transfers every Domain currently owned by the shadow user → the
 *     new real user. Domain children (CrawlSnapshot, Competitor, Prompt,
 *     Keyword, AiRun, etc.) follow by FK; their ownership is implicit
 *     in `Domain.userId` so the single UPDATE moves the whole graph.
 *   - Promotes the primary (wizard-target) Domain to the user's company
 *     domain when they don't already have one — see ensureCompanyDomain.
 *   - Deletes the shadow user row (cleanup; it has no more domains).
 *   - Records linkedDomainId on the session for downstream redirect.
 *
 * Idempotency
 * -----------
 * Safe to call twice. Second call is a no-op when linkedUserId already set.
 *
 * Edge case: if a real user already owns a Domain for the same host we'd
 * collide on the (userId, host) unique index. We resolve by skipping the
 * transfer for that specific host (the real user's existing Domain wins;
 * the shadow's work for that host becomes orphaned and is GCed with the
 * shadow user delete).
 */
/**
 * Promote `domainId` to be the user's company domain — but only when the
 * user doesn't already have one.
 *
 * Rationale: the wizard target is the domain the user signed up around, so
 * on a fresh signup it should become their company domain (the Campaign /
 * Worksheet / Publish surface all key off `isCompanyDomain=true`). We never
 * clobber an existing company domain — an established user who re-links a
 * wizard session via Google login keeps the choice they already made.
 *
 * Maintains the app-level single-company-domain invariant: the schema permits
 * multiple `isCompanyDomain=true` rows, but every reader uses `findFirst`, so
 * we only ever flip the flag on when there is no company domain at all.
 *
 * Accepts a transaction client so the transfer path can run it atomically;
 * the full PrismaClient (legacy path) is structurally compatible.
 */
async function ensureCompanyDomain(
  tx: Prisma.TransactionClient,
  userId: number,
  domainId: number | null
): Promise<void> {
  if (domainId === null) return;
  const existing = await tx.domain.findFirst({
    where: { userId, isCompanyDomain: true },
    select: { id: true },
  });
  if (existing) return; // user already has a company domain — respect it
  await tx.domain.update({
    where: { id: domainId },
    data: { isCompanyDomain: true },
  });
}

export async function linkSessionToUser(
  prisma: PrismaClient,
  sessionId: number,
  userId: number
): Promise<LinkSessionResult> {
  const session = await prisma.wizardSession.findUnique({
    where: { id: sessionId },
  });
  if (!session) {
    return { linked: false, domainsTransferred: 0, primaryDomainId: null };
  }
  if (session.linkedUserId !== null) {
    // Already linked. Idempotent return — surface the previously transferred
    // domain id so the caller can still redirect.
    return {
      linked: true,
      domainsTransferred: 0,
      primaryDomainId: session.linkedDomainId ?? null,
    };
  }

  // No shadow user means this session pre-dates the shadow-user migration.
  // Fall back to the old "materialize a Domain shell from the host snapshot"
  // path so the linkage still works for in-flight sessions during deploy.
  if (session.anonUserId === null) {
    return await legacyMaterializeFromSnapshot(prisma, session, userId);
  }

  const result = await prisma.$transaction(async (tx) => {
    // Pull every Domain currently owned by the shadow user.
    const shadowDomains = await tx.domain.findMany({
      where: { userId: session.anonUserId! },
      select: { id: true, host: true },
    });

    let domainsTransferred = 0;
    let primaryDomainId: number | null = null;
    const collidedDomainIds: number[] = [];

    for (const d of shadowDomains) {
      // Does the real user already own a Domain for this host?
      const conflicting = await tx.domain.findUnique({
        where: { userId_host: { userId, host: d.host } },
      });
      if (conflicting) {
        // Real user wins; mark the shadow's row for deletion below.
        collidedDomainIds.push(d.id);
        // Use the real user's existing domain as the redirect target for
        // the first iteration so the user lands somewhere sensible.
        if (primaryDomainId === null) primaryDomainId = conflicting.id;
        continue;
      }
      await tx.domain.update({
        where: { id: d.id },
        data: { userId },
      });
      domainsTransferred++;
      if (primaryDomainId === null) primaryDomainId = d.id;
    }

    // Clean up the colliding shadow-side Domains so the shadow user can
    // be deleted without FK violations.
    if (collidedDomainIds.length > 0) {
      await tx.domain.deleteMany({ where: { id: { in: collidedDomainIds } } });
    }

    // Promote the wizard target to the user's company domain. Runs after the
    // transfers/cleanup above so its findFirst sees the post-transfer state
    // (transferred domains are isCompanyDomain=false; only a pre-existing
    // real-user company domain can short-circuit it).
    await ensureCompanyDomain(tx, userId, primaryDomainId);

    // Mark the session linked + record the primary domain.
    await tx.wizardSession.update({
      where: { id: sessionId },
      data: {
        linkedUserId: userId,
        linkedDomainId: primaryDomainId,
        linkedAt: new Date(),
      },
    });

    // Delete the shadow user. Its email-unique slot is freed; downstream
    // FKs were either moved (Domain.userId update above) or cascaded
    // (WizardSession.anonUserId is ON DELETE SET NULL).
    await tx.user.delete({ where: { id: session.anonUserId! } });

    return { domainsTransferred, primaryDomainId };
  });

  return {
    linked: true,
    domainsTransferred: result.domainsTransferred,
    primaryDomainId: result.primaryDomainId,
  };
}

/**
 * Legacy fallback for sessions issued before the shadow-user migration.
 * Replicates the old behavior of materializing a Domain shell from the
 * session's domainUrl/domainHost snapshot. Will only fire during the
 * brief window after deploy when older sessions are still in flight.
 */
async function legacyMaterializeFromSnapshot(
  prisma: PrismaClient,
  session: WizardSession,
  userId: number
): Promise<LinkSessionResult> {
  let primaryDomainId: number | null = null;
  let domainsTransferred = 0;

  if (session.domainHost && session.domainUrl) {
    const existing = await prisma.domain.findUnique({
      where: { userId_host: { userId, host: session.domainHost } },
    });
    if (existing) {
      primaryDomainId = existing.id;
    } else {
      const created = await prisma.domain.create({
        data: {
          userId,
          host: session.domainHost,
          url: session.domainUrl,
          isCompanyDomain: false,
        },
      });
      primaryDomainId = created.id;
      domainsTransferred = 1;
    }
  }

  // Same company-domain promotion as the transfer path. PrismaClient is
  // structurally compatible with the TransactionClient param.
  await ensureCompanyDomain(prisma, userId, primaryDomainId);

  await prisma.wizardSession.update({
    where: { id: session.id },
    data: {
      linkedUserId: userId,
      linkedDomainId: primaryDomainId,
      linkedAt: new Date(),
    },
  });

  return { linked: true, domainsTransferred, primaryDomainId };
}

/**
 * Parse a Cookie header into a flat map. Used by middleware that can't
 * pull cookie-parser as a dep. Returns {} for empty/missing input.
 *
 * Handles standard `key=value; key2=value2` format. Trims whitespace,
 * decodes URL-encoded values, ignores malformed pairs.
 */
export function parseCookieHeader(
  header: string | undefined | null
): Record<string, string> {
  if (!header || typeof header !== 'string') return {};
  const out: Record<string, string> = {};
  for (const piece of header.split(';')) {
    const eq = piece.indexOf('=');
    if (eq <= 0) continue;
    const k = piece.slice(0, eq).trim();
    const v = piece.slice(eq + 1).trim();
    if (!k) continue;
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Build a Set-Cookie header value for the wizard session.
 *
 * Production posture: HttpOnly + Secure + SameSite=None.
 *   - SameSite=None is required because the frontend (e.g. *.vercel.app)
 *     and backend (*.onrender.com) sit on different sites in production.
 *     SameSite=Lax would block the cookie from being sent on
 *     cross-site fetch, and our CORS allowlist already restricts who
 *     can talk to us — so SameSite=None doesn't widen the attack
 *     surface beyond what CORS already controls.
 *   - Browsers (Chrome / Firefox / Safari) reject SameSite=None unless
 *     the Secure flag is also set. Production HTTPS satisfies this.
 *
 * Development posture: SameSite=Lax + no Secure. Localhost is same-
 * site by default and we want HTTP to work without TLS.
 */
export function buildSetCookieHeader(token: string, expiresAt: Date): string {
  const isProd = process.env.NODE_ENV === 'production';
  const parts = [
    `${WIZARD_COOKIE_NAME}=${encodeURIComponent(token)}`,
    `Path=/`,
    `Expires=${expiresAt.toUTCString()}`,
    `Max-Age=${Math.floor((expiresAt.getTime() - Date.now()) / 1000)}`,
    `HttpOnly`,
    `SameSite=${isProd ? 'None' : 'Lax'}`,
  ];
  if (isProd) parts.push('Secure');
  return parts.join('; ');
}

/** Header value that clears the cookie. Used post-signup once the session
 *  is linked and the cookie is no longer needed. The SameSite + Secure
 *  attributes must match the Set-Cookie that issued the cookie or the
 *  browser refuses to clear it. */
export function buildClearCookieHeader(): string {
  const isProd = process.env.NODE_ENV === 'production';
  const parts = [
    `${WIZARD_COOKIE_NAME}=`,
    `Path=/`,
    `Expires=Thu, 01 Jan 1970 00:00:00 GMT`,
    `Max-Age=0`,
    `HttpOnly`,
    `SameSite=${isProd ? 'None' : 'Lax'}`,
  ];
  if (isProd) parts.push('Secure');
  return parts.join('; ');
}
