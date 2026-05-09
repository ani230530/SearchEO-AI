/**
 * backup-blogs.ts
 *
 * Dumps everything we want to retain across the foundational schema reset:
 *   - Users
 *   - Domain identity rows (so foreign keys can be re-linked)
 *   - Campaigns + CampaignTopics + CampaignKeywords
 *   - WordpressIntegration + WordpressPublishLog
 *   - GenerationJob (the topic-level table; legacy GenerationJobPage is dropped)
 *   - GoogleSearchConsoleConnection
 *
 * Output: a single JSON file at scripts/backup/blogs-<timestamp>.json
 * Run:    pnpm tsx scripts/backup-blogs.ts
 *
 * Uses the OLD Prisma client (generated/prisma) so it must be run BEFORE the
 * schema migration. After migration, restore with `restore-blogs.ts`.
 */

import 'dotenv/config';
import { PrismaClient } from '../generated/prisma';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const prisma = new PrismaClient();

async function main() {
  const outDir = join(__dirname, 'backup');
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outFile = join(outDir, `blogs-${stamp}.json`);

  console.log('[backup] reading retained tables…');

  const [
    users,
    domains,
    campaigns,
    campaignTopics,
    campaignKeywords,
    wordpressIntegrations,
    wordpressPublishLogs,
    generationJobs,
    gscConnections,
  ] = await Promise.all([
    (prisma as any).user.findMany(),
    (prisma as any).domain.findMany(),
    (prisma as any).campaign.findMany(),
    (prisma as any).campaignTopic.findMany(),
    (prisma as any).campaignKeyword.findMany(),
    (prisma as any).wordpressIntegration.findMany(),
    (prisma as any).wordpressPublishLog.findMany(),
    (prisma as any).generationJob.findMany(),
    (prisma as any).googleSearchConsoleConnection.findMany(),
  ]);

  const payload = {
    schemaVersion: 2,
    backedUpAt: new Date().toISOString(),
    counts: {
      users: users.length,
      domains: domains.length,
      campaigns: campaigns.length,
      campaignTopics: campaignTopics.length,
      campaignKeywords: campaignKeywords.length,
      wordpressIntegrations: wordpressIntegrations.length,
      wordpressPublishLogs: wordpressPublishLogs.length,
      generationJobs: generationJobs.length,
      gscConnections: gscConnections.length,
    },
    data: {
      users,
      domains,
      campaigns,
      campaignTopics,
      campaignKeywords,
      wordpressIntegrations,
      wordpressPublishLogs,
      generationJobs,
      gscConnections,
    },
  };

  writeFileSync(outFile, JSON.stringify(payload, null, 2));
  console.log(`[backup] wrote ${outFile}`);
  console.log('[backup] counts:', payload.counts);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('[backup] failed:', err);
  process.exit(1);
});
