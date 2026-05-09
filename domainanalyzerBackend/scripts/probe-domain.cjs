const jwt = require('jsonwebtoken');
require('dotenv/config');
const { PrismaClient } = require('../generated/prisma');

const TARGET_DOMAIN_ID = parseInt(process.argv[2] ?? '178', 10);

(async () => {
  const prisma = new PrismaClient();
  const dom = await prisma.domain.findUnique({ where: { id: TARGET_DOMAIN_ID } });
  if (!dom) { console.error('domain not found'); process.exit(1); }
  console.log(`Probing domain ${dom.id} (${dom.host})`);

  const user = await prisma.user.findUnique({ where: { id: dom.userId } });
  const SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
  const token = jwt.sign({ userId: user.id, email: user.email }, SECRET, { expiresIn: '1h' });

  const t0 = Date.now();
  const r1 = await fetch(`http://localhost:3010/api/wizard/domain/${dom.id}/report`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const j1 = await r1.json();
  const dt1 = Date.now() - t0;
  console.log(`\n--- /report (1st): ${r1.status} in ${dt1}ms ---`);
  console.log(`phraseVisibility: ${(j1.phraseVisibility ?? []).length} rows`);
  console.log(`opportunities:    ${(j1.opportunities ?? []).length} rows`);
  if ((j1.phraseVisibility ?? []).length > 0) {
    const counts = { won: 0, at_risk: 0, lost: 0 };
    for (const v of j1.phraseVisibility) counts[v.status] = (counts[v.status] ?? 0) + 1;
    console.log('  status:', counts);
    console.log('  sample:', JSON.stringify(j1.phraseVisibility[0], null, 2).slice(0, 600));
  }
  if ((j1.opportunities ?? []).length > 0) {
    const o = j1.opportunities[0];
    console.log('  sample opportunity:', JSON.stringify(o, null, 2).slice(0, 800));
  }

  const t1 = Date.now();
  const r2 = await fetch(`http://localhost:3010/api/wizard/domain/${dom.id}/report`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  await r2.json();
  console.log(`\n--- /report (2nd, cache hit): ${r2.status} in ${Date.now() - t1}ms ---`);

  await prisma.$disconnect();
})().catch(e => { console.error(e); process.exit(1); });
