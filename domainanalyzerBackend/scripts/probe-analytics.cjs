const jwt = require('jsonwebtoken');
require('dotenv/config');
const { PrismaClient } = require('../generated/prisma');

(async () => {
  const prisma = new PrismaClient();
  // Pick the most recent domain that has at least one completed run.
  const candidate = await prisma.aiRun.findFirst({
    where: { status: 'completed' },
    orderBy: { startedAt: 'desc' },
    include: { domain: { select: { id: true, host: true, userId: true } } },
  });
  if (!candidate) {
    console.log('No completed runs in the DB — start the wizard first.');
    process.exit(0);
  }
  const dom = candidate.domain;
  console.log(`Probing domain ${dom.id} (${dom.host}), run #${candidate.id}`);

  const user = await prisma.user.findUnique({ where: { id: dom.userId } });
  const SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
  const token = jwt.sign({ userId: user.id, email: user.email }, SECRET, { expiresIn: '1h' });

  // 1. /report — confirm phraseVisibility + opportunities + caching path.
  const t0 = Date.now();
  const r1 = await fetch(`http://localhost:3002/api/wizard/domain/${dom.id}/report`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const j1 = await r1.json();
  const dt1 = Date.now() - t0;
  console.log(`\n--- /report (1st call): ${r1.status} in ${dt1}ms ---`);
  console.log(`phraseVisibility: ${(j1.phraseVisibility ?? []).length} rows`);
  console.log(`opportunities:    ${(j1.opportunities ?? []).length} rows`);
  if ((j1.phraseVisibility ?? []).length > 0) {
    const counts = { won: 0, at_risk: 0, lost: 0 };
    for (const v of j1.phraseVisibility) counts[v.status] = (counts[v.status] ?? 0) + 1;
    console.log('  status breakdown:', counts);
    console.log('  sample row:', JSON.stringify(j1.phraseVisibility[0], null, 2).slice(0, 400));
  }
  if ((j1.opportunities ?? []).length > 0) {
    const o = j1.opportunities[0];
    console.log('  sample opportunity:');
    console.log(`    key:              ${o.key}`);
    console.log(`    title:            ${o.title}`);
    console.log(`    severity:         ${o.severity} (${o.severityScore})`);
    console.log(`    trafficPotential: ${o.trafficPotential}`);
    console.log(`    rationale:        ${o.rationale}`);
    console.log(`    recommendedAngle: ${o.recommendedAngle ?? '—'}`);
    if (o.brief) {
      console.log(`    brief.audience:   ${o.brief.audience ?? '—'}`);
      console.log(`    brief.tone:       ${o.brief.tone ?? '—'}`);
      console.log(`    brief.structure:  ${o.brief.structure ?? '—'}`);
      console.log(`    brief.wordCount:  ${o.brief.wordCount ?? '—'}`);
      console.log(`    brief.keyPoints:  ${(o.brief.keyPoints ?? []).length}`);
      if ((o.brief.keyPoints ?? []).length > 0) {
        console.log(`      first: ${o.brief.keyPoints[0]}`);
      }
      console.log(`    brief.cta:        ${o.brief.cta ?? '—'}`);
    }
  }

  // 2. /report (2nd call) — cache hit should be MUCH faster.
  const t1 = Date.now();
  const r2 = await fetch(`http://localhost:3002/api/wizard/domain/${dom.id}/report`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  await r2.json();
  console.log(`\n--- /report (2nd call): ${r2.status} in ${Date.now() - t1}ms (should be << 1st call) ---`);

  // 3. /from-opportunity — idempotency check.
  if ((j1.opportunities ?? []).length > 0) {
    const opp = j1.opportunities[0];
    const buildBody = {
      domainId: dom.id,
      opportunityKey: opp.key,
      title: opp.title,
      rationale: opp.rationale,
      primaryKeyword: opp.primaryKeyword,
      longtailKeywords: opp.longtailKeywords ?? [],
      suggestedTemplate: opp.suggestedTemplate ?? 'blog',
      recommendedAngle: opp.recommendedAngle,
      brief: opp.brief,
    };
    const b1 = await fetch('http://localhost:3002/api/campaigns/topics/from-opportunity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(buildBody),
    });
    const bj1 = await b1.json();
    console.log(`\n--- /from-opportunity (1st): ${b1.status}`);
    console.log(`  topicId=${bj1.topicId} reused=${bj1.reused}`);
    const b2 = await fetch('http://localhost:3002/api/campaigns/topics/from-opportunity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(buildBody),
    });
    const bj2 = await b2.json();
    console.log(`--- /from-opportunity (2nd, idempotency check): ${b2.status}`);
    console.log(`  topicId=${bj2.topicId} reused=${bj2.reused} (expect reused=true, same topicId)`);
    // Verify the topic actually got the keywords.
    const topic = await prisma.campaignTopic.findUnique({
      where: { id: bj1.topicId },
      include: { keywords: true },
    });
    console.log(`  topic title:       "${topic.title}"`);
    console.log(`  topic description: ${(topic.description ?? '').slice(0, 200)}…`);
    console.log(`  topic keywords:    ${topic.keywords.length}`);
    for (const k of topic.keywords.slice(0, 5)) {
      const kind = k.aiMetadata?.isPrimary ? 'PRIMARY' : k.aiMetadata?.isLongtail ? 'longtail' : '?';
      console.log(`    - [${kind}] ${k.term}`);
    }
    const briefStash = topic.aiMetadata?.brief;
    if (briefStash) {
      console.log(`  brief stashed on aiMetadata: yes (audience="${briefStash.audience ?? '—'}", structure="${briefStash.structure ?? '—'}")`);
    } else {
      console.log(`  brief stashed on aiMetadata: NO (regression!)`);
    }
  }

  await prisma.$disconnect();
})().catch(e => { console.error(e); process.exit(1); });
