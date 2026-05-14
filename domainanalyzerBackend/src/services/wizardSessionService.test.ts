import { describe, it, expect } from 'vitest';
import {
  WIZARD_COOKIE_NAME,
  WIZARD_SESSION_TTL_MS,
  buildClearCookieHeader,
  buildSetCookieHeader,
  generateCookieToken,
  hashCookieToken,
  issueSession,
  linkSessionToUser,
  lookupSession,
  parseCookieHeader,
  touchSession,
} from './wizardSessionService';
import { createPrismaMock } from '../testSupport/prismaMock';

describe('hashCookieToken', () => {
  it('is deterministic for the same input', () => {
    expect(hashCookieToken('abc')).toBe(hashCookieToken('abc'));
  });
  it('differs across distinct inputs', () => {
    expect(hashCookieToken('abc')).not.toBe(hashCookieToken('abd'));
  });
  it('produces 64-char sha256 hex', () => {
    expect(hashCookieToken('test')).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('generateCookieToken', () => {
  it('is high-entropy and url-safe', () => {
    const a = generateCookieToken();
    const b = generateCookieToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(40);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe('parseCookieHeader', () => {
  it('returns {} for empty / undefined', () => {
    expect(parseCookieHeader(undefined)).toEqual({});
    expect(parseCookieHeader(null)).toEqual({});
    expect(parseCookieHeader('')).toEqual({});
  });
  it('parses standard key=value pairs', () => {
    expect(parseCookieHeader('a=1; b=2')).toEqual({ a: '1', b: '2' });
  });
  it('trims whitespace', () => {
    expect(parseCookieHeader('  a  =  1  ;b=2')).toEqual({ a: '1', b: '2' });
  });
  it('decodes URL-encoded values', () => {
    expect(parseCookieHeader('a=hello%20world')).toEqual({ a: 'hello world' });
  });
  it('ignores malformed pairs', () => {
    expect(parseCookieHeader('=novalue; ok=yes; nokey')).toEqual({ ok: 'yes' });
  });
});

describe('buildSetCookieHeader / buildClearCookieHeader', () => {
  const future = new Date(Date.now() + 60_000);
  it('contains the wizard cookie name and Path=/', () => {
    const h = buildSetCookieHeader('tok', future);
    expect(h).toContain(`${WIZARD_COOKIE_NAME}=`);
    expect(h).toContain('Path=/');
    expect(h).toContain('HttpOnly');
    expect(h).toContain('SameSite=Lax');
  });
  it('clear header has Max-Age=0', () => {
    const h = buildClearCookieHeader();
    expect(h).toContain('Max-Age=0');
    expect(h).toContain(`${WIZARD_COOKIE_NAME}=`);
  });
  it('production adds Secure flag', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    expect(buildSetCookieHeader('t', future)).toContain('Secure');
    expect(buildClearCookieHeader()).toContain('Secure');
    process.env.NODE_ENV = prev;
  });
});

describe('issueSession + lookupSession', () => {
  it('issue creates a row, lookup finds it via the cookie token', async () => {
    const prisma = createPrismaMock();
    const { token, sessionId } = await issueSession(prisma, {
      ip: '1.2.3.4',
      userAgent: 'test',
      fingerprintHash: 'fp1',
    });
    expect(sessionId).toBeGreaterThan(0);
    const found = await lookupSession(prisma, token);
    expect(found?.id).toBe(sessionId);
    expect(found?.ip).toBe('1.2.3.4');
    expect(found?.fingerprintHash).toBe('fp1');
  });

  it('lookup returns null for a bogus token', async () => {
    const prisma = createPrismaMock();
    expect(await lookupSession(prisma, 'not-a-real-token')).toBeNull();
    expect(await lookupSession(prisma, null)).toBeNull();
    expect(await lookupSession(prisma, '')).toBeNull();
    expect(await lookupSession(prisma, 'short')).toBeNull();
  });

  it('lookup returns null for an expired session', async () => {
    const prisma = createPrismaMock();
    const { token, sessionId } = await issueSession(prisma);
    // Force expiry into the past.
    await prisma.wizardSession.update({
      where: { id: sessionId },
      data: { expiresAt: new Date(Date.now() - 1000) } as any,
    });
    expect(await lookupSession(prisma, token)).toBeNull();
  });

  it('lookup returns null for an already-linked session', async () => {
    const prisma = createPrismaMock();
    const { token, sessionId } = await issueSession(prisma);
    await prisma.wizardSession.update({
      where: { id: sessionId },
      data: { linkedUserId: 99 } as any,
    });
    expect(await lookupSession(prisma, token)).toBeNull();
  });

  it('touchSession slides expiresAt forward', async () => {
    const prisma = createPrismaMock();
    const { sessionId } = await issueSession(prisma);
    const before = (await prisma.wizardSession.findUnique({ where: { id: sessionId } }))!.expiresAt;
    // Set expiry to "almost expired" so the slide is observable.
    const soon = new Date(Date.now() + 1000);
    await prisma.wizardSession.update({ where: { id: sessionId }, data: { expiresAt: soon } as any });
    await touchSession(prisma, sessionId);
    const after = (await prisma.wizardSession.findUnique({ where: { id: sessionId } }))!.expiresAt;
    expect(after.getTime()).toBeGreaterThan(soon.getTime());
    expect(after.getTime()).toBeGreaterThanOrEqual(
      Date.now() + WIZARD_SESSION_TTL_MS - 1000
    );
    // before is also fine, just sanity:
    expect(before).toBeInstanceOf(Date);
  });
});

describe('issueSession — shadow user', () => {
  it('creates a shadow User row and points anonUserId at it', async () => {
    const prisma = createPrismaMock();
    const { sessionId, anonUserId } = await issueSession(prisma);
    expect(anonUserId).toBeGreaterThan(0);

    const session = await prisma.wizardSession.findUnique({ where: { id: sessionId } });
    expect(session?.anonUserId).toBe(anonUserId);

    const shadowUser = await prisma.user.findUnique({ where: { id: anonUserId } });
    expect(shadowUser?.email).toMatch(/^anon-[a-f0-9]+@system\.local$/);
  });
});

describe('linkSessionToUser — shadow-user transfer', () => {
  /** Helper: shape an anon flow by creating a Domain owned by the shadow user. */
  const seedAnonDomain = async (prisma: any, host: string) => {
    const { sessionId, anonUserId } = await issueSession(prisma);
    const domain = await prisma.domain.create({
      data: {
        userId: anonUserId,
        host,
        url: `https://${host}`,
        isCompanyDomain: false,
      },
    });
    return { sessionId, anonUserId, domain };
  };

  it('transfers all shadow-owned Domain rows to the real user', async () => {
    const prisma = createPrismaMock();
    const realUser = await prisma.user.create({
      data: { email: 'real@x.com', password: 'hash' },
    });
    const { sessionId, domain } = await seedAnonDomain(prisma, 'example.com');

    const result = await linkSessionToUser(prisma, sessionId, realUser.id);
    expect(result.linked).toBe(true);
    expect(result.domainsTransferred).toBe(1);
    expect(result.primaryDomainId).toBe(domain.id);

    const after = await prisma.domain.findUnique({ where: { id: domain.id } });
    expect(after?.userId).toBe(realUser.id);
  });

  it('marks the session linked and records linkedDomainId', async () => {
    const prisma = createPrismaMock();
    const realUser = await prisma.user.create({
      data: { email: 'real@x.com', password: 'hash' },
    });
    const { sessionId, domain } = await seedAnonDomain(prisma, 'example.com');
    await linkSessionToUser(prisma, sessionId, realUser.id);

    const session = await prisma.wizardSession.findUnique({ where: { id: sessionId } });
    expect(session?.linkedUserId).toBe(realUser.id);
    expect(session?.linkedDomainId).toBe(domain.id);
    expect(session?.linkedAt).toBeInstanceOf(Date);
  });

  it('deletes the shadow user after transfer', async () => {
    const prisma = createPrismaMock();
    const realUser = await prisma.user.create({
      data: { email: 'real@x.com', password: 'hash' },
    });
    const { sessionId, anonUserId } = await seedAnonDomain(prisma, 'example.com');
    await linkSessionToUser(prisma, sessionId, realUser.id);

    const shadow = await prisma.user.findUnique({ where: { id: anonUserId } });
    expect(shadow).toBeNull();
  });

  it('handles a collision: real user already owns Domain for the same host', async () => {
    const prisma = createPrismaMock();
    const realUser = await prisma.user.create({
      data: { email: 'real@x.com', password: 'hash' },
    });
    const realDomain = await prisma.domain.create({
      data: {
        userId: realUser.id,
        host: 'collide.com',
        url: 'https://collide.com',
        isCompanyDomain: true,
      },
    });
    const { sessionId, domain: anonDomain } = await seedAnonDomain(prisma, 'collide.com');

    const result = await linkSessionToUser(prisma, sessionId, realUser.id);
    expect(result.linked).toBe(true);
    expect(result.domainsTransferred).toBe(0);
    expect(result.primaryDomainId).toBe(realDomain.id);

    // Shadow's domain row should be gone (cleaned up to allow shadow-user delete).
    const orphan = await prisma.domain.findUnique({ where: { id: anonDomain.id } });
    expect(orphan).toBeNull();
    // Real user's Domain still owned by them.
    const real = await prisma.domain.findUnique({ where: { id: realDomain.id } });
    expect(real?.userId).toBe(realUser.id);
  });

  it('is idempotent on second call', async () => {
    const prisma = createPrismaMock();
    const realUser = await prisma.user.create({
      data: { email: 'real@x.com', password: 'hash' },
    });
    const { sessionId } = await seedAnonDomain(prisma, 'example.com');

    const first = await linkSessionToUser(prisma, sessionId, realUser.id);
    const second = await linkSessionToUser(prisma, sessionId, realUser.id);
    expect(second.linked).toBe(true);
    expect(second.primaryDomainId).toBe(first.primaryDomainId);
    expect(second.domainsTransferred).toBe(0);
  });

  it('returns linked=false when the session does not exist', async () => {
    const prisma = createPrismaMock();
    const result = await linkSessionToUser(prisma, 9999, 1);
    expect(result.linked).toBe(false);
    expect(result.domainsTransferred).toBe(0);
    expect(result.primaryDomainId).toBeNull();
  });

  it('handles a session with no domains (user signed up before Step 1)', async () => {
    const prisma = createPrismaMock();
    const realUser = await prisma.user.create({
      data: { email: 'real@x.com', password: 'hash' },
    });
    const { sessionId } = await issueSession(prisma);
    const result = await linkSessionToUser(prisma, sessionId, realUser.id);
    expect(result.linked).toBe(true);
    expect(result.domainsTransferred).toBe(0);
    expect(result.primaryDomainId).toBeNull();
  });
});

describe('linkSessionToUser — legacy snapshot fallback', () => {
  /**
   * Sessions issued before the shadow-user migration have anonUserId=null
   * but may have domainUrl/domainHost snapshots. The handler falls back
   * to the old "materialize a Domain shell" behavior so in-flight sessions
   * during deploy don't drop their wizard work.
   */
  it('materializes a Domain shell for a legacy session', async () => {
    const prisma = createPrismaMock();
    const realUser = await prisma.user.create({
      data: { email: 'real@x.com', password: 'hash' },
    });
    // Simulate a pre-migration session: create directly, override anonUserId=null.
    const legacy = await prisma.wizardSession.create({
      data: {
        cookieTokenHash: 'legacy-hash',
        anonUserId: null,
        domainUrl: 'https://legacy.example',
        domainHost: 'legacy.example',
        expiresAt: new Date(Date.now() + 60_000),
      } as any,
    });
    const result = await linkSessionToUser(prisma, legacy.id, realUser.id);
    expect(result.linked).toBe(true);
    expect(result.domainsTransferred).toBe(1);
    const dom = await prisma.domain.findUnique({
      where: { userId_host: { userId: realUser.id, host: 'legacy.example' } },
    });
    expect(dom).not.toBeNull();
    expect(dom?.isCompanyDomain).toBe(false);
  });
});
