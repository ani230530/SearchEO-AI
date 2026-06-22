import { redisService } from '../services/RedisService';

export const REPORT_LITE_CACHE_TTL_SECONDS = 60;

export const reportCacheKey = (
  userId: number,
  domainId: number,
  runId: number | string,
  view: 'lite',
) => `wizard:report:${userId}:${domainId}:${runId}:${view}`;

export async function invalidateReportCacheForDomain(
  userId: number | null | undefined,
  domainId: number | null | undefined,
): Promise<void> {
  if (!userId || !domainId) return;
  await redisService.delPattern(`wizard:report:${userId}:${domainId}:*`);
}
