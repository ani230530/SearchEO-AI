require('dotenv').config();

const { PrismaClient } = require('../generated/prisma');

const prisma = new PrismaClient();

const GENERIC_ANALYSIS_KEYWORDS = [
  'business analysis',
  'market trends',
  'seo strategy',
  'competitive analysis',
  'industry insights',
  'customer profiling',
  'brand positioning',
  'content strategy',
  'market dynamics',
  'seo opportunities',
  'local seo',
  'market leaders',
  'value proposition',
  'competitive gaps',
  'industry classification',
  'customer journey',
  'geographic scope',
  'solution categories',
  'local market',
  'content themes',
  'market size',
  'decision factors',
  'authority building',
  'direct competitors',
  'indirect competitors',
  'competitive advantages',
  'vulnerability areas',
  'seasonal patterns',
  'cultural considerations',
  'local search behavior',
  'content gaps',
  'keyword opportunities',
  'content opportunities',
  'long-tail opportunities',
  'local seo strategy',
  'market positioning',
  'key benefits',
  'expertise areas',
  'geographic considerations',
];

const shouldDelete = process.argv.includes('--confirm');

async function main() {
  const keywords = await prisma.keyword.findMany({
    where: { term: { in: GENERIC_ANALYSIS_KEYWORDS } },
    select: {
      id: true,
      term: true,
      domainId: true,
      domain: { select: { url: true } },
      _count: {
        select: {
          communityInsights: true,
          communityMiningResults: true,
          generatedIntentPhrases: true,
          intentClassificationResults: true,
          phrases: true,
          searchPatterns: true,
          searchPatternResults: true,
        },
      },
    },
    orderBy: [{ domainId: 'asc' }, { id: 'asc' }],
  });

  const grouped = keywords.reduce((acc, keyword) => {
    const key = `${keyword.domainId || 'no-domain'} ${keyword.domain?.url || 'unknown-domain'}`;
    acc[key] = acc[key] || [];
    acc[key].push(keyword);
    return acc;
  }, {});

  console.log(JSON.stringify({
    mode: shouldDelete ? 'delete' : 'preview',
    totalGenericKeywords: keywords.length,
    affectedDomains: Object.fromEntries(
      Object.entries(grouped).map(([domain, rows]) => [
        domain,
        rows.map((row) => ({
          id: row.id,
          term: row.term,
          relatedRecords: Object.values(row._count).reduce((sum, count) => sum + count, 0),
        })),
      ])
    ),
  }, null, 2));

  if (!shouldDelete) {
    console.log('Preview only. Re-run with --confirm to delete exact generic keyword rows with no related records.');
    return;
  }

  const removableIds = keywords
    .filter((keyword) => Object.values(keyword._count).every((count) => count === 0))
    .map((keyword) => keyword.id);

  const blocked = keywords.filter((keyword) => !removableIds.includes(keyword.id));

  if (blocked.length > 0) {
    console.warn(`Skipped ${blocked.length} generic keywords because they have related records. They are already hidden by the app filter.`);
  }

  if (removableIds.length === 0) {
    console.log('No generic keyword rows were safe to delete.');
    return;
  }

  const result = await prisma.keyword.deleteMany({
    where: { id: { in: removableIds } },
  });

  console.log(`Deleted ${result.count} generic keyword rows.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
