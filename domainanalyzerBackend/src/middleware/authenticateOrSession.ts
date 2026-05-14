/**
 * authenticateOrSession — middleware that resolves identity from either a
 * JWT Bearer token (authenticated user) OR a wizard session cookie
 * (anonymous funnel). Used by wizard routes that accept both identities.
 *
 * Why a single middleware
 * -----------------------
 * Step 1-4 of the anonymous AI Visibility audit must work for unauthenticated
 * browsers. Step 5 (and SerpAPI in Step 3) is gated to authenticated users.
 * Rather than maintain two parallel route trees, every wizard endpoint sits
 * behind this middleware and reads `req.identity` to decide what it can do.
 *
 * Order of precedence
 * -------------------
 * 1. If a valid Bearer token is present → kind='user'. Cookie is ignored.
 * 2. Else if a valid wizard cookie is present → kind='anon'. Session is
 *    touched (sliding TTL) and attached to req.identity.session.
 * 3. Else → we mint a brand-new anonymous session and SET the cookie on the
 *    response. The handler runs with kind='anon' for this very first call.
 *
 * Capability flags
 * ----------------
 * `canRunPaidStep` — true only for `kind='user'`. Wizard handlers use this
 * to gate Step 5 / SerpAPI / any external paid call. Anonymous identities
 * can read cached results, do cheap synthesis, and persist snapshots — but
 * they cannot trigger paid external calls.
 *
 * Anti-abuse hooks (built in adjacent module, not here)
 * -----------------------------------------------------
 * Rate-limit + budget breaker are applied AFTER identity resolution by a
 * separate `enforceWizardQuota` middleware. This module's only job is to
 * answer "who is this request?" — not "are they allowed to do the thing?".
 */

import type { Request, Response, NextFunction } from 'express';
import { PrismaClient, WizardSession } from '../../generated/prisma';
import { authService, JWTPayload } from '../services/authService';
import {
  WIZARD_COOKIE_NAME,
  buildSetCookieHeader,
  issueSession,
  lookupSession,
  parseCookieHeader,
  touchSession,
} from '../services/wizardSessionService';

const prisma = new PrismaClient();

export type WizardIdentity =
  | { kind: 'user'; userId: number; email: string }
  | { kind: 'anon'; session: WizardSession };

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Identity resolved by authenticateOrSession. Always set by the time
       *  a wizard handler runs. */
      identity?: WizardIdentity;
    }
  }
}

/** Extract the client IP. Honors X-Forwarded-For in dev/prod proxies. */
const extractIp = (req: Request): string | null => {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length > 0) {
    return xff.split(',')[0].trim();
  }
  if (Array.isArray(xff) && xff.length > 0) {
    return String(xff[0]).split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || null;
};

/** Fingerprint header captured client-side (X-Wizard-Fingerprint). Optional
 *  — anon flow still works without it; reuse flagger is just blinder. */
const extractFingerprint = (req: Request): string | null => {
  const fp = req.headers['x-wizard-fingerprint'];
  if (typeof fp === 'string' && fp.length > 0 && fp.length < 256) return fp;
  return null;
};

/** True when the identity is `kind='user'`. Type-narrowing helper for
 *  handlers that need full access. */
export const isUserIdentity = (
  identity: WizardIdentity | undefined
): identity is Extract<WizardIdentity, { kind: 'user' }> =>
  identity?.kind === 'user';

/** Capability gate: only authenticated users may trigger paid external
 *  calls. Anonymous identities are limited to cached + cheap synthesis. */
export const canRunPaidStep = (
  identity: WizardIdentity | undefined
): boolean => identity?.kind === 'user';

export interface AuthenticateOrSessionOptions {
  /**
   * When true (default), if no JWT and no cookie are present we mint a new
   * anonymous session and set its cookie on the response. When false, the
   * middleware passes through with `req.identity = undefined`, letting the
   * handler decide what to do for true public access (e.g. landing audit
   * that doesn't need any persistence).
   */
  issueWhenMissing?: boolean;
  /**
   * When true, the handler is dual-path: JWT preferred, cookie acceptable.
   * When false, JWT is required and the cookie is ignored (a permissive
   * variant of `authenticateToken` that uses this module's plumbing).
   */
  allowAnonymous?: boolean;
  /** Dependency-injectable prisma instance for tests. */
  prisma?: PrismaClient;
}

/**
 * The middleware. Behavior matrix:
 *
 *   allowAnonymous=true (default for wizard routes):
 *     - Bearer token present + valid → req.identity = user
 *     - Bearer token present + invalid → 401
 *     - No Bearer + valid cookie → req.identity = anon (touch session)
 *     - No Bearer + no/expired cookie + issueWhenMissing=true → mint, set
 *       cookie, req.identity = anon
 *     - No Bearer + no cookie + issueWhenMissing=false → req.identity =
 *       undefined, next()
 *
 *   allowAnonymous=false:
 *     - Bearer token required, behaves like authenticateToken.
 */
export const authenticateOrSession = (
  options: AuthenticateOrSessionOptions = {}
) => {
  const allowAnonymous = options.allowAnonymous ?? true;
  const issueWhenMissing = options.issueWhenMissing ?? true;
  const db = options.prisma ?? prisma;

  return async (req: Request, res: Response, next: NextFunction) => {
    // 1) Try Bearer first.
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];
    if (token) {
      try {
        const decoded: JWTPayload = await authService.verifyToken(token);
        req.user = decoded;
        req.identity = {
          kind: 'user',
          userId: decoded.userId,
          email: decoded.email,
        };
        return next();
      } catch (err) {
        // Token was sent but invalid. Don't fall through to anonymous —
        // that's how attackers smuggle a bad token to silently downgrade.
        const expired = err instanceof Error && /expired/i.test(err.message);
        return res.status(401).json({
          error: expired ? 'Token expired' : 'Invalid or expired token',
          code: expired ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN',
        });
      }
    }

    // 2) No Bearer. If we don't permit anon, bail.
    if (!allowAnonymous) {
      return res.status(401).json({ error: 'Access token required' });
    }

    // 3) Try wizard cookie.
    const cookies = parseCookieHeader(req.headers.cookie);
    const cookieToken = cookies[WIZARD_COOKIE_NAME];
    if (cookieToken) {
      const session = await lookupSession(db, cookieToken);
      if (session) {
        // Touch in background — don't block the request. The slide is
        // best-effort; a failure here doesn't tear down the handler.
        void touchSession(db, session.id);
        req.identity = { kind: 'anon', session };
        return next();
      }
      // Cookie present but invalid/expired/linked. Fall through to issue
      // a new one (if allowed) — the old cookie will be overwritten.
    }

    // 4) No usable identity. Either mint a fresh anon session or pass
    //    through, depending on issueWhenMissing.
    if (!issueWhenMissing) {
      req.identity = undefined;
      return next();
    }

    try {
      const issued = await issueSession(db, {
        ip: extractIp(req),
        userAgent: req.headers['user-agent'] ?? null,
        fingerprintHash: extractFingerprint(req),
      });
      res.setHeader(
        'Set-Cookie',
        buildSetCookieHeader(issued.token, issued.expiresAt)
      );
      // Re-fetch the row to attach the same shape as the cookie path.
      const session = await db.wizardSession.findUnique({
        where: { id: issued.sessionId },
      });
      if (!session) {
        // Theoretically unreachable — we just created it. Defensive.
        return res
          .status(500)
          .json({ error: 'Failed to initialize anonymous session' });
      }
      req.identity = { kind: 'anon', session };
      return next();
    } catch (err) {
      console.error('[authenticateOrSession] issue failed', err);
      return res
        .status(500)
        .json({ error: 'Failed to initialize anonymous session' });
    }
  };
};
