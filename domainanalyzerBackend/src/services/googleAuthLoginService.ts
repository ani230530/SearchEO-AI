import { google } from 'googleapis';

export const GOOGLE_AUTH_CONFIG_ERROR = 'Google OAuth credentials not configured';

export interface GoogleAuthProfile {
  email: string;
  emailVerified: boolean;
  name?: string | null;
}

function createOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID_SIGNIN;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET_SIGNIN;
  const redirectUri =
    process.env.GOOGLE_AUTH_REDIRECT_URI ||
    'http://localhost:3002/api/auth/google/auth-callback';

  console.log('[GoogleAuthLogin] Creating client with:', {
    clientId: clientId?.substring(0, 20) + '...',
    redirectUri
  });

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function getGoogleAuthLoginUrl(state: string): string {
  if (!process.env.GOOGLE_CLIENT_ID_SIGNIN || !process.env.GOOGLE_CLIENT_SECRET_SIGNIN) {
    throw new Error(GOOGLE_AUTH_CONFIG_ERROR);
  }

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

  if (!email) {
    throw new Error('Google account did not return an email address');
  }

  return {
    email,
    emailVerified: userInfo.data.verified_email === true,
    name: userInfo.data.name ?? null,
  };
}
