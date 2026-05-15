import { Router, Request, Response } from 'express';
import { PrismaClient } from '../../generated/prisma';
import { authService } from '../services/authService';
import { authenticateToken } from '../middleware/auth';
import {
  WIZARD_COOKIE_NAME,
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

/**
 * Inspect the request for an anonymous wizard cookie. When present and
 * valid, link the cookie's WizardSession to the newly-registered user and
 * clear the cookie on the response. Wrapped in a top-level try/catch so a
 * linkage failure never fails the signup itself — the user gets their
 * account either way; the wizard work just isn't auto-attached.
 *
 * Returns the link result (or null when nothing was linked) so the route
 * can include it in the API response — the frontend uses primaryDomainId
 * to redirect into the just-bound report.
 */
async function maybeLinkWizardSession(
  req: Request,
  res: Response,
  userId: number
) {
  try {
    const cookies = parseCookieHeader(req.headers.cookie);
    const token = cookies[WIZARD_COOKIE_NAME];
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

// Utility function to wrap async route handlers
function asyncHandler(fn: (req: Request, res: Response, next: any) => Promise<void>) {
  return (req: Request, res: Response, next: any) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// POST /api/auth/register - Register a new user
router.post('/register', asyncHandler(async (req: Request, res: Response) => {
  const { email, password, name } = req.body;

  // Validate input
  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }

  if (password.length < 6) {
    res.status(400).json({ error: 'Password must be at least 6 characters long' });
    return;
  }

  if (!email.includes('@')) {
    res.status(400).json({ error: 'Please provide a valid email address' });
    return;
  }

  try {
    const result = await authService.register({ email, password, name });
    // Link any in-flight anonymous wizard session to the new user.
    // Failures here don't bubble — the account is created either way.
    let wizardLink = null;
    if (result.user?.id) {
      wizardLink = await maybeLinkWizardSession(req, res, result.user.id);
    }
    res.status(201).json({ ...result, wizardLink });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('already exists')) {
        res.status(409).json({ error: error.message });
        return;
      }
    }
    throw error;
  }
}));

// POST /api/auth/login - Login user
router.post('/login', asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;

  // Validate input
  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }

  try {
    const result = await authService.login({ email, password });
    res.json(result);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('Invalid email or password')) {
        res.status(401).json({ error: error.message });
        return;
      }
    }
    throw error;
  }
}));

// GET /api/auth/me - Get current user profile
router.get('/me', authenticateToken, asyncHandler(async (req: Request, res: Response) => {
  const user = await authService.getUserById(req.user!.userId);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json({ user });
}));

// PUT /api/auth/profile - Update user profile
router.put('/profile', authenticateToken, asyncHandler(async (req: Request, res: Response) => {
  const { name } = req.body;

  if (name !== undefined && typeof name !== 'string') {
    res.status(400).json({ error: 'Name must be a string' });
    return;
  }

  await authService.updateProfile(req.user!.userId, name);
  res.json({ message: 'Profile updated successfully' });
}));

// PUT /api/auth/password - Change password
router.put('/password', authenticateToken, asyncHandler(async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: 'Current password and new password are required' });
    return;
  }

  if (newPassword.length < 6) {
    res.status(400).json({ error: 'New password must be at least 6 characters long' });
    return;
  }

  try {
    await authService.changePassword(req.user!.userId, currentPassword, newPassword);
    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('Current password is incorrect')) {
        res.status(400).json({ error: error.message });
        return;
      }
    }
    throw error;
  }
}));

// POST /api/auth/verify - Verify token (for frontend token validation)
router.post('/verify', asyncHandler(async (req: Request, res: Response) => {
  const { token } = req.body;

  if (!token) {
    res.status(400).json({ error: 'Token is required' });
    return;
  }

  try {
    const decoded = await authService.verifyToken(token);
    const user = await authService.getUserById(decoded.userId);
    res.json({ valid: true, user });
  } catch (error) {
    res.json({ valid: false, error: 'Invalid token' });
  }
}));

// POST /api/auth/refresh - Refresh access token
router.post('/refresh', asyncHandler(async (req: Request, res: Response) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    res.status(400).json({ error: 'Refresh token is required' });
    return;
  }

  try {
    const result = await authService.refreshAccessToken(refreshToken);
    res.json(result);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('expired') || error.message.includes('Invalid')) {
        res.status(401).json({ error: error.message });
        return;
      }
    }
    throw error;
  }
}));

// POST /api/auth/logout - Logout and invalidate refresh token
router.post('/logout', authenticateToken, asyncHandler(async (req: Request, res: Response) => {
  await authService.invalidateRefreshToken(req.user!.userId);
  res.json({ message: 'Logged out successfully' });
}));

// POST /api/auth/resend-verification - Resend verification email
router.post('/resend-verification', asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.body as { email?: string };
  if (!email) {
    res.status(400).json({ error: 'Email is required' });
    return;
  }
  try {
    await authService.resendVerificationEmail(email);
    res.json({ message: 'If your account exists, a verification email has been sent.' });
  } catch (error) {
    res.json({ message: 'If your account exists, a verification email has been sent.' });
  }
}));

// GET /api/auth/verify-email - Verify email with token
router.get('/verify-email', asyncHandler(async (req: Request, res: Response) => {
  const token = req.query.token as string | undefined;
  if (!token) {
    res.status(400).json({ error: 'Verification token is required' });
    return;
  }
  try {
    await authService.verifyEmailToken(token);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const redirectUrl = `${frontendUrl}/auth?verified=1`;
    res.redirect(302, redirectUrl);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('expired')) {
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        return res.redirect(302, `${frontendUrl}/auth?verified=expired`);
      }
      if (error.message.includes('Invalid verification token')) {
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
        return res.redirect(302, `${frontendUrl}/auth?verified=invalid`);
      }
    }
    throw error;
  }
}));

// ── Google OAuth ───────────────────────────────────────────────────────────

// GET /api/auth/google/login - Return Google auth URL for login
router.get('/google/login', (req: Request, res: Response) => {
  const state = (req.query.state as string) || 'login';
  try {
    const url = getGoogleAuthLoginUrl(state);
    // Return JSON because the frontend uses fetch() to get this URL
    res.json({ authUrl: url });
  } catch (error) {
    console.error('[auth/google/login] failed', error);
    res.status(500).json({ error: 'Google Auth not configured' });
  }
});

// GET /api/auth/google/signup - Return Google auth URL for signup
router.get('/google/signup', (req: Request, res: Response) => {
  const state = (req.query.state as string) || 'signup';
  try {
    const url = getGoogleAuthLoginUrl(state);
    res.json({ authUrl: url });
  } catch (error) {
    console.error('[auth/google/signup] failed', error);
    res.status(500).json({ error: 'Google Auth not configured' });
  }
});

// GET /api/auth/google/auth-callback - Catch Google redirect and send to frontend
router.get('/google/auth-callback', (req: Request, res: Response) => {
  const { code, state, error } = req.query;
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  if (error) {
    console.error('[auth/google/callback] Google returned error:', error);
    return res.redirect(`${frontendUrl}/auth?google=failed&reason=${error}`);
  }

  console.log('[auth/google/callback] Success, redirecting to frontend with code');
  // Redirect back to frontend Auth page with the code
  res.redirect(`${frontendUrl}/auth?googleCode=${code}&state=${state}`);
});

// POST /api/auth/google/exchange - Exchange short-lived code for app auth tokens
router.post('/google/exchange', asyncHandler(async (req: Request, res: Response) => {
  const { code } = (req.body ?? {}) as { code?: string };
  if (!code) {
    res.status(400).json({ error: 'Code is required' });
    return;
  }

  try {
    // 1. Get profile from Google
    const profile = await exchangeGoogleAuthCode(code);

    // 2. Login or Create user in our DB
    const result = await authService.loginOrCreateWithGoogleEmail(
      profile.email,
      profile.name
    );

    // 3. Link any in-flight wizard session (shadow user -> real user)
    let wizardLink = null;
    if (result.user?.id) {
      wizardLink = await maybeLinkWizardSession(req, res, result.user.id);
    }

    res.json({ ...result, wizardLink });
  } catch (error) {
    console.error('[auth/google/exchange] failed', error);
    res.status(500).json({ error: 'Google code exchange failed' });
  }
}));

export default router; 
