import { PrismaClient } from '../../generated/prisma';
import { broadcastToUser } from './sseService';

const prisma = new PrismaClient();

// Timeout threshold: 15 minutes
const TIMEOUT_MS = 15 * 60 * 1000;

/**
 * Check for publish jobs stuck in generating state
 * and mark them as failed with timeout error
 */
export async function checkPublishJobTimeouts() {
    const timeoutThreshold = new Date(Date.now() - TIMEOUT_MS);

    try {
        // Find jobs that are stuck in 'generating'
        const stuckJobs = await prisma.wordpressPublishLog.findMany({
            where: {
                status: 'generating',
                updatedAt: {
                    lt: timeoutThreshold
                }
            }
        });

        for (const job of stuckJobs) {
            console.log(`[PublishTimeout] Found stuck job: ${job.id} (Last updated: ${job.updatedAt})`);

            const errorMsg = 'Timeout: Publish stuck for > 15 minutes';
            const currentResponse = (job.response as any) || {};

            // 1. Mark Job as failed
            await prisma.wordpressPublishLog.update({
                where: { id: job.id },
                data: {
                    status: 'failed', // Explicitly use failed status
                    response: {
                        ...currentResponse,
                        error: errorMsg
                    }
                }
            });

            // 2. Emit SSE update to user
            broadcastToUser(job.userId, {
                type: 'publish_update',
                draftId: job.id,
                status: 'failed',
                error: errorMsg
            });

            console.log(`[PublishTimeout] Timed out job ${job.id}`);
        }

        if (stuckJobs.length > 0) {
            console.log(`[PublishTimeout] Processed ${stuckJobs.length} timed out jobs`);
        }
    } catch (error) {
        console.error('[PublishTimeout] Error checking timeouts:', error);
    }
}

/**
 * Start the publish timeout checker interval
 * Checks every 2 minutes for stuck jobs
 */
export function startPublishTimeoutChecker() {
    // Check immediately on start
    checkPublishJobTimeouts();

    // Then check every 2 minutes
    const intervalId = setInterval(checkPublishJobTimeouts, 2 * 60 * 1000);

    console.log('Publish timeout checker started (checks every 2 minutes)');

    return intervalId;
}
