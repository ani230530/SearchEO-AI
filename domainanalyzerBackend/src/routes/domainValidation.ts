import { Router, Request, Response } from 'express';
import { PrismaClient } from '../../generated/prisma';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import https from 'https';
import http from 'http';
import { URL } from 'url';
import OpenAI from 'openai';
import { getDomainLookupCandidates, parseDomainInput } from '../utils/domainValidation';

const router = Router();
const prisma = new PrismaClient();

// Initialize OpenAI
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set in environment variables');
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

function asyncHandler(fn: (req: Request, res: Response, next: any) => Promise<any>) {
  return function (req: Request, res: Response, next: any) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// Step 1: Domain Validation - Check if domain is crawlable by AI
router.post('/validate-domain', authenticateToken, asyncHandler(async (req: Request, res: Response) => {
  try {
    const { domain } = req.body;
    const authReq = req as AuthenticatedRequest;

    if (!domain) {
      return res.status(400).json({ 
        success: false, 
        error: 'Domain is required',
        step: 'Domain Validation',
        status: 'failed'
      });
    }

    const parsedDomain = parseDomainInput(domain);
    if (!parsedDomain) {
      return res.json({
        success: false,
        error: 'Please enter a valid domain or URL (e.g., example.org or brand.co.uk)',
        step: 'Domain Validation',
        status: 'failed',
        progress: 100
      });
    }

    const normalizedDomain = parsedDomain.normalizedUrl;

    const isAccessible = await checkDomainAccessibility(normalizedDomain);
    
    if (!isAccessible) {
      return res.json({
        success: false,
        error: 'Domain is not accessible',
        step: 'Domain Validation',
        status: 'failed',
        progress: 100
      });
    }

    const existingDomain = await prisma.domain.findFirst({
      where: {
        OR: getDomainLookupCandidates(parsedDomain).map((candidate) => ({ url: candidate })),
        userId: authReq.user.userId
      }
    });

    if (existingDomain) {
      return res.json({
        success: true,
        step: 'Domain Validation',
        status: 'completed',
        progress: 100,
        message: 'Domain already exists',
        domainId: existingDomain.id,
        exists: true
      });
    }

    return res.json({
      success: true,
      step: 'Domain Validation',
      status: 'completed',
      progress: 100,
      message: 'Domain is valid and accessible',
      exists: false
    });

  } catch (error) {
    console.error('Domain validation error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to validate domain',
      step: 'Domain Validation',
      status: 'failed',
      progress: 100
    });
  }
}));

async function checkDomainAccessibility(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const timeout = 10000;
    const timer = setTimeout(() => {
      resolve(false);
    }, timeout);

    try {
      const parsedUrl = new URL(url);
      const protocol = parsedUrl.protocol === 'https:' ? https : http;
      
      const req = protocol.get(url, (res) => {
        clearTimeout(timer);
        resolve((res.statusCode || 0) >= 200 && (res.statusCode || 0) < 400);
      });

      req.on('error', () => {
        clearTimeout(timer);
        resolve(false);
      });

      req.setTimeout(timeout, () => {
        clearTimeout(timer);
        req.destroy();
        resolve(false);
      });

    } catch (error) {
      clearTimeout(timer);
      resolve(false);
    }
  });
}

// Step 2: SSL Certificate Check
router.post('/check-ssl', authenticateToken, asyncHandler(async (req: Request, res: Response) => {
  try {
    const { domain } = req.body;

    if (!domain) {
      return res.status(400).json({
        success: false,
        error: 'Domain is required',
        step: 'SSL Certificate Check',
        status: 'failed'
      });
    }

    const parsedDomain = parseDomainInput(domain);
    if (!parsedDomain) {
      return res.status(400).json({
        success: false,
        error: 'Please enter a valid domain or URL (e.g., example.org or brand.co.uk)',
        step: 'SSL Certificate Check',
        status: 'failed'
      });
    }

    const normalizedDomain = parsedDomain.normalizedUrl;

    const hasSSL = await checkSSL(normalizedDomain);

    return res.json({
      success: true,
      step: 'SSL Certificate Check',
      status: 'completed',
      progress: 100,
      message: hasSSL ? 'SSL certificate is valid' : 'No SSL certificate found',
      hasSSL
    });

  } catch (error) {
    console.error('SSL check error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to check SSL certificate',
      step: 'SSL Certificate Check',
      status: 'failed',
      progress: 100
    });
  }
}));

// Step 3: Server Response Analysis
router.post('/analyze-server', authenticateToken, asyncHandler(async (req: Request, res: Response) => {
  try {
    const { domain } = req.body;

    if (!domain) {
      return res.status(400).json({
        success: false,
        error: 'Domain is required',
        step: 'Server Response Analysis',
        status: 'failed'
      });
    }

    const parsedDomain = parseDomainInput(domain);
    if (!parsedDomain) {
      return res.status(400).json({
        success: false,
        error: 'Please enter a valid domain or URL (e.g., example.org or brand.co.uk)',
        step: 'Server Response Analysis',
        status: 'failed'
      });
    }

    const normalizedDomain = parsedDomain.normalizedUrl;

    const serverInfo = await analyzeServerResponse(normalizedDomain);

    return res.json({
      success: true,
      step: 'Server Response Analysis',
      status: 'completed',
      progress: 100,
      message: 'Server response analyzed successfully',
      serverInfo
    });

  } catch (error) {
    console.error('Server analysis error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to analyze server response',
      step: 'Server Response Analysis',
      status: 'failed',
      progress: 100
    });
  }
}));

// Step 4: Geo-location Configuration with AI Analysis
router.post('/configure-geo', authenticateToken, asyncHandler(async (req: Request, res: Response) => {
  try {
    const { domain, location, customKeywords, intentPhrases, chatModel, runAllModels } = req.body;
    const authReq = req as AuthenticatedRequest;

    if (!domain) {
      return res.status(400).json({
        success: false,
        error: 'Domain is required',
        step: 'Geo-location Configuration',
        status: 'failed'
      });
    }

    const parsedDomain = parseDomainInput(domain);
    if (!parsedDomain) {
      return res.status(400).json({
        success: false,
        error: 'Please enter a valid domain or URL (e.g., example.org or brand.co.uk)',
        step: 'Geo-location Configuration',
        status: 'failed'
      });
    }

    const normalizedDomain = parsedDomain.normalizedUrl;

    // Generate AI analysis of domain-location interrelation
    const locationContext = await generateLocationDomainContext(normalizedDomain, location);

    // Create domain record with AI-generated location context
    const newDomain = await prisma.domain.create({
      data: {
        url: normalizedDomain,
        location: location || '',
        userId: authReq.user.userId,
        customKeywords: customKeywords || '',
        intentPhrases: intentPhrases || '',
        chatModel: chatModel || 'GPT-4o',
        runAllModels: runAllModels || false,
        locationContext: locationContext, // Store AI-generated context
        currentStep: 0
      }
    });

    return res.json({
      success: true,
      step: 'Geo-location Configuration',
      status: 'completed',
      progress: 100,
      message: 'Geo-location configured with AI analysis',
      domainId: newDomain.id,
      locationContext
    });

  } catch (error) {
    console.error('Geo-location configuration error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to configure geo-location',
      step: 'Geo-location Configuration',
      status: 'failed',
      progress: 100
    });
  }
}));

async function checkSSL(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (!url.startsWith('https://')) {
      resolve(false);
      return;
    }

    const timeout = 10000;
    const timer = setTimeout(() => {
      resolve(false);
    }, timeout);

    try {
      const req = https.get(url, (res) => {
        clearTimeout(timer);
        resolve(true);
      });

      req.on('error', () => {
        clearTimeout(timer);
        resolve(false);
      });

      req.setTimeout(timeout, () => {
        clearTimeout(timer);
        req.destroy();
        resolve(false);
      });

    } catch (error) {
      clearTimeout(timer);
      resolve(false);
    }
  });
}

async function analyzeServerResponse(url: string): Promise<any> {
  return new Promise((resolve) => {
    const timeout = 10000;
    const timer = setTimeout(() => {
      resolve({ error: 'Timeout' });
    }, timeout);

    try {
      const protocol = url.startsWith('https://') ? https : http;
      
      const req = protocol.get(url, (res) => {
        clearTimeout(timer);
        const statusCode = res.statusCode || 0;
        resolve({
          statusCode: statusCode,
          headers: {
            'content-type': res.headers['content-type'],
            'server': res.headers['server'],
            'x-powered-by': res.headers['x-powered-by']
          },
          accessible: statusCode >= 200 && statusCode < 400
        });
      });

      req.on('error', (error) => {
        clearTimeout(timer);
        resolve({ error: error.message, accessible: false });
      });

      req.setTimeout(timeout, () => {
        clearTimeout(timer);
        req.destroy();
        resolve({ error: 'Timeout', accessible: false });
      });

    } catch (error) {
      clearTimeout(timer);
      resolve({ error: 'Invalid URL', accessible: false });
    }
  });
}

// AI function to generate location-domain interrelation context
async function generateLocationDomainContext(domain: string, location: string): Promise<string> {
  try {
    const prompt = `Analyze the relationship between domain "${domain}" and location "${location}" for SEO optimization.

Key aspects to cover:
- Local market opportunities and competition
- Cultural considerations for content
- Location-specific keywords and phrases
- Local search behavior patterns

Provide a concise analysis (2-3 paragraphs) that can be used for location-specific content generation and local SEO strategy.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are an SEO specialist focused on location-based optimization.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 500,
      temperature: 0.3
    });

    return completion.choices[0].message?.content || `Location: ${location}, Domain: ${domain}. Basic context generated.`;
  } catch (error) {
    console.error('Error generating location context:', error);
    return `Location: ${location}, Domain: ${domain}. Basic context generated.`;
  }
}

export default router; 
