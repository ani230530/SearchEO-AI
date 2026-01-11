import { Router, Request, Response } from 'express';
import axios from 'axios';
import { PrismaClient } from '../../generated/prisma';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { encryptToken, decryptToken } from '../services/tokenEncryption';

const router = Router();
const prisma = new PrismaClient();

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
const N8N_API_KEY = process.env.N8N_API_KEY || '1234';
const N8N_API_KEY_HEADER = process.env.N8N_API_KEY_HEADER || 'key';
const N8N_TIMEOUT_MS = Number(process.env.N8N_TIMEOUT_MS) || 300000;

interface NormalizedContent {
  primaryKeyword: string;
  htmlContent: string;
  featuredImage?: string;
  title?: string;
  metaDescription?: string;
  slug?: string;
  wordpressUrl: string;
  longtailKeywords?: string;
}

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

const normalizeGenerateResponse = (
  response: any,
  integration: { siteUrl: string; username: string }
): NormalizedContent => {
  const entry = Array.isArray(response) ? response[0] : response;

  const htmlContent =
    entry?.['Html Content'] ?? entry?.htmlContent ?? entry?.content ?? '';
  const featuredImage =
    entry?.['Featured Image'] ?? entry?.featuredImage ?? entry?.image ?? '';
  const title = entry?.Title ?? entry?.title ?? 'Generated Article';
  const metaDescription =
    entry?.['Meta Description'] ?? entry?.metaDescription ?? '';
  const slug = entry?.slug ?? entry?.Slug ?? '';
  const primaryKeyword =
    entry?.['Primary Keyword'] ?? entry?.primaryKeyword ?? '';
  const longtailKeywords =
    entry?.['longtail keywords'] ?? entry?.longtailKeywords ?? '';

  return {
    primaryKeyword,
    htmlContent,
    featuredImage,
    title,
    metaDescription,
    slug,
    wordpressUrl:
      entry?.['wordpress url '] ??
      entry?.['wordpress url'] ??
      integration.siteUrl,
    longtailKeywords,
  };
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

const getCompanyDomainForUser = async (userId: number) => {
  return prisma.domain.findFirst({
    where: {
      userId,
      isCompanyDomain: true,
    },
    select: {
      url: true,
      context: true,
    },
  });
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

    const sanitizedUrl = siteUrl.trim();
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
  '/generate',
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user.userId;
    const {
      primaryKeyword,
      longtailKeywords = '',
      brandName = '',
      brandDescription = '',
      images = 1,
      wordCount = 800,
      featuredImage = true,
    } = req.body;

    if (!primaryKeyword) {
      return res.status(400).json({
        success: false,
        error: 'Primary keyword is required',
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

    const companyDomain = await getCompanyDomainForUser(userId);
    const sanitizedDomainName =
      companyDomain?.url
        ?.replace(/^https?:\/\//i, '')
        ?.replace(/^www\./i, '')
        ?.split('/')[0] || null;
    const defaultBrandName = sanitizedDomainName || 'Brand';
    const defaultBrandDescription = summarizeContext(companyDomain?.context);

    const normalizedBrandName =
      (typeof brandName === 'string' && brandName.trim()) || defaultBrandName;
    const normalizedBrandDescription =
      (typeof brandDescription === 'string' && brandDescription.trim()) ||
      defaultBrandDescription;

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

    const payload = {
      'Primary Keyword': primaryKeyword,
      'longtail keywords':
        Array.isArray(longtailKeywords) && longtailKeywords.length
          ? longtailKeywords.join(', ')
          : longtailKeywords || '',
      'Brand Name': normalizedBrandName,
      'Brand description': normalizedBrandDescription,
      Image: Number(images) || 0,
      'Word Count': Number(wordCount) || 800,
      'Featured Image': featuredImage ? 'yes' : 'no',
      Username: integration.username,
      Password: decryptedPassword,
      'wordpress url': integration.siteUrl,
    };

    try {
      const response = await callWebhook(REVIEW_WEBHOOK_URL, payload);
      const normalized = normalizeGenerateResponse(response, integration);

      res.json({
        success: true,
        content: normalized,
        raw: response,
      });
    } catch (error: any) {
      console.error('Error generating content:', error?.response?.data || error);
      res.status(500).json({
        success: false,
        error: 'Failed to generate content from automation service',
        details: error?.response?.data,
      });
    }
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
      console.error('Error editing image:', error?.response?.data || error);
      res.status(500).json({
        success: false,
        error: 'Failed to edit image with automation service',
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
      primaryKeyword,
      htmlContent,
      featuredImage,
      title,
      metaDescription,
      slug,
    } = req.body;

    if (!primaryKeyword || !htmlContent) {
      return res.status(400).json({
        success: false,
        error: 'Primary keyword and HTML content are required',
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

    // If draftId is provided, check if draft exists and can be published
    let existingDraft = null;
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
    }

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

    const payload = [
      {
        Username: integration.username,
        Password: decryptedPassword,
        'wordpress url': integration.siteUrl,
        'Primary Keyword': primaryKeyword,
        'Html Content': htmlContent,
        'Featured Image': featuredImage,
        Title: title,
        'Meta Description': metaDescription,
        slug,
      },
    ];

    try {
      const response = await callWebhook(PUBLISH_WEBHOOK_URL, payload);

      // Check if response is empty or invalid
      const isResponseEmpty =
        !response ||
        response === '' ||
        (Array.isArray(response) && response.length === 0) ||
        (typeof response === 'object' && Object.keys(response).length === 0);

      if (isResponseEmpty) {
        // Empty response means publishing failed
        const updateData = {
          status: 'draft', // Keep as draft so View button still works, but don't mark as published
          wordpressUrl: existingDraft?.wordpressUrl || 'draft://pending',
          primaryKeyword,
          title,
          slug,
          response: { error: 'Empty response from publishing service', originalResponse: response },
          integrationId: integration.id,
        };

        if (existingDraft) {
          await prisma.$transaction([
            prisma.wordpressPublishLog.update({
              where: { id: existingDraft.id },
              data: updateData,
            }),
          ]);

          return res.status(500).json({
            success: false,
            error: 'Publishing failed: Empty response from publishing service',
            draftId: existingDraft.id,
            publishedUrl: null,
            status: 'draft',
          });
        } else {
          return res.status(500).json({
            success: false,
            error: 'Publishing failed: Empty response from publishing service',
          });
        }
      }

      const entry = Array.isArray(response) ? response[0] : response;

      // Extract the published post URL - prioritize Link (actual post URL) over base WordPress URL
      // Ensure we always get a string value, not a function or other type
      const getStringValue = (val: any): string | undefined => {
        if (typeof val === 'string' && val.trim()) return val.trim();
        return undefined;
      };

      const publishedUrl =
        getStringValue(entry?.Link) ??
        getStringValue(entry?.link) ??
        getStringValue(entry?.['wordpress url']) ??
        getStringValue(entry?.wordpressUrl) ??
        undefined;

      // Determine status: published if we have a URL that's different from base siteUrl, otherwise keep as draft (failed)
      const baseSiteUrl = typeof integration.siteUrl === 'string' ? integration.siteUrl.trim() : '';
      const hasValidUrl = publishedUrl && publishedUrl !== baseSiteUrl && !publishedUrl.startsWith('draft://');

      // Only mark as published if we have a valid URL, otherwise treat as failed and keep as draft
      // This ensures we only mark as published when publishing is truly successful
      // Only mark as published if we have a valid URL - otherwise treat as failed
      if (!hasValidUrl) {
        // Publishing failed - no valid URL returned
        const updateData = {
          status: existingDraft?.status || 'draft', // Keep existing status (draft/completed) so View button still works
          wordpressUrl: existingDraft?.wordpressUrl || 'draft://pending',
          primaryKeyword,
          title,
          slug: entry?.slug ?? slug,
          response,
          integrationId: integration.id,
        };

        if (existingDraft) {
          await prisma.wordpressPublishLog.update({
            where: { id: existingDraft.id },
            data: updateData,
          });

          return res.status(500).json({
            success: false,
            error: 'Publishing failed: No valid published URL returned from publishing service',
            draftId: existingDraft.id,
            publishedUrl: null,
            status: updateData.status,
          });
        } else {
          return res.status(500).json({
            success: false,
            error: 'Publishing failed: No valid published URL returned from publishing service',
          });
        }
      }

      // Publishing successful - we have a valid URL
      const finalStatus = 'published';
      const finalUrl = publishedUrl!;

      const updateData = {
        wordpressUrl: finalUrl,
        primaryKeyword,
        title,
        slug: entry?.slug ?? slug,
        status: finalStatus,
        response,
        integrationId: integration.id,
      };

      if (existingDraft) {
        // Update existing draft to published status
        await prisma.$transaction([
          prisma.wordpressPublishLog.update({
            where: { id: existingDraft.id },
            data: updateData,
          }),
          prisma.wordpressIntegration.update({
            where: { userId },
            data: {
              lastPublishedAt: new Date(),
            },
          }),
        ]);

        res.json({
          success: true,
          result: response,
          draftId: existingDraft.id,
          publishedUrl: finalUrl,
          status: finalStatus,
        });
      } else {
        // Create new entry (for backward compatibility)
        const newEntry = await prisma.$transaction([
          prisma.wordpressPublishLog.create({
            data: {
              userId,
              ...updateData,
            },
          }),
          prisma.wordpressIntegration.update({
            where: { userId },
            data: {
              lastPublishedAt: new Date(),
            },
          }),
        ]);

        res.json({
          success: true,
          result: response,
          draftId: newEntry[0].id,
          publishedUrl: finalUrl,
          status: finalStatus,
        });
      }
    } catch (error: any) {
      console.error('Error publishing content:', error?.response?.data || error);

      // If we have a draftId, keep it as draft (not failed) so View button still works
      if (existingDraft) {
        try {
          await prisma.wordpressPublishLog.update({
            where: { id: existingDraft.id },
            data: {
              status: 'draft', // Keep as draft so user can still view and retry
            },
          });
        } catch (updateError) {
          console.error('Error updating draft status:', updateError);
        }
      }

      res.status(500).json({
        success: false,
        error: 'Failed to publish content to WordPress',
        details: error?.response?.data,
      });
    }
  })
);

router.post(
  '/generating',
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user.userId;
    const { primaryKeyword, title, wordCount, images } = req.body;

    if (!primaryKeyword) {
      return res.status(400).json({
        success: false,
        error: 'Primary keyword is required',
      });
    }

    const integration = await prisma.wordpressIntegration.findUnique({
      where: { userId },
    });

    const draftTitle = title || `${primaryKeyword} - Generating...`;
    const resolvedWordpressUrl = integration?.siteUrl || 'draft://generating';

    const responsePayload = {
      primaryKeyword,
      title: draftTitle,
      wordCount,
      images,
      status: 'generating',
      generatingAt: new Date().toISOString(),
    };

    try {
      const draft = await prisma.wordpressPublishLog.create({
        data: {
          userId,
          primaryKeyword,
          title: draftTitle,
          wordpressUrl: resolvedWordpressUrl,
          status: 'generating',
          response: responsePayload,
          integrationId: integration?.id,
        },
      });

      res.json({
        success: true,
        draftId: draft.id,
        draft,
      });
    } catch (error: any) {
      console.error('Error creating generating draft:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create generating draft',
      });
    }
  })
);

router.put(
  '/generating/:id',
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user.userId;
    const draftId = Number(req.params.id);
    const { htmlContent, title, metaDescription, slug, featuredImage, longtailKeywords, wordpressUrl } = req.body;

    if (!htmlContent) {
      return res.status(400).json({
        success: false,
        error: 'HTML content is required',
      });
    }

    const existing = await prisma.wordpressPublishLog.findFirst({
      where: { id: draftId, userId, status: 'generating' },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'Generating draft not found',
      });
    }

    const responsePayload = {
      primaryKeyword: existing.primaryKeyword,
      htmlContent,
      featuredImage,
      title: title || existing.title,
      metaDescription,
      slug,
      longtailKeywords,
      wordpressUrl: wordpressUrl || existing.wordpressUrl,
      savedAt: new Date().toISOString(),
    };

    const updated = await prisma.wordpressPublishLog.update({
      where: { id: draftId },
      data: {
        title: title || existing.title,
        slug,
        status: 'draft',
        response: responsePayload,
        wordpressUrl: wordpressUrl || existing.wordpressUrl,
      },
    });

    res.json({
      success: true,
      draft: updated,
    });
  })
);

router.delete(
  '/generating/:id',
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user.userId;
    const draftId = Number(req.params.id);

    const existing = await prisma.wordpressPublishLog.findFirst({
      where: { id: draftId, userId, status: 'generating' },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'Generating draft not found',
      });
    }

    await prisma.wordpressPublishLog.delete({
      where: { id: draftId },
    });

    res.json({
      success: true,
      message: 'Generating draft removed',
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
      featuredImage,
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
      featuredImage,
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

    const response = draft.response as any;

    res.json({
      success: true,
      draft: {
        htmlContent: response.htmlContent || response['Html Content'] || '',
        title: response.title || response.Title || draft.title,
        metaDescription: response.metaDescription || response['Meta Description'] || '',
        slug: response.slug || response.Slug || draft.slug,
        featuredImage: response.featuredImage || response['Featured Image'] || '',
        primaryKeyword: draft.primaryKeyword || '',
        longtailKeywords: response.longtailKeywords || response['longtail keywords'] || '',
        wordpressUrl: draft.wordpressUrl
      }
    });
  })
);

router.get(
  '/history',
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user.userId;

    const logs = await prisma.wordpressPublishLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        wordpressUrl: true,
        primaryKeyword: true,
        title: true,
        slug: true,
        status: true,
        createdAt: true,
        response: true,
      },
    });

    res.json({
      success: true,
      logs,
    });
  })
);

export default router;

