require('dotenv/config');
const { PrismaClient } = require('../generated/prisma');
(async () => {
  const prisma = new PrismaClient();
  const runs = await prisma.aiRun.findMany({
    where: { status: 'completed' },
    orderBy: { startedAt: 'desc' },
    take: 30,
    include: {
      domain: { select: { id: true, host: true, userId: true } },
      _count: { select: { results: true } },
    },
  });
  console.log(`Found ${runs.length} completed runs.`);
  for (const r of runs) {
    const promptCount = await prisma.prompt.count({ where: { domainId: r.domainId, isSelected: true } });
    const compCount = await prisma.competitor.count({ where: { domainId: r.domainId, isSelected: true } });
    const presenceCount = await prisma.aiQueryResult.count({ where: { runId: r.id, presence: { gt: 0 } } });
    console.log(`run #${r.id} domain=${r.domainId} (${r.domain.host}) selPrompts=${promptCount} selComps=${compCount} qResults=${r._count.results} withPresence=${presenceCount}`);
  }
  await prisma.$disconnect();
})().catch(e => { console.error(e); process.exit(1); });
