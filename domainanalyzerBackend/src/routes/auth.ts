import { Router, Request, Response } from 'express';
import { authService } from '../services/authService';
import { authenticateToken } from '../middleware/auth';

const router = Router();

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
    res.status(201).json(result);
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

export default router; 