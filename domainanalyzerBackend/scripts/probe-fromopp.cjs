const jwt = require('jsonwebtoken');
require('dotenv/config');
const { PrismaClient } = require('../generated/prisma');

const TARGET = 178;
const BASE = 'http://localhost:3010';

(async () => {
  const prisma = new PrismaClient();
  const dom = await prisma.domain.findUnique({ where: { id: TARGET } });
  const user = await prisma.user.findUnique({ where: { id: dom.userId } });
  const SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
  const token = jwt.sign({ userId: user.id, email: user.email }, SECRET, { expiresIn: '1h' });

  const r1 = await fetch(`${BASE}/api/wizard/domain/${dom.id}/report`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const j1 = await r1.json();
  if (!j1.opportunities || j1.opportunities.length === 0) {
    console.log('No opportunities — abort'); process.exit(1);
  }
  const opp = j1.opportunities[0];
  console.log(`Selected opportunity: ${opp.key} → "${opp.title}"`);

  const body = {
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

  // 1st call — should create
  const b1 = await fetch(`${BASE}/api/campaigns/topics/from-opportunity`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const bj1 = await b1.json();
  console.log(`\n--- /from-opportunity (1st): ${b1.status}`);
  console.log(`  topicId=${bj1.topicId}  reused=${bj1.reused}  campaignId=${bj1.campaignId ?? '?'}`);

  if (b1.status !== 200 && b1.status !== 201) {
    console.log('  body:', JSON.stringify(bj1).slice(0, 500));
    process.exit(1);
  }

  // 2nd call — same body, must reuse
  const b2 = await fetch(`${BASE}/api/campaigns/topics/from-opportunity`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const bj2 = await b2.json();
  console.log(`\n--- /from-opportunity (2nd, idempotent): ${b2.status}`);
  console.log(`  topicId=${bj2.topicId}  reused=${bj2.reused}  (expect topicId=${bj1.topicId} reused=true)`);

  // Verify topic + keywords in DB
  const topic = await prisma.campaignTopic.findUnique({
    where: { id: bj1.topicId },
    include: { keywords: true },
  });
  if (!topic) { console.log('  topic not found in DB'); process.exit(1); }
  console.log(`\n--- DB verification ---`);
  console.log(`  topic title:       "${topic.title}"`);
  console.log(`  topic description: ${(topic.description ?? '').slice(0, 200).replace(/\s+/g, ' ')}…`);
  console.log(`  topic keywords:    ${topic.keywords.length}`);
  for (const k of topic.keywords.slice(0, 5)) {
    const meta = k.aiMetadata || {};
    const kind = meta.isPrimary ? 'PRIMARY' : meta.isLongtail ? 'longtail' : '?';
    console.log(`    - [${kind}] ${k.term}`);
  }
  const briefStash = topic.aiMetadata?.brief;
  if (briefStash) {
    console.log(`  brief stashed: yes (audience="${briefStash.audience ?? '—'}", structure="${briefStash.structure ?? '—'}", wordCount=${briefStash.wordCount ?? '—'})`);
  } else {
    console.log(`  brief stashed: NO`);
  }
  const oppKey = topic.aiMetadata?.opportunityKey;
  console.log(`  opportunityKey on topic.aiMetadata: ${oppKey ?? 'MISSING'}`);

  await prisma.$disconnect();
})().catch(e => { console.error(e); process.exit(1); });
