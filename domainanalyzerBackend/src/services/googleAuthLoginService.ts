import { google } from 'googleapis';
import crypto from 'crypto';
import { authEnv } from '../config/authEnv';

export const GOOGLE_AUTH_CONFIG_ERROR = 'Google OAuth credentials not configured';

export interface GoogleAuthProfile {
  googleId: string;
  email: string;
  emailVerified: boolean;
  name?: string | null;
}

const GOOGLE_CODE_CACHE_TTL_MS = 2 * 60 * 1000;
const googleCodeExchangeCache = new Map<
  string,
  { expiresAt: number; promise: Promise<GoogleAuthProfile> }
>();

function createOAuth2Client() {
  return new google.auth.OAuth2(
    authEnv.GOOGLE_CLIENT_ID,
    authEnv.GOOGLE_CLIENT_SECRET,
    authEnv.GOOGLE_AUTH_REDIRECT_URI,
  );
}

function googleCodeCacheKey(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

async function exchangeGoogleAuthCodeWithGoogle(code: string): Promise<GoogleAuthProfile> {
  const oauth2Client = createOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens.access_token) {
    throw new Error('Failed to get Google access token');
  }

  oauth2Client.setCredentials(tokens);
  const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
  const userInfo = await oauth2.userinfo.get();
  const email = userInfo.data.email?.trim().toLowerCase();
  const googleId = userInfo.data.id;

  if (!email) {
    throw new Error('Google account did not return an email address');
  }
  if (!googleId) {
    throw new Error('Google account did not return a stable user id');
  }

  return {
    googleId,
    email,
    emailVerified: userInfo.data.verified_email === true,
    name: userInfo.data.name ?? null,
  };
}

export function getGoogleAuthLoginUrl(state: string): string {
  return createOAuth2Client().generateAuthUrl({
    access_type: 'online',
    prompt: 'select_account',
    scope: ['openid', 'email', 'profile'],
    state,
  });
}

export async function exchangeGoogleAuthCode(code: string): Promise<GoogleAuthProfile> {
  const now = Date.now();
  const key = googleCodeCacheKey(code);
  const cached = googleCodeExchangeCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.promise;
  }
  if (cached) {
    googleCodeExchangeCache.delete(key);
  }

  const promise = exchangeGoogleAuthCodeWithGoogle(code).catch((error) => {
    googleCodeExchangeCache.delete(key);
    throw error;
  });
  googleCodeExchangeCache.set(key, {
    expiresAt: now + GOOGLE_CODE_CACHE_TTL_MS,
    promise,
  });
  return promise;
}
