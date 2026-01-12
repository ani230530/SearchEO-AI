import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import 'dotenv/config';
import domainRouter from './routes/domain';
import domainValidationRouter from './routes/domainValidation';
import keywordsRouter from './routes/keywords';
import intentPhrasesRouter from './routes/intentPhrases';
import enhancedPhrasesRouter from './routes/enhancedPhrasesUnified';
import aiQueriesRouter from './routes/ai-queries';
import competitorRouter from './routes/competitor';
import dashboardRouter from './routes/dashboard';
// Onboarding router removed
import authRouter from './routes/auth';
import userRouter from './routes/user';
import googleSearchConsoleRouter, { handleOAuthCallback } from './routes/googleSearchConsole';
import publishRouter from './routes/publish';
import campaignsRouter from './routes/campaigns';
import { PrismaClient } from '../generated/prisma';
import { authenticateToken, AuthenticatedRequest } from './middleware/auth';
import auditRoutes from './routes/auditRoutes';
const app = express();
const prisma = new PrismaClient();

// Load environment variables
import 'dotenv/config';

const allowedOrigins = [
  'http://localhost:8080',
  'http://localhost:8081',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:4173',
  'https://aichecker.blueoceanglobaltech.com',
  'https://phrase-score-insight-lxkj.vercel.app',
  'https://domainanalyzer-rosy.vercel.app',
  'https://seo-gpt-teal.vercel.app'
];

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Allow all localhost origins in development
    if (!origin || origin.startsWith('http://localhost:') || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
};

// Middleware
app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // Enable pre-flight checks for all routes
app.use(express.json({ limit: '5mb' }));

// Debug endpoint to list all domains (ADMIN ONLY - REMOVE IN PRODUCTION)
app.get('/api/debug/domains', authenticateToken, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  try {
    // Only allow admin users (you can add admin check here)
    // For now, this endpoint should be removed in production
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ error: 'Debug endpoint not available in production' });
    }

    const domains = await prisma.domain.findMany({
      select: {
        id: true,
        url: true,
        context: true,
        createdAt: true,
        updatedAt: true,
        userId: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true
          }
        },
        _count: {
          select: {
            keywords: true,
            crawlResults: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json({
      total: domains.length,
      domains: domains
    });
  } catch (error) {
    console.error('Error fetching domains:', error);
    res.status(500).json({ error: 'Failed to fetch domains' });
  }
});

import n8nErrorRouter from './routes/n8nError';

// Routes
app.use('/api/auth', authRouter);
app.use('/api/user', userRouter);
app.use('/api/domain', domainRouter);
app.use('/api/gsc', googleSearchConsoleRouter);
app.use('/api/campaigns', campaignsRouter);
app.use('/api/publish', publishRouter);
app.use('/api/webhooks/n8n', n8nErrorRouter);

// OAuth callback route (must be at /api/auth/google/callback for Google redirect)
app.get('/api/auth/google/callback', handleOAuthCallback);

app.use('/api/domain-validation', domainValidationRouter);
app.use('/api/keywords', keywordsRouter);
app.use('/api/intent-phrases', intentPhrasesRouter);
app.use('/api/enhanced-phrases', enhancedPhrasesRouter);
app.use('/api/ai-queries', aiQueriesRouter);
app.use('/api/competitor', competitorRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/audit', auditRoutes);
// Onboarding routes removed

// Health check endpoint
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.url}`
  });
});

const PORT = Number(process.env?.PORT) || 3002;
const NODE_ENV = process.env.NODE_ENV || 'development';

app.listen(PORT, () => {
  console.log(`Server running in ${NODE_ENV} mode on port ${PORT}`);
  console.log(`Health check available at http://localhost:${PORT}/api/health`);
  console.log(`Debug domains available at http://localhost:${PORT}/api/debug/domains`);
}); 
