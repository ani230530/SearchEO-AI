// Auth-specific env validator. Imported early in src/index.ts so the
// server refuses to boot when auth secrets are missing, default, or weak.
//
// Intentionally separate from src/config/env.ts because that module
// requires N8N webhook URLs that aren't always present in dev/test —
// validating those at boot would block local dev for unrelated reasons.

import 'dotenv/config';

const KNOWN_INSECURE_DEFAULTS = new Set([
  'your-super-secret-jwt-key-change-in-production',
  'your-32-character-random-key-here',
  'default-key-change-in-production-32chars',
]);

function required(name: string, opts: { minLength?: number } = {}): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`[authEnv] Missing required env var: ${name}`);
  }
  const trimmed = value.trim();
  if (KNOWN_INSECURE_DEFAULTS.has(trimmed)) {
    throw new Error(
      `[authEnv] ${name} is set to a known insecure default. Generate one with:\n` +
        `  node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`,
    );
  }
  if (opts.minLength && trimmed.length < opts.minLength) {
    throw new Error(
      `[authEnv] ${name} must be at least ${opts.minLength} characters (got ${trimmed.length})`,
    );
  }
  return trimmed;
}

function optional(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

const JWT_SECRET = required('JWT_SECRET', { minLength: 32 });
const JWT_REFRESH_SECRET = required('JWT_REFRESH_SECRET', { minLength: 32 });
if (JWT_REFRESH_SECRET === JWT_SECRET) {
  throw new Error('[authEnv] JWT_REFRESH_SECRET must differ from JWT_SECRET');
}

export const authEnv = {
  JWT_SECRET,
  JWT_REFRESH_SECRET,
  ACCESS_TOKEN_TTL: optional('ACCESS_TOKEN_TTL', '15m'),
  REFRESH_TOKEN_TTL_DAYS: Number(process.env.REFRESH_TOKEN_TTL_DAYS) || 30,

  FRONTEND_URL: optional('FRONTEND_URL', 'http://localhost:8080'),
  BACKEND_PUBLIC_URL:
    process.env.BACKEND_PUBLIC_URL?.trim() ||
    `http://localhost:${Number(process.env.PORT) || 3002}`,

  GOOGLE_CLIENT_ID: required('GOOGLE_CLIENT_ID'),
  GOOGLE_CLIENT_SECRET: required('GOOGLE_CLIENT_SECRET'),
  GOOGLE_AUTH_REDIRECT_URI: optional(
    'GOOGLE_AUTH_REDIRECT_URI',
    'http://localhost:3002/api/auth/google/auth-callback',
  ),

  // Resend — preferred over SMTP because outbound SMTP is blocked or
  // unreliable on most hosts (Render, Vercel, Fly). RESEND_API_KEY is
  // required at boot; EMAIL_FROM must be an address on a verified domain
  // (or use onboarding@resend.dev for dev — only sends to your own inbox).
  RESEND_API_KEY: required('RESEND_API_KEY'),
  EMAIL_FROM: required('EMAIL_FROM'),
} as const;

export type AuthEnv = typeof authEnv;
