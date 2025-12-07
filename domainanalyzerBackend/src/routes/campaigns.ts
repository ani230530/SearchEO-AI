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
  
  // Create draft entries for each page
  const draftPromises = [
    prisma.wordpressPublishLog.create({
      data: {
        userId,
        primaryKeyword: pillarPage.keywords[0]?.term || pillarPage.title,
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
      }
    }),
    ...subPages.map(subPage =>
      prisma.wordpressPublishLog.create({
        data: {
          userId,
          primaryKeyword: subPage.keywords[0]?.term || subPage.title,
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
        }
      })
    )
  ];

  const drafts = await Promise.all(draftPromises);

  // Call n8n webhook asynchronously (don't wait for response)
  const decryptedPassword = decryptToken(integration.password);
  const sanitizedDomainName = topic.campaign.domain.url
    ?.replace(/^https?:\/\//i, '')
    ?.replace(/^www\./i, '')
    ?.split('/')[0] || 'Brand';

  const payload = {
    ...req.body,
    // Include job_id so n8n can return it in the callback
    // job_id is unique and sufficient to identify the request
    job_id: jobId,
    callback_url: `${req.protocol}://${req.get('host')}/api/campaigns/generation-webhook`, // URL for n8n to call back
    wordpress: {
      username: integration.username,
      password: decryptedPassword,
      url: integration.siteUrl,
    }
  };

  // Fire and forget - process in background
  const PILLAR_WEBHOOK_URL = process.env.N8N_PILLAR_WEBHOOK_URL || 'https://n8n.srv891599.hstgr.cloud/webhook/d235dd55-3392-4093-b3dd-095baf5c337b';
  const N8N_API_KEY = process.env.N8N_API_KEY || '1234';
  const N8N_API_KEY_HEADER = process.env.N8N_API_KEY_HEADER || 'key';
  
  // Process webhook asynchronously (fire and forget)
  // n8n will process this in background and call back via webhook when done
  // We don't wait for response since it takes ~3min per page (9min for 3 pages)
  // The connection would timeout, so we handle it as fire-and-forget
  (async () => {
    try {
      // Send request - try to catch response even if timeout occurs
      // n8n processes for ~9 minutes, so we'll timeout, but we'll also set up
      // a background job to periodically check if drafts were updated
      axios.post(PILLAR_WEBHOOK_URL, payload, {
        headers: {
          'Content-Type': 'application/json',
          [N8N_API_KEY_HEADER]: N8N_API_KEY,
        },
        timeout: 600000, // 10 minutes - try to wait as long as possible
        validateStatus: () => true, // Accept any status code
      }).then((response) => {
        // Success! n8n returned response (unlikely but possible)
        console.log(`[n8n request] Received response for job ${jobId}. Status: ${response.status}`);
        
        // Process the response immediately
        const pages = Array.isArray(response.data) ? response.data : [response.data];
        processN8nResponse(pages, drafts, jobId);
      }).catch(async (error: any) => {
        // Check if response data is available even though we timed out
        if (error.response?.data) {
          console.log(`[n8n request] Got response data despite timeout for job ${jobId}`);
          const pages = Array.isArray(error.response.data) ? error.response.data : [error.response.data];
          await processN8nResponse(pages, drafts, jobId);
          return;
        }
        
        // Timeout/connection reset is EXPECTED for long-running processes
        const isExpectedError = 
          error.code === 'ECONNRESET' || 
          error.code === 'ETIMEDOUT' || 
          error.message?.includes('timeout') ||
          error.message?.includes('socket hang up') ||
          error.message?.includes('exceeded');
        
        if (isExpectedError) {
          console.log(`[n8n request] Request sent for job ${jobId}. Timeout expected - will check drafts periodically.`);
          
          // Start background job to check if drafts were updated
          // This will poll the drafts to see if n8n updated them directly
          startDraftPolling(jobId, drafts, userId);
        } else if (error.response?.status && error.response.status >= 400 && error.response.status < 500) {
          // Client error (4xx) - actual failure
          console.error(`[n8n request] Request rejected for job ${jobId}: ${error.response.status}`);
          await Promise.all(drafts.map(draft =>
            prisma.wordpressPublishLog.update({
              where: { id: draft.id },
              data: {
                status: 'draft',
                response: {
                  ...(draft.response as any),
                  status: 'failed',
                  error: error.response?.data || 'Request rejected by n8n'
                }
              }
            })
          ));
        } else {
          console.warn(`[n8n request] Unexpected error for job ${jobId}: ${error.message}`);
        }
      });
      
      // Helper function to process n8n response
      async function processN8nResponse(pages: any[], draftList: any[], jobIdStr: string) {
        console.log(`[n8n response] Processing ${pages.length} pages for job ${jobIdStr}`);
        
        for (const page of pages) {
          const primaryKeyword = page['Primary Keyword'] || page.primaryKeyword || '';
          
          if (!primaryKeyword) {
            console.warn('[n8n response] Page missing primary keyword');
            continue;
          }
          
          // Match by primary keyword and jobId
          const matchingDraft = draftList.find(d => {
            const resp = d.response as any;
            return d.primaryKeyword === primaryKeyword && resp?.jobId === jobIdStr;
          });
          
          if (matchingDraft) {
            const currentResponse = matchingDraft.response as any;
            await prisma.wordpressPublishLog.update({
              where: { id: matchingDraft.id },
              data: {
                status: 'draft',
                title: page.Title || page.title || matchingDraft.title,
                slug: page.slug || page.Slug || null,
                response: {
                  ...currentResponse,
                  htmlContent: page['Html Content'] || page.htmlContent || '',
                  title: page.Title || page.title,
                  metaDescription: page['Meta Description'] || page.metaDescription,
                  slug: page.slug || page.Slug,
                  featuredImage: page['Featured Image'] || page.featuredImage,
                  status: 'completed',
                  completedAt: new Date().toISOString()
                }
              }
            });
            console.log(`[n8n response] Updated draft ${matchingDraft.id} for "${primaryKeyword}"`);
          }
        }
      }
      
      // Background job to periodically check if drafts were updated
      // (in case n8n updates them through some other mechanism)
      function startDraftPolling(jobIdStr: string, draftList: any[], userIdNum: number) {
        let attempts = 0;
        const maxAttempts = 120; // Check for 30 minutes (120 * 15 seconds)
        
        const pollInterval = setInterval(async () => {
          attempts++;
          
          try {
            // Check if any drafts have been updated (maybe n8n updated them directly)
            const updatedDrafts = await prisma.wordpressPublishLog.findMany({
              where: {
                id: { in: draftList.map(d => d.id) },
                userId: userIdNum
              }
            });
            
            // Check if any draft now has htmlContent (means it's completed)
            const completed = updatedDrafts.some(draft => {
              const resp = draft.response as any;
              return resp?.htmlContent || resp?.['Html Content'];
            });
            
            if (completed || attempts >= maxAttempts) {
              clearInterval(pollInterval);
              if (completed) {
                console.log(`[draft-polling] Detected completed drafts for job ${jobIdStr}`);
              }
            }
          } catch (error) {
            console.error(`[draft-polling] Error checking drafts for job ${jobIdStr}:`, error);
          }
        }, 15000); // Check every 15 seconds
      }
      
      // Don't wait for response - return immediately
      return;
      // Note: Response handling is done in the /generation-webhook endpoint
      // which n8n will call when processing is complete
    } catch (error: any) {
      // This catch block should rarely be hit since we're not awaiting
      console.error(`[n8n request] Unexpected error for job ${jobId}:`, error);
    }
  })();

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
 *   "callback_url": "http://your-backend-url/api/campaigns/generation-webhook",  // URL for n8n to call back
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
    
    if (!pages || pages.length === 0) {
      console.warn('[generation-webhook] Received empty or invalid payload');
      return res.status(400).json({ success: false, error: 'Invalid payload: no pages found' });
    }
    
    if (!jobId) {
      console.warn('[generation-webhook] Missing job_id - will try to match by primary keyword only');
    } else {
      console.log(`[generation-webhook] Received ${pages.length} pages for job_id: ${jobId}`);
    }
    
    // Find all drafts with this job_id (job_id is unique, so this is reliable)
    let allDrafts: any[] = [];
    if (jobId) {
      const allUserDrafts = await prisma.wordpressPublishLog.findMany({
        where: {
          status: 'generating'
        }
      });
      
      allDrafts = allUserDrafts.filter(draft => {
        const resp = draft.response as any;
        return resp?.jobId === jobId;
      });
      
      if (allDrafts.length === 0) {
        console.warn(`[generation-webhook] No drafts found with job_id: ${jobId}`);
      } else {
        console.log(`[generation-webhook] Found ${allDrafts.length} drafts for job_id: ${jobId}`);
      }
    }
    
    // Match pages to drafts using job_id (most reliable)
    for (const page of pages) {
      const primaryKeyword = page['Primary Keyword'] || page.primaryKeyword || '';
      const pageJobId = page['Job Id'] || page.job_id || page.jobId || jobId;
      
      if (!primaryKeyword) {
        console.warn('[generation-webhook] Page missing primary keyword:', page);
        continue;
      }
      
      // Try to find draft by job_id + primary keyword (most reliable)
      let draft = null;
      
      if (pageJobId && allDrafts.length > 0) {
        draft = allDrafts.find(d => d.primaryKeyword === primaryKeyword);
        
        if (draft) {
          console.log(`[generation-webhook] Matched draft by job_id (${pageJobId}) + keyword (${primaryKeyword})`);
        }
      }
      
      // Fallback: Find by primary keyword only (if job_id not available)
      if (!draft) {
        draft = await prisma.wordpressPublishLog.findFirst({
          where: {
            primaryKeyword: primaryKeyword,
            status: 'generating'
          },
          orderBy: {
            createdAt: 'desc'
          }
        });
        
        if (draft) {
          console.log(`[generation-webhook] Matched draft by keyword only (${primaryKeyword}) - WARNING: less reliable`);
        }
      }
      
      if (draft) {
        const currentResponse = draft.response as any;
        const jobId = currentResponse?.jobId;
        
        await prisma.wordpressPublishLog.update({
          where: { id: draft.id },
          data: {
            status: 'draft',
            title: page.Title || page.title || draft.title,
            slug: page.slug || page.Slug || null,
            response: {
              ...currentResponse,
              htmlContent: page['Html Content'] || page.htmlContent || '',
              title: page.Title || page.title,
              metaDescription: page['Meta Description'] || page.metaDescription,
              slug: page.slug || page.Slug,
              featuredImage: page['Featured Image'] || page.featuredImage,
              status: 'completed',
              completedAt: new Date().toISOString()
            }
          }
        });
        
        console.log(`[generation-webhook] Updated draft ${draft.id} for keyword "${primaryKeyword}" (job: ${jobId || 'unknown'})`);
      } else {
        console.warn(`[generation-webhook] Could not find draft for keyword "${primaryKeyword}"`);
      }
    }
    
    res.json({ success: true, message: `Processed ${pages.length} pages` });
  } catch (error: any) {
    console.error('[generation-webhook] Error processing webhook:', error);
    res.status(500).json({ success: false, error: error.message });
  }
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
      primaryKeyword: draft.primaryKeyword
    }
  });
}));

export default router;

