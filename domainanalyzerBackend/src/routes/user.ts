/**
 * /api/user — minimal user-scoped endpoints needed by the dashboard.
 *
 * The original src/routes/user.ts was dropped during the foundational
 * wizard rewrite, but the dashboard still calls /api/user/company-domain
 * (GET to load it on every tab change, POST when the setup form submits).
 * Without this file every dashboard render logs "Failed to fetch company
 * domain" and the worksheet UI sits idle.
 *
 * Adapted to the new schema:
 *   - Domain.context / Domain.location are gone — context now lives on
 *     DomainInferred.summary, location is dropped.
 *   - Keyword still carries volume / difficulty / cpc / intent so the
 *     keywords array shape is unchanged from the old endpoint.
 */
import { Router, Request, Response, NextFunction } from 'express';
import { PrismaClient } from '../../generated/prisma';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';

const router: Router = Router();
const prisma = new PrismaClient();

function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function normalizeUrl(input: string): { url: string; host: string } | null {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    const withProtocol = trimmed.match(/^https?:\/\//) ? trimmed : `https://${trimmed}`;
    const u = new URL(withProtocol);
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    if (!host.includes('.')) return null;
    return { url: `https://${host}`, host };
  } catch {
    return null;
  }
}

router.get(
  '/company-domain',
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as AuthenticatedRequest).user.userId;

    const companyDomain = await prisma.domain.findFirst({
      where: { userId, isCompanyDomain: true },
      include: {
        keywords: { orderBy: { createdAt: 'desc' } },
        inferred: { select: { summary: true, companyName: true } },
      },
    });

    if (!companyDomain) {
      return res.json({ success: true, domain: null, keywords: [] });
    }

    return res.json({
      success: true,
      domain: {
        id: companyDomain.id,
        url: companyDomain.url,
        host: companyDomain.host,
        context: companyDomain.inferred?.summary ?? null,
        companyName: companyDomain.inferred?.companyName ?? null,
        googleAnalyticsId: companyDomain.googleAnalyticsId,
        createdAt: companyDomain.createdAt,
        updatedAt: companyDomain.updatedAt,
      },
      keywords: companyDomain.keywords.map((k) => ({
        id: k.id,
        term: k.term,
        volume: k.volume,
        difficulty: k.difficulty,
        cpc: k.cpc,
        intent: k.intent,
      })),
    });
  })
);

router.post(
  '/company-domain',
  authenticateToken,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as AuthenticatedRequest).user.userId;
    const { url } = (req.body ?? {}) as { url?: string };
    const norm = url ? normalizeUrl(url) : null;
    if (!norm) {
      return res.status(400).json({
        error: 'Please enter a valid domain or URL (e.g., example.com)',
      });
    }

    // Demote any existing company domain whose host doesn't match.
    const existingCompany = await prisma.domain.findFirst({
      where: { userId, isCompanyDomain: true },
    });
    if (existingCompany && existingCompany.host !== norm.host) {
      await prisma.domain.update({
        where: { id: existingCompany.id },
        data: { isCompanyDomain: false },
      });
    }

    // Upsert the target Domain row by (userId, host) and mark as company.
    const domain = await prisma.domain.upsert({
      where: { userId_host: { userId, host: norm.host } },
      update: { isCompanyDomain: true, url: norm.url },
      create: { userId, url: norm.url, host: norm.host, isCompanyDomain: true },
    });

    return res.json({
      success: true,
      domain: {
        id: domain.id,
        url: domain.url,
        host: domain.host,
        googleAnalyticsId: domain.googleAnalyticsId,
        createdAt: domain.createdAt,
        updatedAt: domain.updatedAt,
      },
    });
  })
);

export default router;
