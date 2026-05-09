const jwt = require('jsonwebtoken');
require('dotenv/config');
const { PrismaClient } = require('../generated/prisma');

(async () => {
  const prisma = new PrismaClient();
  const id = process.argv[2] || '173';
  const dom = await prisma.domain.findUnique({ where: { id: Number(id) }, select: { id: true, host: true, userId: true } });
  console.log('domain owner', dom);
  const user = await prisma.user.findUnique({ where: { id: dom.userId } });
  console.log('user', { id: user.id, email: user.email });
  const SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
  const token = jwt.sign({ userId: user.id, email: user.email }, SECRET, { expiresIn: '1h' });
  const res = await fetch(`http://localhost:3002/api/wizard/domain/${id}/report`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log('\nstatus', res.status);
  const json = await res.json();
  console.log(JSON.stringify(json, null, 2));
  await prisma.$disconnect();
})().catch(e => { console.error(e); process.exit(1); });
