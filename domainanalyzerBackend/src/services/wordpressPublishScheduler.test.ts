import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createPrismaMock, type PrismaMock } from '../testSupport/prismaMock';

const state = vi.hoisted(() => ({
  prisma: null as PrismaMock | null,
  getJob: vi.fn(),
  remove: vi.fn(),
  addN8nJob: vi.fn(),
}));

vi.mock('../lib/prisma', () => ({
  prisma: (() => {
    if (!state.prisma) state.prisma = createPrismaMock();
    return state.prisma;
  })(),
}));

vi.mock('./queueService', () => ({
  JOB_TYPES: {
    PUBLISH: 'publish',
  },
  n8nQueue: {
    getJob: state.getJob,
  },
  addN8nJob: state.addN8nJob,
}));

import { getWordpressPublishJobId } from './contentFlowService';
import { cancelWordpressPublishSchedule, scheduleWordpressPublish } from './wordpressPublishScheduler';

beforeEach(() => {
  state.getJob.mockReset();
  state.remove.mockReset();
  state.addN8nJob.mockReset();
  state.prisma = createPrismaMock();
  state.getJob.mockResolvedValue(null);
  state.addN8nJob.mockResolvedValue(undefined);
});

describe('wordpress publish scheduler', () => {
  it('builds BullMQ-safe job ids', () => {
    expect(getWordpressPublishJobId(42)).toBe('wordpress-publish-42');
    expect(getWordpressPublishJobId(42)).not.toContain(':');
  });

  it('passes the BullMQ-safe job id to the queue when scheduling', async () => {
    await scheduleWordpressPublish(17, new Date(Date.now() + 60_000));

    expect(state.getJob).toHaveBeenCalledWith('wordpress-publish-17');
    expect(state.addN8nJob).toHaveBeenCalledTimes(1);
    expect(state.addN8nJob).toHaveBeenCalledWith(
      'publish',
      expect.objectContaining({
        draftId: 17,
        scheduledAt: expect.any(String),
      }),
      expect.objectContaining({
        jobId: 'wordpress-publish-17',
        delay: expect.any(Number),
        attempts: 3,
      }),
    );
  });

  it('removes an existing non-active job before rescheduling', async () => {
    const existingJob = {
      getState: vi.fn().mockResolvedValue('delayed'),
      remove: state.remove,
    };
    state.getJob.mockResolvedValue(existingJob);

    await scheduleWordpressPublish(23, new Date(Date.now() + 60_000));

    expect(existingJob.getState).toHaveBeenCalledTimes(1);
    expect(state.remove).toHaveBeenCalledTimes(1);
  });

  it('does not remove an active scheduled job', async () => {
    const existingJob = {
      getState: vi.fn().mockResolvedValue('active'),
      remove: state.remove,
    };
    state.getJob.mockResolvedValue(existingJob);

    await expect(scheduleWordpressPublish(99, new Date(Date.now() + 60_000))).rejects.toThrow(
      'Scheduled publish job wordpress-publish-99 is already running',
    );
    expect(state.remove).not.toHaveBeenCalled();
    expect(state.addN8nJob).not.toHaveBeenCalled();
  });

  it('cancels an existing scheduled publish job', async () => {
    const existingJob = {
      getState: vi.fn().mockResolvedValue('delayed'),
      remove: state.remove,
    };
    state.getJob.mockResolvedValue(existingJob);

    await expect(cancelWordpressPublishSchedule(31)).resolves.toBe(true);

    expect(state.getJob).toHaveBeenCalledWith('wordpress-publish-31');
    expect(state.remove).toHaveBeenCalledTimes(1);
  });
});
