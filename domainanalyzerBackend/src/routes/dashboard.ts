import { Router, Request, Response } from 'express';
import { PrismaClient } from '../../generated/prisma';
import { aiQueryService, scoreResponseWithAI, analyzeResponseWithAI } from '../services/aiQueryService';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { analyzeCompetitors } from '../services/geminiService';
import { analyzeStandalonePeerCompetitors } from '../services/standaloneCompetitorAnalysisService';
import { advanceDomainStep, syncDomainCurrentStep } from './domain';
import { parseContextJson, parseCrawlPolicy, parseCrawlQuality, parsePageSnapshots, parseStringArray } from '../services/crawlResultUtils';

const router = Router();
const prisma = new PrismaClient();

// Add asyncHandler utility at the top
function asyncHandler(fn: (req: any, res: any, next: any) => Promise<any>) {
  return function (req: any, res: any, next: any) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function safeParseObject(value: any): Record<string, any> {
  if (value === null || value === undefined) return {};
  if (typeof value !== 'string') {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function getSummaryContext(contextJson: any): string {
  const summaryContext = safeParseObject(contextJson).summaryContext;
  return typeof summaryContext === 'string' ? summaryContext.trim() : '';
}

// GET /api/dashboard/debug - Debug endpoint to check user's domains
router.get('/debug', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    console.log(`Debug: Checking domains for user ${req.user.userId}`);
    
    // Test database connection
    try {
      await prisma.$queryRaw`SELECT 1`;
      console.log('Database connection successful');
    } catch (dbError) {
      console.error('Database connection failed:', dbError);
      return res.status(500).json({ error: 'Database connection failed', details: dbError });
    }
    
    const domains = await prisma.domain.findMany({
      where: { userId: req.user.userId },
      select: { id: true, url: true, userId: true, createdAt: true }
    });

    res.json({
      success: true,
      user: { userId: req.user.userId },
      domains: domains,
      totalDomains: domains.length,
      databaseStatus: 'Connected'
    });
  } catch (error) {
    console.error('Debug endpoint error:', error);
    res.status(500).json({ error: 'Debug failed', details: error instanceof Error ? error.message : 'Unknown error' });
  }
}));

// GET /api/dashboard/all - Get all domains for the authenticated user
router.get('/all', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    console.log(`Fetching all domains for user ${req.user.userId}`);

    // Get all domains for the authenticated user
    const domains = await prisma.domain.findMany({
      where: { 
        userId: req.user.userId 
      },
      include: {
        crawlResults: {
          orderBy: { createdAt: 'desc' },
          take: 1
        },
        dashboardAnalyses: {
          orderBy: { createdAt: 'desc' },
          take: 1
        },
        _count: {
          select: {
            keywords: true,
            crawlResults: true
          }
        }
      },
      orderBy: {
        updatedAt: 'desc'
      }
    });

    const domainsWithSteps = await Promise.all(domains.map(async domain => {
      const syncedStep = await syncDomainCurrentStep(domain.id);
      return { domain, syncedStep };
    }));

    res.json({
      domains: domainsWithSteps.map(({ domain, syncedStep }) => ({
        id: domain.id,
        url: domain.url,
        context: domain.context,
        location: domain.location,
        currentStep: syncedStep,
        createdAt: domain.createdAt,
        updatedAt: domain.updatedAt,
        lastAnalyzed: domain.dashboardAnalyses[0]?.updatedAt || domain.updatedAt,
        hasAnalysis: !!domain.dashboardAnalyses[0],
        keywordCount: domain._count.keywords,
        crawlCount: domain._count.crawlResults,
        metrics: domain.dashboardAnalyses[0]?.metrics || null
      }))
    });

  } catch (error) {
    console.error('Error fetching all domains:', error);
    res.status(500).json({ error: 'Failed to fetch domains' });
  }
}));

// Lightweight function to calculate basic metrics from existing data (no AI calls)
function calculateBasicMetrics(domain: any) {
  // Add safety checks for domain structure
  if (!domain || !domain.keywords) {
    console.log('Domain or keywords not found, returning empty metrics');
    return {
      visibilityScore: 0,
      mentionRate: 0,
      avgRelevance: 0,
      avgAccuracy: 0,
      avgSentiment: 0,
      avgOverall: 0,
      totalQueries: 0,
      keywordCount: 0,
      phraseCount: 0,
      modelPerformance: [],
      keywordPerformance: [],
      topPhrases: [],
      performanceData: []
    };
  }

  const aiQueryResults = domain.keywords.flatMap((keyword: any) => {
    if (!keyword || !keyword.generatedIntentPhrases) {
      console.log(`Keyword ${keyword?.id || 'unknown'} has no generatedIntentPhrases`);
      return [];
    }
    return keyword.generatedIntentPhrases.flatMap((phrase: any) => {
      if (!phrase || !phrase.aiQueryResults) {
        console.log(`Phrase ${phrase?.id || 'unknown'} has no aiQueryResults`);
        return [];
      }
      return phrase.aiQueryResults;
    });
  });

  // Handle crawl data properly
  const crawlData = domain.crawlResults?.[0];
  const analyzedUrls = parseStringArray(crawlData?.analyzedUrls);
  const pageSnapshots = parsePageSnapshots(crawlData?.pageSnapshots);
  const crawlPolicy = parseCrawlPolicy(crawlData?.crawlPolicy);
  const crawlQuality = parseCrawlQuality(crawlData?.quality);
  const totalPages = pageSnapshots.length || analyzedUrls.length;
  const thinContentPages = pageSnapshots.filter((page) => page.thinContent).length;
  const pagesWithMetadata = pageSnapshots.filter((page) => page.title || page.metaDescription).length;
  const pagesWithSchema = pageSnapshots.filter((page) => page.schemaCoverage > 0).length;
  const httpsPages = pageSnapshots.filter((page) => page.url.startsWith('https://')).length;
  const averageReadability = pageSnapshots.length > 0 ? Math.round(pageSnapshots.reduce((sum, page) => sum + page.readability, 0) / pageSnapshots.length) : 0;
  const averageDepth = pageSnapshots.length > 0 ? Math.round(pageSnapshots.reduce((sum, page) => sum + page.contentScore, 0) / pageSnapshots.length) : 0;
  const freshness = pageSnapshots.length > 0
    ? Math.round(
        (pageSnapshots.filter((page) => {
          if (!page.lastModified) {
            return false;
          }
          const modifiedAt = Date.parse(page.lastModified);
          return Number.isFinite(modifiedAt) && Date.now() - modifiedAt < 1000 * 60 * 60 * 24 * 365;
        }).length / pageSnapshots.length) * 100
      )
    : 0;

  if (aiQueryResults.length === 0) {
    console.log('No AI query results found, returning basic metrics');
    return {
      visibilityScore: 0,
      mentionRate: 0,
      avgRelevance: 0,
      avgAccuracy: 0,
      avgSentiment: 0,
      avgOverall: 0,
      totalQueries: 0,
      keywordCount: domain.keywords?.length || 0,
      phraseCount: domain.keywords?.reduce((sum: number, keyword: any) => sum + (keyword.generatedIntentPhrases?.length || 0), 0) || 0,
      modelPerformance: [],
      keywordPerformance: [],
      topPhrases: [],
      performanceData: []
    };
  }

  // Calculate basic metrics from existing AI data
  const totalQueries = aiQueryResults.length;
      const mentions = aiQueryResults.filter((result: any) => result.presence > 0).length;
  const mentionRate = (mentions / totalQueries) * 100;
  
  const avgRelevance = aiQueryResults.reduce((sum: number, result: any) => sum + result.relevance, 0) / totalQueries;
  const avgAccuracy = aiQueryResults.reduce((sum: number, result: any) => sum + result.accuracy, 0) / totalQueries;
  const avgSentiment = aiQueryResults.reduce((sum: number, result: any) => sum + result.sentiment, 0) / totalQueries;
  const avgOverall = aiQueryResults.reduce((sum: number, result: any) => sum + result.overall, 0) / totalQueries;
  

  const detectionMethods = aiQueryResults
    .filter((result: any) => result.detectionMethod)
    .map((result: any) => result.detectionMethod);
  const mostCommonDetectionMethod = detectionMethods.length > 0 
    ? detectionMethods.sort((a: string, b: string) => 
        detectionMethods.filter((v: string) => v === a).length - detectionMethods.filter((v: string) => v === b).length
      ).pop() 
    : null;
  
  // Calculate visibility score based on existing data with enhanced metrics
  const visibilityScore = Math.round(
    Math.min(
      100,
      Math.max(
        0,
        (mentionRate * 0.25) + (avgRelevance * 10) + (avgSentiment * 5)
      )
    )
  );

  // Model performance breakdown (from existing data)
  const modelStats = new Map();
  aiQueryResults.forEach((result: any) => {
    if (!result || !result.model) {
      console.log('Skipping result without model:', result);
      return;
    }
    
    if (!modelStats.has(result.model)) {
      modelStats.set(result.model, {
        total: 0,
        mentions: 0,
        totalRelevance: 0,
        totalAccuracy: 0,
        totalSentiment: 0,
        totalOverall: 0,
        totalLatency: 0,
        totalCost: 0
      });
    }
    const stats = modelStats.get(result.model);
    stats.total++;
            if (result.presence > 0) stats.mentions++;
    stats.totalRelevance += result.relevance || 0;
    stats.totalAccuracy += result.accuracy || 0;
    stats.totalSentiment += result.sentiment || 0;
    stats.totalOverall += result.overall || 0;
    stats.totalLatency += result.latency || 0;
    stats.totalCost += result.cost || 0;
  });

  const modelPerformance = Array.from(modelStats.entries()).map(([model, stats]: [string, any]) => ({
    model,
    score: ((stats.mentions / stats.total) * 40 + (stats.totalOverall / stats.total) * 20).toFixed(1),
    mentions: stats.mentions,
    totalQueries: stats.total,
    avgLatency: (stats.totalLatency / stats.total).toFixed(2),
    avgCost: (stats.totalCost / stats.total).toFixed(3),
    avgRelevance: (stats.totalRelevance / stats.total).toFixed(1),
    avgAccuracy: (stats.totalAccuracy / stats.total).toFixed(1),
    avgSentiment: (stats.totalSentiment / stats.total).toFixed(1),
    avgOverall: (stats.totalOverall / stats.total).toFixed(1)
  }));

  // Top performing phrases (from existing data)
  const phraseStats = new Map();
  domain.keywords.forEach((keyword: any) => {
    if (!keyword || !keyword.generatedIntentPhrases) {
      console.log(`Keyword ${keyword?.id || 'unknown'} has no generatedIntentPhrases`);
      return;
    }
    
    keyword.generatedIntentPhrases.forEach((phrase: any) => {
      if (!phrase) {
        console.log('Skipping null phrase');
        return;
      }
      
      const phraseText = phrase.phrase || 'Unknown';
      const phraseResults = phrase.aiQueryResults || [];
      if (phraseResults.length > 0) {
        if (!phraseStats.has(phraseText)) {
          phraseStats.set(phraseText, { count: 0, totalScore: 0 });
        }
        const stats = phraseStats.get(phraseText);
        stats.count += phraseResults.length;
        stats.totalScore += phraseResults.reduce((sum: number, result: any) => sum + (result.overall || 0), 0);
      }
    });
  });

  const topPhrases = Array.from(phraseStats.entries())
    .map(([phrase, stats]: [string, any]) => ({
      phrase,
      count: stats.count,
      avgScore: (stats.totalScore / stats.count).toFixed(1)
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Keyword performance (from existing data)
  const keywordStats = new Map();
  domain.keywords.forEach((keyword: any) => {
    if (!keyword || !keyword.generatedIntentPhrases) {
      console.log(`Keyword ${keyword?.id || 'unknown'} has no generatedIntentPhrases for performance calculation`);
      return;
    }
    
    const keywordResults = keyword.generatedIntentPhrases.flatMap((phrase: any) => phrase.aiQueryResults || []);
    if (keywordResults.length > 0) {
      const mentions = keywordResults.filter((result: any) => result.presence > 0).length;
      const avgSentiment = keywordResults.reduce((sum: number, result: any) => sum + (result.sentiment || 0), 0) / keywordResults.length;
      keywordStats.set(keyword.term, {
        visibility: (mentions / keywordResults.length) * 100,
        mentions,
        sentiment: avgSentiment,
        volume: keyword.volume || 0,
        difficulty: keyword.difficulty || 'N/A'
      });
    }
  });

  const keywordPerformance = Array.from(keywordStats.entries())
    .map(([keyword, stats]: [string, any]) => ({
      keyword,
      visibility: Math.round(stats.visibility),
      mentions: stats.mentions,
      sentiment: Math.round(stats.sentiment * 10) / 10,
      volume: stats.volume,
      difficulty: stats.difficulty
    }))
    .sort((a, b) => b.visibility - a.visibility);

  // Performance trend data (simplified)
  const performanceData = [
    {
      month: 'Current',
      score: visibilityScore,
      mentions,
      queries: totalQueries
    }
  ];

  // Add SEO metrics
  const seoMetrics = {
    organicTraffic: Math.max(0, Math.round((mentions * 12) + totalPages * 8 + keywordPerformance.length * 15)),
    backlinks: 0,
    domainAuthority: Math.max(0, Math.min(100, Math.round(((crawlQuality?.contentQuality ?? averageDepth) * 0.6) + visibilityScore * 0.4))),
    pageSpeed: pageSnapshots.length > 0 ? Math.max(40, 100 - thinContentPages * 3) : 0,
    mobileScore: pageSnapshots.length > 0 ? Math.round((pagesWithMetadata / pageSnapshots.length) * 100) : 0,
    coreWebVitals: {
      lcp: pageSnapshots.length > 0 ? Number((Math.max(1.2, 4.5 - averageDepth / 30)).toFixed(2)) : 0,
      fid: pageSnapshots.length > 0 ? Math.max(25, 120 - averageDepth) : 0,
      cls: pageSnapshots.length > 0 ? Number((Math.max(0.02, 0.25 - averageReadability / 500)).toFixed(2)) : 0
    },
    technicalSeo: {
      ssl: totalPages > 0 ? httpsPages === totalPages : false,
      mobile: pageSnapshots.length > 0 ? pagesWithMetadata > 0 : false,
      sitemap: !!crawlPolicy && crawlPolicy.sitemaps.length > 0,
      robots: !!crawlPolicy?.robotsFetched
    },
    contentQuality: {
      readability: averageReadability,
      depth: crawlQuality?.contentQuality ?? averageDepth,
      freshness
    }
  };

  const contentPerformance = {
    totalPages,
    indexedPages: pageSnapshots.filter((page) => !page.thinContent && page.status >= 200 && page.status < 400).length,
    avgPageScore: crawlQuality?.contentQuality ?? averageDepth,
    topPerformingPages: [...pageSnapshots]
      .sort((a, b) => b.contentScore - a.contentScore)
      .slice(0, 5)
      .map((page) => ({
        url: page.url,
        score: page.contentScore,
        traffic: Math.max(0, Math.round(page.wordCount * 0.7 + page.schemaCoverage * 15)),
      })),
    contentGaps: [
      ...(pagesWithSchema === 0 ? ['Structured data coverage'] : []),
      ...(thinContentPages > 0 ? ['Thin content pages'] : []),
      ...(pagesWithMetadata < totalPages ? ['Missing page titles or descriptions'] : []),
    ]
  };

  return {
    visibilityScore,
    mentionRate: Math.round(mentionRate * 10) / 10,
    avgRelevance: Math.round(avgRelevance * 10) / 10,
    avgAccuracy: Math.round(avgAccuracy * 10) / 10,
    avgSentiment: Math.round(avgSentiment * 10) / 10,
    avgOverall: Math.round(avgOverall * 10) / 10,

    detectionMethod: mostCommonDetectionMethod,
    totalQueries,
    keywordCount: domain.keywords?.length || 0,
    phraseCount: domain.keywords?.reduce((sum: number, keyword: any) => sum + (keyword.generatedIntentPhrases?.length || 0), 0) || 0,
    modelPerformance,
    keywordPerformance,
    topPhrases,
    performanceData,
    seoMetrics,
    contentPerformance
  };
}

// GET /api/dashboard/:domainId/test - Test endpoint to check domain existence
router.get('/:domainId/test', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const domainId = Number(req.params.domainId);
  
  if (!domainId || isNaN(domainId)) {
    return res.status(400).json({ error: 'Invalid domain ID' });
  }

  try {
    console.log(`Testing domain existence for ID: ${domainId}`);
    
    // Test database connection first
    try {
      await prisma.$queryRaw`SELECT 1`;
      console.log('Database connection successful');
    } catch (dbError) {
      console.error('Database connection failed:', dbError);
      return res.status(500).json({ error: 'Database connection failed', details: dbError });
    }
    
    // Simple domain check
    const domain = await prisma.domain.findUnique({
      where: { id: domainId },
      select: { id: true, url: true, userId: true }
    });

    if (!domain) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    if (domain.userId !== req.user.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Test if we can access related data
    try {
      const keywordCount = await prisma.keyword.count({
        where: { domainId: domainId }
      });
      
      const phraseCount = await prisma.generatedIntentPhrase.count({
        where: { domainId: domainId }
      });
      
      const crawlCount = await prisma.crawlResult.count({
        where: { domainId: domainId }
      });

      res.json({ 
        success: true, 
        domain: { id: domain.id, url: domain.url, userId: domain.userId },
        user: { userId: req.user.userId },
        relatedData: {
          keywords: keywordCount,
          phrases: phraseCount,
          crawlResults: crawlCount
        },
        databaseStatus: 'Connected'
      });
    } catch (relatedDataError) {
      console.error('Error accessing related data:', relatedDataError);
      res.json({ 
        success: true, 
        domain: { id: domain.id, url: domain.url, userId: domain.userId },
        user: { userId: req.user.userId },
        relatedDataError: relatedDataError instanceof Error ? relatedDataError.message : 'Unknown error',
        databaseStatus: 'Connected'
      });
    }
  } catch (error) {
    console.error('Test endpoint error:', error);
    res.status(500).json({ error: 'Test failed', details: error instanceof Error ? error.message : 'Unknown error' });
  }
}));

// GET /api/dashboard/:domainId - Get comprehensive dashboard data
router.get('/:domainId', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const domainId = Number(req.params.domainId);
  
  if (!domainId || isNaN(domainId)) {
    return res.status(400).json({ error: 'Invalid domain ID' });
  }

  try {
    console.log(`Fetching comprehensive dashboard data for domain ${domainId}`);
    console.log(`User ID: ${req.user.userId}`);

    // Test database connection first
    try {
      await prisma.$queryRaw`SELECT 1`;
      console.log('Database connection successful');
    } catch (dbError) {
      console.error('Database connection failed:', dbError);
      return res.status(500).json({ error: 'Database connection failed' });
    }

    // Get domain with all related data
    let domain;
    try {
      domain = await prisma.domain.findUnique({
        where: { id: domainId },
        include: {
          keywords: {
            include: {
              generatedIntentPhrases: {
                include: {
                  aiQueryResults: true
                }
              }
            }
          },
          crawlResults: {
            orderBy: { createdAt: 'desc' },
            take: 1
          },
          dashboardAnalyses: {
            orderBy: { createdAt: 'asc' } // fetch full history for time series
          },
          competitorAnalyses: {
            orderBy: { updatedAt: 'desc' },
            take: 1
          }
        }
      });
      console.log('Domain query completed successfully');
    } catch (domainQueryError) {
      console.error('Error in domain query:', domainQueryError);
      return res.status(500).json({ 
        error: 'Failed to fetch domain data',
        details: process.env.NODE_ENV === 'development' ? domainQueryError instanceof Error ? domainQueryError.message : 'Unknown query error' : undefined
      });
    }

    console.log(`Domain found: ${!!domain}`);
    if (domain) {
      console.log(`Domain URL: ${domain.url}`);
      console.log(`Domain User ID: ${domain.userId}`);
      console.log(`Keywords count: ${domain.keywords?.length || 0}`);
      console.log(`Crawl results count: ${domain.crawlResults?.length || 0}`);
    }

    if (!domain) {
      console.log(`Domain ${domainId} not found in database`);
      return res.status(404).json({ error: 'Domain not found' });
    }

    if (domain.userId !== req.user.userId) {
      console.log(`Access denied: Domain user ID (${domain.userId}) != Request user ID (${req.user.userId})`);
      return res.status(403).json({ error: 'Access denied' });
    }

    const syncedStep = await syncDomainCurrentStep(domainId);

    // Calculate metrics from existing data
    console.log('Starting metrics calculation...');
    let metrics;
    try {
      metrics = calculateBasicMetrics(domain);
      console.log('Metrics calculation completed');
    } catch (metricsError) {
      console.error('Error calculating metrics:', metricsError);
      // Return basic metrics if calculation fails
      metrics = {
        visibilityScore: 0,
        mentionRate: 0,
        avgRelevance: 0,
        avgAccuracy: 0,
        avgSentiment: 0,
        avgOverall: 0,
        totalQueries: 0,
        keywordCount: domain.keywords?.length || 0,
        phraseCount: 0,
        modelPerformance: [],
        keywordPerformance: [],
        topPhrases: [],
        performanceData: [],
        seoMetrics: {},
        contentPerformance: {}
      };
    }

    // Build historical time-series from stored snapshots
    try {
      const history = (domain.dashboardAnalyses || []).map((snap: any) => {
        const m = typeof snap.metrics === 'string' ? JSON.parse(snap.metrics) : snap.metrics || {};
        const created = snap.createdAt ? new Date(snap.createdAt) : new Date();
        const dateLabel = created.toISOString().slice(0, 10);
        const score = typeof m.visibilityScore === 'number' ? m.visibilityScore : (typeof m.avgOverall === 'number' ? Math.round(m.avgOverall * 20) : 0);
        const totalQueries = typeof m.totalQueries === 'number' ? m.totalQueries : 0;
        const mentionRatePct = typeof m.mentionRate === 'number' ? m.mentionRate : (typeof m.mentionRate === 'string' ? parseFloat(m.mentionRate) : 0);
        const mentions = Math.round((mentionRatePct || 0) * (totalQueries || 0) / 100);
        return {
          month: dateLabel,
          score,
          mentions,
          queries: totalQueries
        };
      });

      if (history.length > 0) {
        metrics.performanceData = history;
      }
    } catch (historyErr) {
      console.error('Failed to build performance history:', historyErr);
    }

    // Remove DB write on GET to avoid polluting history
    // (Previously: save/update dashboardAnalysis here)

    // Get crawl data for extraction info
    const normalizedCrawlResults = (domain.crawlResults || []).map((crawlResult: any) => ({
      ...crawlResult,
      analyzedUrls: parseStringArray(crawlResult.analyzedUrls),
      pageSnapshots: parsePageSnapshots(crawlResult.pageSnapshots),
      crawlPolicy: parseCrawlPolicy(crawlResult.crawlPolicy),
      quality: parseCrawlQuality(crawlResult.quality),
      contextJson: parseContextJson(crawlResult.contextJson),
    }));
    const crawlData = normalizedCrawlResults[0];

    // Generate insights
    const insights = {
      strengths: [
        {
          title: "AI Visibility Established",
          description: `Domain achieves ${metrics.visibilityScore}% visibility score with ${metrics.mentionRate}% mention rate`,
          metric: `${metrics.visibilityScore}% visibility score`
        }
      ],
      weaknesses: [],
      recommendations: []
    };

    // Generate industry analysis
    const industryAnalysis = {
      marketPosition: metrics.mentionRate > 50 ? 'leader' : metrics.mentionRate > 25 ? 'challenger' : 'niche',
      competitiveAdvantage: `Strong AI visibility with ${metrics.totalQueries} analyzed queries`,
      marketTrends: ["AI-powered SEO optimization"],
      growthOpportunities: ["Expand keyword portfolio", "Improve content quality"],
      threats: ["Increasing competition", "Algorithm changes"]
    };

    // Save or update dashboard analysis
    try {
      const existingAnalysis = await prisma.dashboardAnalysis.findFirst({
        where: { domainId }
      });

      if (existingAnalysis) {
        await prisma.dashboardAnalysis.update({
          where: { id: existingAnalysis.id },
          data: {
            metrics,
            insights,
            industryAnalysis,
            updatedAt: new Date()
          }
        });
      } else {
        await prisma.dashboardAnalysis.create({
          data: {
            domainId,
            metrics,
            insights,
            industryAnalysis
          }
        });
      }
    } catch (dbError) {
      console.error('Error saving dashboard analysis:', dbError);
      // Continue without saving - this is not critical
    }

    // Flatten AI query results for frontend
    let flatAIQueryResults = [];
    try {
      flatAIQueryResults = domain.keywords.flatMap((keyword: any) => 
        keyword.generatedIntentPhrases.flatMap((phrase: any) => 
          phrase.aiQueryResults.map((result: any) => ({
            ...result,
            keyword: keyword.term,
            phraseText: phrase.phrase,
            // Include competitor data if available
            competitors: result.competitorNames && result.competitorNames.length > 0 ? {
              names: Array.isArray(result.competitorNames) ? result.competitorNames : [],
              mentions: Array.isArray(result.competitorMentions) ? result.competitorMentions.map((mention: any) => ({
                name: mention.name || mention.domain || '',
                domain: mention.domain || mention.name || '',
                position: mention.position || 0,
                context: mention.context || '',
                sentiment: mention.sentiment || 'neutral',
                mentionType: mention.mentionType || 'text'
              })) : [],
              totalMentions: typeof result.competitorCount === 'number' ? result.competitorCount : (result.competitorMentions ? result.competitorMentions.length : 0)
            } : undefined
          }))
        )
      );
      console.log(`Successfully flattened ${flatAIQueryResults.length} AI query results with competitor data`);
    } catch (flattenError) {
      console.error('Error flattening AI query results:', flattenError);
      flatAIQueryResults = [];
    }

    // Prepare competitor analysis data
    let competitorData = null;
    if (domain.competitorAnalyses && domain.competitorAnalyses.length > 0) {
      const analysis = domain.competitorAnalyses[0];
      
      // Parse competitorList string to array
      let competitorListArr: string[] = [];
      if (analysis.competitorList) {
        competitorListArr = analysis.competitorList
          .split('\n')
          .map((s: string) => s.replace(/^[-\s]+/, '').trim())
          .filter(Boolean);
      }

      // Parse JSON fields safely
      const safeParseArray = (val: any): any[] => {
        try {
          if (!val) return [];
          if (typeof val === 'string') return JSON.parse(val);
          if (Array.isArray(val)) return val;
          return [];
        } catch { return []; }
      };

      const safeParseObject = (val: any): Record<string, any> => {
        try {
          if (!val) return {};
          if (typeof val === 'string') return JSON.parse(val);
          if (typeof val === 'object') return val as Record<string, any>;
          return {};
        } catch { return {}; }
      };

      // Parse the stored data structure
      const storedCompetitors = safeParseObject(analysis.competitors);
      const storedMarketInsights = safeParseObject(analysis.marketInsights);
      const storedStrategicRecommendations = safeParseObject(analysis.strategicRecommendations);
      const storedCompetitiveAnalysis = safeParseObject(analysis.competitiveAnalysis);

      competitorData = {
        ...analysis,
        competitorListArr,
        competitors: storedCompetitors.newAnalysis || safeParseArray(analysis.competitors),
        oldCompetitors: storedCompetitors.oldAnalysis || [],
        marketInsights: storedMarketInsights.newAnalysis || safeParseObject(analysis.marketInsights),
        oldMarketInsights: storedMarketInsights.oldAnalysis || {},
        strategicRecommendations: storedStrategicRecommendations.newAnalysis || safeParseArray(analysis.strategicRecommendations),
        oldStrategicRecommendations: storedStrategicRecommendations.oldAnalysis || [],
        competitiveAnalysis: storedCompetitiveAnalysis.newAnalysis || safeParseObject(analysis.competitiveAnalysis),
        oldCompetitiveAnalysis: storedCompetitiveAnalysis.oldAnalysis || {},
        cached: true
      };
    }

    // Prepare response data with error handling
    let responseData;
    try {
      responseData = {
        id: domain.id,
        url: domain.url,
        context: domain.context,
        contextJson: parseContextJson(domain.contextJson),
        summaryContext: parseContextJson(domain.contextJson)?.summaryContext || null,
        lastAnalyzed: domain.dashboardAnalyses?.length ? domain.dashboardAnalyses[domain.dashboardAnalyses.length - 1].updatedAt || domain.dashboardAnalyses[domain.dashboardAnalyses.length - 1].createdAt : domain.updatedAt,
        industry: 'Technology', // Default industry since it's not in the schema
        description: domain.context || '',
        crawlResults: normalizedCrawlResults,
        keywords: domain.keywords || [],
        phrases: domain.keywords.flatMap((keyword: any) => 
          keyword.generatedIntentPhrases.map((phrase: any) => ({
            id: phrase.id,
            text: phrase.phrase,
            keywordId: keyword.id
          }))
        ),
        aiQueryResults: flatAIQueryResults,
        metrics,
        insights,
        industryAnalysis,
        currentStep: syncedStep,
        extraction: crawlData ? {
          tokenUsage: crawlData.tokenUsage || 0
        } : undefined,
        competitorData // Include competitor analysis data
      };
      console.log('Response data prepared successfully');
    } catch (responseError) {
      console.error('Error preparing response data:', responseError);
      return res.status(500).json({ 
        error: 'Failed to prepare response data',
        details: process.env.NODE_ENV === 'development' ? responseError instanceof Error ? responseError.message : 'Unknown response error' : undefined
      });
    }

    console.log('Sending dashboard response...');
    res.json(responseData);

  } catch (error) {
    console.error('Error fetching dashboard data for domain', domainId, ':', error);
    
    // Provide more specific error messages
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        res.status(404).json({ error: 'Domain not found' });
      } else if (error.message.includes('access denied')) {
        res.status(403).json({ error: 'Access denied' });
      } else {
        res.status(500).json({ 
          error: 'Failed to fetch dashboard data',
          details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
      }
    } else {
      res.status(500).json({ error: 'Failed to fetch dashboard data' });
    }
  }
}));

// GET /api/dashboard/:domainId/competitors - Get competitor analysis for a domain
router.get('/:domainId/competitors', authenticateToken, async (req: any, res: any) => {
  try {
    const { domainId } = req.params;

    // Check domain ownership
    const domain = await prisma.domain.findUnique({
      where: { id: parseInt(domainId) },
      include: {
        competitorAnalyses: {
          orderBy: { updatedAt: 'desc' },
          take: 1
        }
      }
    });

    if (!domain) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    if (domain.userId !== req.user.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!domain.competitorAnalyses.length) {
      return res.status(404).json({ error: 'No competitor analysis found' });
    }

    const analysis = domain.competitorAnalyses[0];
    
    // Parse competitorList string to array
    let competitorListArr: string[] = [];
    if (analysis.competitorList) {
      competitorListArr = analysis.competitorList
        .split('\n')
        .map((s: string) => s.replace(/^[-\s]+/, '').trim())
        .filter(Boolean);
    }

    // Parse JSON fields safely
    let competitors = [];
    let marketInsights = {};
    let strategicRecommendations = [];
    let competitiveAnalysis = {};

    const safeParseArray = (val: any): any[] => {
      try {
        if (!val) return [];
        if (typeof val === 'string') return JSON.parse(val);
        if (Array.isArray(val)) return val;
        return [];
      } catch { return []; }
    };

    const safeParseObject = (val: any): Record<string, any> => {
      try {
        if (!val) return {};
        if (typeof val === 'string') return JSON.parse(val);
        if (typeof val === 'object') return val as Record<string, any>;
        return {};
      } catch { return {}; }
    };

    competitors = safeParseArray(analysis.competitors);
    marketInsights = safeParseObject(analysis.marketInsights);
    strategicRecommendations = safeParseArray(analysis.strategicRecommendations);
    competitiveAnalysis = safeParseObject(analysis.competitiveAnalysis);

    res.json({
      ...analysis,
      competitorListArr,
      competitors,
      marketInsights,
      strategicRecommendations,
      competitiveAnalysis
    });
  } catch (error) {
    console.error('Error fetching competitor analysis:', error);
    res.status(500).json({ error: 'Failed to fetch competitor analysis' });
  }
});

// POST /api/dashboard/:domainId/competitors - Generate competitor analysis
router.post('/:domainId/competitors', authenticateToken, async (req: any, res: any) => {
  try {
    const { domainId } = req.params;
    const { competitors, force: forceBody } = req.body;

    // Check domain ownership
    const domain = await prisma.domain.findUnique({
      where: { id: parseInt(domainId) },
      include: {
        keywords: {
          where: { isSelected: true }
        }
      }
    });

    if (!domain) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    if (domain.userId !== req.user.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // If analysis exists with same competitor list and no force flag, return it instead of regenerating
    const forceFlag = (String(req.query.force).toLowerCase() === 'true') || Boolean(forceBody);
    const existingAnalysis = await prisma.competitorAnalysis.findFirst({
      where: { domainId: parseInt(domainId) },
      orderBy: { updatedAt: 'desc' }
    });

    if (existingAnalysis && !forceFlag) {
      const normalizeList = (list: string[]): string[] =>
        list
          .map((s) => String(s))
          .map((s) => s.replace(/^[-\s]+/, '').trim().toLowerCase())
          .filter(Boolean)
          .sort();

      const existingListRaw = (existingAnalysis.competitorList || '')
        .split('\n')
        .map((s) => s)
        .filter(Boolean);

      const existingList = normalizeList(existingListRaw);
      const incomingList = normalizeList(Array.isArray(competitors) ? competitors : []);

      const listsMatch = existingList.length > 0 && existingList.length === incomingList.length && existingList.every((x, i) => x === incomingList[i]);

      if (listsMatch) {
        // Safe parse helpers
        const safeParseArray = (val: any): any[] => {
          try {
            if (!val) return [];
            if (typeof val === 'string') return JSON.parse(val);
            if (Array.isArray(val)) return val;
            return [];
          } catch { return []; }
        };
        const safeParseObject = (val: any): Record<string, any> => {
          try {
            if (!val) return {};
            if (typeof val === 'string') return JSON.parse(val);
            if (typeof val === 'object') return val as Record<string, any>;
            return {};
          } catch { return {}; }
        };

        return res.json({
          ...existingAnalysis,
          competitorListArr: existingListRaw.map((s) => s.replace(/^[-\s]+/, '').trim()).filter(Boolean),
          competitors: safeParseArray(existingAnalysis.competitors),
          marketInsights: safeParseObject(existingAnalysis.marketInsights),
          strategicRecommendations: safeParseArray(existingAnalysis.strategicRecommendations),
          competitiveAnalysis: safeParseObject(existingAnalysis.competitiveAnalysis),
          tokenUsage: 0
        });
      }
    }

    // Generate real AI-powered competitor analysis
    console.log(`Generating AI competitor analysis for domain: ${domain.url}, context: ${domain.context}, competitors: ${competitors.join(', ')}`);
    const analysisResult = await analyzeCompetitors(
      domain.url,
      domain.context || 'No context provided',
      competitors,
      domain.location || undefined
    );

    console.log(`AI analysis completed with ${analysisResult.tokenUsage} tokens used`);

    const aiCompetitors = analysisResult.competitors;
    const aiMarketInsights = analysisResult.marketInsights;
    const aiStrategicRecommendations = analysisResult.strategicRecommendations;
    const aiCompetitiveAnalysis = analysisResult.competitiveAnalysis;

    // Save or update the analysis
    const analysis = {
      domainId: parseInt(domainId),
      competitorList: competitors.join('\n'),
      competitors: JSON.stringify(aiCompetitors),
      marketInsights: JSON.stringify(aiMarketInsights),
      strategicRecommendations: JSON.stringify(aiStrategicRecommendations),
      competitiveAnalysis: JSON.stringify(aiCompetitiveAnalysis),
    };

    let savedAnalysis;
    if (existingAnalysis) {
      savedAnalysis = await prisma.competitorAnalysis.update({
        where: { id: existingAnalysis.id },
        data: analysis
      });
    } else {
      savedAnalysis = await prisma.competitorAnalysis.create({
        data: analysis
      });
    }

    res.json({
      ...savedAnalysis,
      competitorListArr: competitors,
      competitors: aiCompetitors,
      marketInsights: aiMarketInsights,
      strategicRecommendations: aiStrategicRecommendations,
      competitiveAnalysis: aiCompetitiveAnalysis,
      tokenUsage: analysisResult.tokenUsage
    });
  } catch (error) {
    console.error('Error generating competitor analysis:', error);
    res.status(500).json({ error: 'Failed to generate competitor analysis' });
  }
});

// POST /api/dashboard/:domainId/competitors/analyze-responses - Analyze competitors using existing AI responses
router.post('/:domainId/competitors/analyze-responses', authenticateToken, async (req: any, res: any) => {
  try {
    const { domainId } = req.params;
    const { competitors } = req.body;

    // Check domain ownership
    const domain = await prisma.domain.findUnique({
      where: { id: parseInt(domainId) },
      include: {
        keywords: {
          where: { isSelected: true },
          include: {
            generatedIntentPhrases: {
              include: {
                aiQueryResults: true
              }
            }
          }
        }
      }
    });

    if (!domain) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    if (domain.userId !== req.user.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!competitors || competitors.length === 0) {
      return res.status(400).json({ error: 'Competitors list is required' });
    }

    // Check if analysis already exists with same competitor list
    const existingAnalysis = await prisma.competitorAnalysis.findFirst({
      where: { domainId: parseInt(domainId) },
      orderBy: { updatedAt: 'desc' }
    });

    if (existingAnalysis) {
      const normalizeList = (list: string[]): string[] =>
        list
          .map((s) => String(s))
          .map((s) => s.replace(/^[-\s]+/, '').trim().toLowerCase())
          .filter(Boolean)
          .sort();

      const existingListRaw = (existingAnalysis.competitorList || '')
        .split('\n')
        .map((s) => s)
        .filter(Boolean);

      const existingList = normalizeList(existingListRaw);
      const incomingList = normalizeList(Array.isArray(competitors) ? competitors : []);

      const listsMatch = existingList.length > 0 && existingList.length === incomingList.length && existingList.every((x, i) => x === incomingList[i]);

      if (listsMatch) {
        // Return cached analysis
        const safeParseArray = (val: any): any[] => {
          try {
            if (!val) return [];
            if (typeof val === 'string') return JSON.parse(val);
            if (Array.isArray(val)) return val;
            return [];
          } catch { return []; }
        };
        const safeParseObject = (val: any): Record<string, any> => {
          try {
            if (!val) return {};
            if (typeof val === 'string') return JSON.parse(val);
            if (typeof val === 'object') return val as Record<string, any>;
            return {};
          } catch { return {}; }
        };

        const storedCompetitors = safeParseObject(existingAnalysis.competitors);
        const storedMarketInsights = safeParseObject(existingAnalysis.marketInsights);
        const storedStrategicRecommendations = safeParseObject(existingAnalysis.strategicRecommendations);
        const storedCompetitiveAnalysis = safeParseObject(existingAnalysis.competitiveAnalysis);

        return res.json({
          ...existingAnalysis,
          competitorListArr: existingListRaw.map((s) => s.replace(/^[-\s]+/, '').trim()).filter(Boolean),
          competitors: storedCompetitors.newAnalysis || safeParseArray(existingAnalysis.competitors),
          oldCompetitors: storedCompetitors.oldAnalysis || [],
          marketInsights: storedMarketInsights.newAnalysis || safeParseObject(existingAnalysis.marketInsights),
          oldMarketInsights: storedMarketInsights.oldAnalysis || {},
          strategicRecommendations: storedStrategicRecommendations.newAnalysis || safeParseArray(existingAnalysis.strategicRecommendations),
          oldStrategicRecommendations: storedStrategicRecommendations.oldAnalysis || [],
          competitiveAnalysis: storedCompetitiveAnalysis.newAnalysis || safeParseObject(existingAnalysis.competitiveAnalysis),
          oldCompetitiveAnalysis: storedCompetitiveAnalysis.oldAnalysis || {},
          cached: true
        });
      }
    }

    // Collect all AI query results with phrase information
    const allAIResults = domain.keywords.flatMap(keyword => 
      keyword.generatedIntentPhrases.flatMap(phrase => 
        phrase.aiQueryResults.map(result => ({
          ...result,
          phraseText: phrase.phrase || `Phrase ${phrase.id}`,
          keywordText: keyword.term
        }))
      )
    );

    if (allAIResults.length === 0) {
      return res.status(400).json({ error: 'No AI query results found for analysis' });
    }

    // Use the imported scoring function

    // Analyze each competitor against each AI response
    const competitorAnalysisResults = [];

    for (const competitor of competitors) {
      const competitorScores = [];
      let totalScore = 0;
      let totalRank = 0;
      let totalMentions = 0;
      let totalRelevance = 0;
      let totalAccuracy = 0;
      let totalSentiment = 0;
      let totalOverall = 0;
      let responseCount = 0;

      for (const aiResult of allAIResults) {
        try {
          // First, analyze the response to detect all competitors
          const responseAnalysis = await analyzeResponseWithAI(aiResult.response, domain.url);
          
          // Check if our target competitor is mentioned in this response
          const competitorMention = responseAnalysis.competitors.mentions.find(mention => 
            mention.name.toLowerCase().includes(competitor.toLowerCase()) ||
            mention.domain.toLowerCase().includes(competitor.toLowerCase()) ||
            competitor.toLowerCase().includes(mention.name.toLowerCase()) ||
            competitor.toLowerCase().includes(mention.domain.toLowerCase())
          );

          if (competitorMention) {
            // Calculate scores based on competitor mention
            const presence = 1;
            const rank = competitorMention.position;
            const relevance = 4; // High relevance since competitor was found
            const accuracy = competitorMention.mentionType === 'url' ? 5 : 
                           competitorMention.mentionType === 'brand' ? 4 : 3;
            const sentiment = competitorMention.sentiment === 'positive' ? 5 :
                            competitorMention.sentiment === 'negative' ? 1 : 3;
            const overall = (relevance + accuracy + sentiment) / 3;

            competitorScores.push({
              phraseId: aiResult.phraseId,
              phraseText: aiResult.phraseText,
              model: aiResult.model,
              response: aiResult.response,
              presence: presence,
              rank: rank,
              relevance: relevance,
              accuracy: accuracy,
              sentiment: sentiment,
              overall: overall,
              mentions: 1,
              context: competitorMention.context,
              highlightContext: competitorMention.context,
              detectionMethod: competitorMention.mentionType,
              competitors: responseAnalysis.competitors
            });

            totalScore += overall;
            totalRank += rank;
            totalMentions += 1;
            totalRelevance += relevance;
            totalAccuracy += accuracy;
            totalSentiment += sentiment;
            totalOverall += overall;
            responseCount++;
          }
        } catch (error) {
          console.error(`Error analyzing competitor ${competitor} in response ${aiResult.id}:`, error);
        }
      }

      // Calculate averages
      const avgScore = responseCount > 0 ? totalOverall / responseCount : 0;
      const avgRank = responseCount > 0 ? totalRank / responseCount : 0;
      const avgRelevance = responseCount > 0 ? totalRelevance / responseCount : 0;
      const avgAccuracy = responseCount > 0 ? totalAccuracy / responseCount : 0;
      const avgSentiment = responseCount > 0 ? totalSentiment / responseCount : 0;

      competitorAnalysisResults.push({
        competitor,
        totalResponses: allAIResults.length,
        foundInResponses: responseCount,
        presenceRate: (responseCount / allAIResults.length) * 100,
        avgScore: parseFloat(avgScore.toFixed(2)),
        avgRank: parseFloat(avgRank.toFixed(2)),
        avgRelevance: parseFloat(avgRelevance.toFixed(2)),
        avgAccuracy: parseFloat(avgAccuracy.toFixed(2)),
        avgSentiment: parseFloat(avgSentiment.toFixed(2)),
        totalMentions,
        detailedScores: competitorScores
      });
    }

    // Sort competitors by average score (descending)
    competitorAnalysisResults.sort((a, b) => b.avgScore - a.avgScore);

    // Also run the old analysis for comparison
    let oldAnalysisResults: Array<{
      name: string;
      domain: string;
      strength: string;
      marketShare: string;
      keyStrengths: string[];
      weaknesses: string[];
      threatLevel: string;
      recommendations: string[];
      comparisonToDomain: {
        keywordOverlap: string;
        marketPosition: string;
        competitiveAdvantage: string;
        vulnerabilityAreas: string[];
      };
    }> = [];
    let oldMarketInsights: any = {};
    let oldStrategicRecommendations: any[] = [];
    let oldCompetitiveAnalysis: any = {};
    
    try {
      console.log('Running old competitor analysis...');
      const oldAnalysis = await analyzeCompetitors(
        domain.url,
        `Domain analysis for ${domain.url} with competitors: ${competitors.join(', ')}`,
        competitors,
        domain.location || undefined
      );
      oldAnalysisResults = oldAnalysis.competitors;
      oldMarketInsights = oldAnalysis.marketInsights;
      oldStrategicRecommendations = oldAnalysis.strategicRecommendations;
      oldCompetitiveAnalysis = oldAnalysis.competitiveAnalysis;
      console.log('Old analysis completed:', oldAnalysisResults.length, 'competitors analyzed');
      console.log('Old analysis market insights:', oldMarketInsights);
      console.log('Old analysis strategic recommendations:', oldStrategicRecommendations.length);
    } catch (error) {
      console.error('Old analysis failed:', error);
      // Continue with new analysis even if old analysis fails
    }

    // Save the analysis with both new and old data
    const savedAnalysis = await prisma.competitorAnalysis.create({
      data: {
        domainId: parseInt(domainId),
        competitorList: competitors.join('\n'),
        competitors: JSON.stringify({
          newAnalysis: competitorAnalysisResults,
          oldAnalysis: oldAnalysisResults
        }),
        marketInsights: JSON.stringify({
          newAnalysis: {
            totalCompetitors: competitors.length,
            totalResponses: allAIResults.length,
            analysisDate: new Date().toISOString()
          },
          oldAnalysis: oldMarketInsights
        }),
        strategicRecommendations: JSON.stringify({
          newAnalysis: [],
          oldAnalysis: oldStrategicRecommendations
        }),
        competitiveAnalysis: JSON.stringify({
          newAnalysis: {
            analysisType: 'response_based',
            totalPhrases: allAIResults.length,
            competitorsAnalyzed: competitors.length
          },
          oldAnalysis: oldCompetitiveAnalysis
        })
      }
    });

    // Parse the saved data for response
    const savedCompetitors = JSON.parse(savedAnalysis.competitors as string);
    const savedMarketInsights = JSON.parse(savedAnalysis.marketInsights as string);
    const savedStrategicRecommendations = JSON.parse(savedAnalysis.strategicRecommendations as string);
    const savedCompetitiveAnalysis = JSON.parse(savedAnalysis.competitiveAnalysis as string);

    res.json({
      ...savedAnalysis,
      competitorListArr: competitors,
      competitors: savedCompetitors.newAnalysis,
      oldCompetitors: savedCompetitors.oldAnalysis,
      oldMarketInsights: savedMarketInsights.oldAnalysis,
      oldStrategicRecommendations: savedStrategicRecommendations.oldAnalysis,
      oldCompetitiveAnalysis: savedCompetitiveAnalysis.oldAnalysis,
      marketInsights: savedMarketInsights.newAnalysis,
      strategicRecommendations: savedStrategicRecommendations.newAnalysis,
      competitiveAnalysis: savedCompetitiveAnalysis.newAnalysis,
      cached: false
    });

  } catch (error) {
    console.error('Error analyzing competitors from responses:', error);
    res.status(500).json({ error: 'Failed to analyze competitors from responses' });
  }
});

// GET /api/dashboard/:domainId/suggested-competitors - Get suggested competitors
router.get('/:domainId/suggested-competitors', authenticateToken, async (req: any, res: any) => {
  try {
    const { domainId } = req.params;

    // Check domain ownership
    const domain = await prisma.domain.findUnique({
      where: { id: parseInt(domainId) },
      include: {
        keywords: {
          where: { isSelected: true },
          take: 5
        },
        crawlResults: {
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      }
    });

    if (!domain) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    if (domain.userId !== req.user.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const domainContext = [
      typeof domain.context === 'string' ? domain.context.trim() : '',
      getSummaryContext(domain.contextJson),
      domain.crawlResults[0]?.extractedContext?.trim() || ''
    ].find((context) => context && context.length >= 50);

    if (!domainContext) {
      return res.status(400).json({
        error: 'Domain context is required before standalone competitor analysis',
        message: 'Run domain extraction first so the system has enough context to identify realistic peer competitors.'
      });
    }

    console.log(`Generating standalone-based competitor suggestions for domain: ${domain.url}`);

    const analysisResult = await analyzeStandalonePeerCompetitors({
      domain: domain.url,
      context: domainContext,
      location: domain.location || undefined
    });

    const storedAnalysis = {
      competitors: analysisResult.competitors,
      marketInsights: analysisResult.marketInsights,
      strategicRecommendations: analysisResult.strategicRecommendations,
      competitiveAnalysis: analysisResult.competitiveAnalysis
    };

    const existingSuggestedCompetitor = await prisma.suggestedCompetitor.findFirst({
      where: { domainId: domain.id },
      orderBy: { createdAt: 'desc' }
    });

    if (existingSuggestedCompetitor) {
      await prisma.suggestedCompetitor.update({
        where: { id: existingSuggestedCompetitor.id },
        data: {
          analysis: storedAnalysis as any,
          tokenUsage: analysisResult.tokenUsage,
          domainId: domain.id
        }
      });
    } else {
      await prisma.suggestedCompetitor.create({
        data: {
          analysis: storedAnalysis as any,
          tokenUsage: analysisResult.tokenUsage,
          domainId: domain.id
        }
      });
    }

    const suggestionResult = {
      suggestedCompetitors: analysisResult.competitors.map((competitor) => ({
        name: competitor.name,
        domain: competitor.domain,
        reason: competitor.peerFitReason,
        type: competitor.type
      })),
      dbStats: {
        totalSuggestedCompetitors: analysisResult.competitors.length,
        targetMarket: analysisResult.marketInsights.targetMarket,
        targetTier: analysisResult.marketInsights.targetTier,
        analysisGenerated: analysisResult.competitiveAnalysis.dataSource.generatedAt
      },
      tokenUsage: analysisResult.tokenUsage
    };

    console.log(`Standalone competitor suggestions generated with ${suggestionResult.tokenUsage} tokens used`);

    res.json({
      suggestedCompetitors: suggestionResult.suggestedCompetitors,
      dbStats: suggestionResult.dbStats,
      tokenUsage: suggestionResult.tokenUsage
    });
  } catch (error) {
    console.error('Error fetching suggested competitors:', error);
    res.status(500).json({ error: 'Failed to fetch suggested competitors' });
  }
});

// POST /api/dashboard/:domainId/report - Generate comprehensive analysis report
router.post('/:domainId/report', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const domainId = Number(req.params.domainId);
  
  if (!domainId) {
    return res.status(400).json({ error: 'Invalid domainId' });
  }

  try {
    // Verify domain access
    const domain = await prisma.domain.findUnique({
      where: { id: domainId },
      include: {
        crawlResults: {
          orderBy: { createdAt: 'desc' },
          take: 1
        },
        semanticAnalyses: {
          orderBy: { createdAt: 'desc' },
          take: 1
        },
        keywordAnalyses: {
          orderBy: { createdAt: 'desc' },
          take: 1
        },
        searchVolumeClassifications: {
          orderBy: { createdAt: 'desc' },
          take: 1
        },
        intentClassifications: {
          orderBy: { createdAt: 'desc' },
          take: 1
        },
        keywords: {
          include: {
            generatedIntentPhrases: {
              where: { isSelected: true },
              include: {
                aiQueryResults: {
                  orderBy: { createdAt: 'desc' }
                }
              }
            }
          }
        }
      }
    });

    if (!domain) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    if (domain.userId !== req.user.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get selected phrases and keywords with selected phrases
    const selectedPhrases = domain.keywords.flatMap(kw => 
      kw.generatedIntentPhrases.filter(phrase => phrase.isSelected)
    );
    const keywordsWithSelectedPhrases = domain.keywords.filter(kw => 
      kw.generatedIntentPhrases.some(phrase => phrase.isSelected)
    );

    console.log('Report Generation - Total keywords:', domain.keywords.length);
    console.log('Report Generation - Keywords with selected phrases:', keywordsWithSelectedPhrases.length);
    console.log('Report Generation - Selected phrases:', selectedPhrases.length);
    console.log('Report Generation - Selected phrases details:', selectedPhrases.map((p: any) => ({ id: p.id, text: p.text || p.phrase || '', keyword: domain.keywords.find((kw: any) => kw.generatedIntentPhrases.some((ph: any) => ph.id === p.id))?.term })));

    // Calculate overall score based on various metrics with improved domain presence handling
    const calculateOverallScore = () => {
      let totalScore = 0;
      let totalWeight = 0;

      // Enhanced Phrase Performance (40% weight) - now considers domain presence and quality
      let phrasePerformance = 0;
      if (selectedPhrases.length > 0) {
        // Get AI query results for selected phrases to check domain presence
        const phraseScores = selectedPhrases.map(phrase => {
          // Check if this phrase has AI query results
          const aiResults = phrase.aiQueryResults || [];
          if (aiResults.length === 0) {
            // No AI results yet - use relevance score as fallback
            return (phrase.relevanceScore || 0) * 0.5; // Reduce weight for phrases without AI analysis
          }
          
          // Calculate average score from AI results
          const avgOverall = aiResults.reduce((sum, result) => sum + (result.overall || 0), 0) / aiResults.length;
          const avgPresence = aiResults.reduce((sum, result) => sum + (result.presence || 0), 0) / aiResults.length;
          
          // If domain is not present in any AI result, score is 0
          if (avgPresence === 0) {
            return 0;
          }
          
          // Combine relevance score with AI analysis results
          const relevanceScore = phrase.relevanceScore || 0;
          const aiScore = avgOverall * 20; // Convert 1-5 scale to 0-100 scale
          
          return (relevanceScore * 0.6) + (aiScore * 0.4); // Weighted combination
        });
        
        phrasePerformance = phraseScores.reduce((sum, score) => sum + score, 0) / phraseScores.length;
      }
      totalScore += phrasePerformance * 0.4;
      totalWeight += 0.4;

      // Enhanced Keyword Opportunity (25% weight) - considers domain presence in AI results
      let keywordOpportunity = 0;
      if (keywordsWithSelectedPhrases.length > 0) {
        const keywordScores = keywordsWithSelectedPhrases.map(kw => {
          const difficulty = parseFloat(kw.difficulty) || 50;
          let baseScore = difficulty < 50 ? 90 : difficulty < 70 ? 70 : 50;
          
          // Check if any phrases for this keyword have domain presence
          const hasDomainPresence = kw.generatedIntentPhrases.some(phrase => {
            const aiResults = phrase.aiQueryResults || [];
            return aiResults.some(result => result.presence > 0);
          });
          
          // Reduce score if no domain presence found
          if (!hasDomainPresence) {
            baseScore *= 0.3; // Significantly reduce score for keywords with no domain presence
          }
          
          return baseScore;
        });
        
        keywordOpportunity = keywordScores.reduce((sum, score) => sum + score, 0) / keywordScores.length;
      }
      totalScore += keywordOpportunity * 0.25;
      totalWeight += 0.25;

      // Domain Authority/Pages (20% weight) - unchanged
      const domainAuthority = domain.crawlResults[0]?.pagesScanned ? 
        Math.min(100, (domain.crawlResults[0].pagesScanned / 100) * 100) : 50;
      totalScore += domainAuthority * 0.2;
      totalWeight += 0.2;

      // On-Page Optimization (10% weight) - unchanged
      const onPageOptimization = domain.semanticAnalyses[0] ? 88 : 50;
      totalScore += onPageOptimization * 0.1;
      totalWeight += 0.1;

      // Competitor Gaps (5% weight) - unchanged
      const competitorGaps = 92; // Default high score
      totalScore += competitorGaps * 0.05;
      totalWeight += 0.05;

      return Math.round(totalScore / totalWeight);
    };

    // Generate model performance data
    const generateModelPerformance = () => {
      const modelStats = {
        'GPT-4o': { avgConfidence: 85, responses: 0, topSource: 'Official Documentation' },
        'Claude 3': { avgConfidence: 82, responses: 0, topSource: 'Industry Reports' },
        'Gemini 1.5': { avgConfidence: 78, responses: 0, topSource: 'Community Discussions' }
      };

      // Count responses per model from selected phrases only
      let totalResponses = 0;
             domain.keywords.forEach(keyword => {
         keyword.generatedIntentPhrases.filter((phrase: any) => phrase.isSelected).forEach((phrase: any) => {
           phrase.aiQueryResults.forEach((result: any) => {
             const modelName = result.model as keyof typeof modelStats;
             if (modelStats[modelName]) {
               modelStats[modelName].responses++;
               modelStats[modelName].avgConfidence = Math.round((modelStats[modelName].avgConfidence + ((result as any).overall * 20)) / 2);
               totalResponses++;
             }
           });
         });
       });

      // If no AI query results found, provide realistic mock data based on domain analysis
      if (totalResponses === 0) {
        const mockResponses = Math.max(domain.keywords.length * 2, 6); // At least 6 responses
        modelStats['GPT-4o'].responses = Math.floor(mockResponses * 0.4);
        modelStats['Claude 3'].responses = Math.floor(mockResponses * 0.35);
        modelStats['Gemini 1.5'].responses = Math.floor(mockResponses * 0.25);
      }

      return Object.entries(modelStats).map(([model, stats]) => ({
        model,
        avgConfidence: stats.avgConfidence,
        responses: stats.responses,
        topSource: stats.topSource
      }));
    };

    // Generate strategic recommendations
    const generateRecommendations = () => {
      const recommendations = [
        {
          priority: 'High',
          type: 'Content Optimization',
          description: 'Focus on creating intent-driven content for high-volume, low-competition keywords',
          impact: 'Could increase organic traffic by 35-50%'
        },
        {
          priority: 'High',
          type: 'Competitor Analysis',
          description: 'Target competitor content gaps identified in LLM analysis',
          impact: 'Potential to capture 20-30% market share in identified niches'
        },
        {
          priority: 'Medium',
          type: 'Technical SEO',
          description: 'Improve page load speed and mobile optimization for better rankings',
          impact: 'Expected 10-15% improvement in search visibility'
        },
        {
          priority: 'Low',
          type: 'Long-tail Strategy',
          description: 'Expand content to cover related intent phrases with lower competition',
          impact: 'Steady growth in qualified organic traffic'
        }
      ];

      // Customize recommendations based on actual data
      if (domain.keywords.length > 0) {
        const avgDifficulty = domain.keywords.reduce((sum, kw) => sum + (parseFloat(kw.difficulty) || 50), 0) / domain.keywords.length;
        const avgVolume = domain.keywords.reduce((sum, kw) => sum + kw.volume, 0) / domain.keywords.length;
        
        if (avgDifficulty > 70) {
          recommendations[0].description = 'Focus on long-tail keywords with lower competition to build domain authority';
          recommendations[0].impact = 'Could increase organic traffic by 25-40%';
        }
        
        if (avgVolume < 1000) {
          recommendations[3].priority = 'Medium';
          recommendations[3].description = 'Target higher-volume keywords to increase organic traffic potential';
          recommendations[3].impact = 'Could increase organic traffic by 40-60%';
        }
      }

      // Customize based on domain analysis
      if (domain.crawlResults[0]?.pagesScanned && domain.crawlResults[0].pagesScanned < 50) {
        recommendations[2].priority = 'High';
        recommendations[2].description = 'Expand website content to cover more relevant topics and keywords';
        recommendations[2].impact = 'Could increase organic traffic by 30-45%';
      }

      return recommendations;
    };

    const report = {
      domain: {
        id: domain.id,
        url: domain.url,
        context: domain.crawlResults[0]?.extractedContext || '',
        location: domain.location || 'Global'
      },
      selectedKeywords: domain.keywords.filter((kw: any) => 
        kw.generatedIntentPhrases.some((phrase: any) => phrase.isSelected)
      ).map((kw: any) => ({
        id: kw.id,
        keyword: kw.term,
        volume: kw.volume,
        difficulty: kw.difficulty,
        cpc: kw.cpc,
        isSelected: kw.isSelected
      })),
      intentPhrases: domain.keywords.flatMap((kw: any) => 
        kw.generatedIntentPhrases.filter((phrase: any) => phrase.isSelected).map((phrase: any) => {
          // Safely parse sources JSON with fallback
          let sources: any[] = ['Community Discussions', 'Industry Reports'];
          if (phrase.sources) {
            try {
              if (typeof phrase.sources === 'string') {
                sources = JSON.parse(phrase.sources);
              } else if (Array.isArray(phrase.sources)) {
                sources = phrase.sources;
              }
            } catch (parseError) {
              console.warn('Failed to parse sources JSON for phrase', phrase.id, ':', parseError);
              sources = ['Community Discussions', 'Industry Reports'];
            }
          }
          
          return {
            id: String(phrase.id),
            phrase: phrase.text || phrase.phrase || '',
            relevance: phrase.relevanceScore || 0,
            trend: phrase.trend || 'Rising',
            sources: sources,
            parentKeyword: kw.term
          };
        })
      ),
      llmResults: generateModelPerformance(),
      overallScore: calculateOverallScore(),
      scoreBreakdown: {
        phrasePerformance: { weight: 40, score: selectedPhrases.length > 0 ? 
          Math.round(selectedPhrases.reduce((sum, phrase) => sum + (phrase.relevanceScore || 0), 0) / selectedPhrases.length) : 0 },
        keywordOpportunity: { weight: 25, score: keywordsWithSelectedPhrases.length > 0 ?
          Math.round(keywordsWithSelectedPhrases.reduce((sum, kw) => {
            const difficulty = parseFloat(kw.difficulty) || 50;
            return sum + (difficulty < 50 ? 90 : difficulty < 70 ? 70 : 50);
          }, 0) / keywordsWithSelectedPhrases.length) : 0 },
        domainAuthority: { weight: 20, score: domain.crawlResults[0]?.pagesScanned ? 
          Math.min(100, Math.round((domain.crawlResults[0].pagesScanned / 100) * 100)) : 50 },
        onPageOptimization: { weight: 10, score: domain.semanticAnalyses[0] ? 88 : 50 },
        competitorGaps: { weight: 5, score: 92 }
      },
      recommendations: generateRecommendations(),
      analysis: {
        semanticAnalysis: domain.semanticAnalyses[0] || {},
        keywordAnalysis: domain.keywordAnalyses[0] || {},
        searchVolumeClassification: domain.searchVolumeClassifications[0] || {},
        intentClassification: domain.intentClassifications[0] || {}
      }
    };

    await advanceDomainStep(domainId, 4);

    res.json(report);
  } catch (error) {
    console.error('Error generating report:', error);
    
    // Return a more detailed error response for debugging
    res.status(500).json({ 
      error: 'Failed to generate report',
      details: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
}));

export default router; 
