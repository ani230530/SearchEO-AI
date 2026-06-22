/**
 * /api/blog-analytics — GSC-backed performance aggregations for the user's
 * published WordPress blogs. The original src/routes/blogAnalytics.ts was
 * dropped in the foundational rewrite; this file restores only the one
 * endpoint the dashboard actually calls (`/aggregate`). The other endpoints
 * from the original file (check-domain-match, published-blogs, etc.) had no
 * frontend callers in the current codebase and were not restored.
 */
import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { getSearchConsoleClient } from '../services/googleSearchConsoleService';

const router: Router = Router();

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

const normalizePageUrl = (url: string | null | undefined): string | null => {
  if (!url) return null;
  try {
    let normalized = url.trim();
    if (!/^https?:\/\//i.test(normalized)) normalized = `https://${normalized}`;
    const u = new URL(normalized);
    const path = u.pathname.replace(/\/+$/, '') || '/';
    const host = u.hostname.replace(/^www\./, '').toLowerCase();
    return `${host}${path}`.toLowerCase();
  } catch {
    return url
      .trim()
      .replace(/^https?:\/\//i, '')
      .replace(/^www\./i, '')
      .replace(/[?#].*$/, '')
      .replace(/\/+$/, '')
      .toLowerCase();
  }
};

// GSC data lags by ~2 days; window backwards from there.
const calculateDateRange = (days: number) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endDate = new Date(today);
  endDate.setDate(today.getDate() - 2);
  const startDate = new Date(endDate);
  startDate.setDate(endDate.getDate() - (days - 1));
  return {
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0],
  };
};

router.get(
  '/aggregate',
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as AuthenticatedRequest).user.userId;

    const gscConnection = await prisma.googleSearchConsoleConnection.findUnique({
      where: { userId },
    });
    if (!gscConnection || !gscConnection.isConnected || !gscConnection.selectedProperty) {
      // Not an error from the dashboard's POV — just no data to show. The
      // original returned 400 here which made the dashboard log an error
      // for every user without GSC connected.
      return res.json({
        success: true,
        connected: false,
        totalClicks: 0,
        totalImpressions: 0,
        avgCTR: 0,
        avgPosition: 0,
        blogs: [],
        topPerformingBlogs: [],
        dateBreakdown: [],
        totalBlogsAnalyzed: 0,
      });
    }

    const publishedBlogs = await prisma.wordpressPublishLog.findMany({
      where: {
        userId,
        status: 'published',
        wordpressUrl: { not: { startsWith: 'draft://' } },
      },
      select: { id: true, wordpressUrl: true, title: true, primaryKeyword: true },
    });

    const days = req.query.days ? parseInt(String(req.query.days), 10) : 28;
    const dateRange = calculateDateRange(Number.isFinite(days) && days > 0 ? days : 28);

    try {
      const searchconsole = await getSearchConsoleClient(userId);

      const pageResp = await searchconsole.searchanalytics.query({
        siteUrl: gscConnection.selectedProperty,
        requestBody: {
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
          dimensions: ['page'],
          rowLimit: 1000,
        },
      });

      const rows = pageResp.data.rows ?? [];
      const publishedByUrl = new Map(
        publishedBlogs
          .map((blog) => [normalizePageUrl(blog.wordpressUrl), blog] as const)
          .filter((e): e is [string, typeof publishedBlogs[number]] => Boolean(e[0]))
      );
      const metricsByUrl = new Map(
        rows
          .filter((row) => {
            const k = normalizePageUrl(row.keys?.[0]);
            return k ? publishedByUrl.has(k) : false;
          })
          .map((row) => [normalizePageUrl(row.keys?.[0]) ?? '', row] as const)
      );

      let totalClicks = 0;
      let totalImpressions = 0;
      let positionSum = 0;
      const blogPerformance = publishedBlogs.map((blog) => {
        const k = normalizePageUrl(blog.wordpressUrl);
        const m = k ? metricsByUrl.get(k) : null;
        const clicks = m?.clicks ?? 0;
        const impressions = m?.impressions ?? 0;
        const position = m?.position ?? 0;
        totalClicks += clicks;
        totalImpressions += impressions;
        positionSum += position * impressions;
        return {
          id: blog.id,
          url: blog.wordpressUrl,
          title: blog.title || blog.wordpressUrl,
          primaryKeyword: blog.primaryKeyword,
          clicks,
          impressions,
          ctr: m?.ctr ?? 0,
          position,
        };
      });
      blogPerformance.sort((a, b) => b.clicks - a.clicks);

      const avgPosition = totalImpressions > 0 ? positionSum / totalImpressions : 0;
      const avgCTR = totalImpressions > 0 ? totalClicks / totalImpressions : 0;

      const trendResp = await searchconsole.searchanalytics.query({
        siteUrl: gscConnection.selectedProperty,
        requestBody: {
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
          dimensions: ['date'],
          rowLimit: 100,
        },
      });
      const dateBreakdown = (trendResp.data.rows ?? []).map((row) => ({
        date: row.keys?.[0] ?? '',
        clicks: row.clicks ?? 0,
        impressions: row.impressions ?? 0,
        ctr: row.ctr ?? 0,
        position: row.position ?? 0,
      }));

      return res.json({
        success: true,
        connected: true,
        totalClicks,
        totalImpressions,
        avgCTR,
        avgPosition,
        blogs: blogPerformance,
        topPerformingBlogs: blogPerformance.slice(0, 5),
        dateBreakdown,
        dateRange,
        totalBlogsAnalyzed: blogPerformance.length,
      });
    } catch (error) {
      console.error('[blog-analytics] aggregate failed:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch aggregate analytics from Google Search Console',
      });
    }
  })
);

export default router;
