import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import axios from 'axios';
import { PrismaClient } from '../../generated/prisma';

const prisma = new PrismaClient();

// Redis Connection
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const connection = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null,
});

// Queue Name
const N8N_QUEUE_NAME = 'n8n-queue';

// Job Types
export const JOB_TYPES = {
    PUBLISH: 'publish',
    CAMPAIGN_GENERATION: 'campaign-generation',
};

// Queue Instance
export const n8nQueue = new Queue(N8N_QUEUE_NAME, { connection: connection as any });

// Worker Instance
const worker = new Worker(
    N8N_QUEUE_NAME,
    async (job: Job) => {
        console.log(`[Queue] Processing job ${job.id} of type ${job.name}`);

        try {
            const { url, payload, headers, timeout, meta } = job.data;

            if (!url) {
                throw new Error('Missing webhook URL');
            }

            console.log(`[Queue] Sending webhook to ${url}`);

            // Mask secrets for logging
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

            console.log('[Queue] Payload:', JSON.stringify(maskSecrets(payload), null, 2));

            if (job.name === JOB_TYPES.CAMPAIGN_GENERATION) {
                try {
                    const kickoffResponse = await axios.post(url, payload, {
                        headers,
                        timeout: Math.min(timeout || 30000, 30000),
                    });

                    console.log(`[Queue] Campaign kickoff ${job.id} accepted. Status: ${kickoffResponse.status}`);
                    return {
                        accepted: true,
                        status: kickoffResponse.status,
                    };
                } catch (error: any) {
                    const isTimeout = axios.isAxiosError(error) && (error.code === 'ECONNABORTED' || error.message?.includes('timeout'));
                    if (isTimeout) {
                        console.warn(`[Queue] Campaign kickoff ${job.id} timed out waiting for HTTP response; keeping job active because completion is callback-driven.`);
                        return {
                            accepted: true,
                            status: 'timeout_waiting_for_ack',
                        };
                    }
                    throw error;
                }
            }

            // Perform the actual n8n call
            const response = await axios.post(url, payload, {
                headers,
                timeout: timeout || 300000, // Default 5 mins
            });

            console.log(`[Queue] Job ${job.id} completed. Status: ${response.status}`);
            console.log('[Queue] Response Data:', JSON.stringify(response.data, null, 2));

            // Handle Job Specific logic
            if (job.name === JOB_TYPES.PUBLISH) {
                await handlePublishCompletion(job, response.data, meta);
            }

            return response.data;
        } catch (error: any) {
            console.error(`[Queue] Job ${job.id} failed:`, error.message);

            if (job.name === JOB_TYPES.PUBLISH) {
                await handlePublishFailure(job, error, job.data.meta);
            } else if (job.name === JOB_TYPES.CAMPAIGN_GENERATION) {
                await handleCampaignGenerationFailure(job, error, job.data.meta);
            }

            if (error.response) {
                throw new Error(`N8n responded with ${error.response.status}: ${JSON.stringify(error.response.data)}`);
            }
            throw error;
        }
    },
    {
        connection: connection as any,
        concurrency: 5, // Process up to 5 jobs in parallel
        limiter: {
            max: 10,
            duration: 1000 // Rate limit: max 10 jobs per second
        }
    }
);

// Helper for Publish Success
async function handlePublishCompletion(job: Job, responseData: any, meta: any) {
    if (!meta) return;
    const { draftId, userId, integrationId, primaryKeyword, slug } = meta;

    // Logic extracted from publish.ts
    const entry = Array.isArray(responseData) ? responseData[0] : responseData;
    const getStringValue = (val: any): string | undefined => {
        if (typeof val === 'string' && val.trim()) return val.trim();
        return undefined;
    };
    const getNumberValue = (val: any): number | undefined => {
        if (typeof val === 'number' && Number.isFinite(val)) return Math.trunc(val);
        if (typeof val === 'string' && val.trim()) {
            const parsed = Number(val.trim());
            if (!Number.isNaN(parsed)) return Math.trunc(parsed);
        }
        return undefined;
    };

    const publishedUrl =
        getStringValue(entry?.Link) ??
        getStringValue(entry?.link) ??
        getStringValue(entry?.['wordpress url']) ??
        getStringValue(entry?.wordpressUrl) ??
        undefined;
    const wordpressPostId =
        getNumberValue(entry?.id) ??
        getNumberValue(entry?.postId) ??
        getNumberValue(entry?.wordpressPostId) ??
        getNumberValue(entry?.['WordPress Post ID']) ??
        undefined;

    // Get base site URL to compare
    let baseSiteUrl = '';
    if (integrationId) {
        const integration = await prisma.wordpressIntegration.findUnique({ where: { id: integrationId } });
        baseSiteUrl = integration?.siteUrl ? integration.siteUrl.trim() : '';
    }

    const hasValidUrl = publishedUrl && publishedUrl !== baseSiteUrl && !publishedUrl.startsWith('draft://');

    console.log('[Queue:Debug] Publish Logic Check:', {
        publishedUrl,
        baseSiteUrl,
        hasValidUrl,
        integrationId
    });

    if (!hasValidUrl) {
        // Treated as failure if no URL
        await handlePublishFailure(job, new Error('No valid published URL returned'), meta);
        return;
    }

    // Valid URL found
    const finalStatus = 'published';
    const finalUrl = publishedUrl!;

    // Fetch existing log to preserve htmlContent in response
    const existingLog = await prisma.wordpressPublishLog.findUnique({
        where: { id: draftId },
        select: { response: true }
    });

    const currentResponse = (existingLog?.response as any) || {};
    const mergedResponse = {
        ...currentResponse,
        ...entry,
        // Ensure we don't lose the content if n8n doesn't return it
        htmlContent: currentResponse.htmlContent || entry.htmlContent,
        title: currentResponse.title || entry.title,
        featuredImageEnabled: currentResponse.featuredImageEnabled ?? false,
        featuredImageUrl: currentResponse.featuredImageUrl || currentResponse.featuredImage || null,
        wordpressPostId: wordpressPostId ?? currentResponse.wordpressPostId ?? currentResponse.id ?? null,
        status: finalStatus
    };

    await prisma.$transaction([
        prisma.wordpressPublishLog.update({
            where: { id: draftId },
            data: {
                wordpressUrl: finalUrl,
                wordpressPostId: wordpressPostId ?? null,
                status: finalStatus,
                response: mergedResponse,
                slug: entry?.slug ?? slug,
            }
        }),
        ...(integrationId ? [prisma.wordpressIntegration.update({
            where: { id: integrationId },
            data: { lastPublishedAt: new Date() }
        })] : [])
    ]);

    // Broadcast Success
    const { broadcastToUser } = await import('./sseService');
    broadcastToUser(userId, {
        type: 'publish_update',
        draftId,
        pageId: meta.pageId, // Include pageId for global sync
        status: finalStatus,
        publishedUrl: finalUrl
    });
}

// Helper for Publish Failure
async function handlePublishFailure(job: Job, error: any, meta: any) {
    if (!meta) return;
    const { draftId, userId } = meta;

    // Update DB to draft (failed state)
    try {
        await prisma.wordpressPublishLog.update({
            where: { id: draftId },
            data: {
                status: 'failed',
                response: {
                    error: error.message || 'Publish job failed',
                    status: 'failed',
                    failedAt: new Date().toISOString()
                }
            }
        });
    } catch (dbError) {
        console.error('Failed to update draft status on failure', dbError);
    }

    // Broadcast Failure
    const { broadcastToUser } = await import('./sseService');
    broadcastToUser(userId, {
        type: 'publish_update',
        draftId,
        pageId: meta.pageId, // Include pageId for global sync
        status: 'failed',
        error: error.message
    });
}

worker.on('completed', async (job: Job) => {
    console.log(`[Queue] Job ${job.id} finished successfully`);
});

worker.on('failed', async (job: Job | undefined, err: Error) => {
    console.error(`[Queue] Job ${job?.id} failed permanently: ${err.message}`);
});

export const addN8nJob = async (type: string, data: any) => {
    return n8nQueue.add(type, data, {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 1000,
        },
        removeOnComplete: true, // Keep Redis clean
        removeOnFail: false, // Keep failed jobs for inspection
    });
};

// Helper for Campaign Generation Failure
async function handleCampaignGenerationFailure(job: Job, error: any, meta: any) {
    if (!meta) return;
    const { jobId, topicId, userId } = meta;

    try {
        // 1. Mark Job as failed
        const generationJob = await prisma.generationJob.findUnique({
            where: { jobId },
            include: { pages: true }
        });

        if (generationJob) {
            await prisma.generationJob.update({
                where: { id: generationJob.id },
                data: { status: 'failed' }
            });

            // 2. Mark pending/generating pages as failed
            const stuckPages = generationJob.pages.filter(p => ['pending', 'generating'].includes(p.status));

            for (const page of stuckPages) {
                await prisma.generationJobPage.update({
                    where: { id: page.id },
                    data: {
                        status: 'failed',
                        error: error.message || 'Generation queue job failed'
                    }
                });

                // Update draft if exists
                if (page.draftId) {
                    await prisma.wordpressPublishLog.update({
                        where: { id: page.draftId },
                        data: {
                            status: 'draft',
                            response: { error: error.message || 'Generation queue job failed' }
                        }
                    }).catch(e => console.error(`Failed to update draft ${page.draftId} failure`, e));
                }
            }
        }
    } catch (dbError) {
        console.error('Failed to update campaign job status on failure', dbError);
    }

    // 3. Broadcast Failure
    const { broadcastToUser } = await import('./sseService');
    broadcastToUser(userId, {
        type: 'generation_update',
        jobId,
        status: 'failed',
        error: error.message
    });
}
