import { Router, Request, Response } from 'express';
import { PrismaClient } from '../../generated/prisma';
import { aiQueryService } from '../services/aiQueryService';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { advanceDomainStep } from './domain';

const router = Router();
const prisma = new PrismaClient();

// Define the models that will be displayed to the frontend
const DISPLAY_MODELS: ('GPT-4o' | 'Claude 3' | 'Gemini 1.5')[] = ['GPT-4o', 'Claude 3', 'Gemini 1.5'];

// All models will use GPT-4o under the hood
const AI_MODELS: ('GPT-4o' | 'Claude 3' | 'Gemini 1.5')[] = ['GPT-4o', 'Claude 3', 'Gemini 1.5'];

// Fallback models when timeouts are frequent
const FALLBACK_MODELS: ('GPT-4o' | 'Claude 3')[] = ['GPT-4o', 'Claude 3'];

// Rate limiting: track active requests per domain with cleanup
const activeRequests = new Map<number, number>();
const MAX_CONCURRENT_REQUESTS = 2;

// Track timeout frequency to switch to fallback models
const timeoutTracker = new Map<string, number>();
const TIMEOUT_THRESHOLD = 3; // Switch to fallback after 3 timeouts

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [domainId, count] of Array.from(activeRequests.entries())) {
    if (count === 0) {
      activeRequests.delete(domainId);
    }
  }
  
  // Reset timeout tracker every 10 minutes to allow retry with full models
  for (const [domainKey, count] of Array.from(timeoutTracker.entries())) {
    if (count > 0) {
      console.log(`Resetting timeout count for ${domainKey} (was ${count})`);
      timeoutTracker.set(domainKey, 0);
    }
  }
}, 5 * 60 * 1000);

async function advanceTestingForPhrase(phraseId: number) {
  if (!phraseId || Number.isNaN(phraseId)) return;
  const phraseRecord = await prisma.generatedIntentPhrase.findUnique({
    where: { id: phraseId },
    select: { domainId: true },
  });

  if (phraseRecord?.domainId) {
    await advanceDomainStep(phraseRecord.domainId, 3);
  }
}

// Bulk reanalyze phrases endpoint
router.post('/reanalyze-phrases', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { phraseIds, domain, context, location } = req.body;
    
    if (!phraseIds || !Array.isArray(phraseIds) || phraseIds.length === 0) {
      return res.status(400).json({ error: 'Phrase IDs array is required' });
    }

    console.log(`Bulk reanalyzing ${phraseIds.length} phrases with their respective models`);

    const results = [];
    const errors = [];

    // Process each phrase with its respective model
    for (const phraseId of phraseIds) {
      try {
        // Get existing AI query results for this phrase to determine which models to re-analyze
        const existingResults = await prisma.aIQueryResult.findMany({
          where: { phraseId: parseInt(phraseId) },
          select: { model: true }
        });

        if (existingResults.length === 0) {
          errors.push({ phraseId: parseInt(phraseId), error: 'No existing AI query results found for this phrase' });
          continue;
        }

        // Get the phrase details
        const generatedPhrase = await prisma.generatedIntentPhrase.findUnique({
          where: { id: parseInt(phraseId) },
          include: {
            keyword: {
              include: {
                domain: true
              }
            }
          }
        });
        
        if (!generatedPhrase) {
          errors.push({ phraseId: parseInt(phraseId), error: 'Phrase not found' });
          continue;
        }

        const phrase = {
          id: generatedPhrase.id,
          text: generatedPhrase.phrase,
          keywordId: generatedPhrase.keywordId,
          keyword: generatedPhrase.keyword
        };

        const domainData = phrase.keyword?.domain;
        if (!domainData) {
          errors.push({ phraseId: parseInt(phraseId), error: 'Domain data not found' });
          continue;
        }
        
        const targetDomain = domain || domainData.url;
        const brandContext = context || domainData.context;

        // Re-analyze each existing model for this phrase
        for (const existingResult of existingResults) {
          const model = existingResult.model;
          
          console.log(`Reanalyzing phrase ${phraseId} with model ${model} for domain ${targetDomain}`);

          // Query the AI model with the phrase
          const queryResult = await aiQueryService.query(
            phrase.text,
            model as 'GPT-4o' | 'Claude 3' | 'Gemini 1.5',
            targetDomain,
            location
          );

          // Score the response – pass llmResponse for citation-based scoring
          const scoringResult = await aiQueryService.scoreResponse(
            phrase.text,
            queryResult.response,
            model,
            targetDomain,
            location,
            queryResult.llmResponse
          );

          // Update the existing AI query result
          const updatedResult = await prisma.aIQueryResult.updateMany({
            where: {
              phraseId: parseInt(phraseId),
              model: model
            },
            data: {
              response: queryResult.response,
              latency: 0,
              cost: queryResult.cost || 0,
              presence: scoringResult.presence,
              relevance: scoringResult.relevance,
              accuracy: scoringResult.accuracy,
              sentiment: scoringResult.sentiment,
              overall: scoringResult.overall,
              // Add competitor fields
              competitorNames: scoringResult.competitors?.names,
              competitorMentions: scoringResult.competitors?.mentions,
              competitorCount: scoringResult.competitors?.totalMentions,
              competitorDomains: scoringResult.competitors?.mentions?.map((m: any) => m.domain),
              competitorUrls: scoringResult.competitorUrls,
              competitorMatchScore: scoringResult.competitorMatchScore,
              citations: (scoringResult as any).citations || queryResult.llmResponse?.citations || [],
              searchQueries: (scoringResult as any).searchQueries || queryResult.llmResponse?.searchQueries || [],
              citationStrength: (scoringResult as any).citationStrength || 0,
            }
          });

          results.push({
            phraseId: parseInt(phraseId),
            model,
            success: true,
            scores: scoringResult
          });
        }

      } catch (error) {
        console.error(`Error reanalyzing phrase ${phraseId}:`, error);
        errors.push({ 
          phraseId: parseInt(phraseId), 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    }

    res.json({
      success: true,
      results,
      errors,
      summary: {
        total: results.length + errors.length,
        successful: results.length,
        failed: errors.length
      }
    });

  } catch (error) {
    console.error('Error in bulk reanalyze:', error);
    res.status(500).json({ 
      error: 'Failed to bulk reanalyze phrases',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Reanalyze individual phrase endpoint
router.post('/reanalyze-phrase', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { phraseId, model, domain, context, location } = req.body;
    
    if (!phraseId || !model) {
      return res.status(400).json({ error: 'Phrase ID and model are required' });
    }

    // Get the phrase from generatedIntentPhrase table only
    const generatedPhrase = await prisma.generatedIntentPhrase.findUnique({
      where: { id: parseInt(phraseId) },
      include: {
        keyword: {
          include: {
            domain: true
          }
        }
      }
    });
    
    if (!generatedPhrase) {
      return res.status(404).json({ error: 'Phrase not found' });
    }

    // Convert generatedIntentPhrase to phrase format for compatibility
    const phrase = {
      id: generatedPhrase.id,
      text: generatedPhrase.phrase,
      keywordId: generatedPhrase.keywordId,
      keyword: generatedPhrase.keyword
    };

    const domainData = phrase.keyword?.domain;
    if (!domainData) {
      return res.status(404).json({ error: 'Domain data not found' });
    }
    const targetDomain = domain || domainData.url;
    const brandContext = context || domainData.context;

    console.log(`Reanalyzing phrase ${phraseId} with model ${model} for domain ${targetDomain}`);

    // Query the AI model with the phrase
    const queryResult = await aiQueryService.query(
      phrase.text,
      model as 'GPT-4o' | 'Claude 3' | 'Gemini 1.5',
      targetDomain,
      location
    );

    // Score the response – pass llmResponse for citation-based scoring
    const scoringResult = await aiQueryService.scoreResponse(
      phrase.text,
      queryResult.response,
      model,
      targetDomain,
      location,
      queryResult.llmResponse
    );

    // Update the existing AI query result
    const updatedResult = await prisma.aIQueryResult.updateMany({
      where: {
        phraseId: parseInt(phraseId),
        model: model
      },
      data: {
        response: queryResult.response,
        latency: 0,
        cost: queryResult.cost || 0,
        presence: scoringResult.presence,
        relevance: scoringResult.relevance,
        accuracy: scoringResult.accuracy,
        sentiment: scoringResult.sentiment,
        overall: scoringResult.overall,
        competitorNames: scoringResult.competitors?.names,
        competitorMentions: scoringResult.competitors?.mentions,
        competitorCount: scoringResult.competitors?.totalMentions,
        competitorDomains: scoringResult.competitors?.mentions?.map((m: any) => m.domain),
        competitorUrls: scoringResult.competitorUrls,
        competitorMatchScore: scoringResult.competitorMatchScore,
        citations: (scoringResult as any).citations || queryResult.llmResponse?.citations || [],
        searchQueries: (scoringResult as any).searchQueries || queryResult.llmResponse?.searchQueries || [],
        citationStrength: (scoringResult as any).citationStrength || 0,
      }
    });

    if (updatedResult.count === 0) {
      // If no existing result found, create a new one
      await prisma.aIQueryResult.create({
        data: {
          phraseId: parseInt(phraseId),
          model: model,
          response: queryResult.response,
          latency: 0, // Default latency since it's not returned by the service
          cost: queryResult.cost || 0,
          presence: scoringResult.presence,
          relevance: scoringResult.relevance,
          accuracy: scoringResult.accuracy,
          sentiment: scoringResult.sentiment,
          overall: scoringResult.overall,
          // Add competitor fields
          competitorNames: scoringResult.competitors?.names,
          competitorMentions: scoringResult.competitors?.mentions,
          competitorCount: scoringResult.competitors?.totalMentions,
          competitorDomains: scoringResult.competitors?.mentions?.map((m: any) => m.domain),
          competitorUrls: scoringResult.competitorUrls,
          competitorMatchScore: scoringResult.competitorMatchScore
        }
      });
    }

    await advanceTestingForPhrase(parseInt(phraseId));

    // Return the updated result
    const result = await prisma.aIQueryResult.findFirst({
      where: {
        phraseId: parseInt(phraseId),
        model: model
      },
      include: {
        phrase: {
          include: {
            keyword: true
          }
        }
      }
    });

    res.json({
      success: true,
      result: result,
      message: 'Phrase reanalyzed successfully'
    });

  } catch (error) {
    console.error('Error reanalyzing phrase:', error);
    res.status(500).json({ 
      error: 'Failed to reanalyze phrase',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// AI-powered scoring logic with timeout
async function scoreResponseWithAI(phrase: string, response: string, model: string, domain?: string, location?: string, llmResponse?: any) {
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Scoring timeout')), 60000)
  );

  try {
    // Use the simplified AI service scoring – pass llmResponse for citation-based scoring
    const scores = await Promise.race([
      aiQueryService.scoreResponse(phrase, response, model, domain, location, llmResponse),
      timeoutPromise
    ]);

    return scores;

  } catch (error) {
    console.log('AI scoring failed, using basic fallback');
    // Use basic fallback scoring
    return basicFallbackScoring(phrase, response, domain, location);
  }
}

// Enhanced fallback scoring when AI fails - properly handles domain presence
function basicFallbackScoring(phrase: string, response: string, domain?: string, location?: string) {
  const lowerResponse = response.toLowerCase();
  const target = domain ? domain.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '') : '';
  
  let presence = 0;
  let rank = 0;
  let mentions = 0;
  let highlightContext = '';
  let detectionMethod = 'none';
  
  if (target && lowerResponse.includes(target)) {
    presence = 1;
    mentions = 1;
    const index = lowerResponse.indexOf(target);
    rank = Math.ceil((index / response.length) * 10);
    
    const start = Math.max(0, index - 100);
    const end = Math.min(response.length, index + target.length + 100);
    highlightContext = response.substring(start, end);
    detectionMethod = 'text';
  }
  
  // Simple competitor detection
  const urlRegex = /https?:\/\/[^\s\n\)\]}"']+/g;
  const urls = response.match(urlRegex) || [];
  const domains = urls.map(u => {
    try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; }
  }).filter(d => d && d !== target);
  
  const competitors = {
    names: domains.slice(0, 5),
    mentions: domains.slice(0, 5).map((d, i) => ({
      name: d,
      domain: d,
      position: i + 1,
      context: 'neutral',
      sentiment: 'neutral' as const,
      mentionType: 'url' as const
    })),
    totalMentions: domains.length
  };
  
  // CRITICAL: If domain is not present, return all zeros
  if (presence === 0) {
    return {
      presence: 0,
      relevance: 0,
      accuracy: 0,
      sentiment: 0,
      overall: 0,
      domainRank: 0,
      foundDomains: [],
      confidence: 0,
      sources: ['Fallback Analysis'],
      competitorUrls: [],
      competitorMatchScore: 0,
      comprehensiveness: 0,
      context: 'not_found',
      mentions: 0,
      highlightContext: '',
      detectionMethod: 'none',
      competitors
    };
  }
  
  // Domain is present - calculate quality-based scores
  const responseLength = response.length;
  const comprehensiveness = responseLength > 1000 ? 5 : responseLength > 800 ? 4 : responseLength > 600 ? 3 : responseLength > 400 ? 2 : 1;
  
  // Enhanced relevance scoring
  const phraseWords = phrase.toLowerCase().split(/\s+/).filter(word => word.length > 3);
  const responseWords = response.toLowerCase().split(/\s+/);
  const matchedWords = phraseWords.filter(word => responseWords.includes(word));
  const relevance = Math.min(5, Math.max(1, (matchedWords.length / phraseWords.length) * 5));
  
  // Enhanced accuracy based on detection method
  const accuracy = detectionMethod === 'text' ? 3 : 2;
  
  // Enhanced sentiment (neutral for fallback)
  const sentiment = 3;
  
  // Enhanced overall scoring
  const overall = Math.max(1, Math.round((rank / 10) * 5));
  
  return {
    presence,
    relevance,
    accuracy,
    sentiment,
    overall,
    domainRank: rank || undefined,
    foundDomains: [domain || ''],
    confidence: 60,
    sources: ['Fallback Analysis'],
    competitorUrls: domains.slice(0, 5).map(d => `https://${d}`),
    competitorMatchScore: domains.length * 10,
    comprehensiveness,
    context: 'neutral',
    mentions,
    highlightContext,
    detectionMethod,
    competitors
  };
}

// Transform AI response to expected format
function parseAndTransformAIResponse(aiResponse: string) {
  try {
    const analysis = JSON.parse(aiResponse);
    
    // Normalize competitor mentions
    const aiMentions = Array.isArray(analysis?.competitorData?.mentions) ? analysis.competitorData.mentions.map((m: any) => ({
      name: m.name || m.domain || '',
      domain: m.domain || m.name || '',
      position: typeof m.position === 'number' ? m.position : 0,
      context: m.context || '',
      sentiment: (m.sentiment === 'positive' || m.sentiment === 'negative') ? m.sentiment : 'neutral',
      mentionType: (m.mentionType === 'url' || m.mentionType === 'brand') ? m.mentionType : 'text'
    })) : [];

    // Build names from domains/brands if not present
    const aiNames = [
      ...((analysis.competitorData?.domains || []).map((d: any) => d.name || '').filter(Boolean)),
      ...((analysis.competitorData?.brands || []).map((b: any) => b.name || '').filter(Boolean))
    ];

    // Prefer AI-provided highlight from mentionDetails
    const firstMentionText = analysis.domainAnalysis?.mentionDetails?.[0]?.text || '';

    return {
      presence: analysis.finalScores.presence,
      relevance: analysis.contentMetrics.relevanceScore,
      accuracy: analysis.contentMetrics.accuracyScore,
      sentiment: analysis.contentMetrics.sentimentScore,
      overall: analysis.finalScores.overall,
      domainRank: analysis.domainAnalysis.rank,
      foundDomains: Array.isArray(analysis.competitorData?.domains) ? analysis.competitorData.domains.map((d: any) => d.name).filter(Boolean) : [],
      confidence: analysis.domainAnalysis.confidence,
      sources: analysis.contentMetrics.sources,
      competitorUrls: analysis.competitorData.urls,
      competitorMatchScore: 60,
      comprehensiveness: analysis.contentMetrics.comprehensiveness,
      context: analysis.domainAnalysis.context,
      mentions: analysis.domainAnalysis.totalMentions,
      highlightContext: firstMentionText,
      detectionMethod: analysis.domainAnalysis.detectionMethod,
      competitors: {
        names: aiNames,
        mentions: aiMentions,
        totalMentions: analysis.competitorData?.totalCount || aiMentions.length || 0
      }
    };
  } catch (parseError: any) {
    throw new Error(`Failed to parse AI response: ${parseError.message}`);
  }
}

// Simple helper functions
function cleanDomainName(input: string): string {
  return input
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .trim();
}

function extractBrandName(domain: string): string {
  try {
    const cleaned = cleanDomainName(domain);
    return cleaned.split('.')[0] || cleaned;
  } catch {
    return domain || '';
  }
}

// Simple competitor detection from text
function extractCompetitorsFromText(text: string, targetDomain?: string): {
  names: string[];
  mentions: Array<{
    name: string;
    domain: string;
    position: number;
    context: string;
    sentiment: 'positive' | 'neutral' | 'negative';
    mentionType: 'url' | 'text' | 'brand';
  }>;
  totalMentions: number;
} {
  const urlRegex = /https?:\/\/[^\s\n\)\]}"']+/g;
  const urls = text.match(urlRegex) || [];
  const domains = urls.map(u => {
    try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; }
  }).filter(d => d && d !== targetDomain);
  
  const mentions = domains.slice(0, 8).map((d, i) => ({
    name: d,
    domain: d,
    position: i + 1,
    context: 'neutral',
    sentiment: 'neutral' as const,
    mentionType: 'url' as const
  }));
  
  return {
    names: domains.slice(0, 8),
    mentions,
    totalMentions: domains.length
  };
}

async function calculateComprehensiveStats(results: any[], domainId: number) {
  console.log('calculateComprehensiveStats called with results:', results.length, 'items');
  
  const modelStats: Record<string, any> = {};
  let total = 0, presence = 0, relevance = 0, accuracy = 0, sentiment = 0, overall = 0;
  
  // Track competitors and insights
  const competitors = new Map<string, { frequency: number; threatLevel: string; marketShare: number; lastSeen: Date }>();
  const strengths: any[] = [];
  const weaknesses: any[] = [];
  const opportunities: any[] = [];
  const threats: any[] = [];
  
  for (const r of results) {
    // Skip invalid results
    if (!r || !r.model || !r.scores) {
      console.warn('Skipping invalid result:', r);
      continue;
    }
    
    if (!modelStats[r.model]) {
      modelStats[r.model] = { 
        total: 0, 
        presence: 0, 
        relevance: 0, 
        accuracy: 0, 
        sentiment: 0, 
        overall: 0,
        latency: 0,
        cost: 0
      };
    }
    
    // Ensure scores are numbers and handle new scoring system
    const presenceScore = Number(r.scores.presence) || 0;
    const relevanceScore = Number(r.scores.relevance) || 0;
    const accuracyScore = Number(r.scores.accuracy) || 0;
    const sentimentScore = Number(r.scores.sentiment) || 0;
    const overallScore = Number(r.scores.overall) || 0;
    const comprehensivenessScore = Number(r.scores.comprehensiveness) || 0;
    const confidenceScore = Number(r.scores.confidence) || 0;
    
    modelStats[r.model].total++;
    modelStats[r.model].presence += presenceScore;
    modelStats[r.model].relevance += relevanceScore;
    modelStats[r.model].accuracy += accuracyScore;
    modelStats[r.model].sentiment += sentimentScore;
    modelStats[r.model].overall += overallScore;
    modelStats[r.model].comprehensiveness = (modelStats[r.model].comprehensiveness || 0) + comprehensivenessScore;
    modelStats[r.model].confidence = (modelStats[r.model].confidence || 0) + confidenceScore;
    modelStats[r.model].latency += Number(r.latency) || 0;
    modelStats[r.model].cost += Number(r.cost) || 0;
    
    total++;
    presence += presenceScore;
    relevance += relevanceScore;
    accuracy += accuracyScore;
    sentiment += sentimentScore;
    overall += overallScore;
    
    // Track competitors (unchanged logic but with safer parsing already)
    if (r.scores.competitorUrls && Array.isArray(r.scores.competitorUrls)) {
      r.scores.competitorUrls.forEach((url: string) => {
        try {
          const domain = new URL(url).hostname;
          const existing = competitors.get(domain);
          const threatLevel = r.scores.competitorMatchScore > 0.7 ? 'High' : 
                             r.scores.competitorMatchScore > 0.4 ? 'Medium' : 'Low';
          
          if (existing) {
            existing.frequency += 1;
            existing.lastSeen = new Date();
          } else {
            competitors.set(domain, {
              frequency: 1,
              threatLevel,
              marketShare: Math.round((r.scores.competitorMatchScore || 0) * 100),
              lastSeen: new Date()
            });
          }
        } catch (e) {
          console.warn('Invalid competitor URL:', url);
        }
      });
    }
    
    // Generate insights based on scores
    if (relevanceScore >= 4.0) {
      strengths.push({
        area: 'Content Relevance',
        score: Math.round(relevanceScore * 20),
        description: `Strong relevance for "${r.phrase}" - AI models rate this content highly relevant`
      });
    }
    
    if (accuracyScore >= 4.0) {
      strengths.push({
        area: 'Content Accuracy',
        score: Math.round(accuracyScore * 20),
        description: `High accuracy for "${r.phrase}" - Content is rated as trustworthy and accurate`
      });
    }
    
    if (presenceScore < 0.5) {
      weaknesses.push({
        area: 'Domain Visibility',
        score: Math.round(presenceScore * 100),
        description: `Low domain presence for "${r.phrase}" - Domain not appearing in AI responses`
      });
    }
    
    if (overallScore < 2.5) {
      weaknesses.push({
        area: 'Overall Performance',
        score: Math.round(overallScore * 20),
        description: `Poor overall performance for "${r.phrase}" - Multiple metrics need improvement`
      });
    }
    
    if (presenceScore < 0.7 && relevanceScore >= 3.0) {
      opportunities.push({
        area: 'Visibility Improvement',
        potential: '40-60% increase',
        action: `Optimize content for "${r.phrase}" - High relevance but low visibility`
      });
    }
    
    if (relevanceScore < 3.5 && presenceScore > 0.5) {
      opportunities.push({
        area: 'Content Enhancement',
        potential: '25-35% improvement',
        action: `Enhance content relevance for "${r.phrase}" - Visible but needs better relevance`
      });
    }
  }
  
  // Analyze threats from competitors
  const highThreatCompetitors = Array.from(competitors.values()).filter(c => c.threatLevel === 'High');
  if (highThreatCompetitors.length > 0) {
    threats.push({
      area: 'Competitive Pressure',
      risk: `${highThreatCompetitors.length} high-threat competitors identified`,
      mitigation: 'Focus on unique value propositions and niche market positioning'
    });
  }
  
  // Calculate averages for model stats
  Object.keys(modelStats).forEach(model => {
    const stats = modelStats[model];
    if (stats.total > 0) {
      // avgPresence in percent (0-100)
      stats.avgPresence = Math.round((stats.presence / stats.total) * 100);
      // Convert 1-5 scales to percentages (0-100) for UI friendliness
      stats.avgRelevance = Math.round((stats.relevance / stats.total) * 20); // 1-5 scale to 0-100
      stats.avgAccuracy = Math.round((stats.accuracy / stats.total) * 20); // 1-5 scale to 0-100
      stats.avgSentiment = Math.round((stats.sentiment / stats.total) * 20); // 1-5 scale to 0-100
      stats.avgOverall = Math.round((stats.overall / stats.total) * 20); // 1-5 scale to 0-100
      stats.avgComprehensiveness = Math.round((stats.comprehensiveness / stats.total) * 20); // 1-5 scale to 0-100

      stats.avgLatency = Math.round((stats.latency / stats.total) * 100) / 100;
      stats.avgCost = Math.round((stats.cost / stats.total) * 100) / 100;
      stats.avgConfidence = modelStats[model].avgConfidence || 0;
    }
  });
  
  // Save comprehensive data to database (commented out until Prisma models are generated)
  // await saveComprehensiveAnalysis(domainId, { ... })
  
  const stats = {
    models: Object.keys(modelStats).map(model => ({
      model,
      presenceRate: modelStats[model].avgPresence || 0,
      avgRelevance: modelStats[model].avgRelevance || 0,
      avgAccuracy: modelStats[model].avgAccuracy || 0,
      avgSentiment: modelStats[model].avgSentiment || 0,
      avgOverall: modelStats[model].avgOverall || 0,
      avgComprehensiveness: modelStats[model].avgComprehensiveness || 0,
      avgConfidence: modelStats[model].avgConfidence || 0,
      totalQueries: modelStats[model].total || 0
    })),
    overall: {
      presenceRate: total ? Math.round((presence / total) * 100) : 0,
      // 1-5 scales converted to 0-100 for UI
      avgRelevance: total ? Math.round((relevance / total) * 20) : 0,
      avgAccuracy: total ? Math.round((accuracy / total) * 20) : 0,
      avgSentiment: total ? Math.round((sentiment / total) * 20) : 0,
      avgOverall: total ? Math.round((overall / total) * 20) : 0
    },
    totalResults: total,
    competitors: Array.from(competitors.entries()).map(([domain, data]) => ({
      domain,
      ...data
    })),
    insights: { strengths, weaknesses, opportunities, threats }
  };
  
  console.log('Comprehensive stats calculated:', stats);
  console.log('Models in comprehensive stats:', stats.models.map(m => `${m.model}: ${m.totalQueries} queries, ${m.presenceRate}% presence`));
  console.log('All results models:', results.map(r => r.model));
  console.log('Model stats keys:', Object.keys(modelStats));
  return stats;
}

function generateRecommendations(data: any) {
  const recommendations = [];
  
  // Generate recommendations based on insights
  if (data.overall.avgPresence < 50) {
    recommendations.push({
      priority: 'High',
      type: 'Domain Visibility',
      description: 'Improve domain presence in search results by optimizing content for target keywords',
      impact: 'Could increase search visibility by 40-60%'
    });
  }
  
  if (data.overall.avgRelevance < 60) {
    recommendations.push({
      priority: 'High',
      type: 'Content Optimization',
      description: 'Enhance content relevance to better match user search intent',
      impact: 'Expected 25-35% improvement in search rankings'
    });
  }
  
  if (data.overall.avgOverall < 50) {
    recommendations.push({
      priority: 'Medium',
      type: 'Competitive Analysis',
      description: 'Focus on competitor gaps identified in AI analysis',
      impact: 'Potential to capture 15-25% market share in identified niches'
    });
  }
  
  const highThreatCompetitors = data.competitors.filter((c: any) => c.threatLevel === 'High');
  if (highThreatCompetitors.length > 0) {
    recommendations.push({
      priority: 'Medium',
      type: 'Competitive Strategy',
      description: `Address competitive pressure from ${highThreatCompetitors.length} high-threat competitors`,
      impact: 'Focus on unique value propositions and niche positioning'
    });
  }
  
  return recommendations;
}

function calculateStats(results: any[]) {
  console.log('calculateStats called with results:', results.length, 'items');
  
  const modelStats: Record<string, any> = {};
  let total = 0, presence = 0, relevance = 0, accuracy = 0, sentiment = 0, overall = 0;
  
  for (const r of results) {
    // Skip invalid results
    if (!r || !r.model || !r.scores) {
      console.warn('Skipping invalid result:', r);
      continue;
    }
    
    if (!modelStats[r.model]) {
      modelStats[r.model] = { total: 0, presence: 0, relevance: 0, accuracy: 0, sentiment: 0, overall: 0 };
    }
    
    // Ensure scores are numbers
    const presenceScore = Number(r.scores.presence) || 0;
    const relevanceScore = Number(r.scores.relevance) || 0;
    const accuracyScore = Number(r.scores.accuracy) || 0;
    const sentimentScore = Number(r.scores.sentiment) || 0;
    const overallScore = Number(r.scores.overall) || 0;
    
    modelStats[r.model].total++;
    modelStats[r.model].presence += presenceScore;
    modelStats[r.model].relevance += relevanceScore;
    modelStats[r.model].accuracy += accuracyScore;
    modelStats[r.model].sentiment += sentimentScore;
    modelStats[r.model].overall += overallScore;
    
    total++;
    presence += presenceScore;
    relevance += relevanceScore;
    accuracy += accuracyScore;
    sentiment += sentimentScore;
    overall += overallScore;
  }
  
  console.log('Model stats calculated:', modelStats);
  console.log('Total results processed:', total);
  console.log('Model breakdown:', Object.keys(modelStats).map(model => `${model}: ${modelStats[model].total} results`));
  console.log('Raw results models:', results.map(r => r.model));
  
  const stats = {
    models: Object.keys(modelStats).map(model => ({
      model,
      presenceRate: modelStats[model].total ? Math.round((modelStats[model].presence / modelStats[model].total) * 100) : 0,
      avgRelevance: modelStats[model].total ? Math.round((modelStats[model].relevance / modelStats[model].total) * 20) : 0,
      avgAccuracy: modelStats[model].total ? Math.round((modelStats[model].accuracy / modelStats[model].total) * 20) : 0,
      avgSentiment: modelStats[model].total ? Math.round((modelStats[model].sentiment / modelStats[model].total) * 20) : 0,
              avgOverall: modelStats[model].total ? Math.round((modelStats[model].overall / modelStats[model].total) * 20) : 0
    })),
    overall: {
      presenceRate: total ? Math.round((presence / total) * 100) : 0,
      avgRelevance: total ? Math.round((relevance / total) * 20) : 0,
      avgAccuracy: total ? Math.round((accuracy / total) * 20) : 0,
      avgSentiment: total ? Math.round((sentiment / total) * 20) : 0,
      avgOverall: total ? Math.round((overall / total) * 20) : 0
    },
    totalResults: total
  };
  
  console.log('Final stats:', stats);
  return stats;
}

// Add this function after the existing helper functions and before processQueryBatch
async function checkPhraseCompletion(phraseId: number): Promise<{ isComplete: boolean; existingModels: string[] }> {
  try {
    // Get all existing AI query results for this phrase
    const existingResults = await prisma.aIQueryResult.findMany({
      where: { phraseId },
      select: { model: true }
    });

    const existingModels = existingResults.map(result => result.model);
    
    // Check if we have results from all three AI models
    const requiredModels = ['GPT-4o', 'Claude 3', 'Gemini 1.5'];
    const isComplete = requiredModels.every(model => existingModels.includes(model));
    
    return { isComplete, existingModels };
  } catch (error) {
    console.error('Error checking phrase completion:', error);
    return { isComplete: false, existingModels: [] };
  }
}

// Process queries in batches to avoid overwhelming the system
async function processQueryBatch(
  queries: any[], 
  batchSize: number, 
  res: any, 
  allResults: any[], 
  completedQueries: { current: number }, 
  totalQueries: number,
  domain?: string,
  context?: string,
  location?: string
) {
  const batches = [];
  for (let i = 0; i < queries.length; i += batchSize) {
    batches.push(queries.slice(i, i + batchSize));
  }

  // Track processed queries to prevent duplicates
  const processedQueries = new Set<string>();

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    
    // Send batch progress update with realistic messaging
    res.write(`event: progress\ndata: ${JSON.stringify({ message: `Processing batch ${batchIndex + 1}/${batches.length} - Analyzing ${batch.length} phrases with AI models for domain visibility...` })}\n\n`);
    
    // Process each batch in parallel with realistic timing
    const batchPromises = batch.map(async (query) => {
      // Check if we should use fallback models due to frequent timeouts
      const domainKey = `domain-${query.domainId}`;
      const timeoutCount = timeoutTracker.get(domainKey) || 0;
      const modelsToUse = timeoutCount >= TIMEOUT_THRESHOLD ? FALLBACK_MODELS : AI_MODELS;
      
      if (timeoutCount >= TIMEOUT_THRESHOLD) {
        console.log(`Using fallback models for domain ${query.domainId} due to ${timeoutCount} timeouts`);
        res.write(`event: progress\ndata: ${JSON.stringify({ message: `Using fallback models due to frequent timeouts - continuing analysis...` })}\n\n`);
      }
      
      // Find the phrase record first to check completion
      const keywordRecord = await prisma.keyword.findFirst({
        where: { 
          term: query.keyword, 
          domainId: query.domainId
        },
      });
      
      let phraseRecord = null;
      if (keywordRecord) {
        phraseRecord = await prisma.generatedIntentPhrase.findFirst({
          where: { phrase: query.phrase, keywordId: keywordRecord.id, domainId: query.domainId },
        });
      }
      
      // Check if phrase already has responses from all three models
      if (phraseRecord) {
        const { isComplete, existingModels } = await checkPhraseCompletion(phraseRecord.id);
        
        if (isComplete) {
          console.log(`Skipping phrase "${query.phrase}" - already has responses from all three models: ${existingModels.join(', ')}`);
          res.write(`event: progress\ndata: ${JSON.stringify({ message: `Skipping "${query.phrase}" - already analyzed with all AI models` })}\n\n`);
          
          // Get existing results for this phrase and add them to allResults
          const existingResults = await prisma.aIQueryResult.findMany({
            where: { phraseId: phraseRecord.id },
            include: {
              phrase: {
                include: {
                  keyword: {
                    select: { term: true }
                  }
                }
              }
            }
          });
          
          // Convert existing results to the expected format and add to allResults
          existingResults.forEach(existingResult => {
            const result = {
              ...query,
              model: existingResult.model,
              response: existingResult.response,
              latency: existingResult.latency,
              cost: existingResult.cost,
              progress: 100,
              scores: {
                presence: existingResult.presence,
                relevance: existingResult.relevance,
                accuracy: existingResult.accuracy,
                sentiment: existingResult.sentiment,
                overall: existingResult.overall,
                domainRank: existingResult.domainRank || undefined,
                foundDomains: (existingResult as any).foundDomains || undefined,
                confidence: (existingResult as any).confidence || undefined,
                sources: (existingResult as any).sources || undefined,
                competitorUrls: (existingResult as any).competitorUrls || undefined,
                competitorMatchScore: (existingResult as any).competitorMatchScore || undefined,
                comprehensiveness: (existingResult as any).comprehensiveness || undefined,
                context: (existingResult as any).context || undefined,
                mentions: (existingResult as any).mentions || undefined,
                highlightContext: (existingResult as any).highlightContext || undefined,
                detectionMethod: (existingResult as any).detectionMethod || undefined,
                competitors: {
                  names: (existingResult as any).competitorNames || [],
                  mentions: Array.isArray((existingResult as any).competitorMentions) ? (existingResult as any).competitorMentions.map((mention: any) => ({
                    name: mention.name || mention.domain || '',
                    domain: mention.domain || mention.name || '',
                    position: mention.position || 0,
                    context: mention.context || '',
                    sentiment: mention.sentiment || 'neutral',
                    mentionType: mention.mentionType || 'text'
                  })) : [],
                  totalMentions: typeof (existingResult as any).competitorCount === 'number' ? (existingResult as any).competitorCount : ((existingResult as any).competitorMentions ? (existingResult as any).competitorMentions.length : 0)
                }
              },
              aiQueryResultId: existingResult.id,
              phraseId: phraseRecord.id
            };
            
            allResults.push(result);
            res.write(`event: result\ndata: ${JSON.stringify(result)}\n\n`);
          });
          
          completedQueries.current += existingResults.length;
          return null; // Skip processing this phrase
        }
      }
      
      const modelPromises = modelsToUse.map(async (model) => {
        const startTime = Date.now();
        
        // Create unique identifier for this query to prevent duplicates
        const queryId = `${query.phrase}-${model}-${query.keyword}`;
        
        // Check if already processed
        if (processedQueries.has(queryId)) {
          console.warn(`Duplicate query detected: ${queryId}`);
          return null;
        }
        
        // If phrase record exists, check if this specific model already has a result
        if (phraseRecord) {
          const existingResult = await prisma.aIQueryResult.findFirst({
            where: { 
              phraseId: phraseRecord.id,
              model: model
            }
          });
          
          if (existingResult) {
            console.log(`Skipping "${query.phrase}" with ${model} - result already exists`);
            res.write(`event: progress\ndata: ${JSON.stringify({ message: `Skipping ${model} for "${query.phrase}" - result already exists` })}\n\n`);
            
            // Add existing result to allResults
            const result = {
              ...query,
              model: existingResult.model,
              response: existingResult.response,
              latency: existingResult.latency,
              cost: existingResult.cost,
              progress: 100,
              scores: {
                presence: existingResult.presence,
                relevance: existingResult.relevance,
                accuracy: existingResult.accuracy,
                sentiment: existingResult.sentiment,
                overall: existingResult.overall,
                domainRank: existingResult.domainRank || undefined,
                foundDomains: (existingResult as any).foundDomains || undefined,
                confidence: (existingResult as any).confidence || undefined,
                sources: (existingResult as any).sources || undefined,
                competitorUrls: (existingResult as any).competitorUrls || undefined,
                competitorMatchScore: (existingResult as any).competitorMatchScore || undefined,
                comprehensiveness: (existingResult as any).comprehensiveness || undefined,
                context: (existingResult as any).context || undefined,
                mentions: (existingResult as any).mentions || undefined,
                highlightContext: (existingResult as any).highlightContext || undefined,
                detectionMethod: (existingResult as any).detectionMethod || undefined,
                competitors: {
                  names: (existingResult as any).competitorNames || [],
                  mentions: Array.isArray((existingResult as any).competitorMentions) ? (existingResult as any).competitorMentions.map((mention: any) => ({
                    name: mention.name || mention.domain || '',
                    domain: mention.domain || mention.name || '',
                    position: mention.position || 0,
                    context: mention.context || '',
                    sentiment: mention.sentiment || 'neutral',
                    mentionType: mention.mentionType || 'text'
                  })) : [],
                  totalMentions: typeof (existingResult as any).competitorCount === 'number' ? (existingResult as any).competitorCount : ((existingResult as any).competitorMentions ? (existingResult as any).competitorMentions.length : 0)
                }
              },
              // Add competitor data at the top level for easy access
              competitors: {
                names: (existingResult as any).competitorNames || [],
                mentions: Array.isArray((existingResult as any).competitorMentions) ? (existingResult as any).competitorMentions.map((mention: any) => ({
                  name: mention.name || mention.domain || '',
                  domain: mention.domain || mention.name || '',
                  position: mention.position || 0,
                  context: mention.context || '',
                  sentiment: mention.sentiment || 'neutral',
                  mentionType: mention.mentionType || 'text'
                })) : [],
                totalMentions: typeof (existingResult as any).competitorCount === 'number' ? (existingResult as any).competitorCount : ((existingResult as any).competitorMentions ? (existingResult as any).competitorMentions.length : 0)
              },
              aiQueryResultId: existingResult.id,
              phraseId: phraseRecord.id
            };
            
            allResults.push(result);
            res.write(`event: result\ndata: ${JSON.stringify(result)}\n\n`);
            completedQueries.current++;
            return null; // Skip processing this model
          }
        }
        
        try {
          console.log(`Processing query "${query.phrase}" with model: ${model}`);
          console.log(`Models to use: ${modelsToUse.join(', ')}`);
          console.log(`Model being processed: ${model}`);
          
          // Send individual query progress with realistic messaging
          res.write(`event: progress\ndata: ${JSON.stringify({ message: `Querying ${model} for "${query.phrase}" - Generating comprehensive search response...` })}\n\n`);
          
          // Get AI response with REAL LLM web search (increased timeout for real search)
          const queryPromise = aiQueryService.query(query.phrase, model, domain, location);
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Query timeout - AI model taking too long to respond')), 45000) // 45s for real web search
          );

          const { response, cost, llmResponse: queryLlmResponse } = await Promise.race([queryPromise, timeoutPromise]);
          const latency = (Date.now() - startTime) / 1000;

          // Send scoring progress with realistic messaging
          res.write(`event: progress\ndata: ${JSON.stringify({ message: `Evaluating ${model} response for "${query.phrase}" - Analyzing domain presence and SEO ranking potential...` })}\n\n`);

          // Score the response – pass llmResponse for citation-based scoring
          const scores = await scoreResponseWithAI(query.phrase, response, model, domain, location, queryLlmResponse) as {
            presence: number;
            relevance: number;
            accuracy: number;
            sentiment: number;
            overall: number;
            domainRank?: number;
            foundDomains?: string[];
            confidence: number;
            sources: string[];
            competitorUrls: string[];
            competitorMatchScore: number;
            comprehensiveness: number;
            context: string;
            mentions: number;
            highlightContext: string;
            detectionMethod: string;
            competitors?: {
              names: string[];
              mentions: any[];
              totalMentions: number;
            };
            citations?: any[];
            searchQueries?: string[];
          };

          // Enforce new policy strictly: overall already reflects presence/rank; no post-adjustment

          completedQueries.current++;
          const progress = (completedQueries.current / totalQueries) * 100;

          // Save AIQueryResult to DB if phraseRecord found
          let aiQueryResultRecord = null;
          if (phraseRecord) {
            aiQueryResultRecord = await prisma.aIQueryResult.create({
              data: {
                phraseId: phraseRecord.id,
                model, // This preserves the display name: 'GPT-4o', 'Claude 3', or 'Gemini 1.5'
                response,
                latency,
                cost,
                presence: scores.presence,
                relevance: scores.relevance,
                accuracy: scores.accuracy,
                sentiment: scores.sentiment,
                overall: scores.overall,
                confidence: scores.confidence,
                domainRank: scores.domainRank,
                foundDomains: scores.foundDomains,
                sources: scores.sources,
                competitorUrls: scores.competitorUrls,
                competitorMatchScore: scores.competitorMatchScore,
                comprehensiveness: scores.comprehensiveness,
                context: scores.context,
                mentions: scores.mentions,
                highlightContext: scores.highlightContext,
                detectionMethod: scores.detectionMethod,
                // Persist competitor fields for reports and cached loads
                competitorNames: scores.competitors?.names,
                competitorMentions: scores.competitors?.mentions,
                competitorCount: scores.competitors?.totalMentions,
                competitorDomains: scores.competitors?.mentions?.map((m: any) => m.domain),
                // Real citation data from LLM web search
                citations: (scores as any).citations || queryLlmResponse?.citations || [],
                searchQueries: (scores as any).searchQueries || queryLlmResponse?.searchQueries || [],
                citationStrength: (scores as any).citationStrength || 0,
              }
            });
            await advanceTestingForPhrase(phraseRecord.id);
          }

          // Ensure scores object includes competitors field
          const scoresWithCompetitors = {
            ...scores,
            competitors: {
              names: scores.competitors?.names || [],
              mentions: Array.isArray(scores.competitors?.mentions) ? scores.competitors.mentions.map((mention: any) => ({
                name: mention.name || mention.domain || '',
                domain: mention.domain || mention.name || '',
                position: mention.position || 0,
                context: mention.context || '',
                sentiment: mention.sentiment || 'neutral',
                mentionType: mention.mentionType || 'text'
              })) : [],
              totalMentions: scores.competitors?.totalMentions || 0
            }
          };

          const result = {
            ...query,
            model, // This is the display name: 'GPT-4o', 'Claude 3', or 'Gemini 1.5'
            response,
            latency: Number(latency),
            cost: Number(cost),
            progress,
            scores: scoresWithCompetitors,
            domainRank: scores.domainRank,
            foundDomains: scores.foundDomains,
            confidence: scores.confidence,
            sources: scores.sources,
            competitorUrls: scores.competitorUrls,
            competitorMatchScore: scores.competitorMatchScore,
            // Add competitor data at the top level for easy access
            competitors: scoresWithCompetitors.competitors,
            // Real citations from LLM web search
            citations: (scores as any).citations || queryLlmResponse?.citations || [],
            searchQueries: (scores as any).searchQueries || queryLlmResponse?.searchQueries || [],
            aiQueryResultId: aiQueryResultRecord ? aiQueryResultRecord.id : undefined,
            phraseId: phraseRecord ? phraseRecord.id : undefined
          };
          
          console.log(`Sending result with model: ${model} for phrase: "${query.phrase}"`);
          console.log(`Model mapping: ${model} -> Frontend will map to: ${model === 'GPT-4o' ? 'chatgpt' : model === 'Claude 3' ? 'claude' : 'gemini'}`);
          console.log(`Competitor data being sent:`, {
            names: scores.competitors?.names,
            mentions: scores.competitors?.mentions,
            totalMentions: scores.competitors?.totalMentions
          });
          
          // Mark as processed
          processedQueries.add(queryId);
          
          allResults.push(result);
          res.write(`event: result\ndata: ${JSON.stringify(result)}\n\n`);

          return result;
        } catch (err: any) {
          console.error(`Failed for "${query.phrase}" with ${model}:`, err.message);
          
          // Handle timeout errors more gracefully - don't send error event, just log and continue
          if (err.message.includes('timeout') || err.message.includes('taking too long')) {
            console.warn(`Timeout for "${query.phrase}" with ${model} - continuing with other models`);
            
            // Track timeout for this domain
            const domainKey = `domain-${query.domainId}`;
            const currentTimeouts = timeoutTracker.get(domainKey) || 0;
            timeoutTracker.set(domainKey, currentTimeouts + 1);
            
            // Send a progress message instead of error to keep the stream alive
            res.write(`event: progress\ndata: ${JSON.stringify({ message: `${model} timeout for "${query.phrase}" - continuing with other models...` })}\n\n`);
          } else {
            // For non-timeout errors, send error event
            res.write(`event: error\ndata: ${JSON.stringify({ error: `Failed to process "${query.phrase}" with ${model}: ${err.message}` })}\n\n`);
          }
          return null;
        }
      });

      // Wait for all models to complete for this query, but continue even if some fail
      const modelResults = await Promise.allSettled(modelPromises);
      
      // Log success/failure rates for this query
      const successfulModels = modelResults.filter(result => result.status === 'fulfilled' && result.value !== null).length;
      const totalModels = modelsToUse.length; // Use modelsToUse here
      
      if (successfulModels < totalModels) {
        console.log(`Query "${query.phrase}" completed with ${successfulModels}/${totalModels} models successful`);
      }
    });

    // Wait for current batch to complete before moving to next
    await Promise.allSettled(batchPromises);
    
    // Send updated stats after each batch with realistic messaging
    const stats = calculateStats(allResults);
    res.write(`event: stats\ndata: ${JSON.stringify(stats)}\n\n`);
    
    // Add realistic delay between batches to simulate processing
    if (batchIndex < batches.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
}

// Utility function to wrap async route handlers
function asyncHandler(fn: any) {
  return (req: Request, res: Response, next: any) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// POST /api/ai-queries/analyze - Analyze a single phrase with AI
router.post('/analyze', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { phrase, domainId, keyword, forceReanalysis = false } = req.body;

    if (!phrase || !domainId) {
      return res.status(400).json({ error: 'Phrase and domainId are required' });
    }

    // Check domain ownership
    const domain = await prisma.domain.findUnique({
      where: { id: parseInt(domainId) },
      select: { url: true, userId: true, location: true }
    });

    if (!domain) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    if (domain.userId !== req.user.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    console.log(`Analyzing phrase "${phrase}" for domain ${domainId}`);

    // Find or create the phrase
    let phraseRecord = await prisma.generatedIntentPhrase.findFirst({
      where: {
        phrase: phrase,
        domainId: parseInt(domainId)
      }
    });

    if (!phraseRecord) {
      // Find the keyword first
      const keywordRecord = await prisma.keyword.findFirst({
        where: {
          term: keyword,
          domainId: parseInt(domainId)
        }
      });

      if (!keywordRecord) {
        return res.status(404).json({ error: 'Keyword not found' });
      }

      // Create the phrase
      phraseRecord = await prisma.generatedIntentPhrase.create({
        data: {
          phrase: phrase,
          keywordId: keywordRecord.id,
          domainId: parseInt(domainId),
          isSelected: false
        }
      });
    }

    // Check for existing analysis (caching for reanalysis)
    if (!forceReanalysis) {
      const existingResult = await prisma.aIQueryResult.findFirst({
        where: {
          phraseId: phraseRecord.id,
          model: 'GPT-4o'
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      if (existingResult) {
        console.log(`Using cached analysis for phrase "${phrase}"`);
        return res.json({
          success: true,
          result: {
            id: existingResult.id,
            model: existingResult.model,
            response: existingResult.response,
            latency: existingResult.latency,
            cost: existingResult.cost,
            scores: {
              presence: existingResult.presence,
              relevance: existingResult.relevance,
              accuracy: existingResult.accuracy,
              sentiment: existingResult.sentiment,
              overall: existingResult.overall,
              domainRank: existingResult.domainRank,
              foundDomains: existingResult.foundDomains,
              sources: existingResult.sources,
              competitorUrls: existingResult.competitorUrls,
              competitorMatchScore: existingResult.competitorMatchScore,
              comprehensiveness: existingResult.comprehensiveness,
              context: existingResult.context,
              mentions: existingResult.mentions,
              highlightContext: existingResult.highlightContext,
              detectionMethod: existingResult.detectionMethod,
              domainSentiment: existingResult.domainSentiment,
              aiConfidence: existingResult.aiConfidence,
              rankingFactors: existingResult.rankingFactors,
              competitors: {
                names: existingResult.competitorNames,
                mentions: existingResult.competitorMentions,
                totalMentions: existingResult.competitorCount
              }
            },
            cached: true
          }
        });
      }
    }

    // Analyze with AI using enhanced intelligent scoring
    const aiQuery = await aiQueryService.query(phrase, 'GPT-4o', domain.url, domain.location || undefined);
    const scores = await aiQueryService.scoreResponse(phrase, aiQuery.response, 'GPT-4o', domain.url, domain.location || undefined);
    
    const result = {
      model: 'GPT-4o',
      response: aiQuery.response,
      latency: 0, // Optionally calculate if needed
      cost: aiQuery.cost,
      scores
    };

    // Save the result with enhanced intelligent scoring data
    const aiResult = await prisma.aIQueryResult.create({
      data: {
        phraseId: phraseRecord.id,
        model: result.model,
        response: result.response,
        latency: result.latency,
        cost: result.cost,
        presence: result.scores.presence,
        relevance: result.scores.relevance,
        accuracy: result.scores.accuracy,
        sentiment: result.scores.sentiment,
        overall: result.scores.overall,
        domainRank: result.scores.domainRank,
        foundDomains: result.scores.foundDomains,
        sources: result.scores.sources,
        competitorUrls: result.scores.competitorUrls,
        competitorMatchScore: result.scores.competitorMatchScore,
        comprehensiveness: result.scores.comprehensiveness,
        context: result.scores.context,
        mentions: result.scores.mentions,
        highlightContext: result.scores.highlightContext,
        detectionMethod: result.scores.detectionMethod,
        // Enhanced intelligent scoring fields
        domainSentiment: result.scores.domainSentiment,
        aiConfidence: result.scores.aiConfidence,
        rankingFactors: result.scores.rankingFactors,
        positionScore: result.scores.rankingFactors?.position,
        prominenceScore: result.scores.rankingFactors?.prominence,
        contextQualityScore: result.scores.rankingFactors?.contextQuality,
        mentionTypeScore: result.scores.rankingFactors?.mentionType,
        intelligentScore: result.scores.overall * 20, // Convert to 0-100 scale
        // Enhanced competitor detection fields
        competitorNames: result.scores.competitors?.names,
        competitorMentions: result.scores.competitors?.mentions,
        competitorCount: result.scores.competitors?.totalMentions,
        competitorDomains: result.scores.competitors?.mentions?.map(m => m.domain)
      }
    });

    await advanceTestingForPhrase(phraseRecord.id);

    console.log(`Analysis completed for phrase "${phrase}" with intelligent scoring`);
    res.json({
      success: true,
      result: {
        id: aiResult.id,
        model: result.model,
        response: result.response,
        latency: result.latency,
        cost: result.cost,
        scores: {
          presence: result.scores.presence,
          relevance: result.scores.relevance,
          accuracy: result.scores.accuracy,
          sentiment: result.scores.sentiment,
          overall: result.scores.overall,
          domainRank: result.scores.domainRank,
          foundDomains: result.scores.foundDomains,
          sources: result.scores.sources,
          competitorUrls: result.scores.competitorUrls,
          competitorMatchScore: result.scores.competitorMatchScore,
          comprehensiveness: result.scores.comprehensiveness,
          context: result.scores.context,
          mentions: result.scores.mentions,
          highlightContext: result.scores.highlightContext,
          detectionMethod: result.scores.detectionMethod,
          domainSentiment: result.scores.domainSentiment,
          aiConfidence: result.scores.aiConfidence,
          rankingFactors: result.scores.rankingFactors,
          competitors: result.scores.competitors
        },
        cached: false
      }
    });
  } catch (error) {
    console.error('Error analyzing phrase:', error);
    res.status(500).json({ error: 'Failed to analyze phrase' });
  }
}));

// POST /api/ai-queries/batch-analyze - Analyze multiple phrases
router.post('/batch-analyze', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { phrases, domainId } = req.body;

    if (!phrases || !Array.isArray(phrases) || !domainId) {
      return res.status(400).json({ error: 'Phrases array and domainId are required' });
    }

    // Check domain ownership
    const domain = await prisma.domain.findUnique({
      where: { id: parseInt(domainId) },
      select: { url: true, userId: true, location: true }
    });

    if (!domain) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    if (domain.userId !== req.user.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    console.log(`Batch analyzing ${phrases.length} phrases for domain ${domainId}`);

    const results = [];
    const errors = [];

    for (const phraseData of phrases) {
      try {
        const { phrase, keyword } = phraseData;

        // Find or create the phrase
        let phraseRecord = await prisma.generatedIntentPhrase.findFirst({
          where: {
            phrase: phrase,
            domainId: parseInt(domainId)
          }
        });

        if (!phraseRecord) {
          // Find the keyword first
          const keywordRecord = await prisma.keyword.findFirst({
            where: {
              term: keyword,
              domainId: parseInt(domainId)
            }
          });

          if (!keywordRecord) {
            errors.push({ phrase, error: 'Keyword not found' });
            continue;
          }

          // Create the phrase
          phraseRecord = await prisma.generatedIntentPhrase.create({
            data: {
              phrase: phrase,
              keywordId: keywordRecord.id,
              domainId: parseInt(domainId),
              isSelected: false
            }
          });
        }

        // Analyze with AI
        const aiQuery = await aiQueryService.query(phrase, 'GPT-4o', domain.url, domain.location || undefined);
        const scores = await aiQueryService.scoreResponse(phrase, aiQuery.response, 'GPT-4o', domain.url, domain.location || undefined);
        const result = {
          model: 'GPT-4o',
          response: aiQuery.response,
          latency: 0, // Optionally calculate if needed
          cost: aiQuery.cost,
          scores
        };

        // Save the result (with enhanced competitor fields)
        const aiResult = await prisma.aIQueryResult.create({
          data: {
            phraseId: phraseRecord.id,
            model: result.model,
            response: result.response,
            latency: result.latency,
            cost: result.cost,
            presence: result.scores.presence,
            relevance: result.scores.relevance,
            accuracy: result.scores.accuracy,
            sentiment: result.scores.sentiment,
            overall: result.scores.overall,

            domainRank: result.scores.domainRank,
            foundDomains: result.scores.foundDomains,
            sources: result.scores.sources,
            competitorUrls: result.scores.competitorUrls,
            competitorMatchScore: result.scores.competitorMatchScore,
            comprehensiveness: result.scores.comprehensiveness,
            context: result.scores.context,
            mentions: result.scores.mentions,
            highlightContext: result.scores.highlightContext,
            detectionMethod: result.scores.detectionMethod,
            // Enhanced intelligent scoring fields
            domainSentiment: result.scores.domainSentiment,
            aiConfidence: result.scores.aiConfidence,
            rankingFactors: result.scores.rankingFactors,
            positionScore: result.scores.rankingFactors?.position,
            prominenceScore: result.scores.rankingFactors?.prominence,
            contextQualityScore: result.scores.rankingFactors?.contextQuality,
            mentionTypeScore: result.scores.rankingFactors?.mentionType,
            intelligentScore: result.scores.overall * 20,
            // Enhanced competitor detection fields
            competitorNames: result.scores.competitors?.names,
            competitorMentions: result.scores.competitors?.mentions,
            competitorCount: result.scores.competitors?.totalMentions,
            competitorDomains: result.scores.competitors?.mentions?.map(m => m.domain)
          }
        });

        await advanceTestingForPhrase(phraseRecord.id);

        results.push({
          phrase,
          keyword,
          result: aiResult
        });
      } catch (error) {
        console.error(`Error analyzing phrase "${phraseData.phrase}":`, error);
        if (error instanceof Error) {
          errors.push({ phrase: phraseData.phrase, error: error.message });
        } else {
          errors.push({ phrase: phraseData.phrase, error: String(error) });
        }
      }
    }

    console.log(`Batch analysis completed: ${results.length} successful, ${errors.length} failed`);
    res.json({
      success: true,
      results,
      errors,
      summary: {
        total: phrases.length,
        successful: results.length,
        failed: errors.length
      }
    });
  } catch (error) {
    console.error('Error in batch analysis:', error);
    res.status(500).json({ error: 'Failed to perform batch analysis' });
  }
}));

// GET /api/ai-queries/debug/:domainId - Debug endpoint to test database
router.get('/debug/:domainId', authenticateToken, asyncHandler(async (req: Request, res: Response) => {
  try {
    const { domainId } = req.params;
    
    console.log('AI Query Debug - Testing database for domain:', domainId);
    
    // Test 1: Check if domain exists
    const domain = await prisma.domain.findUnique({
      where: { id: parseInt(domainId) }
    });
    
    if (!domain) {
      return res.json({ 
        success: false, 
        error: 'Domain not found',
        domainId: parseInt(domainId)
      });
    }
    
    // Test 2: Check if there are any AI query results
    const resultCount = await prisma.aIQueryResult.count({
      where: {
        phrase: {
          domainId: parseInt(domainId)
        }
      }
    });
    
    // Test 3: Try to get one result without relations
    const oneResult = await prisma.aIQueryResult.findFirst({
      where: {
        phrase: {
          domainId: parseInt(domainId)
        }
      }
    });
    
    // Test 4: Try to get results with relations (this is where the error might be)
    let relationTest = null;
    try {
      relationTest = await prisma.aIQueryResult.findFirst({
        where: {
          phrase: {
            domainId: parseInt(domainId)
          }
        },
        include: {
          phrase: {
            include: {
              keyword: {
                select: {
                  term: true
                }
              }
            }
          }
        }
      });
    } catch (relationError) {
      relationTest = {
        error: relationError instanceof Error ? relationError.message : String(relationError)
      };
    }
    
    res.json({
      success: true,
      domain: {
        id: domain.id,
        url: domain.url,
        userId: domain.userId
      },
      resultCount,
      hasResults: resultCount > 0,
      sampleResult: oneResult ? {
        id: oneResult.id,
        model: oneResult.model,
        phraseId: oneResult.phraseId
      } : null,
      relationTest
    });
  } catch (error) {
    console.error('AI Query Debug - Error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Debug failed',
      details: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
  }
}));

// GET /api/ai-queries/test/:domainId - Test endpoint to check basic functionality
router.get('/test/:domainId', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { domainId } = req.params;
    
    console.log('AI Query Test - Testing basic functionality for domain:', domainId);
    
    // Test 1: Check if domain exists
    const domain = await prisma.domain.findUnique({
      where: { id: parseInt(domainId) }
    });
    
    if (!domain) {
      return res.json({ 
        success: false, 
        error: 'Domain not found',
        domainId: parseInt(domainId)
      });
    }
    
    // Test 2: Check if there are any AI query results
    const resultCount = await prisma.aIQueryResult.count({
      where: {
        phrase: {
          domainId: parseInt(domainId)
        }
      }
    });
    
    // Test 3: Try to get one result without relations
    const oneResult = await prisma.aIQueryResult.findFirst({
      where: {
        phrase: {
          domainId: parseInt(domainId)
        }
      }
    });
    
    res.json({
      success: true,
      domain: {
        id: domain.id,
        url: domain.url,
        userId: domain.userId
      },
      resultCount,
      hasResults: resultCount > 0,
      sampleResult: oneResult ? {
        id: oneResult.id,
        model: oneResult.model,
        phraseId: oneResult.phraseId
      } : null
    });
  } catch (error) {
    console.error('AI Query Test - Error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Test failed',
      details: error instanceof Error ? error.message : String(error)
    });
  }
}));

// GET /api/ai-queries/results/:domainId - Get AI query results for a domain
router.get('/results/:domainId', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { domainId } = req.params;
    const { keyword, limit = 50, offset = 0 } = req.query;

    console.log('AI Query Results - Request details:', {
      domainId,
      keyword,
      limit,
      offset,
      userId: req.user?.userId,
      userEmail: req.user?.email
    });

    // Check domain ownership
    const domain = await prisma.domain.findUnique({
      where: { id: parseInt(domainId) }
    });

    console.log('AI Query Results - Domain lookup result:', {
      domainFound: !!domain,
      domainUserId: domain?.userId,
      requestUserId: req.user?.userId
    });

    if (!domain) {
      console.log('AI Query Results - Domain not found for ID:', domainId);
      return res.status(404).json({ error: 'Domain not found' });
    }

    // Check if domain has a userId (some domains might not be associated with users)
    if (domain.userId && domain.userId !== req.user.userId) {
      console.log('AI Query Results - Access denied:', {
        domainUserId: domain.userId,
        requestUserId: req.user.userId
      });
      return res.status(403).json({ error: 'Access denied' });
    }

    // Build where clause
    const whereClause: any = {
      phrase: {
        domainId: parseInt(domainId)
      }
    };

    if (keyword) {
      whereClause.phrase.keyword = {
        term: keyword
      };
    }

    console.log('AI Query Results - Query where clause:', whereClause);

    // First, let's check if there are any AI query results for this domain at all
    const basicResults = await prisma.aIQueryResult.findMany({
      where: {
        phrase: {
          domainId: parseInt(domainId)
        }
      },
      take: 5
    });

    console.log('AI Query Results - Basic query found:', basicResults.length, 'results');

    // Get results with pagination
    let results;
    let totalCount;
    
    try {
      // Try the full query with relations first
      results = await prisma.aIQueryResult.findMany({
        where: whereClause,
        include: {
          phrase: {
            include: {
              keyword: {
                select: {
                  term: true
                }
              }
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        },
        take: parseInt(limit as string),
        skip: parseInt(offset as string)
      });

      // Get total count
      totalCount = await prisma.aIQueryResult.count({
        where: whereClause
      });
    } catch (queryError) {
      console.error('AI Query Results - Query error with relations:', {
        error: queryError instanceof Error ? queryError.message : String(queryError),
        stack: queryError instanceof Error ? queryError.stack : undefined,
        whereClause
      });
      
      // Fallback to basic query without relations
      try {
        results = await prisma.aIQueryResult.findMany({
          where: {
            phrase: {
              domainId: parseInt(domainId)
            }
          },
          orderBy: {
            createdAt: 'desc'
          },
          take: parseInt(limit as string),
          skip: parseInt(offset as string)
        });

        totalCount = await prisma.aIQueryResult.count({
          where: {
            phrase: {
              domainId: parseInt(domainId)
            }
          }
        });
        
        console.log('AI Query Results - Fallback query successful:', results.length, 'results');
      } catch (fallbackError) {
        console.error('AI Query Results - Fallback query also failed:', {
          error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
        });
        throw fallbackError;
      }
    }

    console.log(`AI Query Results - Retrieved ${results.length} results for domain ${domainId}, total: ${totalCount}`);
    
    // Debug: Check what competitor data exists in raw results
    console.log('Raw competitor data in results:', results.slice(0, 2).map(r => ({
      id: r.id,
      competitorNames: (r as any).competitorNames,
      competitorMentions: (r as any).competitorMentions,
      competitorCount: (r as any).competitorCount
    })));
    
    // Transform and ENRICH results with evidence extracted from stored responses
    const transformedResults = results.map(result => {
      const r: any = result as any;
      const phraseText: string = r?.phrase?.phrase || '';
      const keywordTerm: string = r?.phrase?.keyword?.term || 'Unknown';
      const domainUrl = (domain?.url || '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '');

      // Heuristic derivations from response text (used only as fallback)
      let derivedDomainRank = 0;
      let derivedFoundDomains: string[] = [];
      let derivedConfidence = 60;
      let derivedSources: string[] = [];
      let derivedCompetitorUrls: string[] = [];
      let derivedCompetitorMatchScore = 0;
      let derivedCompetitorNames: string[] = [];
      let derivedCompetitorMentions: Array<{
        name: string;
        domain: string;
        position: number;
        context: string;
        sentiment: 'positive' | 'neutral' | 'negative';
        mentionType: 'url' | 'text' | 'brand';
      }> = [];
      
      try {
        const text = result.response || '';
        const urlRegex = /https?:\/\/[^\s\n\)\]}"']+/g;
        const urls = text.match(urlRegex) || [];
        const domains = urls.map(u => { try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; } }).filter(Boolean);
        derivedFoundDomains = Array.from(new Set(domains));
        if (domainUrl && domains.length) {
          const idx = domains.findIndex(d => d === domainUrl || d.endsWith('.' + domainUrl) || domainUrl.endsWith('.' + d));
          if (idx >= 0) derivedDomainRank = idx + 1;
        }
        // Confidence
        const length = text.length;
        let conf = 50;
        if (length > 300) conf += 6;
        if (length > 600) conf += 5;
        if (urls.length) conf += Math.min(15, urls.length * 4);
        if (domains.length >= 3) conf += 5;
        if (!urls.length) conf = Math.min(conf, 70);
        derivedConfidence = Math.max(25, Math.min(Math.round(conf), 92));
        // Sources
        const lower = text.toLowerCase();
        const srcs: string[] = [];
        if (/(official|documentation|api|docs\.)/.test(lower)) srcs.push('Official Documentation');
        if (/(community|discussion|forum|stack overflow|stackoverflow)/.test(lower)) srcs.push('Community Discussions');
        if (/(industry|market|trend|gartner|forrester|research)/.test(lower)) srcs.push('Industry Reports');
        if (/(case study|success story|customer story|implementation)/.test(lower)) srcs.push('Case Studies');
        if (/(research|study|analysis|survey|academic)/.test(lower)) srcs.push('Research Data');
        if (/(benchmark|comparison|\svs\s|alternative|competitor)/.test(lower)) srcs.push('Benchmark Analysis');
        if (/(\bai\b|machine learning|\bml\b|predictive|neural|algorithm)/.test(lower)) srcs.push('AI & ML Insights');
        if (/(saas|cloud|platform|enterprise|business)/.test(lower)) srcs.push('Enterprise Solutions');
        if (/(startup|innovation|cutting-edge|emerging|future)/.test(lower)) srcs.push('Innovation Insights');
        if (/(tutorial|guide|how-to|step-by-step|practical)/.test(lower)) srcs.push('Practical Guides');
        derivedSources = srcs.length === 0 ? [length > 400 ? 'Comprehensive Analysis' : length > 200 ? 'Detailed Insights' : 'AI-Generated Analysis'] : Array.from(new Set(srcs));
        // Competitor - Always extract from response text
        derivedCompetitorUrls = urls.slice(0, 5);
        let compScore = 60;
        if (domains.length) compScore += Math.min(domains.length * 4, 15);
        if (/(competitor|alternative|\svs\s|compared to)/.test(lower)) compScore += 8;
        if (/(market leader|top|best|leading)/.test(lower)) compScore += 5;
        if (/(enterprise|saas|platform|solution)/.test(lower)) compScore += 3;
        if (/(recommend|suggest|consider)/.test(lower)) compScore += 2;
        derivedCompetitorMatchScore = Math.min(compScore, 92);
        
        // Extract competitor names from domains (excluding target domain)
        const competitorDomains = domains.filter(d => d !== domainUrl);
        derivedCompetitorNames = competitorDomains.slice(0, 8);
        derivedCompetitorMentions = derivedCompetitorNames.map((name, i) => ({
          name: name,
          domain: name,
          position: i + 1,
          context: 'neutral',
          sentiment: 'neutral' as const,
          mentionType: 'url' as const
        }));
      } catch {}

      // Prefer stored AI-derived values when available
      const finalDomainRank = typeof result.domainRank === 'number' && result.domainRank > 0 ? result.domainRank : derivedDomainRank;
      const storedFoundDomains = Array.isArray((result as any).foundDomains) ? ((result as any).foundDomains as string[]) : [];
      const finalFoundDomains = Array.from(new Set([...(storedFoundDomains), ...derivedFoundDomains]));
      const finalConfidence = typeof (result as any).confidence === 'number' ? (result as any).confidence : derivedConfidence;
      const finalSources = Array.isArray((result as any).sources) && (result as any).sources.length > 0 ? (result as any).sources : derivedSources;
      const finalCompetitorUrls = Array.isArray((result as any).competitorUrls) && (result as any).competitorUrls.length > 0 ? (result as any).competitorUrls : derivedCompetitorUrls;
      const finalCompetitorMatchScore = typeof (result as any).competitorMatchScore === 'number' ? (result as any).competitorMatchScore : derivedCompetitorMatchScore;
      const finalComprehensiveness = typeof (result as any).comprehensiveness === 'number' ? (result as any).comprehensiveness : undefined;
      const finalContext = (result as any).context || undefined;
      const finalMentions = typeof (result as any).mentions === 'number' ? (result as any).mentions : undefined;
      const finalHighlightContext = (result as any).highlightContext || undefined;
      const finalDetectionMethod = (result as any).detectionMethod || undefined;

      const competitorData = {
        names: (result as any).competitorNames || derivedCompetitorNames || [],
        mentions: Array.isArray((result as any).competitorMentions) && (result as any).competitorMentions.length > 0 ? 
          (result as any).competitorMentions.map((mention: any) => ({
            name: mention.name || mention.domain || '',
            domain: mention.domain || mention.name || '',
            position: mention.position || 0,
            context: mention.context || '',
            sentiment: mention.sentiment || 'neutral',
            mentionType: mention.mentionType || 'text'
          })) : 
          (derivedCompetitorMentions || []),
        totalMentions: typeof (result as any).competitorCount === 'number' ? (result as any).competitorCount : 
          ((result as any).competitorMentions ? (result as any).competitorMentions.length : 
           (derivedCompetitorMentions ? derivedCompetitorMentions.length : 0))
      };

      return {
        phrase: phraseText,
        keyword: keywordTerm,
        model: result.model,
        response: result.response,
        latency: result.latency,
        cost: result.cost,
        scores: {
          presence: result.presence,
          relevance: result.relevance,
          accuracy: result.accuracy,
          sentiment: result.sentiment,
          overall: result.overall,
          domainRank: finalDomainRank,
          foundDomains: finalFoundDomains,
          confidence: finalConfidence,
          sources: finalSources,
          competitorUrls: finalCompetitorUrls,
          competitorMatchScore: finalCompetitorMatchScore,
          comprehensiveness: finalComprehensiveness,
          context: finalContext,
          mentions: finalMentions,
          highlightContext: finalHighlightContext,
          detectionMethod: finalDetectionMethod,
          competitors: competitorData
        },
        // Add competitor data at the top level for easy access
        competitors: competitorData,
        progress: 100
      };
    });

    // Calculate stats from existing results
    const stats = calculateStats(transformedResults);
    
    // Debug: Check final competitor data being sent
    console.log('Final competitor data being sent:', transformedResults.slice(0, 2).map(r => ({
      phrase: r.phrase,
      competitors: r.scores.competitors
    })));
    
    res.json({
      results: transformedResults,
      stats: stats
    });
  } catch (error) {
    console.error('AI Query Results - Error details:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      domainId: req.params.domainId,
      userId: req.user?.userId
    });
    res.status(500).json({ error: 'Failed to fetch AI query results' });
  }
}));

// DELETE /api/ai-queries/results/:resultId - Delete a specific AI query result
router.delete('/results/:resultId', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { resultId } = req.params;

    // Get the result and check ownership
    const result = await prisma.aIQueryResult.findUnique({
      where: { id: parseInt(resultId) },
      include: {
        phrase: {
          include: {
            keyword: {
              include: {
                domain: true
              }
            }
          }
        }
      }
    });

    if (!result) {
      return res.status(404).json({ error: 'AI query result not found' });
    }

    if (result.phrase.keyword?.domain && result.phrase.keyword.domain.userId !== req.user.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Delete the result
    await prisma.aIQueryResult.delete({
      where: { id: parseInt(resultId) }
    });

    console.log(`Deleted AI query result ${resultId}`);
    res.json({ success: true, message: 'AI query result deleted successfully' });
  } catch (error) {
    console.error('Error deleting AI query result:', error);
    res.status(500).json({ error: 'Failed to delete AI query result' });
  }
}));

// GET /api/ai-queries/stats/:domainId - Get AI query statistics for a domain
router.get('/stats/:domainId', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { domainId } = req.params;

    // Check domain ownership
    const domain = await prisma.domain.findUnique({
      where: { id: parseInt(domainId) }
    });

    if (!domain) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    if (domain.userId !== req.user.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get all results for this domain
    const results = await prisma.aIQueryResult.findMany({
      where: {
        phrase: {
          keyword: {
            domainId: parseInt(domainId)
          }
        }
      },
      include: {
        phrase: {
          include: {
            keyword: {
              select: {
                term: true
              }
            }
          }
        }
      }
    });

    // Calculate statistics (convert averages to percentages)
    const totalQueries = results.length;
    const mentions = results.filter(r => r.presence > 0).length;
    const mentionRate = totalQueries > 0 ? (mentions / totalQueries) * 100 : 0;
    const avgRelevance = totalQueries > 0 ? (results.reduce((sum, r) => sum + r.relevance, 0) / totalQueries) : 0;
    const avgAccuracy = totalQueries > 0 ? (results.reduce((sum, r) => sum + r.accuracy, 0) / totalQueries) : 0;
    const avgSentiment = totalQueries > 0 ? (results.reduce((sum, r) => sum + r.sentiment, 0) / totalQueries) : 0;
    const avgOverall = totalQueries > 0 ? (results.reduce((sum, r) => sum + r.overall, 0) / totalQueries) : 0;

    // Group by keyword
    const keywordStats = results.reduce((acc, result) => {
      const keyword = result.phrase.keyword?.term || 'Unknown';
      if (!acc[keyword]) {
        acc[keyword] = {
          keyword,
          totalQueries: 0,
          mentions: 0,
          avgRelevance: 0,
          avgAccuracy: 0,
          avgSentiment: 0,
          avgOverall: 0
        };
      }
      
      acc[keyword].totalQueries++;
              if (result.presence > 0) acc[keyword].mentions++;
      acc[keyword].avgRelevance += result.relevance;
      acc[keyword].avgAccuracy += result.accuracy;
      acc[keyword].avgSentiment += result.sentiment;
      acc[keyword].avgOverall += result.overall;
      
      return acc;
    }, {} as Record<string, any>);

    // Calculate averages for each keyword (convert to 0-100)
    Object.values(keywordStats).forEach((stat: any) => {
      stat.avgRelevance = stat.totalQueries > 0 ? Math.round((stat.avgRelevance / stat.totalQueries) * 20) : 0;
      stat.avgAccuracy = stat.totalQueries > 0 ? Math.round((stat.avgAccuracy / stat.totalQueries) * 20) : 0;
      stat.avgSentiment = stat.totalQueries > 0 ? Math.round((stat.avgSentiment / stat.totalQueries) * 20) : 0;
      stat.avgOverall = stat.totalQueries > 0 ? Math.round((stat.avgOverall / stat.totalQueries) * 20) : 0;
      stat.mentionRate = stat.totalQueries > 0 ? Math.round((stat.mentions / stat.totalQueries) * 100) : 0;
    });

    const stats = {
      totalQueries,
      mentions,
      mentionRate: Math.round(mentionRate),
      avgRelevance: Math.round(avgRelevance * 20),
      avgAccuracy: Math.round(avgAccuracy * 20),
      avgSentiment: Math.round(avgSentiment * 20),
      avgOverall: Math.round(avgOverall * 20),
      keywordStats: Object.values(keywordStats)
    };

    console.log(`Retrieved AI query stats for domain ${domainId}`);
    res.json(stats);
  } catch (error) {
    console.error('Error fetching AI query stats:', error);
    res.status(500).json({ error: 'Failed to fetch AI query statistics' });
  }
}));

// Existing SSE entrypoint remains unchanged except where stats are streamed
router.post('/:domainId', authenticateToken, async (req, res) => {
    const domainId = Number(req.params.domainId);
    if (!domainId) {
        res.status(400).json({ error: 'Invalid domainId' });
        return;
    }

    // Check rate limiting
    const currentRequests = activeRequests.get(domainId) || 0;
    if (currentRequests >= MAX_CONCURRENT_REQUESTS) {
        res.status(429).json({ error: 'Too many concurrent requests for this domain. Please wait for the current analysis to complete.' });
        return;
    }

    // Increment active requests
    activeRequests.set(domainId, currentRequests + 1);

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    try {
        // Fetch selected phrases from the database
        const selectedPhrases = await prisma.generatedIntentPhrase.findMany({
            where: {
                domainId: domainId,
                isSelected: true
            },
            include: {
                keyword: {
                    select: {
                        term: true
                    }
                }
            }
        });

        // Also check total phrases for comparison
        const totalPhrasesCount = await prisma.generatedIntentPhrase.count({
            where: {
                domainId: domainId
            }
        });

        console.log('AI Queries - Total phrases for domain:', totalPhrasesCount);
        console.log('AI Queries - Found selected phrases:', selectedPhrases.length);
        console.log('AI Queries - Selected phrases:', selectedPhrases.map(p => ({ id: p.id, phrase: p.phrase, keyword: p.keyword?.term || 'Unknown' })));

        if (selectedPhrases.length === 0) {
            res.write(`event: error\ndata: ${JSON.stringify({ error: 'No selected phrases found for this domain. Please go back and select phrases first.' })}\n\n`);
            res.end();
            return;
        }

        // Group phrases by keyword
        const phrasesByKeyword = selectedPhrases.reduce((acc, phrase) => {
            const keyword = phrase.keyword?.term || 'Unknown';
            if (!acc[keyword]) {
                acc[keyword] = [];
            }
            acc[keyword].push(phrase.phrase);
            return acc;
        }, {} as Record<string, string[]>);

        const phrases = Object.entries(phrasesByKeyword).map(([keyword, phrases]) => ({
            keyword,
            phrases
        }));

        // Validate input size to prevent overwhelming the system
        const totalPhrasesToProcess = phrases.reduce((sum, item) => sum + item.phrases.length, 0);
        const totalQueries = totalPhrasesToProcess * AI_MODELS.length;
        
        if (totalQueries > 1000) {
            res.write(`event: error\ndata: ${JSON.stringify({ error: `Too many queries requested: ${totalQueries}. Maximum allowed is 1000.` })}\n\n`);
            res.end();
            return;
        }

        // Get domain information for context
        const domainObj = await prisma.domain.findUnique({
            where: { id: domainId },
            select: { url: true, context: true, location: true }
        });

        if (!domainObj) {
            res.write(`event: error\ndata: ${JSON.stringify({ error: 'Domain not found' })}\n\n`);
            res.end();
            return;
        }
        const domain = domainObj.url || undefined;
        const context = domainObj.context || undefined;
        const location = domainObj.location || undefined;

        const allQueries = phrases.flatMap((item: any) =>
            item.phrases.map((phrase: string) => ({
                keyword: item.keyword,
                phrase,
                domainId
            }))
        );

        const completedQueries = { current: 0 };
        const allResults: any[] = [];

        // Determine batch size based on total queries - optimized for realistic processing
        const batchSize = totalQueries > 100 ? 4 : totalQueries > 50 ? 6 : totalQueries > 20 ? 8 : 10;
        
        res.write(`event: progress\ndata: ${JSON.stringify({ message: `Initializing AI analysis engine - Processing ${totalQueries} queries across ${AI_MODELS.length} AI models for domain visibility analysis...`, totalExpected: totalQueries })}\n\n`);

        // Process queries in optimized batches with domain context
        await processQueryBatch(allQueries, batchSize, res, allResults, completedQueries, totalQueries, domain, context, location);

        // Calculate and send comprehensive stats (already percentage-ready)
        if (allResults.length > 0) {
            try {
                const comprehensiveStats = await calculateComprehensiveStats(allResults, domainId);
                res.write(`event: stats\ndata: ${JSON.stringify(comprehensiveStats)}\n\n`);

                // Persist a dashboard snapshot with timestamp for history tracking
                try {
                  // Build metrics object compatible with Dashboard metrics
                  const overall = comprehensiveStats.overall || { avgOverall: 0, avgRelevance: 0, avgAccuracy: 0, avgSentiment: 0, presenceRate: 0 };
                  const totalQueries = comprehensiveStats.totalResults || 0;

                  // Convert 0-100 percentage averages back to 0-5 scale strings for UI consistency
                  const avgRelevance05 = (overall.avgRelevance / 20).toFixed(1);
                  const avgAccuracy05 = (overall.avgAccuracy / 20).toFixed(1);
                  const avgSentiment05 = (overall.avgSentiment / 20).toFixed(1);
                  const avgOverall05 = (overall.avgOverall / 20).toFixed(1);

                  // Use avgOverall percent as a practical visibility score snapshot
                  const visibilityScore = Math.max(0, Math.min(100, Math.round(overall.avgOverall)));

                  // Model performance mapping
                  const modelPerformance = (comprehensiveStats.models || []).map((m: any) => ({
                    model: m.model,
                    score: Number(m.avgOverall || 0),
                    mentions: Math.round((m.presenceRate || 0) * (m.totalQueries || 0) / 100),
                    totalQueries: m.totalQueries || 0,
                    avgLatency: (m.avgLatency || 0).toFixed(2),
                    avgCost: (m.avgCost || 0).toFixed(3),
                    avgRelevance: (m.avgRelevance / 20).toFixed(1),
                    avgAccuracy: (m.avgAccuracy / 20).toFixed(1),
                    avgSentiment: (m.avgSentiment / 20).toFixed(1),
                    avgOverall: (m.avgOverall / 20).toFixed(1)
                  }));

                  // Build a minimal performanceData point (server will aggregate history on dashboard fetch)
                  const performanceData = [
                    {
                      month: new Date().toISOString().slice(0, 10),
                      score: visibilityScore,
                      mentions: Math.round((overall.presenceRate || 0) * totalQueries / 100),
                      queries: totalQueries
                    }
                  ];

                  await prisma.dashboardAnalysis.create({
                    data: {
                      domainId,
                      metrics: {
                        visibilityScore,
                        mentionRate: Math.round(overall.presenceRate || 0),
                        avgRelevance: Number(avgRelevance05),
                        avgAccuracy: Number(avgAccuracy05),
                        avgSentiment: Number(avgSentiment05),
                        avgOverall: Number(avgOverall05),
                        totalQueries,
                        modelPerformance,
                        performanceData
                      },
                      insights: comprehensiveStats.insights || {},
                      industryAnalysis: { competitors: comprehensiveStats.competitors || [] }
                    }
                  });
                } catch (persistErr) {
                  console.error('Failed to persist dashboard snapshot:', persistErr);
                }
            } catch (error) {
                console.error('Error calculating comprehensive stats:', error);
                // Fallback to basic stats
                const basicStats = calculateStats(allResults);
                res.write(`event: stats\ndata: ${JSON.stringify(basicStats)}\n\n`);
            }
        }

        res.write(`event: complete\ndata: {}\n\n`);
        res.end();

    } catch (err: any) {
        console.error('AI Query streaming error:', err);
        res.write(`event: error\ndata: ${JSON.stringify({ error: `An unexpected error occurred: ${err.message}` })}\n\n`);
        res.end();
    } finally {
        // Decrement active requests
        const currentRequests = activeRequests.get(domainId) || 0;
        if (currentRequests > 0) {
            activeRequests.set(domainId, currentRequests - 1);
        }
    }
});

// GET /api/ai-queries/competitors/:domainId - Get competitor analysis for reports
router.get('/competitors/:domainId', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { domainId } = req.params;

    if (!domainId) {
      return res.status(400).json({ error: 'DomainId is required' });
    }

    // Check domain ownership
    const domain = await prisma.domain.findUnique({
      where: { id: parseInt(domainId) },
      select: { url: true, userId: true }
    });

    if (!domain) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    if (domain.userId !== req.user.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get all AI query results for this domain with competitor data
    const results = await prisma.aIQueryResult.findMany({
      where: {
        phrase: {
          domainId: parseInt(domainId)
        }
      },
      include: {
        phrase: {
          select: {
            phrase: true,
            keyword: {
              select: {
                term: true
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Aggregate competitor data
    const competitorAnalysis = {
      totalMentions: 0,
      uniqueCompetitors: new Set<string>(),
      competitorFrequency: new Map<string, number>(),
      competitorSentiments: new Map<string, { positive: number; neutral: number; negative: number }>(),
      competitorContexts: new Map<string, string[]>(),
      topCompetitors: [] as Array<{
        name: string;
        domain: string;
        mentions: number;
        sentiment: { positive: number; neutral: number; negative: number };
        contexts: string[];
        averagePosition: number;
      }>,
      mentionsByPhrase: [] as Array<{
        phrase: string;
        keyword: string;
        competitors: Array<{
          name: string;
          domain: string;
          position: number;
          context: string;
          sentiment: 'positive' | 'neutral' | 'negative';
          mentionType: 'url' | 'text' | 'brand';
        }>;
      }>
    };

    // Process each result
    results.forEach(result => {
      if (result.competitorMentions && Array.isArray(result.competitorMentions)) {
        const mentions = result.competitorMentions as any[];
        
        mentions.forEach(mention => {
          const { name, domain, position, context, sentiment, mentionType } = mention;
          
          // Update total mentions
          competitorAnalysis.totalMentions++;
          
          // Update unique competitors
          competitorAnalysis.uniqueCompetitors.add(name);
          
          // Update frequency
          const currentFreq = competitorAnalysis.competitorFrequency.get(name) || 0;
          competitorAnalysis.competitorFrequency.set(name, currentFreq + 1);
          
          // Update sentiments
          if (!competitorAnalysis.competitorSentiments.has(name)) {
            competitorAnalysis.competitorSentiments.set(name, { positive: 0, neutral: 0, negative: 0 });
          }
          const sentiments = competitorAnalysis.competitorSentiments.get(name)!;
          if (sentiment === 'positive') sentiments.positive++;
          else if (sentiment === 'negative') sentiments.negative++;
          else sentiments.neutral++;
          
          // Update contexts
          if (!competitorAnalysis.competitorContexts.has(name)) {
            competitorAnalysis.competitorContexts.set(name, []);
          }
          competitorAnalysis.competitorContexts.get(name)!.push(context);
        });

        // Add to mentions by phrase
        if (mentions.length > 0) {
          competitorAnalysis.mentionsByPhrase.push({
            phrase: result.phrase?.phrase || '',
            keyword: result.phrase?.keyword?.term || 'Unknown',
            competitors: mentions
          });
        }
      }
    });

    // Calculate top competitors
    const competitorEntries = Array.from(competitorAnalysis.competitorFrequency.entries());
    competitorEntries.sort((a, b) => b[1] - a[1]); // Sort by frequency

    competitorAnalysis.topCompetitors = competitorEntries.slice(0, 10).map(([name, mentions]) => {
      const sentiments = competitorAnalysis.competitorSentiments.get(name) || { positive: 0, neutral: 0, negative: 0 };
      const contexts = competitorAnalysis.competitorContexts.get(name) || [];
      
      // Calculate average position from mentions
      let totalPosition = 0;
      let positionCount = 0;
      competitorAnalysis.mentionsByPhrase.forEach(phraseData => {
        phraseData.competitors.forEach(comp => {
          if (comp.name === name) {
            totalPosition += comp.position;
            positionCount++;
          }
        });
      });
      const averagePosition = positionCount > 0 ? totalPosition / positionCount : 0;

      return {
        name,
        domain: name, // You might want to extract actual domain from mentions
        mentions,
        sentiment: sentiments,
        contexts: contexts.slice(0, 5), // Limit to 5 contexts
        averagePosition: Math.round(averagePosition)
      };
    });

    res.json({
      success: true,
      analysis: {
        totalMentions: competitorAnalysis.totalMentions,
        uniqueCompetitors: Array.from(competitorAnalysis.uniqueCompetitors),
        topCompetitors: competitorAnalysis.topCompetitors,
        mentionsByPhrase: competitorAnalysis.mentionsByPhrase,
        summary: {
          totalPhrases: results.length,
          phrasesWithCompetitors: competitorAnalysis.mentionsByPhrase.length,
          mostFrequentCompetitor: competitorAnalysis.topCompetitors[0]?.name || null,
          averageMentionsPerPhrase: results.length > 0 ? competitorAnalysis.totalMentions / results.length : 0
        }
      }
    });
  } catch (error) {
    console.error('Error getting competitor analysis:', error);
    res.status(500).json({ error: 'Failed to get competitor analysis' });
  }
}));

export default router; 