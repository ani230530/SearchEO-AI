import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  authenticateOrSession,
  canRunPaidStep,
  getOwnerUserId,
  isUserIdentity,
} from './authenticateOrSession';
import {
  WIZARD_COOKIE_NAME,
  WIZARD_SESSION_HEADER,
  buildSetCookieHeader,
  generateCookieToken,
  hashCookieToken,
  issueSession,
} from '../services/wizardSessionService';
import { createPrismaMock } from '../testSupport/prismaMock';

/**
 * Stub `authService.verifyToken` so we don't pull in jsonwebtoken in tests.
 * We swap behavior per test by reaching into the import after the fact.
 */
let verifyImpl: (token: string) => Promise<any> = async () => {
  throw new Error('not set');
};
vi.mock('../services/authService', () => ({
  authService: {
    verifyToken: (t: string) => verifyImpl(t),
  },
}));

// Minimal Express req/res/next harness — no actual Express runtime.
const makeReqRes = (input: {
  authorization?: string;
  cookie?: string;
  wizardSession?: string;
  fingerprint?: string;
  ip?: string;
  userAgent?: string;
} = {}) => {
  const headers: Record<string, any> = {};
  if (input.authorization) headers.authorization = input.authorization;
  if (input.cookie) headers.cookie = input.cookie;
  if (input.wizardSession) headers[WIZARD_SESSION_HEADER] = input.wizardSession;
  if (input.fingerprint) headers['x-wizard-fingerprint'] = input.fingerprint;
  if (input.userAgent) headers['user-agent'] = input.userAgent;

  const req: any = {
    headers,
    ip: input.ip ?? null,
    socket: { remoteAddress: input.ip ?? null },
    body: {},
  };

  const responseHeaders: Record<string, string> = {};
  let statusCode = 200;
  let jsonPayload: any = undefined;

  const res: any = {
    setHeader: (k: string, v: string) => {
      responseHeaders[k] = v;
    },
    status: (c: number) => {
      statusCode = c;
      return res;
    },
    json: (p: any) => {
      jsonPayload = p;
      return res;
    },
    get _headers() {
      return responseHeaders;
    },
    get _status() {
      return statusCode;
    },
    get _json() {
      return jsonPayload;
    },
  };

  const next = vi.fn();
  return { req, res, next };
};

describe('authenticateOrSession — JWT path', () => {
  beforeEach(() => {
    verifyImpl = async () => ({ userId: 5, email: 'a@b.com' });
  });

  it('attaches kind="user" identity when a valid Bearer token is present', async () => {
    const prisma = createPrismaMock();
    const { req, res, next } = makeReqRes({ authorization: 'Bearer good-token' });
    const mw = authenticateOrSession({ prisma });
    await mw(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.identity).toEqual({ kind: 'user', userId: 5, email: 'a@b.com' });
    expect(res._headers['Set-Cookie']).toBeUndefined();
  });

  it('rejects with 401 when the Bearer token is invalid', async () => {
    verifyImpl = async () => {
      throw new Error('invalid token');
    };
    const prisma = createPrismaMock();
    const { req, res, next } = makeReqRes({ authorization: 'Bearer bad-token' });
    const mw = authenticateOrSession({ prisma });
    await mw(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(401);
    expect(res._json?.code).toBe('INVALID_TOKEN');
  });

  it('returns TOKEN_EXPIRED for an expired token', async () => {
    verifyImpl = async () => {
      throw new Error('jwt expired');
    };
    const prisma = createPrismaMock();
    const { req, res, next } = makeReqRes({ authorization: 'Bearer expired' });
    const mw = authenticateOrSession({ prisma });
    await mw(req, res, next);
    expect(res._status).toBe(401);
    expect(res._json?.code).toBe('TOKEN_EXPIRED');
  });

  /**
   * Regression for the deploy-staggered 401: an older frontend bundle
   * sends "Authorization: Bearer null" (or "Bearer undefined") on every
   * request because its apiClient stringifies localStorage.getItem(...).
   * Pre-defensive-parse code interpreted those literal strings as a
   * "present but malformed" token and 401'd, blocking the cookie path
   * entirely. These tests pin the new behavior: such headers are
   * treated as "no token" and the middleware falls through to anon.
   */
  it.each([
    ['Bearer null'],
    ['Bearer undefined'],
    ['Bearer '],
    ['Bearer   '],
  ])('falls through to anon when Authorization is %s', async (header) => {
    const prisma = createPrismaMock();
    const { req, res, next } = makeReqRes({ authorization: header });
    const mw = authenticateOrSession({ prisma });
    await mw(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.identity?.kind).toBe('anon');
    expect(res._headers['Set-Cookie']).toContain(WIZARD_COOKIE_NAME);
  });
});

describe('authenticateOrSession — anonymous cookie path', () => {
  it('resolves an existing valid wizard cookie to kind="anon"', async () => {
    const prisma = createPrismaMock();
    const { token, sessionId } = await issueSession(prisma);
    const { req, res, next } = makeReqRes({
      cookie: `${WIZARD_COOKIE_NAME}=${encodeURIComponent(token)}`,
    });
    const mw = authenticateOrSession({ prisma });
    await mw(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.identity?.kind).toBe('anon');
    expect((req.identity as any)?.session?.id).toBe(sessionId);
    // No new cookie minted — existing one stays valid.
    expect(res._headers['Set-Cookie']).toBeUndefined();
  });

  it('resolves an existing valid wizard session header when the cookie is missing', async () => {
    const prisma = createPrismaMock();
    const { token, sessionId } = await issueSession(prisma);
    const { req, res, next } = makeReqRes({ wizardSession: token });
    const mw = authenticateOrSession({ prisma });
    await mw(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.identity?.kind).toBe('anon');
    expect((req.identity as any)?.session?.id).toBe(sessionId);
    expect(req.wizardSessionToken).toBe(token);
    expect(res._headers['Set-Cookie']).toBeUndefined();
  });

  it('falls back to the wizard session header when an old cookie is stale', async () => {
    const prisma = createPrismaMock();
    const { token: staleToken, sessionId: staleSessionId } = await issueSession(prisma);
    await prisma.wizardSession.update({
      where: { id: staleSessionId },
      data: { expiresAt: new Date(Date.now() - 1000) } as any,
    });
    const { token, sessionId } = await issueSession(prisma);
    const { req, res, next } = makeReqRes({
      cookie: `${WIZARD_COOKIE_NAME}=${encodeURIComponent(staleToken)}`,
      wizardSession: token,
    });
    const mw = authenticateOrSession({ prisma });
    await mw(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.identity?.kind).toBe('anon');
    expect((req.identity as any)?.session?.id).toBe(sessionId);
    expect(req.wizardSessionToken).toBe(token);
    expect(res._headers['Set-Cookie']).toBeUndefined();
  });

  it('mints a new cookie + session when no cookie is present', async () => {
    const prisma = createPrismaMock();
    const { req, res, next } = makeReqRes({
      ip: '7.7.7.7',
      userAgent: 'TestAgent/1.0',
      fingerprint: 'fp-test',
    });
    const mw = authenticateOrSession({ prisma });
    await mw(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.identity?.kind).toBe('anon');
    expect(res._headers['Set-Cookie']).toContain(WIZARD_COOKIE_NAME);
    // Session captured the ip + fingerprint.
    const session = (req.identity as any).session;
    expect(session.ip).toBe('7.7.7.7');
    expect(session.fingerprintHash).toBe('fp-test');
    expect(session.userAgent).toBe('TestAgent/1.0');
  });

  it('mints a new cookie when the existing one is stale', async () => {
    const prisma = createPrismaMock();
    const { token, sessionId } = await issueSession(prisma);
    // Expire it.
    await prisma.wizardSession.update({
      where: { id: sessionId },
      data: { expiresAt: new Date(Date.now() - 1000) } as any,
    });
    const { req, res, next } = makeReqRes({
      cookie: `${WIZARD_COOKIE_NAME}=${encodeURIComponent(token)}`,
    });
    const mw = authenticateOrSession({ prisma });
    await mw(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.identity?.kind).toBe('anon');
    // A new cookie should have been minted.
    expect(res._headers['Set-Cookie']).toContain(WIZARD_COOKIE_NAME);
    const newSessionId = (req.identity as any).session.id;
    expect(newSessionId).not.toBe(sessionId);
  });

  it('passes through with identity=undefined when issueWhenMissing=false', async () => {
    const prisma = createPrismaMock();
    const { req, res, next } = makeReqRes();
    const mw = authenticateOrSession({ prisma, issueWhenMissing: false });
    await mw(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.identity).toBeUndefined();
    expect(res._headers['Set-Cookie']).toBeUndefined();
  });

  it('rejects with 401 when allowAnonymous=false and no Bearer', async () => {
    const prisma = createPrismaMock();
    const { req, res, next } = makeReqRes();
    const mw = authenticateOrSession({ prisma, allowAnonymous: false });
    await mw(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(401);
  });
});

describe('authenticateOrSession — precedence', () => {
  it('JWT wins over cookie when both are present', async () => {
    verifyImpl = async () => ({ userId: 9, email: 'jwt@x.com' });
    const prisma = createPrismaMock();
    const { token } = await issueSession(prisma);
    const { req, res, next } = makeReqRes({
      authorization: 'Bearer good',
      cookie: `${WIZARD_COOKIE_NAME}=${encodeURIComponent(token)}`,
    });
    const mw = authenticateOrSession({ prisma });
    await mw(req, res, next);
    expect(req.identity?.kind).toBe('user');
    expect((req.identity as any)?.userId).toBe(9);
  });

  it('does NOT silently downgrade a bad Bearer to anonymous', async () => {
    verifyImpl = async () => {
      throw new Error('bad');
    };
    const prisma = createPrismaMock();
    const { token } = await issueSession(prisma);
    const { req, res, next } = makeReqRes({
      authorization: 'Bearer bad',
      cookie: `${WIZARD_COOKIE_NAME}=${encodeURIComponent(token)}`,
    });
    const mw = authenticateOrSession({ prisma });
    await mw(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(401);
  });
});

describe('canRunPaidStep / isUserIdentity', () => {
  it('canRunPaidStep is true only for kind="user"', async () => {
    expect(canRunPaidStep(undefined)).toBe(false);
    expect(
      canRunPaidStep({
        kind: 'anon',
        session: { id: 1 } as any,
      })
    ).toBe(false);
    expect(canRunPaidStep({ kind: 'user', userId: 1, email: 'a' })).toBe(true);
  });
  it('isUserIdentity narrows correctly', () => {
    expect(isUserIdentity(undefined)).toBe(false);
    expect(isUserIdentity({ kind: 'anon', session: { id: 1 } as any })).toBe(false);
    expect(isUserIdentity({ kind: 'user', userId: 1, email: 'a' })).toBe(true);
  });
});

describe('getOwnerUserId — identity resolution', () => {
  it('returns userId from req.identity (kind="user")', () => {
    const req: any = { identity: { kind: 'user', userId: 42, email: 'a@b.com' } };
    expect(getOwnerUserId(req)).toBe(42);
  });

  it('returns shadow user id from req.identity (kind="anon")', () => {
    const req: any = {
      identity: { kind: 'anon', session: { id: 1, anonUserId: 7 } },
    };
    expect(getOwnerUserId(req)).toBe(7);
  });

  it('returns null when anon session has no anonUserId (legacy)', () => {
    const req: any = {
      identity: { kind: 'anon', session: { id: 1, anonUserId: null } },
    };
    expect(getOwnerUserId(req)).toBeNull();
  });

  /**
   * Regression for the post-signup 404 on /runs / /trends / /report:
   * those routes use the legacy authenticateToken middleware which sets
   * req.user but not req.identity. Before this fallback, getOwnerUserId
   * returned null and ensureDomain treated every request as
   * unauthorized — even when the JWT had successfully authenticated.
   */
  it('falls back to req.user.userId when req.identity is not set', () => {
    const req: any = { user: { userId: 99, email: 'legacy@b.com' } };
    expect(getOwnerUserId(req)).toBe(99);
  });

  it('returns null when neither identity nor user is set', () => {
    const req: any = {};
    expect(getOwnerUserId(req)).toBeNull();
  });
});

describe('cookie hashing roundtrip (smoke)', () => {
  it('cookie set by buildSetCookieHeader can be parsed back and looked up', async () => {
    const prisma = createPrismaMock();
    const { token, expiresAt } = await issueSession(prisma);
    const setCookie = buildSetCookieHeader(token, expiresAt);
    // Simulate browser: pluck `aiv_ws=...` out of the Set-Cookie header.
    const cookieValue = setCookie.split(';')[0].split('=')[1];
    const session = await prisma.wizardSession.findUnique({
      where: { cookieTokenHash: hashCookieToken(decodeURIComponent(cookieValue)) },
    });
    expect(session).not.toBeNull();
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Touch generateCookieToken so it's imported (avoid unused-import lint).
void generateCookieToken;
