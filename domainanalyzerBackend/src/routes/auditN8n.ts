import express, { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { decryptToken } from '../services/tokenEncryption';

const router = express.Router();

const N8N_WEBHOOK_URL =
    process.env.N8N_ANALYTICS_REPORTING_WEBHOOK_URL ||
    process.env.N8N_AUDIT_WEBHOOK_URL ||
    'https://n8n.srv891599.hstgr.cloud/webhook/analytics-reporting';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

// Helper to get Month Year from date string or current date
function getReportMonth(dateStr?: string): string {
    const date = dateStr ? new Date(dateStr) : new Date();

    // Check if date is valid
    const targetDate = isNaN(date.getTime()) ? new Date() : date;

    return targetDate.toISOString().split('T')[0];
}

// POST /api/audit/n8n/send - Send audit data to n8n webhook
router.post('/send', authenticateToken, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user.userId;
    const { reportMonth, analyticsProperty, orgName, name } = req.body;

    if (!reportMonth || !analyticsProperty) {
        return res.status(400).json({
            success: false,
            error: 'Missing required fields: reportMonth and analyticsProperty are required'
        });
    }

    try {
        if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
            return res.status(500).json({
                success: false,
                error: 'Google OAuth credentials are not configured on the server'
            });
        }

        // Find the user's company domain and latest audit
        const companyDomain = await prisma.domain.findFirst({
            where: {
                userId,
                isCompanyDomain: true,
            },
            include: {
                auditResult: true,
            },
        });

        if (!companyDomain) {
            return res.status(404).json({
                success: false,
                error: 'Company domain not found'
            });
        }

        const auditResult = companyDomain.auditResult;
        if (!auditResult) {
            return res.status(404).json({
                success: false,
                error: 'No audit results found. Please run an audit first.'
            });
        }

        const gscConnection = await prisma.googleSearchConsoleConnection.findUnique({
            where: { userId }
        });

        if (!gscConnection || !gscConnection.isConnected || !gscConnection.selectedProperty) {
            return res.status(400).json({
                success: false,
                error: 'Google Search Console must be connected and a property must be selected before sending this report'
            });
        }

        const refreshToken = decryptToken(gscConnection.refreshToken);

        // Format domain to replace protocol with www.
        let formattedUrl = companyDomain.url;
        try {
            const urlObj = new URL(companyDomain.url);
            formattedUrl = `www.${urlObj.hostname}`;
        } catch (e) {
            // Fallback if URL is invalid
            formattedUrl = formattedUrl.replace(/^(?:https?:\/\/)?(?:www\.)?/i, 'www.');
        }

        // Get backend URL from environment or construct it
        const backendUrl = process.env.BACKEND_URL || `${req.protocol}://${req.get('host')}`;
        const callbackUrl = `${backendUrl}/api/audit/n8n/callback`;
        // Prepare the payload for n8n
        const n8nPayload = {
            name: name, // User provided name or formatted domain
            'Report Month': getReportMonth(reportMonth),
            'proposal template': '1queNsZi99R15QaCalavH8TqqvaeGPp1wC8Tqwn7AkhI',
            'analytics property': analyticsProperty,
            'sheets template': '1qucJJTUMUCHN0k1yQDTBr6HKF7u0HPMC4NkVJy6kIT0',
            URL: formattedUrl,
            'Org Name': orgName,
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
            refresh_token: refreshToken,
            siteUrl: gscConnection.selectedProperty,
            client_id: GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET,
        };

        // Send to n8n webhook
        const n8nResponse = await fetch(N8N_WEBHOOK_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(finalPayload),
        });
        const responseText = await n8nResponse.text().catch(() => '');
        const responseData = responseText
            ? (() => {
                try {
                    return JSON.parse(responseText);
                } catch {
                    return { raw: responseText };
                }
            })()
            : {};

        console.log('[audit-n8n] webhook request', {
            webhookUrl: N8N_WEBHOOK_URL,
            payload: {
                ...finalPayload,
                refresh_token: '***',
                client_id: '***',
                client_secret: '***',
            }
        });

        console.log('[audit-n8n] webhook response', {
            status: n8nResponse.status,
            statusText: n8nResponse.statusText,
            body: responseData,
        });

        if (!n8nResponse.ok) {
            return res.status(500).json({
                success: false,
                error: 'Failed to send data to n8n webhook',
                details: `Status: ${n8nResponse.status}`,
                n8nStatusText: n8nResponse.statusText,
                n8nResponse: responseData
            });
        }

        const googleSheetsUrl =
            (responseData as any)['Sheet URL'] ||
            (responseData as any).sheetUrl ||
            (responseData as any).googleSheetsUrl ||
            null;

        const googleSlidesUrl =
            (responseData as any)['Presentation URL'] ||
            (responseData as any).presentationUrl ||
            (responseData as any).googleSlidesUrl ||
            null;

        const isCompleted = !!(googleSheetsUrl || googleSlidesUrl);

        // Persist synchronous n8n output immediately when available
        await prisma.n8nRequest.update({
            where: { id: n8nRequest.id },
            data: {
                status: isCompleted ? 'completed' : 'processing',
                responseData: {
                    googleSheetsUrl,
                    googleSlidesUrl,
                    sheetUrl: googleSheetsUrl,
                    reportUrl: googleSlidesUrl,
                    raw: responseData,
                } as any
            }
        });

        // Emit status event reflecting synchronous completion when URLs exist
        const { broadcastToUser } = await import('../services/sseService');
        broadcastToUser(userId, {
            type: 'n8n_update',
            data: {
                requestId: n8nRequest.requestId,
                status: isCompleted ? 'completed' : 'processing',
                googleSheetsUrl,
                googleSlidesUrl,
            }
        });

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
        const rawBody = req.body;
        const body = (
            Array.isArray(rawBody) ? (rawBody[0] || {}) : (rawBody || {})
        ) as Record<string, any>;
        const id = body.id || body.requestId || body.request_id;

        const firstString = (...values: any[]): string | undefined => {
            for (const v of values) {
                if (typeof v === 'string' && v.trim()) return v.trim();
            }
            return undefined;
        };

        // n8n payloads vary across workflows (camelCase/snake_case/spaces/nested).
        const googleSheetsUrl = firstString(
            body.googleSheetsUrl,
            body.google_sheets_url,
            body.googleSheetUrl,
            body.sheetUrl,
            body.sheetsUrl,
            body['Google Sheets URL'],
            body['google sheets url'],
            body?.data?.googleSheetsUrl,
            body?.data?.google_sheets_url,
            body?.data?.sheetUrl,
            body?.data?.sheetsUrl,
            body?.results?.googleSheetsUrl,
            body?.results?.google_sheets_url,
            body?.results?.sheetUrl,
            body?.results?.sheetsUrl
        );
        const googleSlidesUrl = firstString(
            body.googleSlidesUrl,
            body.google_slides_url,
            body.googleSlideUrl,
            body.reportUrl,
            body.report_url,
            body.slideUrl,
            body.slidesUrl,
            body['Google Slides URL'],
            body['google slides url'],
            body?.data?.googleSlidesUrl,
            body?.data?.google_slides_url,
            body?.data?.reportUrl,
            body?.data?.report_url,
            body?.data?.slideUrl,
            body?.data?.slidesUrl,
            body?.results?.googleSlidesUrl,
            body?.results?.google_slides_url,
            body?.results?.reportUrl,
            body?.results?.report_url,
            body?.results?.slideUrl,
            body?.results?.slidesUrl
        );
        const reportUrl = googleSlidesUrl;
        const sheetUrl = googleSheetsUrl;
        const callbackError = firstString(
            body.error,
            body.errorMessage,
            body.error_message,
            body?.data?.error,
            body?.results?.error
        );

        const { id: _id, requestId: _requestId, request_id: _request_id, ...otherData } = body;
        console.log(body);
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
        const hasError = Boolean(callbackError) || (!googleSheetsUrl && !googleSlidesUrl);
        const newStatus = hasError ? 'failed' : 'completed';

        // Update the request with callback data
        await prisma.n8nRequest.update({
            where: { id: n8nRequest.id },
            data: {
                status: newStatus,
                responseData: {
                    googleSheetsUrl,
                    googleSlidesUrl,
                    sheetUrl,
                    reportUrl,
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
                    sheetUrl,
                    reportUrl,
                    error: callbackError
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
            data: {
                ...((n8nRequest.responseData as Record<string, any>) || {}),
                googleSheetsUrl: (n8nRequest.responseData as any)?.googleSheetsUrl || (n8nRequest.responseData as any)?.sheetUrl || null,
                googleSlidesUrl: (n8nRequest.responseData as any)?.googleSlidesUrl || (n8nRequest.responseData as any)?.reportUrl || null,
                sheetUrl: (n8nRequest.responseData as any)?.sheetUrl || (n8nRequest.responseData as any)?.googleSheetsUrl || null,
                reportUrl: (n8nRequest.responseData as any)?.reportUrl || (n8nRequest.responseData as any)?.googleSlidesUrl || null,
            },
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

// GET /api/audit/n8n/history - Get history of all n8n requests for the user
router.get('/history', authenticateToken, async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user.userId;

    try {
        const n8nRequests = await prisma.n8nRequest.findMany({
            where: {
                auditResult: {
                    domain: {
                        userId: userId
                    }
                }
            },
            include: {
                auditResult: {
                    include: {
                        domain: {
                            select: {
                                url: true,
                            }
                        }
                    }
                }
            },
            orderBy: {
                createdAt: 'desc'
            },
            take: 50
        });

        // Simple mapping to make it cleaner for frontend
        const history = n8nRequests.map((req: any) => ({
            id: req.id,
            requestId: req.requestId,
            status: req.status,
            createdAt: req.createdAt,
            payload: req.requestPayload,
            results: {
                ...(req.responseData || {}),
                googleSheetsUrl: req.responseData?.googleSheetsUrl || req.responseData?.sheetUrl || null,
                googleSlidesUrl: req.responseData?.googleSlidesUrl || req.responseData?.reportUrl || null,
                sheetUrl: req.responseData?.sheetUrl || req.responseData?.googleSheetsUrl || null,
                reportUrl: req.responseData?.reportUrl || req.responseData?.googleSlidesUrl || null,
            },
            domainUrl: req.auditResult?.domain?.url
        }));

        return res.json({
            success: true,
            history
        });
    } catch (error) {
        console.error('Error fetching n8n history:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to fetch history'
        });
    }
});

export default router;
