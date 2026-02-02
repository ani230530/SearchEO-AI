import { Router, Request, Response } from 'express';
import { PrismaClient } from '../../generated/prisma';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { querySearchAnalytics, SearchAnalyticsQuery, getSearchConsoleClient } from '../services/googleSearchConsoleService';

const router = Router();
const prisma = new PrismaClient();

function asyncHandler(fn: (req: Request, res: Response, next: any) => Promise<any>) {
    return function (req: Request, res: Response, next: any) {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

/**
 * Helper: Extract domain from URL (handles sc-domain: prefix and regular URLs)
 */
const extractDomain = (url: string): string => {
    try {
        if (url.startsWith('sc-domain:')) {
            return url.replace('sc-domain:', '').toLowerCase();
        }
        let normalizedUrl = url.toLowerCase().trim();
        if (!normalizedUrl.startsWith('http')) {
            normalizedUrl = `https://${normalizedUrl}`;
        }
        const urlObj = new URL(normalizedUrl);
        return urlObj.hostname.replace(/^www\./, '');
    } catch (e) {
        return url.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
    }
};

/**
 * Helper: Calculate date range for GSC queries
 */
const calculateDateRange = (days: number = 28) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const endDate = new Date(today);
    endDate.setDate(today.getDate() - 2); // GSC data is delayed by 2 days

    const startDate = new Date(endDate);
    startDate.setDate(endDate.getDate() - (days - 1));

    return {
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
    };
};

/**
 * GET /api/blog-analytics/check-domain-match
 * Verify if WordPress siteUrl matches GSC selectedProperty
 */
router.get('/check-domain-match', authenticateToken, asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user.userId;

    // Fetch WordPress integration
    const wpIntegration = await prisma.wordpressIntegration.findUnique({
        where: { userId },
        select: { siteUrl: true }
    });

    if (!wpIntegration) {
        return res.json({
            success: true,
            match: false,
            reason: 'wordpress_not_connected',
            wordpressDomain: null,
            gscDomain: null
        });
    }

    // Fetch GSC connection
    const gscConnection = await prisma.googleSearchConsoleConnection.findUnique({
        where: { userId },
        select: { selectedProperty: true, isConnected: true }
    });

    if (!gscConnection || !gscConnection.isConnected || !gscConnection.selectedProperty) {
        return res.json({
            success: true,
            match: false,
            reason: 'gsc_not_connected',
            wordpressDomain: extractDomain(wpIntegration.siteUrl),
            gscDomain: null
        });
    }

    // Extract and compare domains
    const wpDomain = extractDomain(wpIntegration.siteUrl);
    const gscDomain = extractDomain(gscConnection.selectedProperty);

    const match = wpDomain === gscDomain ||
        wpDomain.includes(gscDomain) ||
        gscDomain.includes(wpDomain);

    res.json({
        success: true,
        match,
        reason: match ? 'domains_match' : 'domains_mismatch',
        wordpressDomain: wpDomain,
        gscDomain: gscDomain
    });
}));

/**
 * GET /api/blog-analytics/published-blogs
 * Fetch all published blogs for the user
 */
router.get('/published-blogs', authenticateToken, asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user.userId;

    const publishedBlogs = await prisma.wordpressPublishLog.findMany({
        where: {
            userId,
            status: 'published',
            wordpressUrl: {
                not: {
                    startsWith: 'draft://'
                }
            }
        },
        orderBy: { createdAt: 'desc' },
        select: {
            id: true,
            wordpressUrl: true,
            title: true,
            primaryKeyword: true,
            slug: true,
            createdAt: true,
            updatedAt: true
        }
    });

    res.json({
        success: true,
        blogs: publishedBlogs,
        count: publishedBlogs.length
    });
}));

/**
 * GET /api/blog-analytics/blog/:blogId/performance
 * Fetch GSC performance data for a specific blog
 */
router.get('/blog/:blogId/performance', authenticateToken, asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user.userId;
    const blogId = parseInt(req.params.blogId, 10);

    // Get blog details
    const blog = await prisma.wordpressPublishLog.findFirst({
        where: { id: blogId, userId }
    });

    if (!blog || !blog.wordpressUrl || blog.wordpressUrl.startsWith('draft://')) {
        return res.status(404).json({
            success: false,
            error: 'Blog not found or not published'
        });
    }

    // Get GSC connection
    const gscConnection = await prisma.googleSearchConsoleConnection.findUnique({
        where: { userId }
    });

    if (!gscConnection || !gscConnection.isConnected || !gscConnection.selectedProperty) {
        return res.status(400).json({
            success: false,
            error: 'Google Search Console not connected'
        });
    }

    const { days } = req.query;
    const daysNum = days ? parseInt(days as string, 10) : 28;
    const dateRange = calculateDateRange(daysNum);

    try {
        const searchconsole = await getSearchConsoleClient(userId);

        // Query GSC with page filter for this blog
        const response = await searchconsole.searchanalytics.query({
            siteUrl: gscConnection.selectedProperty,
            requestBody: {
                startDate: dateRange.startDate,
                endDate: dateRange.endDate,
                dimensions: ['date'],
                dimensionFilterGroups: [{
                    filters: [{
                        dimension: 'page',
                        operator: 'equals',
                        expression: blog.wordpressUrl
                    }]
                }],
                rowLimit: 100
            }
        });

        const rows = response.data.rows || [];

        // Aggregate totals
        let totalClicks = 0;
        let totalImpressions = 0;
        let positionSum = 0;

        const dateBreakdown = rows.map((row: any) => {
            totalClicks += row.clicks || 0;
            totalImpressions += row.impressions || 0;
            positionSum += (row.position || 0) * (row.impressions || 1);

            return {
                date: row.keys[0],
                clicks: row.clicks || 0,
                impressions: row.impressions || 0,
                ctr: row.ctr || 0,
                position: row.position || 0
            };
        });

        const avgPosition = totalImpressions > 0 ? positionSum / totalImpressions : 0;
        const avgCTR = totalImpressions > 0 ? totalClicks / totalImpressions : 0;

        res.json({
            success: true,
            blog: {
                id: blog.id,
                url: blog.wordpressUrl,
                title: blog.title,
                primaryKeyword: blog.primaryKeyword
            },
            performance: {
                totalClicks,
                totalImpressions,
                avgCTR,
                avgPosition
            },
            dateBreakdown,
            dateRange
        });
    } catch (error) {
        console.error('Error fetching blog performance:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch performance data from Google Search Console'
        });
    }
}));

/**
 * GET /api/blog-analytics/aggregate
 * Aggregate GSC performance for all published blogs
 */
router.get('/aggregate', authenticateToken, asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user.userId;

    // Get GSC connection
    const gscConnection = await prisma.googleSearchConsoleConnection.findUnique({
        where: { userId }
    });

    if (!gscConnection || !gscConnection.isConnected || !gscConnection.selectedProperty) {
        return res.status(400).json({
            success: false,
            error: 'Google Search Console not connected'
        });
    }

    // Get all published blogs
    const publishedBlogs = await prisma.wordpressPublishLog.findMany({
        where: {
            userId,
            status: 'published',
            wordpressUrl: {
                not: { startsWith: 'draft://' }
            }
        },
        select: {
            id: true,
            wordpressUrl: true,
            title: true,
            primaryKeyword: true
        }
    });

    if (publishedBlogs.length === 0) {
        return res.json({
            success: true,
            totalClicks: 0,
            totalImpressions: 0,
            avgCTR: 0,
            avgPosition: 0,
            blogs: [],
            dateRange: calculateDateRange(28)
        });
    }

    const { days } = req.query;
    const daysNum = days ? parseInt(days as string, 10) : 28;
    const dateRange = calculateDateRange(daysNum);

    try {
        const searchconsole = await getSearchConsoleClient(userId);

        // Build filter for all published blog URLs
        const pageFilters = publishedBlogs.map(blog => ({
            dimension: 'page',
            operator: 'equals',
            expression: blog.wordpressUrl
        }));

        // Query GSC with page dimension
        const response = await searchconsole.searchanalytics.query({
            siteUrl: gscConnection.selectedProperty,
            requestBody: {
                startDate: dateRange.startDate,
                endDate: dateRange.endDate,
                dimensions: ['page'],
                rowLimit: 1000
            }
        });

        const rows = response.data.rows || [];

        // Filter to only include our published blogs
        const publishedUrls = new Set(publishedBlogs.map(b => b.wordpressUrl));
        const filteredRows = rows.filter((row: any) => publishedUrls.has(row.keys[0]));

        // Aggregate totals
        let totalClicks = 0;
        let totalImpressions = 0;
        let positionSum = 0;

        const blogPerformance = filteredRows.map((row: any) => {
            const url = row.keys[0];
            const blogInfo = publishedBlogs.find(b => b.wordpressUrl === url);

            totalClicks += row.clicks || 0;
            totalImpressions += row.impressions || 0;
            positionSum += (row.position || 0) * (row.impressions || 1);

            return {
                id: blogInfo?.id,
                url,
                title: blogInfo?.title || url,
                primaryKeyword: blogInfo?.primaryKeyword,
                clicks: row.clicks || 0,
                impressions: row.impressions || 0,
                ctr: row.ctr || 0,
                position: row.position || 0
            };
        });

        // Sort by clicks descending
        blogPerformance.sort((a, b) => b.clicks - a.clicks);

        const avgPosition = totalImpressions > 0 ? positionSum / totalImpressions : 0;
        const avgCTR = totalImpressions > 0 ? totalClicks / totalImpressions : 0;

        // Get date breakdown for trend chart
        const trendResponse = await searchconsole.searchanalytics.query({
            siteUrl: gscConnection.selectedProperty,
            requestBody: {
                startDate: dateRange.startDate,
                endDate: dateRange.endDate,
                dimensions: ['date'],
                rowLimit: 100
            }
        });

        const trendRows = trendResponse.data.rows || [];
        const dateBreakdown = trendRows.map((row: any) => ({
            date: row.keys[0],
            clicks: row.clicks || 0,
            impressions: row.impressions || 0,
            ctr: row.ctr || 0,
            position: row.position || 0
        }));

        res.json({
            success: true,
            totalClicks,
            totalImpressions,
            avgCTR,
            avgPosition,
            blogs: blogPerformance,
            topPerformingBlogs: blogPerformance.slice(0, 5),
            dateBreakdown,
            dateRange,
            totalBlogsAnalyzed: blogPerformance.length
        });
    } catch (error) {
        console.error('Error fetching aggregate analytics:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch aggregate analytics from Google Search Console'
        });
    }
}));

export default router;
