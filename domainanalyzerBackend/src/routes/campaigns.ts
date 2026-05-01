/**
 * Campaign / worksheet routes — flat topic model.
 *
 * Each campaign owns N topics. A topic carries its own keywords and a single
 * draft (latestDraft / latestDraftId). The legacy CampaignPage / pillar-subpage
 * concept has been retired from application code; see the flatten-topics
 * migration for the data move.
 *
 * Phase A scope (this file): campaign + topic + keyword CRUD.
 * Phase B will add `POST /topics/:topicId/generate` for the universal-webhook
 * generation flow.
 */

import { Router, Request, Response } from 'express';
import { Prisma, PrismaClient, CampaignNodeSource } from '../../generated/prisma';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import {
  generateCampaignTopics,
  generateKeywordsSuggestion,
  generateTopicTitleSuggestion,
  GeneratedTopic,
} from '../services/campaignAiService';
import { authService } from '../services/authService';
import {
  addSSEClient,
  removeSSEClient,
  SSEClient,
} from '../services/sseService';
import { TemplateType } from '../services/universalGenerationService';
import {
  startGenerationJob,
  getJobForTopic,
  GenerationJobConflictError,
  GenerationJobValidationError,
  SerializedGenerationJob,
} from '../services/generationJobService';
import { serializeDraftContent } from '../services/contentFlowService';

const router = Router();
const prisma = new PrismaClient();
const DEFAULT_KEYWORD_DIFFICULTY = 'Medium';

/* ----------------------------------------------------------------------------
 * Helpers
 * --------------------------------------------------------------------------*/

function asyncHandler(fn: (req: Request, res: Response, next: any) => Promise<any>) {
  return function (req: Request, res: Response, next: any) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

const extractDomainKeywords = (domain?: { keywords?: { term: string | null }[] }) =>
  (domain?.keywords?.map((k) => k.term).filter(Boolean) as string[] | undefined) || [];

/* ----------------------------------------------------------------------------
 * Serializers — flat topic shape
 * --------------------------------------------------------------------------*/

type CampaignWithStructure = Prisma.CampaignGetPayload<{
  include: {
    topics: {
      include: {
        keywords: true;
        latestDraft: true;
      };
    };
  };
}>;

type TopicWithRelations = CampaignWithStructure['topics'][number];

interface SerializedKeyword {
  id: number;
  term: string;
  volume: number;
  difficulty: string;
  intent: string | null;
  aiMetadata: Record<string, any> | null;
}

interface SerializedTopic {
  id: number;
  title: string;
  description: string | null;
  summary: string | null;
  status: string;
  source: CampaignNodeSource;
  keywords: SerializedKeyword[];
  publishStatus: string | null;
  liveUrl: string | null;
  draftId: number | null;
  /** Latest GenerationJob snapshot for this topic, if any. Hydrates the
   *  worksheet row's progress UI on page load and after reconnects. */
  job: SerializedGenerationJob | null;
}

const serializeKeyword = (kw: TopicWithRelations['keywords'][number]): SerializedKeyword => ({
  id: kw.id,
  term: kw.term,
  volume: kw.volume ?? 0,
  difficulty: kw.difficulty || DEFAULT_KEYWORD_DIFFICULTY,
  intent: kw.intent ?? null,
  aiMetadata: (kw.aiMetadata as Record<string, any>) ?? null,
});

const serializeTopic = (
  topic: TopicWithRelations,
  jobByTopic: Map<number, SerializedGenerationJob>
): SerializedTopic => {
  const keywords = topic.keywords
    .slice()
    .sort((a, b) => a.id - b.id)
    .map(serializeKeyword);

  return {
    id: topic.id,
    title: topic.title,
    description: topic.description || null,
    summary: topic.summary || topic.aiSummary || null,
    status: topic.status,
    source: topic.source,
    keywords,
    publishStatus: topic.latestDraft?.status || null,
    liveUrl:
      topic.latestDraft?.status === 'published' ? topic.latestDraft?.wordpressUrl || null : null,
    draftId: topic.latestDraft?.id ?? null,
    job: jobByTopic.get(topic.id) ?? null,
  };
};

const serializeStructure = (
  campaign: CampaignWithStructure,
  jobByTopic: Map<number, SerializedGenerationJob>
) => ({
  topics: campaign.topics
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((t) => serializeTopic(t, jobByTopic)),
});

const loadJobsForCampaign = async (
  campaign: CampaignWithStructure
): Promise<Map<number, SerializedGenerationJob>> => {
  const topicIds = campaign.topics.map((t) => t.id);
  const map = new Map<number, SerializedGenerationJob>();
  if (!topicIds.length) return map;
  await Promise.all(
    topicIds.map(async (topicId) => {
      const job = await getJobForTopic(topicId);
      if (job) map.set(topicId, job);
    })
  );
  return map;
};

const fetchCampaignStructure = async (campaignId: number, userId: number) =>
  prisma.campaign.findFirst({
    where: {
      id: campaignId,
      domain: { userId, isCompanyDomain: true },
    },
    include: {
      topics: {
        include: {
          keywords: { orderBy: { createdAt: 'asc' } },
          latestDraft: true,
        },
      },
    },
  });

const respondWithStructure = async (
  res: Response,
  campaignId: number,
  userId: number,
  status = 200
) => {
  const campaign = await fetchCampaignStructure(campaignId, userId);
  if (!campaign) {
    return res.status(404).json({ success: false, error: 'Campaign not found' });
  }
  const jobs = await loadJobsForCampaign(campaign);
  return res.status(status).json({
    success: true,
    structure: serializeStructure(campaign, jobs),
  });
};

/* ----------------------------------------------------------------------------
 * Ownership checks
 * --------------------------------------------------------------------------*/

const ensureCampaignOwnership = async (campaignId: number, userId: number) =>
  prisma.campaign.findFirst({
    where: {
      id: campaignId,
      domain: { userId, isCompanyDomain: true },
    },
    include: {
      domain: {
        select: {
          id: true,
          url: true,
          userId: true,
          isCompanyDomain: true,
          context: true,
          location: true,
          locationContext: true,
          keywords: {
            select: { term: true },
            orderBy: { volume: 'desc' },
            take: 25,
          },
        },
      },
    },
  });

const ensureTopicOwnership = async (topicId: number, userId: number) =>
  prisma.campaignTopic.findFirst({
    where: {
      id: topicId,
      campaign: { domain: { userId, isCompanyDomain: true } },
    },
    include: {
      campaign: {
        include: {
          domain: {
            include: {
              keywords: {
                select: { term: true },
                orderBy: { volume: 'desc' },
                take: 25,
              },
            },
          },
        },
      },
    },
  });

const ensureKeywordOwnership = async (keywordId: number, userId: number) =>
  prisma.campaignKeyword.findFirst({
    where: {
      id: keywordId,
      topic: { campaign: { domain: { userId, isCompanyDomain: true } } },
    },
    include: { topic: true },
  });

/* ----------------------------------------------------------------------------
 * SSE — used by the frontend to subscribe to user-scoped events.
 * Phase B will broadcast generation status updates over this channel.
 * --------------------------------------------------------------------------*/

router.get('/events', async (req: Request, res: Response) => {
  try {
    const token = (req.query.token as string) || '';
    if (!token) return res.status(401).end();

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

/* ----------------------------------------------------------------------------
 * Campaign CRUD
 * --------------------------------------------------------------------------*/

router.get(
  '/',
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as AuthenticatedRequest).user.userId;

    const companyDomain = await prisma.domain.findFirst({
      where: { userId, isCompanyDomain: true },
    });

    if (!companyDomain) {
      return res.json({ success: true, campaigns: [] });
    }

    const campaigns = await prisma.campaign.findMany({
      where: { domainId: companyDomain.id },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      campaigns: campaigns.map((c) => ({
        id: c.id,
        title: c.title,
        description: c.description,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })),
    });
  })
);

router.post(
  '/',
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as AuthenticatedRequest).user.userId;
    const { title, description } = req.body;

    if (!title || !String(title).trim()) {
      return res.status(400).json({ success: false, error: 'Title is required' });
    }

    const companyDomain = await prisma.domain.findFirst({
      where: { userId, isCompanyDomain: true },
    });

    if (!companyDomain) {
      return res.status(400).json({
        success: false,
        error: 'Company domain not found. Please set up your company domain first.',
      });
    }

    const campaign = await prisma.campaign.create({
      data: {
        title: String(title).trim(),
        description: description?.trim() || null,
        domainId: companyDomain.id,
      },
    });

    res.status(201).json({
      success: true,
      campaign: {
        id: campaign.id,
        title: campaign.title,
        description: campaign.description,
        createdAt: campaign.createdAt,
        updatedAt: campaign.updatedAt,
      },
    });
  })
);

router.put(
  '/:id',
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as AuthenticatedRequest).user.userId;
    const campaignId = parseInt(req.params.id, 10);
    const { title, description } = req.body;

    if (isNaN(campaignId)) {
      return res.status(400).json({ success: false, error: 'Invalid campaign ID' });
    }
    if (!title || !String(title).trim()) {
      return res.status(400).json({ success: false, error: 'Title is required' });
    }

    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, domain: { userId, isCompanyDomain: true } },
    });
    if (!campaign) {
      return res.status(404).json({ success: false, error: 'Campaign not found' });
    }

    const updated = await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        title: String(title).trim(),
        description: description?.trim() || null,
      },
    });

    res.json({
      success: true,
      campaign: {
        id: updated.id,
        title: updated.title,
        description: updated.description,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      },
    });
  })
);

router.delete(
  '/:id',
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as AuthenticatedRequest).user.userId;
    const campaignId = parseInt(req.params.id, 10);

    if (isNaN(campaignId)) {
      return res.status(400).json({ success: false, error: 'Invalid campaign ID' });
    }

    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, domain: { userId, isCompanyDomain: true } },
    });
    if (!campaign) {
      return res.status(404).json({ success: false, error: 'Campaign not found' });
    }

    await prisma.$transaction(async (tx) => {
      const topics = await tx.campaignTopic.findMany({
        where: { campaignId },
        select: { id: true },
      });
      const topicIds = topics.map((t) => t.id);

      if (topicIds.length > 0) {
        // GenerationJob -> CampaignTopic is not cascade-delete in the schema.
        await tx.generationJob.deleteMany({ where: { topicId: { in: topicIds } } });
      }

      // Cascade handles topics + keywords + (legacy) pages.
      await tx.campaign.delete({ where: { id: campaignId } });
    });

    res.json({ success: true, message: 'Campaign deleted successfully' });
  })
);

/* ----------------------------------------------------------------------------
 * Domain keyword listing — used by frontend autocomplete / AI suggest pool.
 * --------------------------------------------------------------------------*/

router.get(
  '/:id/keywords',
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as AuthenticatedRequest).user.userId;
    const campaignId = parseInt(req.params.id, 10);

    if (isNaN(campaignId)) {
      return res.status(400).json({ success: false, error: 'Invalid campaign ID' });
    }

    const campaign = await ensureCampaignOwnership(campaignId, userId);
    if (!campaign) {
      return res.status(404).json({ success: false, error: 'Campaign not found' });
    }
    if (!campaign.domainId) {
      return res
        .status(400)
        .json({ success: false, error: 'Campaign has no associated domain' });
    }

    const keywords = await prisma.keyword.findMany({
      where: { domainId: campaign.domainId },
      select: {
        id: true,
        term: true,
        volume: true,
        difficulty: true,
        intent: true,
        cpc: true,
      },
      orderBy: [{ volume: 'desc' }, { term: 'asc' }],
      take: 500,
    });

    res.json({
      success: true,
      keywords: keywords.map((k) => ({
        id: k.id,
        term: k.term,
        volume: k.volume,
        difficulty: k.difficulty,
        intent: k.intent || null,
        cpc: k.cpc || 0,
      })),
    });
  })
);

/* ----------------------------------------------------------------------------
 * Campaign structure — flat topic list with embedded keywords + draft state.
 * --------------------------------------------------------------------------*/

router.get(
  '/:id/structure',
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as AuthenticatedRequest).user.userId;
    const campaignId = parseInt(req.params.id, 10);

    if (isNaN(campaignId)) {
      return res.status(400).json({ success: false, error: 'Invalid campaign ID' });
    }

    return respondWithStructure(res, campaignId, userId);
  })
);

/* ----------------------------------------------------------------------------
 * Topic CRUD
 * --------------------------------------------------------------------------*/

router.post(
  '/:id/topics',
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as AuthenticatedRequest).user.userId;
    const campaignId = parseInt(req.params.id, 10);
    const { title, description, summary } = req.body;

    if (isNaN(campaignId)) {
      return res.status(400).json({ success: false, error: 'Invalid campaign ID' });
    }
    if (!title || !String(title).trim()) {
      return res.status(400).json({ success: false, error: 'Topic title is required' });
    }

    const campaign = await ensureCampaignOwnership(campaignId, userId);
    if (!campaign) {
      return res.status(404).json({ success: false, error: 'Campaign not found' });
    }

    const maxOrder = await prisma.campaignTopic.aggregate({
      where: { campaignId },
      _max: { order: true },
    });

    await prisma.campaignTopic.create({
      data: {
        campaignId,
        title: String(title).trim(),
        description: description?.trim() || null,
        summary: summary?.trim() || null,
        order: (maxOrder._max.order ?? 0) + 1,
        source: CampaignNodeSource.MANUAL,
      },
    });

    return respondWithStructure(res, campaignId, userId, 201);
  })
);

router.put(
  '/topics/:topicId',
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as AuthenticatedRequest).user.userId;
    const topicId = parseInt(req.params.topicId, 10);
    const { title, description, summary } = req.body || {};

    if (isNaN(topicId)) {
      return res.status(400).json({ success: false, error: 'Invalid topic ID' });
    }
    if (!title || !String(title).trim()) {
      return res.status(400).json({ success: false, error: 'Topic title is required' });
    }

    const topic = await ensureTopicOwnership(topicId, userId);
    if (!topic) {
      return res.status(404).json({ success: false, error: 'Topic not found' });
    }

    await prisma.campaignTopic.update({
      where: { id: topicId },
      data: {
        title: String(title).trim(),
        description:
          description !== undefined ? (description?.trim() || null) : undefined,
        summary: summary !== undefined ? (summary?.trim() || null) : undefined,
        source: CampaignNodeSource.MANUAL,
      },
    });

    return respondWithStructure(res, topic.campaignId, userId);
  })
);

router.delete(
  '/topics/:topicId',
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as AuthenticatedRequest).user.userId;
    const topicId = parseInt(req.params.topicId, 10);

    if (isNaN(topicId)) {
      return res.status(400).json({ success: false, error: 'Invalid topic ID' });
    }

    const topic = await ensureTopicOwnership(topicId, userId);
    if (!topic) {
      return res.status(404).json({ success: false, error: 'Topic not found' });
    }

    await prisma.$transaction(async (tx) => {
      // GenerationJob -> CampaignTopic is not cascade-delete.
      await tx.generationJob.deleteMany({ where: { topicId } });
      await tx.campaignTopic.delete({ where: { id: topicId } });
    });

    return respondWithStructure(res, topic.campaignId, userId);
  })
);

/* ----------------------------------------------------------------------------
 * Topic AI suggest — each AI suggestion becomes exactly one worksheet row.
 * --------------------------------------------------------------------------*/

const insertGeneratedTopics = async (
  tx: Prisma.TransactionClient,
  campaignId: number,
  topics: GeneratedTopic[],
  baseOrder: number
) => {
  let order = baseOrder;
  const aiMeta = { generatedAt: new Date().toISOString(), origin: 'topics_ai' };

  for (const t of topics) {
    const title = t.title?.trim();
    if (!title) continue;
    order += 1;

    const topic = await tx.campaignTopic.create({
      data: {
        campaignId,
        title,
        description: t.description?.trim() || null,
        summary: t.summary?.trim() || null,
        order,
        source: CampaignNodeSource.AI,
        aiMetadata: aiMeta,
      },
    });

    if (t.keywords?.length) {
      await tx.campaignKeyword.createMany({
        data: t.keywords.map((kw, idx) => ({
          term: kw.term,
          volume: kw.volume ?? null,
          difficulty: kw.difficulty || DEFAULT_KEYWORD_DIFFICULTY,
          intent: kw.intent || null,
          topicId: topic.id,
          source: CampaignNodeSource.AI,
          aiMetadata: {
            ...aiMeta,
            isPrimary: idx === 0,
            isLongtail: idx > 0,
          },
        })),
      });
    }
  }
};

router.post(
  '/:id/topics/ai',
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as AuthenticatedRequest).user.userId;
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
      return res
        .status(400)
        .json({ success: false, error: 'Company domain not found for this campaign' });
    }

    const existingTitles = (
      await prisma.campaignTopic.findMany({
        where: { campaign: { domainId: domain.id } },
        select: { title: true },
      })
    ).map((t) => t.title);

    const semanticAnalysis = await prisma.semanticAnalysis.findFirst({
      where: { domainId: domain.id },
      orderBy: { createdAt: 'desc' },
      select: { contentSummary: true },
    });

    let brandVoice: any;
    let targetAudience: any;
    if (semanticAnalysis?.contentSummary) {
      try {
        const parsed = JSON.parse(semanticAnalysis.contentSummary);
        brandVoice = parsed.brandVoice;
        targetAudience = parsed.targetAudience;
      } catch {
        /* ignore */
      }
    }

    const domainKeywords = extractDomainKeywords(domain).slice(0, 25);
    const seedKeywords = domainKeywords.sort(() => 0.5 - Math.random()).slice(0, 12);

    const generatedTopics = await generateCampaignTopics({
      domainUrl: domain.url,
      domainContext: domain.context,
      keywords: seedKeywords,
      count,
      focus,
      excludeTopics: existingTitles,
      campaignTitle: campaign.title,
      campaignDescription: campaign.description || undefined,
      location: (domain as any).location,
      locationContext: (domain as any).locationContext,
      brandVoice,
      targetAudience,
    });

    await prisma.$transaction(async (tx) => {
      const orderAggregate = await tx.campaignTopic.aggregate({
        where: { campaignId },
        _max: { order: true },
      });
      await insertGeneratedTopics(
        tx,
        campaignId,
        generatedTopics,
        orderAggregate._max.order ?? 0
      );
    });

    return respondWithStructure(res, campaignId, userId, 201);
  })
);

/**
 * POST /api/campaigns/topics/:topicId/title/ai
 *
 * In-place AI title suggestion for an existing topic. Uses the topic's
 * keywords + campaign + domain context to generate a title and short
 * summary, then writes them onto the row. Does NOT create a new topic.
 */
router.post(
  '/topics/:topicId/title/ai',
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as AuthenticatedRequest).user.userId;
    const topicId = parseInt(req.params.topicId, 10);

    if (isNaN(topicId)) {
      return res.status(400).json({ success: false, error: 'Invalid topic ID' });
    }

    const topic = await prisma.campaignTopic.findFirst({
      where: {
        id: topicId,
        campaign: { domain: { userId, isCompanyDomain: true } },
      },
      include: {
        keywords: true,
        campaign: { include: { domain: true } },
      },
    });

    if (!topic) {
      return res.status(404).json({ success: false, error: 'Topic not found' });
    }

    // Surface the primary keyword first so the prompt can lean on it.
    const sortedKeywords = topic.keywords
      .slice()
      .sort((a, b) => {
        const ap = (a.aiMetadata as any)?.isPrimary ? 0 : 1;
        const bp = (b.aiMetadata as any)?.isPrimary ? 0 : 1;
        if (ap !== bp) return ap - bp;
        return a.id - b.id;
      })
      .map((k) => k.term);

    const semanticAnalysis = await prisma.semanticAnalysis.findFirst({
      where: { domainId: topic.campaign.domain.id },
      orderBy: { createdAt: 'desc' },
      select: { contentSummary: true },
    });
    let brandVoice: any;
    let targetAudience: any;
    if (semanticAnalysis?.contentSummary) {
      try {
        const parsed = JSON.parse(semanticAnalysis.contentSummary);
        brandVoice = parsed.brandVoice;
        targetAudience = parsed.targetAudience;
      } catch {
        /* ignore */
      }
    }

    const suggestion = await generateTopicTitleSuggestion({
      domainUrl: topic.campaign.domain.url,
      domainContext: topic.campaign.domain.context,
      keywordTerms: sortedKeywords,
      campaignTitle: topic.campaign.title,
      campaignDescription: topic.campaign.description || undefined,
      currentTitle: topic.title,
      location: (topic.campaign.domain as any).location,
      locationContext: (topic.campaign.domain as any).locationContext,
      brandVoice,
      targetAudience,
    });

    await prisma.campaignTopic.update({
      where: { id: topicId },
      data: {
        title: suggestion.title,
        summary: suggestion.summary || topic.summary,
        source: CampaignNodeSource.AI,
      },
    });

    return respondWithStructure(res, topic.campaignId, userId);
  })
);

/* ----------------------------------------------------------------------------
 * Topic keywords
 * --------------------------------------------------------------------------*/

const clearOtherPrimariesForTopic = async (
  tx: Prisma.TransactionClient,
  topicId: number,
  exceptKeywordId?: number
) => {
  const others = await tx.campaignKeyword.findMany({
    where: {
      topicId,
      ...(exceptKeywordId !== undefined ? { id: { not: exceptKeywordId } } : {}),
    },
  });
  await Promise.all(
    others
      .filter((k) => (k.aiMetadata as any)?.isPrimary)
      .map((k) =>
        tx.campaignKeyword.update({
          where: { id: k.id },
          data: {
            aiMetadata: {
              ...((k.aiMetadata as Record<string, any>) ?? {}),
              isPrimary: false,
            },
          },
        })
      )
  );
};

/**
 * Worksheet invariant: every keyword on a row is either Primary or Longtail.
 * "Plain" untagged keywords are not permitted by the new model.
 *
 * Resolution rule when the caller does not specify a type:
 *   - if the topic has no Primary yet, the new keyword becomes Primary;
 *   - otherwise it becomes Longtail.
 */
const resolveKeywordType = async (
  tx: Prisma.TransactionClient,
  topicId: number,
  requested: 'primary' | 'longtail' | undefined
): Promise<'primary' | 'longtail'> => {
  if (requested === 'primary' || requested === 'longtail') return requested;
  const existingPrimary = await tx.campaignKeyword.findFirst({
    where: {
      topicId,
      aiMetadata: { path: ['isPrimary'], equals: true },
    },
    select: { id: true },
  });
  return existingPrimary ? 'longtail' : 'primary';
};

const buildKeywordMetadata = (
  type: 'primary' | 'longtail',
  origin: 'manual' | 'ai'
): Record<string, any> => ({
  isPrimary: type === 'primary',
  isLongtail: type === 'longtail',
  origin,
  generatedAt: new Date().toISOString(),
});

router.post(
  '/topics/:topicId/keywords',
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as AuthenticatedRequest).user.userId;
    const topicId = parseInt(req.params.topicId, 10);
    const { term, volume, difficulty, intent, keywordType } = req.body || {};

    if (isNaN(topicId)) {
      return res.status(400).json({ success: false, error: 'Invalid topic ID' });
    }
    if (!term || !String(term).trim()) {
      return res.status(400).json({ success: false, error: 'Keyword term is required' });
    }
    if (keywordType !== undefined && keywordType !== 'primary' && keywordType !== 'longtail') {
      return res
        .status(400)
        .json({ success: false, error: 'keywordType must be "primary" or "longtail"' });
    }

    const topic = await ensureTopicOwnership(topicId, userId);
    if (!topic) {
      return res.status(404).json({ success: false, error: 'Topic not found' });
    }

    await prisma.$transaction(async (tx) => {
      const resolvedType = await resolveKeywordType(tx, topicId, keywordType);
      if (resolvedType === 'primary') {
        await clearOtherPrimariesForTopic(tx, topicId);
      }
      await tx.campaignKeyword.create({
        data: {
          term: String(term).trim(),
          volume: Number.isFinite(volume) ? Number(volume) : null,
          difficulty: difficulty || DEFAULT_KEYWORD_DIFFICULTY,
          intent: intent || null,
          topicId,
          source: CampaignNodeSource.MANUAL,
          aiMetadata: buildKeywordMetadata(resolvedType, 'manual'),
        },
      });
    });

    return respondWithStructure(res, topic.campaignId, userId, 201);
  })
);

router.post(
  '/topics/:topicId/keywords/ai',
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as AuthenticatedRequest).user.userId;
    const topicId = parseInt(req.params.topicId, 10);
    const { count = 5 } = req.body || {};

    if (isNaN(topicId)) {
      return res.status(400).json({ success: false, error: 'Invalid topic ID' });
    }

    const topic = await ensureTopicOwnership(topicId, userId);
    if (!topic) {
      return res.status(404).json({ success: false, error: 'Topic not found' });
    }

    // Pull existing keywords so the AI doesn't propose duplicates and so we
    // know whether a Primary already exists.
    const existingKeywords = await prisma.campaignKeyword.findMany({
      where: { topicId },
      select: { term: true, aiMetadata: true },
    });
    const existingTerms = existingKeywords.map((k) => k.term);
    const hasExistingPrimary = existingKeywords.some(
      (k) => (k.aiMetadata as any)?.isPrimary === true
    );

    // Pull semantic analysis for richer brand context (matches topic-gen path).
    const semanticAnalysis = await prisma.semanticAnalysis.findFirst({
      where: { domainId: topic.campaign.domain.id },
      orderBy: { createdAt: 'desc' },
      select: { contentSummary: true },
    });
    let brandVoice: any;
    let targetAudience: any;
    if (semanticAnalysis?.contentSummary) {
      try {
        const parsed = JSON.parse(semanticAnalysis.contentSummary);
        brandVoice = parsed.brandVoice;
        targetAudience = parsed.targetAudience;
      } catch {
        /* ignore */
      }
    }

    const domainKeywords = extractDomainKeywords(topic.campaign.domain).slice(0, 25);
    const suggestions = await generateKeywordsSuggestion({
      domainUrl: topic.campaign.domain.url,
      domainContext: topic.campaign.domain.context,
      keywords: domainKeywords,
      topicTitle: topic.title,
      existingTerms,
      campaignTitle: topic.campaign.title,
      campaignDescription: topic.campaign.description || undefined,
      count,
      location: (topic.campaign.domain as any).location,
      locationContext: (topic.campaign.domain as any).locationContext,
      brandVoice,
      targetAudience,
    });

    if (!suggestions.length) {
      return respondWithStructure(res, topic.campaignId, userId);
    }

    await prisma.$transaction(async (tx) => {
      // If no Primary exists yet, the first AI-suggested keyword takes that
      // role and the rest are Longtails. If a Primary already exists, all
      // AI suggestions are Longtails.
      await tx.campaignKeyword.createMany({
        data: suggestions.map((kw, idx) => {
          const type: 'primary' | 'longtail' =
            !hasExistingPrimary && idx === 0 ? 'primary' : 'longtail';
          return {
            term: kw.term,
            volume: kw.volume ?? null,
            difficulty: kw.difficulty || DEFAULT_KEYWORD_DIFFICULTY,
            intent: kw.intent || null,
            topicId,
            source: CampaignNodeSource.AI,
            aiMetadata: buildKeywordMetadata(type, 'ai'),
          };
        }),
        skipDuplicates: true,
      });
    });

    return respondWithStructure(res, topic.campaignId, userId, 201);
  })
);

/* ----------------------------------------------------------------------------
 * Keyword type management
 * --------------------------------------------------------------------------*/

router.post(
  '/keywords/:keywordId/select-primary',
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as AuthenticatedRequest).user.userId;
    const keywordId = parseInt(req.params.keywordId, 10);

    if (isNaN(keywordId)) {
      return res.status(400).json({ success: false, error: 'Invalid keyword ID' });
    }

    const keyword = await ensureKeywordOwnership(keywordId, userId);
    if (!keyword) {
      return res.status(404).json({ success: false, error: 'Keyword not found' });
    }
    if (!keyword.topicId) {
      return res
        .status(400)
        .json({ success: false, error: 'Keyword must be associated with a topic' });
    }

    await prisma.$transaction(async (tx) => {
      await clearOtherPrimariesForTopic(tx, keyword.topicId!, keywordId);
      await tx.campaignKeyword.update({
        where: { id: keywordId },
        data: {
          aiMetadata: {
            ...((keyword.aiMetadata as Record<string, any>) ?? {}),
            isPrimary: true,
            isLongtail: false,
          },
        },
      });
    });

    return respondWithStructure(res, keyword.topic!.campaignId, userId);
  })
);

router.post(
  '/keywords/:keywordId/select-longtail',
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as AuthenticatedRequest).user.userId;
    const keywordId = parseInt(req.params.keywordId, 10);

    if (isNaN(keywordId)) {
      return res.status(400).json({ success: false, error: 'Invalid keyword ID' });
    }

    const keyword = await ensureKeywordOwnership(keywordId, userId);
    if (!keyword) {
      return res.status(404).json({ success: false, error: 'Keyword not found' });
    }
    if (!keyword.topicId) {
      return res
        .status(400)
        .json({ success: false, error: 'Keyword must be associated with a topic' });
    }

    await prisma.campaignKeyword.update({
      where: { id: keywordId },
      data: {
        aiMetadata: {
          ...((keyword.aiMetadata as Record<string, any>) ?? {}),
          isPrimary: false,
          isLongtail: true,
        },
      },
    });

    return respondWithStructure(res, keyword.topic!.campaignId, userId);
  })
);

router.post(
  '/keywords/:keywordId/deselect',
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as AuthenticatedRequest).user.userId;
    const keywordId = parseInt(req.params.keywordId, 10);

    if (isNaN(keywordId)) {
      return res.status(400).json({ success: false, error: 'Invalid keyword ID' });
    }

    const keyword = await ensureKeywordOwnership(keywordId, userId);
    if (!keyword) {
      return res.status(404).json({ success: false, error: 'Keyword not found' });
    }
    if (!keyword.topicId) {
      return res
        .status(400)
        .json({ success: false, error: 'Keyword must be associated with a topic' });
    }

    await prisma.campaignKeyword.update({
      where: { id: keywordId },
      data: {
        aiMetadata: {
          ...((keyword.aiMetadata as Record<string, any>) ?? {}),
          isPrimary: false,
          isLongtail: false,
        },
      },
    });

    return respondWithStructure(res, keyword.topic!.campaignId, userId);
  })
);

/**
 * PATCH /api/campaigns/keywords/:keywordId
 *
 * Update the term on an existing keyword. Other fields (volume, difficulty,
 * intent) are also accepted but optional. Inline edits from the worksheet
 * call this — the keyword's primary/longtail tag is left alone.
 */
router.patch(
  '/keywords/:keywordId',
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as AuthenticatedRequest).user.userId;
    const keywordId = parseInt(req.params.keywordId, 10);
    const { term, volume, difficulty, intent } = req.body || {};

    if (isNaN(keywordId)) {
      return res.status(400).json({ success: false, error: 'Invalid keyword ID' });
    }
    if (term !== undefined && (!term || !String(term).trim())) {
      return res.status(400).json({ success: false, error: 'Keyword term cannot be empty' });
    }

    const keyword = await ensureKeywordOwnership(keywordId, userId);
    if (!keyword) {
      return res.status(404).json({ success: false, error: 'Keyword not found' });
    }

    const data: Prisma.CampaignKeywordUpdateInput = {};
    if (term !== undefined) data.term = String(term).trim();
    if (volume !== undefined) data.volume = Number.isFinite(volume) ? Number(volume) : null;
    if (difficulty !== undefined) data.difficulty = difficulty || DEFAULT_KEYWORD_DIFFICULTY;
    if (intent !== undefined) data.intent = intent || null;

    if (Object.keys(data).length === 0) {
      return res
        .status(400)
        .json({ success: false, error: 'No editable fields supplied' });
    }

    await prisma.campaignKeyword.update({ where: { id: keywordId }, data });
    return respondWithStructure(res, keyword.topic!.campaignId, userId);
  })
);

router.delete(
  '/keywords/:keywordId',
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as AuthenticatedRequest).user.userId;
    const keywordId = parseInt(req.params.keywordId, 10);

    if (isNaN(keywordId)) {
      return res.status(400).json({ success: false, error: 'Invalid keyword ID' });
    }

    const keyword = await ensureKeywordOwnership(keywordId, userId);
    if (!keyword) {
      return res.status(404).json({ success: false, error: 'Keyword not found' });
    }

    await prisma.campaignKeyword.delete({ where: { id: keywordId } });
    return respondWithStructure(res, keyword.topic!.campaignId, userId);
  })
);

/* ----------------------------------------------------------------------------
 * Generate — async universal n8n template flow.
 *
 * The route validates the request, creates a GenerationJob row, kicks off
 * the runner in the background, and returns 202 immediately. Progress and
 * the final result stream back over the SSE channel
 * (/api/campaigns/events) as `generation:update` events. The job's latest
 * snapshot is also retrievable via GET /topics/:topicId/generation-job.
 * --------------------------------------------------------------------------*/

router.post(
  '/topics/:topicId/generate',
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as AuthenticatedRequest).user.userId;
    const topicId = parseInt(req.params.topicId, 10);

    if (isNaN(topicId)) {
      return res.status(400).json({ success: false, error: 'Invalid topic ID' });
    }

    // Cheap ownership + readiness preflight before we let the runner do the
    // heavy work. Saves a job row + an n8n round-trip on bad input.
    const topic = await prisma.campaignTopic.findFirst({
      where: {
        id: topicId,
        campaign: { domain: { userId, isCompanyDomain: true } },
      },
      include: { keywords: true },
    });
    if (!topic) {
      return res.status(404).json({ success: false, error: 'Topic not found' });
    }
    const hasPrimary = topic.keywords.some((k) => (k.aiMetadata as any)?.isPrimary === true);
    if (!hasPrimary) {
      return res.status(400).json({
        success: false,
        error:
          'Topic must have a primary keyword before it can be generated. Pick one from the worksheet.',
      });
    }

    const body = (req.body || {}) as Record<string, unknown>;
    try {
      const job = await startGenerationJob({
        topicId,
        userId,
        templateType: body.template_type as TemplateType,
        body,
      });
      return res.status(202).json({ success: true, job });
    } catch (err) {
      if (err instanceof GenerationJobConflictError) {
        return res.status(409).json({ success: false, error: err.message });
      }
      if (err instanceof GenerationJobValidationError) {
        return res.status(400).json({
          success: false,
          error: err.message,
          details: err.details,
        });
      }
      throw err;
    }
  })
);

router.get(
  '/topics/:topicId/generation-job',
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as AuthenticatedRequest).user.userId;
    const topicId = parseInt(req.params.topicId, 10);

    if (isNaN(topicId)) {
      return res.status(400).json({ success: false, error: 'Invalid topic ID' });
    }

    const topic = await ensureTopicOwnership(topicId, userId);
    if (!topic) {
      return res.status(404).json({ success: false, error: 'Topic not found' });
    }

    const job = await getJobForTopic(topicId);
    return res.json({ success: true, job });
  })
);

/* ----------------------------------------------------------------------------
 * Drafts — read a single WordpressPublishLog row.
 * --------------------------------------------------------------------------*/

router.get(
  '/drafts/:draftId',
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as AuthenticatedRequest).user.userId;
    const draftId = parseInt(req.params.draftId, 10);

    if (isNaN(draftId)) {
      return res.status(400).json({ success: false, error: 'Invalid draft ID' });
    }

    const draft = await prisma.wordpressPublishLog.findFirst({
      where: { id: draftId, userId },
    });

    if (!draft) {
      return res.status(404).json({ success: false, error: 'Draft not found' });
    }

    // serializeDraftContent picks out normalized fields (htmlContent, title,
    // metaDescription, slug, featuredImage*, status) from the persisted
    // n8n response — matching the publish flow's draft shape.
    const content = serializeDraftContent(draft);

    res.json({
      success: true,
      draft: {
        ...content, // includes updatedAt from serializeDraftContent
        id: draft.id,
        topicId: draft.generationTopicId,
        createdAt: draft.createdAt.toISOString(),
      },
    });
  })
);

export default router;
