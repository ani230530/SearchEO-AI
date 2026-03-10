import type { WordpressPublishLog } from '../../generated/prisma';
import {
  extractFeaturedImage,
  extractHtmlContent,
  extractMetaDescription,
  extractPrimaryKeyword,
  extractSlug,
  extractTitle,
} from '../utils/payloadNormalization';

type UnknownRecord = Record<string, unknown>;

export interface CanonicalDraftContent {
  htmlContent: string;
  title: string;
  metaDescription: string;
  slug: string;
  featuredImageEnabled: boolean;
  featuredImageUrl: string | null;
  primaryKeyword: string;
  longtailKeywords: string;
  status: string;
  wordpressUrl: string | null;
  error: string | null;
  updatedAt: string;
}

export interface CanonicalGenerationRequestPage {
  page_id: number;
  page_type: 'pillar' | 'subpage';
  primary_keyword: string;
  longtail_keywords: string[];
  options: {
    image_count: number;
    word_count: number;
    featured_image: 'yes' | 'no';
  };
}

export interface LegacyGenerationRequestPage {
  primary_keyword: string;
  longtail_keywords: string[];
  options: {
    image: number;
    image_count: number;
    word_count: number;
    featured_image: 'yes' | 'no';
  };
}

export interface CanonicalGenerationRequestPayload {
  job_id: string;
  campaign_id: number;
  topic_id: number;
  callback_url: string;
  streaming_url: string;
  brand: {
    brand_name: string;
    brand_description: string;
  };
  wordpress: {
    username: string;
    password: string;
    url: string;
  };
  pages: CanonicalGenerationRequestPage[];
}

export interface CompatibleGenerationRequestPayload extends CanonicalGenerationRequestPayload {
  user_id: string | number;
  campaign_name: string;
  pillar_page: LegacyGenerationRequestPage | null;
  sub_pillar_pages: LegacyGenerationRequestPage[];
}

export interface CanonicalStreamingEvent {
  jobId: string;
  topicId: number | null;
  pageId: number | null;
  pageType: 'pillar' | 'subpage' | null;
  status: 'pending' | 'generating' | 'completed' | 'failed' | 'published';
  phase: string | null;
  progress: number | null;
  message: string;
  sequence: number | null;
  timestamp: string;
}

export interface CanonicalGenerationResultPage {
  pageId: number | null;
  pageType: 'pillar' | 'subpage' | null;
  primaryKeyword: string;
  htmlContent: string;
  title: string;
  metaDescription: string;
  slug: string;
  featuredImageUrl: string | null;
  status: 'completed' | 'failed';
  error: string | null;
}

interface GenerationSourcePage {
  id: number;
  pageType: 'pillar' | 'subpage';
  title: string;
  keywords: Array<{ term: string; aiMetadata?: unknown }>;
}

interface BuildGenerationPayloadInput {
  requestBody: UnknownRecord;
  jobId: string;
  userId: string | number;
  campaignName: string;
  campaignId: number;
  topicId: number;
  callbackUrl: string;
  streamingUrl: string;
  brandName: string;
  brandDescription: string;
  wordpress: {
    username: string;
    password: string;
    url: string;
  };
  pages: GenerationSourcePage[];
}

const firstString = (...values: unknown[]): string => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
};

const firstNumber = (...values: unknown[]): number | null => {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.trunc(value);
    }
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value.trim());
      if (!Number.isNaN(parsed)) {
        return Math.trunc(parsed);
      }
    }
  }
  return null;
};

const firstArray = (...values: unknown[]): string[] => {
  for (const value of values) {
    if (Array.isArray(value)) {
      return value
        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter(Boolean);
    }
    if (typeof value === 'string' && value.trim()) {
      return value
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
    }
  }
  return [];
};

export const normalizeFeaturedImageEnabled = (value: unknown, fallback = true): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value > 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['yes', 'true', '1', 'enabled', 'on'].includes(normalized)) return true;
    if (['no', 'false', '0', 'disabled', 'off'].includes(normalized)) return false;
  }
  return fallback;
};

export const normalizeFeaturedImageUrl = (value: unknown): string | null => {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  return null;
};

const getPrimaryKeywordFromSourcePage = (page: GenerationSourcePage): string =>
  page.keywords.find((keyword) => (keyword.aiMetadata as { isPrimary?: boolean } | undefined)?.isPrimary)?.term ||
  page.keywords[0]?.term ||
  page.title;

const getLongtailKeywordsFromSourcePage = (page: GenerationSourcePage): string[] =>
  page.keywords
    .filter((keyword) => !(keyword.aiMetadata as { isPrimary?: boolean } | undefined)?.isPrimary)
    .map((keyword) => keyword.term)
    .filter(Boolean);

const toCanonicalPageType = (value: unknown, fallback: 'pillar' | 'subpage'): 'pillar' | 'subpage' => {
  const normalized = firstString(value).toLowerCase();
  return normalized === 'pillar' ? 'pillar' : normalized === 'subpage' ? 'subpage' : fallback;
};

export const buildCanonicalGenerationPayload = ({
  requestBody,
  jobId,
  userId,
  campaignName,
  campaignId,
  topicId,
  callbackUrl,
  streamingUrl,
  brandName,
  brandDescription,
  wordpress,
  pages,
}: BuildGenerationPayloadInput): CompatibleGenerationRequestPayload => {
  const canonicalInputPages = Array.isArray(requestBody.pages) ? (requestBody.pages as UnknownRecord[]) : [];
  const legacyPillar = typeof requestBody.pillar_page === 'object' && requestBody.pillar_page ? (requestBody.pillar_page as UnknownRecord) : null;
  const legacySubpages = Array.isArray(requestBody.sub_pillar_pages)
    ? (requestBody.sub_pillar_pages as UnknownRecord[])
    : [];

  const mappedPages = pages.map((page, index) => {
    const inputPage =
      canonicalInputPages.find((candidate) => firstNumber(candidate.page_id, candidate.pageId) === page.id) ||
      canonicalInputPages.find((candidate) => toCanonicalPageType(candidate.page_type ?? candidate.pageType, page.pageType) === page.pageType) ||
      (page.pageType === 'pillar' ? legacyPillar : legacySubpages[index - 1]) ||
      {};

    const options = typeof inputPage.options === 'object' && inputPage.options ? (inputPage.options as UnknownRecord) : {};
    const primaryKeyword =
      firstString(
        inputPage.primary_keyword,
        inputPage.primaryKeyword,
        inputPage['Primary Keyword'],
        page.title
      ) || getPrimaryKeywordFromSourcePage(page);

    const longtailKeywords = firstArray(
      inputPage.longtail_keywords,
      inputPage.longtailKeywords,
      inputPage['longtail keywords'],
      inputPage['Longtail Keywords']
    );

    const imageCount = firstNumber(options.image_count, options.imageCount, options.image, requestBody.images) ?? 0;
    const wordCount = firstNumber(options.word_count, options.wordCount, requestBody.wordCount) ?? 800;
    const featuredImage: 'yes' | 'no' = normalizeFeaturedImageEnabled(
      options.featured_image ?? options.featuredImage ?? requestBody.featuredImageEnabled ?? requestBody.featuredImage,
      true
    )
      ? 'yes'
      : 'no';

    return {
      page_id: page.id,
      page_type: page.pageType,
      primary_keyword: primaryKeyword || getPrimaryKeywordFromSourcePage(page),
      longtail_keywords: longtailKeywords.length ? longtailKeywords : getLongtailKeywordsFromSourcePage(page),
      options: {
        image_count: imageCount,
        word_count: wordCount,
        featured_image: featuredImage,
      },
      legacy_options: {
        image: imageCount,
        image_count: imageCount,
        word_count: wordCount,
        featured_image: featuredImage,
      },
    };
  });

  return {
    user_id: userId,
    campaign_name: campaignName,
    job_id: jobId,
    campaign_id: campaignId,
    topic_id: topicId,
    callback_url: callbackUrl,
    streaming_url: streamingUrl,
    brand: {
      brand_name: brandName,
      brand_description: brandDescription,
    },
    wordpress,
    pages: mappedPages.map(({ legacy_options: _legacyOptions, ...page }) => page),
    pillar_page: mappedPages[0]
      ? {
          primary_keyword: mappedPages[0].primary_keyword,
          longtail_keywords: mappedPages[0].longtail_keywords,
          options: mappedPages[0].legacy_options,
        }
      : null,
    sub_pillar_pages: mappedPages.slice(1).map((page) => ({
      primary_keyword: page.primary_keyword,
      longtail_keywords: page.longtail_keywords,
      options: page.legacy_options,
    })),
  };
};

export const normalizeGenerationStreamingPayload = (
  payload: UnknownRecord,
  topicId: number | null = null
): CanonicalStreamingEvent | null => {
  const jobId = firstString(payload.job_id, payload.jobId, payload['Job Id']);
  const message = firstString(payload.message, payload.progress_message, payload.progressMessage, payload.phase_message);

  if (!jobId || !message) {
    return null;
  }

  const status = firstString(payload.status, payload.phase_status).toLowerCase();
  const normalizedStatus =
    status === 'completed' || status === 'failed' || status === 'published' || status === 'pending'
      ? (status as CanonicalStreamingEvent['status'])
      : 'generating';

  return {
    jobId,
    topicId,
    pageId: firstNumber(payload.page_id, payload.pageId, payload['Page Id']),
    pageType: (() => {
      const pageType = firstString(payload.page_type, payload.pageType).toLowerCase();
      return pageType === 'pillar' || pageType === 'subpage' ? pageType : null;
    })(),
    status: normalizedStatus,
    phase: firstString(payload.phase, payload.stage) || null,
    progress: firstNumber(payload.progress, payload.percent_complete, payload.percentComplete),
    message,
    sequence: firstNumber(payload.sequence, payload.seq),
    timestamp: firstString(payload.timestamp) || new Date().toISOString(),
  };
};

export const normalizeGenerationCallbackPayload = (body: unknown): { jobId: string | null; pages: CanonicalGenerationResultPage[] } => {
  const payload = body as UnknownRecord;
  const rawPages = Array.isArray(body)
    ? (body as UnknownRecord[])
    : Array.isArray(payload?.pages)
    ? (payload.pages as UnknownRecord[])
    : payload
    ? [payload]
    : [];

  const jobId =
    firstString(
      payload?.job_id,
      payload?.jobId,
      payload?.['Job Id'],
      rawPages[0]?.job_id,
      rawPages[0]?.jobId,
      rawPages[0]?.['Job Id']
    ) || null;

  return {
    jobId,
    pages: rawPages.map((page) => {
      const status = firstString(page.status).toLowerCase();
      return {
        pageId: firstNumber(page.page_id, page.pageId, page['Page Id']),
        pageType: (() => {
          const value = firstString(page.page_type, page.pageType).toLowerCase();
          return value === 'pillar' || value === 'subpage' ? value : null;
        })(),
        primaryKeyword: extractPrimaryKeyword(page),
        htmlContent: extractHtmlContent(page),
        title: extractTitle(page),
        metaDescription: extractMetaDescription(page),
        slug: extractSlug(page),
        featuredImageUrl: normalizeFeaturedImageUrl(
          page.featured_image_url ?? page.featuredImageUrl ?? extractFeaturedImage(page)
        ),
        status: status === 'failed' ? 'failed' : 'completed',
        error: firstString(page.error, page.message) || null,
      };
    }),
  };
};

export const serializeDraftContent = (draft: WordpressPublishLog): CanonicalDraftContent => {
  const response = ((draft.response as UnknownRecord | null) || {}) as UnknownRecord;
  const featuredImageUrl =
    normalizeFeaturedImageUrl(
      response.featuredImageUrl ??
        response.featured_image_url ??
        response.featuredImage ??
        response['Featured Image']
    ) || null;
  const featuredImageEnabled = normalizeFeaturedImageEnabled(
    response.featuredImageEnabled ?? response.featured_image_enabled ?? response['Featured Image Enabled'],
    Boolean(featuredImageUrl)
  );

  return {
    htmlContent: firstString(response.htmlContent, response['Html Content']),
    title: firstString(response.title, response.Title, draft.title),
    metaDescription: firstString(response.metaDescription, response['Meta Description']),
    slug: firstString(response.slug, response.Slug, draft.slug),
    featuredImageEnabled,
    featuredImageUrl,
    primaryKeyword: firstString(draft.primaryKeyword, response.primaryKeyword, response['Primary Keyword']),
    longtailKeywords: firstString(response.longtailKeywords, response['longtail keywords']),
    status: firstString(draft.status, response.status) || 'draft',
    wordpressUrl: firstString(draft.wordpressUrl, response.wordpressUrl, response['wordpress url']) || null,
    error: firstString(response.error) || null,
    updatedAt: draft.updatedAt.toISOString(),
  };
};

export const normalizePublishGenerateResponse = (
  response: unknown,
  integration: { siteUrl: string }
): CanonicalDraftContent => {
  const entry = Array.isArray(response) ? ((response[0] || {}) as UnknownRecord) : ((response || {}) as UnknownRecord);
  const featuredImageUrl = normalizeFeaturedImageUrl(
    entry.featuredImageUrl ?? entry.featured_image_url ?? entry['Featured Image'] ?? entry.featuredImage ?? entry.image
  );

  return {
    primaryKeyword: firstString(entry['Primary Keyword'], entry.primaryKeyword),
    htmlContent: firstString(entry['Html Content'], entry.htmlContent, entry.content),
    featuredImageEnabled: normalizeFeaturedImageEnabled(
      entry.featuredImageEnabled ?? entry.featured_image_enabled,
      Boolean(featuredImageUrl)
    ),
    featuredImageUrl,
    title: firstString(entry.Title, entry.title) || 'Generated Article',
    metaDescription: firstString(entry['Meta Description'], entry.metaDescription),
    slug: firstString(entry.slug, entry.Slug),
    wordpressUrl:
      firstString(entry['wordpress url '], entry['wordpress url'], entry.wordpressUrl, integration.siteUrl) ||
      integration.siteUrl,
    longtailKeywords: firstString(entry['longtail keywords'], entry.longtailKeywords),
    status: firstString(entry.status) || 'draft',
    error: firstString(entry.error) || null,
    updatedAt: new Date().toISOString(),
  };
};
