import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  upsertJobScheduler: vi.fn(async () => undefined),
}));

vi.mock('../lib/prisma', () => ({
  prisma: {},
}));

vi.mock('./queueService', () => ({
  WEEKLY_TRACKING_JOB: 'weekly-tracking-sweep',
  n8nQueue: {
    upsertJobScheduler: mocks.upsertJobScheduler,
  },
}));

vi.mock('../wizard/runService', () => ({
  runTrackedQueries: vi.fn(async () => undefined),
}));

import { registerWeeklyTracking, TRACKED_PROMPT_CRON } from './weeklyTrackingService';

describe('weeklyTrackingService daily scheduler', () => {
  beforeEach(() => {
    mocks.upsertJobScheduler.mockClear();
  });

  it('registers tracked prompt sweeps every day at 03:00 UTC', async () => {
    expect(TRACKED_PROMPT_CRON).toBe('0 3 * * *');

    await registerWeeklyTracking();

    expect(mocks.upsertJobScheduler).toHaveBeenCalledWith(
      'weekly-tracking',
      { pattern: '0 3 * * *', tz: 'UTC' },
      expect.objectContaining({
        name: 'weekly-tracking-sweep',
        data: {},
        opts: expect.objectContaining({ attempts: 1 }),
      }),
    );
  });
});
