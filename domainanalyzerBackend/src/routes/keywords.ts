import { Router, Request, Response } from 'express';
import { PrismaClient } from '../../generated/prisma';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { generateKeywordsForDomain } from '../services/geminiService';
import OpenAI from 'openai';
import { advanceDomainStep } from './domain';

const router = Router();
const prisma = new PrismaClient();
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// GET /api/keywords/:domainId - Get keywords for a domain
router.get('/:domainId', authenticateToken, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const domainId = Number(req.params.domainId);
  const { selected } = req.query;
  
  if (!domainId) {
    return res.status(400).json({ error: 'Invalid domainId' });
  }

  try {
    // Verify domain access
    const domain = await prisma.domain.findUnique({
      where: { id: domainId },
      select: { id: true, userId: true }
    });

    if (!domain || domain.userId !== authReq.user.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Build where clause based on query parameters
    const whereClause: any = { domainId };
    
    if (selected === 'true') {
      whereClause.isSelected = true;
    }

    // Get keywords for the domain
    const keywords = await prisma.keyword.findMany({
      where: whereClause,
      orderBy: { volume: 'desc' },
      select: {
        id: true,
        term: true,
        volume: true,
        difficulty: true,
        cpc: true,
        domainId: true,
        isSelected: true,
        createdAt: true,
        updatedAt: true
      }
    });

    res.json({
      success: true,
      keywords,
      totalKeywords: keywords.length
    });

  } catch (error) {
    console.error('Error fetching keywords:', error);
    res.status(500).json({ error: 'Failed to fetch keywords' });
  }
});

// POST /api/keywords/:domainId/select - Select/deselect keywords
router.post('/:domainId/select', authenticateToken, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const domainId = Number(req.params.domainId);
  const { keywordIds, selected } = req.body;

  if (!domainId || !keywordIds || typeof selected !== 'boolean') {
    return res.status(400).json({ error: 'DomainId, keywordIds, and selected are required' });
  }

  try {
    // Verify domain access
    const domain = await prisma.domain.findUnique({
      where: { id: domainId },
      select: { id: true, userId: true }
    });

    if (!domain || domain.userId !== authReq.user.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Convert keywordIds to integers and update keyword selection status
    const numericKeywordIds = keywordIds.map((id: any) => Number(id));
    
    const updateResult = await prisma.keyword.updateMany({
      where: {
        id: { in: numericKeywordIds },
        domainId
      },
      data: { isSelected: selected }
    });

    if (selected && updateResult.count > 0) {
      await advanceDomainStep(domainId, 2);
    } else if (!selected) {
      await advanceDomainStep(domainId, 1);
    }

    res.json({ success: true, message: `Keywords ${selected ? 'selected' : 'deselected'} successfully` });

  } catch (error) {
    console.error('Error updating keyword selection:', error);
    res.status(500).json({ error: 'Failed to update keyword selection' });
  }
});

// POST /api/keywords/analyze - Analyze a single keyword using AI
router.post('/analyze', authenticateToken, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { keyword, domain, location, domainId } = req.body;

  if (!keyword || !domain) {
    return res.status(400).json({ error: 'Keyword and domain are required' });
  }

  try {
    // Get domain context if domainId is provided
    let domainContext = '';
    if (domainId) {
      try {
        const domainRecord = await prisma.domain.findUnique({
          where: { id: parseInt(domainId) },
          select: { context: true, locationContext: true }
        });
        if (domainRecord?.context) {
          domainContext = domainRecord.context;
        }
      } catch (error) {
        console.warn('Could not fetch domain context:', error);
      }
    }

    // Create comprehensive AI analysis prompt
    const analysisPrompt = `
You are an expert SEO analyst with access to Google Keyword Planner, Ahrefs, and SEMrush data. Analyze the keyword "${keyword}" for the domain ${domain}.

Domain Context: ${domainContext || 'No specific context provided'}
Location: ${location || 'Global'}

Please provide a comprehensive analysis with the following data for a keyword analysis table:

1. **Search Volume**: Estimate monthly search volume (realistic numbers)
2. **Keyword Difficulty (KD)**: Score from 0-100 based on competition
3. **Competition Level**: Low, Medium, or High
4. **Search Intent**: Informational, Commercial, Transactional, or Navigational
6. **Organic Traffic Potential**: Estimated organic traffic based on volume and difficulty
7. **Paid Traffic Potential**: Estimated paid traffic potential
8. **Trend**: Rising, Stable, or Declining
9. **Current Position**: Estimated current ranking position (0 if not ranked)

Consider the following factors:
- Keyword length and specificity
- Commercial intent and monetization potential
- Competition from established websites
- Seasonal trends and market demand
- Location-specific factors if applicable
- Domain authority and content relevance

Return ONLY a JSON object with this exact structure:
{
  "keyword": "exact keyword phrase",
  "volume": 2500,
  "kd": 65,
  "competition": "Medium",
  "intent": "Commercial",
  "organic": 150,
  "paid": 75,
  "trend": "Rising",
  "position": 0,
  "analysis": "Brief analysis of keyword potential and strategy"
}
`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: analysisPrompt }],
      temperature: 0.3,
      max_tokens: 1000
    });

    const response = completion.choices[0]?.message?.content;
    if (!response) {
      throw new Error('No response from AI analysis');
    }

    let analysisResult;
    try {
      // Clean the response to remove markdown formatting
      let cleanResponse = response.trim();
      if (cleanResponse.startsWith('```json')) {
        cleanResponse = cleanResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (cleanResponse.startsWith('```')) {
        cleanResponse = cleanResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }
      
      analysisResult = JSON.parse(cleanResponse);
    } catch (parseError) {
      console.error('Error parsing AI analysis response:', parseError);
      throw new Error('Failed to parse AI analysis response');
    }

    // Validate and ensure all required fields are present
    const validatedResult = {
      keyword: analysisResult.keyword || keyword,
      volume: analysisResult.volume || 1000,
      kd: analysisResult.kd || 50,
      competition: analysisResult.competition || 'Medium',
      cpc: 0,
      intent: analysisResult.intent || 'Commercial',
      organic: analysisResult.organic || Math.floor((analysisResult.volume || 1000) * 0.1),
      paid: analysisResult.paid || Math.floor((analysisResult.volume || 1000) * 0.05),
      trend: analysisResult.trend || 'Stable',
      position: analysisResult.position || 0,
      url: analysisResult.url || null,
      analysis: analysisResult.analysis || 'AI analysis completed successfully',
      tokenUsage: completion.usage?.total_tokens || 0
    };

    res.json({
      success: true,
      ...validatedResult
    });

  } catch (error) {
    console.error('Keyword analysis error:', error);
    res.status(500).json({ 
      error: 'Failed to analyze keyword with AI',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /api/keywords/:domainId/custom - Add a custom analyzed keyword to the domain
router.post('/:domainId/custom', authenticateToken, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const domainId = Number(req.params.domainId);
  const { keyword, volume, kd, competition, cpc, intent, organic, paid, trend, position, url, analysis } = req.body;

  if (!domainId || !keyword) {
    return res.status(400).json({ error: 'DomainId and keyword are required' });
  }

  try {
    // Verify domain access
    const domain = await prisma.domain.findUnique({
      where: { id: domainId },
      select: { id: true, userId: true, url: true }
    });

    if (!domain || domain.userId !== authReq.user.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Check if keyword already exists for this domain
    const existingKeyword = await prisma.keyword.findFirst({
      where: {
        term: keyword,
        domainId: domainId
      }
    });

    if (existingKeyword) {
      return res.status(400).json({ error: 'Keyword already exists for this domain' });
    }

    // Create the custom keyword
    const newKeyword = await prisma.keyword.create({
      data: {
        term: keyword,
        volume: volume || 1000,
        difficulty: competition || 'Medium',
        cpc: 0,
        intent: intent || 'Commercial',
        domainId: domainId,
        isSelected: false
      }
    });

    res.json({
      success: true,
      keyword: {
        id: newKeyword.id.toString(),
        keyword: newKeyword.term,
        intent: newKeyword.intent || 'Commercial',
        volume: newKeyword.volume,
        kd: parseInt(newKeyword.difficulty) || 50,
        competition: newKeyword.difficulty === 'High' ? 'High' : newKeyword.difficulty === 'Low' ? 'Low' : 'Medium',
        cpc: newKeyword.cpc,
        organic: organic || Math.floor(newKeyword.volume * 0.1),
        paid: paid || Math.floor(newKeyword.volume * 0.05),
        trend: trend || 'Stable',
        position: position || 0,
        url: url || null,
        updated: new Date().toISOString().split('T')[0],
        isCustom: true,
        selected: false
      }
    });

  } catch (error) {
    console.error('Error adding custom keyword:', error);
    res.status(500).json({ error: 'Failed to add custom keyword' });
  }
});

export default router; 