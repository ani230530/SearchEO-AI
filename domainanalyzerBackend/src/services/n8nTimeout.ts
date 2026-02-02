import { PrismaClient } from '../../generated/prisma';
import { broadcastToUser } from './sseService';

const prisma = new PrismaClient();

// Timeout threshold: 10 minutes
const TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Check for n8n requests stuck in processing/pending state
 * and mark them as failed with timeout error
 */
export async function checkTimeoutRequests() {
    const timeoutThreshold = new Date(Date.now() - TIMEOUT_MS);

    try {
        // Find requests that are stuck
        const stuckRequests = await prisma.n8nRequest.findMany({
            where: {
                status: {
                    in: ['pending', 'processing']
                },
                createdAt: {
                    lt: timeoutThreshold
                }
            },
            include: {
                auditResult: {
                    include: {
                        domain: {
                            select: {
                                userId: true
                            }
                        }
                    }
                }
            }
        });

        for (const request of stuckRequests) {
            // Update to failed status
            await prisma.n8nRequest.update({
                where: { id: request.id },
                data: {
                    status: 'failed',
                    responseData: {
                        error: 'Request timed out - no response from n8n after 10 minutes',
                        timedOutAt: new Date().toISOString()
                    } as any
                }
            });

            // Emit timeout event via SSE
            const userId = request.auditResult.domain.userId;
            if (userId) {
                broadcastToUser(userId, {
                    type: 'n8n_update',
                    data: {
                        requestId: request.requestId,
                        status: 'failed',
                        error: 'Request timed out - no response from n8n after 10 minutes'
                    }
                });
            }

            console.log(`Timed out n8n request: ${request.requestId}`);
        }

        if (stuckRequests.length > 0) {
            console.log(`Processed ${stuckRequests.length} timeout requests`);
        }
    } catch (error) {
        console.error('Error checking timeout requests:', error);
    }
}

/**
 * Start the timeout checker interval
 * Checks every 2 minutes for stuck requests
 */
export function startTimeoutChecker() {
    // Check immediately on start
    checkTimeoutRequests();

    // Then check every 2 minutes
    const intervalId = setInterval(checkTimeoutRequests, 2 * 60 * 1000);

    console.log('N8n timeout checker started (checks every 2 minutes)');

    return intervalId;
}
