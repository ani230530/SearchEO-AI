/**
 * End-to-end snapshot for the most recently run domain — surfaces crawl,
 * competitors, prompts, run summary, and a few sample query results so we can
 * see whether scoring + citations + competitor mentions worked.
 */

import 'dotenv/config';
import { PrismaClient } from '../generated/prisma';

const prisma = new PrismaClient();

async function main() {
  const arg = process.argv[2];
  const domain = arg
    ? await prisma.domain.findUnique({
        where: { id: Number(arg) },
        include: { profile: true, inferred: true },
      })
    : await prisma.domain.findFirst({
        orderBy: { updatedAt: 'desc' },
        include: { profile: true, inferred: true },
      });

  if (!domain) {
    console.log('No domain found');
    await prisma.$disconnect();
    return;
  }

  console.log(`\n══ Domain ${domain.id}  ${domain.host}  (${domain.url})`);

  const run = await prisma.aiRun.findFirst({
    where: { domainId: domain.id },
    orderBy: { startedAt: 'desc' },
  });
  if (!run) {
    console.log('  → no AiRun yet');
    await prisma.$disconnect();
    return;
  }

  console.log(`\n── Latest AiRun #${run.id}  status=${run.status}  startedAt=${run.startedAt.toISOString()}`);

  const summary = run.summary as Record<string, unknown> | null;
  if (summary) {
    console.log(`     totalQueries     = ${summary.totalQueries}`);
    console.log(`     models           = ${JSON.stringify(summary.models)}`);
    console.log(`     presenceRate     = ${summary.presenceRate}`);
    console.log(`     avgOverall       = ${summary.avgOverall}`);
    console.log(`     avgSentiment     = ${summary.avgSentiment}`);
    console.log(`     perModel         = ${JSON.stringify(summary.perModel, null, 2).split('\n').slice(0, 8).join('\n')}`);
    if (Array.isArray(summary.competitors) && summary.competitors.length) {
      console.log(`     competitors (${(summary.competitors as unknown[]).length}):`);
      for (const c of (summary.competitors as Array<Record<string, unknown>>).slice(0, 8)) {
        console.log(`       - ${c.host}  mentions=${c.mentions}  sentiment=${c.avgSentiment}  share=${c.shareOfVoice}`);
      }
    }
    if (Array.isArray(summary.topCitedDomains) && summary.topCitedDomains.length) {
      console.log(`     topCitedDomains (${(summary.topCitedDomains as unknown[]).length}):`);
      for (const c of (summary.topCitedDomains as Array<Record<string, unknown>>).slice(0, 8)) {
        console.log(`       - ${c.host}  count=${c.count}`);
      }
    }
    const crawled = summary.crawled as Record<string, unknown> | undefined;
    if (crawled) {
      console.log(`     crawled.pagesScanned = ${crawled.pagesScanned}`);
      console.log(`     crawled.pages (first 3):`);
      const pages = Array.isArray(crawled.pages) ? (crawled.pages as Array<Record<string, unknown>>) : [];
      for (const p of pages.slice(0, 3)) console.log(`       - ${p.url}  title=${(p.title ?? '').toString().slice(0, 80)}`);
    }
  }

  // Sample 6 query results across models for one prompt
  const samplePrompt = await prisma.prompt.findFirst({ where: { domainId: domain.id, isSelected: true } });
  if (samplePrompt) {
    const results = await prisma.aiQueryResult.findMany({
      where: { runId: run.id, promptId: samplePrompt.id },
      orderBy: { model: 'asc' },
    });
    console.log(`\n── Sample prompt #${samplePrompt.id}: "${samplePrompt.text.slice(0, 100)}"`);
    for (const r of results) {
      const cits = Array.isArray(r.citations) ? (r.citations as unknown[]).length : 0;
      const cMentions = Array.isArray(r.competitorMentions) ? (r.competitorMentions as unknown[]).length : 0;
      const cHosts = Array.isArray(r.competitorHosts) ? (r.competitorHosts as unknown[]).join(',') : '';
      console.log(`     ${r.model.padEnd(20)}  presence=${r.presence}  overall=${r.overall.toFixed(1)}  sent=${r.sentiment}  cits=${cits}  competitors=${cMentions} (${cHosts})  ${r.latencyMs}ms`);
    }
  }

  // Aggregate counts
  const totals = await prisma.aiQueryResult.groupBy({
    by: ['model'],
    where: { runId: run.id },
    _count: { _all: true },
    _avg: { overall: true, sentiment: true, presence: true },
  });
  console.log(`\n── Per-model totals across the run:`);
  for (const t of totals) {
    console.log(`     ${t.model.padEnd(20)}  count=${t._count._all}  avgOverall=${t._avg.overall?.toFixed(2)}  avgSent=${t._avg.sentiment?.toFixed(2)}  presence=${t._avg.presence?.toFixed(2)}`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
