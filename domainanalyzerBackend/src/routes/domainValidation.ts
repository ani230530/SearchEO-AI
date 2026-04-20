import { Router, Request, Response } from 'express';
import { PrismaClient } from '../../generated/prisma';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import https from 'https';
import http from 'http';
import { URL } from 'url';
import OpenAI from 'openai';
import puppeteer from 'puppeteer';
import axios from 'axios';
import { getDomainLookupCandidates, parseDomainInput } from '../utils/domainValidation';
import { generateKeywordsForDomain } from '../services/geminiService';

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
    const { domain, location, customKeywords, intentPhrases } = req.body;
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

    // Check if domain already exists
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

    // Check domain accessibility with Puppeteer fallback
    const accessibilityInfo = await checkDomainAccessibilityWithFallback(normalizedDomain);
    
    if (accessibilityInfo.isAccessible) {
      return res.json({
        success: true,
        step: 'Domain Validation',
        status: 'completed',
        progress: 100,
        message: 'Domain is valid and accessible',
        exists: false,
        accessMethod: accessibilityInfo.method
      });
    }

    // Domain not accessible - generate context using LLM and store
    console.log(`[validate-domain] Domain ${normalizedDomain} not accessible via HTTP/Puppeteer. Using LLM generation...`);
    
    const locationContext = await generateLocationDomainContext(normalizedDomain, location);
    const contextJson = await generateDomainContextFromLLM({
      domain: normalizedDomain,
      location: location,
      customKeywords: customKeywords,
      intentPhrases: intentPhrases
    });

    // Create domain record with LLM-generated content
    const newDomain = await prisma.domain.create({
      data: {
        url: normalizedDomain,
        location: location || '',
        userId: authReq.user.userId,
        customKeywords: customKeywords || '',
        intentPhrases: intentPhrases || '',
        chatModel: 'GPT-4o',
        runAllModels: false,
        locationContext: locationContext,
        contextJson: contextJson,
        currentStep: 1, // Mark as started since we generated content
        isCompanyDomain: true // Mark as company domain when created via LLM
      }
    });

    // Create initial crawl result with LLM-generated data
    await prisma.crawlResult.create({
      data: {
        domainId: newDomain.id,
        pagesScanned: 0,
        extractedContext: contextJson?.summary || 'AI-generated context for inaccessible domain',
        analyzedUrls: JSON.stringify([]),
        pageSnapshots: JSON.stringify([]),
        contextJson: contextJson,
        quality: {
          contentQuality: 85,
          crawlEfficiency: 100,
          thinContentRate: 0,
          schemaCoverage: 0,
          browserFallbackRate: 0,
          cacheHitRate: 0,
          reusedPages: 0,
          canonicalCoverage: 0,
          pagesWithMetadata: 0,
          blockedUrls: []
        }
      }
    });

    await bootstrapKeywordsForGeneratedDomain(newDomain.id, normalizedDomain, contextJson, location);

    return res.json({
      success: true,
      step: 'Domain Validation',
      status: 'completed',
      progress: 100,
      message: 'Domain created with AI-generated context (not directly accessible)',
      domainId: newDomain.id,
      exists: false,
      aiGenerated: true,
      note: 'Domain details generated by AI based on location and keywords provided'
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

async function bootstrapKeywordsForGeneratedDomain(
  domainId: number,
  domainUrl: string,
  contextJson: any,
  location?: string
): Promise<void> {
  try {
    const contextText = [
      contextJson?.summary,
      contextJson?.businessDescription,
      Array.isArray(contextJson?.keyServices) ? contextJson.keyServices.join(', ') : '',
      Array.isArray(contextJson?.contentThemes) ? contextJson.contentThemes.join(', ') : '',
      Array.isArray(contextJson?.suggestedKeywords) ? contextJson.suggestedKeywords.join(', ') : ''
    ]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .join('\n');

    await bootstrapKeywordsForDomain(domainId, domainUrl, contextText || domainUrl, location);
  } catch (error) {
    console.error(`[validate-domain] Failed to bootstrap keywords for ${domainUrl}:`, error);
  }
}

async function bootstrapKeywordsForDomain(
  domainId: number,
  domainUrl: string,
  contextText: string,
  location?: string
): Promise<void> {
  const existingKeywordCount = await prisma.keyword.count({
    where: { domainId }
  });

  if (existingKeywordCount > 0) {
    return;
  }

  const aiKeywordResult = await generateKeywordsForDomain(domainUrl, contextText || domainUrl, location);
  const keywords = aiKeywordResult.keywords.map((kw: any) => ({
    term: kw.term,
    volume: kw.volume,
    difficulty: kw.difficulty,
    cpc: kw.cpc,
    intent: kw.intent || 'Commercial',
    domainId,
    isSelected: false,
  }));

  if (keywords.length === 0) {
    return;
  }

  await prisma.keyword.createMany({
    data: keywords,
    skipDuplicates: true,
  });

  await prisma.keywordAnalysis.create({
    data: {
      domainId,
      keywords: keywords.map((keyword) => ({
        term: keyword.term,
        volume: keyword.volume,
        difficulty: keyword.difficulty,
        cpc: keyword.cpc,
        intent: keyword.intent,
      })),
      searchVolumeData: {},
      intentClassification: {},
      competitiveAnalysis: {},
      tokenUsage: aiKeywordResult.tokenUsage || 0,
    },
  });
}

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

// ─────────────────────────────────────────────────────────────
// Enhanced accessibility check with Puppeteer fallback chain
// ─────────────────────────────────────────────────────────────

async function checkDomainAccessibilityWithFallback(url: string): Promise<{ isAccessible: boolean; method: string }> {
  // Step 1: Try HTTP with proper headers
  try {
    const response = await axios.head(url, {
      timeout: 5000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      validateStatus: (status) => status < 500
    });
    
    if (response.status >= 200 && response.status < 400) {
      console.log(`[checkAccessibility] HTTP successful for ${url} (${response.status})`);
      return { isAccessible: true, method: 'http' };
    }
  } catch (error) {
    console.log(`[checkAccessibility] HTTP failed for ${url}, trying Puppeteer...`);
  }

  // Step 2: Try Puppeteer (handles JS rendering, anti-bot, cookies)
  try {
    const browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      headless: true,
      timeout: 8000,
    });

    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 800 });
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
      
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 8000 }).catch(() => undefined);
      
      const hasContent = await page.evaluate(() => {
        const text = document.body?.innerText || '';
        return text.trim().length > 100;
      }).catch(() => false);

      if (hasContent) {
        console.log(`[checkAccessibility] Puppeteer successful for ${url}`);
        await browser.close();
        return { isAccessible: true, method: 'puppeteer' };
      }
    } finally {
      await browser.close().catch(() => undefined);
    }
  } catch (error) {
    console.log(`[checkAccessibility] Puppeteer failed for ${url}, trying Jina Reader...`);
  }

  // Step 3: Try Jina Reader API (last resort)
  try {
    const jinaApiKey = process.env.JINA_API_KEY;
    const headers: Record<string, string> = {
      Accept: 'text/html',
    };
    if (jinaApiKey) {
      headers['Authorization'] = `Bearer ${jinaApiKey}`;
    }

    const response = await axios.get(`https://r.jina.ai/${url}`, {
      headers,
      timeout: 5000,
      validateStatus: (status) => status < 500
    });

    if (response.status >= 200 && response.status < 300 && response.data && String(response.data).length > 100) {
      console.log(`[checkAccessibility] Jina Reader successful for ${url}`);
      return { isAccessible: true, method: 'jina' };
    }
  } catch (error) {
    console.log(`[checkAccessibility] Jina Reader failed for ${url}`);
  }

  console.log(`[checkAccessibility] All methods failed for ${url}`);
  return { isAccessible: false, method: 'none' };
}

// ─────────────────────────────────────────────────────────────
// LLM-based domain context generation for inaccessible domains
// ─────────────────────────────────────────────────────────────

interface LLMContextGenerationParams {
  domain: string;
  location?: string;
  customKeywords?: string;
  intentPhrases?: string;
}

async function generateDomainContextFromLLM(params: LLMContextGenerationParams): Promise<any> {
  try {
    const { domain, location, customKeywords, intentPhrases } = params;
    
    const prompt = `You are an expert SEO analyst. Generate comprehensive domain analysis context for "${domain}".

${location ? `Target Location: ${location}` : ''}
${customKeywords ? `Custom Keywords: ${customKeywords}` : ''}
${intentPhrases ? `Intent Phrases: ${intentPhrases}` : ''}

Generate a detailed JSON response with the following structure:
{
  "summary": "2-3 sentence summary of the domain/business",
  "businessDescription": "Detailed description of what the domain/business does",
  "industry": "Primary industry classification",
  "keyServices": ["service1", "service2", ...],
  "targetAudience": "Description of target audience",
  "locationInsights": "Local market insights if location provided",
  "contentThemes": ["theme1", "theme2", ...],
  "complianceAreas": ["area1", "area2", ...],
  "businessModel": "Type of business model",
  "marketPosition": "Expected market position/niche",
  "suggestedKeywords": ["keyword1", "keyword2", ...],
  "contentTopics": ["topic1", "topic2", ...]
}

Return ONLY valid JSON, no markdown or extra text.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are an expert SEO and business analyst.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 1500,
      temperature: 0.7,
      response_format: { type: 'json_object' }
    });

    const responseText = completion.choices[0].message?.content;
    if (!responseText) {
      throw new Error('Empty response from LLM');
    }

    const parsedContext = JSON.parse(responseText);
    return parsedContext;
  } catch (error) {
    console.error('Error generating domain context from LLM:', error);
    
    return {
      summary: `AI-generated context for domain: ${params.domain}`,
      businessDescription: `Domain: ${params.domain}${params.location ? ` in ${params.location}` : ''}`,
      industry: 'General',
      keyServices: (params.customKeywords || '').split(',').map(k => k.trim()).filter(k => k),
      targetAudience: params.location || 'General audience',
      locationInsights: params.location ? `Market focused on ${params.location}` : 'Global market',
      contentThemes: (params.intentPhrases || '').split(',').map(p => p.trim()).filter(p => p),
      complianceAreas: [],
      businessModel: 'Service/Product provider',
      marketPosition: 'Competitive positioning',
      suggestedKeywords: (params.customKeywords || '').split(',').map(k => k.trim()).filter(k => k),
      contentTopics: (params.intentPhrases || '').split(',').map(p => p.trim()).filter(p => p)
    };
  }
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

    const keywordContext = [
      locationContext,
      customKeywords || '',
      intentPhrases || '',
      `Domain: ${normalizedDomain}`,
    ]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .join('\n');

    await bootstrapKeywordsForDomain(newDomain.id, normalizedDomain, keywordContext, location);

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
