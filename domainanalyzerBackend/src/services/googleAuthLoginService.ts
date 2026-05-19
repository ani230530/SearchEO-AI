import { google } from 'googleapis';
import { authEnv } from '../config/authEnv';

export const GOOGLE_AUTH_CONFIG_ERROR = 'Google OAuth credentials not configured';

export interface GoogleAuthProfile {
  googleId: string;
  email: string;
  emailVerified: boolean;
  name?: string | null;
}

function createOAuth2Client() {
  return new google.auth.OAuth2(
    authEnv.GOOGLE_CLIENT_ID,
    authEnv.GOOGLE_CLIENT_SECRET,
    authEnv.GOOGLE_AUTH_REDIRECT_URI,
  );
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
