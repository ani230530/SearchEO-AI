import { Router, Request, Response } from 'express';
import { Prisma, PrismaClient, CampaignPageType, CampaignNodeSource } from '../../generated/prisma';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import {
  generateCampaignTopics,
  generatePillarPageSuggestion,
  generateSubPagesSuggestion,
  generateKeywordsSuggestion
} from '../services/campaignAiService';
import axios from 'axios';
import { decryptToken } from '../services/tokenEncryption';
import { authService } from '../services/authService';
import { saveStreamingMessage, getStreamingMessages } from '../services/streamingService';

const router = Router();
const prisma = new PrismaClient();

// Helper to compute aggregate job status
// Job stays 'generating' until ALL pages are completed
// Only mark as 'failed' if truly failed (not just incomplete)
// ZOMBIE CHECK: If a page has been 'generating' for > 15 mins, consider it stuck/failed
const computeJobStatus = (pages: { status: string; updatedAt: Date }[]) => {
  if (pages.length === 0) return 'pending';

  const now = new Date();
  const STALE_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes

  // Check for active generation
  const isGenerating = pages.some(p => {
    if (p.status === 'generating' || p.status === 'pending') {
      const timeSinceUpdate = now.getTime() - new Date(p.updatedAt).getTime();
      // If it's been generating for < 15 mins, it's still active. 
      // If > 15 mins, we ignore it here (it will fall through to failed check or completed)
      return timeSinceUpdate < STALE_THRESHOLD_MS;
    }
    return false;
  });

  if (isGenerating) return 'generating';

  // If we are here, there are no *active* generating pages.
  // We check if everything is completed.
  if (pages.every(p => p.status === 'completed')) return 'completed';

  // If there are failed pages OR stale pages (generating > 15m), it's failed
  const hasFailuresOrStalls = pages.some(p => {
    if (p.status === 'failed') return true;
    if (p.status === 'generating' || p.status === 'pending') {
      const timeSinceUpdate = now.getTime() - new Date(p.updatedAt).getTime();
      return timeSinceUpdate >= STALE_THRESHOLD_MS;
    }
    return false;
  });

  if (hasFailuresOrStalls) return 'failed';

  return 'completed'; // Fallback
};

function asyncHandler(fn: (req: Request, res: Response, next: any) => Promise<any>) {
  return function (req: Request, res: Response, next: any) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// SSE endpoint for generation updates (auth via token query param because EventSource cannot set headers)
router.get('/events', async (req: Request, res: Response) => {
  try {
    const token = (req.query.token as string) || '';
    if (!token) {
      return res.status(401).end();
    }

    const decoded = await authService.verifyToken(token);
    const userId = decoded.userId;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    (res as any).flushHeaders?.();

    const client: SSEClient = { res };
    addSSEClient(userId, client);

    res.write(`: connected\n\n`);
    const keepAlive = setInterval(() => {
      res.write(': keep-alive\n\n');
    }, 25000);

    req.on('close', () => {
      clearInterval(keepAlive);
      removeSSEClient(userId, client);
      res.end();
    });
  } catch (error) {
    console.error('SSE auth error', error);
    return res.status(403).end();
  }
});

import { addSSEClient, removeSSEClient, broadcastToUser, SSEClient } from '../services/sseService';

type CampaignWithStructure = Prisma.CampaignGetPayload<{
  include: {
    topics: {
      include: {
        pages: {
          include: {
            keywords: true;
          };
        };
        keywords: true;
      };
    };
  };
}>;

type TopicWithRelations = CampaignWithStructure['topics'][number];
type PageWithRelations = TopicWithRelations['pages'][number];

interface SerializedKeyword {
  id: number;
  term: string;
  volume: number;
  difficulty: string;
  intent?: string | null;
  aiMetadata?: any;
}

interface SerializedPage {
  id: number;
  title: string;
  description: string | null;
  summary: string | null;
  pageType: CampaignPageType;
  keywords: SerializedKeyword[];
}

interface SerializedTopic {
  id: number;
  title: string;
  description: string | null;
  status: string;
  source: CampaignNodeSource;
  pillarPage: SerializedPage | null;
  subPages: SerializedPage[];
  keywords: SerializedKeyword[];
}

const DEFAULT_KEYWORD_DIFFICULTY = 'Medium';

const serializeKeyword = (keyword: SerializedKeyword | PageWithRelations['keywords'][number]): SerializedKeyword => ({
  id: keyword.id,
  term: keyword.term,
  volume: keyword.volume ?? 0,
  difficulty: keyword.difficulty || DEFAULT_KEYWORD_DIFFICULTY,
  intent: keyword.intent ?? null,
  aiMetadata: (keyword as any).aiMetadata
});

const serializePage = (page: PageWithRelations): SerializedPage => {
  const serializedKeywords = page.keywords.map(serializeKeyword);

  // Check if any keyword is explicitly marked as primary
  const hasExplicitPrimary = serializedKeywords.some(k => k.aiMetadata?.isPrimary === true);

  if (!hasExplicitPrimary && serializedKeywords.length > 0) {
    // Mark first as primary
    serializedKeywords[0].aiMetadata = {
      ...(serializedKeywords[0].aiMetadata || {}),
      isPrimary: true,
      isLongtail: false
    };

    // Mark rest as longtail if not already set
    for (let i = 1; i < serializedKeywords.length; i++) {
      if (!serializedKeywords[i].aiMetadata?.isLongtail && !serializedKeywords[i].aiMetadata?.isPrimary) {
        serializedKeywords[i].aiMetadata = {
          ...(serializedKeywords[i].aiMetadata || {}),
          isPrimary: false,
          isLongtail: true
        };
      }
    }
  }

  return {
    id: page.id,
    title: page.title,
    description: page.description || null,
    summary: page.summary || page.aiSummary || null,
    pageType: page.pageType,
    keywords: serializedKeywords
  };
};

const serializeTopic = (topic: TopicWithRelations): SerializedTopic => {
  const pillar = topic.pages.find((page) => page.pageType === CampaignPageType.PILLAR) || null;
  const subPages = topic.pages
    .filter((page) => page.pageType === CampaignPageType.SUBPAGE)
    .sort((a, b) => a.order - b.order);

  return {
    id: topic.id,
    title: topic.title,
    description: topic.description || null,
    status: topic.status,
    source: topic.source,
    pillarPage: pillar ? serializePage(pillar) : null,
    subPages: subPages.map(serializePage),
    keywords: topic.keywords.map(serializeKeyword)
  };
};

const serializeStructure = (campaign: CampaignWithStructure) => ({
  topics: campaign.topics
    .slice()
    .sort((a, b) => a.order - b.order)
    .map(serializeTopic)
});

const fetchCampaignStructure = async (campaignId: number, userId: number) => {
  return prisma.campaign.findFirst({
    where: {
      id: campaignId,
      domain: {
        userId,
        isCompanyDomain: true
      }
    },
    include: {
      topics: {
        include: {
          pages: {
            include: {
              keywords: {
                orderBy: { createdAt: 'asc' }
              }
            },
            orderBy: {
              order: 'asc'
            }
          },
          keywords: {
            orderBy: { createdAt: 'asc' }
          }
        }
      }
    }
  });
};

const respondWithStructure = async (res: Response, campaignId: number, userId: number, status = 200) => {
  const campaign = await fetchCampaignStructure(campaignId, userId);
  if (!campaign) {
    return res.status(404).json({
      success: false,
      error: 'Campaign not found'
    });
  }

  return res.status(status).json({
    success: true,
    structure: serializeStructure(campaign)
  });
};

const ensureCampaignOwnership = async (campaignId: number, userId: number) => {
  return prisma.campaign.findFirst({
    where: {
      id: campaignId,
      domain: {
        userId,
        isCompanyDomain: true
      }
    },
    include: {
      domain: {
        select: {
          id: true,
          url: true,
          userId: true,
          isCompanyDomain: true,
          context: true,
          keywords: {
            select: {
              term: true
            }
          }
        }
      }
    }
  });
};

const ensureTopicOwnership = async (topicId: number, userId: number) => {
  return prisma.campaignTopic.findFirst({
    where: {
      id: topicId,
      campaign: {
        domain: {
          userId,
          isCompanyDomain: true
        }
      }
    },
    include: {
      campaign: {
        include: {
          domain: {
            include: {
              keywords: {
                select: { term: true },
                orderBy: { volume: 'desc' },
                take: 25
              }
            }
          }
        }
      }
    }
  });
};

const ensurePageOwnership = async (pageId: number, userId: number) => {
  return prisma.campaignPage.findFirst({
    where: {
      id: pageId,
      topic: {
        campaign: {
          domain: {
            userId,
            isCompanyDomain: true
          }
        }
      }
    },
    include: {
      topic: {
        include: {
          campaign: {
            include: {
              domain: {
                include: {
                  keywords: {
                    select: { term: true },
                    orderBy: { volume: 'desc' },
                    take: 25
                  }
                }
              }
            }
          }
        }
      }
    }
  });
};

const ensureKeywordOwnership = async (keywordId: number, userId: number) => {
  return prisma.campaignKeyword.findFirst({
    where: {
      id: keywordId,
      OR: [
        {
          topic: {
            campaign: {
              domain: {
                userId,
                isCompanyDomain: true
              }
            }
          }
        },
        {
          page: {
            topic: {
              campaign: {
                domain: {
                  userId,
                  isCompanyDomain: true
                }
              }
            }
          }
        }
      ]
    },
    include: {
      page: {
        include: {
          topic: true
        }
      },
      topic: true
    }
  });
};

const extractDomainKeywords = (domain?: { keywords?: { term: string | null }[] }) =>
  domain?.keywords?.map((keyword) => keyword.term).filter(Boolean) as string[] | undefined;

/**
 * GET /api/campaigns
 * Get all campaigns for user's company domain
 */
router.get('/', authenticateToken, asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.user.userId;

  const companyDomain = await prisma.domain.findFirst({
    where: {
      userId,
      isCompanyDomain: true
    }
  });

  if (!companyDomain) {
    return res.json({ success: true, campaigns: [] });
  }

  const campaigns = await prisma.campaign.findMany({
    where: { domainId: companyDomain.id },
    orderBy: { createdAt: 'desc' }
  });

  res.json({
    success: true,
    campaigns: campaigns.map((c) => ({
      id: c.id,
      title: c.title,
      description: c.description,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt
    }))
  });
}));

/**
 * POST /api/campaigns
 * Create a new campaign for user's company domain
 */
router.post('/', authenticateToken, asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.user.userId;
  const { title, description } = req.body;

  if (!title || !title.trim()) {
    return res.status(400).json({
      success: false,
      error: 'Title is required'
    });
  }

  const companyDomain = await prisma.domain.findFirst({
    where: {
      userId,
      isCompanyDomain: true
    }
  });

  if (!companyDomain) {
    return res.status(400).json({
      success: false,
      error: 'Company domain not found. Please set up your company domain first.'
    });
  }

  const campaign = await prisma.campaign.create({
    data: {
      title: title.trim(),
      description: description?.trim() || null,
      domainId: companyDomain.id
    }
  });

  res.status(201).json({
    success: true,
    campaign: {
      id: campaign.id,
      title: campaign.title,
      description: campaign.description,
      createdAt: campaign.createdAt,
      updatedAt: campaign.updatedAt
    }
  });
}));

/**
 * GET /api/campaigns/:id/keywords
 * Get keywords for a campaign's domain
 */
router.get('/:id/keywords', authenticateToken, asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.user.userId;
  const campaignId = parseInt(req.params.id, 10);

  if (isNaN(campaignId)) {
    return res.status(400).json({ success: false, error: 'Invalid campaign ID' });
  }

  const campaign = await ensureCampaignOwnership(campaignId, userId);
  if (!campaign) {
    console.log(`Campaign ${campaignId} not found for user ${userId}`);
    return res.status(404).json({ success: false, error: 'Campaign not found' });
  }

  if (!campaign.domainId) {
    console.log(`Campaign ${campaignId} has no domainId`);
    return res.status(400).json({ success: false, error: 'Campaign has no associated domain' });
  }

  console.log(`Fetching keywords for domainId: ${campaign.domainId}`);

  const keywords = await prisma.keyword.findMany({
    where: {
      domainId: campaign.domainId
    },
    select: {
      id: true,
      term: true,
      volume: true,
      difficulty: true,
      intent: true,
      cpc: true
    },
    orderBy: [
      { volume: 'desc' },
      { term: 'asc' }
    ],
    take: 500 // Limit to top 500 keywords
  });

  console.log(`Found ${keywords.length} keywords for domainId: ${campaign.domainId}`);

  return res.json({
    success: true,
    keywords: keywords.map(k => ({
      id: k.id,
      term: k.term,
      volume: k.volume,
      difficulty: k.difficulty,
      intent: k.intent || null,
      cpc: k.cpc || 0
    }))
  });
}));

/**
 * GET /api/campaigns/:id/structure
 * Fetch nested campaign structure
 */
router.get('/:id/structure', authenticateToken, asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.user.userId;
  const campaignId = parseInt(req.params.id, 10);

  if (isNaN(campaignId)) {
    return res.status(400).json({ success: false, error: 'Invalid campaign ID' });
  }

  return respondWithStructure(res, campaignId, userId);
}));

/**
 * POST /api/campaigns/:id/topics
 * Create a manual topic
 */
router.post('/:id/topics', authenticateToken, asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.user.userId;
  const campaignId = parseInt(req.params.id, 10);
  const { title, description } = req.body;

  if (isNaN(campaignId)) {
    return res.status(400).json({ success: false, error: 'Invalid campaign ID' });
  }
  if (!title || !title.trim()) {
    return res.status(400).json({ success: false, error: 'Topic title is required' });
  }

  const campaign = await ensureCampaignOwnership(campaignId, userId);
  if (!campaign) {
    return res.status(404).json({ success: false, error: 'Campaign not found' });
  }

  const maxOrder = await prisma.campaignTopic.aggregate({
    where: { campaignId },
    _max: { order: true }
  });

  await prisma.campaignTopic.create({
    data: {
      campaignId,
      title: title.trim(),
      description: description?.trim() || null,
      order: (maxOrder._max.order ?? 0) + 1,
      source: CampaignNodeSource.MANUAL
    }
  });

  return respondWithStructure(res, campaignId, userId, 201);
}));

/**
 * POST /api/campaigns/:id/topics/ai
 * AI-generate topics (and optional structure)
 */
router.post('/:id/topics/ai', authenticateToken, asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.user.userId;
  const campaignId = parseInt(req.params.id, 10);
  const { count = 1, focus } = req.body || {};

  if (isNaN(campaignId)) {
    return res.status(400).json({ success: false, error: 'Invalid campaign ID' });
  }

  const campaign = await ensureCampaignOwnership(campaignId, userId);
  if (!campaign) {
    return res.status(404).json({ success: false, error: 'Campaign not found' });
  }

  const domain = campaign.domain;
  if (!domain) {
    return res.status(400).json({ success: false, error: 'Company domain not found for this campaign' });
  }

  const generatedTopics = await generateCampaignTopics({
    domainUrl: domain.url,
    domainContext: domain.context,
    keywords: extractDomainKeywords(domain),
    count,
    focus
  });

  await prisma.$transaction(async (tx) => {
    const orderAggregate = await tx.campaignTopic.aggregate({
      where: { campaignId },
      _max: { order: true }
    });
    let orderCursor = (orderAggregate._max.order ?? 0) + 1;

    for (const generatedTopic of generatedTopics) {
      const topic = await tx.campaignTopic.create({
        data: {
          campaignId,
          title: generatedTopic.title,
          description: generatedTopic.description || null,
          order: orderCursor++,
          source: CampaignNodeSource.AI,
          aiMetadata: {
            generatedAt: new Date().toISOString(),
            focus: focus || null
          }
        }
      });

      if (generatedTopic.pillarPage) {
        const pillar = await tx.campaignPage.create({
          data: {
            topicId: topic.id,
            pageType: CampaignPageType.PILLAR,
            title: generatedTopic.pillarPage.title,
            description: generatedTopic.pillarPage.summary || null,
            summary: generatedTopic.pillarPage.summary || null,
            source: CampaignNodeSource.AI,
            aiMetadata: {
              generatedAt: new Date().toISOString(),
              origin: 'topics_ai'
            }
          }
        });

        if (generatedTopic.pillarPage.keywords?.length) {
          await tx.campaignKeyword.createMany({
            data: generatedTopic.pillarPage.keywords.map((kw) => ({
              term: kw.term,
              volume: kw.volume ?? null,
              difficulty: kw.difficulty || DEFAULT_KEYWORD_DIFFICULTY,
              intent: kw.intent || null,
              topicId: topic.id,
              pageId: pillar.id,
              source: CampaignNodeSource.AI,
              aiMetadata: { generatedAt: new Date().toISOString(), origin: 'topics_ai' }
            }))
          });
        }
      }

      if (generatedTopic.subPages?.length) {
        let subOrder = 1;
        for (const subPage of generatedTopic.subPages) {
          const page = await tx.campaignPage.create({
            data: {
              topicId: topic.id,
              pageType: CampaignPageType.SUBPAGE,
              title: subPage.title,
              description: subPage.summary || null,
              summary: subPage.summary || null,
              order: subOrder++,
              source: CampaignNodeSource.AI,
              aiMetadata: { generatedAt: new Date().toISOString(), origin: 'topics_ai' }
            }
          });

          if (subPage.keywords?.length) {
            await tx.campaignKeyword.createMany({
              data: subPage.keywords.map((kw) => ({
                term: kw.term,
                volume: kw.volume ?? null,
                difficulty: kw.difficulty || DEFAULT_KEYWORD_DIFFICULTY,
                intent: kw.intent || null,
                topicId: topic.id,
                pageId: page.id,
                source: CampaignNodeSource.AI,
                aiMetadata: { generatedAt: new Date().toISOString(), origin: 'topics_ai' }
              }))
            });
          }
        }
      }
    }
  });

  return respondWithStructure(res, campaignId, userId, 201);
}));

/**
 * DELETE /api/campaigns/topics/:topicId
 * Delete topic and its descendants
 */
router.delete('/topics/:topicId', authenticateToken, asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.user.userId;
  const topicId = parseInt(req.params.topicId, 10);

  if (isNaN(topicId)) {
    return res.status(400).json({ success: false, error: 'Invalid topic ID' });
  }

  const topic = await ensureTopicOwnership(topicId, userId);
  if (!topic) {
    return res.status(404).json({ success: false, error: 'Topic not found' });
  }

  await prisma.$transaction(async (tx) => {
    // Manually delete related GenerationJobs first due to missing Cascade on schema
    await tx.generationJob.deleteMany({
      where: { topicId }
    });
    await tx.campaignTopic.delete({ where: { id: topicId } });
  });
  return respondWithStructure(res, topic.campaignId, userId);
}));

/**
 * POST /api/campaigns/topics/:topicId/pillar
 * Upsert manual pillar page
 */
router.post('/topics/:topicId/pillar', authenticateToken, asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.user.userId;
  const topicId = parseInt(req.params.topicId, 10);
  const { title, summary } = req.body || {};

  if (isNaN(topicId)) {
    return res.status(400).json({ success: false, error: 'Invalid topic ID' });
  }
  if (!title || !title.trim()) {
    return res.status(400).json({ success: false, error: 'Pillar page title is required' });
  }

  const topic = await ensureTopicOwnership(topicId, userId);
  if (!topic) {
    return res.status(404).json({ success: false, error: 'Topic not found' });
  }

  const existingPillar = await prisma.campaignPage.findFirst({
    where: { topicId, pageType: CampaignPageType.PILLAR }
  });

  if (existingPillar) {
    await prisma.campaignPage.update({
      where: { id: existingPillar.id },
      data: {
        title: title.trim(),
        description: summary?.trim() || null,
        summary: summary?.trim() || null,
        source: CampaignNodeSource.MANUAL
      }
    });
  } else {
    await prisma.campaignPage.create({
      data: {
        topicId,
        pageType: CampaignPageType.PILLAR,
        title: title.trim(),
        description: summary?.trim() || null,
        summary: summary?.trim() || null,
        source: CampaignNodeSource.MANUAL
      }
    });
  }

  return respondWithStructure(res, topic.campaignId, userId);
}));

/**
 * POST /api/campaigns/topics/:topicId/pillar/ai
 * AI-generate pillar page suggestion
 */
router.post('/topics/:topicId/pillar/ai', authenticateToken, asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.user.userId;
  const topicId = parseInt(req.params.topicId, 10);

  if (isNaN(topicId)) {
    return res.status(400).json({ success: false, error: 'Invalid topic ID' });
  }

  const topic = await ensureTopicOwnership(topicId, userId);
  if (!topic) {
    return res.status(404).json({ success: false, error: 'Topic not found' });
  }

  const campaign = topic.campaign;
  const domain = campaign?.domain;
  if (!domain) {
    return res.status(400).json({ success: false, error: 'Company domain missing for this topic' });
  }

  const suggestion = await generatePillarPageSuggestion({
    domainUrl: domain.url,
    domainContext: domain.context,
    keywords: extractDomainKeywords(domain),
    topicTitle: topic.title
  });

  const existingPillar = await prisma.campaignPage.findFirst({
    where: { topicId, pageType: CampaignPageType.PILLAR }
  });

  let pillar;
  if (existingPillar) {
    pillar = await prisma.campaignPage.update({
      where: { id: existingPillar.id },
      data: {
        title: suggestion.title,
        description: suggestion.summary || null,
        summary: suggestion.summary || null,
        source: CampaignNodeSource.AI,
        aiMetadata: { generatedAt: new Date().toISOString(), origin: 'pillar_ai' }
      }
    });
  } else {
    pillar = await prisma.campaignPage.create({
      data: {
        topicId,
        pageType: CampaignPageType.PILLAR,
        title: suggestion.title,
        description: suggestion.summary || null,
        summary: suggestion.summary || null,
        source: CampaignNodeSource.AI,
        aiMetadata: { generatedAt: new Date().toISOString(), origin: 'pillar_ai' }
      }
    });
  }

  if (suggestion.keywords?.length) {
    await prisma.campaignKeyword.createMany({
      data: suggestion.keywords.map((kw) => ({
        term: kw.term,
        volume: kw.volume ?? null,
        difficulty: kw.difficulty || DEFAULT_KEYWORD_DIFFICULTY,
        intent: kw.intent || null,
        topicId,
        pageId: pillar.id,
        source: CampaignNodeSource.AI,
        aiMetadata: { generatedAt: new Date().toISOString(), origin: 'pillar_ai' }
      })),
      skipDuplicates: true
    });
  }

  return respondWithStructure(res, topic.campaignId, userId);
}));

/**
 * DELETE /api/campaigns/topics/:topicId/pillar
 */
router.delete('/topics/:topicId/pillar', authenticateToken, asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.user.userId;
  const topicId = parseInt(req.params.topicId, 10);

  if (isNaN(topicId)) {
    return res.status(400).json({ success: false, error: 'Invalid topic ID' });
  }

  const topic = await ensureTopicOwnership(topicId, userId);
  if (!topic) {
    return res.status(404).json({ success: false, error: 'Topic not found' });
  }

  await prisma.campaignPage.deleteMany({
    where: { topicId, pageType: CampaignPageType.PILLAR }
  });

  return respondWithStructure(res, topic.campaignId, userId);
}));

/**
 * POST /api/campaigns/topics/:topicId/subpages
 * Create manual sub-page
 */
router.post('/topics/:topicId/subpages', authenticateToken, asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.user.userId;
  const topicId = parseInt(req.params.topicId, 10);
  const { title, summary } = req.body || {};

  if (isNaN(topicId)) {
    return res.status(400).json({ success: false, error: 'Invalid topic ID' });
  }
  if (!title || !title.trim()) {
    return res.status(400).json({ success: false, error: 'Sub-page title is required' });
  }

  const topic = await ensureTopicOwnership(topicId, userId);
  if (!topic) {
    return res.status(404).json({ success: false, error: 'Topic not found' });
  }

  const maxOrder = await prisma.campaignPage.aggregate({
    where: { topicId, pageType: CampaignPageType.SUBPAGE },
    _max: { order: true }
  });

  await prisma.campaignPage.create({
    data: {
      topicId,
      pageType: CampaignPageType.SUBPAGE,
      title: title.trim(),
      description: summary?.trim() || null,
      summary: summary?.trim() || null,
      order: (maxOrder._max.order ?? 0) + 1,
      source: CampaignNodeSource.MANUAL
    }
  });

  return respondWithStructure(res, topic.campaignId, userId, 201);
}));

/**
 * POST /api/campaigns/topics/:topicId/subpages/ai
 * AI-generate supporting sub-pages
 */
router.post('/topics/:topicId/subpages/ai', authenticateToken, asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.user.userId;
  const topicId = parseInt(req.params.topicId, 10);
  const { count = 2 } = req.body || {};

  if (isNaN(topicId)) {
    return res.status(400).json({ success: false, error: 'Invalid topic ID' });
  }

  const topic = await ensureTopicOwnership(topicId, userId);
  if (!topic) {
    return res.status(404).json({ success: false, error: 'Topic not found' });
  }

  const campaign = topic.campaign;
  const domain = campaign?.domain;
  if (!domain) {
    return res.status(400).json({ success: false, error: 'Company domain missing for this topic' });
  }

  const suggestions = await generateSubPagesSuggestion({
    domainUrl: domain.url,
    domainContext: domain.context,
    keywords: extractDomainKeywords(domain),
    topicTitle: topic.title,
    count
  });

  await prisma.$transaction(async (tx) => {
    const orderAggregate = await tx.campaignPage.aggregate({
      where: { topicId, pageType: CampaignPageType.SUBPAGE },
      _max: { order: true }
    });
    let orderCursor = (orderAggregate._max.order ?? 0) + 1;

    for (const suggestion of suggestions) {
      const page = await tx.campaignPage.create({
        data: {
          topicId,
          pageType: CampaignPageType.SUBPAGE,
          title: suggestion.title,
          description: suggestion.summary || null,
          summary: suggestion.summary || null,
          order: orderCursor++,
          source: CampaignNodeSource.AI,
          aiMetadata: { generatedAt: new Date().toISOString(), origin: 'subpage_ai' }
        }
      });

      if (suggestion.keywords?.length) {
        await tx.campaignKeyword.createMany({
          data: suggestion.keywords.map((kw) => ({
            term: kw.term,
            volume: kw.volume ?? null,
            difficulty: kw.difficulty || DEFAULT_KEYWORD_DIFFICULTY,
            intent: kw.intent || null,
            topicId,
            pageId: page.id,
            source: CampaignNodeSource.AI,
            aiMetadata: { generatedAt: new Date().toISOString(), origin: 'subpage_ai' }
          }))
        });
      }
    }
  });

  return respondWithStructure(res, topic.campaignId, userId, 201);
}));

/**
 * DELETE /api/campaigns/pages/:pageId
 */
router.delete('/pages/:pageId', authenticateToken, asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.user.userId;
  const pageId = parseInt(req.params.pageId, 10);

  if (isNaN(pageId)) {
    return res.status(400).json({ success: false, error: 'Invalid page ID' });
  }

  const page = await ensurePageOwnership(pageId, userId);
  if (!page) {
    return res.status(404).json({ success: false, error: 'Page not found' });
  }

  await prisma.$transaction(async (tx) => {
    // Cleanup generation job pages that reference this page
    // (Explicitly doing this to prevent foreign key errors or orphaned data)
    await tx.generationJobPage.deleteMany({
      where: { pageId }
    });
    await tx.campaignPage.delete({ where: { id: pageId } });
  });
  return respondWithStructure(res, page.topic.campaignId, userId);
}));

/**
 * POST /api/campaigns/pages/:pageId/keywords
 * Add manual keyword to page
 */
router.post('/pages/:pageId/keywords', authenticateToken, asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.user.userId;
  const pageId = parseInt(req.params.pageId, 10);
  const { term, volume, difficulty, intent, keywordType } = req.body || {}; // keywordType: 'primary' | 'longtail'

  if (isNaN(pageId)) {
    return res.status(400).json({ success: false, error: 'Invalid page ID' });
  }
  if (!term || !term.trim()) {
    return res.status(400).json({ success: false, error: 'Keyword term is required' });
  }

  const page = await ensurePageOwnership(pageId, userId);
  if (!page) {
    return res.status(404).json({ success: false, error: 'Page not found' });
  }

  // Prepare aiMetadata based on keywordType
  let aiMetadata: any = {};
  if (keywordType === 'primary') {
    // If setting as primary, clear existing primary first
    const existingPrimaries = await prisma.campaignKeyword.findMany({
      where: {
        pageId,
        topicId: page.topicId
      }
    });

    for (const existingPrimary of existingPrimaries) {
      const existingMetadata = (existingPrimary.aiMetadata as any) || {};
      if (existingMetadata.isPrimary) {
        await prisma.campaignKeyword.update({
          where: { id: existingPrimary.id },
          data: {
            aiMetadata: {
              ...existingMetadata,
              isPrimary: false
            }
          }
        });
      }
    }

    aiMetadata = { isPrimary: true, isLongtail: false };
  } else if (keywordType === 'longtail') {
    aiMetadata = { isPrimary: false, isLongtail: true };
  }

  await prisma.campaignKeyword.create({
    data: {
      term: term.trim(),
      volume: Number.isFinite(volume) ? Number(volume) : null,
      difficulty: difficulty || DEFAULT_KEYWORD_DIFFICULTY,
      intent: intent || null,
      topicId: page.topicId,
      pageId,
      source: CampaignNodeSource.MANUAL,
      aiMetadata: Object.keys(aiMetadata).length > 0 ? aiMetadata : undefined
    }
  });

  return respondWithStructure(res, page.topic.campaignId, userId, 201);
}));

/**
 * POST /api/campaigns/pages/:pageId/keywords/ai
 * AI-generate keywords for a page
 */
router.post('/pages/:pageId/keywords/ai', authenticateToken, asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.user.userId;
  const pageId = parseInt(req.params.pageId, 10);
  const { count = 5, keywordType } = req.body || {}; // keywordType: 'primary' | 'longtail' | undefined

  if (isNaN(pageId)) {
    return res.status(400).json({ success: false, error: 'Invalid page ID' });
  }

  const page = await ensurePageOwnership(pageId, userId);
  if (!page) {
    return res.status(404).json({ success: false, error: 'Page not found' });
  }

  const topic = page.topic;
  const campaign = topic?.campaign;
  const domain = campaign?.domain;
  if (!domain) {
    return res.status(400).json({ success: false, error: 'Company domain missing for this page' });
  }

  // Determine count and metadata based on keywordType
  let generateCount = count;
  let shouldMarkAsPrimary = false;
  let shouldMarkAsLongtail = false;

  if (keywordType === 'primary') {
    generateCount = 1; // Only generate 1 keyword for primary
    shouldMarkAsPrimary = true;
  } else if (keywordType === 'longtail') {
    generateCount = count || 3; // Generate multiple for longtail
    shouldMarkAsLongtail = true;
  }

  const suggestions = await generateKeywordsSuggestion({
    domainUrl: domain.url,
    domainContext: domain.context,
    keywords: extractDomainKeywords(domain),
    topicTitle: topic?.title,
    pageTitle: page.title,
    count: generateCount
  });

  // Prepare metadata for each keyword based on type
  const keywordsToCreate = suggestions.map((kw, index) => {
    let aiMetadata: any = { generatedAt: new Date().toISOString(), origin: 'keyword_ai' };

    if (shouldMarkAsPrimary) {
      aiMetadata.isPrimary = true;
      aiMetadata.isLongtail = false;
    } else if (shouldMarkAsLongtail) {
      aiMetadata.isPrimary = false;
      aiMetadata.isLongtail = true;
    }

    return {
      term: kw.term,
      volume: kw.volume ?? null,
      difficulty: kw.difficulty || DEFAULT_KEYWORD_DIFFICULTY,
      intent: kw.intent || null,
      topicId: page.topicId,
      pageId,
      source: CampaignNodeSource.AI,
      aiMetadata
    };
  });

  await prisma.campaignKeyword.createMany({
    data: keywordsToCreate,
    skipDuplicates: true
  });

  // If marking as primary, clear existing primary keywords for this page
  if (shouldMarkAsPrimary && keywordsToCreate.length > 0) {
    const createdKeywords = await prisma.campaignKeyword.findMany({
      where: {
        pageId,
        topicId: page.topicId,
        term: { in: suggestions.map(s => s.term) }
      },
      orderBy: { createdAt: 'desc' },
      take: suggestions.length
    });

    if (createdKeywords.length > 0) {
      const newPrimaryKeyword = createdKeywords[0];

      // Clear all other primary keywords for this page
      const existingPrimaries = await prisma.campaignKeyword.findMany({
        where: {
          pageId,
          topicId: page.topicId,
          id: { not: newPrimaryKeyword.id }
        }
      });

      for (const existingPrimary of existingPrimaries) {
        const existingMetadata = (existingPrimary.aiMetadata as any) || {};
        if (existingMetadata.isPrimary) {
          await prisma.campaignKeyword.update({
            where: { id: existingPrimary.id },
            data: {
              aiMetadata: {
                ...existingMetadata,
                isPrimary: false
              }
            }
          });
        }
      }
    }
  }

  return respondWithStructure(res, page.topic.campaignId, userId, 201);
}));

/**
 * POST /api/campaigns/keywords/:keywordId/select-primary
 * Mark a keyword as primary (automatically clears other primary selections for the same page)
 */
router.post('/keywords/:keywordId/select-primary', authenticateToken, asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.user.userId;
  const keywordId = parseInt(req.params.keywordId, 10);

  if (isNaN(keywordId)) {
    return res.status(400).json({ success: false, error: 'Invalid keyword ID' });
  }

  const keyword = await ensureKeywordOwnership(keywordId, userId);
  if (!keyword) {
    return res.status(404).json({ success: false, error: 'Keyword not found' });
  }

  if (!keyword.pageId) {
    return res.status(400).json({ success: false, error: 'Keyword must be associated with a page' });
  }

  // Clear ALL existing primary keywords for this page (ensure only one primary per page)
  const existingPrimaries = await prisma.campaignKeyword.findMany({
    where: {
      pageId: keyword.pageId,
      topicId: keyword.topicId,
      id: { not: keywordId }
    }
  });

  // Update all existing primary keywords to remove primary flag
  for (const existingPrimary of existingPrimaries) {
    const existingMetadata = (existingPrimary.aiMetadata as any) || {};
    if (existingMetadata.isPrimary) {
      await prisma.campaignKeyword.update({
        where: { id: existingPrimary.id },
        data: {
          aiMetadata: {
            ...existingMetadata,
            isPrimary: false
          }
        }
      });
    }
  }

  // Set this keyword as primary
  const metadata = (keyword.aiMetadata as any) || {};
  await prisma.campaignKeyword.update({
    where: { id: keywordId },
    data: {
      aiMetadata: {
        ...metadata,
        isPrimary: true,
        isLongtail: false
      }
    }
  });

  const campaignId = keyword.topic
    ? keyword.topic.campaignId
    : keyword.page?.topic.campaignId;

  if (!campaignId) {
    return res.json({ success: true });
  }

  return respondWithStructure(res, campaignId, userId);
}));

/**
 * POST /api/campaigns/keywords/:keywordId/select-longtail
 * Mark a keyword as longtail
 */
router.post('/keywords/:keywordId/select-longtail', authenticateToken, asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.user.userId;
  const keywordId = parseInt(req.params.keywordId, 10);

  if (isNaN(keywordId)) {
    return res.status(400).json({ success: false, error: 'Invalid keyword ID' });
  }

  const keyword = await ensureKeywordOwnership(keywordId, userId);
  if (!keyword) {
    return res.status(404).json({ success: false, error: 'Keyword not found' });
  }

  if (!keyword.pageId) {
    return res.status(400).json({ success: false, error: 'Keyword must be associated with a page' });
  }

  // Set this keyword as longtail (and clear primary if it was primary)
  const metadata = (keyword.aiMetadata as any) || {};
  await prisma.campaignKeyword.update({
    where: { id: keywordId },
    data: {
      aiMetadata: {
        ...metadata,
        isPrimary: false,
        isLongtail: true
      }
    }
  });

  const campaignId = keyword.topic
    ? keyword.topic.campaignId
    : keyword.page?.topic.campaignId;

  if (!campaignId) {
    return res.json({ success: true });
  }

  return respondWithStructure(res, campaignId, userId);
}));

/**
 * POST /api/campaigns/keywords/:keywordId/deselect
 * Remove primary/longtail selection from a keyword
 */
router.post('/keywords/:keywordId/deselect', authenticateToken, asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.user.userId;
  const keywordId = parseInt(req.params.keywordId, 10);

  if (isNaN(keywordId)) {
    return res.status(400).json({ success: false, error: 'Invalid keyword ID' });
  }

  const keyword = await ensureKeywordOwnership(keywordId, userId);
  if (!keyword) {
    return res.status(404).json({ success: false, error: 'Keyword not found' });
  }

  // Clear selection flags
  const metadata = (keyword.aiMetadata as any) || {};
  await prisma.campaignKeyword.update({
    where: { id: keywordId },
    data: {
      aiMetadata: {
        ...metadata,
        isPrimary: false,
        isLongtail: false
      }
    }
  });

  const campaignId = keyword.topic
    ? keyword.topic.campaignId
    : keyword.page?.topic.campaignId;

  if (!campaignId) {
    return res.json({ success: true });
  }

  return respondWithStructure(res, campaignId, userId);
}));

/**
 * DELETE /api/campaigns/keywords/:keywordId
 */
router.delete('/keywords/:keywordId', authenticateToken, asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.user.userId;
  const keywordId = parseInt(req.params.keywordId, 10);

  if (isNaN(keywordId)) {
    return res.status(400).json({ success: false, error: 'Invalid keyword ID' });
  }

  const keyword = await ensureKeywordOwnership(keywordId, userId);
  if (!keyword) {
    return res.status(404).json({ success: false, error: 'Keyword not found' });
  }

  await prisma.campaignKeyword.delete({ where: { id: keywordId } });

  const campaignId = keyword.topic
    ? keyword.topic.campaignId
    : keyword.page?.topic.campaignId;

  if (!campaignId) {
    return res.json({ success: true });
  }

  return respondWithStructure(res, campaignId, userId);
}));

/**
 * DELETE /api/campaigns/:id
 * Delete a campaign
 */
router.delete('/:id', authenticateToken, asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.user.userId;
  const campaignId = parseInt(req.params.id, 10);

  if (isNaN(campaignId)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid campaign ID'
    });
  }

  const campaign = await prisma.campaign.findFirst({
    where: {
      id: campaignId,
      domain: {
        userId,
        isCompanyDomain: true
      }
    }
  });

  if (!campaign) {
    return res.status(404).json({
      success: false,
      error: 'Campaign not found'
    });
  }

  await prisma.$transaction(async (tx) => {
    // 1. Find all topics to get their IDs so we can clean up jobs
    const topics = await tx.campaignTopic.findMany({
      where: { campaignId },
      select: { id: true }
    });
    const topicIds = topics.map(t => t.id);

    if (topicIds.length > 0) {
      // 2. Delete all GenerationJobs for these topics
      // (This is required because GenerationJob -> CampaignTopic is not cascade delete)
      await tx.generationJob.deleteMany({
        where: { topicId: { in: topicIds } }
      });
    }

    // 3. Delete the campaign (this will cascade to topics/pages/keywords)
    await tx.campaign.delete({
      where: { id: campaignId }
    });
  });

  res.json({
    success: true,
    message: 'Campaign deleted successfully'
  });
}));

/**
 * POST /api/campaigns/topics/:topicId/generate-content
 * Generate content for all pages in a topic (pillar + sub-pages)
 */
router.post('/topics/:topicId/generate-content', authenticateToken, asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.user.userId;
  const topicId = parseInt(req.params.topicId, 10);

  if (isNaN(topicId)) {
    return res.status(400).json({ success: false, error: 'Invalid topic ID' });
  }

  const topic = await prisma.campaignTopic.findFirst({
    where: {
      id: topicId,
      campaign: {
        domain: {
          userId,
          isCompanyDomain: true
        }
      }
    },
    include: {
      pages: {
        include: {
          keywords: true
        }
      },
      campaign: {
        include: {
          domain: true
        }
      }
    }
  });

  if (!topic) {
    return res.status(404).json({ success: false, error: 'Topic not found' });
  }

  const pillarPage = topic.pages.find(p => p.pageType === CampaignPageType.PILLAR);
  const subPages = topic.pages.filter(p => p.pageType === CampaignPageType.SUBPAGE);

  if (!pillarPage || subPages.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Topic must have a pillar page and at least one sub-page'
    });
  }

  // Get WordPress integration
  const integration = await prisma.wordpressIntegration.findUnique({
    where: { userId }
  });

  if (!integration) {
    return res.status(400).json({
      success: false,
      error: 'WordPress integration not found'
    });
  }

  // Create generation job
  const jobId = `job_${topicId}_${Date.now()}`;

  // Upsert draft entries for each page (update if exists, create if not)
  // Each page has only one draft - we update it on regenerate
  // Since pageId is stored in JSON, fetch all user drafts and match by pageId
  const allUserDrafts = await prisma.wordpressPublishLog.findMany({
    where: { userId }
  });

  const findDraftByPageId = (pageId: number) => {
    return allUserDrafts.find(draft => {
      const resp = draft.response as any;
      return resp?.pageId === pageId;
    });
  };

  // Helper function to get primary keyword from keywords array
  const getPrimaryKeyword = (keywords: any[]) => {
    const primary = keywords.find((kw: any) => {
      const metadata = kw.aiMetadata as any;
      return metadata?.isPrimary === true;
    });
    return primary?.term || keywords[0]?.term || '';
  };

  const draftPromises = [
    (async () => {
      const existingDraft = findDraftByPageId(pillarPage.id);
      const primaryKeyword = getPrimaryKeyword(pillarPage.keywords);
      const draftData = {
        userId,
        primaryKeyword: primaryKeyword || pillarPage.title,
        title: `${pillarPage.title} - Generating...`,
        wordpressUrl: integration.siteUrl,
        status: 'generating',
        response: {
          jobId,
          pageId: pillarPage.id,
          pageType: 'pillar',
          status: 'pending'
        },
        integrationId: integration.id,
      };

      if (existingDraft) {
        // Update existing draft (overwrite HTML on regenerate)
        return prisma.wordpressPublishLog.update({
          where: { id: existingDraft.id },
          data: draftData
        });
      } else {
        // Create new draft
        return prisma.wordpressPublishLog.create({
          data: draftData
        });
      }
    })(),
    ...subPages.map(subPage =>
      (async () => {
        const existingDraft = findDraftByPageId(subPage.id);
        const primaryKeyword = getPrimaryKeyword(subPage.keywords);
        const draftData = {
          userId,
          primaryKeyword: primaryKeyword || subPage.title,
          title: `${subPage.title} - Generating...`,
          wordpressUrl: integration.siteUrl,
          status: 'generating',
          response: {
            jobId,
            pageId: subPage.id,
            pageType: 'subpage',
            status: 'pending'
          },
          integrationId: integration.id,
        };

        if (existingDraft) {
          // Update existing draft (overwrite HTML on regenerate)
          return prisma.wordpressPublishLog.update({
            where: { id: existingDraft.id },
            data: draftData
          });
        } else {
          // Create new draft
          return prisma.wordpressPublishLog.create({
            data: draftData
          });
        }
      })()
    )
  ];

  const drafts = await Promise.all(draftPromises);

  // Create generation job and page rows
  await prisma.generationJob.create({
    data: {
      jobId,
      topicId,
      userId,
      status: 'generating',
      pages: {
        create: [
          {
            pageId: pillarPage.id,
            pageType: 'pillar',
            status: 'pending',
            draftId: drafts[0].id,
            primaryKeyword: getPrimaryKeyword(pillarPage.keywords) || pillarPage.title,
          },
          ...subPages.map((sp, idx) => ({
            pageId: sp.id,
            pageType: 'subpage',
            status: 'pending',
            draftId: drafts[idx + 1].id,
            primaryKeyword: getPrimaryKeyword(sp.keywords) || sp.title,
          }))
        ]
      }
    }
  });

  // Broadcast initial pending drafts to SSE clients
  broadcastToUser(userId, {
    type: 'drafts',
    jobId,
    topicId,
    pages: [
      {
        pageId: pillarPage.id,
        pageType: 'pillar',
        status: 'pending',
        draftId: drafts[0].id,
        primaryKeyword: getPrimaryKeyword(pillarPage.keywords) || pillarPage.title,
        hasHtml: false,
        progress: 0
      },
      ...subPages.map((sp, idx) => ({
        pageId: sp.id,
        pageType: 'subpage',
        status: 'pending',
        draftId: drafts[idx + 1].id,
        primaryKeyword: getPrimaryKeyword(sp.keywords) || sp.title,
        hasHtml: false,
        progress: 0
      }))
    ]
  });

  // Call n8n webhook asynchronously (don't wait for response)
  let decryptedPassword: string;
  try {
    decryptedPassword = decryptToken(integration.password);
  } catch (error) {
    console.error('Failed to decrypt WordPress password:', error);
    return res.status(400).json({
      success: false,
      error: 'WordPress integration password cannot be decrypted. Please reconfigure your WordPress integration in settings.'
    });
  }

  const sanitizedDomainName = topic.campaign.domain.url
    ?.replace(/^https?:\/\//i, '')
    ?.replace(/^www\./i, '')
    ?.split('/')[0] || 'Brand';

  // Construct callback URL from environment variable (for deployment/prod) or fallback to request host
  // Set CALLBACK_BASE_URL env var in deployment/production (e.g., https://your-domain.com)
  // For local development, it will use the request host
  const callbackBaseUrl = process.env.CALLBACK_BASE_URL || `${req.protocol}://${req.get('host')}`;
  const callbackUrl = `${callbackBaseUrl}/api/campaigns/generation-webhook`;

  // Construct streaming URL from environment variable (for deployment/prod) or fallback to callback base URL
  // Set STREAMING_BASE_URL env var in deployment/production (e.g., https://your-domain.com)
  // Falls back to CALLBACK_BASE_URL if not set, then to request host for local development
  const streamingBaseUrl = process.env.STREAMING_BASE_URL || callbackBaseUrl;
  const streamingUrl = `${streamingBaseUrl}/api/campaigns/streaming-webhook`;

  const payload = {
    ...req.body,
    // Include job_id so n8n can return it in the callback
    // job_id is unique and sufficient to identify the request
    job_id: jobId,
    callback_url: callbackUrl, // Environment-based callback URL for n8n to call back
    streaming_url: streamingUrl, // Environment-based streaming URL for n8n to send progress updates
    wordpress: {
      username: integration.username,
      password: decryptedPassword,
      url: integration.siteUrl,
    }
  };

  // Log sanitized payload details for debugging (avoid logging passwords)
  console.log('[generation-init] Sending payload to n8n', {
    jobId,
    topicId,
    campaignId: topic.campaignId,
    pillarKeyword: getPrimaryKeyword(pillarPage.keywords) || pillarPage.title,
    subPageCount: subPages.length,
    callbackUrl: payload.callback_url,
    callbackBaseUrl: callbackBaseUrl, // Log the base URL used
    streamingUrl: payload.streaming_url,
    streamingBaseUrl: streamingBaseUrl, // Log the streaming base URL used
    wordpressUrl: payload.wordpress?.url,
    usingEnvCallbackUrl: !!process.env.CALLBACK_BASE_URL, // Indicate if env var is set
    usingEnvStreamingUrl: !!process.env.STREAMING_BASE_URL, // Indicate if streaming env var is set
  });

  // Fire and forget - process in background
  const PILLAR_WEBHOOK_URL = process.env.N8N_PILLAR_WEBHOOK_URL || 'https://n8n.srv891599.hstgr.cloud/webhook/d235dd55-3392-4093-b3dd-095baf5c337b';
  const N8N_API_KEY = process.env.N8N_API_KEY || '1234';
  const N8N_API_KEY_HEADER = process.env.N8N_API_KEY_HEADER || 'key';

  // Add to Queue (Job Type: CAMPAIGN_GENERATION)
  // This will handle retries and persistence across restarts
  const { addN8nJob, JOB_TYPES } = await import('../services/queueService');
  await addN8nJob(JOB_TYPES.CAMPAIGN_GENERATION, {
    url: PILLAR_WEBHOOK_URL,
    payload,
    headers: {
      'Content-Type': 'application/json',
      [N8N_API_KEY_HEADER]: N8N_API_KEY,
    },
    // Timeout 10 mins as per original logic, though we don't expect a response here
    // since the worker will just fire-and-forget (as per our queueService implementation for this job type)
    timeout: 600000,
    meta: {
      jobId,
      userId,
      topicId
    }
  });

  res.json({
    success: true,
    jobId,
    pages: [
      { pageId: pillarPage.id, pageType: 'pillar', draftId: drafts[0].id },
      ...subPages.map((sp, idx) => ({
        pageId: sp.id,
        pageType: 'subpage',
        draftId: drafts[idx + 1].id
      }))
    ]
  });
}));

/**
 * GET /api/campaigns/generation-status/:jobId
 * Get status of generation job
 */
router.get('/generation-status/:jobId', authenticateToken, asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.user.userId;
  const jobId = req.params.jobId;

  // Find all drafts with this jobId
  // Note: Prisma JSON filtering might not work as expected, so we'll fetch and filter in code
  const allDrafts = await prisma.wordpressPublishLog.findMany({
    where: {
      userId,
      status: { in: ['generating', 'draft'] }
    }
  });

  const drafts = allDrafts.filter(draft => {
    const response = draft.response as any;
    return response?.jobId === jobId;
  });

  const pages = drafts.map(draft => {
    const response = draft.response as any;
    // Check if draft has htmlContent in response - that means it's completed
    const hasContent = response?.htmlContent || response?.['Html Content'];
    const statusFromResponse = response?.status;

    // Determine status: if has content or status is 'completed', it's done
    let status = 'generating';
    if (hasContent || statusFromResponse === 'completed') {
      status = 'completed';
    } else if (statusFromResponse === 'failed') {
      status = 'failed';
    } else if (statusFromResponse === 'pending') {
      status = 'pending';
    } else if (draft.status === 'generating') {
      status = 'generating';
    }

    return {
      pageId: response.pageId,
      pageType: response.pageType,
      status,
      progress: hasContent ? 100 : (response.progress || 0),
      draftId: draft.id
    };
  });

  const allCompleted = pages.every(p => p.status === 'completed');
  const allFailed = pages.every(p => p.status === 'failed');
  const anyGenerating = pages.some(p => p.status === 'generating' || p.status === 'pending');

  res.json({
    success: true,
    status: {
      status: allCompleted ? 'completed' : allFailed ? 'failed' : anyGenerating ? 'generating' : 'pending'
    },
    pages
  });
}));

/**
 * ============================================================================
 * API ENDPOINT FOR N8N CALLBACK
 * ============================================================================
 * 
 * Endpoint: POST /api/campaigns/generation-webhook
 * URL: http://your-backend-url/api/campaigns/generation-webhook
 * Authentication: NONE (n8n calls it directly)
 * 
 * ============================================================================
 * WHAT WE SEND TO N8N (Input)
 * ============================================================================
 * 
 * POST to: https://n8n.srv891599.hstgr.cloud/webhook/d235dd55-3392-4093-b3dd-095baf5c337b
 * Headers: 
 *   - Content-Type: application/json
 *   - key: 1234 (or your N8N_API_KEY)
 * 
 * Payload:
 * {
 *   "user_id": "user_123",
 *   "campaign_name": "Expert Witness Cluster",
 *   "job_id": "job_11_1765126226932",  // REQUIRED: Unique identifier for this generation job
 *   "callback_url": "http://your-backend-url/api/campaigns/generation-webhook",  // URL for n8n to call back with final results
 *   "streaming_url": "http://your-backend-url/api/campaigns/streaming-webhook",  // URL for n8n to send progress updates during generation
 *   "pillar_page": {
 *     "primary_keyword": "expert witness",
 *     "longtail_keywords": ["analysis expert witness"],
 *     "options": {
 *       "image": 2,
 *       "word_count": 800,
 *       "featured_image": "yes"
 *     }
 *   },
 *   "sub_pillar_pages": [
 *     {
 *       "primary_keyword": "analyst expert witness",
 *       "longtail_keywords": ["analysis expert witness"],
 *       "options": {
 *         "image": 2,
 *         "word_count": 800,
 *         "featured_image": "yes"
 *       }
 *     },
 *     {
 *       "primary_keyword": "seo expert witness",
 *       "longtail_keywords": ["search engine marketing expert witness"],
 *       "options": {
 *         "image": 2,
 *         "word_count": 800,
 *         "featured_image": "yes"
 *       }
 *     }
 *   ],
 *   "brand": {
 *     "brand_name": "github.com",
 *     "brand_description": "Comprehensive Domain Analysis..."
 *   },
 *   "wordpress": {
 *     "username": "admin",
 *     "password": "decrypted_password",
 *     "url": "https://legalexperts.ai/"
 *   }
 * }
 * 
 * ============================================================================
 * WHAT N8N SHOULD SEND BACK (Output)
 * ============================================================================
 * 
 * n8n should call: POST /api/campaigns/generation-webhook
 * 
 * Format Option 1 (Recommended - Object with pages array):
 * {
 *   "job_id": "job_11_1765126226932",  // REQUIRED: Must match the job_id sent
 *   "pages": [
 *     {
 *       "Primary Keyword": "expert witness",  // REQUIRED: For matching to draft
 *       "Html Content": "<p>Expert witnesses hold a pivotal function...</p>",  // REQUIRED
 *       "Title": "Expert Witness | Definition, Types, and Qualifications Explained",
 *       "Meta Description": "Learn what an expert witness is...",
 *       "slug": "expert-witness-services",
 *       "Featured Image": "{\"wp_id\":\"http://res.cloudinary.com/...\"}"
 *     },
 *     {
 *       "Primary Keyword": "analyst expert witness",
 *       "Html Content": "<p>Analyst expert witnesses are critical...</p>",
 *       "Title": "Analyst Expert Witness | Definitive Guide...",
 *       "Meta Description": "Discover the essential role...",
 *       "slug": "analyst-expert-witness-guide",
 *       "Featured Image": "{\"wp_id\":\"http://res.cloudinary.com/...\"}"
 *     },
 *     {
 *       "Primary Keyword": "seo expert witness",
 *       "Html Content": "<p>A search engine optimization...</p>",
 *       "Title": "SEO Expert Witness Guide | Roles...",
 *       "Meta Description": "Explore the essential role...",
 *       "slug": "seo-expert-witness-guide",
 *       "Featured Image": "{\"wp_id\":\"http://res.cloudinary.com/...\"}"
 *     }
 *   ]
 * }
 * 
 * Format Option 2 (Alternative - Array with job_id in each page):
 * [
 *   {
 *     "Job Id": "job_11_1765126226932",  // REQUIRED in first page
 *     "Primary Keyword": "expert witness",  // REQUIRED
 *     "Html Content": "<p>Expert witnesses hold...</p>",  // REQUIRED
 *     "Title": "Expert Witness | Definition...",
 *     "Meta Description": "Learn what an expert witness is...",
 *     "slug": "expert-witness-services",
 *     "Featured Image": "{\"wp_id\":\"http://...\"}"
 *   },
 *   {
 *     "Primary Keyword": "analyst expert witness",  // REQUIRED
 *     "Html Content": "<p>Analyst expert witnesses...</p>",  // REQUIRED
 *     "Title": "Analyst Expert Witness | Definitive Guide...",
 *     "Meta Description": "Discover the essential role...",
 *     "slug": "analyst-expert-witness-guide",
 *     "Featured Image": "{\"wp_id\":\"http://...\"}"
 *   },
 *   {
 *     "Primary Keyword": "seo expert witness",  // REQUIRED
 *     "Html Content": "<p>A search engine optimization...</p>",  // REQUIRED
 *     "Title": "SEO Expert Witness Guide | Roles...",
 *     "Meta Description": "Explore the essential role...",
 *     "slug": "seo-expert-witness-guide",
 *     "Featured Image": "{\"wp_id\":\"http://...\"}"
 *   }
 * ]
 * 
 * ============================================================================
 * RESPONSE FROM WEBHOOK
 * ============================================================================
 * 
 * Success Response (200):
 * {
 *   "success": true,
 *   "message": "Processed 3 pages"
 * }
 * 
 * Error Response (400/500):
 * {
 *   "success": false,
 *   "error": "Error message"
 * }
 * 
 * ============================================================================
 * NOTES
 * ============================================================================
 * - job_id is REQUIRED and must match the job_id sent in the original request
 * - Primary Keyword is REQUIRED for each page to match it to the correct draft
 * - Html Content is REQUIRED for each page
 * - The webhook will match pages to drafts using job_id + Primary Keyword
 * - If job_id is missing, it will fall back to matching by Primary Keyword only (less reliable)
 */
router.post('/generation-webhook', asyncHandler(async (req: Request, res: Response) => {
  try {
    // Log the full n8n response for debugging
    console.log('[generation-webhook] ===== N8N RESPONSE RECEIVED =====');
    console.log('[generation-webhook] Full request body from n8n:', JSON.stringify(req.body, null, 2));
    console.log('[generation-webhook] Request headers:', {
      'content-type': req.headers['content-type'],
      'user-agent': req.headers['user-agent'],
      'x-forwarded-for': req.headers['x-forwarded-for'],
    });

    // n8n can send data in different formats:
    // 1. Object with job_id and pages array
    // 2. Direct array of pages (with job_id in each page or first page)
    let pages: any[] = [];
    let jobId: string | null = null;

    if (Array.isArray(req.body)) {
      // Format 2: Direct array
      pages = req.body;
      jobId = pages[0]?.['Job Id'] || pages[0]?.job_id || pages[0]?.['jobId'] || null;
    } else if (req.body.pages && Array.isArray(req.body.pages)) {
      // Format 1: Object with pages array
      pages = req.body.pages;
      jobId = req.body.job_id || req.body.jobId || null;
    } else {
      // Single page object
      pages = [req.body];
      jobId = req.body.job_id || req.body.jobId || req.body['Job Id'] || null;
    }

    console.log('[generation-webhook] Parsed payload summary', {
      isArray: Array.isArray(req.body),
      topLevelKeys: typeof req.body === 'object' && req.body ? Object.keys(req.body) : [],
      pagesCount: pages?.length || 0,
      jobId,
      pageKeywords: pages.map((p: any) => p['Primary Keyword'] || p.primaryKeyword || 'N/A').slice(0, 5), // First 5 keywords
    });

    // STRICT VALIDATION: Require job_id at top level
    if (!jobId) {
      console.error('[generation-webhook] REJECTED: Missing job_id in payload');
      return res.status(400).json({
        success: false,
        error: 'Invalid payload: job_id is required'
      });
    }

    if (!pages || pages.length === 0) {
      console.error('[generation-webhook] REJECTED: No pages found in payload');
      return res.status(400).json({ success: false, error: 'Invalid payload: no pages found' });
    }

    console.log(`[generation-webhook] Processing ${pages.length} pages for job_id: ${jobId}`);

    // Find all drafts with this job_id
    const allUserDrafts = await prisma.wordpressPublishLog.findMany({
      where: {
        status: { in: ['generating', 'draft'] }
      }
    });

    const allDrafts = allUserDrafts.filter(draft => {
      const resp = draft.response as any;
      return resp?.jobId === jobId;
    });

    if (allDrafts.length === 0) {
      console.warn(`[generation-webhook] No drafts found with job_id: ${jobId}`);
    } else {
      console.log(`[generation-webhook] Found ${allDrafts.length} drafts for job_id: ${jobId}`);
    }

    const processedPages: string[] = [];
    const skippedPages: string[] = [];

    // Match pages to drafts using job_id + Primary Keyword (STRICT VALIDATION)
    for (const page of pages) {
      const primaryKeyword = page['Primary Keyword'] || page.primaryKeyword || '';
      const htmlContent = page['Html Content'] || page.htmlContent || '';

      // STRICT VALIDATION: Require Primary Keyword
      if (!primaryKeyword) {
        console.error(`[generation-webhook] REJECTED: Page missing Primary Keyword:`, {
          hasTitle: !!page.Title,
          hasHtmlContent: !!htmlContent,
          keys: Object.keys(page)
        });
        skippedPages.push('missing Primary Keyword');
        await prisma.generationJobPage.updateMany({
          where: { jobId, pageId: page.pageId || undefined },
          data: { status: 'failed', error: 'Missing Primary Keyword', hasHtml: false, progress: 0 }
        });
        continue;
      }

      // STRICT VALIDATION: Require Html Content
      if (!htmlContent || htmlContent.trim() === '') {
        console.error(`[generation-webhook] REJECTED: Page "${primaryKeyword}" missing Html Content`);
        skippedPages.push(`${primaryKeyword} (missing Html Content)`);
        await prisma.generationJobPage.updateMany({
          where: { jobId, pageId: page.pageId || undefined },
          data: { status: 'failed', error: 'Missing Html Content', hasHtml: false, progress: 0 }
        });
        continue;
      }

      // Find draft by job_id + primary keyword
      const draft = allDrafts.find(d => d.primaryKeyword === primaryKeyword);

      if (!draft) {
        console.warn(`[generation-webhook] No draft found for keyword "${primaryKeyword}" with job_id: ${jobId}`);
        skippedPages.push(`${primaryKeyword} (draft not found)`);
        continue;
      }

      // UPSERT: Update existing draft (each page has only one draft)
      const currentResponse = draft.response as any;
      const pageId = currentResponse?.pageId;

      if (!pageId) {
        console.warn(`[generation-webhook] Draft ${draft.id} missing pageId, skipping update`);
        skippedPages.push(`${primaryKeyword} (missing pageId)`);
        continue;
      }

      // Update draft with new HTML content (overwrites existing)
      const updatedDraft = await prisma.wordpressPublishLog.update({
        where: { id: draft.id },
        data: {
          status: 'draft',
          title: page.Title || page.title || draft.title,
          slug: page.slug || page.Slug || draft.slug || null,
          response: {
            ...currentResponse,
            htmlContent: htmlContent,
            title: page.Title || page.title || draft.title,
            metaDescription: page['Meta Description'] || page.metaDescription || currentResponse?.metaDescription,
            slug: page.slug || page.Slug || draft.slug || null,
            featuredImage: page['Featured Image'] || page.featuredImage || currentResponse?.featuredImage,
            status: 'completed',
            completedAt: new Date().toISOString()
          }
        }
      });

      // Update GenerationJobPage and aggregate job status
      await prisma.generationJobPage.updateMany({
        where: { jobId, pageId },
        data: {
          status: 'completed',
          draftId: updatedDraft.id,
          hasHtml: true,
          progress: 100
        }
      });

      const jobPages = await prisma.generationJobPage.findMany({ where: { jobId } });
      await prisma.generationJob.update({
        where: { jobId },
        data: { status: computeJobStatus(jobPages) }
      });

      // Lookup topic for SSE broadcast
      const pageRecord = await prisma.campaignPage.findUnique({
        where: { id: pageId },
        select: { topicId: true, pageType: true }
      });

      if (pageRecord?.topicId) {
        broadcastToUser(draft.userId, {
          type: 'drafts',
          jobId,
          topicId: pageRecord.topicId,
          pages: [{
            pageId,
            pageType: pageRecord.pageType.toLowerCase(),
            status: 'completed',
            draftId: updatedDraft.id,
            primaryKeyword,
            hasHtml: true,
            progress: 100
          }]
        });
      }

      processedPages.push(primaryKeyword);
      console.log(`[generation-webhook] ✅ Updated draft ${draft.id} for pageId ${pageId}, keyword "${primaryKeyword}"`);
      console.log(`[generation-webhook] Page details for "${primaryKeyword}":`, {
        hasTitle: !!page.Title,
        hasHtmlContent: !!htmlContent,
        htmlContentLength: htmlContent?.length || 0,
        hasSlug: !!page.slug,
        hasMetaDescription: !!page['Meta Description'],
        hasFeaturedImage: !!page['Featured Image'],
      });
    }

    // If nothing processed, mark drafts and job pages as failed
    if (processedPages.length === 0 && allDrafts.length > 0) {
      await prisma.wordpressPublishLog.updateMany({
        where: { id: { in: allDrafts.map((d) => d.id) } },
        data: {
          status: 'draft',
          response: {
            ...((allDrafts[0].response as any) || {}),
            jobId,
            status: 'failed',
            error: 'No pages processed in webhook response'
          }
        }
      });
      await prisma.generationJobPage.updateMany({
        where: { jobId },
        data: {
          status: 'failed',
          error: 'No pages processed in webhook response',
          hasHtml: false,
          progress: 0
        }
      });
      await prisma.generationJob.update({
        where: { jobId },
        data: { status: 'failed' }
      });
    } else {
      // Update job aggregate status
      const jobPages = await prisma.generationJobPage.findMany({ where: { jobId } });
      await prisma.generationJob.update({
        where: { jobId },
        data: { status: computeJobStatus(jobPages) }
      });
    }

    // Log final processing summary
    console.log('[generation-webhook] ===== PROCESSING SUMMARY =====');
    console.log('[generation-webhook] Job ID:', jobId);
    console.log('[generation-webhook] Total pages received:', pages.length);
    console.log('[generation-webhook] Successfully processed:', processedPages.length, processedPages);
    console.log('[generation-webhook] Skipped:', skippedPages.length, skippedPages.length > 0 ? skippedPages : 'none');
    console.log('[generation-webhook] ==============================');

    const result = {
      success: true,
      message: `Processed ${processedPages.length} pages`,
      processed: processedPages,
      skipped: skippedPages.length > 0 ? skippedPages : undefined
    };

    if (skippedPages.length > 0) {
      console.warn(`[generation-webhook] ⚠️ Skipped ${skippedPages.length} pages:`, skippedPages);
    }

    res.json(result);
  } catch (error: any) {
    console.error('[generation-webhook] ===== ERROR PROCESSING N8N RESPONSE =====');
    console.error('[generation-webhook] Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
    });
    console.error('[generation-webhook] Request body that caused error:', JSON.stringify(req.body, null, 2));
    console.error('[generation-webhook] ===========================================');
    res.status(500).json({ success: false, error: error.message });
  }
}));

/**
 * ============================================================================
 * STREAMING WEBHOOK ENDPOINT FOR PROGRESS UPDATES
 * ============================================================================
 * 
 * Endpoint: POST /api/campaigns/streaming-webhook
 * URL: http://your-backend-url/api/campaigns/streaming-webhook
 * Authentication: NONE (n8n calls it directly)
 * 
 * ============================================================================
 * WHAT N8N SHOULD SEND (Input)
 * ============================================================================
 * 
 * POST to: http://your-backend-url/api/campaigns/streaming-webhook
 * Headers: 
 *   - Content-Type: application/json
 * 
 * Payload (minimal - only job_id and message):
 * {
 *   "job_id": "job_11_1765126226932",  // REQUIRED: Must match the job_id sent
 *   "message": "Generating pillar page content..."  // REQUIRED: Progress message
 * }
 * 
 * ============================================================================
 * RESPONSE FROM STREAMING WEBHOOK
 * ============================================================================
 * 
 * Success Response (200):
 * {
 *   "success": true,
 *   "message": "Progress update broadcasted"
 * }
 * 
 * Error Response (400/404):
 * {
 *   "success": false,
 *   "error": "Error message"
 * }
 * 
 * ============================================================================
 * NOTES
 * ============================================================================
 * - job_id is REQUIRED and must match the job_id sent in the original request
 * - message is REQUIRED and will be broadcasted to the user via SSE
 * - The webhook will look up the user by querying drafts with the job_id
 * - Progress updates are broadcasted to connected SSE clients in real-time
 */
router.post('/streaming-webhook', asyncHandler(async (req: Request, res: Response) => {
  try {
    const { job_id, message } = req.body;

    // Validate required fields
    if (!job_id) {
      console.error('[streaming-webhook] REJECTED: Missing job_id in payload');
      return res.status(400).json({
        success: false,
        error: 'Invalid payload: job_id is required'
      });
    }

    if (!message) {
      console.error('[streaming-webhook] REJECTED: Missing message in payload');
      return res.status(400).json({
        success: false,
        error: 'Invalid payload: message is required'
      });
    }

    console.log(`[streaming-webhook] Received progress update for job_id: ${job_id}`, {
      message: message.substring(0, 100), // Log first 100 chars
      messageLength: message.length
    });

    // Find user by querying drafts with this job_id
    // Drafts store jobId in their response JSON
    const allUserDrafts = await prisma.wordpressPublishLog.findMany({
      where: {
        status: { in: ['generating', 'draft'] }
      }
    });

    const matchingDraft = allUserDrafts.find(draft => {
      const resp = draft.response as any;
      return resp?.jobId === job_id;
    });

    // 1. Persist the message for reliability (page reloads)
    // We save it even if we can't find the user immediately, so history is preserved
    const timestamp = new Date().toISOString();
    await saveStreamingMessage(job_id, message, timestamp);

    if (!matchingDraft) {
      console.warn(`[streaming-webhook] No draft found with job_id: ${job_id}`);
      // Return 200 to avoid n8n retries, but log the issue
      return res.status(200).json({
        success: false,
        message: 'Job not found (may have completed or not started yet)'
      });
    }

    const userId = matchingDraft.userId;

    // Broadcast streaming update to user via SSE
    broadcastToUser(userId, {
      type: 'streaming',
      jobId: job_id,
      message: message,
      timestamp
    });

    console.log(`[streaming-webhook] ✅ Broadcasted progress update to user ${userId} for job ${job_id}`);

    res.json({
      success: true,
      message: 'Progress update broadcasted'
    });
  } catch (error: any) {
    console.error('[streaming-webhook] Error processing streaming webhook:', error);
    // Return 200 to avoid n8n retries, but log the error
    res.status(200).json({
      success: false,
      error: 'Internal server error (logged)'
    });
  }
}));

/**
 * GET /api/campaigns/topics/:topicId/drafts-status
 * Returns draft status for all pages in a topic so the frontend can show View Page after reload.
 */
router.get('/topics/:topicId/drafts-status', authenticateToken, asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.user.userId;
  const topicId = parseInt(req.params.topicId, 10);

  if (isNaN(topicId)) {
    return res.status(400).json({ success: false, error: 'Invalid topic ID' });
  }

  const topic = await prisma.campaignTopic.findFirst({
    where: {
      id: topicId,
      campaign: {
        domain: {
          userId,
          isCompanyDomain: true
        }
      }
    },
    include: {
      pages: {
        select: {
          id: true,
          pageType: true,
          order: true
        }
      }
    }
  });

  if (!topic) {
    return res.status(404).json({ success: false, error: 'Topic not found' });
  }

  const pageIds = (topic.pages || []).map((p) => p.id);
  if (pageIds.length === 0) {
    return res.json({ success: true, pages: [] });
  }

  // Fetch latest job for this topic
  const latestJob = await prisma.generationJob.findFirst({
    where: { topicId, userId },
    orderBy: { startedAt: 'desc' },
    select: {
      id: true,
      jobId: true,
      status: true,
      pages: {
        select: {
          pageId: true,
          status: true,
          progress: true,
          hasHtml: true,
          error: true,
          updatedAt: true,
          draftId: true,
          primaryKeyword: true,
          pageType: true,
        }
      }
    }
  });

  if (!latestJob) {
    // No job yet, return pending for all pages
    return res.json({
      success: true,
      status: {
        status: 'pending',
        active: false,
        progress: 0
      },
      pages: pageIds.map((pageId) => ({
        pageId,
        pageType: topic.pages.find(p => p.id === pageId)?.pageType || 'pillar',
        status: 'pending' as const,
        draftId: null,
        jobId: null,
        primaryKeyword: null,
        progress: 0,
        hasHtml: false,
        updatedAt: null,
        wordpressUrl: null,
      })),
      messages: []
    });
  }

  const jobId = latestJob.jobId;

  // Fetch persisted streaming messages
  const streamingMessages = await getStreamingMessages(jobId);

  // Map job pages - use Promise.all for async draft fetching
  const pages = await Promise.all(
    pageIds.map(async (pageId) => {
      const pageStatus = latestJob.pages.find(p => p.pageId === pageId);
      if (!pageStatus) {
        return {
          pageId,
          pageType: topic.pages.find(p => p.id === pageId)?.pageType || 'pillar',
          status: 'pending' as const,
          draftId: null,
          jobId: latestJob.jobId,
          primaryKeyword: null,
          progress: 0,
          hasHtml: false,
          updatedAt: null,
          wordpressUrl: null,
        };
      }

      // Pull latest draft if available
      const draftId = pageStatus.draftId || null;
      const hasHtml = !!pageStatus.hasHtml;

      // Fetch draft to check published status and URL
      let draftStatus = pageStatus.status as 'pending' | 'generating' | 'completed' | 'failed' | 'published';
      let wordpressUrl: string | null = null;

      if (draftId) {
        try {
          const draft = await prisma.wordpressPublishLog.findFirst({
            where: { id: draftId, userId },
            select: { status: true, wordpressUrl: true },
          });
          if (draft) {
            draftStatus = draft.status as 'pending' | 'generating' | 'completed' | 'failed' | 'published';
            wordpressUrl = draft.wordpressUrl;
          }
        } catch (err) {
          // Silently fail - use pageStatus
        }
      }

      // If page has HTML content, it must be completed regardless of stored status (unless published)
      const finalStatus = hasHtml && draftStatus !== 'published'
        ? ('completed' as const)
        : draftStatus;

      return {
        pageId,
        pageType: pageStatus.pageType === 'subpage' ? 'subpage' : 'pillar',
        status: finalStatus,
        draftId,
        jobId: latestJob.jobId,
        primaryKeyword: pageStatus.primaryKeyword,
        progress: pageStatus.progress || (hasHtml ? 100 : 0),
        hasHtml,
        updatedAt: pageStatus.updatedAt.toISOString(),
        error: pageStatus.error || null,
        wordpressUrl: wordpressUrl || null,
      };
    })
  );

  res.json({ success: true, pages, job: { jobId: latestJob.jobId, status: latestJob.status } });
}));

/**
 * GET /api/campaigns/drafts/:draftId
 * Get draft content for preview
 */
router.get('/drafts/:draftId', authenticateToken, asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.user.userId;
  const draftId = parseInt(req.params.draftId, 10);

  if (isNaN(draftId)) {
    return res.status(400).json({ success: false, error: 'Invalid draft ID' });
  }

  const draft = await prisma.wordpressPublishLog.findFirst({
    where: {
      id: draftId,
      userId
    }
  });

  if (!draft) {
    return res.status(404).json({ success: false, error: 'Draft not found' });
  }

  const response = draft.response as any;

  res.json({
    success: true,
    draft: {
      htmlContent: response.htmlContent || response['Html Content'] || '',
      title: response.title || response.Title || draft.title,
      metaDescription: response.metaDescription || response['Meta Description'] || '',
      slug: response.slug || response.Slug || draft.slug,
      featuredImage: response.featuredImage || response['Featured Image'] || '',
      primaryKeyword: draft.primaryKeyword,
      longtailKeywords: response.longtailKeywords || response['longtail keywords'] || ''
    }
  });
}));

export default router;

