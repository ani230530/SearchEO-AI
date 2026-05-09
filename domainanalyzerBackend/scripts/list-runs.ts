/**
 * Compute the /report response shape locally and print it. Lets us see what
 * the dashboard would receive without going through HTTP/auth.
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
        where: { runs: { some: { status: 'completed' } } },
        orderBy: { updatedAt: 'desc' },
        include: { profile: true, inferred: true },
      });

  if (!domain) {
    console.log('No domain with completed run');
    await prisma.$disconnect();
    return;
  }

  console.log(`\n══ /report shape for domain ${domain.id} (${domain.host})`);

  const [latestRun, allResults, keywords, prompts] = await Promise.all([
    prisma.aiRun.findFirst({
      where: { domainId: domain.id, status: 'completed' },
      orderBy: { startedAt: 'desc' },
    }),
    prisma.aiQueryResult.findMany({
      where: { run: { domainId: domain.id, status: 'completed' } },
    }),
    prisma.keyword.findMany({ where: { domainId: domain.id, isSelected: true } }),
    prisma.prompt.findMany({ where: { domainId: domain.id, isSelected: true } }),
  ]);

  console.log('  selected keywords:', keywords.length);
  console.log('  selected prompts: ', prompts.length);
  console.log('  AiQueryResult rows for run:', allResults.length);
  console.log('  latestRun:', latestRun?.id, latestRun?.status);

  const summary = (latestRun?.summary as Record<string, unknown> | null) ?? null;
  console.log('  summary.presenceRate:', summary?.presenceRate);
  console.log('  summary.avgOverall:', summary?.avgOverall);
  console.log('  summary.avgSentiment:', summary?.avgSentiment);
  const perModel = (summary?.perModel as Record<string, any>) ?? {};
  console.log('  summary.perModel keys:', Object.keys(perModel));
  for (const [m, v] of Object.entries(perModel)) {
    console.log(`    ${m}: presence=${v.presenceRate}  avgOverall=${v.avgOverall}  queries=${v.queries}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
