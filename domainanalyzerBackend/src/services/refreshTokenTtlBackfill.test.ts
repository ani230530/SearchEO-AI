import { describe, expect, it, vi } from 'vitest';
import { backfillActiveRefreshTokenExpiries } from './refreshTokenTtlBackfill';

describe('backfillActiveRefreshTokenExpiries', () => {
  it('caps only active refresh tokens to the new window', async () => {
    const now = new Date('2026-06-15T12:00:00.000Z');
    const future = new Date('2026-06-16T12:00:00.000Z');
    const past = new Date('2026-06-15T11:59:00.000Z');
    const revokedFuture = new Date('2026-06-15T12:20:00.000Z');

    const rows = [
      { id: 1, revokedAt: null, expiresAt: future },
      { id: 2, revokedAt: null, expiresAt: past },
      { id: 3, revokedAt: new Date('2026-06-15T11:50:00.000Z'), expiresAt: revokedFuture },
    ];

    const updateMany = vi.fn(async ({ where, data }) => {
      let count = 0;
      for (const row of rows) {
        const activeMatch = row.revokedAt === where.revokedAt && row.expiresAt.getTime() > where.expiresAt.gt.getTime();
        if (activeMatch) {
          row.expiresAt = data.expiresAt;
          count++;
        }
      }
      return { count };
    });

    const prisma = {
      refreshToken: { updateMany },
    };

    const result = await backfillActiveRefreshTokenExpiries(prisma, now, 24 * 60);

    expect(result.count).toBe(1);
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        revokedAt: null,
        expiresAt: { gt: now },
      },
      data: {
        expiresAt: future,
      },
    });
    expect(rows[0].expiresAt).toEqual(future);
    expect(rows[1].expiresAt).toBe(past);
    expect(rows[2].expiresAt).toBe(revokedFuture);
  });
});
