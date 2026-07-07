import { Request, Response, NextFunction } from 'express';
import { authService, JWTPayload } from '../services/authService';
import { prisma } from '../lib/prisma';

const AUTH_DB_TIMEOUT_MS = Number(process.env.AUTH_DB_TIMEOUT_MS) || 8000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

// Extend Express Request interface to include user
declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
    }
  }
}

export interface AuthenticatedRequest extends Request {
  user: JWTPayload;
}

export const isAdmin = (req: Request, res: Response, next: NextFunction) => {
  const user = req.user;
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  return next();
};

// Middleware to verify JWT token
export const authenticateToken = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    const decoded = await withTimeout(authService.verifyToken(token), AUTH_DB_TIMEOUT_MS, 'verifyToken');
    req.user = decoded;
    next();
  } catch (error) {
    if (error instanceof Error && error.message.includes('timed out')) {
      console.error('[auth] token verification timed out', error.message);
      return res.status(503).json({
        error: 'Authentication service temporarily unavailable',
        code: 'AUTH_DB_TIMEOUT',
      });
    }
    // Return 401 for expired/invalid tokens (not 403)
    // This allows frontend to distinguish between auth errors and permission errors
    if (error instanceof Error && error.message.includes('expired')) {
      return res.status(401).json({ 
        error: 'Token expired',
        code: 'TOKEN_EXPIRED'
      });
    }
    return res.status(401).json({ 
      error: 'Invalid or expired token',
      code: 'INVALID_TOKEN'
    });
  }
};

// Optional authentication middleware (doesn't fail if no token)
export const optionalAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const decoded = await authService.verifyToken(token);
      req.user = decoded;
    }
    next();
  } catch (error) {
    // Continue without authentication
    next();
  }
};

// Middleware to check if user owns a domain
export const checkDomainOwnership = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const domainId = parseInt(req.params.domainId || req.params.domain);
    if (!domainId || isNaN(domainId)) {
      return res.status(400).json({ error: 'Invalid domain ID' });
    }

    // Check if domain exists and belongs to user.
    const domain = await prisma.domain.findFirst({
      where: {
        id: domainId,
        userId: req.user.userId
      }
    });

    if (!domain) {
      return res.status(404).json({ error: 'Domain not found or access denied' });
    }

    next();
  } catch (error) {
    console.error('Domain ownership check error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}; 
