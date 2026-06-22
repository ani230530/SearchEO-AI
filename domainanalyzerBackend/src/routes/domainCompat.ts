import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { parseDomainInput } from '../utils/domainValidation';

const router = Router();

const STEP_PHASES = ['crawl', 'profile', 'competitors', 'topics', 'select', 'run'] as const;

type PatchDomainBody = {
  url?: string;
  isCompanyDomain?: boolean;
  googleAnalyticsId?: string | null;
  currentStep?: number;
};

router.patch('/:id', authenticateToken, async (req: Request, res: Response) => {
  const domainId = Number(req.params.id);
  if (!Number.isFinite(domainId)) {
    return res.status(400).json({ error: 'Invalid domain id' });
  }

  const userId = (req as AuthenticatedRequest).user.userId;
  const domain = await prisma.domain.findFirst({ where: { id: domainId, userId } });
  if (!domain) {
    return res.status(404).json({ error: 'Domain not found' });
  }

  const body = (req.body ?? {}) as PatchDomainBody;
  const updateData: {
    url?: string;
    host?: string;
    isCompanyDomain?: boolean;
    googleAnalyticsId?: string | null;
  } = {};

  if (typeof body.url === 'string') {
    const parsed = parseDomainInput(body.url);
    if (!parsed) {
      return res.status(400).json({ error: 'Please enter a valid domain or URL (e.g., example.com)' });
    }
    updateData.url = parsed.normalizedUrl;
    updateData.host = parsed.hostname;
  }

  if (typeof body.isCompanyDomain === 'boolean') {
    updateData.isCompanyDomain = body.isCompanyDomain;
  }

  if (body.googleAnalyticsId === null || typeof body.googleAnalyticsId === 'string') {
    updateData.googleAnalyticsId = body.googleAnalyticsId;
  }

  const updatedDomain = Object.keys(updateData).length
    ? await prisma.domain.update({
        where: { id: domain.id },
        data: updateData,
      })
    : domain;

  if (Number.isFinite(body.currentStep)) {
    const step = Math.max(0, Math.min(STEP_PHASES.length, Math.floor(body.currentStep as number)));
    const phases: Record<string, 'completed'> = {};
    for (let i = 0; i < step; i++) phases[STEP_PHASES[i]] = 'completed';
    await prisma.wizardState.upsert({
      where: { domainId: domain.id },
      update: { phases: phases as any },
      create: { domainId: domain.id, phases: phases as any },
    });
  }

  return res.json({
    success: true,
    domain: {
      id: updatedDomain.id,
      url: updatedDomain.url,
      host: updatedDomain.host,
      isCompanyDomain: updatedDomain.isCompanyDomain,
      googleAnalyticsId: updatedDomain.googleAnalyticsId,
      updatedAt: updatedDomain.updatedAt,
    },
  });
});

export default router;
