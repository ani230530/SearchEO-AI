import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { PrismaClient } from '../../generated/prisma';
import { authService } from '../services/authService';
import { authenticateToken } from '../middleware/auth';
import { authEnv } from '../config/authEnv';
import {
  loginLimiter,
  signupLimiter,
  forgotPasswordLimiter,
  resendVerificationLimiter,
  googleAuthLimiter,
} from '../middleware/rateLimit';
import {
  WIZARD_COOKIE_NAME,
  WIZARD_SESSION_HEADER,
  buildClearCookieHeader,
  linkSessionToUser,
  lookupSession,
  parseCookieHeader,
} from '../services/wizardSessionService';
import {
  exchangeGoogleAuthCode,
  getGoogleAuthLoginUrl,
} from '../services/googleAuthLoginService';

const router = Router();
const prisma = new PrismaClient();

// Pulled from the request so refresh tokens know which device they were
// issued for — surfaced later in /sessions UIs and useful for forensic
// analysis when a family is revoked due to reuse detection.
function clientContext(req: Request) {
  const fwd = (req.headers['x-forwarded-for'] || '').toString();
  const ip = fwd.split(',')[0]?.trim() || req.ip || null;
  const userAgent = (req.headers['user-agent'] || '').toString().slice(0, 256) || null;
  return { ip, userAgent };
}

async function maybeLinkWizardSession(req: Request, res: Response, userId: number) {
  try {
    const cookies = parseCookieHeader(req.headers.cookie);
    const rawHeader = req.headers[WIZARD_SESSION_HEADER];
    const headerToken = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
    const token = cookies[WIZARD_COOKIE_NAME] || (typeof headerToken === 'string' ? headerToken.trim() : '');
    if (!token) return null;
    const session = await lookupSession(prisma, token);
    if (!session) return null;
    const result = await linkSessionToUser(prisma, session.id, userId);
    res.setHeader('Set-Cookie', buildClearCookieHeader());
    return result;
  } catch (err) {
    console.warn('[auth/register] wizard session link failed', err);
    return null;
  }
}

function asyncHandler(fn: (req: Request, res: Response, next: any) => Promise<void>) {
  return (req: Request, res: Response, next: any) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// Surface email-format checks consistently. Backend is the source of truth —
// frontend validation can drift but this is what actually rejects bad input.
function isLikelyEmail(s: string): boolean {
  return typeof s === 'string' && /^\S+@\S+\.\S+$/.test(s);
}

// Minimum password policy: 8 chars, at least one letter + one number.
// Intentionally not asking for symbols — NIST 800-63B discourages composition
// rules in favor of length, but a tiny floor catches the worst offenders.
function passwordPolicyError(pw: string): string | null {
  if (typeof pw !== 'string' || pw.length < 8) return 'Password must be at least 8 characters';
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'Password must include a letter and a number';
  return null;
}

// POST /api/auth/register
router.post(
  '/register',
  signupLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password, name } = req.body ?? {};
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }
    if (!isLikelyEmail(email)) {
      res.status(400).json({ error: 'Please provide a valid email address' });
      return;
    }
    const pwErr = passwordPolicyError(password);
    if (pwErr) {
      res.status(400).json({ error: pwErr });
      return;
    }

    try {
      const result = await authService.register({ email, password, name }, clientContext(req));
      let wizardLink = null;
      if (result.user?.id) {
        wizardLink = await maybeLinkWizardSession(req, res, result.user.id);
      }
      res.status(201).json({ ...result, wizardLink });
    } catch (error) {
      if (error instanceof Error && error.message.includes('already exists')) {
        // Neutral copy to discourage email enumeration. UX cost is small —
        // the user can hit "forgot password" if they actually own the email.
        res.status(409).json({
          error: "We couldn't create that account. Try signing in or use a different email.",
        });
        return;
      }
      throw error;
    }
  }),
);

// POST /api/auth/login
router.post(
  '/login',
  loginLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body ?? {};
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }
    try {
      const result = await authService.login({ email, password }, clientContext(req));
      res.json(result);
    } catch (error) {
      if (error instanceof Error && error.message.includes('Invalid email or password')) {
        res.status(401).json({ error: error.message });
        return;
      }
      throw error;
    }
  }),
);

// GET /api/auth/me
router.get('/me', authenticateToken, asyncHandler(async (req: Request, res: Response) => {
  const user = await authService.getUserById(req.user!.userId);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json({ user });
}));

// PUT /api/auth/profile
router.put('/profile', authenticateToken, asyncHandler(async (req: Request, res: Response) => {
  const { name } = req.body ?? {};
  if (name !== undefined && typeof name !== 'string') {
    res.status(400).json({ error: 'Name must be a string' });
    return;
  }
  await authService.updateProfile(req.user!.userId, name);
  res.json({ message: 'Profile updated successfully' });
}));

// PUT /api/auth/password
router.put('/password', authenticateToken, asyncHandler(async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body ?? {};
  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: 'Current password and new password are required' });
    return;
  }
  const pwErr = passwordPolicyError(newPassword);
  if (pwErr) {
    res.status(400).json({ error: pwErr });
    return;
  }
  try {
    await authService.changePassword(req.user!.userId, currentPassword, newPassword);
    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Current password is incorrect')) {
      res.status(400).json({ error: error.message });
      return;
    }
    throw error;
  }
}));

// POST /api/auth/verify — kept for back-compat with frontend AuthContext.verifyToken.
router.post('/verify', asyncHandler(async (req: Request, res: Response) => {
  const { token } = req.body ?? {};
  if (!token) {
    res.status(400).json({ error: 'Token is required' });
    return;
  }
  try {
    const decoded = await authService.verifyToken(token);
    const user = await authService.getUserById(decoded.userId);
    res.json({ valid: true, user });
  } catch {
    res.json({ valid: false, error: 'Invalid token' });
  }
}));

// POST /api/auth/refresh
router.post('/refresh', asyncHandler(async (req: Request, res: Response) => {
  const { refreshToken } = req.body ?? {};
  if (!refreshToken) {
    res.status(400).json({ error: 'Refresh token is required' });
    return;
  }
  try {
    const result = await authService.refreshAccessToken(refreshToken, clientContext(req));
    res.json(result);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('reuse')) {
        // Force re-login on the client; family is already revoked server-side.
        res.status(401).json({ error: 'Session compromised — please sign in again', code: 'REFRESH_REUSE' });
        return;
      }
      if (
        error.message.includes('expired') ||
        error.message.includes('Invalid')
      ) {
        res.status(401).json({ error: 'Refresh token invalid', code: 'REFRESH_INVALID' });
        return;
      }
    }
    throw error;
  }
}));

// POST /api/auth/logout
router.post('/logout', authenticateToken, asyncHandler(async (req: Request, res: Response) => {
  const { refreshToken } = req.body ?? {};
  await authService.invalidateRefreshToken(refreshToken, req.user!.userId);
  res.json({ message: 'Logged out successfully' });
}));

// POST /api/auth/resend-verification
router.post(
  '/resend-verification',
  resendVerificationLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const { email } = (req.body ?? {}) as { email?: string };
    if (!email) {
      res.status(400).json({ error: 'Email is required' });
      return;
    }
    try {
      await authService.resendVerificationEmail(email);
    } catch (err) {
      console.warn('[auth/resend-verification] internal error', err);
    }
    res.json({ message: 'If your account exists, a verification email has been sent.' });
  }),
);

// GET /api/auth/verify-email
router.get('/verify-email', asyncHandler(async (req: Request, res: Response) => {
  const token = req.query.token as string | undefined;
  if (!token) {
    res.status(400).json({ error: 'Verification token is required' });
    return;
  }
  try {
    await authService.verifyEmailToken(token);
    res.redirect(302, `${authEnv.FRONTEND_URL}/auth?verified=1`);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('expired')) {
        return res.redirect(302, `${authEnv.FRONTEND_URL}/auth?verified=expired`);
      }
      if (error.message.includes('Invalid verification token')) {
        return res.redirect(302, `${authEnv.FRONTEND_URL}/auth?verified=invalid`);
      }
    }
    throw error;
  }
}));

// POST /api/auth/forgot-password
router.post(
  '/forgot-password',
  forgotPasswordLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const { email } = (req.body ?? {}) as { email?: string };
    if (!email) {
      res.status(400).json({ error: 'Email is required' });
      return;
    }
    if (!isLikelyEmail(email)) {
      res.status(400).json({ error: 'Please provide a valid email address' });
      return;
    }
    try {
      await authService.requestPasswordReset(email);
    } catch (err) {
      console.warn('[auth/forgot-password] internal error', err);
    }
    res.json({ message: 'If your account exists, a password reset email has been sent.' });
  }),
);

// POST /api/auth/reset-password
router.post(
  '/reset-password',
  asyncHandler(async (req: Request, res: Response) => {
    const { token, newPassword } = req.body ?? {};
    if (!token || !newPassword) {
      res.status(400).json({ error: 'Token and new password are required' });
      return;
    }
    const pwErr = passwordPolicyError(newPassword);
    if (pwErr) {
      res.status(400).json({ error: pwErr });
      return;
    }
    try {
      await authService.resetPassword(token, newPassword);
      res.json({ message: 'Password reset successfully' });
    } catch (error) {
      if (error instanceof Error && error.message.includes('Invalid or expired')) {
        res.status(400).json({ error: 'Reset token is invalid or has expired', code: 'RESET_INVALID' });
        return;
      }
      throw error;
    }
  }),
);

// ── Google OAuth ───────────────────────────────────────────────────────────

const OAUTH_STATE_COOKIE = 'aiv_oauth_state';
const OAUTH_STATE_TTL_MS = 5 * 60 * 1000;

// Sign a `mode.nonce` state with a short HMAC so the callback can verify
// authenticity without persisting state across processes. Reasoning:
// stateless validation is fine here because the request is also gated by
// the cookie check (CSRF). The HMAC just prevents tampering of the mode bit.
function signOauthState(mode: 'login' | 'signup'): string {
  const nonce = crypto.randomBytes(16).toString('base64url');
  const payload = `${mode}.${nonce}`;
  const sig = crypto
    .createHmac('sha256', authEnv.JWT_SECRET)
    .update(payload)
    .digest('base64url')
    .slice(0, 16);
  return `${payload}.${sig}`;
}

function parseOauthState(state: string): { mode: 'login' | 'signup'; raw: string } | null {
  const parts = state.split('.');
  if (parts.length !== 3) return null;
  const [mode, nonce, sig] = parts;
  if (mode !== 'login' && mode !== 'signup') return null;
  const expected = crypto
    .createHmac('sha256', authEnv.JWT_SECRET)
    .update(`${mode}.${nonce}`)
    .digest('base64url')
    .slice(0, 16);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return { mode, raw: state };
}

function setOauthStateCookie(res: Response, value: string) {
  const isProd = process.env.NODE_ENV === 'production';
  const attrs = [
    `${OAUTH_STATE_COOKIE}=${value}`,
    'HttpOnly',
    'Path=/api/auth/google',
    `Max-Age=${Math.floor(OAUTH_STATE_TTL_MS / 1000)}`,
    `SameSite=${isProd ? 'None' : 'Lax'}`,
  ];
  if (isProd) attrs.push('Secure');
  res.setHeader('Set-Cookie', attrs.join('; '));
}

function clearOauthStateCookie(res: Response) {
  const isProd = process.env.NODE_ENV === 'production';
  const attrs = [
    `${OAUTH_STATE_COOKIE}=`,
    'HttpOnly',
    'Path=/api/auth/google',
    'Max-Age=0',
    `SameSite=${isProd ? 'None' : 'Lax'}`,
  ];
  if (isProd) attrs.push('Secure');
  res.setHeader('Set-Cookie', attrs.join('; '));
}

function startGoogleAuth(mode: 'login' | 'signup') {
  return (req: Request, res: Response) => {
    try {
      const state = signOauthState(mode);
      setOauthStateCookie(res, state);
      const url = getGoogleAuthLoginUrl(state);
      res.json({ authUrl: url });
    } catch (error) {
      console.error(`[auth/google/${mode}] failed`, error);
      res.status(500).json({ error: 'Google Auth not configured' });
    }
  };
}

router.get('/google/login', googleAuthLimiter, startGoogleAuth('login'));
router.get('/google/signup', googleAuthLimiter, startGoogleAuth('signup'));

// GET /api/auth/google/auth-callback — Google redirects here.
router.get('/google/auth-callback', (req: Request, res: Response) => {
  const { code, state, error } = req.query;
  const frontendUrl = authEnv.FRONTEND_URL;

  if (error) {
    clearOauthStateCookie(res);
    return res.redirect(`${frontendUrl}/auth?google=failed&reason=${error}`);
  }

  const cookieState = (req as any).cookies?.[OAUTH_STATE_COOKIE];
  if (!cookieState || cookieState !== state || !parseOauthState(String(state))) {
    clearOauthStateCookie(res);
    return res.redirect(`${frontendUrl}/auth?google=failed&reason=state_mismatch`);
  }

  // Pass code + state to the frontend, which will POST to /exchange.
  // Clearing the state cookie here means /exchange relies only on the
  // browser already having proven possession by completing the round-trip.
  clearOauthStateCookie(res);
  res.redirect(`${frontendUrl}/auth?googleCode=${code}&state=${state}`);
});

// POST /api/auth/google/exchange
router.post(
  '/google/exchange',
  googleAuthLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const { code } = (req.body ?? {}) as { code?: string };
    if (!code) {
      res.status(400).json({ error: 'Code is required' });
      return;
    }
    try {
      const profile = await exchangeGoogleAuthCode(code);
      const result = await authService.loginOrCreateWithGoogle({
        googleId: profile.googleId,
        email: profile.email,
        emailVerified: profile.emailVerified,
        name: profile.name,
        ctx: clientContext(req),
      });
      let wizardLink = null;
      if (result.user?.id) {
        wizardLink = await maybeLinkWizardSession(req, res, result.user.id);
      }
      res.json({ ...result, wizardLink });
    } catch (error) {
      console.error('[auth/google/exchange] failed', error);
      res.status(500).json({ error: 'Google code exchange failed' });
    }
  }),
);

export default router;
