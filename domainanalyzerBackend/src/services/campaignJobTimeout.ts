import { PrismaClient } from '../../generated/prisma';
import { broadcastToUser } from './sseService';

const prisma = new PrismaClient();

// Timeout threshold: 15 minutes (aligns with stale check in active-jobs)
const TIMEOUT_MS = 15 * 60 * 1000;

/**
 * Check for generation jobs stuck in processing/pending state
 * and mark them as failed with timeout error
 */
export async function checkCampaignJobTimeouts() {
    const timeoutThreshold = new Date(Date.now() - TIMEOUT_MS);

    try {
        // Find jobs that are stuck
        // We look for jobs that are 'generating' or 'pending' and haven't been updated in 15 mins
        const stuckJobs = await prisma.generationJob.findMany({
            where: {
                status: {
                    in: ['pending', 'generating']
                },
                updatedAt: {
                    lt: timeoutThreshold
                }
            },
            include: {
                pages: true
            }
        });

        for (const job of stuckJobs) {
            console.log(`[TimeoutChecker] Found stuck job: ${job.jobId} (Last updated: ${job.updatedAt})`);

            // 1. Mark Job as failed
            await prisma.generationJob.update({
                where: { id: job.id },
                data: {
                    status: 'failed'
                }
            });

            // 2. Mark pending/generating pages as failed
            // finding pages that are not completed or failed
            const stuckPages = job.pages.filter(p => ['pending', 'generating'].includes(p.status));

            for (const page of stuckPages) {
                await prisma.generationJobPage.update({
                    where: { id: page.id },
                    data: {
                        status: 'failed',
                        error: 'Timeout: Job stuck for > 15 minutes'
                    }
                });

                // Also update the draft log if it exists
                if (page.draftId) {
                    const existingDraft = await prisma.wordpressPublishLog.findUnique({
                        where: { id: page.draftId },
                        select: { response: true }
                    });
                    const currentResponse = ((existingDraft?.response as Record<string, unknown> | null) || {}) as Record<string, unknown>;

                    await prisma.wordpressPublishLog.update({
                        where: { id: page.draftId },
                        data: {
                            status: 'draft', // Reset to draft/failed
                            response: {
                                ...currentResponse,
                                error: 'Timeout: Generation stuck for > 15 minutes',
                                status: 'failed',
                                failedAt: new Date().toISOString()
                            }
                        }
                    }).catch(e => console.error(`Failed to update draft ${page.draftId} timeout`, e));
                }
            }

            // 3. Emit SSE update to user
            broadcastToUser(job.userId, {
                type: 'generation_update',
                jobId: job.jobId,
                status: 'failed',
                error: 'Generation timed out (stuck for > 15 minutes)'
            });

            console.log(`[TimeoutChecker] Timed out job ${job.jobId} and ${stuckPages.length} pages`);
        }

        if (stuckJobs.length > 0) {
            console.log(`[TimeoutChecker] Processed ${stuckJobs.length} timed out jobs`);
        }
    } catch (error) {
        console.error('[TimeoutChecker] Error checking timeouts:', error);
    }
}

/**
 * Start the campaign timeout checker interval
 * Checks every 2 minutes for stuck jobs
 */
export function startCampaignTimeoutChecker() {
    // Check immediately on start
    checkCampaignJobTimeouts();

    // Then check every 2 minutes
    const intervalId = setInterval(checkCampaignJobTimeouts, 2 * 60 * 1000);

    console.log('Campaign generation timeout checker started (checks every 2 minutes)');

    return intervalId;
}
