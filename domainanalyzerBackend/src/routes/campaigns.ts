import { Router, Request, Response } from 'express';
import { Prisma, PrismaClient, CampaignPageType, CampaignNodeSource } from '../../generated/prisma';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import {
  generateCampaignTopics,
  generatePillarPageSuggestion,
  generateSubPagesSuggestion,
  generateKeywordsSuggestion
} from '../services/campaignAiService';

const router = Router();
const prisma = new PrismaClient();

function asyncHandler(fn: (req: Request, res: Response, next: any) => Promise<any>) {
  return function (req: Request, res: Response, next: any) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

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
  intent: keyword.intent ?? null
});

const serializePage = (page: PageWithRelations): SerializedPage => ({
  id: page.id,
  title: page.title,
  description: page.description || null,
  summary: page.summary || page.aiSummary || null,
  pageType: page.pageType,
  keywords: page.keywords.map(serializeKeyword)
});

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

  await prisma.campaignTopic.delete({ where: { id: topicId } });
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

  await prisma.campaignPage.delete({ where: { id: pageId } });
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
  const { term, volume, difficulty, intent } = req.body || {};

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

  await prisma.campaignKeyword.create({
    data: {
      term: term.trim(),
      volume: Number.isFinite(volume) ? Number(volume) : null,
      difficulty: difficulty || DEFAULT_KEYWORD_DIFFICULTY,
      intent: intent || null,
      topicId: page.topicId,
      pageId,
      source: CampaignNodeSource.MANUAL
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
  const { count = 5 } = req.body || {};

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

  const suggestions = await generateKeywordsSuggestion({
    domainUrl: domain.url,
    domainContext: domain.context,
    keywords: extractDomainKeywords(domain),
    topicTitle: topic?.title,
    pageTitle: page.title,
    count
  });

  await prisma.campaignKeyword.createMany({
    data: suggestions.map((kw) => ({
      term: kw.term,
      volume: kw.volume ?? null,
      difficulty: kw.difficulty || DEFAULT_KEYWORD_DIFFICULTY,
      intent: kw.intent || null,
      topicId: page.topicId,
      pageId,
      source: CampaignNodeSource.AI,
      aiMetadata: { generatedAt: new Date().toISOString(), origin: 'keyword_ai' }
    })),
    skipDuplicates: true
  });

  return respondWithStructure(res, page.topic.campaignId, userId, 201);
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

  await prisma.campaign.delete({
    where: { id: campaignId }
  });

  res.json({
    success: true,
    message: 'Campaign deleted successfully'
  });
}));

export default router;

