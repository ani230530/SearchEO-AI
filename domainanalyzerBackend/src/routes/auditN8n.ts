import express, { Request, Response } from 'express';
import { PrismaClient } from '../../generated/prisma';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';

const router = express.Router();
const prisma = new PrismaClient();

const N8N_WEBHOOK_URL = 'https://n8n.srv891599.hstgr.cloud/webhook/96e19249-8f7f-407e-b981-3d4e410cb2d7';

// Helper to get current month and year
function getCurrentReportMonth(): string {
    const date = new Date();
    const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return `${monthNames[date.getMonth()]} ${date.getFullYear()}`;
}

// POST /api/audit/n8n/send - Send audit data to n8n webhook
router.post('/send', authenticateToken, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user.userId;

    try {
        // Find the user's company domain and latest audit
        const companyDomain = await prisma.domain.findFirst({
            where: {
                userId,
                isCompanyDomain: true,
            },
            include: {
                auditResults: {
                    orderBy: {
                        updatedAt: 'desc'
                    },
                    take: 1
                }
            }
        });

        if (!companyDomain) {
            return res.status(404).json({
                success: false,
                error: 'Company domain not found'
            });
        }

        const auditResult = companyDomain.auditResults[0];
        if (!auditResult) {
            return res.status(404).json({
                success: false,
                error: 'No audit results found. Please run an audit first.'
            });
        }

        // Get backend URL from environment or construct it
        const backendUrl = process.env.BACKEND_URL || `${req.protocol}://${req.get('host')}`;
        const callbackUrl = `${backendUrl}/api/audit/n8n/callback`;

        // Prepare the payload for n8n
        const n8nPayload = {
            name: companyDomain.url,
            'Report Month': getCurrentReportMonth(),
            'proposal template': '1queNsZi99R15QaCalavH8TqqvaeGPp1wC8Tqwn7AkhI',
            'analytics property': companyDomain.url,
            'sheets template': '1qucJJTUMUCHN0k1yQDTBr6HKF7u0HPMC4NkVJy6kIT0',
            URL: companyDomain.url,
            'Org Name': companyDomain.url,
        };

        // Create n8n request record in database
        const n8nRequest = await prisma.n8nRequest.create({
            data: {
                auditResultId: auditResult.id,
                status: 'pending',
                requestPayload: n8nPayload as any,
            }
        });

        // Add the ID and callback URL to the payload
        const finalPayload = {
            ...n8nPayload,
            id: n8nRequest.requestId,
            callbackUrl,
        };

        // Send to n8n webhook
        const n8nResponse = await fetch(N8N_WEBHOOK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(finalPayload),
        });

        console.log(finalPayload);

        if (!n8nResponse.ok) {
            // Update status to failed
            await prisma.n8nRequest.update({
                where: { id: n8nRequest.id },
                data: {
                    status: 'failed',
                    responseData: {
                        error: `N8n webhook returned ${n8nResponse.status}`,
                        statusText: n8nResponse.statusText
                    } as any
                }
            });

            // Emit failure event
            const { broadcastToUser } = await import('../services/sseService');
            broadcastToUser(userId, {
                type: 'n8n_update',
                data: {
                    requestId: n8nRequest.requestId,
                    status: 'failed',
                    error: `N8n webhook returned ${n8nResponse.status}`
                }
            });

            return res.status(500).json({
                success: false,
                error: 'Failed to send data to n8n webhook',
                details: `Status: ${n8nResponse.status}`
            });
        }

        // Update status to processing
        await prisma.n8nRequest.update({
            where: { id: n8nRequest.id },
            data: { status: 'processing' }
        });

        // Emit processing event
        const { broadcastToUser } = await import('../services/sseService');
        broadcastToUser(userId, {
            type: 'n8n_update',
            data: {
                requestId: n8nRequest.requestId,
                status: 'processing'
            }
        });

        const responseData = await n8nResponse.json().catch(() => ({}));

        return res.json({
            success: true,
            message: 'Data sent to n8n successfully',
            requestId: n8nRequest.requestId,
            response: responseData
        });

    } catch (error) {
        console.error('Error sending to n8n:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to send audit data to n8n',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

// POST /api/audit/n8n/callback - Receive callback from n8n
router.post('/callback', async (req: Request, res: Response) => {
    try {
        const { id, googleSheetsUrl, googleSlidesUrl, ...otherData } = req.body;

        if (!id) {
            return res.status(400).json({
                success: false,
                error: 'Missing request ID'
            });
        }

        // Find the n8n request by requestId
        const n8nRequest = await prisma.n8nRequest.findUnique({
            where: { requestId: id },
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

        if (!n8nRequest) {
            return res.status(404).json({
                success: false,
                error: 'Request not found'
            });
        }

        // Determine if this is a success or error callback
        const hasError = otherData.error || (!googleSheetsUrl && !googleSlidesUrl);
        const newStatus = hasError ? 'failed' : 'completed';

        // Update the request with callback data
        await prisma.n8nRequest.update({
            where: { id: n8nRequest.id },
            data: {
                status: newStatus,
                responseData: {
                    googleSheetsUrl,
                    googleSlidesUrl,
                    ...otherData,
                    receivedAt: new Date().toISOString()
                } as any
            }
        });

        // Emit SSE event to user
        const userId = n8nRequest.auditResult.domain.userId;
        if (userId) {
            const { broadcastToUser } = await import('../services/sseService');
            broadcastToUser(userId, {
                type: 'n8n_update',
                data: {
                    requestId: id,
                    status: newStatus,
                    googleSheetsUrl,
                    googleSlidesUrl,
                    error: otherData.error
                }
            });
        }

        return res.json({
            success: true,
            message: 'Callback received successfully'
        });

    } catch (error) {
        console.error('Error processing n8n callback:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to process callback',
            details: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

// GET /api/audit/n8n/status/:requestId - Get status of n8n request
router.get('/status/:requestId', authenticateToken, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user.userId;
    const { requestId } = req.params;

    try {
        const n8nRequest = await prisma.n8nRequest.findUnique({
            where: { requestId },
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

        if (!n8nRequest) {
            return res.status(404).json({
                success: false,
                error: 'Request not found'
            });
        }

        // Verify ownership
        if (n8nRequest.auditResult.domain.userId !== userId) {
            return res.status(403).json({
                success: false,
                error: 'Unauthorized'
            });
        }

        return res.json({
            success: true,
            status: n8nRequest.status,
            data: n8nRequest.responseData || null,
            createdAt: n8nRequest.createdAt,
            updatedAt: n8nRequest.updatedAt
        });
    } catch (error) {
        console.error('Error fetching n8n status:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to fetch status'
        });
    }
});

export default router;
