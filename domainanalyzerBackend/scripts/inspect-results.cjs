/**
 * Drill into a single domain's run results to see what the LLMs actually
 * said vs how the scorer scored them. Surfaces the gap between "the brand
 * was clearly mentioned" and "presence: 0" so we can debug the scorer.
 */
require('dotenv/config');
const { PrismaClient } = require('../generated/prisma');

(async () => {
  const prisma = new PrismaClient();
  const domainId = Number(process.argv[2]);
  if (!domainId) {
    console.error('usage: node scripts/inspect-results.cjs <domainId>');
    process.exit(1);
  }
  const domain = await prisma.domain.findUnique({ where: { id: domainId } });
  console.log(`Domain ${domain.id}  ${domain.host}`);

  const run = await prisma.aiRun.findFirst({
    where: { domainId, status: 'completed' },
    orderBy: { startedAt: 'desc' },
  });
  console.log(`Latest run #${run.id}\n`);

  const results = await prisma.aiQueryResult.findMany({
    where: { runId: run.id },
    include: { prompt: { select: { text: true, category: true, isBranded: true } } },
    orderBy: { id: 'asc' },
  });

  for (const r of results) {
    const p = r.prompt;
    console.log('═'.repeat(100));
    console.log(`#${r.id}  model=${r.model}  category=${p.category}  branded=${p.isBranded}`);
    console.log(`PROMPT: ${p.text}`);
    console.log(`SCORE:  presence=${r.presence}  relevance=${r.relevance}  sentiment=${r.sentiment}  overall=${r.overall}`);
    console.log(`SUMMARY: ${r.scorerSummary ?? '(none)'}`);
    console.log(`COMPETITORS MENTIONED: ${JSON.stringify(r.competitorHosts ?? [])}`);
    console.log(`CITATIONS (${Array.isArray(r.citations) ? r.citations.length : 0}):`);
    if (Array.isArray(r.citations)) {
      r.citations.slice(0, 5).forEach((c) => console.log(`  → ${c.host ?? '?'} ${c.url ?? ''}`));
    }
    console.log(`\nRESPONSE (first 1500 chars):`);
    console.log(r.response.slice(0, 1500));
    console.log('');
  }

  await prisma.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
