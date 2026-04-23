import { Router, Request, Response } from 'express';
import { PrismaClient } from '../../generated/prisma';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { analyzeStandalonePeerCompetitors } from '../services/standaloneCompetitorAnalysisService';

const router = Router();
const prisma = new PrismaClient();

// Utility function to wrap async route handlers
function asyncHandler(fn: any) {
  return (req: Request, res: Response, next: any) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function safeParseJson(value: any, fallback: any) {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== 'string') return value;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function safeParseArray(value: any): any[] {
  const parsed = safeParseJson(value, []);
  return Array.isArray(parsed) ? parsed : [];
}

function safeParseObject(value: any): Record<string, any> {
  const parsed = safeParseJson(value, {});
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
}

function buildCompetitorListArray(competitorList: string | null | undefined): string[] {
  if (!competitorList) return [];
  return competitorList
    .split('\n')
    .map((s: string) => s.replace(/^[-\s]+/, '').trim())
    .filter(Boolean);
}

function parseCompetitorAnalysisResponse(analysis: any) {
  return {
    ...analysis,
    competitorListArr: buildCompetitorListArray(analysis.competitorList),
    competitors: safeParseArray(analysis.competitors),
    marketInsights: safeParseObject(analysis.marketInsights),
    strategicRecommendations: safeParseArray(analysis.strategicRecommendations),
    competitiveAnalysis: safeParseObject(analysis.competitiveAnalysis),
  };
}

function isStandalonePeerAnalysis(analysis: any): boolean {
  return safeParseObject(analysis?.competitiveAnalysis).analysisType === 'standalone_peer';
}

function getSummaryContext(contextJson: any): string {
  const summaryContext = safeParseObject(contextJson).summaryContext;
  return typeof summaryContext === 'string' ? summaryContext.trim() : '';
}

// GET /api/competitor/:domainId - Get competitor analysis for a domain
router.get('/:domainId', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const domainIdParam = Array.isArray(req.params.domainId) ? req.params.domainId[0] : req.params.domainId;
    const domainId = String(domainIdParam);

    // Check domain ownership
    const domain = await prisma.domain.findUnique({
      where: { id: parseInt(domainId) },
      include: {
        competitorAnalyses: {
          orderBy: { updatedAt: 'desc' },
          take: 10
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

    const analysis = domain.competitorAnalyses.find(isStandalonePeerAnalysis) || domain.competitorAnalyses[0];
    res.json(parseCompetitorAnalysisResponse(analysis));
  } catch (error) {
    console.error('Error fetching competitor analysis:', error);
    res.status(500).json({ error: 'Failed to fetch competitor analysis' });
  }
}));

// POST /api/competitor/:domainId/standalone - Generate standalone same-tier competitor analysis
router.post('/:domainId/standalone', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const domainIdParam = Array.isArray(req.params.domainId) ? req.params.domainId[0] : req.params.domainId;
    const domainId = Number(domainIdParam);
    const force = req.body?.force === true || String(req.query.force).toLowerCase() === 'true';

    if (!domainId || Number.isNaN(domainId)) {
      return res.status(400).json({ error: 'Invalid domain ID' });
    }

    const domain = await prisma.domain.findUnique({
      where: { id: domainId },
      include: {
        competitorAnalyses: {
          orderBy: { updatedAt: 'desc' },
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

    const cachedStandaloneAnalysis = domain.competitorAnalyses.find(isStandalonePeerAnalysis);
    if (cachedStandaloneAnalysis && !force) {
      return res.json({
        ...parseCompetitorAnalysisResponse(cachedStandaloneAnalysis),
        cached: true,
        tokenUsage: 0
      });
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

    const analysisResult = await analyzeStandalonePeerCompetitors({
      domain: domain.url,
      context: domainContext,
      location: domain.location || undefined
    });

    const analysisData = {
      domainId,
      competitorList: analysisResult.competitorList,
      competitors: analysisResult.competitors as any,
      marketInsights: analysisResult.marketInsights as any,
      strategicRecommendations: analysisResult.strategicRecommendations as any,
      competitiveAnalysis: analysisResult.competitiveAnalysis as any
    };

    const savedAnalysis = cachedStandaloneAnalysis
      ? await prisma.competitorAnalysis.update({
          where: { id: cachedStandaloneAnalysis.id },
          data: analysisData
        })
      : await prisma.competitorAnalysis.create({
          data: analysisData
        });

    return res.json({
      ...parseCompetitorAnalysisResponse(savedAnalysis),
      cached: false,
      tokenUsage: analysisResult.tokenUsage
    });
  } catch (error) {
    console.error('Error generating standalone competitor analysis:', error);
    res.status(500).json({
      error: 'Failed to generate standalone competitor analysis',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}));

// POST /api/competitor/:domainId - Generate competitor analysis
router.post('/:domainId', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const domainIdParam = Array.isArray(req.params.domainId) ? req.params.domainId[0] : req.params.domainId;
    const domainId = String(domainIdParam);
    const { competitors } = req.body;

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

    // Generate competitor analysis logic here
    // This would typically involve AI analysis of the competitors
    const analysis = {
      domainId: parseInt(domainId),
      competitorList: competitors.join('\n'),
      competitors: JSON.stringify(competitors),
      marketInsights: JSON.stringify([]),
      strategicRecommendations: JSON.stringify([]),
      competitiveAnalysis: JSON.stringify({}),
    };

    // Save the analysis
    const savedAnalysis = await prisma.competitorAnalysis.create({
      data: analysis
    });

    res.json(savedAnalysis);
  } catch (error) {
    console.error('Error generating competitor analysis:', error);
    res.status(500).json({ error: 'Failed to generate competitor analysis' });
  }
}));

// POST /competitor/analyze - Analyze competitor using AI
router.post('/analyze', authenticateToken, asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { targetDomain, competitorDomain, context, keywords, phrases } = req.body;

  if (!targetDomain || !competitorDomain) {
    return res.status(400).json({ error: 'Target domain and competitor domain are required' });
  }

  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendEvent = (data: object) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    sendEvent({ event: 'progress', message: 'Starting competitor analysis...', progress: 10 });

    // Get target domain data from database and verify ownership
    let targetDomainData = null;
    const targetDomainAsId = Number(targetDomain);

    if (targetDomain && Number.isInteger(targetDomainAsId)) {
      targetDomainData = await prisma.domain.findUnique({
        where: { id: targetDomainAsId },
        include: {
          keywords: {
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
    }

    if (!targetDomainData) {
      targetDomainData = await prisma.domain.findFirst({
        where: {
          url: String(targetDomain),
          userId: req.user.userId
        },
        include: {
          keywords: {
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
    }

    if (!targetDomainData) {
      sendEvent({ event: 'error', error: 'Target domain not found or access denied' });
      res.end();
      return;
    }

    sendEvent({ event: 'progress', message: 'Analyzing competitor domain...', progress: 30 });

    // Create comprehensive AI prompt for competitor analysis, including location if available
    const locationContext = targetDomainData?.location ? `\nLocation: ${targetDomainData.location}` : '';
    const analysisPrompt = `
You are an expert SEO and AI visibility analyst. Compare "${targetDomain}" and "${competitorDomain}" in detail.${locationContext}

1. Provide a summary of the competitive landscape.
2. Create a metrics table for both domains with: traffic, domain authority, backlinks, page speed, mobile score, AI visibility score, keyword count, phrase count, average relevance, accuracy, sentiment.
3. Calculate keyword and phrase overlap (% and list top 10).
4. Compare AI visibility (score and mention rate for each).
5. Provide a SWOT analysis for both domains.
6. List 5-8 prioritized recommendations for the target domain, with expected impact and effort (high/medium/low).
7. Classify each domain as leader/challenger/niche and justify.
8. List any recent news/events for each domain (if available).

Return ONLY a valid JSON object with this structure:
{
  "summary": "...",
  "metricsTable": [
    { "domain": "...", "traffic": ..., "domainAuthority": ..., ... },
    { "domain": "...", "traffic": ..., "domainAuthority": ..., ... }
  ],
  "keywordOverlap": { "percent": ..., "keywords": ["..."] },
  "phraseOverlap": { "percent": ..., "phrases": ["..."] },
  "aiVisibility": [
    { "domain": "...", "score": ..., "mentionRate": ... },
    { "domain": "...", "score": ..., "mentionRate": ... }
  ],
  "swot": {
    "target": { "strengths": [...], "weaknesses": [...], "opportunities": [...], "threats": [...] },
    "competitor": { "strengths": [...], "weaknesses": [...], "opportunities": [...], "threats": [...] }
  },
  "recommendations": [
    { "action": "...", "impact": "high/medium/low", "effort": "high/medium/low" }
  ],
  "marketMap": [
    { "domain": "...", "position": "leader/challenger/niche", "justification": "..." },
    { "domain": "...", "position": "leader/challenger/niche", "justification": "..." }
  ],
  "recentNews": [
    { "domain": "...", "headline": "...", "url": "..." }
  ]
}
Be realistic, use all provided data, and do not add any extra text.
`;

    sendEvent({ event: 'progress', message: 'Running AI analysis...', progress: 60 });

    // Run AI analysis
    // Replace GoogleGenerativeAI/model with OpenAI GPT-4o logic for competitor analysis
    // TODO: Call OpenAI API here and assign the response text to aiResponseText
    let aiResponseText = '';
    // aiResponseText = await callOpenAIGpt4oMini(analysisPrompt, ...);

    sendEvent({ event: 'progress', message: 'Processing analysis results...', progress: 90 });

    // Parse JSON response
    let analysisData;
    try {
      const jsonMatch = aiResponseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysisData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      sendEvent({ event: 'error', error: 'Failed to parse AI analysis response' });
      res.end();
      return;
    }

    // Fallbacks for missing sections
    const defaultAnalysis = {
      summary: '',
      metricsTable: [],
      keywordOverlap: { percent: 0, keywords: [] },
      phraseOverlap: { percent: 0, phrases: [] },
      aiVisibility: [],
      swot: { target: { strengths: [], weaknesses: [], opportunities: [], threats: [] }, competitor: { strengths: [], weaknesses: [], opportunities: [], threats: [] } },
      recommendations: [],
      marketMap: [],
      recentNews: []
    };
    const mergedAnalysis = { ...defaultAnalysis, ...analysisData };
    sendEvent({ event: 'analysis', ...mergedAnalysis });
    res.end();

  } catch (error) {
    console.error('Competitor analysis error:', error);
    sendEvent({ event: 'error', error: 'Failed to analyze competitor' });
    res.end();
  }
}));

export default router;
