/**
 * Generation job lifecycle for the worksheet model.
 *
 * One job per topic per generation attempt. State machine:
 *
 *   pending → generating → completed
 *           ↘            ↘
 *             failed       failed
 *
 * Progress is server-driven. While n8n runs synchronously inside
 * runGenerationJob, a heartbeat timer advances `progress` honestly toward
 * 90% so the UI shows movement; the response (or error) snaps it to 100 or
 * leaves it frozen on failure.
 *
 * SSE event shape (broadcast to the owning userId):
 *   {
 *     type:     'generation:update',
 *     jobId:    string,
 *     topicId:  number,
 *     status:   'pending' | 'generating' | 'completed' | 'failed',
 *     progress: number,
 *     phase?:   string,
 *     error?:   string,
 *     draftId?: number,
 *   }
 */

import axios from 'axios';
import { randomUUID } from 'crypto';
import { Prisma, PrismaClient } from '../../generated/prisma';
import {
  buildUniversalPayload,
  isTemplateType,
  TemplateType,
  UniversalPayloadValidationError,
} from './universalGenerationService';
import { normalizePublishGenerateResponse } from './contentFlowService';
import { decryptToken } from './tokenEncryption';
import { normalizeKeyword as normalizeKw } from '../utils/payloadNormalization';
import { broadcastToUser } from './sseService';

const prisma = new PrismaClient();

const N8N_UNIVERSAL_WEBHOOK_URL =
  process.env.N8N_UNIVERSAL_WEBHOOK_URL ||
  'https://n8n.srv891599.hstgr.cloud/webhook/universal%20workflow';
const N8N_API_KEY = process.env.N8N_API_KEY || '1234';
const N8N_API_KEY_HEADER = process.env.N8N_API_KEY_HEADER || 'key';
const N8N_TIMEOUT_MS = Number(process.env.N8N_TIMEOUT_MS) || 300000;

const STALE_JOB_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes
const HEARTBEAT_INTERVAL_MS = 3000;
const HEARTBEAT_INCREMENT = 5;
const HEARTBEAT_CEILING = 90;

export type GenerationJobStatus = 'pending' | 'generating' | 'completed' | 'failed';

export interface SerializedGenerationJob {
  jobId: string;
  topicId: number;
  status: GenerationJobStatus;
  progress: number;
  phase: string | null;
  error: string | null;
  draftId: number | null;
  startedAt: string;
  updatedAt: string;
}

export interface RunGenerationInput {
  topicId: number;
  userId: number;
  templateType: TemplateType;
  /** Raw drawer payload — used to extract globals + template_fields. */
  body: Record<string, unknown>;
}

const sanitizeDomainHost = (url: string) =>
  url.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0];

const summarizeContext = (input?: string | null, maxLines = 6, maxChars = 1000) => {
  if (!input) return '';
  const lines = input.replace(/\r\n/g, '\n').split('\n').map((l) => l.trim()).filter(Boolean);
  const limited = lines.slice(0, maxLines).join('\n');
  if (limited.length <= maxChars) return limited;
  return `${limited.slice(0, maxChars)}…`;
};

const serializeJob = (job: {
  jobId: string;
  topicId: number;
  status: string;
  progress: number;
  phase: string | null;
  error: string | null;
  draftId: number | null;
  startedAt: Date;
  updatedAt: Date;
}): SerializedGenerationJob => ({
  jobId: job.jobId,
  topicId: job.topicId,
  status: job.status as GenerationJobStatus,
  progress: job.progress,
  phase: job.phase,
  error: job.error,
  draftId: job.draftId,
  startedAt: job.startedAt.toISOString(),
  updatedAt: job.updatedAt.toISOString(),
});

const broadcast = (userId: number, job: SerializedGenerationJob) => {
  try {
    broadcastToUser(userId, { type: 'generation:update', ...job });
  } catch (err) {
    console.warn('[gen] SSE broadcast failed', err);
  }
};

/** Returns the latest active job (pending/generating) or the most recent
 *  finished one, or null. Used by the structure response to hydrate rows. */
export async function getJobForTopic(
  topicId: number
): Promise<SerializedGenerationJob | null> {
  const job = await prisma.generationJob.findFirst({
    where: { topicId },
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
  });
  return job ? serializeJob(job) : null;
}

/** Mark any job in pending/generating older than STALE_JOB_THRESHOLD_MS as
 *  failed. Idempotent. Called opportunistically before creating a new job. */
async function sweepStaleJobs(topicId: number): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_JOB_THRESHOLD_MS);
  await prisma.generationJob.updateMany({
    where: {
      topicId,
      status: { in: ['pending', 'generating'] },
      updatedAt: { lt: cutoff },
    },
    data: {
      status: 'failed',
      error: 'Job timed out (no progress for 10 minutes).',
    },
  });
}

/** Returns true if there is a pending/generating (non-stale) job for this topic. */
async function hasActiveJob(topicId: number): Promise<boolean> {
  await sweepStaleJobs(topicId);
  const active = await prisma.generationJob.findFirst({
    where: {
      topicId,
      status: { in: ['pending', 'generating'] },
    },
    select: { id: true },
  });
  return !!active;
}

export class GenerationJobConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GenerationJobConflictError';
  }
}

export class GenerationJobValidationError extends Error {
  constructor(message: string, public readonly details?: Record<string, unknown>) {
    super(message);
    this.name = 'GenerationJobValidationError';
  }
}

/**
 * Creates a job row and starts the background runner. Returns immediately
 * with the job snapshot (status: 'pending'). The caller should reply 202.
 */
export async function startGenerationJob(
  input: RunGenerationInput
): Promise<SerializedGenerationJob> {
  if (!isTemplateType(input.templateType)) {
    throw new GenerationJobValidationError(
      'template_type is required and must be one of blog, faq, case_study, press_release, landing_page, report, custom'
    );
  }

  if (await hasActiveJob(input.topicId)) {
    throw new GenerationJobConflictError(
      'A generation is already in progress for this topic.'
    );
  }

  const jobId = `wsjob_${input.topicId}_${Date.now()}_${randomUUID().slice(0, 8)}`;

  const created = await prisma.generationJob.create({
    data: {
      jobId,
      topicId: input.topicId,
      userId: input.userId,
      status: 'pending',
      progress: 0,
      phase: 'queued',
    },
  });

  const snapshot = serializeJob(created);
  broadcast(input.userId, snapshot);

  // Fire-and-forget. Errors are caught inside runGenerationJob and persisted
  // to the job row.
  void runGenerationJob(jobId, input).catch((err) => {
    console.error('[gen] runGenerationJob crashed unexpectedly', { jobId, err });
  });

  return snapshot;
}

const updateJob = async (
  jobId: string,
  data: Prisma.GenerationJobUpdateInput
): Promise<SerializedGenerationJob | null> => {
  try {
    const updated = await prisma.generationJob.update({
      where: { jobId },
      data,
    });
    return serializeJob(updated);
  } catch (err) {
    console.error('[gen] updateJob failed', { jobId, err });
    return null;
  }
};

/**
 * The runner. Owns the n8n call, persistence, and SSE broadcasts.
 * Caller should not await this — startGenerationJob fires it off.
 */
async function runGenerationJob(jobId: string, input: RunGenerationInput): Promise<void> {
  const { topicId, userId, templateType, body } = input;

  // Load topic + keywords + integration up-front so the rest of the runner
  // is straight-line.
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
    await failJob(jobId, userId, 'Topic not found or not owned by the requesting user.');
    return;
  }

  const primary = topic.keywords.find((k) => (k.aiMetadata as any)?.isPrimary === true);
  if (!primary) {
    await failJob(
      jobId,
      userId,
      'Topic must have a primary keyword before generation. Pick one from the worksheet.'
    );
    return;
  }
  const longtails = topic.keywords
    .filter((k) => (k.aiMetadata as any)?.isLongtail === true)
    .map((k) => k.term);

  const integration = await prisma.wordpressIntegration.findUnique({
    where: { userId },
  });
  if (!integration) {
    await failJob(
      jobId,
      userId,
      'WordPress integration not configured. Connect WordPress to generate content.'
    );
    return;
  }

  let decryptedPassword: string;
  try {
    decryptedPassword = decryptToken(integration.password);
  } catch {
    await failJob(
      jobId,
      userId,
      'WordPress integration password cannot be decrypted. Reconfigure WordPress in settings.'
    );
    return;
  }

  // Defensive: blog template requires `topic`. Always inject the row title
  // so a buggy frontend can't break generation.
  const incomingTemplateFields = (body.template_fields as Record<string, unknown>) || {};
  const templateFields: Record<string, unknown> = { ...incomingTemplateFields };
  if (templateType === 'blog' && !templateFields.topic) {
    templateFields.topic = topic.title;
  }

  let payload: Record<string, unknown>;
  try {
    payload = buildUniversalPayload({
      templateType,
      projectName: topic.campaign.title,
      projectGoal: String(body.project_goal ?? ''),
      primaryKeyword: primary.term,
      longtailKeywords: longtails,
      brandName: sanitizeDomainHost(topic.campaign.domain.url) || 'Brand',
      brandDescription: summarizeContext(topic.campaign.domain.context),
      targetAudience: String(body.target_audience ?? ''),
      customAudienceText: body.custom_audience_text as string | undefined,
      tone: String(body.tone ?? ''),
      customToneText: body.custom_tone_text as string | undefined,
      wordCount: Number(body.word_count ?? 800),
      language: body.language as string | undefined,
      cta: body.cta as string | undefined,
      images: body.images !== undefined ? Number(body.images) : undefined,
      featuredImage:
        body.featured_image === undefined
          ? undefined
          : body.featured_image === true ||
            body.featured_image === 'yes' ||
            body.featured_image === 1,
      wordpress: {
        username: integration.username,
        password: decryptedPassword,
        url: integration.siteUrl,
      },
      templateFields,
    });
  } catch (err) {
    if (err instanceof UniversalPayloadValidationError) {
      await failJob(jobId, userId, err.message, { details: err.details });
      return;
    }
    await failJob(
      jobId,
      userId,
      err instanceof Error ? err.message : 'Payload build failed'
    );
    return;
  }

  // Move to generating + start heartbeat.
  const generating = await updateJob(jobId, {
    status: 'generating',
    progress: 10,
    phase: 'generating',
  });
  if (generating) broadcast(userId, generating);

  let lastProgress = 10;
  const heartbeat = setInterval(async () => {
    const next = Math.min(HEARTBEAT_CEILING, lastProgress + HEARTBEAT_INCREMENT);
    if (next === lastProgress) return;
    lastProgress = next;
    const updated = await updateJob(jobId, { progress: next });
    if (updated) broadcast(userId, updated);
  }, HEARTBEAT_INTERVAL_MS);

  let webhookResponse: unknown;
  try {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[gen] POST n8n', { jobId, url: N8N_UNIVERSAL_WEBHOOK_URL });
    }
    const response = await axios.post(N8N_UNIVERSAL_WEBHOOK_URL, payload, {
      headers: {
        'Content-Type': 'application/json',
        [N8N_API_KEY_HEADER]: N8N_API_KEY,
      },
      timeout: N8N_TIMEOUT_MS,
    });
    webhookResponse = response.data;
  } catch (err: any) {
    clearInterval(heartbeat);
    const detail =
      err?.response?.data?.message ||
      err?.response?.statusText ||
      err?.message ||
      'Generation service unavailable';
    await failJob(jobId, userId, `Generation service error: ${detail}`, {
      progress: lastProgress,
    });
    return;
  }

  clearInterval(heartbeat);

  // Persist + finalize.
  const content = normalizePublishGenerateResponse(webhookResponse, integration);
  if (!content.htmlContent) {
    await failJob(
      jobId,
      userId,
      'Generation service did not return HTML content',
      { progress: lastProgress }
    );
    return;
  }

  // n8n returns an array of one item; unwrap so serializeDraftContent on
  // read can index keys directly.
  const rawForStorage = Array.isArray(webhookResponse)
    ? webhookResponse[0] ?? webhookResponse
    : webhookResponse;

  try {
    const draft = await prisma.$transaction(async (tx) => {
      const created = await tx.wordpressPublishLog.create({
        data: {
          userId,
          wordpressUrl: content.wordpressUrl || integration.siteUrl,
          primaryKeyword: content.primaryKeyword || primary.term,
          normalizedPrimaryKeyword: normalizeKw(content.primaryKeyword || primary.term),
          title: content.title || topic.title,
          slug: content.slug || null,
          status: content.status || 'draft',
          response: rawForStorage as any,
          generationJobId: jobId,
          generationTopicId: topicId,
          integrationId: integration.id,
          wordpressPostId: content.wordpressPostId ?? null,
        },
      });
      await tx.campaignTopic.update({
        where: { id: topicId },
        data: { latestDraftId: created.id },
      });
      return created;
    });

    const completed = await updateJob(jobId, {
      status: 'completed',
      progress: 100,
      phase: 'completed',
      draftId: draft.id,
      error: null,
    });
    if (completed) broadcast(userId, completed);
  } catch (err) {
    console.error('[gen] persist failed', { jobId, err });
    await failJob(
      jobId,
      userId,
      err instanceof Error ? err.message : 'Failed to persist draft',
      { progress: lastProgress }
    );
  }
}

async function failJob(
  jobId: string,
  userId: number,
  reason: string,
  options?: { progress?: number; details?: Record<string, unknown> }
) {
  const failed = await updateJob(jobId, {
    status: 'failed',
    error: options?.details ? `${reason} ${JSON.stringify(options.details)}` : reason,
    ...(options?.progress !== undefined ? { progress: options.progress } : {}),
  });
  if (failed) broadcast(userId, failed);
}
