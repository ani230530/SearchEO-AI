import { describe, it, expect } from 'vitest';
import type { WizardSession } from '../../generated/prisma';
import {
  ANON_RUNS_PER_IDENTITY_PER_DAY,
  ANON_SHEDDING_FRACTION,
  DAILY_BUDGET_USD,
  USER_COOLDOWN_MS,
  checkAnonRunRateLimit,
  checkUserRunQuota,
  checkWizardAccess,
  estimateOpenRouterCostUsd,
  getDailyBudgetStatus,
  recordApiSpend,
} from './antiAbuseService';
import { createPrismaMock } from '../testSupport/prismaMock';

const NOW = new Date('2026-05-13T12:00:00Z');
const SAME_DAY_LATER = new Date('2026-05-13T23:00:00Z');
const NEXT_DAY = new Date('2026-05-14T01:00:00Z');

const fakeSession = (overrides: Partial<WizardSession> = {}): WizardSession =>
  ({
    id: 1,
    cookieTokenHash: 'h',
    ip: null,
    fingerprintHash: null,
    userAgent: null,
    domainUrl: null,
    domainHost: null,
    profileData: null,
    crawlData: null,
    competitorsData: null,
    topicsData: null,
    step: 'idle',
    linkedUserId: null,
    linkedDomainId: null,
    linkedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    expiresAt: new Date(NOW.getTime() + 86_400_000),
    ...overrides,
  } as WizardSession);

describe('estimateOpenRouterCostUsd', () => {
  it('uses model-specific pricing', () => {
    const cheap = estimateOpenRouterCostUsd({
      model: 'openai/gpt-4o-mini',
      inputTokens: 1000,
      outputTokens: 0,
    });
    const expensive = estimateOpenRouterCostUsd({
      model: 'anthropic/claude-sonnet-4.5',
      inputTokens: 1000,
      outputTokens: 0,
    });
    expect(expensive).toBeGreaterThan(cheap);
  });
  it('falls back to mini pricing for unknown models', () => {
    const unknown = estimateOpenRouterCostUsd({
      model: 'fictional/model-9',
      inputTokens: 1000,
    });
    const mini = estimateOpenRouterCostUsd({
      model: 'openai/gpt-4o-mini',
      inputTokens: 1000,
    });
    expect(unknown).toBe(mini);
  });
  it('combines input + output costs', () => {
    const sum = estimateOpenRouterCostUsd({
      model: 'openai/gpt-4o-mini',
      inputTokens: 1000,
      outputTokens: 1000,
    });
    const inOnly = estimateOpenRouterCostUsd({
      model: 'openai/gpt-4o-mini',
      inputTokens: 1000,
    });
    expect(sum).toBeGreaterThan(inOnly);
  });
});

describe('recordApiSpend', () => {
  it('writes a row with the supplied service + cost', async () => {
    const prisma = createPrismaMock();
    await recordApiSpend(prisma, {
      service: 'openrouter',
      userId: 7,
      costEstimateUsd: 0.12,
    });
    const count = await prisma.apiSpendLog.count({
      where: { service: 'openrouter' },
    });
    expect(count).toBe(1);
  });
  it('does not throw when persistence fails', async () => {
    const prisma = createPrismaMock();
    // Break the table to simulate DB failure.
    (prisma as any).apiSpendLog.create = async () => {
      throw new Error('db down');
    };
    await expect(
      recordApiSpend(prisma, {
        service: 'serpapi',
        costEstimateUsd: 0.01,
      })
    ).resolves.toBeUndefined();
  });
});

describe('getDailyBudgetStatus', () => {
  it('sums only today\'s spend', async () => {
    const prisma = createPrismaMock();
    await recordApiSpend(prisma, { service: 'openrouter', costEstimateUsd: 1 });
    // Manually backdate one row by reaching into the mock store.
    const stores = (prisma as any).__stores;
    stores.apiSpendLog.rows.set(1, {
      ...stores.apiSpendLog.rows.get(1),
      createdAt: new Date('2026-05-12T12:00:00Z'),
    });
    await recordApiSpend(prisma, { service: 'openrouter', costEstimateUsd: 2 });
    const status = await getDailyBudgetStatus(prisma, 100, NOW);
    expect(status.spentUsd).toBe(2);
    expect(status.totalCapReached).toBe(false);
  });
  it('flags totalCapReached when at or above cap', async () => {
    const prisma = createPrismaMock();
    await recordApiSpend(prisma, { service: 'openrouter', costEstimateUsd: 50 });
    const status = await getDailyBudgetStatus(prisma, 50, NOW);
    expect(status.totalCapReached).toBe(true);
  });
  it('flags anonShedding at the ANON_SHEDDING_FRACTION threshold', async () => {
    const prisma = createPrismaMock();
    await recordApiSpend(prisma, {
      service: 'openrouter',
      costEstimateUsd: 100 * ANON_SHEDDING_FRACTION,
    });
    const status = await getDailyBudgetStatus(prisma, 100, NOW);
    expect(status.anonShedding).toBe(true);
    expect(status.totalCapReached).toBe(false);
  });
  it('reports remaining', async () => {
    const prisma = createPrismaMock();
    await recordApiSpend(prisma, { service: 'openrouter', costEstimateUsd: 30 });
    const status = await getDailyBudgetStatus(prisma, 50, NOW);
    expect(status.remainingUsd).toBe(20);
  });
});

describe('checkAnonRunRateLimit', () => {
  it('allows a fresh session with no prior crawl', async () => {
    const prisma = createPrismaMock();
    const decision = await checkAnonRunRateLimit(
      prisma,
      fakeSession(),
      '1.2.3.4',
      'fp',
      NOW
    );
    expect(decision.allowed).toBe(true);
  });
  it('denies when the session has already run today (crawlData set)', async () => {
    const prisma = createPrismaMock();
    const decision = await checkAnonRunRateLimit(
      prisma,
      fakeSession({ crawlData: { ok: true } as any }),
      null,
      null,
      NOW
    );
    expect(decision.allowed).toBe(false);
    expect(decision.status).toBe(429);
  });
  it('denies when too many sessions share the same IP today', async () => {
    const prisma = createPrismaMock();
    // Seed N+1 sessions sharing the same IP today.
    for (let i = 0; i < ANON_RUNS_PER_IDENTITY_PER_DAY + 1; i++) {
      await prisma.wizardSession.create({
        data: { cookieTokenHash: `h${i}`, ip: '9.9.9.9', expiresAt: NEXT_DAY },
      });
    }
    const decision = await checkAnonRunRateLimit(
      prisma,
      fakeSession(),
      '9.9.9.9',
      null,
      NOW
    );
    expect(decision.allowed).toBe(false);
    expect(decision.status).toBe(429);
  });
  it('denies when too many sessions share the same fingerprint today', async () => {
    const prisma = createPrismaMock();
    for (let i = 0; i < ANON_RUNS_PER_IDENTITY_PER_DAY + 1; i++) {
      await prisma.wizardSession.create({
        data: { cookieTokenHash: `h${i}`, fingerprintHash: 'fp-x', expiresAt: NEXT_DAY },
      });
    }
    const decision = await checkAnonRunRateLimit(
      prisma,
      fakeSession(),
      null,
      'fp-x',
      NOW
    );
    expect(decision.allowed).toBe(false);
  });
  it('does not double-count yesterday\'s sessions against today\'s limit', async () => {
    const prisma = createPrismaMock();
    // Seed yesterday's session.
    await prisma.wizardSession.create({
      data: {
        cookieTokenHash: 'old',
        ip: '5.5.5.5',
        expiresAt: NOW,
      },
    });
    const stores = (prisma as any).__stores;
    stores.wizardSession.rows.set(1, {
      ...stores.wizardSession.rows.get(1),
      createdAt: new Date('2026-05-12T12:00:00Z'),
    });
    const decision = await checkAnonRunRateLimit(
      prisma,
      fakeSession(),
      '5.5.5.5',
      null,
      NOW
    );
    expect(decision.allowed).toBe(true);
  });
});

describe('checkUserRunQuota', () => {
  it('denies when the user does not exist', async () => {
    const prisma = createPrismaMock();
    const decision = await checkUserRunQuota(prisma, 999, NOW);
    expect(decision.allowed).toBe(false);
    expect(decision.status).toBe(401);
  });
  it('allows a fresh user with quota and no cooldown', async () => {
    const prisma = createPrismaMock();
    const user = await prisma.user.create({
      data: { email: 'a@b.com', password: 'h', wizardRunsAllowed: 1 },
    });
    const decision = await checkUserRunQuota(prisma, user.id, NOW);
    expect(decision.allowed).toBe(true);
  });
  it('denies on cooldown', async () => {
    const prisma = createPrismaMock();
    const user = await prisma.user.create({
      data: {
        email: 'a@b.com',
        password: 'h',
        wizardRunsAllowed: 5,
        lastWizardRunAt: new Date(NOW.getTime() - USER_COOLDOWN_MS / 2),
      },
    });
    const decision = await checkUserRunQuota(prisma, user.id, NOW);
    expect(decision.allowed).toBe(false);
    expect(decision.status).toBe(429);
  });
  it('denies when wizardRunsAllowed has been exhausted', async () => {
    const prisma = createPrismaMock();
    const user = await prisma.user.create({
      data: { email: 'a@b.com', password: 'h', wizardRunsAllowed: 1 },
    });
    // Seed 70 openrouter rows = 1 "run" by the proxy heuristic.
    for (let i = 0; i < 70; i++) {
      await recordApiSpend(prisma, {
        service: 'openrouter',
        userId: user.id,
        costEstimateUsd: 0.01,
      });
    }
    const decision = await checkUserRunQuota(prisma, user.id, NOW);
    expect(decision.allowed).toBe(false);
    expect(decision.status).toBe(402);
  });
});

describe('checkWizardAccess (composite)', () => {
  it('lets cache-only reads through regardless of identity', async () => {
    const prisma = createPrismaMock();
    const decision = await checkWizardAccess(prisma, {
      identity: { kind: 'anon', session: fakeSession() },
      ip: null,
      triggersPaidCall: false,
      now: NOW,
    });
    expect(decision.allowed).toBe(true);
  });
  it('denies anon when budget hits the anon-shedding threshold', async () => {
    const prisma = createPrismaMock();
    await recordApiSpend(prisma, {
      service: 'openrouter',
      costEstimateUsd: DAILY_BUDGET_USD * ANON_SHEDDING_FRACTION,
    });
    const decision = await checkWizardAccess(prisma, {
      identity: { kind: 'anon', session: fakeSession() },
      ip: null,
      triggersPaidCall: true,
      now: NOW,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.status).toBe(503);
  });
  it('still allows user identity at anon-shedding (paying users not collateral)', async () => {
    const prisma = createPrismaMock();
    const user = await prisma.user.create({
      data: { email: 'p@x.com', password: 'h', wizardRunsAllowed: 5 },
    });
    await recordApiSpend(prisma, {
      service: 'openrouter',
      costEstimateUsd: DAILY_BUDGET_USD * ANON_SHEDDING_FRACTION,
    });
    const decision = await checkWizardAccess(prisma, {
      identity: { kind: 'user', userId: user.id, email: 'p@x.com' },
      ip: null,
      triggersPaidCall: true,
      now: NOW,
    });
    expect(decision.allowed).toBe(true);
  });
  it('denies everyone at the hard cap', async () => {
    const prisma = createPrismaMock();
    const user = await prisma.user.create({
      data: { email: 'p@x.com', password: 'h', wizardRunsAllowed: 5 },
    });
    await recordApiSpend(prisma, {
      service: 'openrouter',
      costEstimateUsd: DAILY_BUDGET_USD,
    });
    const decision = await checkWizardAccess(prisma, {
      identity: { kind: 'user', userId: user.id, email: 'p@x.com' },
      ip: null,
      triggersPaidCall: true,
      now: NOW,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.status).toBe(503);
  });
});
