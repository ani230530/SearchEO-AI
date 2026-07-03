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

  const sortRows = (rows: AnyRow[], orderBy?: AnyRow | AnyRow[]) => {
    if (!orderBy) return rows;
    const orderEntries = Array.isArray(orderBy)
      ? orderBy.flatMap((entry) => Object.entries(entry))
      : Object.entries(orderBy);
    if (orderEntries.length === 0) return rows;
    return [...rows].sort((a, b) => {
      for (const [field, direction] of orderEntries) {
        const av = a[field];
        const bv = b[field];
        const aTime = av instanceof Date ? av.getTime() : av;
        const bTime = bv instanceof Date ? bv.getTime() : bv;
        if (aTime === bTime) continue;
        const diff = aTime > bTime ? 1 : -1;
        return direction === 'desc' ? -diff : diff;
      }
      return 0;
    });
  };

  const projectMany = (rows: AnyRow[], select?: AnyRow) => rows.map((row) => projectRow(row, select));

  const runMatches = (run: AnyRow, where: AnyRow = {}) => {
    const { domainId, status, kind, ...rest } = where;
    if (domainId !== undefined && run.domainId !== domainId) return false;
    if (status !== undefined && run.status !== status) return false;
    if (kind !== undefined && run.kind !== kind) return false;
    return matchesWhere(run, rest);
  };

  return {
    __db: db,
    domain: {
      findUnique: async ({ where }: any) => db.domains.find((row) => row.id === where.id) ?? null,
      findFirst: async ({ where, include }: any = {}) => {
        const row = db.domains.find((candidate) => matchesWhere(candidate, where));
        if (!row) return null;
        if (!include?.runs) return row;
        const runInclude = include.runs;
        let runs = db.runs.filter((run) => runMatches(run, { ...(runInclude.where ?? {}), domainId: row.id }));
        runs = sortRows(runs, runInclude.orderBy);
        if (typeof runInclude.take === 'number') runs = runs.slice(0, runInclude.take);
        return { ...row, runs: projectMany(runs, runInclude.select) };
      },
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
        return rows.map((row) => {
          if (!select?.run) return projectRow(row, select);
          const run = db.runs.find((candidate) => candidate.id === row.runId);
          return projectRow(
            {
              ...row,
              run: run ? projectRow(run, select.run.select) : null,
            },
            select,
          );
        });
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
      findFirst: async ({ where, select, orderBy }: any = {}) => {
        const rows = sortRows(db.prompts.filter((row) => matchesWhere(row, where)), orderBy);
        return rows[0] ? projectRow(rows[0], select) : null;
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

vi.mock('../lib/prisma', () => ({
  prisma: state.prisma,
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

import wizardRouter, { nextDailyRunAt } from './routes';

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

describe('nextDailyRunAt', () => {
  it('returns today at 03:00 UTC before the daily cutoff', () => {
    expect(nextDailyRunAt(new Date('2026-06-24T02:59:59.000Z')).toISOString())
      .toBe('2026-06-24T03:00:00.000Z');
  });

  it('returns tomorrow at 03:00 UTC once the daily cutoff has arrived', () => {
    expect(nextDailyRunAt(new Date('2026-06-24T03:00:00.000Z')).toISOString())
      .toBe('2026-06-25T03:00:00.000Z');
  });
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

describe('GET /api/wizard/domain/:id/tracked-prompts', () => {
  function seedDailyTrackedRuns() {
    const db = state.prisma.__db;
    db.domains.push({
      id: 6,
      userId: 1,
      url: 'https://daily.example',
      host: 'daily.example',
      profile: { industry: 'SaaS' },
      inferred: { companyName: 'Daily Co' },
    });
    db.prompts.push({
      id: 601,
      domainId: 6,
      keywordId: null,
      text: 'best daily ai tracking tools',
      intent: 'Commercial',
      source: 'ai',
      isSelected: true,
      isTracked: true,
      lastTrackedRunAt: null,
      category: 'unbranded_recommendation',
      intentStage: 'consideration',
      persona: 'SaaS manager',
      useCase: 'tracking',
      constraint: null,
      isBranded: false,
      competitorMentioned: null,
      createdAt: new Date('2026-06-01T00:00:00.000Z'),
    });

    const runs = [
      { id: 61, startedAt: new Date('2026-06-24T03:00:00.000Z') },
      { id: 62, startedAt: new Date('2026-06-25T01:00:00.000Z') },
      { id: 63, startedAt: new Date('2026-06-25T20:00:00.000Z') },
      { id: 64, startedAt: new Date('2026-06-26T03:00:00.000Z') },
    ];
    db.runs.push(...runs.map((run) => ({
      id: run.id,
      domainId: 6,
      status: 'completed',
      kind: 'weekly',
      startedAt: run.startedAt,
      endedAt: new Date(run.startedAt.getTime() + 5 * 60 * 1000),
    })));

    const presenceByRun = new Map<number, number>([
      [61, 0],
      [62, 0],
      [63, 1],
      [64, 0],
    ]);
    db.results.push(...runs.map((run) => ({
      id: 600 + run.id,
      runId: run.id,
      promptId: 601,
      model: 'gpt-4o-mini',
      status: 'success',
      response: presenceByRun.get(run.id) === 1 ? 'Daily Co appears' : 'No brand mention',
      presence: presenceByRun.get(run.id) ?? 0,
      relevance: 8,
      sentiment: presenceByRun.get(run.id) === 1 ? 2 : null,
      accuracy: 7,
      rankPosition: presenceByRun.get(run.id) === 1 ? 1 : null,
      overall: 7,
      scorerSummary: 'scored',
      factualClaims: [],
      competitorHosts: [],
      citations: [],
      competitorMentions: [],
      latencyMs: 450,
      createdAt: new Date(run.startedAt.getTime() + 60 * 1000),
    })));
  }

  it('returns daily cadence and collapses multiple tracked runs on the same UTC day', async () => {
    seedDailyTrackedRuns();

    const response = await request('/api/wizard/domain/6/tracked-prompts');
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.cadence).toBe('daily');
    expect(new Date(json.nextTestAt).getUTCHours()).toBe(3);
    expect(json.latestRunAt).toBe('2026-06-26T03:00:00.000Z');

    const prompt = json.prompts[0];
    expect(prompt.weekTrend.delta).toBe(-100);
    expect(prompt.weekTrend.points).toEqual([
      { runId: 61, startedAt: '2026-06-24T00:00:00.000Z', visibility: 0 },
      { runId: 63, startedAt: '2026-06-25T00:00:00.000Z', visibility: 100 },
      { runId: 64, startedAt: '2026-06-26T00:00:00.000Z', visibility: 0 },
    ]);
  });

  it('keeps ?kind=weekly compatible while collapsing prompt history by UTC day', async () => {
    seedDailyTrackedRuns();

    const response = await request('/api/wizard/domain/6/prompts/601/history?kind=weekly');
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.runs.map((run: any) => run.runId)).toEqual([61, 63, 64]);
    expect(json.runs.map((run: any) => run.startedAt)).toEqual([
      '2026-06-24T03:00:00.000Z',
      '2026-06-25T20:00:00.000Z',
      '2026-06-26T03:00:00.000Z',
    ]);
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

  it('excludes failed provider rows and own-domain competitor echoes from trend rollups', async () => {
    const db = state.prisma.__db;
    db.domains.push({
      id: 5,
      userId: 1,
      url: 'https://brand.example',
      host: 'brand.example',
      profile: { industry: 'SaaS' },
      inferred: { companyName: 'Brand Example' },
    });

    const startedAt = makeDay(0, 11);
    db.runs.push({
      id: 51,
      domainId: 5,
      status: 'completed',
      kind: 'audit',
      startedAt,
      endedAt: new Date(startedAt.getTime() + dayMs / 24),
    });

    db.results.push(
      {
        id: 501,
        runId: 51,
        promptId: 1,
        model: 'gpt-4o-mini',
        status: 'success',
        response: 'brand.example and alpha.com appear',
        presence: 1,
        relevance: 8,
        sentiment: 1,
        accuracy: 8,
        rankPosition: null,
        overall: 8,
        scorerSummary: 'scored',
        factualClaims: [],
        competitorHosts: ['brand.example', 'alpha.com'],
        citations: [],
        competitorMentions: [],
        latencyMs: 100,
        createdAt: startedAt,
      },
      {
        id: 502,
        runId: 51,
        promptId: 2,
        model: 'claude-sonnet-4-5',
        status: 'failed',
        response: '',
        presence: 1,
        relevance: 0,
        sentiment: null,
        accuracy: null,
        rankPosition: null,
        overall: 0,
        scorerSummary: null,
        factualClaims: [],
        competitorHosts: ['alpha.com'],
        citations: [{ host: 'alpha.com', url: 'https://alpha.com/failed', title: 'Should not count' }],
        competitorMentions: [{ host: 'alpha.com', count: 9, sentiment: 0 }],
        latencyMs: null,
        createdAt: startedAt,
      },
      {
        id: 503,
        runId: 51,
        promptId: 3,
        model: 'gemini-2.0-flash',
        response: '',
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
        latencyMs: null,
        createdAt: startedAt,
      },
    );

    const response = await request('/api/wizard/domain/5/trends');
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.runs).toHaveLength(1);
    expect(json.runs[0]).toMatchObject({
      brandMentions: 1,
      competitorMentions: 1,
      totalResponses: 1,
      totalCitations: 0,
      perCompetitor: { 'alpha.com': 1 },
      perModel: {
        'gpt-4o-mini': { presenceCount: 1, cites: 0 },
      },
    });
    expect(json.topCompetitors).toEqual(['alpha.com']);
  });
});
