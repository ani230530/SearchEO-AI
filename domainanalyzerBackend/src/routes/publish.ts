import { Router, Request, Response } from 'express';
import express from 'express';
import axios from 'axios';
import { prisma } from '../lib/prisma';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { encryptToken, decryptToken } from '../services/tokenEncryption';
import {
  normalizeFeaturedImageEnabled,
  normalizeFeaturedImageUrl,
  normalizePublishGenerateResponse,
  serializeDraftContent,
} from '../services/contentFlowService';
import { parseSiteUrlInput } from '../utils/domainValidation';
import { uploadImage } from '../utils/cloudinary';

const router = Router();

const REVIEW_WEBHOOK_URL =
  process.env.N8N_REVIEW_WEBHOOK_URL ||
  'https://n8n.srv891599.hstgr.cloud/webhook/2d2377dd-8a3b-4194-ae51-d38352b55024';
const PUBLISH_WEBHOOK_URL =
  process.env.N8N_PUBLISH_WEBHOOK_URL ||
  'https://n8n.srv891599.hstgr.cloud/webhook/a30fde1b-f254-4ff9-86b7-ba83f9bef42f';
const EDIT_TEXT_WEBHOOK_URL =
  process.env.N8N_EDIT_TEXT_WEBHOOK_URL ||
  'https://n8n.srv891599.hstgr.cloud/webhook/06805f5f-09ed-4346-a75c-34aeaf8bbfbf';
const EDIT_IMAGE_WEBHOOK_URL =
  process.env.N8N_EDIT_IMAGE_WEBHOOK_URL ||
  'https://n8n.srv891599.hstgr.cloud/webhook/d73f8808-4c87-42bb-b52e-49c25396ab49';
const EDIT_AFTER_PUBLISH_WEBHOOK_URL =
  process.env.N8N_EDIT_AFTER_PUBLISH_WEBHOOK_URL ||
  'https://n8n.srv891599.hstgr.cloud/webhook/edit-after-publish';
const N8N_API_KEY = process.env.N8N_API_KEY || '1234';
const N8N_API_KEY_HEADER = process.env.N8N_API_KEY_HEADER || 'key';
const N8N_TIMEOUT_MS = Number(process.env.N8N_TIMEOUT_MS) || 300000;

const asyncHandler =
  (fn: (req: Request, res: Response, next: any) => Promise<any>) =>
    (req: Request, res: Response, next: any) =>
      Promise.resolve(fn(req, res, next)).catch(next);

const callWebhook = async (url: string, payload: any) => {
  if (process.env.NODE_ENV !== 'production') {
    // Log what we are sending to n8n, masking sensitive fields
    const maskSecrets = (value: any): any => {
      if (!value || typeof value !== 'object') return value;
      if (Array.isArray(value)) {
        return value.map((item) => maskSecrets(item));
      }
      const clone: Record<string, any> = { ...value };
      if (clone.password) clone.password = '***';
      if (clone.Password) clone.Password = '***';
      if (clone.token) clone.token = '***';
      return clone;
    };

    console.log('[n8n webhook request]', {
      url,
      payload: maskSecrets(payload),
    });
  }

  const response = await axios.post(url, payload, {
    headers: {
      'Content-Type': 'application/json',
      [N8N_API_KEY_HEADER]: N8N_API_KEY,
    },
    timeout: N8N_TIMEOUT_MS,
  });

  if (process.env.NODE_ENV !== 'production') {
    console.log('[n8n webhook response]', {
      url,
      status: response.status,
      statusText: response.statusText,
      data: response.data,
    });
  }

  return response.data;
};

const getIntegrationOrThrow = async (userId: number) => {
  const integration = await prisma.wordpressIntegration.findUnique({
    where: { userId },
  });

  if (!integration) {
    throw new Error('WordPress integration not configured');
  }

  return integration;
};

const getCompanyDomainForUser = async (userId: number): Promise<{ url: string; context: string } | null> => {
  // Domain.context lived on the legacy schema. Crawl text now lives on the
  // latest CrawlSnapshot.rawText, and the synthesized profile sits on
  // DomainInferred. Return both flat for callers that expect a `context` blob.
  const domain = await prisma.domain.findFirst({
    where: { userId, isCompanyDomain: true },
    select: {
      url: true,
      inferred: { select: { summary: true } },
      crawls: { orderBy: { createdAt: 'desc' }, take: 1, select: { rawText: true } },
    },
  });
  if (!domain) return null;
  const context = domain.inferred?.summary ?? domain.crawls[0]?.rawText ?? '';
  return { url: domain.url, context };
};

const summarizeContext = (input?: string | null, maxLines = 6, maxChars = 1000) => {
  if (!input) return '';
  const normalized = input.replace(/\r\n/g, '\n');
  const lines = normalized
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const limited = lines.slice(0, maxLines).join('\n');
  if (limited.length <= maxChars) return limited;
  return `${limited.slice(0, maxChars)}…`;
};

router.get(
  '/wordpress',
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user.userId;

    const integration = await prisma.wordpressIntegration.findUnique({
      where: { userId },
      select: {
        siteUrl: true,
        username: true,
        lastPublishedAt: true,
        updatedAt: true,
      },
    });

    res.json({
      success: true,
      integration,
    });
  })
);

router.post(
  '/wordpress',
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user.userId;
    const { siteUrl, username, password } = req.body;

    if (!siteUrl || !username) {
      return res.status(400).json({
        success: false,
        error: 'Site URL and username are required',
      });
    }

    const parsedSiteUrl = parseSiteUrlInput(siteUrl);
    if (!parsedSiteUrl) {
      return res.status(400).json({
        success: false,
        error: 'Please enter a valid WordPress site URL (e.g., https://example.org)',
      });
    }

    const sanitizedUrl = parsedSiteUrl.normalizedSiteUrl;
    const sanitizedUsername = username.trim();

    const existingIntegration = await prisma.wordpressIntegration.findUnique({
      where: { userId },
      select: { password: true },
    });

    const trimmedPassword = typeof password === 'string' ? password.trim() : '';
    const encryptedPassword = trimmedPassword
      ? encryptToken(trimmedPassword)
      : existingIntegration?.password;

    if (!encryptedPassword) {
      return res.status(400).json({
        success: false,
        error: 'Password is required for first-time connection',
      });
    }

    await prisma.wordpressIntegration.upsert({
      where: { userId },
      update: {
        siteUrl: sanitizedUrl,
        username: sanitizedUsername,
        password: encryptedPassword,
      },
      create: {
        userId,
        siteUrl: sanitizedUrl,
        username: sanitizedUsername,
        password: encryptedPassword,
      },
    });

    res.json({
      success: true,
      message: 'WordPress integration saved',
    });
  })
);

router.delete(
  '/wordpress',
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user.userId;

    await prisma.wordpressIntegration.delete({
      where: { userId },
    });

    res.json({
      success: true,
      message: 'WordPress integration removed',
    });
  })
);


router.post(
  '/edit-text',
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    const { title, metaDescription, originalContent, userNote } = req.body;

    if (!originalContent || !userNote) {
      return res.status(400).json({
        success: false,
        error: 'Original content and note are required',
      });
    }

    try {
      const response = await callWebhook(EDIT_TEXT_WEBHOOK_URL, {
        title,
        metaDescription,
        originalContent,
        userNote,
      });

      res.json({
        success: true,
        result: response,
      });
    } catch (error: any) {
      console.error('Error editing text:', error?.response?.data || error);
      res.status(500).json({
        success: false,
        error: 'Failed to edit text with automation service',
        details: error?.response?.data,
      });
    }
  })
);

router.post(
  '/edit-image',
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    const { title, metaDescription, image, userNote } = req.body;

    if (!image || !userNote) {
      return res.status(400).json({
        success: false,
        error: 'Image URL and note are required',
      });
    }

    try {
      const response = await callWebhook(EDIT_IMAGE_WEBHOOK_URL, {
        title,
        metaDescription,
        image,
        userNote,
      });

      res.json({
        success: true,
        result: response,
      });
    } catch (error: any) {
      const status = error?.response?.status;
      const n8nMessage =
        error?.response?.data?.message ||
        (typeof error?.response?.data === 'string' ? error.response.data : undefined) ||
        error?.message;
      const reason = error?.code === 'ECONNABORTED'
        ? `Edit-image webhook timed out after ${N8N_TIMEOUT_MS}ms`
        : status
          ? `Edit-image webhook returned ${status}: ${n8nMessage || 'no message'}`
          : `Edit-image webhook unreachable: ${n8nMessage || 'unknown error'}`;
      console.error('[publish] edit-image failed', {
        url: EDIT_IMAGE_WEBHOOK_URL,
        status,
        code: error?.code,
        message: error?.message,
        responseData: error?.response?.data,
      });
      res.status(502).json({
        success: false,
        error: reason,
        details: error?.response?.data,
      });
    }
  })
);

// Accept up to 20MB so a user can attach a high-res photo. Route-scoped
// body parser — the global express.json limit is 5MB, which is fine for
// regular JSON but too tight for an inlined base64 image.
const imageUploadJsonParser = express.json({ limit: '20mb' });

const DATA_URL_REGEX = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/;

router.post(
  '/upload-image',
  imageUploadJsonParser,
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    const { imageData } = req.body as { imageData?: string };

    if (!imageData || typeof imageData !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'imageData (base64 data URL) is required',
      });
    }

    const match = imageData.match(DATA_URL_REGEX);
    if (!match) {
      return res.status(400).json({
        success: false,
        error: 'imageData must be a base64 data URL (data:image/...;base64,...)',
      });
    }

    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Decoded image is empty',
      });
    }
    if (buffer.length > 15 * 1024 * 1024) {
      return res.status(413).json({
        success: false,
        error: 'Image exceeds 15MB limit',
      });
    }

    try {
      const { secureUrl } = await uploadImage(buffer, 'draft-images');
      return res.json({ success: true, url: secureUrl });
    } catch (error: any) {
      console.error('[publish] upload-image failed', error);
      return res.status(502).json({
        success: false,
        error: error?.message || 'Failed to upload image',
      });
    }
  })
);

router.post(
  '/published-edit',
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user.userId;
    const {
      draftId,
      pageId,
      primaryKeyword,
      htmlContent,
      featuredImageEnabled = true,
      featuredImageUrl,
      title,
      metaDescription,
      slug,
      longtailKeywords,
      wordpressUrl,
    } = req.body;

    if (!draftId || !htmlContent || !title) {
      return res.status(400).json({
        success: false,
        error: 'Draft ID, title, and HTML content are required',
      });
    }

    const draft = await prisma.wordpressPublishLog.findFirst({
      where: { id: Number(draftId), userId },
    });

    if (!draft) {
      return res.status(404).json({
        success: false,
        error: 'Published draft not found',
      });
    }

    if (draft.status !== 'published') {
      return res.status(400).json({
        success: false,
        error: 'Only published blogs can use the published edit workflow',
      });
    }

    let integration;
    try {
      integration = await getIntegrationOrThrow(userId);
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }

    let decryptedPassword: string;
    try {
      decryptedPassword = decryptToken(integration.password);
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: 'WordPress integration password cannot be decrypted.',
      });
    }

    const currentStored = serializeDraftContent(draft);
    const normalizedFeaturedImageUrl = normalizeFeaturedImageUrl(featuredImageUrl);
    const resolvedWordpressUrl =
      (typeof wordpressUrl === 'string' && wordpressUrl.trim()) ||
      draft.wordpressUrl ||
      currentStored.wordpressUrl ||
      integration.siteUrl;

    const mergedStoredData = {
      ...(((draft.response as Record<string, unknown> | null) || {}) as Record<string, unknown>),
      primaryKeyword:
        primaryKeyword || draft.primaryKeyword || currentStored.primaryKeyword || null,
      htmlContent,
      featuredImageEnabled: normalizeFeaturedImageEnabled(
        featuredImageEnabled,
        Boolean(normalizedFeaturedImageUrl || currentStored.featuredImageUrl)
      ),
      featuredImageUrl: normalizedFeaturedImageUrl || currentStored.featuredImageUrl || null,
      title,
      metaDescription: metaDescription ?? currentStored.metaDescription ?? null,
      slug: slug ?? draft.slug ?? currentStored.slug ?? null,
      wordpressPostId: draft.wordpressPostId ?? currentStored.wordpressPostId ?? null,
      longtailKeywords: longtailKeywords ?? currentStored.longtailKeywords ?? null,
      wordpressUrl: resolvedWordpressUrl,
      status: 'published',
      lastEditedAt: new Date().toISOString(),
    };

    const webhookPayload = {
      draftId: draft.id,
      pageId: pageId ? Number(pageId) : null,
      wordpress: {
        url: integration.siteUrl,
        username: integration.username,
        password: decryptedPassword,
        liveUrl: resolvedWordpressUrl,
      },
      draft: {
        id: draft.id,
        userId: draft.userId,
        status: draft.status,
        createdAt: draft.createdAt.toISOString(),
        updatedAt: draft.updatedAt.toISOString(),
        wordpressUrl: resolvedWordpressUrl,
        wordpressPostId: mergedStoredData.wordpressPostId,
        primaryKeyword: mergedStoredData.primaryKeyword,
        title,
        metaDescription: mergedStoredData.metaDescription,
        slug: mergedStoredData.slug,
        longtailKeywords: mergedStoredData.longtailKeywords,
        response: mergedStoredData,
      },
      article: mergedStoredData,
    };

    try {
      const webhookResponse = await callWebhook(EDIT_AFTER_PUBLISH_WEBHOOK_URL, webhookPayload);

      await prisma.wordpressPublishLog.update({
        where: { id: draft.id },
        data: {
          title,
          slug: (mergedStoredData.slug as string | null) ?? draft.slug,
          wordpressUrl: resolvedWordpressUrl,
          wordpressPostId: (mergedStoredData.wordpressPostId as number | null) ?? draft.wordpressPostId,
          status: 'published',
          response: {
            ...mergedStoredData,
            editAfterPublishResponse: webhookResponse,
          },
        },
      });

      return res.json({
        success: true,
        draftId: draft.id,
        wordpressUrl: resolvedWordpressUrl,
        result: webhookResponse,
      });
    } catch (error: any) {
      console.error('Error editing published blog:', error?.response?.data || error);
      return res.status(500).json({
        success: false,
        error: 'Failed to update published blog',
        details: error?.response?.data,
      });
    }
  })
);

router.post(
  '/publish',
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user.userId;
    const {
      draftId,
      primaryKeyword: bodyPrimaryKeyword,
      htmlContent: bodyHtmlContent,
      featuredImageEnabled: bodyFeaturedImageEnabled,
      featuredImageUrl: bodyFeaturedImageUrl,
      title: bodyTitle,
      metaDescription: bodyMetaDescription,
      slug: bodySlug,
      pageId, // legacy — accepted for compatibility but no longer used
      topicId, // flat-topic model: drafts link to CampaignTopic
    } = req.body;

    let integration;
    try {
      integration = await getIntegrationOrThrow(userId);
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }

    // If draftId is provided, check if draft exists. The persisted draft
    // also acts as a fallback for missing body fields — that's the path
    // the worksheet uses (a one-shot { draftId } publish where the server
    // pulls all metadata from the saved draft).
    let existingDraft: any = null;
    let storedContent: ReturnType<typeof serializeDraftContent> | null = null;
    if (draftId) {
      existingDraft = await prisma.wordpressPublishLog.findFirst({
        where: { id: Number(draftId), userId },
      });
      if (!existingDraft) {
        return res.status(404).json({
          success: false,
          error: 'Draft not found',
        });
      }
      storedContent = serializeDraftContent(existingDraft);
    }

    // Resolve effective fields: explicit body values win (overlay path with
    // unsaved edits), otherwise fall back to the stored draft content.
    const primaryKeyword = bodyPrimaryKeyword || storedContent?.primaryKeyword;
    const htmlContent = bodyHtmlContent || storedContent?.htmlContent;
    const title = bodyTitle ?? storedContent?.title;
    const metaDescription = bodyMetaDescription ?? storedContent?.metaDescription;
    const slug = bodySlug ?? storedContent?.slug;
    const featuredImageUrl =
      bodyFeaturedImageUrl ?? storedContent?.featuredImageUrl ?? undefined;
    const featuredImageEnabled =
      bodyFeaturedImageEnabled !== undefined
        ? bodyFeaturedImageEnabled
        : storedContent?.featuredImageEnabled ?? true;

    if (!primaryKeyword || !htmlContent) {
      return res.status(400).json({
        success: false,
        error: 'Primary keyword and HTML content are required',
      });
    }

    let decryptedPassword: string;
    try {
      decryptedPassword = decryptToken(integration.password);
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: 'WordPress integration password cannot be decrypted.'
      });
    }

    const payload = [
      {
        Username: integration.username,
        Password: decryptedPassword,
        'wordpress url': integration.siteUrl,
        'Primary Keyword': primaryKeyword,
        'Html Content': htmlContent,
        'Featured Image': normalizeFeaturedImageUrl(featuredImageUrl) || (normalizeFeaturedImageEnabled(featuredImageEnabled, true) ? 'yes' : 'no'),
        Title: title,
        'Meta Description': metaDescription,
        slug,
      },
    ];

    // Create or Update Draft (Status: generating / queued)
    // We use 'generating' so UI shows spinner
    const updateData = {
      wordpressUrl: existingDraft?.wordpressUrl || 'draft://generating',
      primaryKeyword,
      title,
      slug,
      status: 'generating',
      integrationId: integration.id,
    };

    let savedDraft;
    if (existingDraft) {
      savedDraft = await prisma.wordpressPublishLog.update({
        where: { id: existingDraft.id },
        data: updateData
      });
    } else {
      savedDraft = await prisma.wordpressPublishLog.create({
        data: {
          userId,
          ...updateData
        }
      });
    }

    // Flat-topic model: link draft to CampaignTopic via topicId. Page-level
    // linking is gone with the CampaignPage table.
    if (topicId) {
      await prisma.campaignTopic.update({
        where: { id: Number(topicId) },
        data: { latestDraftId: savedDraft.id },
      }).catch((err: unknown) => console.error('[Publish] Failed to link draft to topic:', err));
    }

    // pageId is no longer a real concept. Keep variable for downstream calls
    // but always undefined under the new model.
    const finalPageId: number | undefined = undefined;

    // Add to Queue
    // We need to pass necessary meta info for the worker to update DB later
    const { addN8nJob, JOB_TYPES } = await import('../services/queueService');
    await addN8nJob(JOB_TYPES.PUBLISH, {
      url: PUBLISH_WEBHOOK_URL,
      payload,
      headers: {
        'Content-Type': 'application/json',
        [N8N_API_KEY_HEADER]: N8N_API_KEY,
      },
      meta: {
        draftId: savedDraft.id,
        userId,
        integrationId: integration.id,
        primaryKeyword,
        title,
        slug,
        pageId: finalPageId // Include pageId for global sync
      }
    });

    res.json({
      success: true,
      message: 'Publish job queued',
      draftId: savedDraft.id,
      status: 'generating' // UI will treat this as 'in progress'
    });
  })
);




router.post(
  '/drafts',
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user.userId;
    const {
      draftId,
      primaryKeyword,
      htmlContent,
      featuredImageEnabled = true,
      featuredImageUrl,
      title,
      metaDescription,
      slug,
      longtailKeywords,
      wordpressUrl,
    } = req.body;

    if (!htmlContent || !title) {
      return res.status(400).json({
        success: false,
        error: 'Title and HTML content are required to save a draft',
      });
    }

    const integration = await prisma.wordpressIntegration.findUnique({
      where: { userId },
    });

    const resolvedWordpressUrl =
      (typeof wordpressUrl === 'string' && wordpressUrl.trim()) ||
      integration?.siteUrl ||
      'draft://pending';

    const {
      campaignId,
      topicId,
      pageId,
      pageType,
      pageIndex,
    } = req.body;

    const responsePayload = {
      primaryKeyword,
      htmlContent,
      featuredImageEnabled: normalizeFeaturedImageEnabled(featuredImageEnabled, true),
      featuredImageUrl: normalizeFeaturedImageUrl(featuredImageUrl),
      title,
      metaDescription,
      slug,
      longtailKeywords,
      wordpressUrl: resolvedWordpressUrl,
      savedAt: new Date().toISOString(),
      // Campaign metadata to track which topic/page this draft belongs to
      ...(campaignId && { campaignId }),
      ...(topicId && { topicId }),
      ...(pageId && { pageId }),
      ...(pageType && { pageType }),
      ...(pageIndex !== undefined && { pageIndex }),
    };

    try {
      if (draftId) {
        const existing = await prisma.wordpressPublishLog.findFirst({
          where: { id: Number(draftId), userId },
        });

        if (!existing) {
          return res.status(404).json({
            success: false,
            error: 'Draft not found',
          });
        }

        const updated = await prisma.wordpressPublishLog.update({
          where: { id: Number(draftId) },
          data: {
            primaryKeyword,
            title,
            slug,
            wordpressUrl: resolvedWordpressUrl,
            status: 'draft',
            response: responsePayload,
            integrationId: integration?.id,
          },
        });

        // Flat-topic model: link to CampaignTopic instead of CampaignPage.
        if (topicId) {
          await prisma.campaignTopic.update({
            where: { id: Number(topicId) },
            data: { latestDraftId: updated.id }
          }).catch((e: unknown) => console.error('Failed to link draft to topic', e));
        }

        return res.json({
          success: true,
          draftId: updated.id,
        });
      }

      const draft = await prisma.wordpressPublishLog.create({
        data: {
          userId,
          wordpressUrl: resolvedWordpressUrl,
          primaryKeyword,
          title,
          slug,
          status: 'draft',
          response: responsePayload,
          integrationId: integration?.id,
        },
      });

      if (topicId) {
        await prisma.campaignTopic.update({
          where: { id: Number(topicId) },
          data: { latestDraftId: draft.id }
        }).catch((e: unknown) => console.error('Failed to link draft to topic', e));
      }

      return res.json({
        success: true,
        draftId: draft.id,
      });
    } catch (error: any) {
      console.error('Error saving draft:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to save draft',
      });
    }
  })
);

router.get(
  '/drafts/:draftId',
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
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

    res.json({
      success: true,
      draft: serializeDraftContent(draft)
    });
  })
);


// Webhook for async publish completion (n8n calls this when done)
router.post(
  '/publish-webhook',
  asyncHandler(async (req: Request, res: Response) => {
    const { draftId, link, wordpressUrl, error, response } = req.body;

    if (!draftId) {
      return res.status(400).json({ success: false, error: 'draftId is required' });
    }

    const draft = await prisma.wordpressPublishLog.findUnique({
      where: { id: Number(draftId) }
    });

    if (!draft) {
      return res.status(404).json({ success: false, error: 'Draft not found' });
    }

    // Determine success or failure
    const finalUrl = link || wordpressUrl || (response && (response.link || response.wordpressUrl));
    const finalPostId =
      (typeof response?.id === 'number' && Number.isFinite(response.id) ? Math.trunc(response.id) : null) ||
      (typeof response?.id === 'string' && response.id.trim() && !Number.isNaN(Number(response.id.trim()))
        ? Math.trunc(Number(response.id.trim()))
        : null) ||
      null;

    // Flat-topic model: page-level linkage no longer exists. SSE downstream
    // uses topicId instead, looked up below.
    const linkedTopic = await prisma.campaignTopic.findFirst({
      where: { latestDraftId: Number(draftId) },
      select: { id: true },
    });
    const pageId: number | undefined = undefined;
    const linkedTopicId = linkedTopic?.id;
    void linkedTopicId; // surfaced via existing topicId variable when present

    if (error || !finalUrl) {
      // Handle Failure
      const currentResponse = ((draft.response as Record<string, unknown> | null) || {}) as Record<string, unknown>;
      await prisma.wordpressPublishLog.update({
        where: { id: Number(draftId) },
        data: {
          status: 'failed',
          response: {
            ...currentResponse,
            error: error || 'Async publish failed (no link returned)',
            status: 'failed',
            failedAt: new Date().toISOString()
          },
        }
      });

      // Broadcast Failure
      const { broadcastToUser } = await import('../services/sseService');
      broadcastToUser(draft.userId, {
        type: 'publish_update',
        draftId: Number(draftId),
        pageId, // Include pageId for Campaign tab sync
        status: 'failed',
        error: error || 'Async publish returned no link'
      });

      return res.json({ success: true, status: 'marked_failed' });
    }

    // Handle Success
    await prisma.$transaction([
      prisma.wordpressPublishLog.update({
        where: { id: Number(draftId) },
        data: {
          status: 'published',
          wordpressUrl: finalUrl,
          wordpressPostId: finalPostId,
          response: response || { link: finalUrl, wordpressPostId: finalPostId },
        }
      }),
      ...(draft.integrationId ? [prisma.wordpressIntegration.update({
        where: { id: draft.integrationId },
        data: { lastPublishedAt: new Date() }
      })] : [])
    ]);

    // Broadcast Success
    const { broadcastToUser } = await import('../services/sseService');
    broadcastToUser(draft.userId, {
      type: 'publish_update',
      draftId: Number(draftId),
      pageId, // Include pageId for Campaign tab sync
      status: 'published',
      publishedUrl: finalUrl,
      wordpressPostId: finalPostId,
    });

    res.json({ success: true, status: 'published' });
  })
);

export default router;
