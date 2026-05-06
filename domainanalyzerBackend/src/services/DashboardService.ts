import { PrismaClient } from '../../generated/prisma';
import { scoreResponseDeterministic } from './aiQueryService';
import { parseContextJson, parseCrawlPolicy, parseCrawlQuality, parsePageSnapshots, parseStringArray } from './crawlResultUtils';
import { safeParseObject, safeParseArray } from '../utils/json';

const prisma = new PrismaClient();

export class DashboardService {
  /**
   * Lightweight function to calculate basic metrics from existing data (no AI calls)
   */
  static calculateBasicMetrics(domain: any) {
    // Add safety checks for domain structure
    if (!domain || (!domain.keywords && !domain.generatedIntentPhrases)) {
      console.log('Domain or analysis data not found, returning empty metrics');
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

    const aiQueryResults = domain.generatedIntentPhrases 
      ? domain.generatedIntentPhrases.flatMap((p: any) => p.aiQueryResults || [])
      : this.flattenAIQueryResults(domain.keywords || []);

    // Handle crawl data properly
    const crawlData = domain.crawlResults?.[0];
    const analyzedUrls = parseStringArray(crawlData?.analyzedUrls);
    const pageSnapshots = parsePageSnapshots(crawlData?.pageSnapshots);
    const crawlPolicy = parseCrawlPolicy(crawlData?.crawlPolicy);
    const crawlQuality = parseCrawlQuality(crawlData?.quality);
    const totalPages = pageSnapshots.length || analyzedUrls.length;
    const thinContentPages = pageSnapshots.filter((page: any) => page.thinContent).length;
    const pagesWithMetadata = pageSnapshots.filter((page: any) => page.title || page.metaDescription).length;
    const pagesWithSchema = pageSnapshots.filter((page: any) => page.schemaCoverage > 0).length;
    const httpsPages = pageSnapshots.filter((page: any) => page.url?.startsWith('https://')).length;
    const averageReadability = pageSnapshots.length > 0 ? Math.round(pageSnapshots.reduce((sum: number, page: any) => sum + (page.readability || 0), 0) / pageSnapshots.length) : 0;
    const averageDepth = pageSnapshots.length > 0 ? Math.round(pageSnapshots.reduce((sum: number, page: any) => sum + (page.contentScore || 0), 0) / pageSnapshots.length) : 0;
    const freshness = pageSnapshots.length > 0
      ? Math.round(
          (pageSnapshots.filter((page: any) => {
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
        phraseCount: domain.generatedIntentPhrases?.length || domain.keywords?.reduce((sum: number, keyword: any) => sum + (keyword.generatedIntentPhrases?.length || 0), 0) || 0,
        modelPerformance: [],
        keywordPerformance: [],
        topPhrases: [],
        performanceData: [],
        seoMetrics: {
          organicTraffic: 0,
          backlinks: 0,
          domainAuthority: 0,
          pageSpeed: 0,
          mobileScore: 0,
          coreWebVitals: { lcp: 0, fid: 0, cls: 0 },
          technicalSeo: { ssl: false, mobile: false, sitemap: false, robots: false },
          contentQuality: { readability: 0, depth: 0, freshness: 0 }
        },
        contentPerformance: {
          totalPages: 0,
          indexedPages: 0,
          avgPageScore: 0,
          topPerformingPages: [],
          contentGaps: []
        }
      };
    }

    // Calculate basic metrics from existing AI data
    const totalQueries = aiQueryResults.length;
    const mentions = aiQueryResults.filter((result: any) => result.presence > 0).length;
    const mentionRate = (mentions / totalQueries) * 100;
    
    const avgRelevance = (aiQueryResults.reduce((sum: number, result: any) => sum + (result.relevance || 0), 0) / totalQueries) * 20;
    const avgAccuracy = (aiQueryResults.reduce((sum: number, result: any) => sum + (result.accuracy || 0), 0) / totalQueries) * 20;
    const avgSentiment = (aiQueryResults.reduce((sum: number, result: any) => sum + (result.sentiment || 0), 0) / totalQueries) * 20;
    const avgOverall = (aiQueryResults.reduce((sum: number, result: any) => sum + (result.overall || 0), 0) / totalQueries) * 20;

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
      if (!result || !result.model) return;
      
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
      if (!keyword || !keyword.generatedIntentPhrases) return;
      
      keyword.generatedIntentPhrases.forEach((phrase: any) => {
        if (!phrase) return;
        
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
      if (!keyword || !keyword.generatedIntentPhrases) return;
      
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
        sitemap: !!crawlPolicy && crawlPolicy.sitemaps?.length > 0,
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
      indexedPages: pageSnapshots.filter((page: any) => !page.thinContent && page.status >= 200 && page.status < 400).length,
      avgPageScore: crawlQuality?.contentQuality ?? averageDepth,
      topPerformingPages: [...pageSnapshots]
        .sort((a, b) => b.contentScore - a.contentScore)
        .slice(0, 5)
        .map((page) => ({
          url: page.url,
          score: page.contentScore,
          traffic: Math.max(0, Math.round((page.wordCount || 0) * 0.7 + (page.schemaCoverage || 0) * 15)),
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

  /**
   * Calculate overall score for reports (from dashboard.ts:1817)
   */
  static calculateOverallScore(domain: any, selectedPhrases: any[], keywordsWithSelectedPhrases: any[]) {
    let totalScore = 0;
    let totalWeight = 0;

    // Enhanced Phrase Performance (40% weight)
    let phrasePerformance = 0;
    if (selectedPhrases.length > 0) {
      const phraseScores = selectedPhrases.map(phrase => {
        const aiResults = phrase.aiQueryResults || [];
        if (aiResults.length === 0) {
          return (phrase.relevanceScore || 0) * 0.5;
        }
        
        const avgOverall = aiResults.reduce((sum: number, result: any) => sum + (result.overall || 0), 0) / aiResults.length;
        const avgPresence = aiResults.reduce((sum: number, result: any) => sum + (result.presence || 0), 0) / aiResults.length;
        
        if (avgPresence === 0) return 0;
        
        const relevanceScore = phrase.relevanceScore || 0;
        const aiScore = avgOverall * 20; 
        return (relevanceScore * 0.6) + (aiScore * 0.4);
      });
      
      phrasePerformance = phraseScores.reduce((sum, score) => sum + score, 0) / phraseScores.length;
    }
    totalScore += phrasePerformance * 0.4;
    totalWeight += 0.4;

    // Enhanced Keyword Opportunity (25% weight)
    let keywordOpportunity = 0;
    if (keywordsWithSelectedPhrases.length > 0) {
      const keywordScores = keywordsWithSelectedPhrases.map(kw => {
        const difficulty = parseFloat(kw.difficulty) || 50;
        let baseScore = difficulty < 50 ? 90 : difficulty < 70 ? 70 : 50;
        
        const hasDomainPresence = kw.generatedIntentPhrases?.some((phrase: any) => {
          const aiResults = phrase.aiQueryResults || [];
          return aiResults.some((result: any) => result.presence > 0);
        });
        
        if (!hasDomainPresence) baseScore *= 0.3;
        return baseScore;
      });
      
      keywordOpportunity = keywordScores.reduce((sum, score) => sum + score, 0) / keywordScores.length;
    }
    totalScore += keywordOpportunity * 0.25;
    totalWeight += 0.25;

    // Domain Authority/Pages (20% weight)
    const domainAuthority = domain.crawlResults?.[0]?.pagesScanned ? 
      Math.min(100, (domain.crawlResults[0].pagesScanned / 100) * 100) : 50;
    totalScore += domainAuthority * 0.2;
    totalWeight += 0.2;

    // On-Page Optimization (10% weight)
    const onPageOptimization = domain.semanticAnalyses?.[0] ? 88 : 50;
    totalScore += onPageOptimization * 0.1;
    totalWeight += 0.1;

    // Competitor Gaps (5% weight)
    const competitorGaps = 92; 
    totalScore += competitorGaps * 0.05;
    totalWeight += 0.05;

    return Math.round(totalScore / totalWeight);
  }

  /**
   * Helper to flatten phrases directly from the domain object
   */
  /**
   * Generates a unified list of both keywords and phrases for the report table
   */
  static getUnifiedAnalysisList(domain: any) {
    const unifiedList: any[] = [];
    
    // 1. Process Phrases (Individual Prompts) FIRST as requested
    if (domain.generatedIntentPhrases) {
      domain.generatedIntentPhrases.forEach((phrase: any) => {
        const results = phrase.aiQueryResults || [];
        
        const avgOverall = results.length > 0 
          ? (results.reduce((sum: number, r: any) => sum + (r.overall || 0), 0) / results.length) * 2
          : 0;
        
        const avgSentiment = results.length > 0
          ? (results.reduce((sum: number, r: any) => sum + (r.sentiment || 0), 0) / results.length) * 2
          : 0;

        const mentions = results.filter((r: any) => r.presence > 0).length;
        const sov = results.length > 0 ? (mentions / results.length) * 100 : 0;

        // Calculate best rank (lowest positive rank)
        const ranks = results.filter((r: any) => r.presence > 0 && r.domainRank > 0).map((r: any) => r.domainRank);
        const bestRank = ranks.length > 0 ? Math.min(...ranks) : null;

        const competitors = new Set<string>();
        results.forEach((r: any) => {
          const names = this.safeParseArray(r.competitorNames);
          names.forEach((n: string) => competitors.add(n));
        });

        unifiedList.push({
          id: `ph-${phrase.id}`,
          type: 'prompt',
          phrase: phrase.phrase,
          keyword: phrase.keyword?.term || 'Custom',
          avgOverall,
          avgSentiment,
          mentions,
          bestRank,
          sov: `${Math.round(sov)}%`,
          competitorCount: competitors.size,
          competitors: Array.from(competitors).slice(0, 3),
          results: results.map((r: any) => {
            const parsedSources = this.safeParseArray(r.sources);
            const parsedCitations = this.safeParseArray(r.citations);
            
            // Phase 3: Backend Integrity & Fallbacks
            // If sources are empty, try to derive from competitor metadata
            let finalSources = parsedSources.length > 0 ? parsedSources : null;
            if (!finalSources && r.competitorUrls) {
              const compUrls = this.safeParseArray(r.competitorUrls);
              if (compUrls.length > 0) finalSources = compUrls;
            }

            const mentioned = (r.presence || 0) > 0;
            const scoreState = mentioned ? 'scored' : 'not_mentioned';

            return {
              id: r.id,
              model: r.model,
              presence: r.presence,
              domainRank: r.domainRank,
              mentioned,
              scoreState,
              displayOverall: mentioned ? (r.overall || 0) * 2 : null,
              displayRelevance: mentioned ? (r.relevance || 0) * 2 : null,
              displayAccuracy: mentioned ? (r.accuracy || 0) * 2 : null,
              displaySentiment: mentioned ? (r.sentiment || 0) * 2 : null,
              overall: (r.overall || 0) * 2,
              relevance: (r.relevance || 0) * 2,
              accuracy: (r.accuracy || 0) * 2,
              sentiment: (r.sentiment || 0) * 2,
              citations: parsedCitations,
              response: r.response,
              sources: finalSources,
              phrase: phrase.phrase
            };
          })
        });
      });
    }

    // 2. Process Keywords (Aggregating their underlying phrases) SECOND
    if (domain.keywords) {
      domain.keywords.forEach((keyword: any) => {
        // Collect AI results from all phrases under this keyword
        const phrasesForKeyword = keyword.generatedIntentPhrases || [];
        const allResults = phrasesForKeyword.flatMap((p: any) => 
          (p.aiQueryResults || []).map((r: any) => {
            const mentioned = (r.presence || 0) > 0;
            const scoreState = mentioned ? 'scored' : 'not_mentioned';

            return {
              id: r.id,
              model: r.model,
              presence: r.presence,
              domainRank: r.domainRank,
              mentioned,
              scoreState,
              displayOverall: mentioned ? (r.overall || 0) * 2 : null,
              displayRelevance: mentioned ? (r.relevance || 0) * 2 : null,
              displayAccuracy: mentioned ? (r.accuracy || 0) * 2 : null,
              displaySentiment: mentioned ? (r.sentiment || 0) * 2 : null,
              overall: (r.overall || 0) * 2,
              relevance: (r.relevance || 0) * 2,
              accuracy: (r.accuracy || 0) * 2,
              sentiment: (r.sentiment || 0) * 2,
              citations: this.safeParseArray(r.citations),
              response: r.response,
              sources: this.safeParseArray(r.sources),
              phrase: p.phrase
            };
          })
        );
        
        const avgOverall = allResults.length > 0 
          ? (allResults.reduce((sum: number, r: any) => sum + (r.overall || 0), 0) / allResults.length)
          : 0;
        
        const avgSentiment = allResults.length > 0
          ? (allResults.reduce((sum: number, r: any) => sum + (r.sentiment || 0), 0) / allResults.length)
          : 0;

        const mentions = allResults.filter((r: any) => r.presence > 0).length;
        const sov = allResults.length > 0 ? (mentions / allResults.length) * 100 : 0;

        // Calculate best rank (lowest positive rank)
        const ranks = allResults.filter((r: any) => r.presence > 0 && r.domainRank > 0).map((r: any) => r.domainRank);
        const bestRank = ranks.length > 0 ? Math.min(...ranks) : null;

        const competitors = new Set<string>();
        allResults.forEach((r: any) => {
          const names = this.safeParseArray(r.competitorNames);
          names.forEach((n: string) => competitors.add(n));
        });

        unifiedList.push({
          id: `kw-${keyword.id}`,
          type: 'keyword',
          phrase: keyword.term,
          avgOverall,
          avgSentiment,
          mentions,
          bestRank,
          sov: `${Math.round(sov)}%`,
          competitorCount: competitors.size,
          competitors: Array.from(competitors).slice(0, 3),
          results: allResults,
          // SEO specific fields
          volume: keyword.volume || 0,
          difficulty: keyword.difficulty || '0'
        });
      });
    }

    return unifiedList;
  }

  static safeParseArray(data: any): any[] {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (typeof data === 'string') {
      try {
        const parsed = JSON.parse(data);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  }

  /**
   * Helper to flatten AI query results from keywords (original method kept for compatibility)
   */
  static flattenAIQueryResults(keywords: any[]) {
    if (!keywords) return [];
    return keywords.flatMap((keyword: any) => {
      if (!keyword || !keyword.generatedIntentPhrases) return [];
      return keyword.generatedIntentPhrases.flatMap((phrase: any) => {
        if (!phrase || !phrase.aiQueryResults) return [];
        return phrase.aiQueryResults;
      });
    });
  }

  /**
   * Parallelized dashboard summary fetcher
   */
  static async getDashboardSummary(domainId: number, userId: number) {
    const domain = await prisma.domain.findUnique({
      where: { id: domainId },
      select: {
        id: true,
        url: true,
        context: true,
        userId: true,
        updatedAt: true,
        keywords: {
          select: {
            id: true,
            term: true,
            volume: true,
            difficulty: true,
            generatedIntentPhrases: {
              select: {
                phrase: true,
                aiQueryResults: {
                  select: {
                    presence: true,
                    relevance: true,
                    accuracy: true,
                    sentiment: true,
                    overall: true,
                    model: true,
                    competitorNames: true,
                    response: true,
                    sources: true,
                    citations: true
                  }
                }
              }
            }
          }
        },
        generatedIntentPhrases: {
          select: {
            id: true,
            phrase: true,
            relevanceScore: true,
            isSelected: true,
            keyword: { select: { term: true } },
            aiQueryResults: {
              select: {
                id: true,
                presence: true,
                relevance: true,
                accuracy: true,
                sentiment: true,
                overall: true,
                model: true,
                cost: true,
                latency: true,
                detectionMethod: true,
                response: true,
                sources: true,
                competitorUrls: true,
                domainRank: true,
                foundDomains: true,
                mentions: true,
                citations: true,
                competitorNames: true
              }
            }
          }
        },
        crawlResults: { orderBy: { createdAt: 'desc' }, take: 1 },
        dashboardAnalyses: { orderBy: { createdAt: 'desc' }, take: 1 },
        competitorAnalyses: { orderBy: { updatedAt: 'desc' }, take: 1 }
      }
    });

    if (!domain || domain.userId !== userId) {
      return null;
    }

    const metrics = this.calculateBasicMetrics(domain);
    const topPrompts = this.getUnifiedAnalysisList(domain);
    
    return {
      domainInfo: {
        id: domain.id,
        url: domain.url,
        context: domain.context,
        updatedAt: domain.updatedAt
      },
      metrics,
      topPrompts
    };
  }
}
