import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  appSettingFindUnique: vi.fn(async () => null),
  appSettingUpsert: vi.fn(async () => undefined),
  upsertJobScheduler: vi.fn(async () => undefined),
}));

vi.mock('../lib/prisma', () => ({
  prisma: {
    appSetting: {
      findUnique: mocks.appSettingFindUnique,
      upsert: mocks.appSettingUpsert,
    },
  },
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

import { registerWeeklyTracking, TRACKED_PROMPT_CRON, updateWeeklyTrackingSchedule } from './weeklyTrackingService';

describe('weeklyTrackingService daily scheduler', () => {
  beforeEach(() => {
    mocks.appSettingFindUnique.mockClear();
    mocks.appSettingFindUnique.mockResolvedValue(null);
    mocks.appSettingUpsert.mockClear();
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

  it('uses the persisted schedule when registering on startup', async () => {
    (mocks.appSettingFindUnique as any).mockResolvedValueOnce({ value: 'every_6_hours' });

    await registerWeeklyTracking();

    expect(mocks.upsertJobScheduler).toHaveBeenCalledWith(
      'weekly-tracking',
      { pattern: '0 */6 * * *', tz: 'UTC' },
      expect.objectContaining({ name: 'weekly-tracking-sweep' }),
    );
  });

  it('persists and rewrites the repeatable job when timing changes', async () => {
    await updateWeeklyTrackingSchedule('weekly_monday_0300_utc');

    expect(mocks.appSettingUpsert).toHaveBeenCalledWith({
      where: { key: 'tracked_prompt_schedule' },
      create: { key: 'tracked_prompt_schedule', value: 'weekly_monday_0300_utc' },
      update: { value: 'weekly_monday_0300_utc' },
    });
    expect(mocks.upsertJobScheduler).toHaveBeenCalledWith(
      'weekly-tracking',
      { pattern: '0 3 * * 1', tz: 'UTC' },
      expect.objectContaining({ name: 'weekly-tracking-sweep' }),
    );
  });

  it('accepts a validated custom cron schedule', async () => {
    await updateWeeklyTrackingSchedule({ scheduleKey: 'custom', cron: '15 4 * * 1-5' });

    expect(mocks.appSettingUpsert).toHaveBeenCalledWith({
      where: { key: 'tracked_prompt_schedule' },
      create: {
        key: 'tracked_prompt_schedule',
        value: JSON.stringify({ type: 'custom', cron: '15 4 * * 1-5' }),
      },
      update: {
        value: JSON.stringify({ type: 'custom', cron: '15 4 * * 1-5' }),
      },
    });
    expect(mocks.upsertJobScheduler).toHaveBeenCalledWith(
      'weekly-tracking',
      { pattern: '15 4 * * 1-5', tz: 'UTC' },
      expect.objectContaining({ name: 'weekly-tracking-sweep' }),
    );
  });

  it('rejects invalid custom cron schedules', async () => {
    await expect(updateWeeklyTrackingSchedule({ scheduleKey: 'custom', cron: 'bad cron' })).rejects.toThrow(
      'Use a 5-field cron expression',
    );
    expect(mocks.upsertJobScheduler).not.toHaveBeenCalled();
  });
});
