/**
 * Direct test of analyticsService against real DB data — bypasses HTTP.
 * Run via:  npx ts-node --transpile-only scripts/probe-direct.ts <domainId>
 */
import 'dotenv/config';
import { PrismaClient } from '../generated/prisma';
import { computePhraseVisibility, computeOpportunities } from '../src/wizard/analyticsService';

const TARGET = parseInt(process.argv[2] ?? '178', 10);

(async () => {
  const prisma = new PrismaClient();
  const domain = await prisma.domain.findUnique({ where: { id: TARGET } });
  if (!domain) { console.error('domain not found'); process.exit(1); }
  console.log(`Probing domain ${domain.id} (${domain.host})`);

  // Latest completed run for this domain
  const run = await prisma.aiRun.findFirst({
    where: { domainId: domain.id, status: 'completed' },
    orderBy: { startedAt: 'desc' },
  });
  if (!run) { console.error('no completed run'); process.exit(1); }
  console.log(`Latest completed run: #${run.id}`);

  const allResults = await prisma.aiQueryResult.findMany({ where: { runId: run.id } });
  console.log(`AiQueryResults: ${allResults.length}, withPresence: ${allResults.filter(r => r.presence > 0).length}`);

  const promptIdsInResults = new Set(allResults.map(r => r.promptId));
  const prompts = await prisma.prompt.findMany({
    where: { id: { in: Array.from(promptIdsInResults) } },
  });
  console.log(`queriedPrompts: ${prompts.length}`);

  const keywordIds = new Set<number>();
  for (const p of prompts) if (p.keywordId) keywordIds.add(p.keywordId);
  const keywords = await prisma.keyword.findMany({
    where: { id: { in: Array.from(keywordIds) } },
  });
  console.log(`keywords: ${keywords.length}`);

  const selectedCompetitors = await prisma.competitor.findMany({
    where: { domainId: domain.id, isSelected: true },
    select: { competitorHost: true },
  });
  const selectedHosts = selectedCompetitors.map(c => c.competitorHost);
  console.log(`selectedCompetitors: ${selectedHosts.length} -> ${selectedHosts.join(', ')}`);

  // Sample one result to see what's in competitorMentions/competitorHosts
  if (allResults.length > 0) {
    const r = allResults[0];
    console.log('\nSAMPLE RESULT:');
    console.log('  promptId:', r.promptId, 'model:', r.model, 'presence:', r.presence, 'rankPosition:', r.rankPosition);
    console.log('  competitorMentions:', JSON.stringify(r.competitorMentions).slice(0, 300));
    console.log('  competitorHosts:', JSON.stringify(r.competitorHosts).slice(0, 200));
  }

  const inferred = (domain as any).inferred as { companyName?: string } | null;
  const input = {
    ownDomainHost: domain.host,
    ownBrandName: inferred?.companyName ?? null,
    selectedCompetitorHosts: selectedHosts,
    keywords: keywords.map(k => ({ id: k.id, term: k.term, intent: k.intent })),
    prompts: prompts.map(p => ({
      id: p.id, text: p.text, intent: p.intent, keywordId: p.keywordId,
      category: p.category, intentStage: p.intentStage, persona: p.persona,
      useCase: p.useCase, isBranded: p.isBranded, competitorMentioned: p.competitorMentioned,
    })),
    results: allResults.map(r => ({
      id: r.id, promptId: r.promptId, model: r.model, presence: r.presence,
      overall: r.overall, sentiment: r.sentiment, rankPosition: r.rankPosition,
      competitorMentions: r.competitorMentions, competitorHosts: r.competitorHosts,
      citations: r.citations,
    })),
  };

  const pv = computePhraseVisibility(input);
  console.log(`\nPHRASE VISIBILITY: ${pv.length} rows`);
  if (pv.length > 0) {
    const counts = { won: 0, at_risk: 0, lost: 0 } as Record<string, number>;
    for (const v of pv) counts[v.status] = (counts[v.status] ?? 0) + 1;
    console.log('  status:', counts);
    console.log('  sample:', JSON.stringify(pv[0], null, 2).slice(0, 600));
  }

  const opps = computeOpportunities(input, pv);
  console.log(`\nOPPORTUNITIES (heuristic): ${opps.length} rows`);
  if (opps.length > 0) {
    console.log('  sample:', JSON.stringify(opps[0], null, 2).slice(0, 600));
  }

  await prisma.$disconnect();
})().catch(e => { console.error(e); process.exit(1); });
