/**
 * restore-blogs.ts
 *
 * Counterpart of backup-blogs.ts. Re-inserts the retained rows into the
 * post-migration schema. Domain rows have additional required fields
 * (`host`) in the new schema — derived here from `url`.
 *
 * Run:  pnpm tsx scripts/restore-blogs.ts <path-to-backup.json>
 *
 * Idempotency: every insert uses `upsert` keyed by primary id so re-runs
 * don't double-insert. New tables (DomainProfile / DomainInferred / etc.)
 * are NOT created here — the wizard will populate those on next run.
 */

import 'dotenv/config';
import { PrismaClient } from '../generated/prisma';
import { readFileSync } from 'node:fs';

const prisma = new PrismaClient();

function deriveHost(url: string): string {
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    return u.hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return url.replace(/^https?:\/\//, '').replace(/^www\./i, '').split('/')[0].toLowerCase();
  }
}

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('usage: tsx scripts/restore-blogs.ts <path-to-backup.json>');
    process.exit(1);
  }

  const payload = JSON.parse(readFileSync(file, 'utf8'));
  const d = payload.data ?? payload; // tolerate either nested or flat

  console.log('[restore] users:', d.users?.length ?? 0);
  for (const u of d.users ?? []) {
    await prisma.user.upsert({ where: { id: u.id }, update: u, create: u });
  }

  console.log('[restore] domains:', d.domains?.length ?? 0);
  for (const dom of d.domains ?? []) {
    const host = dom.host ?? deriveHost(dom.url);
    const slim = {
      id: dom.id,
      userId: dom.userId,
      url: dom.url,
      host,
      isCompanyDomain: !!dom.isCompanyDomain,
      googleAnalyticsId: dom.googleAnalyticsId ?? null,
      createdAt: dom.createdAt ? new Date(dom.createdAt) : new Date(),
      updatedAt: dom.updatedAt ? new Date(dom.updatedAt) : new Date(),
    };
    await prisma.domain.upsert({ where: { id: slim.id }, update: slim, create: slim });
  }

  console.log('[restore] campaigns:', d.campaigns?.length ?? 0);
  for (const c of d.campaigns ?? []) {
    await prisma.campaign.upsert({ where: { id: c.id }, update: c, create: c });
  }

  console.log('[restore] campaignTopics:', d.campaignTopics?.length ?? 0);
  for (const t of d.campaignTopics ?? []) {
    // strip deprecated columns
    const { archivedFromPageId: _a, ...keep } = t;
    await prisma.campaignTopic.upsert({ where: { id: keep.id }, update: keep, create: keep });
  }

  console.log('[restore] campaignKeywords:', d.campaignKeywords?.length ?? 0);
  for (const k of d.campaignKeywords ?? []) {
    if (!k.topicId) continue; // legacy page-only rows are dropped
    const { pageId: _p, ...keep } = k;
    await prisma.campaignKeyword.upsert({ where: { id: keep.id }, update: keep, create: keep });
  }

  console.log('[restore] wordpressIntegrations:', d.wordpressIntegrations?.length ?? 0);
  for (const w of d.wordpressIntegrations ?? []) {
    await prisma.wordpressIntegration.upsert({ where: { id: w.id }, update: w, create: w });
  }

  console.log('[restore] wordpressPublishLogs:', d.wordpressPublishLogs?.length ?? 0);
  for (const log of d.wordpressPublishLogs ?? []) {
    const { generationPageId: _gp, ...keep } = log;
    await prisma.wordpressPublishLog.upsert({ where: { id: keep.id }, update: keep, create: keep });
  }

  console.log('[restore] generationJobs:', d.generationJobs?.length ?? 0);
  for (const j of d.generationJobs ?? []) {
    await prisma.generationJob.upsert({ where: { id: j.id }, update: j, create: j });
  }

  console.log('[restore] gscConnections:', d.gscConnections?.length ?? 0);
  for (const g of d.gscConnections ?? []) {
    await prisma.googleSearchConsoleConnection.upsert({ where: { id: g.id }, update: g, create: g });
  }

  console.log('[restore] done');
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('[restore] failed:', err);
  process.exit(1);
});
