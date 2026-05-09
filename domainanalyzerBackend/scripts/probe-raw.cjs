const jwt = require('jsonwebtoken');
require('dotenv/config');
const { PrismaClient } = require('../generated/prisma');
(async () => {
  const prisma = new PrismaClient();
  const dom = await prisma.domain.findUnique({ where: { id: 178 } });
  const user = await prisma.user.findUnique({ where: { id: dom.userId } });
  const SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
  const token = jwt.sign({ userId: user.id, email: user.email }, SECRET, { expiresIn: '1h' });
  const r = await fetch(`http://localhost:3002/api/wizard/domain/${dom.id}/report`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const j = await r.json();
  console.log('TOP-LEVEL KEYS:', Object.keys(j).sort().join(','));
  console.log('phraseVisibility type:', typeof j.phraseVisibility, 'len:', (j.phraseVisibility ?? []).length);
  console.log('opportunities type:', typeof j.opportunities, 'len:', (j.opportunities ?? []).length);
  console.log('topPrompts len:', (j.topPrompts ?? []).length);
  console.log('totalQueries:', j.totalQueries);
  console.log('mentionRate:', j.mentionRate);
  await prisma.$disconnect();
})();
