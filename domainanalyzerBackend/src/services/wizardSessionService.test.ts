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

describe('linkSessionToUser', () => {
  it('creates a Domain shell from the session snapshot and marks linkedUserId', async () => {
    const prisma = createPrismaMock();
    const user = await prisma.user.create({ data: { email: 'u@x.com', password: 'hash' } });
    const { sessionId } = await issueSession(prisma);
    await prisma.wizardSession.update({
      where: { id: sessionId },
      data: {
        domainUrl: 'https://example.com',
        domainHost: 'example.com',
      } as any,
    });
    const result = await linkSessionToUser(prisma, sessionId, user.id);
    expect(result.linked).toBe(true);
    expect(result.domainsCreated).toBe(1);
    expect(result.primaryDomainId).toBeGreaterThan(0);

    const session = await prisma.wizardSession.findUnique({ where: { id: sessionId } });
    expect(session?.linkedUserId).toBe(user.id);
    expect(session?.linkedDomainId).toBe(result.primaryDomainId);

    const domain = await prisma.domain.findUnique({
      where: { userId_host: { userId: user.id, host: 'example.com' } },
    });
    expect(domain).not.toBeNull();
    expect(domain?.isCompanyDomain).toBe(false);
    expect(domain?.url).toBe('https://example.com');
  });

  it('does not auto-promote to company domain (isCompanyDomain=false)', async () => {
    const prisma = createPrismaMock();
    const user = await prisma.user.create({ data: { email: 'u@x.com', password: 'hash' } });
    const { sessionId } = await issueSession(prisma);
    await prisma.wizardSession.update({
      where: { id: sessionId },
      data: { domainUrl: 'https://co.com', domainHost: 'co.com' } as any,
    });
    await linkSessionToUser(prisma, sessionId, user.id);
    const domain = await prisma.domain.findUnique({
      where: { userId_host: { userId: user.id, host: 'co.com' } },
    });
    expect(domain?.isCompanyDomain).toBe(false);
  });

  it('is idempotent on second call', async () => {
    const prisma = createPrismaMock();
    const user = await prisma.user.create({ data: { email: 'u@x.com', password: 'hash' } });
    const { sessionId } = await issueSession(prisma);
    await prisma.wizardSession.update({
      where: { id: sessionId },
      data: { domainUrl: 'https://a.com', domainHost: 'a.com' } as any,
    });
    const first = await linkSessionToUser(prisma, sessionId, user.id);
    const second = await linkSessionToUser(prisma, sessionId, user.id);
    expect(second.linked).toBe(true);
    expect(second.primaryDomainId).toBe(first.primaryDomainId);
    expect(second.domainsCreated).toBe(0);
  });

  it('returns linked=false when the session does not exist', async () => {
    const prisma = createPrismaMock();
    const result = await linkSessionToUser(prisma, 9999, 1);
    expect(result.linked).toBe(false);
    expect(result.domainsCreated).toBe(0);
    expect(result.primaryDomainId).toBeNull();
  });

  it('skips domain materialization when the session never had a host', async () => {
    const prisma = createPrismaMock();
    const user = await prisma.user.create({ data: { email: 'u@x.com', password: 'hash' } });
    const { sessionId } = await issueSession(prisma);
    const result = await linkSessionToUser(prisma, sessionId, user.id);
    expect(result.linked).toBe(true);
    expect(result.domainsCreated).toBe(0);
    expect(result.primaryDomainId).toBeNull();
  });

  it('reuses an existing Domain row instead of creating a duplicate', async () => {
    const prisma = createPrismaMock();
    const user = await prisma.user.create({ data: { email: 'u@x.com', password: 'hash' } });
    // Pre-existing domain for the user.
    const preexisting = await prisma.domain.create({
      data: {
        userId: user.id,
        host: 'dup.com',
        url: 'https://dup.com',
        isCompanyDomain: true,
      } as any,
    });
    const { sessionId } = await issueSession(prisma);
    await prisma.wizardSession.update({
      where: { id: sessionId },
      data: { domainUrl: 'https://dup.com', domainHost: 'dup.com' } as any,
    });
    const result = await linkSessionToUser(prisma, sessionId, user.id);
    expect(result.linked).toBe(true);
    expect(result.domainsCreated).toBe(0);
    expect(result.primaryDomainId).toBe(preexisting.id);
  });
});
