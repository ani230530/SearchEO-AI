/**
 * Minimal in-memory Prisma mock for backbone unit tests.
 *
 * Implements ONLY the methods the wizardSession / authenticateOrSession /
 * antiAbuseService modules use. If a service starts calling a new method,
 * add it here — don't reach for `vi.fn()` ad-hoc, the consistency of the
 * mock semantics is what keeps the tests honest.
 *
 * Semantics
 * ---------
 * Every model has its own Map<id, row>. `create` auto-increments id and
 * stamps createdAt/updatedAt to mimic Prisma defaults. Where models have
 * unique compound indexes (Domain.userId_host, WizardSession.cookieTokenHash),
 * the corresponding `findUnique` does the membership scan.
 *
 * Not implemented: relations, transactions, raw queries. Tests that need
 * those should switch to a real DB.
 */

import type { PrismaClient } from '../../generated/prisma';
import crypto from 'crypto';

interface Row {
  id: number | string;
  createdAt: Date;
  updatedAt: Date;
  [k: string]: any;
}

const now = () => new Date();

const makeStore = (makeId: () => number | string = (() => {
  let nextId = 1;
  return () => nextId++;
})()) => {
  const rows = new Map<number | string, Row>();
  return {
    rows,
    insert: (data: Record<string, any>): Row => {
      const id = data.id ?? makeId();
      const t = now();
      const row: Row = {
        id,
        createdAt: t,
        updatedAt: t,
        ...data,
      };
      rows.set(id, row);
      return row;
    },
    update: (id: number | string, patch: Record<string, any>): Row | null => {
      const row = rows.get(id);
      if (!row) return null;
      const updated: Row = { ...row, ...patch, updatedAt: now() };
      rows.set(id, updated);
      return updated;
    },
    all: (): Row[] => Array.from(rows.values()),
  };
};

export type PrismaMock = PrismaClient & { __stores: Record<string, ReturnType<typeof makeStore>> };

export const createPrismaMock = (): PrismaMock => {
  const stores: Record<string, ReturnType<typeof makeStore>> = {
    wizardSession: makeStore(),
    domain: makeStore(),
    user: makeStore(),
    refreshToken: makeStore(),
    apiSpendLog: makeStore(),
    wizardRunCache: makeStore(),
    folder: makeStore(),
    file: makeStore(),
    blogCategory: makeStore(),
    blogTag: makeStore(),
    blogPost: makeStore(),
    campaignTopic: makeStore(),
    wordpressIntegration: makeStore(),
    wordpressPublishLog: makeStore(),
    post: makeStore(() => crypto.randomUUID()),
  };

  const projectRow = (row: Row, select: any) => {
    if (!select) return row;
    const out: any = {};
    for (const key of Object.keys(select)) {
      if (select[key]) out[key] = row[key];
    }
    return out;
  };

  const deleteFolderTree = (folderId: number | string) => {
    for (const child of stores.folder.all().filter((row) => row.parentId === folderId)) {
      deleteFolderTree(child.id);
    }
    for (const [id, file] of stores.file.rows) {
      if (file.folderId === folderId) {
        stores.file.rows.delete(id);
      }
    }
    stores.folder.rows.delete(folderId);
  };

  const mock: any = {
    __stores: stores,

    // -------------------------------------------------------------------------
    // $transaction — runs the callback with the same mock instance. No
    // real rollback; the callback either completes or throws. Good enough
    // for unit tests that exercise transaction-shaped code.
    // -------------------------------------------------------------------------
    $transaction: async (fn: any) => {
      if (typeof fn === 'function') return fn(mock);
      // Array form: run each in sequence, no rollback.
      const results = [];
      for (const op of fn) results.push(await op);
      return results;
    },

    // -------------------------------------------------------------------------
    // wizardSession
    // -------------------------------------------------------------------------
    wizardSession: {
      create: async ({ data }: any) =>
        stores.wizardSession.insert({
          // Schema-default backfill — mirror Prisma's behavior so production
          // code can use `=== null` checks without being mock-leaky.
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
          anonUserId: null,
          linkedUserId: null,
          linkedDomainId: null,
          linkedAt: null,
          ...data,
        }),
      findUnique: async ({ where }: any) => {
        const rows = stores.wizardSession.all();
        if (where.id !== undefined) return rows.find((r) => r.id === where.id) ?? null;
        if (where.cookieTokenHash !== undefined)
          return rows.find((r) => r.cookieTokenHash === where.cookieTokenHash) ?? null;
        return null;
      },
      update: async ({ where, data }: any) => {
        const row = stores.wizardSession.rows.get(where.id);
        if (!row) throw new Error('wizardSession not found');
        return stores.wizardSession.update(where.id, data);
      },
      count: async ({ where }: any = {}) => {
        return stores.wizardSession.all().filter((r) => matchWhere(r, where)).length;
      },
      deleteMany: async ({ where }: any = {}) => {
        let n = 0;
        for (const [id, r] of stores.wizardSession.rows) {
          if (matchWhere(r, where ?? {})) {
            stores.wizardSession.rows.delete(id);
            n++;
          }
        }
        return { count: n };
      },
    },

    // -------------------------------------------------------------------------
    // domain
    // -------------------------------------------------------------------------
    domain: {
      findUnique: async ({ where }: any) => {
        const rows = stores.domain.all();
        if (where.userId_host) {
          return (
            rows.find(
              (r) =>
                r.userId === where.userId_host.userId &&
                r.host === where.userId_host.host
            ) ?? null
          );
        }
        if (where.id !== undefined) return rows.find((r) => r.id === where.id) ?? null;
        return null;
      },
      findMany: async ({ where, select }: any = {}) => {
        const rows = stores.domain.all().filter((r) => matchWhere(r, where ?? {}));
        if (!select) return rows;
        return rows.map((r) => {
          const out: any = {};
          for (const key of Object.keys(select)) if (select[key]) out[key] = r[key];
          return out;
        });
      },
      findFirst: async ({ where, select }: any = {}) => {
        const row = stores.domain.all().find((r) => matchWhere(r, where ?? {}));
        if (!row) return null;
        if (!select) return row;
        const out: any = {};
        for (const key of Object.keys(select)) if (select[key]) out[key] = row[key];
        return out;
      },
      create: async ({ data }: any) =>
        stores.domain.insert({
          isCompanyDomain: false,
          googleAnalyticsId: null,
          ...data,
        }),
      update: async ({ where, data }: any) => stores.domain.update(where.id, data),
      delete: async ({ where }: any) => {
        const row = stores.domain.rows.get(where.id);
        stores.domain.rows.delete(where.id);
        return row;
      },
      deleteMany: async ({ where }: any = {}) => {
        let n = 0;
        for (const [id, r] of stores.domain.rows) {
          if (matchWhere(r, where ?? {})) {
            stores.domain.rows.delete(id);
            n++;
          }
        }
        return { count: n };
      },
    },

    // -------------------------------------------------------------------------
    // user
    // -------------------------------------------------------------------------
    user: {
      findUnique: async ({ where }: any) => {
        const rows = stores.user.all();
        if (where.id !== undefined) return rows.find((r) => r.id === where.id) ?? null;
        if (where.email !== undefined) return rows.find((r) => r.email === where.email) ?? null;
        return null;
      },
      create: async ({ data }: any) => {
        const row = {
          wizardRunsAllowed: 1,
          lastWizardRunAt: null,
          suspicious: false,
          ...data,
        };
        if (row.role === undefined) row.role = 'user';
        return stores.user.insert(row);
      },
      upsert: async ({ where, create, update }: any) => {
        const existing = await mock.user.findUnique({ where });
        if (existing) {
          return stores.user.update(existing.id, update);
        }
        const row = {
          wizardRunsAllowed: 1,
          lastWizardRunAt: null,
          suspicious: false,
          ...create,
        };
        if (row.role === undefined) row.role = 'user';
        return stores.user.insert(row);
      },
      update: async ({ where, data }: any) => stores.user.update(where.id, data),
      delete: async ({ where }: any) => {
        const row = stores.user.rows.get(where.id);
        stores.user.rows.delete(where.id);
        return row;
      },
    },

    // -------------------------------------------------------------------------
    // blogCategory
    // -------------------------------------------------------------------------
    blogCategory: {
      findUnique: async ({ where }: any) => {
        const rows = stores.blogCategory.all();
        if (where.id !== undefined) return rows.find((r) => r.id === where.id) ?? null;
        if (where.slug !== undefined) return rows.find((r) => r.slug === where.slug) ?? null;
        return null;
      },
      findFirst: async ({ where }: any = {}) => {
        return stores.blogCategory.all().find((r) => matchWhere(r, where ?? {})) ?? null;
      },
      findMany: async ({ where }: any = {}) => stores.blogCategory.all().filter((r) => matchWhere(r, where ?? {})),
      create: async ({ data }: any) =>
        stores.blogCategory.insert({
          description: null,
          sortOrder: 0,
          ...data,
        }),
      update: async ({ where, data }: any) => stores.blogCategory.update(where.id, data),
      delete: async ({ where }: any) => {
        const row = stores.blogCategory.rows.get(where.id);
        stores.blogCategory.rows.delete(where.id);
        return row;
      },
    },

    // -------------------------------------------------------------------------
    // blogTag
    // -------------------------------------------------------------------------
    blogTag: {
      findUnique: async ({ where }: any) => {
        const rows = stores.blogTag.all();
        if (where.id !== undefined) return rows.find((r) => r.id === where.id) ?? null;
        if (where.slug !== undefined) return rows.find((r) => r.slug === where.slug) ?? null;
        return null;
      },
      findFirst: async ({ where }: any = {}) => {
        return stores.blogTag.all().find((r) => matchWhere(r, where ?? {})) ?? null;
      },
      findMany: async ({ where }: any = {}) => stores.blogTag.all().filter((r) => matchWhere(r, where ?? {})),
      create: async ({ data }: any) =>
        stores.blogTag.insert({
          description: null,
          ...data,
        }),
      update: async ({ where, data }: any) => stores.blogTag.update(where.id, data),
      delete: async ({ where }: any) => {
        const row = stores.blogTag.rows.get(where.id);
        stores.blogTag.rows.delete(where.id);
        return row;
      },
    },

    // -------------------------------------------------------------------------
    // blogPost
    // -------------------------------------------------------------------------
    blogPost: {
      findUnique: async ({ where }: any) => {
        const rows = stores.blogPost.all();
        let post = null;
        if (where.id !== undefined) post = rows.find((r) => r.id === where.id) ?? null;
        else if (where.slug !== undefined) post = rows.find((r) => r.slug === where.slug) ?? null;
        if (post && post.categoryId) {
          post.category = stores.blogCategory.all().find((c) => c.id === post.categoryId) ?? null;
        }
        return post;
      },
      findFirst: async ({ where }: any = {}) => {
        const post = stores.blogPost.all().find((r) => matchWhere(r, where ?? {})) ?? null;
        if (post && post.categoryId) {
          post.category = stores.blogCategory.all().find((c) => c.id === post.categoryId) ?? null;
        }
        return post;
      },
      findMany: async ({ where }: any = {}) => {
        const posts = stores.blogPost.all().filter((r) => matchWhere(r, where ?? {}));
        for (const post of posts) {
          if (post.categoryId) {
            post.category = stores.blogCategory.all().find((c) => c.id === post.categoryId) ?? null;
          }
        }
        return posts;
      },
      create: async ({ data }: any) => {
        const post = stores.blogPost.insert({
          excerpt: null,
          heroImageUrl: null,
          heroImageAlt: null,
          seoTitle: null,
          seoDescription: null,
          status: 'DRAFT',
          publishedAt: null,
          scheduledAt: null,
          readTimeMinutes: 0,
          authorName: null,
          authorTitle: null,
          categoryId: null,
          tagIds: [],
          ...data,
        });
        if (post && post.categoryId) {
          post.category = stores.blogCategory.all().find((c) => c.id === post.categoryId) ?? null;
        }
        return post;
      },
      update: async ({ where, data }: any) => {
        const post = stores.blogPost.update(where.id, data);
        if (post && post.categoryId) {
          post.category = stores.blogCategory.all().find((c) => c.id === post.categoryId) ?? null;
        }
        return post;
      },
      delete: async ({ where }: any) => {
        const row = stores.blogPost.rows.get(where.id);
        stores.blogPost.rows.delete(where.id);
        return row;
      },
    },

    // -------------------------------------------------------------------------
    // post
    // -------------------------------------------------------------------------
    post: {
      findUnique: async ({ where, select }: any) => {
        const rows = stores.post.all();
        let row = null;
        if (where.id !== undefined) row = rows.find((r) => r.id === where.id) ?? null;
        if (!row && where.slug !== undefined) row = rows.find((r) => r.slug === where.slug) ?? null;
        return row ? projectRow(row, select) : null;
      },
      findFirst: async ({ where, select }: any = {}) => {
        const row = stores.post.all().find((r) => matchWhere(r, where ?? {})) ?? null;
        return row ? projectRow(row, select) : null;
      },
      findMany: async ({ where, select }: any = {}) => {
        const rows = stores.post.all().filter((r) => matchWhere(r, where ?? {}));
        return rows.map((row) => projectRow(row, select));
      },
      create: async ({ data }: any) =>
        stores.post.insert({
          excerpt: '',
          body: { type: 'doc', content: [] },
          heroImage: '',
          seoTitle: '',
          seoDescription: '',
          status: 'DRAFT',
          publishedAt: null,
          ...data,
        }),
      update: async ({ where, data }: any) => stores.post.update(where.id, data),
      delete: async ({ where }: any) => {
        const row = stores.post.rows.get(where.id);
        stores.post.rows.delete(where.id);
        return row;
      },
    },

    // -------------------------------------------------------------------------
    // campaignTopic
    // -------------------------------------------------------------------------
    campaignTopic: {
      findUnique: async ({ where }: any) => {
        const rows = stores.campaignTopic.all();
        if (where.id !== undefined) return rows.find((r) => r.id === where.id) ?? null;
        return null;
      },
      findFirst: async ({ where }: any = {}) => {
        return stores.campaignTopic.all().find((r) => matchWhere(r, where ?? {})) ?? null;
      },
      findMany: async ({ where }: any = {}) => stores.campaignTopic.all().filter((r) => matchWhere(r, where ?? {})),
      create: async ({ data }: any) =>
        stores.campaignTopic.insert({
          latestDraftId: null,
          ...data,
        }),
      update: async ({ where, data }: any) => stores.campaignTopic.update(where.id, data),
      delete: async ({ where }: any) => {
        const row = stores.campaignTopic.rows.get(where.id);
        stores.campaignTopic.rows.delete(where.id);
        return row;
      },
    },

    // -------------------------------------------------------------------------
    // wordpressIntegration
    // -------------------------------------------------------------------------
    wordpressIntegration: {
      findUnique: async ({ where }: any) => {
        const rows = stores.wordpressIntegration.all();
        if (where.id !== undefined) return rows.find((r) => r.id === where.id) ?? null;
        if (where.userId !== undefined) return rows.find((r) => r.userId === where.userId) ?? null;
        return null;
      },
      findFirst: async ({ where }: any = {}) => {
        return stores.wordpressIntegration.all().find((r) => matchWhere(r, where ?? {})) ?? null;
      },
      findMany: async ({ where }: any = {}) => stores.wordpressIntegration.all().filter((r) => matchWhere(r, where ?? {})),
      create: async ({ data }: any) =>
        stores.wordpressIntegration.insert({
          siteUrl: '',
          username: '',
          password: '',
          lastPublishedAt: null,
          ...data,
        }),
      update: async ({ where, data }: any) => stores.wordpressIntegration.update(where.id ?? where.userId, data),
      upsert: async ({ where, create, update }: any) => {
        const existing = await mock.wordpressIntegration.findUnique({ where });
        if (existing) {
          return stores.wordpressIntegration.update(existing.id, update);
        }
        return stores.wordpressIntegration.insert({
          lastPublishedAt: null,
          ...create,
        });
      },
      delete: async ({ where }: any) => {
        const row = stores.wordpressIntegration.rows.get(where.id ?? where.userId);
        stores.wordpressIntegration.rows.delete(where.id ?? where.userId);
        return row;
      },
    },

    // -------------------------------------------------------------------------
    // wordpressPublishLog
    // -------------------------------------------------------------------------
    wordpressPublishLog: {
      findUnique: async ({ where }: any) => {
        const rows = stores.wordpressPublishLog.all();
        if (where.id !== undefined) return rows.find((r) => r.id === where.id) ?? null;
        return null;
      },
      findFirst: async ({ where }: any = {}) => {
        return stores.wordpressPublishLog.all().find((r) => matchWhere(r, where ?? {})) ?? null;
      },
      findMany: async ({ where }: any = {}) => stores.wordpressPublishLog.all().filter((r) => matchWhere(r, where ?? {})),
      create: async ({ data }: any) =>
        stores.wordpressPublishLog.insert({
          wordpressUrl: '',
          wordpressPostId: null,
          primaryKeyword: null,
          normalizedPrimaryKeyword: null,
          generationJobId: null,
          generationTopicId: null,
          title: null,
          slug: null,
          status: 'draft',
          scheduledAt: null,
          publishedAt: null,
          response: null,
          integrationId: null,
          ...data,
        }),
      update: async ({ where, data }: any) => stores.wordpressPublishLog.update(where.id, data),
      delete: async ({ where }: any) => {
        const row = stores.wordpressPublishLog.rows.get(where.id);
        stores.wordpressPublishLog.rows.delete(where.id);
        return row;
      },
    },

    // -------------------------------------------------------------------------
    // refreshToken
    // -------------------------------------------------------------------------
    refreshToken: {
      create: async ({ data }: any) =>
        stores.refreshToken.insert({
          revokedAt: null,
          reusedAt: null,
          parentId: null,
          userAgent: null,
          ip: null,
          ...data,
        }),
      findUnique: async ({ where, select }: any) => {
        const rows = stores.refreshToken.all();
        let row = null;
        if (where.id !== undefined) row = rows.find((r) => r.id === where.id) ?? null;
        if (!row && where.tokenHash !== undefined) {
          row = rows.find((r) => r.tokenHash === where.tokenHash) ?? null;
        }
        return row ? projectRow(row, select) : null;
      },
      update: async ({ where, data }: any) => stores.refreshToken.update(where.id, data),
      updateMany: async ({ where, data }: any = {}) => {
        let count = 0;
        for (const row of stores.refreshToken.all().filter((r) => matchWhere(r, where ?? {}))) {
          stores.refreshToken.update(row.id, data);
          count++;
        }
        return { count };
      },
    },

    // -------------------------------------------------------------------------
    // apiSpendLog
    // -------------------------------------------------------------------------
    apiSpendLog: {
      create: async ({ data }: any) => stores.apiSpendLog.insert(data),
      count: async ({ where }: any = {}) =>
        stores.apiSpendLog.all().filter((r) => matchWhere(r, where)).length,
      aggregate: async ({ _sum, where }: any) => {
        const rows = stores.apiSpendLog.all().filter((r) => matchWhere(r, where ?? {}));
        const result: any = { _sum: {} };
        if (_sum?.costEstimateUsd) {
          result._sum.costEstimateUsd = rows.reduce(
            (s, r) => s + (r.costEstimateUsd ?? 0),
            0
          );
        }
        return result;
      },
    },

    // -------------------------------------------------------------------------
    // wizardRunCache
    // -------------------------------------------------------------------------
    wizardRunCache: {
      findUnique: async ({ where }: any) => {
        const rows = stores.wizardRunCache.all();
        if (where.normalizedHost_step_cacheKey) {
          const k = where.normalizedHost_step_cacheKey;
          return (
            rows.find(
              (r) =>
                r.normalizedHost === k.normalizedHost &&
                r.step === k.step &&
                r.cacheKey === k.cacheKey
            ) ?? null
          );
        }
        return null;
      },
      upsert: async ({ where, create, update }: any) => {
        const found = await mock.wizardRunCache.findUnique({ where });
        if (found) return stores.wizardRunCache.update(found.id, update);
        return stores.wizardRunCache.insert(create);
      },
    },

    // -------------------------------------------------------------------------
    // folder
    // -------------------------------------------------------------------------
    folder: {
      findUnique: async ({ where, select }: any) => {
        const rows = stores.folder.all();
        let row = null;
        if (where.id !== undefined) row = rows.find((r) => r.id === where.id) ?? null;
        if (!row && where.userId_parentId_name) {
          const k = where.userId_parentId_name;
          row =
            rows.find(
              (r) =>
                r.userId === k.userId &&
                r.parentId === k.parentId &&
                r.name === k.name
            ) ?? null;
        }
        return row ? projectRow(row, select) : null;
      },
      findFirst: async ({ where, select }: any = {}) => {
        const rows = stores.folder.all().filter((r) => matchWhere(r, where ?? {}));
        const row = rows[0] ?? null;
        return row ? projectRow(row, select) : null;
      },
      findMany: async ({ where, select }: any = {}) => {
        const rows = stores.folder.all().filter((r) => matchWhere(r, where ?? {}));
        return rows.map((row) => projectRow(row, select));
      },
      create: async ({ data }: any) =>
        stores.folder.insert({
          parentId: null,
          ...data,
        }),
      update: async ({ where, data }: any) => {
        const row = stores.folder.rows.get(where.id);
        if (!row) throw new Error('folder not found');
        return stores.folder.update(where.id, data);
      },
      delete: async ({ where }: any) => {
        const row = stores.folder.rows.get(where.id);
        if (!row) throw new Error('folder not found');
        deleteFolderTree(where.id);
        return row;
      },
      deleteMany: async ({ where }: any = {}) => {
        let n = 0;
        for (const row of stores.folder.all().filter((r) => matchWhere(r, where ?? {}))) {
          deleteFolderTree(row.id);
          n++;
        }
        return { count: n };
      },
    },

    // -------------------------------------------------------------------------
    // file
    // -------------------------------------------------------------------------
    file: {
      findUnique: async ({ where, select }: any) => {
        const rows = stores.file.all();
        let row = null;
        if (where.id !== undefined) row = rows.find((r) => r.id === where.id) ?? null;
        if (!row && where.cloudinaryId !== undefined) {
          row = rows.find((r) => r.cloudinaryId === where.cloudinaryId) ?? null;
        }
        return row ? projectRow(row, select) : null;
      },
      findFirst: async ({ where, select }: any = {}) => {
        const rows = stores.file.all().filter((r) => matchWhere(r, where ?? {}));
        const row = rows[0] ?? null;
        return row ? projectRow(row, select) : null;
      },
      findMany: async ({ where, select }: any = {}) => {
        const rows = stores.file.all().filter((r) => matchWhere(r, where ?? {}));
        return rows.map((row) => projectRow(row, select));
      },
      create: async ({ data }: any) =>
        stores.file.insert({
          folderId: null,
          ...data,
        }),
      update: async ({ where, data }: any) => {
        const row = stores.file.rows.get(where.id);
        if (!row) throw new Error('file not found');
        return stores.file.update(where.id, data);
      },
      delete: async ({ where }: any) => {
        const row = stores.file.rows.get(where.id);
        if (!row) throw new Error('file not found');
        stores.file.rows.delete(where.id);
        return row;
      },
      deleteMany: async ({ where }: any = {}) => {
        let n = 0;
        for (const [id, r] of stores.file.rows) {
          if (matchWhere(r, where ?? {})) {
            stores.file.rows.delete(id);
            n++;
          }
        }
        return { count: n };
      },
    },
  };

  return mock as PrismaMock;
};

/**
 * Tiny Prisma-where matcher. Supports equality, `gte`, `lte`, `in`, and
 * nested AND-of-fields. Returns true for empty `where`.
 */
function matchWhere(row: Row, where: any): boolean {
  if (!where || typeof where !== 'object') return true;
  for (const [key, cond] of Object.entries(where)) {
    if (cond === null || cond === undefined) {
      if (row[key] !== cond) return false;
      continue;
    }
    if (typeof cond !== 'object') {
      if (row[key] !== cond) return false;
      continue;
    }
    const c = cond as any;
    if ('gt' in c) {
      const rv = row[key];
      const cv = c.gt;
      if (!(rv instanceof Date ? rv.getTime() > cv.getTime() : rv > cv)) return false;
    }
    if ('gte' in c) {
      const rv = row[key];
      const cv = c.gte;
      if (!(rv instanceof Date ? rv.getTime() >= cv.getTime() : rv >= cv)) return false;
    }
    if ('lte' in c) {
      const rv = row[key];
      const cv = c.lte;
      if (!(rv instanceof Date ? rv.getTime() <= cv.getTime() : rv <= cv)) return false;
    }
    if ('in' in c) {
      if (!c.in.includes(row[key])) return false;
    }
    if ('has' in c) {
      const rv = row[key];
      if (!Array.isArray(rv) || !rv.includes(c.has)) return false;
    }
    if ('hasSome' in c) {
      const rv = row[key];
      if (!Array.isArray(rv) || !c.hasSome.some((item: any) => rv.includes(item))) return false;
    }
    if ('not' in c) {
      if (row[key] === c.not) return false;
    }
  }
  return true;
}
