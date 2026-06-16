import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const REQUIRED_KEYS = [
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'RESEND_API_KEY',
  'EMAIL_FROM',
] as const;

const ORIGINAL_VALUES = new Map<string, string | undefined>();

function seedRequiredAuthEnv(extra: Record<string, string | undefined> = {}) {
  for (const key of REQUIRED_KEYS) {
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

  for (const [key, value] of Object.entries(extra)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function restoreEnv() {
  for (const key of REQUIRED_KEYS) {
    const original = ORIGINAL_VALUES.get(key);
    if (original === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = original;
    }
  }
  delete process.env.REFRESH_TOKEN_TTL_MINUTES;
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
});
