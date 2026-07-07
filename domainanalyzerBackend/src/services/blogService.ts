import { PrismaClient } from '../../generated/prisma';
import { prisma } from '../lib/prisma';

export type PostStatus = 'DRAFT' | 'PUBLISHED' | 'SCHEDULED';

export interface PostDto {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  body: unknown;
  heroImage: string;
  seoTitle: string;
  seoDescription: string;
  status: PostStatus;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const BLOG_SCHEDULER_INTERVAL_MS = 60_000;
let schedulerTimer: NodeJS.Timeout | null = null;

export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    || 'post';
}

export function isUrlFriendlySlug(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function normalizePostBody(value: unknown): Record<string, unknown> {
  if (!isPlainObject(value)) {
    throw new Error('Post body must be a JSON object');
  }
  return value;
}

export function toIsoString(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function ensureUniqueSlug(
  prismaClient: PrismaClient = prisma,
  baseSlug: string,
  excludePostId?: string,
): Promise<string> {
  const root = slugify(baseSlug);
  let candidate = root;
  let suffix = 2;

  while (true) {
    const found = await prismaClient.post.findUnique({ where: { slug: candidate } });
    if (!found || found.id === excludePostId) {
      return candidate;
    }
    candidate = `${root}-${suffix++}`;
  }
}

export function serializePost(post: {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  body: unknown;
  heroImage: string;
  seoTitle: string;
  seoDescription: string;
  status: PostStatus | string;
  publishedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}): PostDto {
  return {
    id: post.id,
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt,
    body: post.body,
    heroImage: post.heroImage,
    seoTitle: post.seoTitle,
    seoDescription: post.seoDescription,
    status: String(post.status).toUpperCase() as PostStatus,
    publishedAt: toIsoString(post.publishedAt),
    createdAt: toIsoString(post.createdAt) ?? new Date().toISOString(),
    updatedAt: toIsoString(post.updatedAt) ?? new Date().toISOString(),
  };
}

export async function publishDuePosts(prismaClient: PrismaClient = prisma): Promise<number> {
  const now = new Date();
  const duePosts = await prismaClient.post.findMany({
    where: {
      status: 'SCHEDULED',
      publishedAt: { lte: now },
    },
  });

  if (duePosts.length === 0) {
    return 0;
  }

  for (const post of duePosts) {
    await prismaClient.post.update({
      where: { id: post.id },
      data: {
        status: 'PUBLISHED',
        publishedAt: post.publishedAt ?? now,
      },
    });
  }

  return duePosts.length;
}

export function startBlogScheduler(): () => void {
  if (schedulerTimer) {
    return () => undefined;
  }

  const tick = async () => {
    try {
      await publishDuePosts(prisma);
    } catch (error) {
      console.warn('[blog-scheduler] tick failed', error);
    }
  };

  void tick();
  schedulerTimer = setInterval(tick, BLOG_SCHEDULER_INTERVAL_MS);
  return () => {
    if (schedulerTimer) {
      clearInterval(schedulerTimer);
      schedulerTimer = null;
    }
  };
}
