import { Router, Request, Response } from 'express';
import { PrismaClient } from '../../generated/prisma';
import { crawlAndExtractWithGpt4o, ProgressCallback, generateKeywordsForDomain, isGenericAnalysisKeyword } from '../services/geminiService';
import { generateSeedKeywords } from '../services/googleAdsService';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { parseContextJson, parseCrawlPolicy, parseCrawlQuality, parsePageSnapshots, parseStringArray } from '../services/crawlResultUtils';

const router = Router();
const prisma = new PrismaClient();

const MIN_ONBOARDING_STEP = 0;
const MAX_ONBOARDING_STEP = 4;

async function computeOnboardingStep(domainId: number): Promise<number> {
  const [
    crawlCount,
    selectedKeywordCount,
    selectedPhraseCount,
    aiResultCount,
    dashboardReportCount,
    analysisReportCount,
  ] = await prisma.$transaction([
    prisma.crawlResult.count({ where: { domainId } }),
    prisma.keyword.count({ where: { domainId, isSelected: true } }),
    prisma.generatedIntentPhrase.count({ where: { domainId, isSelected: true } }),
    prisma.aIQueryResult.count({ where: { phrase: { domainId } } }),
    prisma.dashboardAnalysis.count({ where: { domainId } }),
    prisma.analysisReport.count({ where: { domainId } }),
  ]);

  let computedStep = MIN_ONBOARDING_STEP;

  if (crawlCount > 0 || selectedKeywordCount > 0) {
    computedStep = 1;
  }

  if (selectedPhraseCount > 0) {
    computedStep = Math.max(computedStep, 2);
  }

  if (aiResultCount > 0) {
    computedStep = Math.max(computedStep, 3);
  }

  if (dashboardReportCount > 0 || analysisReportCount > 0) {
    computedStep = Math.max(computedStep, MAX_ONBOARDING_STEP);
  }

  return Math.min(MAX_ONBOARDING_STEP, computedStep);
}

function sanitizeHintStep(hint?: number) {
  if (hint === undefined || hint === null || Number.isNaN(hint)) {
    return undefined;
  }
  const floored = Math.floor(hint);
  return Math.max(MIN_ONBOARDING_STEP, Math.min(MAX_ONBOARDING_STEP, floored));
}

export async function syncDomainCurrentStep(domainId: number, hintStep?: number): Promise<number> {
  const computedStep = await computeOnboardingStep(domainId);
  const sanitizedHint = sanitizeHintStep(hintStep);

  return prisma.$transaction(async (tx) => {
    const domain = await tx.domain.findUnique({
      where: { id: domainId },
      select: { currentStep: true },
    });

    if (!domain) {
      return computedStep;
    }

    let targetStep = Math.max(domain.currentStep ?? MIN_ONBOARDING_STEP, computedStep);

    if (sanitizedHint !== undefined) {
      const allowedHint = Math.min(sanitizedHint, Math.min(computedStep + 1, MAX_ONBOARDING_STEP));
      targetStep = Math.max(targetStep, allowedHint);
    }

    targetStep = Math.max(MIN_ONBOARDING_STEP, Math.min(MAX_ONBOARDING_STEP, targetStep));

    if (targetStep !== domain.currentStep) {
      await tx.domain.update({
        where: { id: domainId },
        data: { currentStep: targetStep },
      });
    }

    return targetStep;
  });
}

export async function advanceDomainStep(domainId: number, step: number): Promise<number> {
  return syncDomainCurrentStep(domainId, step);
}

// Add asyncHandler utility at the top if not present
function asyncHandler(fn: (req: Request, res: Response, next: any) => Promise<any>) {
  return function (req: Request, res: Response, next: any) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// GET /domain/check/:url - Check if domain exists
router.get('/check/:url', authenticateToken, asyncHandler(async (req: Request, res: Response) => {
  try {
    const { url } = req.params;
    const authReq = req as AuthenticatedRequest;

    // Try multiple URL formats to find the domain
    const possibleUrls = [
      url, // Original URL as provided
      url.startsWith('http') ? url : `https://${url}`, // With https://
      url.startsWith('http') ? url : `http://${url}`, // With http://
      url.replace(/^https?:\/\//, '') // Without protocol
    ];

    let domain: any = null;

    // Try to find the domain with any of the possible URL formats for this user
    for (const possibleUrl of possibleUrls) {
      domain = await prisma.domain.findFirst({
        where: {
          url: possibleUrl,
          userId: authReq.user.userId
        },
        include: {
          dashboardAnalyses: true,
          crawlResults: { orderBy: { createdAt: 'desc' }, take: 1 }
        }
      });

      if (domain) {
        break; // Found the domain, stop searching
      }
    }

    if (!domain) {
      return res.json({ exists: false });
    }

    const syncedStep = await syncDomainCurrentStep(domain.id);

    return res.json({
      exists: true,
      domainId: domain.id,
      url: domain.url,
      hasAnalysis: !!domain.dashboardAnalyses[0],
      lastAnalyzed: domain.dashboardAnalyses[0]?.updatedAt || domain.updatedAt,
      currentStep: syncedStep,
    });
  } catch (error) {
    console.error('Domain check error:', error);
    res.status(500).json({ error: 'Failed to check domain' });
  }
}));

// POST /domain - create/find domain, run multi-phase analysis, and stream progress
router.post('/', authenticateToken, asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { url, subdomains, customPaths, priorityUrls, location } = req.body;

  // Validate input before setting SSE headers
  if (!url) {
    res.status(400).json({ error: 'URL is required' });
    return;
  }

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendEvent = (data: object) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const sendErrorAndEnd = (error: string, details?: string) => {
    sendEvent({ type: 'error', error, details });
    res.end();
  };

  // Helper function to update analysis phase
  const updateAnalysisPhase = async (domainId: number, phase: string, status: string, progress: number, result?: any, error?: string) => {
    try {
      await prisma.analysisPhase.upsert({
        where: { domainId_phase: { domainId, phase } },
        update: {
          status,
          progress,
          result: result ? JSON.stringify(result) : undefined,
          error,
          endTime: status === 'completed' || status === 'failed' ? new Date() : undefined,
        },
        create: {
          domainId,
          phase,
          status,
          progress,
          startTime: new Date(),
          result: result ? JSON.stringify(result) : undefined,
          error,
        },
      });
    } catch (err) {
      console.error(`Error updating analysis phase ${phase}:`, err);
    }
  };

  try {
    // 1. Normalize URL and find/create domain
    let normalizedUrl = url;
    if (!url.startsWith('http')) {
      normalizedUrl = `https://${url}`;
    }

    sendEvent({ type: 'progress', phase: 'domain_extraction', step: 'Validating domain and checking existing analysis...', progress: 5 });

    // Check if domain already exists for this user
    let domain = await prisma.domain.findFirst({
      where: {
        url: normalizedUrl,
        userId: authReq.user.userId
      }
    });

    let isNewDomain = false;
    if (!domain) {
      // Create new domain for this user (regular analysis domain, not company domain)
      domain = await prisma.domain.create({
        data: {
          url: normalizedUrl,
          userId: authReq.user.userId,
          location: location || null,
          currentStep: 0,
          isCompanyDomain: false
        }
      });
      isNewDomain = true;
    }

    sendEvent({ type: 'domain_created', domainId: domain.id, isNewDomain });

    // Initialize only domain extraction and keyword generation phases
    const phases = ['domain_extraction', 'keyword_generation'];
    for (const phase of phases) {
      await updateAnalysisPhase(domain.id, phase, 'pending', 0);
    }

    let totalTokenUsage = 0;
    let keywordResult: any = null;

    // PHASE 1: Domain Extraction (Existing functionality)
    sendEvent({ type: 'progress', phase: 'domain_extraction', step: 'Starting domain extraction and content crawling...', progress: 10 });
    await updateAnalysisPhase(domain.id, 'domain_extraction', 'running', 10);

    const onProgress: ProgressCallback = (progressData) => {
      let enhancedMessage = progressData.step;

      if (progressData.phase === 'discovery') {
        if (progressData.step.includes('Validating')) {
          enhancedMessage = 'Validating domain accessibility and technical requirements...';
        } else if (progressData.step.includes('Scanning')) {
          enhancedMessage = 'Scanning website architecture and content structure...';
        } else if (progressData.step.includes('Mapping')) {
          enhancedMessage = 'Mapping content hierarchy and navigation patterns...';
        }
      } else if (progressData.phase === 'content') {
        if (progressData.step.includes('Extracting')) {
          enhancedMessage = 'Extracting and analyzing page content with advanced parsing...';
        } else if (progressData.step.includes('Processing')) {
          enhancedMessage = 'Processing metadata and structured data for comprehensive analysis...';
        }
      } else if (progressData.phase === 'ai_processing') {
        if (progressData.step.includes('Running')) {
          enhancedMessage = 'Running advanced AI analysis for brand context extraction...';
        } else if (progressData.step.includes('Extracting')) {
          enhancedMessage = 'Extracting brand context and market positioning insights...';
        } else if (progressData.step.includes('Generating')) {
          enhancedMessage = 'Generating comprehensive business intelligence and SEO insights...';
        }
      } else if (progressData.phase === 'validation') {
        if (progressData.step.includes('Validating')) {
          enhancedMessage = 'Validating analysis results and quality assurance checks...';
        } else if (progressData.step.includes('Quality')) {
          enhancedMessage = 'Quality assurance and data validation in progress...';
        } else if (progressData.step.includes('Finalizing')) {
          enhancedMessage = 'Finalizing comprehensive brand analysis and preparing insights...';
        }
      }

      const phaseProgress = Math.min(90, 10 + (progressData.progress * 0.8)); // Domain extraction gets 10-90%
      sendEvent({ type: 'progress', phase: 'domain_extraction', step: enhancedMessage, progress: phaseProgress, stats: progressData.stats });
    };

    // Determine crawl mode
    const hasPriorityUrls = Array.isArray(priorityUrls) && priorityUrls.length > 0;
    const hasCustomPaths = Array.isArray(customPaths) && customPaths.length > 0;
    let extraction;

    const domainName = domain.url.replace(/^https?:\/\//, '').replace(/^www\./, '');

    try {
      if (!hasPriorityUrls && !hasCustomPaths) {
        const defaultPriorityUrls = [
          `https://${domainName}/about`,
          `https://${domainName}/services`,
          `https://${domainName}/contact`,
          `https://${domainName}/solutions`,
          `https://${domainName}/products`
        ];
        extraction = await crawlAndExtractWithGpt4o(domainName, onProgress, undefined, defaultPriorityUrls, location, { maxPages: 15 });
      } else {
        extraction = await crawlAndExtractWithGpt4o(domainName, onProgress, customPaths, priorityUrls, location, { maxPages: 15 });
      }
      totalTokenUsage += extraction.tokenUsage || 0;
    } catch (extractionError) {
      console.error('Extraction error:', extractionError);
      await updateAnalysisPhase(domain.id, 'domain_extraction', 'failed', 0, null, extractionError instanceof Error ? extractionError.message : 'Unknown extraction error');
      sendErrorAndEnd('Extraction failed', extractionError instanceof Error ? extractionError.message : 'Unknown extraction error');
      return;
    }

    // Save crawl result
    sendEvent({ type: 'progress', phase: 'domain_extraction', step: 'Saving domain extraction results...', progress: 95 });

    const crawlResult = await prisma.crawlResult.create({
      data: {
        domainId: domain.id,
        pagesScanned: extraction.pagesScanned,
        analyzedUrls: JSON.stringify(extraction.analyzedUrls),
        extractedContext: extraction.extractedContext,
        tokenUsage: extraction.tokenUsage || 0,
        pageSnapshots: extraction.pages as any,
        crawlPolicy: extraction.crawlPolicy as any,
        quality: extraction.quality as any,
        contextJson: extraction.contextJson as any,
      },
    });

    await advanceDomainStep(domain.id, 1);

    await updateAnalysisPhase(domain.id, 'domain_extraction', 'completed', 100, crawlResult, undefined);
    sendEvent({ type: 'progress', phase: 'domain_extraction', step: 'Domain extraction completed successfully!', progress: 100 });

    // Update domain context
    await prisma.domain.update({
      where: { id: domain.id },
      data: {
        context: extraction.extractedContext,
        contextJson: extraction.contextJson as any,
      },
    });

    // PHASE 2: Enhanced AI Keyword Generation
    sendEvent({ type: 'progress', phase: 'keyword_generation', step: 'Starting enhanced AI keyword generation...', progress: 10 });
    await updateAnalysisPhase(domain.id, 'keyword_generation', 'running', 10);

    try {
      sendEvent({ type: 'progress', phase: 'keyword_generation', step: 'Analyzing domain context for keyword generation...', progress: 30 });

      // Use enhanced AI keyword generation with location context
      let keywords = [];
      try {
        const contextString = extraction.summaryContext || extraction.extractedContext || '';
        const aiKeywordResult = await generateKeywordsForDomain(domain.url, contextString, location);
        keywords = aiKeywordResult.keywords.map((kw: any) => ({
          term: kw.term,
          volume: kw.volume,
          difficulty: kw.difficulty,
          cpc: kw.cpc,
          intent: kw.intent || 'Commercial',
        }));
        totalTokenUsage += aiKeywordResult.tokenUsage || 0;

        console.log(`✅ AI generated ${keywords.length} keywords with intent classification`);
      } catch (aiError) {
        console.error('AI keyword generation failed:', aiError);
        throw new Error('Failed to generate keywords using AI. Please try again.');
      }

      sendEvent({ type: 'progress', phase: 'keyword_generation', step: 'Saving keywords to database...', progress: 70 });

      // Save keywords to database
      const keywordData = keywords
        .filter((keyword: any) => {
          const term = String(keyword.term || '').trim();
          return term && !isGenericAnalysisKeyword(term);
        })
        .map((keyword: any) => ({
          term: keyword.term,
          volume: keyword.volume,
          difficulty: keyword.difficulty,
          cpc: keyword.cpc,
          intent: keyword.intent || 'Commercial',
          domainId: domain.id,
          isSelected: false,
        }));

      if (keywordData.length > 0) {
        await prisma.keyword.createMany({
          data: keywordData,
          skipDuplicates: true,
        });
      } else if (!isNewDomain) {
        console.warn(`No new keywords for re-analyzed domain ${domain.id}`);
      } else {
        throw new Error(`Keyword generation returned 0 valid keywords for domain ${domain.id}. Domain context may be too generic.`);
      }

      const keywordAnalysis = await prisma.keywordAnalysis.create({
        data: {
          domainId: domain.id,
          keywords: keywordData,
          searchVolumeData: {},
          intentClassification: {},
          competitiveAnalysis: {},
          tokenUsage: 0, // Google API doesn't use tokens
        },
      });

      await updateAnalysisPhase(domain.id, 'keyword_generation', 'completed', 100, keywordAnalysis, undefined);
      sendEvent({ type: 'progress', phase: 'keyword_generation', step: 'Google API keyword generation completed successfully!', progress: 100 });

    } catch (keywordError) {
      console.error('Keyword generation error:', keywordError);
      await updateAnalysisPhase(domain.id, 'keyword_generation', 'failed', 0, null, keywordError instanceof Error ? keywordError.message : 'Unknown keyword generation error');
      sendEvent({ 
        type: 'error',
        phase: 'keyword_generation',
        error: 'Keyword generation failed',
        details: keywordError instanceof Error ? keywordError.message : 'Unknown error'
      });
      res.end();
      return;
    }

    // Final completion
    sendEvent({ type: 'progress', step: 'Finalizing comprehensive analysis...', progress: 98 });

    // Send final result and close connection
    await syncDomainCurrentStep(domain.id);

    sendEvent({
      type: 'complete',
      result: {
        domain,
        extraction: crawlResult,
        isNewDomain,
        tokenUsage: totalTokenUsage,
        phases: {
          domain_extraction: 'completed',
          keyword_generation: keywordResult ? 'completed' : 'failed'
        }
      }
    });
    res.end();

  } catch (error) {
    console.error('Domain processing error:', error);
    sendErrorAndEnd('Processing failed', error instanceof Error ? error.message : 'Unknown error');
  }
}));

// GET /api/domain/:id - Get domain information
router.get('/:id', authenticateToken, asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const domainId = Number(req.params.id);

  if (!domainId) {
    return res.status(400).json({ error: 'Invalid domain ID' });
  }

  try {
    const domain = await prisma.domain.findFirst({
      where: {
        id: domainId,
        userId: authReq.user.userId
      },
      include: {
        crawlResults: {
          orderBy: { createdAt: 'desc' },
          take: 1
        },
        keywordAnalyses: {
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      }
    });

    if (!domain) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    const syncedStep = await syncDomainCurrentStep(domain.id);

    const normalizedCrawlResults = domain.crawlResults.map((crawlResult) => ({
      ...crawlResult,
      analyzedUrls: parseStringArray(crawlResult.analyzedUrls),
      pageSnapshots: parsePageSnapshots(crawlResult.pageSnapshots),
      crawlPolicy: parseCrawlPolicy(crawlResult.crawlPolicy),
      quality: parseCrawlQuality(crawlResult.quality),
      contextJson: parseContextJson(crawlResult.contextJson),
    }));

    res.json({
      success: true,
      ...domain,
      crawlResults: normalizedCrawlResults,
      contextJson: parseContextJson(domain.contextJson),
      summaryContext: parseContextJson(domain.contextJson)?.summaryContext || null,
      currentStep: syncedStep,
    });

  } catch (error) {
    console.error('Error fetching domain:', error);
    res.status(500).json({ error: 'Failed to fetch domain information' });
  }
}));

// PUT /api/domain/:id/current-step - Update domain current step
router.put('/:id/current-step', authenticateToken, asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const domainId = Number(req.params.id);
  const { currentStep } = req.body;

  if (!domainId || isNaN(domainId)) {
    return res.status(400).json({ error: 'Invalid domain ID' });
  }

  if (currentStep === undefined || currentStep === null || currentStep < 0 || currentStep > 4) {
    return res.status(400).json({ error: 'Current step must be between 0 and 4' });
  }

  try {
    // Verify domain access
    const domain = await prisma.domain.findFirst({
      where: {
        id: domainId,
        userId: authReq.user.userId
      }
    });

    if (!domain) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    // Update the current step
    const syncedStep = await syncDomainCurrentStep(domainId, currentStep);

    res.json({
      success: true,
      domain: {
        id: domain.id,
        url: domain.url,
        currentStep: syncedStep,
        updatedAt: domain.updatedAt,
      }
    });

  } catch (error) {
    console.error('Error updating domain current step:', error);
    res.status(500).json({ error: 'Failed to update domain current step' });
  }
}));

// DELETE /api/domain/:id - Delete a domain and related records
router.delete('/:id', authenticateToken, asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const domainId = Number(req.params.id);

  if (!domainId || isNaN(domainId)) {
    return res.status(400).json({ error: 'Invalid domain ID' });
  }

  // Verify the domain belongs to the user
  const domain = await prisma.domain.findFirst({
    where: { id: domainId, userId: authReq.user.userId },
    select: { id: true }
  });

  if (!domain) {
    return res.status(404).json({ error: 'Domain not found' });
  }

  // Collect keyword and phrase ids for cleanup of dependent tables without domainId
  const keywords = await prisma.keyword.findMany({ where: { domainId }, select: { id: true } });
  const keywordIds = keywords.map(k => k.id);
  const phrases = keywordIds.length > 0
    ? await prisma.phrase.findMany({ where: { keywordId: { in: keywordIds } }, select: { id: true } })
    : [];
  const phraseIds = phrases.map(p => p.id);

  // GeneratedIntentPhrase and AIQueryResult cleanup
  const generatedPhrases = await prisma.generatedIntentPhrase.findMany({ where: { domainId }, select: { id: true } });
  const generatedPhraseIds = generatedPhrases.map(p => p.id);
  if (generatedPhraseIds.length > 0) {
    await prisma.aIQueryResult.deleteMany({ where: { phraseId: { in: generatedPhraseIds } } });
  }
  await prisma.relevanceScoreResult.deleteMany({ where: { domainId } });
  await prisma.generatedIntentPhrase.deleteMany({ where: { domainId } });

  // Cleanup models that reference domainId directly (batched where possible)
  await prisma.analysisPhase.deleteMany({ where: { domainId } });
  await prisma.analysisReport.deleteMany({ where: { domainId } });
  await prisma.communityInsight.deleteMany({ where: { domainId } });
  await prisma.communityMiningResult.deleteMany({ where: { domainId } });
  await prisma.competitorAnalysis.deleteMany({ where: { domainId } });
  await prisma.competitorTracking.deleteMany({ where: { domainId } });
  await prisma.crawlResult.deleteMany({ where: { domainId } });
  await prisma.dashboardAnalysis.deleteMany({ where: { domainId } });
  await prisma.intentClassification.deleteMany({ where: { domainId } });
  await prisma.intentPhraseGeneration.deleteMany({ where: { domainId } });
  await prisma.intentClassificationResult.deleteMany({ where: { domainId } });
  await prisma.keywordAnalysis.deleteMany({ where: { domainId } });
  await prisma.modelPerformance.deleteMany({ where: { domainId } });
  await prisma.performanceInsight.deleteMany({ where: { domainId } });
  await prisma.searchPattern.deleteMany({ where: { domainId } });
  await prisma.searchPatternResult.deleteMany({ where: { domainId } });
  await prisma.searchVolumeClassification.deleteMany({ where: { domainId } });
  await prisma.semanticAnalysis.deleteMany({ where: { domainId } });
  await prisma.suggestedCompetitor.deleteMany({ where: { domainId } });

  // Cleanup phrase-dependent models then phrases then keywords
  if (phraseIds.length > 0) {
    await prisma.phraseScore.deleteMany({ where: { phraseId: { in: phraseIds } } });
    await prisma.phraseIntentClassification.deleteMany({ where: { phraseId: { in: phraseIds } } });
    await prisma.phrase.deleteMany({ where: { id: { in: phraseIds } } });
  }
  await prisma.keyword.deleteMany({ where: { domainId } });

  // Finally, delete the domain
  await prisma.domain.delete({ where: { id: domainId } });

  res.json({ success: true });
}));

// PATCH /api/domain/:id - Update domain fields
router.patch('/:id', authenticateToken, asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const domainId = Number(req.params.id);
  const { googleAnalyticsId } = req.body;

  if (!domainId || isNaN(domainId)) {
    return res.status(400).json({ error: 'Invalid domain ID' });
  }

  try {
    // Verify domain access
    const domain = await prisma.domain.findFirst({
      where: {
        id: domainId,
        userId: authReq.user.userId
      }
    });

    if (!domain) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    // Update the domain
    const updatedDomain = await prisma.domain.update({
      where: { id: domainId },
      data: {
        googleAnalyticsId: googleAnalyticsId !== undefined ? googleAnalyticsId : undefined
      }
    });

    res.json({
      success: true,
      domain: updatedDomain
    });

  } catch (error) {
    console.error('Error updating domain:', error);
    res.status(500).json({ error: 'Failed to update domain' });
  }
}));

export default router;
