import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as bcrypt from 'bcryptjs';
import { createPrismaMock, PrismaMock } from '../testSupport/prismaMock';

const state = vi.hoisted(() => ({
  prisma: null as PrismaMock | null,
}));

vi.mock('../../generated/prisma', () => ({
  PrismaClient: class {
    constructor() {
      if (!state.prisma) state.prisma = createPrismaMock();
      return state.prisma;
    }
  },
}));

import { authService } from './authService';

const resetPrisma = () => {
  if (!state.prisma) state.prisma = createPrismaMock();
  for (const store of Object.values(state.prisma.__stores)) {
    store.rows.clear();
  }
  return state.prisma;
};

const createUser = async (input: {
  email: string;
  password: string;
  emailVerified: boolean;
}) => {
  const hashedPassword = await bcrypt.hash(input.password, 12);
  return state.prisma!.user.create({
    data: {
      email: input.email,
      password: hashedPassword,
      name: null,
      emailVerified: input.emailVerified,
      emailVerificationToken: null,
      emailVerificationTokenExpiry: null,
      tokenVersion: 0,
      loginFailureCount: 0,
    },
  });
};

describe('authService.login', () => {
  beforeEach(() => {
    resetPrisma();
  });

  it('logs in a verified user with a valid password', async () => {
    const user = await createUser({
      email: 'verified@example.com',
      password: 'password123',
      emailVerified: true,
    });

    const result = await authService.login({
      email: ' VERIFIED@example.com ',
      password: 'password123',
    });

    expect(result.user).toEqual({
      id: user.id,
      email: 'verified@example.com',
      name: undefined,
    });
    expect(result.token).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
  });

  it('logs in an unverified existing user with a valid password', async () => {
    const user = await createUser({
      email: 'legacy@example.com',
      password: 'password123',
      emailVerified: false,
    });

    const result = await authService.login({
      email: 'legacy@example.com',
      password: 'password123',
    });

    expect(result.user?.id).toBe(user.id);
    expect(result.token).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
  });

  it('rejects an existing user with a wrong password', async () => {
    await createUser({
      email: 'wrong-password@example.com',
      password: 'password123',
      emailVerified: false,
    });

    await expect(
      authService.login({
        email: 'wrong-password@example.com',
        password: 'bad-password',
      })
    ).rejects.toThrow('Invalid email or password');
  });

  it('rejects an unknown email', async () => {
    await expect(
      authService.login({
        email: 'missing@example.com',
        password: 'password123',
      })
    ).rejects.toThrow('Invalid email or password');
  });
});
