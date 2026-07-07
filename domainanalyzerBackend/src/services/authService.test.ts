import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import { createPrismaMock, PrismaMock } from '../testSupport/prismaMock';
import { authEnv } from '../config/authEnv';

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
  role?: string;
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
      ...(input.role ? { role: input.role } : {}),
    },
  });
};

describe('authService.login', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T12:00:00.000Z'));
    resetPrisma();
  });

  afterEach(() => {
    vi.useRealTimers();
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
      emailVerified: true,
      role: 'user',
    });
    expect(result.token).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();

    const refreshRows = state.prisma!.__stores.refreshToken.all();
    expect(refreshRows).toHaveLength(1);
    expect(refreshRows[0].expiresAt.getTime()).toBe(
      Date.now() + authEnv.REFRESH_TOKEN_TTL_MINUTES * 60 * 1000,
    );
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
    expect(result.user?.role).toBe('user');
  });

  it('keeps an admin user flagged as admin in both payload and JWT', async () => {
    const user = await createUser({
      email: 'admin@example.com',
      password: 'password123',
      emailVerified: true,
      role: 'admin',
    });

    const result = await authService.login({
      email: 'admin@example.com',
      password: 'password123',
    });

    expect(result.user).toEqual({
      id: user.id,
      email: 'admin@example.com',
      name: undefined,
      emailVerified: true,
      role: 'admin',
    });

    const decoded = jwt.verify(result.token!, authEnv.JWT_SECRET) as { role?: string };
    expect(decoded.role).toBe('admin');
  });

  it('rotates refresh tokens and keeps the 1-day TTL on the child token', async () => {
    await createUser({
      email: 'rotate@example.com',
      password: 'password123',
      emailVerified: true,
    });

    const loginResult = await authService.login({
      email: 'rotate@example.com',
      password: 'password123',
    });

    vi.setSystemTime(new Date('2026-06-15T12:08:00.000Z'));
    const refreshResult = await authService.refreshAccessToken(loginResult.refreshToken!);

    expect(refreshResult.token).toBeTruthy();
    expect(refreshResult.refreshToken).toBeTruthy();

    const refreshRows = state.prisma!.__stores.refreshToken.all();
    expect(refreshRows).toHaveLength(2);

    const parent = refreshRows.find((row) => row.revokedAt !== null);
    const child = refreshRows.find((row) => row.revokedAt === null);

    expect(parent).toBeTruthy();
    expect(child).toBeTruthy();
    expect(child?.expiresAt.getTime()).toBe(
      Date.now() + authEnv.REFRESH_TOKEN_TTL_MINUTES * 60 * 1000,
    );
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
