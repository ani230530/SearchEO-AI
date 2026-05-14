/**
 * Wizard session service — backbone for the anonymous AI Visibility audit.
 *
 * Design notes
 * ------------
 * - Anonymous users carry an opaque random token in an HTTP-only cookie.
 *   The token itself is never stored server-side; we store sha256(token) in
 *   WizardSession.cookieTokenHash and look up by hash. A leaked cookie can
 *   be revoked by deleting the row, and no signing/HMAC step is needed.
 * - Wizard work is stored as JSON snapshots on the WizardSession row, NOT
 *   on Domain. This keeps the 41-site `Domain.userId` query surface
 *   completely untouched until signup, at which point the linkage handler
 *   materializes the snapshot into real Domain / CrawlSnapshot / etc rows.
 * - Session TTL: 24h sliding (refreshed on every touch). After expiry the
 *   row is garbage-collectible by a sweeper job.
 *
 * Public surface
 * --------------
 *   issueSession(prisma, ctx)         — mint a new session + token
 *   lookupSession(prisma, token)      — verify a cookie token, return session or null
 *   touchSession(prisma, id)          — slide the expiry forward on every use
 *   linkSessionToUser(prisma, sid, u) — call from signup; reassigns ownership
 *   COOKIE_NAME / TTL_MS              — for the cookie issuance middleware
 */

import * as crypto from 'crypto';
import type { PrismaClient, WizardSession } from '../../generated/prisma';

export const WIZARD_COOKIE_NAME = 'aiv_ws';
export const WIZARD_SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24h sliding

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
  /** Cookie expiry as a JS Date. */
  expiresAt: Date;
}

/** sha256 hex of the cookie token. Used as the DB lookup key. */
export const hashCookieToken = (token: string): string =>
  crypto.createHash('sha256').update(token).digest('hex');

/** crypto.randomBytes wrapped to base64url for cookie-safe characters. */
export const generateCookieToken = (): string =>
  crypto.randomBytes(32).toString('base64url');

/** Issue a new wizard session. Returns the token to set as a cookie. */
export async function issueSession(
  prisma: PrismaClient,
  ctx: IssueSessionContext = {}
): Promise<IssuedSession> {
  const token = generateCookieToken();
  const cookieTokenHash = hashCookieToken(token);
  const expiresAt = new Date(Date.now() + WIZARD_SESSION_TTL_MS);

  const session = await prisma.wizardSession.create({
    data: {
      cookieTokenHash,
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
      fingerprintHash: ctx.fingerprintHash ?? null,
      expiresAt,
    },
  });

  return { token, sessionId: session.id, expiresAt };
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
  /** Number of Domain rows that were materialized from the snapshot. */
  domainsCreated: number;
  /** The primary domain id (if any) created from the snapshot — the wizard
   *  results page can redirect here. */
  primaryDomainId: number | null;
}

/**
 * Link a session to a freshly-signed-up user.
 *
 * Behavior in this backbone build
 * -------------------------------
 * - Marks the WizardSession as linked (linkedUserId, linkedAt).
 * - If the session has a domainHost recorded, creates a Domain row for the
 *   new user (or attaches to an existing one with the same userId+host).
 * - Records linkedDomainId on the session for downstream redirect.
 *
 * What's intentionally deferred
 * ------------------------------
 * - Crawl / competitor / topic / prompt rows materialized from snapshots.
 *   Right now we only create the Domain shell. The follow-up session will
 *   walk crawlData/competitorsData/topicsData and write into CrawlSnapshot
 *   / Competitor / Prompt rows. That requires understanding the JSON
 *   shapes each wizard step produces in anon mode, which itself is built
 *   in the follow-up. The shell is what unblocks the linkage test.
 *
 * Idempotency
 * -----------
 * Safe to call twice. Second call is a no-op when linkedUserId already set.
 */
export async function linkSessionToUser(
  prisma: PrismaClient,
  sessionId: number,
  userId: number
): Promise<LinkSessionResult> {
  const session = await prisma.wizardSession.findUnique({
    where: { id: sessionId },
  });
  if (!session) {
    return { linked: false, domainsCreated: 0, primaryDomainId: null };
  }
  if (session.linkedUserId !== null) {
    // Already linked. Idempotent return — surface the previously materialized
    // domain id so the caller can still redirect.
    return {
      linked: true,
      domainsCreated: 0,
      primaryDomainId: session.linkedDomainId ?? null,
    };
  }

  let primaryDomainId: number | null = null;
  let domainsCreated = 0;

  // Materialize the Domain shell from the snapshot's host. Skip if no host
  // was ever entered (user hit signup before Step 1 even submitted).
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
          isCompanyDomain: false, // anon audit does NOT auto-promote
        },
      });
      primaryDomainId = created.id;
      domainsCreated = 1;
    }
  }

  await prisma.wizardSession.update({
    where: { id: sessionId },
    data: {
      linkedUserId: userId,
      linkedDomainId: primaryDomainId,
      linkedAt: new Date(),
    },
  });

  return { linked: true, domainsCreated, primaryDomainId };
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
 * Production posture: HttpOnly + Secure + SameSite=Lax. In dev (NODE_ENV !=
 * 'production') Secure is dropped so localhost works without HTTPS.
 */
export function buildSetCookieHeader(token: string, expiresAt: Date): string {
  const parts = [
    `${WIZARD_COOKIE_NAME}=${encodeURIComponent(token)}`,
    `Path=/`,
    `Expires=${expiresAt.toUTCString()}`,
    `Max-Age=${Math.floor((expiresAt.getTime() - Date.now()) / 1000)}`,
    `HttpOnly`,
    `SameSite=Lax`,
  ];
  if (process.env.NODE_ENV === 'production') parts.push('Secure');
  return parts.join('; ');
}

/** Header value that clears the cookie. Used post-signup once the session
 *  is linked and the cookie is no longer needed. */
export function buildClearCookieHeader(): string {
  const parts = [
    `${WIZARD_COOKIE_NAME}=`,
    `Path=/`,
    `Expires=Thu, 01 Jan 1970 00:00:00 GMT`,
    `Max-Age=0`,
    `HttpOnly`,
    `SameSite=Lax`,
  ];
  if (process.env.NODE_ENV === 'production') parts.push('Secure');
  return parts.join('; ');
}
