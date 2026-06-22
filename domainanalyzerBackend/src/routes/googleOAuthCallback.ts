import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { exchangeCodeForTokens, getUserInfo, revokeToken } from '../services/googleOAuthService';
import { encryptToken } from '../services/tokenEncryption';
import crypto from 'crypto';


// Store state tokens temporarily (in production, use Redis or similar)
const stateTokens = new Map<string, { userId: number; expiresAt: Date }>();

// Clean up expired state tokens every 10 minutes
setInterval(() => {
  const now = new Date();
  for (const [state, data] of stateTokens.entries()) {
    if (now > data.expiresAt) {
      stateTokens.delete(state);
    }
  }
}, 10 * 60 * 1000);

// Export function to add state token (called from GSC router)
export function addStateToken(state: string, userId: number, expiresAt: Date) {
  stateTokens.set(state, { userId, expiresAt });
}

/**
 * GET /api/auth/google/callback
 * Handles OAuth callback from Google
 */
export async function handleOAuthCallback(req: Request, res: Response) {
  const { code, state, error } = req.query;

  if (error) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    return res.redirect(`${frontendUrl}/integration?error=${encodeURIComponent(error as string)}`);
  }

  if (!code || !state) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    return res.redirect(`${frontendUrl}/integration?error=missing_code_or_state`);
  }

  // Verify state token
  const stateData = stateTokens.get(state as string);
  if (!stateData) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    return res.redirect(`${frontendUrl}/integration?error=invalid_state`);
  }

  // Check if expired
  if (new Date() > stateData.expiresAt) {
    stateTokens.delete(state as string);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    return res.redirect(`${frontendUrl}/integration?error=state_expired`);
  }

  const userId = stateData.userId;
  stateTokens.delete(state as string); // Use once

  try {
    // Exchange code for tokens
    const { accessToken, refreshToken, expiryDate } = await exchangeCodeForTokens(code as string);

    // Get user info
    const userInfo = await getUserInfo(accessToken);

    // Encrypt refresh token
    const encryptedRefreshToken = encryptToken(refreshToken);

    // Save or update connection in database
    await prisma.googleSearchConsoleConnection.upsert({
      where: { userId },
      update: {
        googleEmail: userInfo.email,
        googleUserId: userInfo.id,
        accessToken,
        refreshToken: encryptedRefreshToken,
        tokenExpiry: expiryDate,
        isConnected: true,
        lastSyncedAt: new Date()
      },
      create: {
        userId,
        googleEmail: userInfo.email,
        googleUserId: userInfo.id,
        accessToken,
        refreshToken: encryptedRefreshToken,
        tokenExpiry: expiryDate,
        isConnected: true,
        lastSyncedAt: new Date()
      }
    });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/integration?success=true`);
  } catch (error) {
    console.error('Error in OAuth callback:', error);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/integration?error=oauth_failed`);
  }
}

