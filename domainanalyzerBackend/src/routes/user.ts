import { Router, Request, Response } from 'express';
import { PrismaClient } from '../../generated/prisma';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { crawlAndExtractWithGpt4o, generateKeywordsForDomain } from '../services/geminiService';

const router = Router();
const prisma = new PrismaClient();

function asyncHandler(fn: (req: Request, res: Response, next: any) => Promise<any>) {
  return function (req: Request, res: Response, next: any) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// GET /api/user/company-domain - Get user's company domain
router.get('/company-domain', authenticateToken, asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.user.userId;

  try {
    // Find company domain for this user
    const companyDomain = await prisma.domain.findFirst({
      where: {
        userId: userId,
        isCompanyDomain: true
      },
      include: {
        keywords: {
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!companyDomain) {
      return res.json({
        success: true,
        domain: null,
        keywords: []
      });
    }

    return res.json({
      success: true,
      domain: {
        id: companyDomain.id,
        url: companyDomain.url,
        context: companyDomain.context,
        location: companyDomain.location,
        googleAnalyticsId: companyDomain.googleAnalyticsId,
        createdAt: companyDomain.createdAt,
        updatedAt: companyDomain.updatedAt
      },
      keywords: companyDomain.keywords.map(k => ({
        id: k.id,
        term: k.term,
        volume: k.volume,
        difficulty: k.difficulty,
        cpc: k.cpc,
        intent: k.intent
      }))
    });
  } catch (error) {
    console.error('Error fetching company domain:', error);
    res.status(500).json({ error: 'Failed to fetch company domain' });
  }
}));

// POST /api/user/company-domain - Create or update company domain
router.post('/company-domain', authenticateToken, asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const userId = authReq.user.userId;
  const { url, location } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    // Normalize URL
    let normalizedUrl = url.trim().toLowerCase();
    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
      normalizedUrl = `https://${normalizedUrl}`;
    }
    // Remove trailing slash
    normalizedUrl = normalizedUrl.replace(/\/$/, '');

    // Check if user already has a company domain
    const existingCompanyDomain = await prisma.domain.findFirst({
      where: {
        userId: userId,
        isCompanyDomain: true
      }
    });

    // Check if this URL already exists as a regular domain for this user
    const existingDomain = await prisma.domain.findFirst({
      where: {
        userId: userId,
        url: normalizedUrl
      }
    });

    let domainId: number;

    if (existingCompanyDomain) {
      // If user already has a company domain, update it
      if (existingCompanyDomain.url === normalizedUrl) {
        // Same URL, just return existing
        domainId = existingCompanyDomain.id;
      } else {
        // Different URL - update the existing company domain
        // First, unset isCompanyDomain on old domain if URL is different
        if (existingCompanyDomain.url !== normalizedUrl) {
          await prisma.domain.update({
            where: { id: existingCompanyDomain.id },
            data: { isCompanyDomain: false }
          });
        }

        // If the new URL exists as a regular domain, update it to be company domain
        if (existingDomain) {
          await prisma.domain.update({
            where: { id: existingDomain.id },
            data: { isCompanyDomain: true, location: location || 'Global' }
          });
          domainId = existingDomain.id;
        } else {
          // Create new company domain
          const newDomain = await prisma.domain.create({
            data: {
              url: normalizedUrl,
              userId: userId,
              location: location || 'Global',
              isCompanyDomain: true
            }
          });
          domainId = newDomain.id;
        }
      }
    } else {
      // No existing company domain
      if (existingDomain) {
        // Update existing domain to be company domain
        await prisma.domain.update({
          where: { id: existingDomain.id },
          data: { isCompanyDomain: true, location: location || 'Global' }
        });
        domainId = existingDomain.id;
      } else {
        // Create new company domain
        const newDomain = await prisma.domain.create({
          data: {
            url: normalizedUrl,
            userId: userId,
            location: location || 'Global',
            isCompanyDomain: true
          }
        });
        domainId = newDomain.id;
      }
    }

    // Return the domain ID - the frontend will handle the extraction and keyword generation
    res.json({
      success: true,
      domainId: domainId,
      message: existingCompanyDomain ? 'Company domain updated' : 'Company domain created'
    });
  } catch (error) {
    console.error('Error creating/updating company domain:', error);
    res.status(500).json({ error: 'Failed to create/update company domain' });
  }
}));

export default router;

