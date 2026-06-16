import { authEnv } from '../config/authEnv';

export interface RefreshTokenTtlBackfillClient {
  refreshToken: {
    updateMany(args: {
      where: {
        revokedAt: null;
        expiresAt: { gt: Date };
      };
      data: {
        expiresAt: Date;
      };
    }): Promise<{ count: number }>;
  };
}

/**
 * Caps all still-active refresh tokens to the current TTL window.
 *
 * This is intended for one-time rollout/backfill use so sessions already in
 * flight adopt the new lifetime without waiting for the old expiry window.
 */
export async function backfillActiveRefreshTokenExpiries(
  prisma: RefreshTokenTtlBackfillClient,
  now: Date = new Date(),
  ttlMinutes: number = authEnv.REFRESH_TOKEN_TTL_MINUTES,
): Promise<{ count: number }> {
  const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000);
  return prisma.refreshToken.updateMany({
    where: {
      revokedAt: null,
      expiresAt: { gt: now },
    },
    data: { expiresAt },
  });
}
