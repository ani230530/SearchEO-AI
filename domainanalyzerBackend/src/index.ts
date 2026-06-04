import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import 'dotenv/config';

// Validate auth secrets at boot — refuse to start with default/missing values.
import { authEnv } from './config/authEnv';

import authRouter from './routes/auth';
import googleSearchConsoleRouter, { handleOAuthCallback } from './routes/googleSearchConsole';
import campaignsRouter from './routes/campaigns';
import publishRouter from './routes/publish';
import auditRoutes from './routes/auditRoutes';
import auditN8nRouter from './routes/auditN8n';
import n8nErrorRouter from './routes/n8nError';
import knowledgeBaseRouter from './routes/knowledgeBase.routes';
import wizardRouter from './wizard/routes';
import chatRouter from './routes/chat';
import userRouter from './routes/user';
import blogAnalyticsRouter from './routes/blogAnalytics';
import domainCompatRouter from './routes/domainCompat';
import logoProxyRouter from './routes/logoProxy';

import { PrismaClient } from '../generated/prisma';
import { authenticateToken, AuthenticatedRequest } from './middleware/auth';
import { addSSEClient, removeSSEClient } from './services/sseService';
import { startTimeoutChecker } from './services/n8nTimeout';

const app = express();
const prisma = new PrismaClient();

const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5173',
  'http://localhost:4173',
  'http://localhost:8080',
  'http://localhost:8081',
  'http://localhost:9000',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
  'https://aichecker.blueoceanglobaltech.com',
  'https://phrase-score-insight-lxkj.vercel.app',
  'https://domainanalyzer-rosy.vercel.app',
  'https://seo-gpt-teal.vercel.app',
  'https://search-eo-ai.vercel.app',
];

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    if (!origin || origin.startsWith('http://localhost:') || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());

// Lightweight request logger (dev only) — surfaces 4xx/5xx so we don't have
// to guess which endpoint a browser console error came from.
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    const startedAt = Date.now();
    res.on('finish', () => {
      const ms = Date.now() - startedAt;
      const tag = res.statusCode >= 400 ? '⚠ ' : '  ';
      // Skip the SSE keep-alive noise.
      if (req.path === '/api/sse') return;
      console.log(`${tag}${req.method} ${req.path} → ${res.statusCode} ${ms}ms`);
    });
    next();
  });
}

// Debug endpoint — non-prod only.
app.get('/api/debug/domains', authenticateToken, async (req: Request, res: Response) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Debug endpoint not available in production' });
  }
  const _authReq = req as AuthenticatedRequest;
  const domains = await prisma.domain.findMany({
    select: {
      id: true,
      url: true,
      host: true,
      createdAt: true,
      updatedAt: true,
      userId: true,
      user: { select: { id: true, email: true, name: true } },
      _count: { select: { keywords: true, crawls: true, prompts: true, runs: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ total: domains.length, domains });
});

// API routes — clean surface.
app.use('/api/auth', authRouter);
app.use('/api/user', userRouter);
app.use('/api/domain', domainCompatRouter);
app.use('/api/wizard', wizardRouter);
app.use('/api/chat', chatRouter);
app.use('/api/blog-analytics', blogAnalyticsRouter);
app.use('/api/gsc', googleSearchConsoleRouter);
app.use('/api/campaigns', campaignsRouter);
app.use('/api/publish', publishRouter);
app.use('/api/knowledge-base', knowledgeBaseRouter);
app.use('/api/audit', auditRoutes);
app.use('/api/audit/n8n', auditN8nRouter);
app.use('/api/webhooks/n8n', n8nErrorRouter);
// Logo proxy — hides the img.logo.dev token, caches bytes in Redis, and
// sets long Cache-Control so the browser/CDN cache aggressively too.
app.use('/api/logo', logoProxyRouter);

// Google OAuth callback (must live at this exact path).
app.get('/api/auth/google/callback', handleOAuthCallback);

// SSE endpoint for cross-domain push notifications (independent of wizard SSE).
app.get('/api/sse', async (req: Request, res: Response) => {
  const token = req.query.token as string | undefined;
  if (!token) return res.status(401).json({ error: 'Missing auth token' });
  const jwt = await import('jsonwebtoken');
  try {
    const decoded = jwt.verify(token, authEnv.JWT_SECRET) as { userId: number };
    const userId = decoded.userId;
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    const client = { res };
    addSSEClient(userId, client);
    res.write(`: connected\n\n`);
    res.write(`data: ${JSON.stringify({ type: 'connected', userId })}\n\n`);
    const keepAlive = setInterval(() => res.write(': keep-alive\n\n'), 25000);
    req.on('close', () => {
      clearInterval(keepAlive);
      removeSSEClient(userId, client);
      res.end();
    });
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
});

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
  });
});

app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Not Found', message: `Cannot ${req.method} ${req.url}` });
});

const PORT = Number(process.env?.PORT) || 3002;
const NODE_ENV = process.env.NODE_ENV || 'development';

if (NODE_ENV === 'production') {
  const required = ['CALLBACK_BASE_URL', 'STREAMING_BASE_URL'];
  const missing = required.filter((n) => !process.env[n]);
  if (missing.length > 0) {
    throw new Error(`[startup] Missing required env vars in production: ${missing.join(', ')}`);
  }
}

app.listen(PORT, () => {
  console.log(`Server running in ${NODE_ENV} mode on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
  startTimeoutChecker();
  // Worksheet generation stale-job sweeper (campaigns/blog flow).
  const { startStaleJobSweeper } = require('./services/generationJobService');
  startStaleJobSweeper();
  // Weekly tracked-prompt re-test scheduler (BullMQ repeatable, idempotent).
  const { registerWeeklyTracking } = require('./services/weeklyTrackingService');
  registerWeeklyTracking().catch((e: unknown) =>
    console.error('[startup] weekly tracking registration failed', e));
});
