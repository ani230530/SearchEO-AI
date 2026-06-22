import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const REQUIRED_KEYS = [
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'RESEND_API_KEY',
  'EMAIL_FROM',
] as const;
const TRACKED_KEYS = [
  ...REQUIRED_KEYS,
  'REFRESH_TOKEN_TTL_MINUTES',
  'BACKEND_PUBLIC_URL',
  'GOOGLE_AUTH_REDIRECT_URI',
  'NODE_ENV',
  'PORT',
] as const;

const ORIGINAL_VALUES = new Map<string, string | undefined>();

function seedRequiredAuthEnv(extra: Record<string, string | undefined> = {}) {
  for (const key of TRACKED_KEYS) {
    if (!ORIGINAL_VALUES.has(key)) {
      ORIGINAL_VALUES.set(key, process.env[key]);
    }
  }

  process.env.JWT_SECRET = 'a'.repeat(32);
  process.env.JWT_REFRESH_SECRET = 'b'.repeat(32);
  process.env.GOOGLE_CLIENT_ID = 'google-client-id';
  process.env.GOOGLE_CLIENT_SECRET = 'google-client-secret';
  process.env.RESEND_API_KEY = 'resend-api-key';
  process.env.EMAIL_FROM = 'ops@example.com';

  delete process.env.REFRESH_TOKEN_TTL_MINUTES;
  delete process.env.BACKEND_PUBLIC_URL;
  delete process.env.GOOGLE_AUTH_REDIRECT_URI;
  delete process.env.NODE_ENV;
  delete process.env.PORT;

  for (const [key, value] of Object.entries(extra)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function restoreEnv() {
  for (const key of TRACKED_KEYS) {
    const original = ORIGINAL_VALUES.get(key);
    if (original === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = original;
    }
  }
}

beforeEach(() => {
  seedRequiredAuthEnv();
});

afterEach(() => {
  restoreEnv();
  vi.resetModules();
});

describe('authEnv', () => {
  it('defaults the refresh-token TTL to 1 day', async () => {
    vi.resetModules();
    const { authEnv } = await import('./authEnv');
    expect(authEnv.REFRESH_TOKEN_TTL_MINUTES).toBe(24 * 60);
  });

  it('accepts an explicit minute-based refresh-token TTL', async () => {
    process.env.REFRESH_TOKEN_TTL_MINUTES = '22';
    vi.resetModules();
    const { authEnv } = await import('./authEnv');
    expect(authEnv.REFRESH_TOKEN_TTL_MINUTES).toBe(22);
  });

  it('rejects invalid refresh-token TTL values', async () => {
    process.env.REFRESH_TOKEN_TTL_MINUTES = 'not-a-number';
    vi.resetModules();
    await expect(import('./authEnv')).rejects.toThrow(
      /REFRESH_TOKEN_TTL_MINUTES must be a positive integer/i,
    );
  });

  it('derives the Google auth callback from BACKEND_PUBLIC_URL', async () => {
    process.env.NODE_ENV = 'production';
    process.env.BACKEND_PUBLIC_URL = 'https://myapibackend.girlpowerx.com/';
    vi.resetModules();
    const { authEnv } = await import('./authEnv');
    expect(authEnv.GOOGLE_AUTH_REDIRECT_URI).toBe(
      'https://myapibackend.girlpowerx.com/api/auth/google/auth-callback',
    );
  });

  it('rejects localhost Google auth callbacks in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.GOOGLE_AUTH_REDIRECT_URI = 'http://localhost:3002/api/auth/google/auth-callback';
    vi.resetModules();
    await expect(import('./authEnv')).rejects.toThrow(/points to localhost in production/i);
  });
});
