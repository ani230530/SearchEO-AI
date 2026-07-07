import express from 'express';
import type { Server } from 'http';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPrismaMock, PrismaMock } from '../testSupport/prismaMock';

const scheduleState = vi.hoisted(() => ({
  prisma: null as PrismaMock | null,
  authUser: { userId: 1, email: 'editor@example.com', role: 'admin' },
  scheduleWordpressPublish: vi.fn(async () => undefined),
  cancelWordpressPublishSchedule: vi.fn(async () => true),
}));

vi.mock('../../generated/prisma', () => ({
  PrismaClient: class {
    constructor() {
      if (!scheduleState.prisma) scheduleState.prisma = createPrismaMock();
      return scheduleState.prisma;
    }
  },
}));

vi.mock('../middleware/auth', () => ({
  authenticateToken: (req: any, _res: any, next: any) => {
    req.user = scheduleState.authUser;
    return next();
  },
  isAdmin: (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../services/wordpressPublishScheduler', () => ({
  scheduleWordpressPublish: scheduleState.scheduleWordpressPublish,
  cancelWordpressPublishSchedule: scheduleState.cancelWordpressPublishSchedule,
}));

vi.mock('../utils/cloudinary', () => ({
  uploadImage: vi.fn(),
}));

import publishRouter from './publish';

let server: Server | null = null;
let baseUrl = '';

function app() {
  const instance = express();
  instance.use(express.json({ limit: '20mb' }));
  instance.use('/api/publish', publishRouter);
  return instance;
}

async function startServer() {
  const instance = app();
  server = await new Promise<Server>((resolve) => {
    const srv = instance.listen(0, '127.0.0.1', () => resolve(srv));
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

async function request(path: string, init?: RequestInit) {
  return fetch(`${baseUrl}${path}`, init);
}

async function readJson(response: Response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Unexpected response (${response.status}): ${text}`);
  }
}

function resetDb() {
  if (!scheduleState.prisma) scheduleState.prisma = createPrismaMock();
  for (const store of Object.values(scheduleState.prisma.__stores)) {
    store.rows.clear();
  }
  scheduleState.authUser = { userId: 1, email: 'editor@example.com', role: 'admin' };
  scheduleState.scheduleWordpressPublish.mockClear();
  scheduleState.cancelWordpressPublishSchedule.mockClear();
}

beforeAll(async () => {
  process.env.FRONTEND_URL = 'https://company.example';
  await startServer();
});

afterAll(async () => {
  await stopServer();
});

beforeEach(async () => {
  resetDb();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('publish scheduling routes', () => {
  it('creates a scheduled draft and queues a delayed publish job', async () => {
    const prisma = scheduleState.prisma!;
    await prisma.wordpressIntegration.create({
      data: {
        userId: 1,
        siteUrl: 'https://example.com',
        username: 'editor',
        password: 'encrypted-password',
      },
    });

    const scheduledAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const response = await request('/api/publish/schedule', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        primaryKeyword: 'schedule keyword',
        htmlContent: '<p>scheduled body</p>',
        title: 'Scheduled Article',
        metaDescription: 'Scheduled meta',
        slug: 'scheduled-article',
        scheduledAt,
      }),
    });

    const json = await readJson(response);

    expect(response.status).toBe(200);
    expect(json.status).toBe('scheduled');
    expect(json.scheduledAt).toBe(scheduledAt);
    expect(json.draft.status).toBe('scheduled');
    expect(json.draft.scheduledAt).toBe(scheduledAt);
    expect(scheduleState.scheduleWordpressPublish).toHaveBeenCalledTimes(1);
    expect(scheduleState.scheduleWordpressPublish).toHaveBeenCalledWith(expect.any(Number), expect.any(Date));

    const saved = await prisma.wordpressPublishLog.findUnique({ where: { id: json.draftId } });
    expect(saved?.status).toBe('scheduled');
    expect(saved?.scheduledAt).not.toBeNull();
    expect(saved?.publishedAt).toBeNull();
  });

  it('cancels a scheduled draft and clears the scheduled timestamp', async () => {
    const prisma = scheduleState.prisma!;
    await prisma.wordpressIntegration.create({
      data: {
        userId: 1,
        siteUrl: 'https://example.com',
        username: 'editor',
        password: 'encrypted-password',
      },
    });

    const draft = await prisma.wordpressPublishLog.create({
      data: {
        userId: 1,
        wordpressUrl: 'https://example.com',
        primaryKeyword: 'schedule keyword',
        title: 'Scheduled Article',
        slug: 'scheduled-article',
        status: 'scheduled',
        scheduledAt: new Date(Date.now() + 60 * 60 * 1000),
        publishedAt: null,
        response: {
          htmlContent: '<p>scheduled body</p>',
          title: 'Scheduled Article',
          slug: 'scheduled-article',
          primaryKeyword: 'schedule keyword',
          status: 'scheduled',
        },
        integrationId: 1,
      },
    });

    const response = await request(`/api/publish/schedule/${draft.id}`, {
      method: 'DELETE',
    });

    const json = await readJson(response);

    expect(response.status).toBe(200);
    expect(json.draft.status).toBe('draft');
    expect(json.draft.scheduledAt).toBeNull();
    expect(scheduleState.cancelWordpressPublishSchedule).toHaveBeenCalledTimes(1);

    const saved = await prisma.wordpressPublishLog.findUnique({ where: { id: draft.id } });
    expect(saved?.status).toBe('draft');
    expect(saved?.scheduledAt).toBeNull();
    expect(saved?.publishedAt).toBeNull();
  });
});
