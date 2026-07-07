import * as bcrypt from 'bcryptjs';
import { describe, expect, it } from 'vitest';
import { createPrismaMock } from '../testSupport/prismaMock';

async function loadSeedModule() {
  return import('../../prisma/seed.cjs');
}

describe('admin seed flow', () => {
  it('creates one admin user and stays idempotent on rerun', async () => {
    const prisma = createPrismaMock();
    const { readAdminSeedConfig, seedAdminAccount } = await loadSeedModule();

    const config = readAdminSeedConfig({
      SEED_ADMIN_EMAIL: 'ADMIN@Example.com',
      SEED_ADMIN_PASSWORD: 'super-secret-password',
      SEED_ADMIN_NAME: 'Admin User',
    });

    expect(config.email).toBe('admin@example.com');
    expect(config.name).toBe('Admin User');

    const first = await seedAdminAccount(prisma, config);
    expect(first.email).toBe('admin@example.com');
    expect(first.role).toBe('admin');
    expect(first.emailVerified).toBe(true);

    const storedFirst = await prisma.user.findUnique({ where: { email: 'admin@example.com' } });
    expect(storedFirst).toBeTruthy();
    expect(storedFirst?.role).toBe('admin');
    expect(await bcrypt.compare('super-secret-password', storedFirst!.password!)).toBe(true);

    const second = await seedAdminAccount(prisma, config);
    expect(second.id).toBe(first.id);
    expect(prisma.__stores.user.all()).toHaveLength(1);
  });
});
