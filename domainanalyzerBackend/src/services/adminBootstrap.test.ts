import { describe, expect, it, vi } from 'vitest';
import { createPrismaMock } from '../testSupport/prismaMock';

vi.mock('../lib/prisma', () => ({
  prisma: createPrismaMock(),
}));

describe('admin bootstrap', () => {
  it('returns null when no admin seed env vars are present', async () => {
    const { seedAdminAccountOnStartup } = await import('./adminBootstrap');
    const result = await seedAdminAccountOnStartup({});
    expect(result).toBeNull();
  });

  it('seeds an admin account from env vars', async () => {
    const { seedAdminAccountOnStartup } = await import('./adminBootstrap');
    const env = {
      SEED_ADMIN_EMAIL: 'ADMIN@Example.com',
      SEED_ADMIN_PASSWORD: 'super-secret-password',
      SEED_ADMIN_NAME: 'Admin User',
    };

    const user = await seedAdminAccountOnStartup(env);

    expect(user?.email).toBe('admin@example.com');
    expect(user?.role).toBe('admin');
    expect(user?.emailVerified).toBe(true);
  });
});
