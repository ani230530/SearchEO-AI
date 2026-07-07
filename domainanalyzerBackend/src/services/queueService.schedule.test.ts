import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPrismaMock, PrismaMock } from '../testSupport/prismaMock';

const state = vi.hoisted(() => ({
  prisma: null as PrismaMock | null,
  processor: null as ((job: any) => Promise<any>) | null,
  axiosPost: vi.fn(),
  broadcastToUser: vi.fn(),
  decryptToken: vi.fn(),
}));

vi.mock('ioredis', () => ({
  default: class MockRedis {
    constructor() {}
    on() {}
  },
}));

vi.mock('bullmq', () => ({
  Queue: class MockQueue {
    constructor() {}
    add = vi.fn();
    getJob = vi.fn();
  },
  Worker: class MockWorker {
    constructor(_name: string, processor: (job: any) => Promise<any>) {
      state.processor = processor;
    }
    on() {}
  },
}));

vi.mock('axios', () => ({
  default: {
    post: state.axiosPost,
    isAxiosError: (value: unknown) => Boolean(value && typeof value === 'object' && 'response' in value),
  },
}));

vi.mock('../lib/prisma', () => ({
  prisma: (() => {
    if (!state.prisma) state.prisma = createPrismaMock();
    return state.prisma;
  })(),
}));

vi.mock('./tokenEncryption', () => ({
  decryptToken: state.decryptToken,
}));

vi.mock('./sseService', () => ({
  broadcastToUser: state.broadcastToUser,
}));

import { JOB_TYPES } from './queueService';

function resetDb() {
  if (!state.prisma) state.prisma = createPrismaMock();
  for (const store of Object.values(state.prisma.__stores)) {
    store.rows.clear();
  }
  state.axiosPost.mockReset();
  state.broadcastToUser.mockReset();
  state.decryptToken.mockReset();
  state.decryptToken.mockReturnValue('plain-password');
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('queueService publish jobs', () => {
  it('rebuilds scheduled publish payload from the latest saved draft snapshot', async () => {
    resetDb();
    const prisma = state.prisma!;

    const integration = await prisma.wordpressIntegration.create({
      data: {
        userId: 1,
        siteUrl: 'https://example.com',
        username: 'editor',
        password: 'encrypted-password',
        lastPublishedAt: null,
      },
    });

    const draft = await prisma.wordpressPublishLog.create({
      data: {
        userId: 1,
        wordpressUrl: 'https://example.com',
        primaryKeyword: 'old keyword',
        title: 'Scheduled Article',
        slug: 'scheduled-article',
        status: 'scheduled',
        scheduledAt: new Date(Date.now() + 60_000),
        publishedAt: null,
        response: {
          htmlContent: '<p>latest scheduled body</p>',
          title: 'Scheduled Article Updated',
          metaDescription: 'Updated meta',
          slug: 'scheduled-article-updated',
          primaryKeyword: 'latest keyword',
          featuredImageEnabled: true,
          featuredImageUrl: 'https://cdn.example/hero.jpg',
          longtailKeywords: 'extra 1, extra 2',
          status: 'scheduled',
        },
        integrationId: integration.id,
      },
    });

    state.axiosPost.mockResolvedValue({
      status: 200,
      data: {
        link: 'https://example.com/scheduled-article-updated',
        id: 77,
        slug: 'scheduled-article-updated',
        title: 'Scheduled Article Updated',
      },
    });

    const processor = state.processor;
    expect(processor).not.toBeNull();

    await processor!({
      id: 'job-1',
      name: JOB_TYPES.PUBLISH,
      data: {
        draftId: draft.id,
      },
    });

    expect(state.decryptToken).toHaveBeenCalledWith('encrypted-password');
    expect(state.axiosPost).toHaveBeenCalledTimes(1);
    const [url, payload] = state.axiosPost.mock.calls[0];
    expect(url).toContain('/webhook/');
    expect(payload).toEqual([
      {
        Username: 'editor',
        Password: 'plain-password',
        'wordpress url': 'https://example.com',
        'Primary Keyword': 'latest keyword',
        'Html Content': '<p>latest scheduled body</p>',
        'Featured Image': 'https://cdn.example/hero.jpg',
        Title: 'Scheduled Article Updated',
        'Meta Description': 'Updated meta',
        slug: 'scheduled-article-updated',
      },
    ]);

    const savedDraft = await prisma.wordpressPublishLog.findUnique({ where: { id: draft.id } });
    expect(savedDraft?.status).toBe('published');
    expect(savedDraft?.publishedAt).not.toBeNull();
    expect(savedDraft?.wordpressUrl).toBe('https://example.com/scheduled-article-updated');

    const savedIntegration = await prisma.wordpressIntegration.findUnique({ where: { id: integration.id } });
    expect(savedIntegration?.lastPublishedAt).not.toBeNull();
    expect(state.broadcastToUser).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        type: 'publish_update',
        draftId: draft.id,
        status: 'published',
        publishedUrl: 'https://example.com/scheduled-article-updated',
      }),
    );
  });
});
