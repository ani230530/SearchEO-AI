import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';

const SALT_ROUNDS = 12;

export type AdminSeedConfig = {
  email: string;
  password: string;
  name?: string;
};

function readAdminSeedConfig(env = process.env): AdminSeedConfig | null {
  const email = String(env.SEED_ADMIN_EMAIL || '').trim().toLowerCase();
  const password = String(env.SEED_ADMIN_PASSWORD || '');
  const name = String(env.SEED_ADMIN_NAME || '').trim() || undefined;

  if (!email || !password) {
    return null;
  }

  return { email, password, name };
}

export async function seedAdminAccount(prismaClient = prisma, config: AdminSeedConfig) {
  if (!prismaClient?.user || typeof prismaClient.user.upsert !== 'function') {
    throw new Error('A Prisma client with user.upsert is required');
  }

  const hashedPassword = await bcrypt.hash(config.password, SALT_ROUNDS);

  return prismaClient.user.upsert({
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
}

export async function seedAdminAccountOnStartup(env = process.env) {
  const config = readAdminSeedConfig(env);
  if (!config) {
    return null;
  }

  const user = await seedAdminAccount(prisma, config);
  console.log(`[seed] admin account ready: ${user.email} (${user.role})`);
  return user;
}
