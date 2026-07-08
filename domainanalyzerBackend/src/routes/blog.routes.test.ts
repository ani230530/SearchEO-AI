import express from 'express';
import type { Server } from 'http';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import { createPrismaMock, PrismaMock } from '../testSupport/prismaMock';

const state = vi.hoisted(() => ({
  prisma: null as PrismaMock | null,
  authUser: { userId: 1, email: 'editor@example.com', role: 'admin' },
}));

vi.mock('../../generated/prisma', () => ({
  PrismaClient: class {
    constructor() {
      if (!state.prisma) state.prisma = createPrismaMock();
      return state.prisma;
    }
  },
}));

vi.mock('../middleware/auth', () => ({
  authenticateToken: (req: any, _res: any, next: any) => {
    req.user = state.authUser;
    return next();
  },
  isAdmin: (req: any, res: any, next: any) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    return next();
  },
}));

vi.mock('axios', () => ({
  default: {
    post: vi.fn(),
  },
}));

vi.mock('../config/env', () => ({
  env: {
    PORT: 3002,
    CALLBACK_BASE_URL: undefined,
    N8N_BLOG_GENERATION_WEBHOOK_URL: undefined,
    N8N_BLOG_GENERATION_USERNAME: 'admin',
    N8N_BLOG_GENERATION_PASSWORD: '112233',
  },
}));

import blogRouter from './blog';
import { publishDuePosts } from '../services/blogService';
import { env } from '../config/env';

let server: Server | null = null;
let baseUrl = '';

function app() {
  const instance = express();
  instance.use(express.json());
  instance.use('/api/blog', blogRouter);
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
  if (!state.prisma) state.prisma = createPrismaMock();
  for (const store of Object.values(state.prisma.__stores)) {
    store.rows.clear();
  }
  state.authUser = { userId: 1, email: 'editor@example.com', role: 'admin' };
}

function resetBlogEnv() {
  env.CALLBACK_BASE_URL = undefined;
  env.N8N_BLOG_GENERATION_WEBHOOK_URL = undefined;
}

beforeAll(async () => {
  process.env.FRONTEND_URL = 'https://company.example';
  process.env.N8N_BLOG_CALLBACK_SECRET = 'n8n-test-secret';
  await startServer();
});

afterAll(async () => {
  await stopServer();
});

beforeEach(async () => {
  resetDb();
  resetBlogEnv();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('blog routes', () => {
  it('returns only published posts publicly and hides drafts', async () => {
    const prisma = state.prisma!;
    await prisma.blogPost.create({
      data: {
        title: 'Draft Post',
        slug: 'draft-post',
        excerpt: 'Hidden',
        contentHtml: '<p>Hidden</p>',
        heroImageUrl: 'https://cdn.example/draft.jpg',
        seoTitle: 'Draft Post',
        seoDescription: 'Draft description',
        status: 'DRAFT',
        publishedAt: null,
        createdById: 1,
      },
    });
    await prisma.blogPost.create({
      data: {
        title: 'Published Post',
        slug: 'published-post',
        excerpt: 'Visible',
        contentHtml: '<p>Hello company</p>',
        heroImageUrl: 'https://cdn.example/published.jpg',
        seoTitle: 'Published Post',
        seoDescription: 'Published description',
        status: 'PUBLISHED',
        publishedAt: new Date('2026-06-20T10:00:00.000Z'),
        createdById: 1,
      },
    });

    const listResponse = await request('/api/blog?page=1&limit=1');
    const listJson = await readJson(listResponse);

    expect(listResponse.status).toBe(200);
    expect(listJson.posts).toHaveLength(1);
    expect(listJson.pagination.total).toBe(1);
    expect(listJson.pagination.pages).toBe(1);
    expect(listJson.posts[0].slug).toBe('published-post');
    expect(listJson.posts[0].contentHtml).toBe('<p>Hello company</p>');

    const detailResponse = await request('/api/blog/published-post');
    const detailJson = await readJson(detailResponse);
    expect(detailResponse.status).toBe(200);
    expect(detailJson.post.title).toBe('Published Post');

    const draftResponse = await request('/api/blog/draft-post');
    expect(draftResponse.status).toBe(404);
  });

  it('blocks non-admins and supports create/update/status/delete flows for admins', async () => {
    state.authUser = { userId: 2, email: 'reader@example.com', role: 'user' };

    const blockedResponse = await request('/api/blog/admin', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Unauthorized post',
        body: { type: 'doc', content: [] },
      }),
    });
    expect(blockedResponse.status).toBe(403);

    state.authUser = { userId: 1, email: 'editor@example.com', role: 'admin' };

    const createResponse = await request('/api/blog/admin', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Headless CMS Launch',
        body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Launch' }] }] },
        slug: 'headless-cms-launch',
        excerpt: 'Launch summary',
        heroImage: 'https://cdn.example/launch.jpg',
        seoTitle: 'Launch',
        seoDescription: 'Launch desc',
      }),
    });
    const created = await readJson(createResponse);
    expect(createResponse.status).toBe(201);
    expect(created.post.slug).toBe('headless-cms-launch');
    expect(created.post.status).toBe('DRAFT');

    const id = created.post.id;

    const updateResponse = await request(`/api/blog/admin/${id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Headless CMS Launch Updated',
        body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Updated' }] }] },
        slug: 'headless-cms-launch-updated',
      }),
    });
    const updated = await readJson(updateResponse);
    expect(updateResponse.status).toBe(200);
    expect(updated.post.title).toBe('Headless CMS Launch Updated');
    expect(updated.post.slug).toBe('headless-cms-launch-updated');
    expect(updated.post.body.content[0].content[0].text).toBe('Updated');

    const publishResponse = await request(`/api/blog/admin/${id}/status`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        status: 'PUBLISHED',
      }),
    });
    const published = await readJson(publishResponse);
    expect(publishResponse.status).toBe(200);
    expect(published.post.status).toBe('PUBLISHED');
    expect(published.post.publishedAt).not.toBeNull();

    const invalidSlugResponse = await request('/api/blog/admin', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Bad Slug Post',
        slug: 'Bad Slug!',
        body: { type: 'doc', content: [] },
      }),
    });
    expect(invalidSlugResponse.status).toBe(400);

    const invalidBodyResponse = await request('/api/blog/admin', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Bad Body Post',
        body: [],
      }),
    });
    expect(invalidBodyResponse.status).toBe(400);

    const deleteResponse = await request(`/api/blog/admin/${id}`, {
      method: 'DELETE',
    });
    expect(deleteResponse.status).toBe(204);

    const deleted = await state.prisma!.post.findUnique({ where: { id } });
    expect(deleted).toBeNull();
  });

  it('publishes scheduled posts when the scheduler helper runs', async () => {
    const prisma = state.prisma!;
    const futureIso = new Date(Date.now() - 60_000).toISOString();
    const scheduled = await prisma.post.create({
      data: {
        title: 'Scheduled Post',
        slug: 'scheduled-post',
        excerpt: 'Scheduled',
        body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Scheduled' }] }] },
        heroImage: '',
        seoTitle: '',
        seoDescription: '',
        status: 'SCHEDULED',
        publishedAt: new Date(futureIso),
      },
    });

    const count = await publishDuePosts(prisma);
    expect(count).toBe(1);

    const updated = await prisma.post.findUnique({ where: { id: scheduled.id } });
    expect(updated?.status).toBe('PUBLISHED');
  });

  it('protects the n8n callback and updates drafts from generated blog content', async () => {
    const prisma = state.prisma!;
    const category = await prisma.blogCategory.create({
      data: {
        name: 'SEO',
        slug: 'seo',
        createdById: 1,
      },
    });
    const draft = await prisma.blogPost.create({
      data: {
        slug: 'future-of-ai-seo-in-2026',
        title: 'Placeholder title',
        excerpt: 'Initial excerpt',
        contentHtml: '<p>Draft</p>',
        heroImageUrl: null,
        seoTitle: 'Placeholder title',
        seoDescription: 'Placeholder description',
        status: 'DRAFT',
        publishedAt: null,
        createdById: 1,
      },
    });

    const response = await request(`/api/blog/n8n-callback?token=${encodeURIComponent(process.env.N8N_BLOG_CALLBACK_SECRET!)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        draftId: draft.id,
        status: 'success',
        title: 'The Future of AI SEO in 2026',
        categories: ['seo', 'Marketing'],
        contentHtml: '<h2>Introduction</h2><p>AI is transforming SEO...</p>',
        heroImageUrl: 'https://images.unsplash.com/photo-1234567890',
        author: {
          name: 'Jane Doe',
          avatarUrl: 'https://example.com/avatar.jpg',
        },
        seo: {
          metaTitle: 'The Future of AI SEO in 2026 | SearchEO',
          metaDescription: 'Discover how artificial intelligence is changing the search optimization landscape in 2026.',
          keywords: ['AI SEO', 'ai seo tools', 'search intelligence'],
          ogImage: 'https://images.unsplash.com/photo-1234567890',
        },
        publishDate: '2026-06-30T12:00:00Z',
      }),
    });

    const json = await readJson(response);

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.draftId).toBe(draft.id);

    const saved = await prisma.blogPost.findUnique({ where: { id: draft.id } });
    expect(saved?.title).toBe('The Future of AI SEO in 2026');
    expect(saved?.contentHtml).toContain('AI is transforming SEO');
    expect(saved?.heroImageUrl).toBe('https://images.unsplash.com/photo-1234567890');
    expect(saved?.authorName).toBe('Jane Doe');
    expect(saved?.seoTitle).toBe('The Future of AI SEO in 2026 | SearchEO');
    expect(saved?.seoDescription).toBe(
      'Discover how artificial intelligence is changing the search optimization landscape in 2026.',
    );
    expect(saved?.status).toBe('DRAFT');
    expect(saved?.categoryId).toBe(category.id);
  });

  it('stores n8n error details on the draft when generation fails', async () => {
    const prisma = state.prisma!;
    const draft = await prisma.blogPost.create({
      data: {
        slug: 'failed-generation-post',
        title: 'Failed generation post',
        excerpt: 'Initial excerpt',
        contentHtml: '<p>Draft</p>',
        heroImageUrl: null,
        seoTitle: 'Failed generation post',
        seoDescription: 'Failed generation description',
        status: 'DRAFT',
        publishedAt: null,
        createdById: 1,
      },
    });

    const response = await request(`/api/blog/n8n-callback?token=${encodeURIComponent(process.env.N8N_BLOG_CALLBACK_SECRET!)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        draftId: draft.id,
        status: 'error',
        error: 'n8n timed out while generating the article',
      }),
    });

    const json = await readJson(response);

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.status).toBe('DRAFT');

    const saved = await prisma.blogPost.findUnique({ where: { id: draft.id } });
    expect(saved?.status).toBe('DRAFT');
    expect(saved?.excerpt).toContain('Initial excerpt');
    expect(saved?.excerpt).toContain('n8n timed out while generating the article');
  });

  it('returns 401 for missing or invalid n8n callback tokens', async () => {
    const missingToken = await request('/api/blog/n8n-callback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ draftId: 1, status: 'error', error: 'no token' }),
    });
    expect(missingToken.status).toBe(401);

    const invalidToken = await request('/api/blog/n8n-callback?token=wrong-secret', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ draftId: 1, status: 'error', error: 'bad token' }),
    });
    expect(invalidToken.status).toBe(401);
  });

  it('returns 400 when draftId is missing and 404 when the draft does not exist', async () => {
    const missingDraftId = await request(`/api/blog/n8n-callback?token=${encodeURIComponent(process.env.N8N_BLOG_CALLBACK_SECRET!)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        status: 'success',
        title: 'No draft id',
        categories: ['SEO'],
        contentHtml: '<p>Missing draft</p>',
        heroImageUrl: '',
        author: { name: 'Jane Doe', avatarUrl: '' },
        seo: { metaTitle: 'No draft id', metaDescription: 'Missing draft id', keywords: [], ogImage: '' },
        publishDate: '2026-06-30T12:00:00Z',
      }),
    });
    expect(missingDraftId.status).toBe(400);

    const missingDraft = await request(`/api/blog/n8n-callback?token=${encodeURIComponent(process.env.N8N_BLOG_CALLBACK_SECRET!)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        draftId: 9999,
        status: 'success',
        title: 'Unknown draft',
        categories: ['SEO'],
        contentHtml: '<p>Unknown draft</p>',
        heroImageUrl: '',
        author: { name: 'Jane Doe', avatarUrl: '' },
        seo: { metaTitle: 'Unknown draft', metaDescription: 'Unknown draft', keywords: [], ogImage: '' },
        publishDate: '2026-06-30T12:00:00Z',
      }),
    });
    expect(missingDraft.status).toBe(404);
  });

  it('supports full CRUD flow for BlogPost and BlogCategory in admin panel', async () => {
    const prisma = state.prisma!;

    // 1. Create a category
    const createCatResponse = await request('/api/blog/admin/categories', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'AI Analytics',
        slug: 'ai-analytics',
        description: 'Posts about AI analytics'
      }),
    });
    const createdCat = await readJson(createCatResponse);
    expect(createCatResponse.status).toBe(201);
    expect(createdCat.category.slug).toBe('ai-analytics');
    expect(createdCat.category.name).toBe('AI Analytics');

    // 2. Fetch categories
    const getCatsResponse = await request('/api/blog/admin/categories');
    const getCatsJson = await readJson(getCatsResponse);
    expect(getCatsResponse.status).toBe(200);
    expect(getCatsJson.categories.length).toBeGreaterThanOrEqual(1);

    // 3. Create a blog post
    const createPostResponse = await request('/api/blog/admin/posts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Introduction to AI Analytics',
        slug: 'intro-ai-analytics',
        excerpt: 'Summary here',
        contentHtml: '<p>Body text</p>',
        heroImageUrl: 'https://cdn.example/image.jpg',
        seoTitle: 'Intro to AI Analytics',
        seoDescription: 'SEO desc',
        status: 'DRAFT',
        categoryId: createdCat.category.id,
        authorName: 'John Doe',
      }),
    });
    const createdPost = await readJson(createPostResponse);
    expect(createPostResponse.status).toBe(201);
    expect(createdPost.post.title).toBe('Introduction to AI Analytics');
    expect(createdPost.post.status).toBe('DRAFT');
    expect(createdPost.post.category.name).toBe('AI Analytics');

    const postId = createdPost.post.id;

    // 4. Update the blog post
    const updatePostResponse = await request(`/api/blog/admin/posts/${postId}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Introduction to AI Analytics Updated',
        contentHtml: '<p>Updated body text</p>',
      }),
    });
    const updatedPost = await readJson(updatePostResponse);
    expect(updatePostResponse.status).toBe(200);
    expect(updatedPost.post.title).toBe('Introduction to AI Analytics Updated');
    expect(updatedPost.post.contentHtml).toBe('<p>Updated body text</p>');

    // 5. Update post status to PUBLISHED
    const statusPostResponse = await request(`/api/blog/admin/posts/${postId}/status`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        status: 'PUBLISHED',
      }),
    });
    const statusPostJson = await readJson(statusPostResponse);
    expect(statusPostResponse.status).toBe(200);
    expect(statusPostJson.post.status).toBe('PUBLISHED');
    expect(statusPostJson.post.publishedAt).not.toBeNull();

    // 6. Fetch single post
    const getPostResponse = await request(`/api/blog/admin/posts/${postId}`);
    const getPostJson = await readJson(getPostResponse);
    expect(getPostResponse.status).toBe(200);
    expect(getPostJson.post.title).toBe('Introduction to AI Analytics Updated');

    // 7. Delete post
    const deletePostResponse = await request(`/api/blog/admin/posts/${postId}`, {
      method: 'DELETE',
    });
    expect(deletePostResponse.status).toBe(204);

    const checkDeleted = await prisma.blogPost.findUnique({ where: { id: postId } });
    expect(checkDeleted).toBeNull();
  });

  it('triggers n8n generation when POST /api/blog/admin/generate is called', async () => {
    const prisma = state.prisma!;
    const category = await prisma.blogCategory.create({
      data: {
        name: 'SEO',
        slug: 'seo',
        createdById: 1,
      },
    });

    const axiosPostSpy = vi.spyOn(axios, 'post').mockResolvedValue({ status: 200, data: { success: true } });

    const response = await request('/api/blog/admin/generate', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        topic: 'The Future of AI SEO in 2026',
        primaryKeyword: 'AI SEO',
        longtailKeywords: 'ai seo tools, search intelligence',
        tone: 'professional, authoritative',
        wordCount: 1200,
        categoryTags: ['SEO', 'Marketing'],
        authorId: 'jane_doe_01',
        featuredImageId: 'some-image-id',
        generateFeaturedImage: true,
      }),
    });

    const json = await readJson(response);

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.draftId).toBeDefined();

    // Verify it created a BlogPost draft placeholder
    const draft = await prisma.blogPost.findUnique({ where: { id: json.draftId } });
    expect(draft).not.toBeNull();
    expect(draft?.title).toBe('The Future of AI SEO in 2026');
    expect(draft?.status).toBe('DRAFT');
    expect(draft?.categoryId).toBe(category.id);

    // Verify axios.post was called with correct URL and payload
    expect(axiosPostSpy).toHaveBeenCalledTimes(1);
    const url = axiosPostSpy.mock.calls[0][0] as string;
    const payload = axiosPostSpy.mock.calls[0][1] as any;
    const config = axiosPostSpy.mock.calls[0][2] as any;
    expect(url).toContain('/webhook/n8n-test-secret');
    expect(config.auth).toEqual({ username: 'admin', password: '112233' });
    expect(payload.template_type).toBe('blog');
    expect(payload.topic).toBe('The Future of AI SEO in 2026');
    expect(payload.primary_keyword).toBe('AI SEO');
    expect(payload.longtail_keywords).toBe('ai seo tools, search intelligence');
    expect(payload.categories).toEqual(['SEO', 'Marketing']);
    expect(payload.author_id).toBe('jane_doe_01');
    expect(payload.brand_context.tone).toBe('professional, authoritative');
    expect(payload.target_word_count).toBe(1200);
    expect(payload.generate_featured_image).toBe(true);
    expect(payload.featured_image_id).toBe('some-image-id');
    expect(payload.image_id).toBe('some-image-id');
    expect(payload.draft_id).toBe(draft?.id);
  });

  it('updates excerpt and returns 502 when axios.post throws an error during generate', async () => {
    const prisma = state.prisma!;
    const axiosPostSpy = vi.spyOn(axios, 'post').mockRejectedValue(new Error('n8n offline'));

    const response = await request('/api/blog/admin/generate', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        topic: 'Failing generation topic',
      }),
    });

    const json = await readJson(response);

    expect(response.status).toBe(502);
    expect(json.success).toBe(false);

    // Verify it still created a placeholder draft and updated the excerpt with the error
    const draft = await prisma.blogPost.findFirst({
      where: { title: 'Failing generation topic' },
    });
    expect(draft).not.toBeNull();
    expect(draft?.excerpt).toContain('Failed to trigger generation. Error: n8n offline');
  });

  it('triggers n8n generation at dynamic webhook URL when N8N_BLOG_GENERATION_WEBHOOK_URL is set', async () => {
    const originalWebhookUrl = env.N8N_BLOG_GENERATION_WEBHOOK_URL;
    env.N8N_BLOG_GENERATION_WEBHOOK_URL = 'https://custom-n8n-domain.com/webhook/custom-blog-generate';

    try {
      const axiosPostSpy = vi.spyOn(axios, 'post').mockResolvedValue({ status: 200, data: { success: true } });
      axiosPostSpy.mockClear();

      const response = await request('/api/blog/admin/generate', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          topic: 'Dynamic Webhook URL Test Topic',
        }),
      });

      const json = await readJson(response);

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);

      expect(axiosPostSpy).toHaveBeenCalledTimes(1);
      const url = axiosPostSpy.mock.calls[0][0] as string;
      const payload = axiosPostSpy.mock.calls[0][1] as any;
      expect(url).toBe('https://custom-n8n-domain.com/webhook/custom-blog-generate');
      expect(payload.topic).toBe('Dynamic Webhook URL Test Topic');
    } finally {
      env.N8N_BLOG_GENERATION_WEBHOOK_URL = originalWebhookUrl;
    }
  });
});
