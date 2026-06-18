import { PrismaClient } from '../../generated/prisma';
import { runTrackedQueries } from '../wizard/runService';

const prisma = new PrismaClient();

async function refreshInFlight(domainId: number): Promise<boolean> {
  const existing = await prisma.aiRun.findFirst({
    where: {
      domainId,
      status: 'running',
      kind: { in: ['refresh', 'weekly'] },
    },
    select: { id: true },
  });
  return existing !== null;
}

export async function runWeeklySweep(): Promise<{ domains: number; ok: number; failed: number; skipped: number }> {
  console.log('[weekly] legacy sweep requested, but branch-aware refresh now runs on demand');
  return { domains: 0, ok: 0, failed: 0, skipped: 0 };
}

export async function runWeeklyForDomain(domainId: number): Promise<{ skipped: boolean }> {
  if (await refreshInFlight(domainId)) {
    return { skipped: true };
  }

  await runTrackedQueries(prisma, domainId);
  return { skipped: false };
}
