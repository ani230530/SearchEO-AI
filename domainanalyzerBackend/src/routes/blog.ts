import { timingSafeEqual } from 'crypto';
import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import axios from 'axios';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { authenticateToken, isAdmin } from '../middleware/auth';
import {
  ensureUniqueSlug,
  isPlainObject,
  isUrlFriendlySlug,
  normalizePostBody,
  serializePost,
  slugify,
} from '../services/blogService';

const router = Router();
const DEFAULT_BLOG_N8N_WEBHOOK_URL = 'https://n8n.srv891599.hstgr.cloud/webhook/';

const urlFriendlySlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

const jsonObjectSchema = z.unknown().refine(isPlainObject, {
  message: 'Body must be a JSON object',
});

const n8nBlogAuthorSchema = z.object({
  name: z.string().trim().min(1, 'Author name is required'),
  avatarUrl: z.string().trim().optional().default(''),
});

const n8nBlogSeoSchema = z.object({
  metaTitle: z.string().trim().optional().default(''),
  metaDescription: z.string().trim().optional().default(''),
  keywords: z.array(z.string().trim()).default([]),
  ogImage: z.string().trim().optional().default(''),
});

const n8nBlogPayloadSchema = z.object({
  title: z.string().trim().min(1, 'Title is required'),
  categories: z.array(z.string().trim()).default([]),
  contentHtml: z.string().trim(),
  heroImageUrl: z.string().trim().optional().default(''),
  author: n8nBlogAuthorSchema,
  seo: n8nBlogSeoSchema,
  publishDate: z.string().datetime().optional(),
});

const n8nCallbackSchema = z
  .object({
    draftId: z.coerce.number().int().positive('draftId is required'),
    status: z.enum(['success', 'error']),
    error: z.string().trim().optional(),
    blogPost: n8nBlogPayloadSchema.optional(),
  })
  .passthrough();

const slugSchema = z
  .string()
  .trim()
  .min(1, 'Slug is required')
  .regex(urlFriendlySlugPattern, 'Slug must be URL-friendly');

const postCreateSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(250),
  slug: slugSchema.optional(),
  excerpt: z.string().trim().max(5000).optional().default(''),
  body: jsonObjectSchema.optional(),
  heroImage: z.string().trim().optional().default(''),
  seoTitle: z.string().trim().optional().default(''),
  seoDescription: z.string().trim().optional().default(''),
});

const postUpdateSchema = postCreateSchema.partial().refine((data) => Object.keys(data).length > 0, {
  message: 'At least one field is required',
});

const postStatusSchema = z
  .object({
    status: z.enum(['DRAFT', 'PUBLISHED', 'SCHEDULED']),
    publishedAt: z.string().datetime().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.status === 'SCHEDULED' && !data.publishedAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'publishedAt is required when scheduling a post',
        path: ['publishedAt'],
      });
    }
  });

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function withoutTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function getBlogGenerationWebhookUrl(callbackSecret: string): string {
  const configuredWebhookUrl = env.N8N_BLOG_GENERATION_WEBHOOK_URL?.trim();
  if (configuredWebhookUrl) {
    return configuredWebhookUrl;
  }

  return `${DEFAULT_BLOG_N8N_WEBHOOK_URL}${encodeURIComponent(callbackSecret)}`;
}

function getBlogCallbackBaseUrl(): string {
  const configuredBaseUrl = env.CALLBACK_BASE_URL?.trim();
  if (configuredBaseUrl) {
    return withoutTrailingSlash(configuredBaseUrl);
  }

  return `http://localhost:${env.PORT}`;
}

function isValidWebhookToken(receivedToken: string | undefined): boolean {
  const secret = process.env.N8N_BLOG_CALLBACK_SECRET?.trim();
  if (!secret || !receivedToken) {
    return false;
  }

  const received = Buffer.from(receivedToken);
  const expected = Buffer.from(secret);
  if (received.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(received, expected);
}

function normalizeN8nBlogPayload(input: unknown) {
  const parsed = n8nBlogPayloadSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
}

function appendWebhookError(excerpt: string | null, errorMessage: string): string {
  const trimmedError = errorMessage.trim();
  if (!trimmedError) {
    return excerpt ?? '';
  }

  const existing = (excerpt ?? '').trim();
  if (!existing) {
    return `n8n error: ${trimmedError}`;
  }

  return `${existing}\n\nn8n error: ${trimmedError}`;
}

function parseIsoDate(value: string | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function sortPostsByPublishedDateDesc<T extends { publishedAt: Date | string | null; createdAt: Date | string }>(
  posts: T[],
) {
  return posts.sort((left, right) => {
    const leftTime = new Date(left.publishedAt ?? left.createdAt).getTime();
    const rightTime = new Date(right.publishedAt ?? right.createdAt).getTime();
    return rightTime - leftTime;
  });
}

function serializeBlogPostPublic(post: any, dbTags?: string[]) {
  let tags = dbTags && dbTags.length > 0 ? dbTags : ['SEO Tool', 'Artificial Intelligence', 'Digital Marketing'];
  const catName = post.category?.name?.toLowerCase() || 'news';
  if (!dbTags || dbTags.length === 0) {
    if (catName.includes('guide')) {
      tags = ['Tutorial', 'SEO Strategy', 'Content Clustering'];
    } else if (catName.includes('news')) {
      tags = ['Announcements', 'Company Update', 'AI Industry'];
    } else if (catName.includes('case')) {
      tags = ['Client Success', 'SEO Performance', 'Growth Study'];
    }
  }

  let heroImageUrl = post.heroImageUrl || '';
  if (!heroImageUrl && post.contentHtml) {
    const match = post.contentHtml.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (match && match[1]) {
      heroImageUrl = match[1];
    }
  }

  return {
    id: post.id,
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt || '',
    contentHtml: post.contentHtml,
    heroImageUrl,
    heroImageAlt: post.heroImageAlt || '',
    seoTitle: post.seoTitle || '',
    seoDescription: post.seoDescription || '',
    status: post.status,
    publishedAt: post.publishedAt ? post.publishedAt.toISOString() : null,
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
    readTimeMinutes: post.readTimeMinutes || 0,
    authorName: post.authorName || '',
    authorTitle: post.authorTitle || '',
    categoryName: post.category?.name || 'News',
    categorySlug: post.category?.slug || 'news',
    tags,
  };
}

router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = paginationSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid pagination parameters' });
    }

    const posts = await prisma.blogPost.findMany({
      where: { status: 'PUBLISHED' },
      include: { category: true },
    });

    const sorted = sortPostsByPublishedDateDesc(posts);
    const offset = (parsed.data.page - 1) * parsed.data.limit;
    const paged = sorted.slice(offset, offset + parsed.data.limit);

    return res.json({
      posts: paged.map((post) => serializeBlogPostPublic(post)),
      pagination: {
        page: parsed.data.page,
        limit: parsed.data.limit,
        total: sorted.length,
        pages: sorted.length === 0 ? 0 : Math.ceil(sorted.length / parsed.data.limit),
      },
    });
  }),
);

router.post(
  '/n8n-callback',
  asyncHandler(async (req: Request, res: Response) => {
    const token = typeof req.query.token === 'string' ? req.query.token : undefined;
    if (!isValidWebhookToken(token)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!isPlainObject(req.body)) {
      return res.status(400).json({ error: 'Invalid callback payload' });
    }

    if (!Object.prototype.hasOwnProperty.call(req.body, 'draftId')) {
      return res.status(400).json({ error: 'draftId is required' });
    }

    const parsed = n8nCallbackSchema.safeParse(req.body);
    if (!parsed.success) {
      const draftIdIssue = parsed.error.issues.find((issue) => issue.path[0] === 'draftId');
      if (draftIdIssue) {
        return res.status(400).json({ error: 'draftId is required' });
      }
      return res.status(400).json({ error: 'Invalid callback payload' });
    }

    const { draftId, status } = parsed.data;

    const existing = await prisma.blogPost.findUnique({
      where: { id: draftId },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Blog post not found' });
    }

    if (status === 'error') {
      const nextExcerpt = appendWebhookError(existing.excerpt, parsed.data.error ?? 'n8n callback reported an error');

      const updated = await prisma.blogPost.update({
        where: { id: existing.id },
        data: {
          status: 'DRAFT',
          excerpt: nextExcerpt,
          updatedAt: new Date(),
        },
      });

      return res.json({
        success: true,
        draftId: updated.id,
        status: updated.status,
      });
    }

    const generatedPayload = normalizeN8nBlogPayload(parsed.data.blogPost ?? parsed.data);
    if (!generatedPayload) {
      return res.status(400).json({ error: 'Invalid blogPost payload' });
    }

    const firstCategoryName = generatedPayload.categories.find((category) => category.trim().length > 0)?.trim();
    let categoryId: number | null = null;
    if (firstCategoryName) {
      const categories = await prisma.blogCategory.findMany();
      const matchedCategory = categories.find(
        (category) => category.name.trim().toLowerCase() === firstCategoryName.toLowerCase(),
      );
      categoryId = matchedCategory?.id ?? null;
    }

    const updated = await prisma.blogPost.update({
      where: { id: existing.id },
      data: {
        title: generatedPayload.title,
        contentHtml: generatedPayload.contentHtml,
        heroImageUrl: generatedPayload.heroImageUrl,
        authorName: generatedPayload.author.name,
        seoTitle: generatedPayload.seo.metaTitle,
        seoDescription: generatedPayload.seo.metaDescription,
        categoryId,
        status: 'DRAFT',
        updatedAt: new Date(),
      },
    });

    return res.json({
      success: true,
      draftId: updated.id,
      status: updated.status,
      categoryId: updated.categoryId,
    });
  }),
);

router.use('/admin', authenticateToken, isAdmin);

// Custom helper for BlogPost slugs
async function ensureUniqueBlogPostSlug(slugSource: string, excludeId?: number): Promise<string> {
  const root = slugify(slugSource);
  let candidate = root;
  let suffix = 2;
  while (true) {
    const found = await prisma.blogPost.findUnique({ where: { slug: candidate } });
    if (!found || found.id === excludeId) {
      return candidate;
    }
    candidate = `${root}-${suffix++}`;
  }
}

// New Blog CMS endpoints for BlogPost and BlogCategory
const blogGenerateSchema = z.object({
  topic: z.string().trim().min(1, 'Topic is required'),
  primaryKeyword: z.string().trim().optional(),
  longtailKeywords: z.string().trim().optional(),
  tone: z.string().trim().optional().default('professional, authoritative'),
  wordCount: z.coerce.number().int().positive().optional().default(1200),
  categoryTags: z.array(z.string().trim()).optional().default([]),
  authorId: z.string().trim().optional().default('jane_doe_01'),
  featuredImageUrl: z.string().trim().nullable().optional(),
  featuredImageId: z.string().trim().nullable().optional(),
  generateFeaturedImage: z.boolean().optional().default(true),
});

router.post(
  '/admin/generate',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: User not found in request context' });
    }

    const parsed = blogGenerateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid generation payload', details: parsed.error.format() });
    }

    const {
      topic,
      primaryKeyword,
      longtailKeywords,
      tone,
      wordCount,
      categoryTags,
      authorId,
      featuredImageUrl,
      featuredImageId,
      generateFeaturedImage,
    } = parsed.data;

    const slugSource = topic;
    const finalSlug = await ensureUniqueBlogPostSlug(slugSource);

    let categoryId: number | null = null;
    const firstCategoryName = categoryTags.find((category) => category.trim().length > 0)?.trim();
    if (firstCategoryName) {
      const categories = await prisma.blogCategory.findMany();
      const matchedCategory = categories.find(
        (category) => category.name.trim().toLowerCase() === firstCategoryName.toLowerCase(),
      );
      categoryId = matchedCategory?.id ?? null;
    }

    const draft = await prisma.blogPost.create({
      data: {
        title: topic.trim(),
        slug: finalSlug,
        excerpt: `AI generation in progress for topic: ${topic.trim()}`,
        contentHtml: '<p>Generation in progress...</p>',
        status: 'DRAFT',
        createdById: userId,
        categoryId,
      },
    });

    const callbackSecret = process.env.N8N_BLOG_CALLBACK_SECRET?.trim() || '';
    const webhookUrl = getBlogGenerationWebhookUrl(callbackSecret);
    const callbackUrl = `${getBlogCallbackBaseUrl()}/api/blog/n8n-callback?token=${encodeURIComponent(
      callbackSecret,
    )}`;

    const n8nPayload = {
      template_type: 'blog',
      topic: topic.trim(),
      primary_keyword: primaryKeyword || '',
      longtail_keywords: longtailKeywords || '',
      categories: categoryTags,
      author_id: authorId || 'jane_doe_01',
      brand_context: {
        name: 'SearchEO',
        description: 'Next-generation search intelligence...',
        tone: tone,
      },
      target_word_count: wordCount,
      generate_featured_image: generateFeaturedImage,
      featured_image_url: featuredImageUrl || null,
      featured_image_id: featuredImageId || null,
      image_id: featuredImageId || null,
      draft_id: draft.id,
      callback_url: callbackUrl,
    };

    try {
      const n8nApiKey = process.env.N8N_API_KEY || '1234';
      const n8nApiKeyHeader = process.env.N8N_API_KEY_HEADER || 'key';
      const n8nTimeout = Number(process.env.N8N_TIMEOUT_MS) || 300000;

      const axiosConfig: any = {
        headers: {
          'Content-Type': 'application/json',
          [n8nApiKeyHeader]: n8nApiKey,
        },
        timeout: n8nTimeout,
      };

      if (env.N8N_BLOG_GENERATION_USERNAME && env.N8N_BLOG_GENERATION_PASSWORD) {
        axiosConfig.auth = {
          username: env.N8N_BLOG_GENERATION_USERNAME,
          password: env.N8N_BLOG_GENERATION_PASSWORD,
        };
      }

      console.log(`[blog-generation] POST ${webhookUrl} for draft ${draft.id}`);
      await axios.post(webhookUrl, n8nPayload, axiosConfig);

      return res.status(200).json({
        success: true,
        message: 'Generation triggered',
        draftId: draft.id,
      });
    } catch (error: any) {
      console.error('[blog-generation] Failed to trigger n8n:', error?.response?.data || error.message);
      await prisma.blogPost.update({
        where: { id: draft.id },
        data: {
          excerpt: `Failed to trigger generation. Error: ${error.message}`,
        },
      });

      return res.status(502).json({
        success: false,
        error: 'Failed to communicate with n8n generation service',
        details: error.message,
      });
    }
  })
);

router.get(
  '/admin/posts',
  asyncHandler(async (req: Request, res: Response) => {
    const posts = await prisma.blogPost.findMany({
      include: {
        category: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    return res.json({ posts });
  })
);

router.get(
  '/admin/posts/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid post ID' });
    }
    const post = await prisma.blogPost.findUnique({
      where: { id },
      include: { category: true },
    });
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    return res.json({ post });
  })
);

router.post(
  '/admin/posts',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: User not found in request context' });
    }

    const {
      title,
      slug,
      excerpt,
      contentHtml,
      heroImageUrl,
      heroImageAlt,
      seoTitle,
      seoDescription,
      status,
      publishedAt,
      authorName,
      authorTitle,
      categoryId,
    } = req.body;

    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const slugSource = slug?.trim() || title;
    const finalSlug = await ensureUniqueBlogPostSlug(slugSource);

    const post = await prisma.blogPost.create({
      data: {
        title: title.trim(),
        slug: finalSlug,
        excerpt: excerpt?.trim() || '',
        contentHtml: contentHtml || '',
        heroImageUrl: heroImageUrl?.trim() || null,
        heroImageAlt: heroImageAlt?.trim() || null,
        seoTitle: seoTitle?.trim() || null,
        seoDescription: seoDescription?.trim() || null,
        status: (status || 'DRAFT') as any,
        publishedAt: publishedAt ? new Date(publishedAt) : (status === 'PUBLISHED' ? new Date() : null),
        authorName: authorName?.trim() || null,
        authorTitle: authorTitle?.trim() || null,
        categoryId: categoryId ? parseInt(categoryId) : null,
        createdById: userId,
      },
      include: {
        category: true,
      }
    });

    return res.status(201).json({ post });
  })
);

router.put(
  '/admin/posts/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid post ID' });
    }
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: User not found in request context' });
    }

    const existing = await prisma.blogPost.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const {
      title,
      slug,
      excerpt,
      contentHtml,
      heroImageUrl,
      heroImageAlt,
      seoTitle,
      seoDescription,
      status,
      publishedAt,
      authorName,
      authorTitle,
      categoryId,
    } = req.body;

    let finalSlug = existing.slug;
    if (slug && slug.trim() !== existing.slug) {
      finalSlug = await ensureUniqueBlogPostSlug(slug, id);
    }

    let nextPublishedAt = existing.publishedAt;
    if (status === 'PUBLISHED') {
      nextPublishedAt = publishedAt ? new Date(publishedAt) : (existing.publishedAt || new Date());
    } else if (status === 'DRAFT') {
      nextPublishedAt = null;
    } else if (publishedAt) {
      nextPublishedAt = new Date(publishedAt);
    }

    const updated = await prisma.blogPost.update({
      where: { id },
      data: {
        title: title !== undefined ? title.trim() : existing.title,
        slug: finalSlug,
        excerpt: excerpt !== undefined ? excerpt.trim() : existing.excerpt,
        contentHtml: contentHtml !== undefined ? contentHtml : existing.contentHtml,
        heroImageUrl: heroImageUrl !== undefined ? (heroImageUrl?.trim() || null) : existing.heroImageUrl,
        heroImageAlt: heroImageAlt !== undefined ? (heroImageAlt?.trim() || null) : existing.heroImageAlt,
        seoTitle: seoTitle !== undefined ? (seoTitle?.trim() || null) : existing.seoTitle,
        seoDescription: seoDescription !== undefined ? (seoDescription?.trim() || null) : existing.seoDescription,
        status: status !== undefined ? status as any : existing.status,
        publishedAt: nextPublishedAt,
        authorName: authorName !== undefined ? (authorName?.trim() || null) : existing.authorName,
        authorTitle: authorTitle !== undefined ? (authorTitle?.trim() || null) : existing.authorTitle,
        categoryId: categoryId !== undefined ? (categoryId ? parseInt(categoryId) : null) : existing.categoryId,
        updatedById: userId,
      },
      include: {
        category: true,
      }
    });

    return res.json({ post: updated });
  })
);

router.patch(
  '/admin/posts/:id/status',
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid post ID' });
    }
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: User not found in request context' });
    }

    const existing = await prisma.blogPost.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const { status, publishedAt } = req.body;
    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    let nextPublishedAt = existing.publishedAt;
    if (status === 'PUBLISHED') {
      nextPublishedAt = publishedAt ? new Date(publishedAt) : (existing.publishedAt || new Date());
    } else if (status === 'DRAFT') {
      nextPublishedAt = null;
    } else if (publishedAt) {
      nextPublishedAt = new Date(publishedAt);
    }

    const updated = await prisma.blogPost.update({
      where: { id },
      data: {
        status: status as any,
        publishedAt: nextPublishedAt,
        updatedById: userId,
      },
      include: {
        category: true,
      }
    });

    return res.json({ post: updated });
  })
);

router.delete(
  '/admin/posts/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid post ID' });
    }

    const existing = await prisma.blogPost.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Post not found' });
    }

    await prisma.blogPost.delete({ where: { id } });
    return res.status(204).send();
  })
);

router.get(
  '/admin/categories',
  asyncHandler(async (req: Request, res: Response) => {
    const categories = await prisma.blogCategory.findMany({
      orderBy: {
        sortOrder: 'asc',
      },
    });
    return res.json({ categories });
  })
);

router.post(
  '/admin/categories',
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: User not found in request context' });
    }

    const { name, slug, description } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Category name is required' });
    }
    const finalSlug = slug?.trim() || slugify(name);

    // Check if slug is unique
    const existing = await prisma.blogCategory.findUnique({ where: { slug: finalSlug } });
    if (existing) {
      return res.status(400).json({ error: 'Category slug already exists' });
    }

    const category = await prisma.blogCategory.create({
      data: {
        name: name.trim(),
        slug: finalSlug,
        description: description?.trim() || '',
        createdById: userId,
        updatedById: userId,
      },
    });
    return res.status(201).json({ category });
  })
);

router.get(
  '/admin',
  asyncHandler(async (_req: Request, res: Response) => {
    const posts = await prisma.post.findMany();
    return res.json({
      posts: sortPostsByPublishedDateDesc(posts).map(serializePost),
    });
  }),
);

router.post(
  '/admin',
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = postCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid post payload' });
    }

    const title = parsed.data.title.trim();
    const slugSource = parsed.data.slug?.trim() || title;
    const slug = await ensureUniqueSlug(prisma, slugSource);
    const body = parsed.data.body ? normalizePostBody(parsed.data.body) : { type: 'doc', content: [] };

    const post = await prisma.post.create({
      data: {
        title,
        slug,
        excerpt: parsed.data.excerpt ?? '',
        body: body as any,
        heroImage: parsed.data.heroImage ?? '',
        seoTitle: parsed.data.seoTitle ?? '',
        seoDescription: parsed.data.seoDescription ?? '',
        status: 'DRAFT',
        publishedAt: null,
      },
    });

    return res.status(201).json({ post: serializePost(post) });
  }),
);

router.put(
  '/admin/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const idResult = z.string().uuid().safeParse(req.params.id);
    if (!idResult.success) {
      return res.status(400).json({ error: 'Invalid post ID' });
    }

    const existing = await prisma.post.findUnique({
      where: { id: idResult.data },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const parsed = postUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid post payload' });
    }

    const nextTitle = parsed.data.title?.trim() ?? existing.title;
    const nextSlug = parsed.data.slug
      ? await ensureUniqueSlug(prisma, parsed.data.slug.trim(), existing.id)
      : existing.slug;
    const nextBody =
      parsed.data.body !== undefined ? normalizePostBody(parsed.data.body) : existing.body;

    const updated = await prisma.post.update({
      where: { id: existing.id },
      data: {
        title: nextTitle,
        slug: nextSlug,
        excerpt: parsed.data.excerpt !== undefined ? parsed.data.excerpt.trim() : existing.excerpt,
        body: nextBody as any,
        heroImage: parsed.data.heroImage !== undefined ? parsed.data.heroImage.trim() : existing.heroImage,
        seoTitle: parsed.data.seoTitle !== undefined ? parsed.data.seoTitle.trim() : existing.seoTitle,
        seoDescription:
          parsed.data.seoDescription !== undefined ? parsed.data.seoDescription.trim() : existing.seoDescription,
      },
    });

    return res.json({ post: serializePost(updated) });
  }),
);

router.patch(
  '/admin/:id/status',
  asyncHandler(async (req: Request, res: Response) => {
    const idResult = z.string().uuid().safeParse(req.params.id);
    if (!idResult.success) {
      return res.status(400).json({ error: 'Invalid post ID' });
    }

    const existing = await prisma.post.findUnique({
      where: { id: idResult.data },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const parsed = postStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid status payload' });
    }

    const nextStatus = parsed.data.status;
    const scheduledPublishAt =
      nextStatus === 'SCHEDULED'
        ? parseIsoDate(parsed.data.publishedAt ?? undefined)
        : null;

    if (nextStatus === 'SCHEDULED' && !scheduledPublishAt) {
      return res.status(400).json({ error: 'publishedAt must be a valid ISO date' });
    }

    const updated = await prisma.post.update({
      where: { id: existing.id },
      data: {
        status: nextStatus,
        publishedAt:
          nextStatus === 'DRAFT'
            ? null
            : nextStatus === 'SCHEDULED'
              ? scheduledPublishAt
              : parseIsoDate(parsed.data.publishedAt ?? undefined) ?? existing.publishedAt ?? new Date(),
      },
    });

    return res.json({ post: serializePost(updated) });
  }),
);

router.delete(
  '/admin/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const idResult = z.string().uuid().safeParse(req.params.id);
    if (!idResult.success) {
      return res.status(400).json({ error: 'Invalid post ID' });
    }

    const existing = await prisma.post.findUnique({
      where: { id: idResult.data },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Post not found' });
    }

    await prisma.post.delete({
      where: { id: existing.id },
    });

    return res.status(204).send();
  }),
);

router.get(
  '/:slug',
  asyncHandler(async (req: Request, res: Response) => {
    const slugResult = slugSchema.safeParse(req.params.slug);
    if (!slugResult.success || !isUrlFriendlySlug(slugResult.data)) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const post = await prisma.blogPost.findUnique({
      where: { slug: slugResult.data },
      include: { category: true },
    });

    if (!post || post.status !== 'PUBLISHED') {
      return res.status(404).json({ error: 'Post not found' });
    }

    let tags: string[] = [];
    if (post.tagIds && post.tagIds.length > 0) {
      const dbTags = await prisma.blogTag.findMany({
        where: { id: { in: post.tagIds } },
        select: { name: true },
      });
      tags = dbTags.map((t: any) => t.name);
    }

    return res.json({ post: serializeBlogPostPublic(post, tags) });
  }),
);

export default router;
