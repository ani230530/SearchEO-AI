require('dotenv/config');
const { PrismaClient } = require('../generated/prisma');
(async () => {
  const prisma = new PrismaClient();
  const allResults = await prisma.aiQueryResult.findMany({ where: { runId: 6 }, select: { promptId: true } });
  const promptIds = [...new Set(allResults.map(r => r.promptId))];
  console.log(`unique promptIds in run #6 results: ${promptIds.length}`, promptIds);
  const prompts = await prisma.prompt.findMany({ where: { id: { in: promptIds } } });
  for (const p of prompts) {
    console.log(`  prompt #${p.id} domainId=${p.domainId} isSelected=${p.isSelected} category=${p.category} keywordId=${p.keywordId} text="${p.text.slice(0, 60)}"`);
  }
  await prisma.$disconnect();
})().catch(e => { console.error(e); process.exit(1); });
