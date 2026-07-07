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

function withoutTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function assertNoLocalhostRedirect(name: string, value: string): void {
  if (process.env.NODE_ENV !== 'production') return;
  let hostname = '';
  try {
    hostname = new URL(value).hostname;
  } catch {
    throw new Error(`[authEnv] ${name} must be a valid absolute URL (got ${value})`);
  }
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    throw new Error(
      `[authEnv] ${name} points to localhost in production. ` +
        `Set ${name}=https://<backend-host>/api/auth/google/auth-callback ` +
        'or set BACKEND_PUBLIC_URL=https://<backend-host>.',
    );
  }
}

function optionalPositiveInteger(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`[authEnv] ${name} must be a positive integer (got ${raw})`);
  }

  return parsed;
}

const JWT_SECRET = required('JWT_SECRET', { minLength: 32 });
const JWT_REFRESH_SECRET = required('JWT_REFRESH_SECRET', { minLength: 32 });
if (JWT_REFRESH_SECRET === JWT_SECRET) {
  throw new Error('[authEnv] JWT_REFRESH_SECRET must differ from JWT_SECRET');
}

const rawBackendPublicUrl = process.env.BACKEND_PUBLIC_URL?.trim();
const BACKEND_PUBLIC_URL = withoutTrailingSlash(
  rawBackendPublicUrl || `http://localhost:${Number(process.env.PORT) || 3002}`,
);

function defaultGoogleAuthRedirectUri(): string {
  if (rawBackendPublicUrl) {
    return `${BACKEND_PUBLIC_URL}/api/auth/google/auth-callback`;
  }

  const connectorRedirect = process.env.GOOGLE_REDIRECT_URI?.trim();
  if (connectorRedirect) {
    try {
      const url = new URL(connectorRedirect);
      const authPath = url.pathname.replace(
        /\/api\/auth\/google\/callback\/?$/,
        '/api/auth/google/auth-callback',
      );
      if (authPath !== url.pathname) {
        url.pathname = authPath;
        url.search = '';
        url.hash = '';
        return url.toString();
      }
    } catch {
      // Fall through to the localhost/dev default below. Invalid explicit
      // auth redirect values are still validated by assertNoLocalhostRedirect.
    }
  }

  return `${BACKEND_PUBLIC_URL}/api/auth/google/auth-callback`;
}

const GOOGLE_AUTH_REDIRECT_URI = optional(
  'GOOGLE_AUTH_REDIRECT_URI',
  defaultGoogleAuthRedirectUri(),
);
assertNoLocalhostRedirect('GOOGLE_AUTH_REDIRECT_URI', GOOGLE_AUTH_REDIRECT_URI);

export const authEnv = {
  JWT_SECRET,
  JWT_REFRESH_SECRET,
  ACCESS_TOKEN_TTL: optional('ACCESS_TOKEN_TTL', '15m'),
  REFRESH_TOKEN_TTL_MINUTES: optionalPositiveInteger('REFRESH_TOKEN_TTL_MINUTES', 24 * 60),

  FRONTEND_URL: optional('FRONTEND_URL', 'http://localhost:8080'),
  BACKEND_PUBLIC_URL,

  GOOGLE_CLIENT_ID: required('GOOGLE_CLIENT_ID'),
  GOOGLE_CLIENT_SECRET: required('GOOGLE_CLIENT_SECRET'),
  GOOGLE_AUTH_REDIRECT_URI,

  // Resend — preferred over SMTP because outbound SMTP is blocked or
  // unreliable on most hosts (Render, Vercel, Fly). RESEND_API_KEY is
  // required at boot; EMAIL_FROM must be an address on a verified domain
  // (or use onboarding@resend.dev for dev — only sends to your own inbox).
  RESEND_API_KEY: required('RESEND_API_KEY'),
  EMAIL_FROM: required('EMAIL_FROM'),
} as const;

export type AuthEnv = typeof authEnv;
