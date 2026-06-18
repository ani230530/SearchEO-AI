import express from 'express';
import type { Server } from 'http';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

type AnyRow = Record<string, any>;

function projectRow<T extends AnyRow>(row: T, select?: Record<string, boolean>) {
  if (!select) return row;
  const out: AnyRow = {};
  for (const key of Object.keys(select)) {
    if (select[key]) out[key] = row[key];
  }
  return out;
}

function matchesWhere(row: AnyRow, where: AnyRow = {}): boolean {
  for (const [key, cond] of Object.entries(where)) {
    if (cond === null || cond === undefined) {
      if (row[key] !== cond) return false;
      continue;
    }
    if (typeof cond !== 'object' || Array.isArray(cond)) {
      if (row[key] !== cond) return false;
      continue;
    }

    if ('in' in cond) {
      if (!Array.isArray(cond.in) || !cond.in.includes(row[key])) return false;
    }
    if ('not' in cond) {
      if (row[key] === cond.not) return false;
    }
    if ('gt' in cond) {
      if (!(row[key] > cond.gt)) return false;
    }
    if ('gte' in cond) {
      if (!(row[key] >= cond.gte)) return false;
    }
    if ('lt' in cond) {
      if (!(row[key] < cond.lt)) return false;
    }
    if ('lte' in cond) {
      if (!(row[key] <= cond.lte)) return false;
    }
  }
  return true;
}

function createReportPrismaMock() {
  const db = {
    domains: [] as AnyRow[],
    runs: [] as AnyRow[],
    results: [] as AnyRow[],
    keywords: [] as AnyRow[],
    prompts: [] as AnyRow[],
    competitors: [] as AnyRow[],
  };

  const sortRows = (rows: AnyRow[], orderBy?: AnyRow) => {
    if (!orderBy) return rows;
    const [[field, direction]] = Object.entries(orderBy);
    return [...rows].sort((a, b) => {
      const av = a[field];
      const bv = b[field];
      const aTime = av instanceof Date ? av.getTime() : av;
      const bTime = bv instanceof Date ? bv.getTime() : bv;
      if (aTime === bTime) return 0;
      const diff = aTime > bTime ? 1 : -1;
      return direction === 'desc' ? -diff : diff;
    });
  };

  const projectMany = (rows: AnyRow[], select?: AnyRow) => rows.map((row) => projectRow(row, select));

  const runMatches = (run: AnyRow, where: AnyRow = {}) => {
    const { domainId, status, kind, ...rest } = where;
    if (domainId !== undefined && run.domainId !== domainId) return false;
    if (status !== undefined && run.status !== status) return false;
    if (kind !== undefined) {
      if (typeof kind === 'object' && !Array.isArray(kind) && Array.isArray(kind.in)) {
        if (!kind.in.includes(run.kind)) return false;
      } else if (run.kind !== kind) {
        return false;
      }
    }
    return matchesWhere(run, rest);
  };

  return {
    __db: db,
    domain: {
      findUnique: async ({ where }: any) => db.domains.find((row) => row.id === where.id) ?? null,
    },
    aiRun: {
      findFirst: async ({ where, orderBy, select }: any = {}) => {
        const rows = sortRows(db.runs.filter((row) => runMatches(row, where)), orderBy);
        return rows[0] ? projectRow(rows[0], select) : null;
      },
      findMany: async ({ where, orderBy, take, select }: any = {}) => {
        let rows = sortRows(db.runs.filter((row) => runMatches(row, where)), orderBy);
        if (typeof take === 'number') rows = rows.slice(0, take);
        return projectMany(rows, select);
      },
      update: async ({ where, data }: any) => {
        const idx = db.runs.findIndex((row) => row.id === where.id);
        if (idx === -1) throw new Error('run not found');
        db.runs[idx] = { ...db.runs[idx], ...data };
        return db.runs[idx];
      },
    },
    aiQueryResult: {
      findMany: async ({ where, orderBy, take, select }: any = {}) => {
        let rows = db.results.filter((row) => {
          if (where?.runId !== undefined) {
            const runIdCond = where.runId;
            if (typeof runIdCond === 'object' && Array.isArray(runIdCond.in)) {
              if (!runIdCond.in.includes(row.runId)) return false;
            } else if (row.runId !== runIdCond) {
              return false;
            }
          }
          if (where?.promptId !== undefined) {
            const promptCond = where.promptId;
            if (typeof promptCond === 'object' && Array.isArray(promptCond.in)) {
              if (!promptCond.in.includes(row.promptId)) return false;
            } else if (row.promptId !== promptCond) {
              return false;
            }
          }
          if (where?.run) {
            const run = db.runs.find((candidate) => candidate.id === row.runId);
            if (!run || !runMatches(run, where.run)) return false;
          }
          return true;
        });
        rows = sortRows(rows, orderBy);
        if (typeof take === 'number') rows = rows.slice(0, take);
        return projectMany(rows, select);
      },
    },
    keyword: {
      findMany: async ({ where, select }: any = {}) => {
        const rows = db.keywords.filter((row) => matchesWhere(row, where));
        return projectMany(rows, select);
      },
    },
    prompt: {
      findMany: async ({ where, select, orderBy }: any = {}) => {
        const rows = sortRows(db.prompts.filter((row) => matchesWhere(row, where)), orderBy);
        return projectMany(rows, select);
      },
      count: async ({ where }: any = {}) => db.prompts.filter((row) => matchesWhere(row, where)).length,
    },
    competitor: {
      findMany: async ({ where, select }: any = {}) => {
        const rows = db.competitors.filter((row) => matchesWhere(row, where));
        return projectMany(rows, select);
      },
    },
  };
}

const state = vi.hoisted(() => {
  const prisma = createReportPrismaMock();
  return {
    prisma,
    auth: vi.fn((req: any, _res: any, next: any) => {
      req.user = { userId: 1, email: 'owner@example.com' };
      return next();
    }),
    timed: vi.fn((_label: string, _ms: number) => (req: any, _res: any, next: any) => next()),
    getOwnerUserId: vi.fn((req: any) => req.user?.userId ?? null),
    computePhraseVisibility: vi.fn(() => []),
    computeOpportunities: vi.fn(() => []),
    computeCompetitorAnalysis: vi.fn(() => ({
      competitors: [],
      ownBrand: { host: 'example.com', mentions: 0, marketShare: 0, avgSentiment: null },
      totals: { prompts: 0, results: 0, competitorMentions: 0 },
    })),
    redis: {
      get: vi.fn(async () => null),
      set: vi.fn(async () => undefined),
      del: vi.fn(async () => undefined),
    },
    weeklyTracking: {
      runWeeklyForDomain: vi.fn(async () => ({ skipped: false })),
    },
  };
});

vi.mock('../../generated/prisma', () => ({
  Prisma: {},
  PrismaClient: class {
    constructor() {
      return state.prisma;
    }
  },
}));

vi.mock('../middleware/auth', () => ({
  authenticateToken: state.auth,
}));

vi.mock('../middleware/authenticateOrSession', () => ({
  authenticateOrSession: () => state.auth,
  getOwnerUserId: state.getOwnerUserId,
}));

vi.mock('../lib/timed', () => ({
  timed: state.timed,
}));

vi.mock('../services/RedisService', () => ({
  redisService: state.redis,
}));

vi.mock('./analyticsService', () => ({
  computePhraseVisibility: state.computePhraseVisibility,
  computeOpportunities: state.computeOpportunities,
  computeCompetitorAnalysis: state.computeCompetitorAnalysis,
}));

vi.mock('../services/weeklyTrackingService', () => state.weeklyTracking);

import wizardRouter from './routes';

let server: Server | null = null;
let baseUrl = '';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/wizard', wizardRouter);
  return app;
}

async function startServer() {
  const app = buildApp();
  server = await new Promise<Server>((resolve) => {
    const srv = app.listen(0, '127.0.0.1', () => resolve(srv));
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Failed to start test server');
  baseUrl = `http://127.0.0.1:${address.port}`;
}

async function stopServer() {
  if (!server) return;
  await new Promise<void>((resolve, reject) => {
    server!.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
  server = null;
}

async function request(path: string) {
  return fetch(`${baseUrl}${path}`);
}

async function post(path: string) {
  return fetch(`${baseUrl}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
}

function resetData() {
  const db = state.prisma.__db;
  for (const key of Object.keys(db) as Array<keyof typeof db>) {
    db[key].splice(0, db[key].length);
  }
  state.auth.mockClear();
  state.timed.mockClear();
  state.getOwnerUserId.mockClear();
  state.computePhraseVisibility.mockClear();
  state.computeOpportunities.mockClear();
  state.computeCompetitorAnalysis.mockClear();
  state.weeklyTracking.runWeeklyForDomain.mockReset();
  state.weeklyTracking.runWeeklyForDomain.mockResolvedValue({ skipped: false });
}

beforeAll(async () => {
  await startServer();
});

afterAll(async () => {
  await stopServer();
});

beforeEach(() => {
  resetData();
});

describe('GET /api/wizard/domain/:id/report', () => {
  it('exposes the same prompt payload under both topPrompts and topAiSearchPrompts', async () => {
    const db = state.prisma.__db;
    db.domains.push({
      id: 1,
      userId: 1,
      url: 'https://example.com',
      host: 'example.com',
      profile: { industry: 'SaaS' },
      inferred: { companyName: 'Example Co' },
    });
    db.runs.push({
      id: 10,
      domainId: 1,
      status: 'completed',
      kind: 'audit',
      startedAt: new Date('2026-06-10T10:00:00.000Z'),
      endedAt: new Date('2026-06-10T10:05:00.000Z'),
      summary: {
        presenceRate: 0.5,
        avgOverall: 0.7,
        avgSentiment: 0.2,
        totalQueries: 1,
        perModel: {
          'gpt-4o-mini': { presenceRate: 0.5, avgOverall: 0.7, avgSentiment: 0.2, queries: 1 },
        },
      },
    });
    db.prompts.push({
      id: 101,
      domainId: 1,
      keywordId: null,
      text: 'best ai search tools for SaaS teams',
      intent: 'Commercial',
      source: 'ai',
      isSelected: true,
      isTracked: false,
      lastTrackedRunAt: null,
      category: 'unbranded_recommendation',
      intentStage: 'consideration',
      persona: 'SaaS manager',
      useCase: 'tool selection',
      constraint: null,
      isBranded: false,
      competitorMentioned: null,
      createdAt: new Date('2026-06-01T00:00:00.000Z'),
    });
    db.results.push({
      id: 201,
      runId: 10,
      promptId: 101,
      model: 'gpt-4o-mini',
      response: 'Example response',
      presence: 1,
      relevance: 8,
      sentiment: 2,
      accuracy: 7,
      rankPosition: 1,
      overall: 7.4,
      scorerSummary: 'Brand mentioned positively',
      factualClaims: [],
      competitorHosts: [],
      citations: [],
      competitorMentions: [],
      latencyMs: 450,
      createdAt: new Date('2026-06-10T10:01:00.000Z'),
    });

    const response = await request('/api/wizard/domain/1/report');
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(Array.isArray(json.topPrompts)).toBe(true);
    expect(Array.isArray(json.topAiSearchPrompts)).toBe(true);
    expect(json.topAiSearchPrompts).toEqual(json.topPrompts);
    expect(json.topPrompts).toHaveLength(1);
    expect(json.topPrompts[0]).toMatchObject({
      id: 'pr-101',
      rawId: 101,
      type: 'prompt',
      phrase: 'best ai search tools for SaaS teams',
      sov: '100%',
      mentions: 1,
      avgSentiment: 6,
    });
  });

  it('keeps both prompt arrays empty on a domain with no completed run yet', async () => {
    const db = state.prisma.__db;
    db.domains.push({
      id: 2,
      userId: 1,
      url: 'https://empty.example',
      host: 'empty.example',
      profile: { industry: null },
      inferred: { companyName: null },
    });

    const response = await request('/api/wizard/domain/2/report');
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.topPrompts).toEqual([]);
    expect(json.topAiSearchPrompts).toEqual([]);
    expect(json.runStatus).toBe('pending');
  });
});

describe('GET /api/wizard/domain/:id/trends', () => {
  const dayMs = 24 * 60 * 60 * 1000;

  const makeDay = (daysAgo: number, hour = 12) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - daysAgo);
    d.setUTCHours(hour, 0, 0, 0);
    return d;
  };

  it('returns a zeroed 7-day window when there are no completed runs', async () => {
    const db = state.prisma.__db;
    db.domains.push({
      id: 3,
      userId: 1,
      url: 'https://silent.example',
      host: 'silent.example',
      profile: { industry: null },
      inferred: { companyName: null },
    });

    const response = await request('/api/wizard/domain/3/trends?days=7');
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.windowDays).toBe(7);
    expect(json.days).toHaveLength(7);
    expect(json.days.every((day: any) => day.runCount === 0)).toBe(true);
    expect(json.runs).toEqual([]);
    expect(json.topCompetitors).toEqual([]);
  });

  it('keeps competitor series stable across the full 7-day window', async () => {
    const db = state.prisma.__db;
    db.domains.push({
      id: 4,
      userId: 1,
      url: 'https://trend.example',
      host: 'trend.example',
      profile: { industry: 'SaaS' },
      inferred: { companyName: 'Trend Co' },
    });

    const runOneStartedAt = makeDay(5, 9);
    const runTwoStartedAt = makeDay(1, 15);

    db.runs.push(
      {
        id: 41,
        domainId: 4,
        status: 'completed',
        kind: 'audit',
        startedAt: runOneStartedAt,
        endedAt: new Date(runOneStartedAt.getTime() + dayMs / 24),
      },
      {
        id: 42,
        domainId: 4,
        status: 'completed',
        kind: 'audit',
        startedAt: runTwoStartedAt,
        endedAt: new Date(runTwoStartedAt.getTime() + dayMs / 24),
      },
    );

    db.results.push(
      {
        id: 401,
        runId: 41,
        promptId: 1,
        model: 'gpt-4o-mini',
        response: 'alpha appears',
        presence: 1,
        relevance: 7,
        sentiment: 0,
        accuracy: 0,
        rankPosition: null,
        overall: 7,
        scorerSummary: null,
        factualClaims: [],
        competitorHosts: ['alpha.com'],
        citations: [{ host: 'alpha.com', url: 'https://alpha.com/a', title: 'Alpha A' }],
        competitorMentions: [{ host: 'alpha.com', count: 2, sentiment: 0 }],
        latencyMs: 100,
        createdAt: new Date(runOneStartedAt.getTime() + 5 * 60 * 1000),
      },
      {
        id: 402,
        runId: 41,
        promptId: 2,
        model: 'claude-sonnet-4-5',
        response: 'beta appears',
        presence: 1,
        relevance: 8,
        sentiment: 1,
        accuracy: 0,
        rankPosition: null,
        overall: 8,
        scorerSummary: null,
        factualClaims: [],
        competitorHosts: ['beta.com'],
        citations: [{ host: 'beta.com', url: 'https://beta.com/a', title: 'Beta A' }],
        competitorMentions: [{ host: 'beta.com', count: 1, sentiment: 0 }],
        latencyMs: 120,
        createdAt: new Date(runOneStartedAt.getTime() + 10 * 60 * 1000),
      },
      {
        id: 403,
        runId: 42,
        promptId: 3,
        model: 'gpt-4o-mini',
        response: 'alpha again',
        presence: 1,
        relevance: 9,
        sentiment: 2,
        accuracy: 0,
        rankPosition: null,
        overall: 9,
        scorerSummary: null,
        factualClaims: [],
        competitorHosts: ['alpha.com'],
        citations: [{ host: 'alpha.com', url: 'https://alpha.com/b', title: 'Alpha B' }],
        competitorMentions: [{ host: 'alpha.com', count: 1, sentiment: 0 }],
        latencyMs: 110,
        createdAt: new Date(runTwoStartedAt.getTime() + 5 * 60 * 1000),
      },
    );

    const response = await request('/api/wizard/domain/4/trends?days=7');
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.windowDays).toBe(7);
    expect(json.days).toHaveLength(7);
    expect(json.topCompetitors).toEqual(['alpha.com', 'beta.com']);

    const runOneKey = runOneStartedAt.toISOString().slice(0, 10);
    const runTwoKey = runTwoStartedAt.toISOString().slice(0, 10);
    const runOneDay = json.days.find((day: any) => day.date === runOneKey);
    const runTwoDay = json.days.find((day: any) => day.date === runTwoKey);

    expect(runOneDay).toMatchObject({
      runCount: 1,
      perCompetitor: { 'alpha.com': 2, 'beta.com': 1 },
      perCompetitorCitations: { 'alpha.com': 1, 'beta.com': 1 },
    });
    expect(runTwoDay).toMatchObject({
      runCount: 1,
      perCompetitor: { 'alpha.com': 1 },
      perCompetitorCitations: { 'alpha.com': 1 },
    });
  });
});

describe('POST /api/wizard/domain/:id/tracked-prompts/run-now', () => {
  it('returns a structured error when the refresh pipeline fails', async () => {
    const db = state.prisma.__db;
    db.domains.push({
      id: 20,
      userId: 1,
      url: 'https://example.com',
      host: 'example.com',
      profile: { industry: 'SaaS' },
      inferred: { companyName: 'Example Co' },
      wizardState: { phases: {} },
    });
    db.prompts.push({
      id: 201,
      domainId: 20,
      text: 'Prompt 1',
      isSelected: true,
    });

    state.weeklyTracking.runWeeklyForDomain.mockRejectedValueOnce(
      Object.assign(new Error('401 Missing Authentication header'), {
        name: 'RunPipelineError',
        code: 'OPENROUTER_AUTH_MISSING',
        status: 502,
        details: { upstreamStatus: 401 },
      }),
    );

    const response = await post('/api/wizard/domain/20/tracked-prompts/run-now');
    const json = await response.json();

    expect(response.status).toBe(502);
    expect(json.code).toBe('OPENROUTER_AUTH_MISSING');
    expect(json.error).toContain('Missing Authentication header');
    expect(json.debug).toMatchObject({ upstreamStatus: 401 });
  });

  it('returns a code when there are no selected prompts', async () => {
    const db = state.prisma.__db;
    db.domains.push({
      id: 21,
      userId: 1,
      url: 'https://empty.example',
      host: 'empty.example',
      profile: { industry: 'SaaS' },
      inferred: { companyName: 'Empty Co' },
      wizardState: { phases: {} },
    });

    const response = await post('/api/wizard/domain/21/tracked-prompts/run-now');
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.code).toBe('NO_SELECTED_PROMPTS');
    expect(json.error).toContain('No selected prompts');
  });
});

describe('branch-aware competitor history', () => {
  const dayMs = 24 * 60 * 60 * 1000;

  const makeDay = (daysAgo: number, hour = 12) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - daysAgo);
    d.setUTCHours(hour, 0, 0, 0);
    return d;
  };

  it('keeps same-prompt refresh runs together and excludes a different prompt set', async () => {
    const db = state.prisma.__db;
    db.domains.push({
      id: 6,
      userId: 1,
      url: 'https://branch.example',
      host: 'branch.example',
      currentAnalysisFingerprint: 'legacy-fingerprint',
      profile: { industry: 'SaaS' },
      inferred: { companyName: 'Branch Co' },
    });

    const olderDifferentStartedAt = makeDay(6, 8);
    const firstBranchStartedAt = makeDay(3, 9);
    const secondBranchStartedAt = makeDay(1, 15);

    db.runs.push(
      {
        id: 61,
        domainId: 6,
        status: 'completed',
        kind: 'audit',
        startedAt: olderDifferentStartedAt,
        endedAt: new Date(olderDifferentStartedAt.getTime() + dayMs / 24),
        analysisFingerprint: 'hash-old',
        analysisSnapshot: [{ id: 301, text: 'older different prompt' }],
        summary: { presenceRate: 0.2, totalQueries: 1 },
      },
      {
        id: 62,
        domainId: 6,
        status: 'completed',
        kind: 'audit',
        startedAt: firstBranchStartedAt,
        endedAt: new Date(firstBranchStartedAt.getTime() + dayMs / 24),
        analysisFingerprint: 'hash-branch-a',
        analysisSnapshot: [
          { id: 101, text: 'same prompt one v1' },
          { id: 102, text: 'same prompt two v1' },
        ],
        summary: { presenceRate: 0.5, totalQueries: 2 },
      },
      {
        id: 63,
        domainId: 6,
        status: 'completed',
        kind: 'refresh',
        startedAt: secondBranchStartedAt,
        endedAt: new Date(secondBranchStartedAt.getTime() + dayMs / 24),
        analysisFingerprint: 'hash-branch-b',
        analysisSnapshot: [
          { id: 101, text: 'same prompt one v2' },
          { id: 102, text: 'same prompt two v2' },
        ],
        summary: { presenceRate: 0.7, totalQueries: 2 },
      },
    );

    db.results.push(
      {
        id: 611,
        runId: 61,
        promptId: 301,
        model: 'gpt-4o-mini',
        response: 'older different prompt',
        presence: 0,
        relevance: 0,
        sentiment: null,
        accuracy: null,
        rankPosition: null,
        overall: 0,
        scorerSummary: null,
        factualClaims: [],
        competitorHosts: [],
        citations: [],
        competitorMentions: [],
        latencyMs: 90,
        createdAt: new Date(olderDifferentStartedAt.getTime() + 5 * 60 * 1000),
      },
      {
        id: 621,
        runId: 62,
        promptId: 101,
        model: 'gpt-4o-mini',
        response: 'branch run one',
        presence: 1,
        relevance: 7,
        sentiment: 1,
        accuracy: 0,
        rankPosition: null,
        overall: 7,
        scorerSummary: null,
        factualClaims: [],
        competitorHosts: ['alpha.com'],
        citations: [{ host: 'alpha.com', url: 'https://alpha.com/a', title: 'Alpha A' }],
        competitorMentions: [{ host: 'alpha.com', count: 1, sentiment: 0 }],
        latencyMs: 100,
        createdAt: new Date(firstBranchStartedAt.getTime() + 5 * 60 * 1000),
      },
      {
        id: 622,
        runId: 62,
        promptId: 102,
        model: 'claude-sonnet-4-5',
        response: 'branch run one',
        presence: 0,
        relevance: 6,
        sentiment: null,
        accuracy: 0,
        rankPosition: null,
        overall: 6,
        scorerSummary: null,
        factualClaims: [],
        competitorHosts: [],
        citations: [],
        competitorMentions: [],
        latencyMs: 120,
        createdAt: new Date(firstBranchStartedAt.getTime() + 10 * 60 * 1000),
      },
      {
        id: 631,
        runId: 63,
        promptId: 101,
        model: 'gpt-4o-mini',
        response: 'branch run two',
        presence: 1,
        relevance: 8,
        sentiment: 2,
        accuracy: 0,
        rankPosition: null,
        overall: 8,
        scorerSummary: null,
        factualClaims: [],
        competitorHosts: ['beta.com'],
        citations: [{ host: 'beta.com', url: 'https://beta.com/b', title: 'Beta B' }],
        competitorMentions: [{ host: 'beta.com', count: 1, sentiment: 0 }],
        latencyMs: 110,
        createdAt: new Date(secondBranchStartedAt.getTime() + 5 * 60 * 1000),
      },
      {
        id: 632,
        runId: 63,
        promptId: 102,
        model: 'claude-sonnet-4-5',
        response: 'branch run two',
        presence: 1,
        relevance: 9,
        sentiment: 3,
        accuracy: 0,
        rankPosition: null,
        overall: 9,
        scorerSummary: null,
        factualClaims: [],
        competitorHosts: ['beta.com'],
        citations: [{ host: 'beta.com', url: 'https://beta.com/c', title: 'Beta C' }],
        competitorMentions: [{ host: 'beta.com', count: 2, sentiment: 1 }],
        latencyMs: 115,
        createdAt: new Date(secondBranchStartedAt.getTime() + 10 * 60 * 1000),
      },
    );

    const [trendsResponse, runsResponse, competitorResponse] = await Promise.all([
      request('/api/wizard/domain/6/trends'),
      request('/api/wizard/domain/6/runs'),
      request('/api/wizard/domain/6/competitor-analysis'),
    ]);

    const trendsJson = await trendsResponse.json();
    const runsJson = await runsResponse.json();
    const competitorJson = await competitorResponse.json();

    expect(trendsResponse.status).toBe(200);
    expect(trendsJson.runs.map((run: any) => run.runId)).toEqual([62, 63]);
    expect(trendsJson.runs).toHaveLength(2);

    expect(runsResponse.status).toBe(200);
    expect(runsJson.runs.map((run: any) => run.id)).toEqual([63, 62]);
    expect(runsJson.runs).toHaveLength(2);

    expect(competitorResponse.status).toBe(200);
    expect(competitorJson.runId).toBe(63);
    expect(competitorJson.runStartedAt).toBe(secondBranchStartedAt.toISOString());
  });
});
