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

            // Perform the actual n8n call
            const response = await axios.post(url, payload, {
                headers,
                timeout: timeout || 300000, // Default 5 mins
            });

            console.log(`[Queue] Job ${job.id} completed. Status: ${response.status}`);

            // Handle Job Specific logic
            if (job.name === JOB_TYPES.PUBLISH) {
                await handlePublishCompletion(job, response.data, meta);
            }

            return response.data;
        } catch (error: any) {
            console.error(`[Queue] Job ${job.id} failed:`, error.message);

            if (job.name === JOB_TYPES.PUBLISH) {
                await handlePublishFailure(job, error, job.data.meta);
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

    const publishedUrl =
        getStringValue(entry?.Link) ??
        getStringValue(entry?.link) ??
        getStringValue(entry?.['wordpress url']) ??
        getStringValue(entry?.wordpressUrl) ??
        undefined;

    // Get base site URL to compare
    let baseSiteUrl = '';
    if (integrationId) {
        const integration = await prisma.wordpressIntegration.findUnique({ where: { id: integrationId } });
        baseSiteUrl = integration?.siteUrl ? integration.siteUrl.trim() : '';
    }

    const hasValidUrl = publishedUrl && publishedUrl !== baseSiteUrl && !publishedUrl.startsWith('draft://');

    if (!hasValidUrl) {
        // Treated as failure if no URL
        await handlePublishFailure(job, new Error('No valid published URL returned'), meta);
        return;
    }

    // Success
    const finalStatus = 'published';
    const finalUrl = publishedUrl!;

    await prisma.$transaction([
        prisma.wordpressPublishLog.update({
            where: { id: draftId },
            data: {
                wordpressUrl: finalUrl,
                status: finalStatus,
                response: responseData,
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
                status: 'draft',
                response: { error: error.message || 'Publish job failed' }
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
