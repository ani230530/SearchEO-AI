import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { broadcastToUser } from '../services/sseService';

const router = Router();

/**
 * POST /api/webhooks/n8n/error
 * Endpoint for n8n to report critical errors for a specific job.
 * 
 * Payload:
 * {
 *   "jobId": "job_11_1765126226932", // REQUIRED
 *   "error": "OpenAI Rate Limit Exceeded", // REQUIRED
 *   "details": "Full error stack or details...", // OPTIONAL
 *   "userId": 123 // OPTIONAL (If provided, saves a DB lookup)
 * }
 */
router.post('/error', async (req: Request, res: Response) => {
    try {
        const { jobId, error, details, userId: providedUserId } = req.body;

        if (!jobId) {
            return res.status(400).json({ success: false, error: 'jobId is required' });
        }

        if (!error) {
            return res.status(400).json({ success: false, error: 'error message is required' });
        }

        console.log(`[n8n-error] Received error report for job ${jobId}:`, error);

        // 1. Find all drafts associated with this job
        // We need to find them to get the userId (if not provided) and to update them
        const allDrafts = await prisma.wordpressPublishLog.findMany({
            where: {
                status: { in: ['generating', 'draft'] }
            }
        });

        // Filter by jobId in the JSON response
        const jobDrafts = allDrafts.filter(draft => {
            const resp = draft.response as any;
            return resp?.jobId === jobId;
        });

        if (jobDrafts.length === 0) {
            console.warn(`[n8n-error] No active drafts found for job ${jobId}`);
            // If we can't find drafts, we might verify if it's a valid job in GenerationJob table
            // But predominantly we care about drafts as they hold the user link
        }

        // Determine User ID
        let userId = providedUserId;
        if (!userId && jobDrafts.length > 0) {
            userId = jobDrafts[0].userId;
        }

        if (!userId) {
            // Fallback: try to find in GenerationJob
            const genJob = await prisma.generationJob.findUnique({ where: { jobId } });
            if (genJob) {
                userId = genJob.userId;
            }
        }

        if (!userId) {
            console.error(`[n8n-error] Could not identify user for job ${jobId}`);
            return res.status(404).json({ success: false, error: 'Job/User not found' });
        }

        const errorMessage = typeof error === 'string' ? error : JSON.stringify(error);
        const errorDetails = details ? (typeof details === 'string' ? details : JSON.stringify(details)) : null;

        // 2. Mark drafts as failed
        if (jobDrafts.length > 0) {
            await Promise.all(jobDrafts.map(draft => {
                const currentResponse = (draft.response as any) || {};
                return prisma.wordpressPublishLog.update({
                    where: { id: draft.id },
                    data: {
                        status: 'draft', // Go back to draft (or stays draft)
                        response: {
                            ...currentResponse,
                            status: 'failed',
                            error: errorMessage,
                            errorDetails: errorDetails,
                            failedAt: new Date().toISOString()
                        }
                    }
                });
            }));
        }

        // 3. Mark the GenerationJob itself as failed (flat-topic model — no per-page rows).
        const job = await prisma.generationJob.findUnique({
            where: { jobId },
            select: { topicId: true },
        });
        if (job) {
            await prisma.generationJob.update({
                where: { jobId },
                data: { status: 'failed', error: errorMessage, progress: 0 },
            });
        }

        // 4. Broadcast error to user via SSE.
        broadcastToUser(userId, {
            type: 'n8n_error',
            jobId,
            error: errorMessage,
            details: errorDetails,
            timestamp: new Date().toISOString(),
        });

        if (job?.topicId) {
            broadcastToUser(userId, {
                type: 'drafts',
                jobId,
                topicId: job.topicId,
                status: 'failed',
                error: errorMessage,
            });
        }

        console.log(`[n8n-error] Processed error for job ${jobId}, broadcast to user ${userId}`);

        return res.json({ success: true, message: 'Error recorded and user notified' });

    } catch (err: any) {
        console.error('[n8n-error] Internal handler error:', err);
        return res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
});

export default router;
