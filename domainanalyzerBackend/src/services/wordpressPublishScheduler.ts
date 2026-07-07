import { prisma } from '../lib/prisma';
import { JOB_TYPES, addN8nJob, n8nQueue } from './queueService';
import { getWordpressPublishJobId } from './contentFlowService';

const SCHEDULER_INTERVAL_MS = Number(process.env.WORDPRESS_PUBLISH_RECONCILE_INTERVAL_MS) || 60_000;
const SCHEDULER_ID_PREFIX = 'wordpress-publish';

let schedulerTimer: NodeJS.Timeout | null = null;

async function removeExistingJob(jobId: string): Promise<void> {
  const existing = await n8nQueue.getJob(jobId);
  if (!existing) {
    return;
  }

  const state = await existing.getState().catch(() => null);
  if (state === 'active') {
    throw new Error(`Scheduled publish job ${jobId} is already running`);
  }

  await existing.remove();
}

async function enqueueDelayedPublishJob(draftId: number, scheduledAt: Date, meta?: any): Promise<void> {
  const jobId = getWordpressPublishJobId(draftId);
  await removeExistingJob(jobId);

  const delay = Math.max(0, scheduledAt.getTime() - Date.now());
  await addN8nJob(
    JOB_TYPES.PUBLISH,
    {
      draftId,
      scheduledAt: scheduledAt.toISOString(),
      ...(meta ? { meta } : {}),
    },
    {
      jobId,
      delay,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
      removeOnComplete: true,
      removeOnFail: false,
    }
  );
}

export async function scheduleWordpressPublish(draftId: number, scheduledAt: Date, meta?: any): Promise<void> {
  await enqueueDelayedPublishJob(draftId, scheduledAt, meta);
}

export async function cancelWordpressPublishSchedule(draftId: number): Promise<boolean> {
  const jobId = getWordpressPublishJobId(draftId);
  const existing = await n8nQueue.getJob(jobId);
  if (!existing) {
    return false;
  }

  const state = await existing.getState().catch(() => null);
  if (state === 'active') {
    throw new Error('Scheduled publish is already running');
  }

  await existing.remove();
  return true;
}

export async function rehydrateScheduledWordpressPublishes(): Promise<number> {
  const drafts = await prisma.wordpressPublishLog.findMany({
    where: {
      status: 'scheduled',
      scheduledAt: { not: null },
    },
    select: {
      id: true,
      scheduledAt: true,
    },
  });

  let restored = 0;
  for (const draft of drafts) {
    const scheduledAt = draft.scheduledAt ? new Date(draft.scheduledAt) : null;
    if (!scheduledAt || Number.isNaN(scheduledAt.getTime())) {
      continue;
    }

    const jobId = getWordpressPublishJobId(draft.id);
    const existing = await n8nQueue.getJob(jobId);
    if (existing) {
      continue;
    }

    await enqueueDelayedPublishJob(draft.id, scheduledAt);
    restored++;
  }

  return restored;
}

export function startWordpressPublishScheduler(): () => void {
  if (schedulerTimer) {
    return () => undefined;
  }

  const tick = async () => {
    try {
      const restored = await rehydrateScheduledWordpressPublishes();
      if (restored > 0) {
        console.log(`[publish-scheduler] rehydrated ${restored} scheduled publish job(s)`);
      }
    } catch (error) {
      console.warn('[publish-scheduler] tick failed', error);
    }
  };

  void tick();
  schedulerTimer = setInterval(tick, SCHEDULER_INTERVAL_MS);
  console.log(`[publish-scheduler] watching scheduled WordPress publishes (${SCHEDULER_INTERVAL_MS}ms interval)`);

  return () => {
    if (schedulerTimer) {
      clearInterval(schedulerTimer);
      schedulerTimer = null;
    }
  };
}

export { SCHEDULER_ID_PREFIX };
