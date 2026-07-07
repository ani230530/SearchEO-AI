const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 12;

function readAdminSeedConfig(env = process.env) {
  const email = String(env.SEED_ADMIN_EMAIL || '').trim().toLowerCase();
  const password = String(env.SEED_ADMIN_PASSWORD || '');
  const name = String(env.SEED_ADMIN_NAME || '').trim() || undefined;

  if (!email) {
    throw new Error('SEED_ADMIN_EMAIL is required to seed the admin account');
  }
  if (!password) {
    throw new Error('SEED_ADMIN_PASSWORD is required to seed the admin account');
  }

  return { email, password, name };
}

async function seedAdminAccount(prismaClient, config) {
  if (!prismaClient || !prismaClient.user || typeof prismaClient.user.upsert !== 'function') {
    throw new Error('A Prisma client with user.upsert is required');
  }

  const hashedPassword = await bcrypt.hash(config.password, SALT_ROUNDS);

  const user = await prismaClient.user.upsert({
    where: { email: config.email },
    create: {
      email: config.email,
      password: hashedPassword,
      name: config.name,
      role: 'admin',
      emailVerified: true,
      passwordChangedAt: new Date(),
    },
    update: {
      password: hashedPassword,
      role: 'admin',
      emailVerified: true,
      ...(config.name ? { name: config.name } : {}),
      passwordChangedAt: new Date(),
    },
    select: {
      id: true,
      email: true,
      role: true,
      emailVerified: true,
      name: true,
    },
  });

  return user;
}

async function main() {
  const { PrismaClient } = require('../generated/prisma');
  const prismaClient = new PrismaClient();

  try {
    const config = readAdminSeedConfig(process.env);
    const user = await seedAdminAccount(prismaClient, config);
    console.log(`[seed] admin account ready: ${user.email} (${user.role})`);
  } finally {
    if (typeof prismaClient.$disconnect === 'function') {
      await prismaClient.$disconnect();
    }
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('[seed] failed to seed admin account:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

module.exports = {
  readAdminSeedConfig,
  seedAdminAccount,
  main,
};
