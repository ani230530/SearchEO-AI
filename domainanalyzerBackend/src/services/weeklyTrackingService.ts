// Weekly tracked-prompt re-testing.
//
// Users mark individual prompts for tracking (Prompt.isTracked=true). Once a
// week the scheduler re-runs every domain's tracked prompts through the same
// LLM roster + scorer as the wizard audit, tagging the resulting AiRun as
// kind='weekly'. Results accumulate immutably, so the dashboard can show
// week-over-week visibility/sentiment trends per prompt.
//
// Scheduling is a BullMQ repeatable job (restart-safe, unlike setInterval).
// The processor runs inside the existing n8n-queue worker (see queueService).

import { prisma } from '../lib/prisma';
import { n8nQueue, WEEKLY_TRACKING_JOB } from './queueService';
import { runTrackedQueries } from '../wizard/runService';


// Stable scheduler id — upsert keeps restarts/redeploys from stacking
// duplicate repeatables.
const SCHEDULER_ID = 'weekly-tracking';
// Every Monday at 03:00 UTC.
const WEEKLY_CRON = '0 3 * * 1';
// A weekly run should finish in minutes. If the process dies mid-run, a stale
// AiRun(status='running') must not block every future weekly test forever.
const WEEKLY_RUN_STALE_MINUTES = Math.max(
  15,
  Number(process.env.WEEKLY_RUN_STALE_MINUTES ?? 360),
);

/**
 * Register (idempotently) the weekly repeatable job. Called once at startup.
 * Only writes the schedule to Redis; the processor runs in the shared worker.
 */
export async function registerWeeklyTracking(): Promise<void> {
  await n8nQueue.upsertJobScheduler(
    SCHEDULER_ID,
    { pattern: WEEKLY_CRON, tz: 'UTC' },
    {
      name: WEEKLY_TRACKING_JOB,
      data: {},
      // The sweep isolates per-domain failures and returns normally, so it
      // shouldn't throw — but if it does, don't retry-storm a weekly job.
      opts: { removeOnComplete: true, removeOnFail: 50, attempts: 1 },
    },
  );
  console.log(`[weekly] scheduled tracked-prompt sweep (${WEEKLY_CRON} UTC)`);
}

/** True if a weekly run is already running for this domain (dedupe). */
async function weeklyRunInFlight(domainId: number): Promise<boolean> {
  const staleCutoff = new Date(Date.now() - WEEKLY_RUN_STALE_MINUTES * 60 * 1000);
  const stale = await prisma.aiRun.updateMany({
    where: {
      domainId,
      kind: 'weekly',
      status: 'running',
      startedAt: { lt: staleCutoff },
    },
    data: {
      status: 'failed',
      endedAt: new Date(),
    },
  });
  if (stale.count > 0) {
    console.warn(`[weekly] marked ${stale.count} stale weekly run(s) failed for domain ${domainId}`);
  }

  const existing = await prisma.aiRun.findFirst({
    where: { domainId, kind: 'weekly', status: 'running' },
    select: { id: true, startedAt: true },
  });
  return existing !== null;
}

/**
 * Run the weekly sweep across every domain that has at least one tracked
 * prompt. Domains are processed SEQUENTIALLY: each runTrackedQueries already
 * fans 6 workers internally against shared LLM rate limits, so running domains
 * concurrently would multiply cost and risk throttling. A single domain's
 * failure is isolated and never aborts the sweep.
 */
export async function runWeeklySweep(): Promise<{ domains: number; ok: number; failed: number; skipped: number }> {
  const grouped = await prisma.prompt.groupBy({
    by: ['domainId'],
    where: { isTracked: true },
    _count: { _all: true },
  });

  let ok = 0;
  let failed = 0;
  let skipped = 0;

  console.log(`[weekly] sweep starting: ${grouped.length} domain(s) with tracked prompts`);

  for (const g of grouped) {
    try {
      // Per-domain in-flight check dedupes the scheduled sweep against a
      // manual "Test tracked now" trigger for the same domain.
      if (await weeklyRunInFlight(g.domainId)) {
        skipped++;
        continue;
      }
      await runTrackedQueries(prisma, g.domainId);
      ok++;
    } catch (err) {
      failed++;
      console.error(`[weekly] domain ${g.domainId} failed`, err);
    }
  }

  console.log(`[weekly] sweep done: ${ok} ok / ${failed} failed / ${skipped} skipped of ${grouped.length}`);
  return { domains: grouped.length, ok, failed, skipped };
}

/**
 * Run tracked prompts for a single domain on demand (the "Test tracked now"
 * button). Returns { skipped: true } if a weekly run is already in flight.
 */
export async function runWeeklyForDomain(domainId: number): Promise<{ skipped: boolean }> {
  if (await weeklyRunInFlight(domainId)) {
    return { skipped: true };
  }
  await runTrackedQueries(prisma, domainId);
  return { skipped: false };
}
