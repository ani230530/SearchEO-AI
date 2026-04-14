import OpenAI from 'openai';
import { PrismaClient } from '../../generated/prisma';
import { redditMiningService } from './redditMiningService';
import { nichePatternService } from './nichePatternService';
import { humanPromptGenerator } from './humanPromptGenerator';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SERP_API_KEY = process.env.SERP_API_KEY;
if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set in environment variables');

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const prisma = new PrismaClient();

// ── SERP API (legacy, kept for Quora mining fallback) ────────────────────────
// Reddit mining now uses PullPush API via redditMiningService.ts

const searchSerpApi = async (query: string, engine: 'reddit' | 'quora') => {
  if (!SERP_API_KEY) return null;
  const baseUrl = 'https://serpapi.com/search';
  const siteRestriction = engine === 'reddit' ? 'site:reddit.com' : 'site:quora.com';
  const searchQuery = `${query} ${siteRestriction}`;

  const params = new URLSearchParams({
    api_key: SERP_API_KEY,
    engine: 'google',
    q: searchQuery,
    gl: 'us',
    hl: 'en',
    num: '10'
  });

  try {
    const response = await fetch(`${baseUrl}?${params}`);
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
};

const extractQuoraData = (serpData: any) => {
  if (!serpData || !serpData.organic_results) return [];
  return serpData.organic_results
    .filter((result: any) => result.link && result.link.includes('quora.com'))
    .map((result: any) => ({
      title: result.title || '',
      content: result.snippet || '',
      url: result.link || '',
      author: '',
      answers: 0,
      views: 0
    }));
};

export interface IntentPhraseProgress {
  phase: string;
  step: string;
  progress: number;
  message: string;
  data?: any;
}

export type ProgressCallback = (progress: IntentPhraseProgress) => void;

export interface CommunityMiningData {
  platform: string;
  insights: any[];
  sentiment: string;
  frequency: number;
  subredditAnalysis?: any[]; // Added for Reddit
  topicAnalysis?: any[]; // Added for Quora
  extractedFAQs?: any; // Added for real FAQ extraction
}

export interface SearchPatternData {
  patterns: any[];
  volume: number;
  seasonality: any;
  trends: any;
}

export interface IntentClassificationData {
  intent: string;
  confidence: number;
  patterns: any[];
}

export interface GeneratedPhraseData {
  phrase: string;
  relevanceScore: number;
  sources: string[];
  trend: string;
  intent: string;
  communityInsights: any;
  searchPatterns: any;
  keywordId: number;
}

export class IntentPhraseService {
  private domainId: number;
  private keywords: any[];
  private domain: any;
  private onProgress: ProgressCallback;
  private onPhraseGenerated?: (phrase: any) => void;

  constructor(domainId: number, keywords: any[], domain: any, onProgress: ProgressCallback, onPhraseGenerated?: (phrase: any) => void) {
    this.domainId = domainId;
    this.keywords = keywords;
    this.domain = domain;
    this.onProgress = onProgress;
    this.onPhraseGenerated = onPhraseGenerated;
  }

  private extractJsonFromResponse(content: string): any {
    // Extract JSON from markdown code blocks if present
    let jsonContent = content;
    if (content.includes('```json')) {
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        jsonContent = jsonMatch[1];
      }
    } else if (content.includes('```')) {
      const codeMatch = content.match(/```\s*([\s\S]*?)\s*```/);
      if (codeMatch) {
        jsonContent = codeMatch[1];
      }
    }
    
    try {
      return JSON.parse(jsonContent);
    } catch (error) {
      console.error('JSON parsing error:', error);
      console.error('Content:', content);
      console.error('Extracted JSON:', jsonContent);
      return {};
    }
  }

  async generateIntentPhrases(): Promise<GeneratedPhraseData[]> {
    try {
      // Phase 1: Semantic Content Analysis
      await this.semanticContentAnalysis();

      // Phase 2: Community Data Mining
      await this.communityDataMining();

      // Phase 3: Competitor Analysis
      await this.competitorAnalysis();

      // Phase 4: Search Pattern Analysis
      await this.searchPatternAnalysis();

      // Phase 5: Phrase Generation
      const phrases = await this.phraseGeneration();

      // Phase 6: Intent Classification Engine
      await this.intentClassificationEngine();

      // Phase 7: Relevance Score Calculation
      await this.relevanceScoreCalculation([]);

      return phrases;
    } catch (error) {
      console.error('Error in intent phrase generation:', error);
      throw error;
    }
  }

  private async semanticContentAnalysis(): Promise<void> {
    this.onProgress({
      phase: 'semantic_analysis',
      step: 'Semantic Content Analysis',
      progress: 0,
      message: 'Analyzing brand voice, theme, and target audience'
    });

    try {
      const semanticPrompt = `
Analyze the domain context and extract comprehensive semantic insights for strategic content and community research planning.

**Domain Information:**
- URL: ${this.domain.url || '[URL not provided]'}
- Context: ${this.domain.context || '[No context provided]'}
- Location: ${this.domain.location || 'Global'}

**Analysis Requirements:**

Provide detailed analysis in the following areas, making reasonable inferences where direct information is limited. Clearly distinguish between observed facts and educated assumptions.

## 1. Brand Voice Analysis
Analyze and identify:
- **Tone**: Professional level, emotional approach, formality
- **Personality**: 3-5 key personality traits with examples
- **Communication Style**: How they speak to their audience
- **Brand Values**: Core principles reflected in messaging
- **Unique Voice Elements**: Distinctive communication patterns

## 2. Theme Analysis
Identify:
- **Primary Themes**: Top 3-5 content themes (with confidence scores)
- **Industry Focus**: Specific industry/sector positioning
- **Content Categories**: Types of content they likely produce
- **Seasonal/Trending Topics**: Time-sensitive themes relevant to their space
- **Content Gaps**: Potential unexplored themes in their domain

## 3. Target Audience Analysis
Profile the likely audience:
- **Demographics**: Age, location, professional background
- **Psychographics**: Interests, values, lifestyle
- **User Personas**: 2-3 distinct user types with names and descriptions
- **Pain Points**: 5-7 specific problems they face
- **Goals**: What they're trying to achieve
- **Information-Seeking Behavior**: How and where they search for solutions

## 4. FAQ and Questions Analysis
Generate likely questions:
- **Product/Service Questions**: Direct inquiries about offerings
- **Process Questions**: How-to and procedural inquiries
- **Comparison Questions**: Versus competitors or alternatives
- **Troubleshooting**: Common problems and solutions
- **Pricing/Cost**: Financial considerations
- **Implementation**: Getting started and onboarding queries

## 5. Community Context Analysis
Identify relevant communities:
- **Primary Platforms**: Top 3 platforms where target audience congregates
- **Subreddit Recommendations**: 5-7 relevant subreddits with subscriber counts
- **Quora Spaces**: Relevant Quora topics and spaces
- **Professional Communities**: LinkedIn groups, industry forums
- **Discussion Topics**: What conversations happen in these spaces
- **Engagement Patterns**: How the audience typically interacts

## 6. Search Intent Analysis
Predict search behavior:
- **Informational Queries**: Learning and research-focused searches
- **Commercial Queries**: Comparison and evaluation searches
- **Transactional Queries**: Ready-to-buy searches
- **Local Queries**: Location-specific searches (if applicable)
- **Long-tail Opportunities**: Specific, niche search phrases

## Output Format
Structure as valid JSON with this exact schema:

{
  "analysisConfidence": "high|medium|low",
  "dataLimitations": "Description of any analysis limitations",
  "brandVoice": {
    "tone": "string",
    "personality": ["trait1", "trait2", "trait3"],
    "communicationStyle": "string",
    "brandValues": ["value1", "value2"],
    "uniqueElements": ["element1", "element2"]
  },
  "themes": {
    "primary": [
      {"theme": "string", "confidence": 0.9},
      {"theme": "string", "confidence": 0.8}
    ],
    "industryFocus": "string",
    "contentCategories": ["category1", "category2"],
    "seasonalTopics": ["topic1", "topic2"],
    "contentGaps": ["gap1", "gap2"]
  },
  "targetAudience": {
    "demographics": {
      "ageRange": "string",
      "location": "string",
      "profession": "string"
    },
    "psychographics": ["interest1", "interest2"],
    "personas": [
      {
        "name": "string",
        "description": "string",
        "painPoints": ["point1", "point2"]
      }
    ],
    "searchBehavior": "string"
  },
  "faqs": {
    "productService": ["question1", "question2"],
    "process": ["question1", "question2"],
    "comparison": ["question1", "question2"],
    "troubleshooting": ["question1", "question2"],
    "pricing": ["question1", "question2"],
    "implementation": ["question1", "question2"]
  },
  "communityContext": {
    "primaryPlatforms": [
      {"platform": "Reddit", "relevance": "high"},
      {"platform": "Quora", "relevance": "medium"}
    ],
    "subreddits": [
      {"name": "r/example", "subscribers": "100k", "relevance": "high"}
    ],
    "quoraSpaces": ["Space Name 1", "Space Name 2"],
    "discussionTopics": ["topic1", "topic2"],
    "engagementPatterns": "string"
  },
  "searchIntents": {
    "informational": ["query1", "query2"],
    "commercial": ["query1", "query2"],
    "transactional": ["query1", "query2"],
    "local": ["query1", "query2"],
    "longTail": ["specific query 1", "specific query 2"]
  },
  "recommendations": {
    "priorityCommunities": ["community1", "community2"],
    "keySearchTerms": ["term1", "term2"],
    "contentOpportunities": ["opportunity1", "opportunity2"]
  }
}

Provide a comprehensive analysis that will be used to inform community research, content strategy, and search phrase generation.`;

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: semanticPrompt }],
        temperature: 0.3,
        max_tokens: 3000
      });

      const response = completion.choices[0]?.message?.content;
      if (response) {
        let semanticData;
        try {
          semanticData = JSON.parse(response);
        } catch {
          semanticData = {
            analysisConfidence: "medium",
            dataLimitations: "Limited domain context provided",
            brandVoice: { 
              tone: 'Professional', 
              personality: ['Innovative', 'Reliable', 'Expert'], 
              communicationStyle: 'Informative and authoritative',
              brandValues: ['Quality', 'Innovation', 'Customer Success'],
              uniqueElements: ['Technical expertise', 'Industry leadership']
            },
            themes: {
              primary: [
                {theme: 'Technology Solutions', confidence: 0.8},
                {theme: 'Business Optimization', confidence: 0.7}
              ],
              industryFocus: 'Technology and Business Services',
              contentCategories: ['How-to guides', 'Industry insights', 'Case studies'],
              seasonalTopics: ['Year-end planning', 'Technology trends'],
              contentGaps: ['Competitor analysis', 'ROI measurement']
            },
            targetAudience: {
              demographics: {
                ageRange: '25-45',
                location: 'Global',
                profession: 'Business professionals and decision makers'
              },
              psychographics: ['Tech-savvy', 'Results-oriented', 'Innovation-focused'],
              personas: [
                {
                  name: 'Sarah the Decision Maker',
                  description: 'Mid-level manager looking for technology solutions',
                  painPoints: ['Limited budget', 'Complex implementation', 'ROI uncertainty']
                }
              ],
              searchBehavior: 'Research-intensive, comparison-focused'
            },
            faqs: {
              productService: ['What services do you offer?', 'How does your solution work?'],
              process: ['How to implement your solution?', 'What is the onboarding process?'],
              comparison: ['How do you compare to competitors?', 'What are the alternatives?'],
              troubleshooting: ['Common implementation issues', 'Performance optimization'],
              pricing: ['What are your pricing plans?', 'Is there a free trial?'],
              implementation: ['How long does setup take?', 'What support is available?']
            },
            communityContext: {
              primaryPlatforms: [
                {platform: 'Reddit', relevance: 'high'},
                {platform: 'Quora', relevance: 'medium'},
                {platform: 'LinkedIn', relevance: 'high'}
              ],
              subreddits: [
                {name: 'r/technology', subscribers: '10M+', relevance: 'high'},
                {name: 'r/business', subscribers: '5M+', relevance: 'high'}
              ],
              quoraSpaces: ['Technology', 'Business Strategy', 'Digital Transformation'],
              discussionTopics: ['Technology trends', 'Business optimization', 'Digital transformation'],
              engagementPatterns: 'Professional discussions, case study sharing, problem-solving'
            },
            searchIntents: {
              informational: ['technology trends 2024', 'business optimization strategies'],
              commercial: ['best technology solutions', 'technology provider comparison'],
              transactional: ['technology services pricing', 'technology consultation booking'],
              local: ['technology services near me', 'local technology consultants'],
              longTail: ['how to implement technology solutions for small business', 'technology ROI measurement best practices']
            },
            recommendations: {
              priorityCommunities: ['r/technology', 'LinkedIn Technology Groups'],
              keySearchTerms: ['technology solutions', 'business optimization', 'digital transformation'],
              contentOpportunities: ['Case studies', 'How-to guides', 'Industry trend analysis']
            }
          };
        }

        // Save semantic analysis to database
        await prisma.semanticAnalysis.create({
          data: {
            domainId: this.domainId,
            contentSummary: JSON.stringify(semanticData),
            keyThemes: semanticData.themes?.primary?.map((t: any) => t.theme) || [],
            brandVoice: JSON.stringify(semanticData.brandVoice || {}),
            targetAudience: semanticData.targetAudience || {},
            contentGaps: semanticData.themes?.contentGaps || [],
            tokenUsage: completion.usage?.total_tokens || 0
          }
        });

        this.onProgress({
          phase: 'semantic_analysis',
          step: 'Semantic Content Analysis',
          progress: 100,
          message: 'Semantic content analysis completed',
          data: semanticData
        });
      }
    } catch (error) {
      console.error('Error in semantic content analysis:', error);
      this.onProgress({
        phase: 'semantic_analysis',
        step: 'Semantic Content Analysis',
        progress: 100,
        message: 'Semantic content analysis completed with fallback data'
      });
    }
  }

  private async communityDataMining(): Promise<void> {
    this.onProgress({
      phase: 'community_mining',
      step: 'Community Data Mining',
      progress: 0,
      message: 'Mining real Reddit data via PullPush API + extracting prompt patterns'
    });

    // 1. GET SEMANTIC ANALYSIS CONTEXT
    const semanticAnalysis = await prisma.semanticAnalysis.findFirst({
      where: { domainId: this.domainId },
      orderBy: { createdAt: 'desc' }
    });

    if (!semanticAnalysis) {
      throw new Error('Semantic analysis must be completed first');
    }

    const semanticContext = JSON.parse(semanticAnalysis.contentSummary);
    const targetSubreddits = (semanticContext.communityContext?.subreddits || [])
      .map((s: any) => (typeof s === 'string' ? s : s.name || '').replace(/^r\//, ''))
      .filter(Boolean);
    const targetQuoraSpaces = semanticContext.communityContext?.quoraSpaces || [];

    // Determine niche from themes
    const niche = semanticContext.themes?.industryFocus
      || semanticContext.themes?.primary?.[0]?.theme
      || this.keywords[0]?.term
      || 'general';

    this.onProgress({
      phase: 'community_mining',
      step: 'Community Data Mining',
      progress: 10,
      message: `Mining ${targetSubreddits.length} subreddits via PullPush API for niche: "${niche}"`
    });

    // 2. CHECK IF WE ALREADY HAVE PATTERNS FOR THIS NICHE
    const hasPatterns = await nichePatternService.hasPatterns(niche, 10);

    if (!hasPatterns) {
      // 3a. MINE REDDIT VIA PULLPUSH (real data, real scores)
      try {
        const keywordTerms = this.keywords.map(k => k.term).slice(0, 5);
        const subredditsToMine = targetSubreddits.length > 0
          ? targetSubreddits.slice(0, 5)
          : ['technology', 'smallbusiness', 'SaaS', 'startups'];

        this.onProgress({
          phase: 'community_mining',
          step: 'Community Data Mining',
          progress: 25,
          message: `Mining Reddit posts from r/${subredditsToMine.join(', r/')}...`
        });

        const miningResult = await redditMiningService.mineNiche({
          niche,
          subreddits: subredditsToMine,
          keywords: keywordTerms,
        });

        this.onProgress({
          phase: 'community_mining',
          step: 'Community Data Mining',
          progress: 50,
          message: `Found ${miningResult.postsFound} Reddit posts. Extracting prompt patterns...`
        });

        // 3b. EXTRACT PATTERNS FROM MINED REDDIT POSTS
        const redditPatterns = await prisma.redditPattern.findMany({
          where: { niche: { equals: niche, mode: 'insensitive' } },
          orderBy: { postScore: 'desc' },
          take: 50,
        });

        if (redditPatterns.length > 0) {
          const patterns = await nichePatternService.extractPatternsFromReddit({
            niche,
            redditPosts: redditPatterns.map(p => ({
              title: p.postTitle,
              subreddit: p.subreddit,
              score: p.postScore,
              url: p.postUrl || undefined,
            })),
          });

          const stored = await nichePatternService.storePatterns(niche, patterns);
          console.log(`[CommunityMining] Stored ${stored} prompt patterns for niche "${niche}"`);
        }
      } catch (err) {
        console.warn('[CommunityMining] PullPush mining failed, will use LLM fallback:', err);
      }

      // 3c. IF STILL NO PATTERNS, GENERATE FALLBACK VIA LLM
      const patternCount = await prisma.nichePromptPattern.count({
        where: { niche: { equals: niche, mode: 'insensitive' } },
      });

      if (patternCount < 10) {
        this.onProgress({
          phase: 'community_mining',
          step: 'Community Data Mining',
          progress: 65,
          message: 'Generating fallback prompt patterns via LLM...'
        });

        const fallbackPatterns = await nichePatternService.generateFallbackPatterns(
          niche,
          this.domain.context || ''
        );
        await nichePatternService.storePatterns(niche, fallbackPatterns);
      }
    } else {
      this.onProgress({
        phase: 'community_mining',
        step: 'Community Data Mining',
        progress: 50,
        message: `Reusing ${await prisma.nichePromptPattern.count({ where: { niche: { equals: niche, mode: 'insensitive' } } })} existing patterns for niche "${niche}"`
      });
    }

    // 4. SAVE COMMUNITY MINING RESULTS PER KEYWORD (for DB compatibility)
    for (const keyword of this.keywords) {
      try {
        await this.saveCommunityMiningResult(keyword.id, 'reddit', {
          platform: 'reddit',
          insights: [],
          sentiment: 'neutral',
          frequency: 0,
        });
      } catch { /* ignore duplicates */ }
    }

    // 5. QUORA MINING (keep SERP API for Quora if available)
    if (SERP_API_KEY && targetQuoraSpaces.length > 0) {
      this.onProgress({
        phase: 'community_mining',
        step: 'Community Data Mining',
        progress: 80,
        message: 'Mining Quora discussions...'
      });

      for (const keyword of this.keywords.slice(0, 3)) {
        try {
          const quoraData = await this.mineQuoraFromTargetSpaces(
            keyword.term,
            [`${keyword.term} recommendation`, `${keyword.term} best tool`, `how to ${keyword.term}`],
            targetQuoraSpaces,
            semanticContext
          );
          await this.saveCommunityMiningResult(keyword.id, 'quora', quoraData);
          await this.delay(1000);
        } catch { /* ignore */ }
      }
    }

    // Store niche info for use in phrase generation
    (this as any)._niche = niche;

    this.onProgress({
      phase: 'community_mining',
      step: 'Community Data Mining',
      progress: 100,
      message: 'Community data mining completed'
    });
  }

  private generateContextualSearchQueries(keyword: string, semanticContext: any): { reddit: string[], quora: string[] } {
    const brandVoice = semanticContext.brandVoice || {};
    const targetAudience = semanticContext.targetAudience || {};
    const faqs = semanticContext.faqs || {};
    const themes = semanticContext.themes?.primary || [];
    
    // Generate queries that align with semantic analysis
    const redditQueries = [
      // Use actual FAQ questions identified in semantic analysis
      ...Object.values(faqs).flat().slice(0, 3).map((faq: any) => `${keyword} ${faq}`),
      
      // Use target audience context
      `${keyword} for ${targetAudience.demographics?.profession || 'business professionals'}`,
      
      // Use brand themes
      ...themes.slice(0, 2).map((theme: any) => `${keyword} ${theme.theme}`),
      
      // Pain point focused (from target audience analysis)
      ...(targetAudience.personas?.[0]?.painPoints || []).slice(0, 2).map((pain: any) => `${keyword} ${pain}`),
      
      // Generic patterns
      `${keyword} problems solutions reddit`,
      `${keyword} best practices community`
    ];

    const quoraQueries = [
      // Use actual FAQ categories
      ...Object.keys(faqs).map(category => `${keyword} ${category} questions`),
      
      // Target audience specific
      `${keyword} for ${targetAudience.demographics?.profession || 'professionals'}`,
      
      // Implementation focused (from semantic analysis)
      `how to implement ${keyword}`,
      `${keyword} vs alternatives`,
      `${keyword} best practices`
    ];

    return {
      reddit: redditQueries.slice(0, 7),
      quora: quoraQueries.slice(0, 7)
    };
  }

  private async mineRedditFromTargetCommunities(keyword: string, queries: string[], targetSubreddits: any[], semanticContext: any): Promise<CommunityMiningData> {
    const allRedditData = [];
    
    for (const query of queries) {
      try {
        // Search with subreddit targeting
        const subredditQuery = targetSubreddits.length > 0 
          ? `${query} site:reddit.com/r/${targetSubreddits[0].name.replace('r/', '')}`
          : `${query} site:reddit.com`;
          
        const serpData = await searchSerpApi(subredditQuery, 'reddit');
        const redditResults = (serpData?.organic_results || [])
          .filter((r: any) => r.link?.includes('reddit.com'))
          .map((r: any) => ({
            title: r.title || '', content: r.snippet || '',
            subreddit: (r.link?.match(/reddit\.com\/r\/([^/]+)/) || [])[1] || '',
            url: r.link || '', score: 0, comments: 0,
          }));
        
        // Filter for target subreddits
        const filteredResults = redditResults.filter((result: any) => 
          targetSubreddits.some((sub: any) => 
            result.subreddit && result.subreddit.toLowerCase().includes(sub.name.replace('r/', '').toLowerCase())
          )
        );
        
        allRedditData.push(...filteredResults);
        await this.delay(500); // Rate limiting
      } catch (error) {
        console.error(`Error mining Reddit for query "${query}":`, error);
      }
    }

    // Extract real FAQs from the data
    const extractedFAQs = this.extractRealFAQsFromCommunityData(allRedditData, [], semanticContext.faqs || {});

    return {
      platform: 'reddit',
      insights: allRedditData.map(post => ({
        type: 'community_post',
        content: post.title + ' ' + post.content,
        subreddit: post.subreddit,
        engagement: post.score + post.comments,
        relevance: this.calculateRelevanceToSemantic(post, semanticContext)
      })),
      sentiment: this.calculateSentiment(allRedditData),
      frequency: this.calculateFrequency(allRedditData),
      subredditAnalysis: this.analyzeSubredditData(allRedditData),
      extractedFAQs: extractedFAQs
    };
  }

  private async mineQuoraFromTargetSpaces(keyword: string, queries: string[], targetSpaces: string[], semanticContext: any): Promise<CommunityMiningData> {
    const allQuoraData = [];
    
    for (const query of queries) {
      try {
        // Target specific Quora spaces
        const spaceQuery = targetSpaces.length > 0 
          ? `${query} site:quora.com ${targetSpaces[0]}`
          : `${query} site:quora.com`;
          
        const serpData = await searchSerpApi(spaceQuery, 'quora');
        const quoraResults = extractQuoraData(serpData);
        
        allQuoraData.push(...quoraResults);
        await this.delay(500); // Rate limiting
      } catch (error) {
        console.error(`Error mining Quora for query "${query}":`, error);
      }
    }

    // Extract real FAQs from the data
    const extractedFAQs = this.extractRealFAQsFromCommunityData([], allQuoraData, semanticContext.faqs || {});

    return {
      platform: 'quora',
      insights: allQuoraData.map(question => ({
        type: 'community_question',
        content: question.title + ' ' + question.content,
        engagement: question.answers + question.views,
        relevance: this.calculateRelevanceToSemantic(question, semanticContext)
      })),
      sentiment: this.calculateSentiment(allQuoraData),
      frequency: this.calculateFrequency(allQuoraData),
      topicAnalysis: this.analyzeQuoraTopicData(allQuoraData),
      extractedFAQs: extractedFAQs
    };
  }

  private extractRealFAQsFromCommunityData(redditData: any[], quoraData: any[], expectedFAQs: any): any {
    const extractedFAQs: any = {
      productService: [] as string[],
      process: [] as string[],
      comparison: [] as string[],
      troubleshooting: [] as string[],
      pricing: [] as string[],
      implementation: [] as string[]
    };

    // Extract FAQs from Reddit posts
    redditData.forEach((post: any) => {
      const content = (post.title + ' ' + post.content).toLowerCase();
      
      // Categorize based on content analysis
      if (content.includes('how to') || content.includes('implement')) {
        extractedFAQs.implementation.push(post.title);
      } else if (content.includes('vs') || content.includes('compare') || content.includes('alternative')) {
        extractedFAQs.comparison.push(post.title);
      } else if (content.includes('problem') || content.includes('issue') || content.includes('error')) {
        extractedFAQs.troubleshooting.push(post.title);
      } else if (content.includes('price') || content.includes('cost') || content.includes('free')) {
        extractedFAQs.pricing.push(post.title);
      } else {
        extractedFAQs.productService.push(post.title);
      }
    });

    // Extract FAQs from Quora questions
    quoraData.forEach((question: any) => {
      const content = question.title.toLowerCase();
      
      // Categorize based on question analysis
      if (content.includes('how to') || content.includes('implement')) {
        extractedFAQs.implementation.push(question.title);
      } else if (content.includes('vs') || content.includes('compare') || content.includes('better')) {
        extractedFAQs.comparison.push(question.title);
      } else if (content.includes('what is') || content.includes('what are')) {
        extractedFAQs.productService.push(question.title);
      } else if (content.includes('process') || content.includes('steps')) {
        extractedFAQs.process.push(question.title);
      }
    });

    // Clean and limit results
    Object.keys(extractedFAQs).forEach(category => {
      extractedFAQs[category] = [...new Set(extractedFAQs[category])].slice(0, 5);
    });

    return extractedFAQs;
  }

  private calculateSentiment(data: any[]): string {
    if (data.length === 0) return 'neutral';
    
    // Simple sentiment calculation based on content analysis
    const positiveWords = ['good', 'great', 'excellent', 'amazing', 'love', 'best', 'helpful', 'solved'];
    const negativeWords = ['bad', 'terrible', 'awful', 'hate', 'worst', 'problem', 'issue', 'broken'];
    
    let positiveCount = 0;
    let negativeCount = 0;
    
    data.forEach(item => {
      const content = (item.content || item.title || '').toLowerCase();
      positiveWords.forEach(word => {
        if (content.includes(word)) positiveCount++;
      });
      negativeWords.forEach(word => {
        if (content.includes(word)) negativeCount++;
      });
    });
    
    if (positiveCount > negativeCount * 1.5) return 'positive';
    if (negativeCount > positiveCount * 1.5) return 'negative';
    return 'neutral';
  }

  private calculateFrequency(data: any[]): number {
    if (data.length === 0) return 0;
    
    // Calculate frequency based on engagement metrics
    const totalEngagement = data.reduce((sum, item) => {
      return sum + (item.score || 0) + (item.comments || 0) + (item.answers || 0) + (item.views || 0);
    }, 0);
    
    return Math.min(100, Math.round(totalEngagement / data.length));
  }

  private extractQuoraTopic(url: string): string | null {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/');
      // Extract topic from Quora URL structure
      for (let i = 0; i < pathParts.length; i++) {
        if (pathParts[i] === 'topic' && pathParts[i + 1]) {
          return pathParts[i + 1].replace(/-/g, ' ');
        }
      }
    } catch (error) {
      console.error('Error extracting Quora topic:', error);
    }
    return null;
  }

  private calculateRelevanceToSemantic(post: any, semanticContext: any): number {
    let relevanceScore = 0;
    const content = (post.title + ' ' + (post.content || '')).toLowerCase();
    
    // Check alignment with brand values
    const brandValues = semanticContext.brandVoice?.brandValues || [];
    brandValues.forEach((value: string) => {
      if (content.includes(value.toLowerCase())) relevanceScore += 10;
    });
    
    // Check alignment with target audience pain points
    const painPoints = semanticContext.targetAudience?.personas?.[0]?.painPoints || [];
    painPoints.forEach((pain: string) => {
      if (content.includes(pain.toLowerCase())) relevanceScore += 15;
    });
    
    // Check theme alignment
    const themes = semanticContext.themes?.primary || [];
    themes.forEach((theme: any) => {
      if (content.includes(theme.theme.toLowerCase())) relevanceScore += 10;
    });
    
    return Math.min(100, relevanceScore);
  }

  private analyzeSubredditData(redditData: any[]): any[] {
    const subredditInsights = new Map();
    
    redditData.forEach((result: any) => {
      if (result.subreddit) {
        if (!subredditInsights.has(result.subreddit)) {
          subredditInsights.set(result.subreddit, {
            count: 0,
            totalScore: 0,
            totalComments: 0,
            posts: []
          });
        }
        const insight = subredditInsights.get(result.subreddit);
        insight.count++;
        insight.totalScore += result.score;
        insight.totalComments += result.comments;
        insight.posts.push(result);
      }
    });

    return Array.from(subredditInsights.entries()).map(([subreddit, data]: [string, any]) => ({
      subreddit,
      postCount: data.count,
      avgScore: data.totalScore / data.count,
      avgComments: data.totalComments / data.count,
      topPosts: data.posts.slice(0, 3)
    }));
  }

  private analyzeQuoraTopicData(quoraData: any[]): any[] {
    const topicInsights = new Map();
    
    quoraData.forEach(result => {
      const topic = this.extractQuoraTopic(result.url);
      if (topic) {
        if (!topicInsights.has(topic)) {
          topicInsights.set(topic, {
            count: 0,
            totalAnswers: 0,
            totalViews: 0,
            questions: []
          });
        }
        const insight = topicInsights.get(topic);
        insight.count++;
        insight.totalAnswers += result.answers;
        insight.totalViews += result.views;
        insight.questions.push(result);
      }
    });

    return Array.from(topicInsights.entries()).map(([topic, data]: [string, any]) => ({
      topic,
      questionCount: data.count,
      avgAnswers: data.totalAnswers / data.count,
      avgViews: data.totalViews / data.count,
      topQuestions: data.questions.slice(0, 3)
    }));
  }

  private async searchPatternAnalysis(): Promise<void> {
    this.onProgress({
      phase: 'search_patterns',
      step: 'Search Pattern Analysis',
      progress: 0,
      message: 'Analyzing user search behaviors'
    });

    for (let i = 0; i < this.keywords.length; i++) {
      const keyword = this.keywords[i];
      const progress = Math.round(((i + 1) / this.keywords.length) * 100);

      this.onProgress({
        phase: 'search_patterns',
        step: 'Search Pattern Analysis',
        progress,
        message: `Analyzing search patterns for "${keyword.term}" (${i + 1}/${this.keywords.length})`
      });

      try {
        // Get semantic analysis data for context
        const semanticAnalysis = await prisma.semanticAnalysis.findFirst({
          where: { domainId: this.domainId },
          orderBy: { createdAt: 'desc' }
        });

        const semanticContext = semanticAnalysis ? JSON.parse(semanticAnalysis.contentSummary) : {};

        const searchData = await this.analyzeSearchPatterns(keyword.term, semanticContext);
        await this.saveSearchPatternResult(keyword.id, searchData);
        await this.delay(400);
      } catch (error) {
        console.error(`Error analyzing search patterns for keyword ${keyword.term}:`, error);
      }
    }

    this.onProgress({
      phase: 'search_patterns',
      step: 'Search Pattern Analysis',
      progress: 100,
      message: 'Search pattern analysis completed'
    });
  }

  private async intentClassificationEngine(): Promise<void> {
    this.onProgress({
      phase: 'intent_classification',
      step: 'Intent Classification',
      progress: 0,
      message: 'Categorizing user intent patterns'
    });

    for (let i = 0; i < this.keywords.length; i++) {
      const keyword = this.keywords[i];
      const progress = Math.round(((i + 1) / this.keywords.length) * 100);

      this.onProgress({
        phase: 'intent_classification',
        step: 'Intent Classification Engine',
        progress,
        message: `Classifying intent for "${keyword.term}" (${i + 1}/${this.keywords.length})`
      });

      try {
        const semanticAnalysis = await prisma.semanticAnalysis.findFirst({
          where: { domainId: this.domainId },
          orderBy: { createdAt: 'desc' }
        });

        const semanticContext = semanticAnalysis ? JSON.parse(semanticAnalysis.contentSummary) : {};

        const intentData = await this.classifyIntent(keyword.term, semanticContext);
        await this.saveIntentClassificationResult(keyword.id, intentData);
        await this.delay(300);
      } catch (error) {
        console.error(`Error classifying intent for keyword ${keyword.term}:`, error);
      }
    }

    this.onProgress({
      phase: 'intent_classification',
      step: 'Intent Classification Engine',
      progress: 100,
      message: 'Intent classification completed'
    });
  }

  private async phraseGeneration(): Promise<GeneratedPhraseData[]> {
    this.onProgress({
      phase: 'phrase_generation',
      step: 'Generating human-like AI test prompts',
      progress: 0,
      message: 'Generating human-like prompts using pattern library + retrieval frames + fan-out'
    });

    const allPhrases: GeneratedPhraseData[] = [];

    // Get semantic analysis data for context
    const semanticAnalysis = await prisma.semanticAnalysis.findFirst({
      where: { domainId: this.domainId },
      orderBy: { createdAt: 'desc' }
    });

    const semanticContext = semanticAnalysis ? JSON.parse(semanticAnalysis.contentSummary) : {};
    const niche = (this as any)._niche
      || semanticContext.themes?.industryFocus
      || this.keywords[0]?.term
      || 'general';

    this.onProgress({
      phase: 'phrase_generation',
      step: 'Phrase Generation',
      progress: 10,
      message: `Generating prompts for ${this.keywords.length} keywords using niche patterns + LLM...`
    });

    // Use the new humanPromptGenerator for all keywords at once
    const generatedPrompts = await humanPromptGenerator.generateForDomain({
      keywords: this.keywords.map(k => ({ id: k.id, term: k.term })),
      domainUrl: this.domain.url || '',
      domainContext: this.domain.context || '',
      niche,
      semanticContext,
      onPrompt: async (prompt) => {
        // Save each prompt to DB as it's generated
        try {
          const keyword = this.keywords.find(k => k.id === prompt.keywordId);
          const savedPhrase = await prisma.generatedIntentPhrase.create({
            data: {
              phrase: prompt.phrase,
              keywordId: prompt.keywordId,
              domainId: this.domainId,
              relevanceScore: prompt.relevanceScore,
              sources: prompt.sources,
              trend: prompt.trend,
              intent: prompt.intent,
              communityInsights: { retrievalFrame: prompt.retrievalFrame, buyerStage: prompt.buyerStage },
              searchPatterns: { humannessScore: prompt.humannessScore },
              isSelected: false
            }
          });

          if (this.onPhraseGenerated) {
            this.onPhraseGenerated({
              id: savedPhrase.id.toString(),
              phrase: prompt.phrase,
              relevanceScore: prompt.relevanceScore,
              sources: prompt.sources,
              trend: prompt.trend,
              editable: true,
              selected: false,
              parentKeyword: keyword?.term || '',
              keywordId: prompt.keywordId
            });
          }
        } catch (error) {
          console.error('Error saving phrase to database:', error);
          if (this.onPhraseGenerated) {
            const keyword = this.keywords.find(k => k.id === prompt.keywordId);
            this.onPhraseGenerated({
              id: `temp-${Date.now()}-${Math.random()}`,
              phrase: prompt.phrase,
              relevanceScore: prompt.relevanceScore,
              sources: prompt.sources,
              trend: prompt.trend,
              editable: true,
              selected: false,
              parentKeyword: keyword?.term || '',
              keywordId: prompt.keywordId
            });
          }
        }
      },
    });

    // Convert to GeneratedPhraseData format
    for (const prompt of generatedPrompts) {
      allPhrases.push({
        phrase: prompt.phrase,
        relevanceScore: prompt.relevanceScore,
        sources: prompt.sources,
        trend: prompt.trend,
        intent: prompt.intent,
        communityInsights: { retrievalFrame: prompt.retrievalFrame, buyerStage: prompt.buyerStage },
        searchPatterns: { humannessScore: prompt.humannessScore },
        keywordId: prompt.keywordId,
      });
    }

    // Report coverage
    const coverage = humanPromptGenerator.checkCoverage(generatedPrompts);
    console.log(`[PhraseGen] Generated ${allPhrases.length} prompts. Frames covered: ${coverage.covered.join(', ')}. Missing: ${coverage.missing.join(', ') || 'none'}`);

    this.onProgress({
      phase: 'phrase_generation',
      step: 'Phrase Generation',
      progress: 100,
      message: `Generated ${allPhrases.length} human-like prompts across ${coverage.covered.length}/7 retrieval frames`
    });

    return allPhrases;
  }

  private async relevanceScoreCalculation(phrases: GeneratedPhraseData[]): Promise<void> {
    this.onProgress({
      phase: 'relevance_scoring',
      step: 'Relevance Score',
      progress: 0,
      message: 'Computing semantic relevance scores'
    });

    for (let i = 0; i < phrases.length; i++) {
      const phrase = phrases[i];
      const progress = Math.round(((i + 1) / phrases.length) * 100);

      this.onProgress({
        phase: 'relevance_scoring',
        step: 'Relevance Score Calculation',
        progress,
        message: `Calculating relevance for phrase ${i + 1}/${phrases.length}`
      });

      try {
        const score = await this.calculateRelevanceScore(phrase);
        await this.saveRelevanceScoreResult(phrase, score);
        await this.delay(200);
      } catch (error) {
        console.error(`Error calculating relevance score for phrase:`, error);
      }
    }

    this.onProgress({
      phase: 'relevance_scoring',
      step: 'Relevance Score Calculation',
      progress: 100,
      message: 'Relevance score calculation completed'
    });
  }

  private async mineRedditData(keyword: string, semanticContext?: any): Promise<CommunityMiningData> {
    const contextInfo = semanticContext ? `
Brand Voice: ${JSON.stringify(semanticContext.brandVoice || {})}
Target Audience: ${JSON.stringify(semanticContext.targetAudience || {})}
Themes: ${JSON.stringify(semanticContext.themes || [])}
FAQs: ${JSON.stringify(semanticContext.faqs || [])}
Community Context: ${JSON.stringify(semanticContext.communityContext || [])}
` : '';

    const prompt = `Analyze Reddit discussions about "${keyword}" in the context of "${this.domain.url}". 
    
    ${contextInfo}
    
    Extract insights about user concerns, questions, and discussions. Focus on:
    1. Common questions and problems
    2. User sentiment and opinions
    3. Related topics and keywords
    4. Industry trends and discussions
    5. Alignment with brand voice and target audience
    
    Return as JSON with: insights array, sentiment (positive/negative/neutral), frequency (1-100)`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 1000
    });

    const content = response.choices[0]?.message?.content || '{}';
    const data = this.extractJsonFromResponse(content);

    return {
      platform: 'reddit',
      insights: data.insights || [],
      sentiment: data.sentiment || 'neutral',
      frequency: data.frequency || 50
    };
  }

  private async mineQuoraData(keyword: string, semanticContext?: any): Promise<CommunityMiningData> {
    const contextInfo = semanticContext ? `
Brand Voice: ${JSON.stringify(semanticContext.brandVoice || {})}
Target Audience: ${JSON.stringify(semanticContext.targetAudience || {})}
Themes: ${JSON.stringify(semanticContext.themes || [])}
FAQs: ${JSON.stringify(semanticContext.faqs || [])}
Community Context: ${JSON.stringify(semanticContext.communityContext || [])}
` : '';

    const prompt = `Analyze Quora discussions about "${keyword}" in the context of "${this.domain.url}". 
    
    ${contextInfo}
    
    Extract insights about user questions, expert answers, and discussions. Focus on:
    1. Common questions and their answers
    2. Expert opinions and insights
    3. Related topics and keywords
    4. Industry expertise and trends
    5. Alignment with brand voice and target audience
    
    Return as JSON with: insights array, sentiment (positive/negative/neutral), frequency (1-100)`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 1000
    });

    const content = response.choices[0]?.message?.content || '{}';
    const data = this.extractJsonFromResponse(content);

    return {
      platform: 'quora',
      insights: data.insights || [],
      sentiment: data.sentiment || 'neutral',
      frequency: data.frequency || 50
    };
  }

  private async analyzeSearchPatterns(keyword: string, semanticContext?: any): Promise<SearchPatternData> {
    const contextInfo = semanticContext ? `
Brand Voice: ${JSON.stringify(semanticContext.brandVoice || {})}
Target Audience: ${JSON.stringify(semanticContext.targetAudience || {})}
Themes: ${JSON.stringify(semanticContext.themes || [])}
FAQs: ${JSON.stringify(semanticContext.faqs || [])}
Community Context: ${JSON.stringify(semanticContext.communityContext || [])}
` : '';

    const prompt = `Analyze search patterns for "${keyword}" in the context of "${this.domain.url}". 
    
    ${contextInfo}
    
    Identify user search behaviors, patterns, and trends. Focus on:
    1. Search query patterns and variations
    2. Seasonal trends and patterns
    3. User intent patterns
    4. Related search terms
    5. Alignment with target audience and brand voice
    
    Return as JSON with: patterns array, volume (1-100), seasonality object, trends object`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 1000
    });

    const content = response.choices[0]?.message?.content || '{}';
    const data = this.extractJsonFromResponse(content);

    return {
      patterns: data.patterns || [],
      volume: data.volume || 50,
      seasonality: data.seasonality || {},
      trends: data.trends || {}
    };
  }

  private async classifyIntent(keyword: string, semanticContext?: any): Promise<IntentClassificationData> {
    const contextInfo = semanticContext ? `
Brand Voice: ${JSON.stringify(semanticContext.brandVoice || {})}
Target Audience: ${JSON.stringify(semanticContext.targetAudience || {})}
Themes: ${JSON.stringify(semanticContext.themes || [])}
FAQs: ${JSON.stringify(semanticContext.faqs || [])}
Community Context: ${JSON.stringify(semanticContext.communityContext || [])}
` : '';

    const prompt = `Classify the search intent for "${keyword}" in the context of "${this.domain.url}". 
    
    ${contextInfo}
    
    Determine if users are looking for:
    - informational (learning about the topic)
    - navigational (finding a specific website)
    - transactional (wanting to buy/purchase)
    - commercial (researching before buying)
    
    Consider alignment with target audience and brand voice.
    
    Return as JSON with: intent (string), confidence (1-100), patterns array`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 1000
    });

    const content = response.choices[0]?.message?.content || '{}';
    const data = this.extractJsonFromResponse(content);

    return {
      intent: data.intent || 'informational',
      confidence: data.confidence || 75,
      patterns: data.patterns || []
    };
  }

  private async generatePhrasesForKeyword(keyword: any, semanticContext?: any): Promise<GeneratedPhraseData[]> {
    const contextInfo = semanticContext ? `
Brand Voice: ${JSON.stringify(semanticContext.brandVoice || {})}
Target Audience: ${JSON.stringify(semanticContext.targetAudience || {})}
Themes: ${JSON.stringify(semanticContext.themes || [])}
FAQs: ${JSON.stringify(semanticContext.faqs || [])}
Community Context: ${JSON.stringify(semanticContext.communityContext || [])}
` : '';

    const prompt = `You are an expert SEO strategist and intent phrase specialist. Generate 4-6 high-quality intent-based search phrases for "${keyword.term}" that will be used for AI-powered domain visibility analysis.

**CONTEXT:**
Keyword: "${keyword.term}"
Domain: "${this.domain.url}"
Business Context: ${this.domain.context || 'Not provided'}

${contextInfo}

**INTENT PHRASE GENERATION STRATEGY:**

1. **Intent Diversity** (Cover all major search intents):
   - **Informational**: "how to", "what is", "guide", "tips", "best practices", "learn"
   - **Navigational**: "company name", "official", "website", "contact"
   - **Transactional**: "buy", "pricing", "quote", "hire", "get started"
   - **Commercial**: "best", "top", "reviews", "comparison", "vs", "alternatives"

2. **Phrase Quality Requirements**:
   - Natural, conversational language that real users would type
   - Include the keyword naturally without forced placement
   - Reflect actual user search behavior and pain points
   - Align with the domain's business model and services
   - Include location-specific variations if applicable
   - Mix of short-tail and long-tail phrases
   - Align with brand voice and target audience
   - Address common FAQs and pain points

3. **Business Context Integration**:
   - Phrases should reflect the domain's unique value propositions
   - Include industry-specific terminology and jargon
   - Address customer pain points and needs
   - Consider the target audience and their search patterns
   - Include problem-solution keyword patterns
   - Use themes and brand voice insights

4. **SEO Optimization**:
   - Phrases should have realistic search volume potential
   - Include semantic variations and synonyms
   - Consider seasonal or trending aspects
   - Include question-based phrases for voice search
   - Add comparison and review-based phrases

**OUTPUT FORMAT:**
Return ONLY a JSON array with this exact structure:
[
  {
    "phrase": "natural search phrase",
    "relevanceScore": 85,
    "sources": ["Community Discussions", "Industry Reports"],
    "trend": "rising|stable|declining",
    "intent": "informational|navigational|transactional|commercial"
  }
]

**QUALITY REQUIREMENTS:**
- Relevance scores should be realistic (60-95 range)
- Sources should reflect real data sources (Community Discussions, Industry Reports, Case Studies, etc.)
- Trends should be based on current market dynamics
- Intent should accurately reflect the search purpose
- All phrases must be directly relevant to the keyword and domain context
- Phrases should align with brand voice and target audience insights`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.8,
      max_tokens: 1000
    });

    const content = response.choices[0]?.message?.content || '[]';
    const phrases = this.extractJsonFromResponse(content);

    return phrases.map((phrase: any) => ({
      ...phrase,
      keywordId: keyword.id,
      communityInsights: {},
      searchPatterns: {}
    }));
  }

  private async calculateRelevanceScore(phrase: GeneratedPhraseData): Promise<number> {
    const prompt = `You are an expert SEO analyst and relevance scoring specialist. Calculate a comprehensive relevance score (60-95) for the phrase "${phrase.phrase}" in the context of domain "${this.domain.url}".

**SCORING FRAMEWORK:**

1. **Semantic Relevance** (25 points):
   - How well the phrase aligns with the domain's core business
   - Keyword-to-domain topic matching
   - Industry terminology alignment
   - Business model compatibility

2. **Search Intent Alignment** (20 points):
   - Intent match with domain's services/products
   - User journey stage alignment
   - Conversion potential assessment
   - Target audience fit

3. **User Behavior Patterns** (20 points):
   - Realistic search behavior representation
   - Query length and complexity appropriateness
   - Voice search compatibility
   - Mobile search optimization

4. **Competitive Landscape** (15 points):
   - Competition level for the phrase
   - Market positioning alignment
   - Differentiation potential
   - SEO opportunity assessment

5. **Business Value** (20 points):
   - Revenue potential alignment
   - Customer acquisition value
   - Brand positioning support
   - Long-term strategic value

**DOMAIN CONTEXT:**
${this.domain.context || 'Business context not available'}

**SCORING GUIDELINES:**
- 90-95: Perfect alignment, high conversion potential, low competition
- 80-89: Strong alignment, good conversion potential, moderate competition
- 70-79: Good alignment, moderate conversion potential, some competition
- 60-69: Acceptable alignment, basic conversion potential, high competition

Return ONLY the numeric score between 60-95.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 50
    });

    const content = response.choices[0]?.message?.content || '50';
    return parseInt(content) || 50;
  }

  private async saveCommunityMiningResult(keywordId: number, platform: string, data: CommunityMiningData): Promise<void> {
    await prisma.communityMiningResult.create({
      data: {
        domainId: this.domainId,
        keywordId,
        platform,
        insights: data.insights,
        sentiment: data.sentiment,
        frequency: data.frequency,
        tokenUsage: 100 // Estimate
      }
    });
  }

  private async saveSearchPatternResult(keywordId: number, data: SearchPatternData): Promise<void> {
    await prisma.searchPatternResult.create({
      data: {
        domainId: this.domainId,
        keywordId,
        patterns: data.patterns,
        volume: data.volume,
        seasonality: data.seasonality,
        trends: data.trends,
        tokenUsage: 100 // Estimate
      }
    });
  }

  private async saveIntentClassificationResult(keywordId: number, data: IntentClassificationData): Promise<void> {
    await prisma.intentClassificationResult.create({
      data: {
        domainId: this.domainId,
        keywordId,
        intent: data.intent,
        confidence: data.confidence,
        patterns: data.patterns,
        tokenUsage: 50 // Estimate
      }
    });
  }

  private async saveRelevanceScoreResult(phrase: GeneratedPhraseData, score: number): Promise<void> {
    // Find the existing phrase in the database
    const existingPhrase = await prisma.generatedIntentPhrase.findFirst({
      where: {
        phrase: phrase.phrase,
        keywordId: phrase.keywordId,
        domainId: this.domainId
      }
    });

    if (existingPhrase) {
      // Update the existing phrase with the calculated score
      await prisma.generatedIntentPhrase.update({
        where: { id: existingPhrase.id },
        data: {
          relevanceScore: score
        }
      });

      // Then save the relevance score result
      await prisma.relevanceScoreResult.create({
        data: {
          domainId: this.domainId,
          phraseId: existingPhrase.id,
          score,
          breakdown: {
            semanticRelevance: Math.floor(score * 0.3),
            intentAlignment: Math.floor(score * 0.25),
            communityRelevance: Math.floor(score * 0.2),
            searchPatternMatch: Math.floor(score * 0.15),
            domainContext: Math.floor(score * 0.1)
          },
          factors: {
            phraseLength: phrase.phrase.length,
            keywordInclusion: 1, // Simplified for now
            intentClarity: 1
          },
          tokenUsage: 50 // Estimate
        }
      });
    }
  }

  private async competitorAnalysis(): Promise<void> {
    this.onProgress({
      phase: 'competitor_analysis',
      step: 'Competitor Research',
      progress: 0,
      message: 'Researching competitors mentioned in community discussions'
    });

    try {
      // Get community insights from the previous step
      const communityInsights = await prisma.communityInsight.findMany({
        where: { 
          domainId: this.domainId,
          keywordId: { in: this.keywords.map(k => k.id) }
        },
        orderBy: { createdAt: 'desc' }
      });

      if (communityInsights.length === 0) {
        this.onProgress({
          phase: 'competitor_analysis',
          step: 'Competitor Analysis',
          progress: 100,
          message: 'No community insights found for competitor analysis'
        });
        return;
      }

      this.onProgress({
        phase: 'competitor_analysis',
        step: 'Competitor Analysis',
        progress: 10,
        message: `Analyzing ${communityInsights.length} community insights for competitor mentions`
      });

      // Get semantic analysis context
      const semanticAnalysis = await prisma.semanticAnalysis.findFirst({
        where: { domainId: this.domainId },
        orderBy: { createdAt: 'desc' }
      });

      const semanticContext = semanticAnalysis ? JSON.parse(semanticAnalysis.contentSummary) : {};

      const competitorAnalysis = [];

      for (let i = 0; i < communityInsights.length; i++) {
        const insight = communityInsights[i];
        
        const progress = 10 + Math.round((i / communityInsights.length) * 80);
        this.onProgress({
          phase: 'competitor_analysis',
          step: 'Competitor Analysis',
          progress,
          message: `Analyzing competitors in community data (${i + 1}/${communityInsights.length})`
        });

        try {
          const insightData = JSON.parse(insight.summary);
          
          // Extract competitor mentions from Reddit and Quora data
          const competitors = await this.extractCompetitorsFromCommunityData(insightData, semanticContext);
          
          if (competitors.length > 0) {
            // Research each competitor
            const competitorResearch = await this.researchCompetitors(competitors, semanticContext);
            
            competitorAnalysis.push({
              domainId: this.domainId,
              keywordId: insight.keywordId,
              competitors: competitorResearch,
              analysisDate: new Date(),
              dataSource: 'community_insights'
            });
          }

          await this.delay(500); // Rate limiting
        } catch (error) {
          console.error(`Error analyzing competitors for insight ${insight.id}:`, error);
        }
      }

      // Save competitor analysis to database
      if (competitorAnalysis.length > 0) {
        await prisma.competitorAnalysis.createMany({
          data: competitorAnalysis.map(analysis => ({
            domainId: analysis.domainId,
            competitors: analysis.competitors,
            marketInsights: { insights: analysis.competitors.map((c: any) => c.overview) },
            strategicRecommendations: { recommendations: analysis.competitors.map((c: any) => c.differentiators) },
            competitiveAnalysis: { analysis: analysis.competitors },
            competitorList: analysis.competitors.map((c: any) => c.name).join(', ')
          }))
        });
      }

      this.onProgress({
        phase: 'competitor_analysis',
        step: 'Competitor Analysis',
        progress: 100,
        message: `Competitor analysis completed. Found ${competitorAnalysis.length} competitor insights`
      });

    } catch (error) {
      console.error('Error in competitor analysis:', error);
      this.onProgress({
        phase: 'competitor_analysis',
        step: 'Competitor Analysis',
        progress: 100,
        message: 'Competitor analysis completed with limited data'
      });
    }
  }

  private async extractCompetitorsFromCommunityData(insightData: any, semanticContext: any): Promise<string[]> {
    const competitors = new Set<string>();
    const domainName = this.extractDomainName(this.domain.url);
    
    // Extract from Reddit data
    if (insightData.realInsights?.reddit?.posts) {
      insightData.realInsights.reddit.posts.forEach((post: any) => {
        const content = (post.title + ' ' + post.content).toLowerCase();
        const mentionedCompetitors = this.extractCompetitorMentions(content, domainName);
        mentionedCompetitors.forEach(comp => competitors.add(comp));
      });
    }

    // Extract from Quora data
    if (insightData.realInsights?.quora?.questions) {
      insightData.realInsights.quora.questions.forEach((question: any) => {
        const content = (question.title + ' ' + question.content).toLowerCase();
        const mentionedCompetitors = this.extractCompetitorMentions(content, domainName);
        mentionedCompetitors.forEach(comp => competitors.add(comp));
      });
    }

    // Extract from FAQ data
    if (insightData.extractedFAQs) {
      Object.values(insightData.extractedFAQs).flat().forEach((faq: any) => {
        const content = faq.toLowerCase();
        const mentionedCompetitors = this.extractCompetitorMentions(content, domainName);
        mentionedCompetitors.forEach(comp => competitors.add(comp));
      });
    }

    return Array.from(competitors);
  }

  private extractCompetitorMentions(content: string, domainName: string): string[] {
    const competitors: string[] = [];
    
    // Common competitor indicators
    const competitorPatterns = [
      /vs\.?\s+([a-zA-Z0-9\s]+)/gi,
      /compared\s+to\s+([a-zA-Z0-9\s]+)/gi,
      /alternative\s+to\s+([a-zA-Z0-9\s]+)/gi,
      /instead\s+of\s+([a-zA-Z0-9\s]+)/gi,
      /better\s+than\s+([a-zA-Z0-9\s]+)/gi,
      /similar\s+to\s+([a-zA-Z0-9\s]+)/gi,
      /like\s+([a-zA-Z0-9\s]+)/gi,
      /competitor[s]?\s+([a-zA-Z0-9\s]+)/gi
    ];

    competitorPatterns.forEach(pattern => {
      const matches = content.match(pattern);
      if (matches) {
        matches.forEach(match => {
          const competitor = match.replace(/^(vs\.?|compared\s+to|alternative\s+to|instead\s+of|better\s+than|similar\s+to|like|competitor[s]?\s+)/i, '').trim();
          if (competitor && competitor.length > 2 && competitor.toLowerCase() !== domainName.toLowerCase()) {
            competitors.push(competitor);
          }
        });
      }
    });

    // Extract brand names (capitalized words)
    const brandMatches = content.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g);
    if (brandMatches) {
      brandMatches.forEach(brand => {
        if (brand.length > 2 && brand.toLowerCase() !== domainName.toLowerCase()) {
          competitors.push(brand);
        }
      });
    }

    return [...new Set(competitors)].slice(0, 10); // Limit to top 10
  }

  private extractDomainName(url: string): string {
    try {
      const domain = new URL(url).hostname.replace('www.', '');
      return domain.split('.')[0]; // Get the main domain name
    } catch {
      return 'unknown';
    }
  }

  private async researchCompetitors(competitors: string[], semanticContext: any): Promise<any[]> {
    const competitorResearch = [];

    for (const competitor of competitors.slice(0, 5)) { // Limit to top 5 competitors
      try {
        const researchPrompt = `
Research the competitor "${competitor}" in the context of ${this.domain.url}.

Business Context: ${this.domain.context || 'No context provided'}
Industry Focus: ${semanticContext.themes?.industryFocus || 'Technology'}
Target Audience: ${JSON.stringify(semanticContext.targetAudience || {})}

Please provide analysis including:
1. Competitor overview and positioning
2. Key strengths and weaknesses
3. Target audience overlap
4. Pricing and business model
5. Market positioning vs ${this.extractDomainName(this.domain.url)}
6. User sentiment and reviews
7. Key differentiators

Format as JSON with keys: name, overview, strengths, weaknesses, targetAudience, pricing, positioning, sentiment, differentiators
`;

        const completion = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [{ role: 'user', content: researchPrompt }],
          temperature: 0.3,
          max_tokens: 1500
        });

        const response = completion.choices[0]?.message?.content;
        if (response) {
          try {
            const competitorData = JSON.parse(response);
            competitorResearch.push({
              name: competitor,
              ...competitorData,
              researchDate: new Date(),
              confidence: this.calculateCompetitorConfidence(competitor, semanticContext)
            });
          } catch {
            // Fallback if JSON parsing fails
            competitorResearch.push({
              name: competitor,
              overview: response,
              strengths: [],
              weaknesses: [],
              targetAudience: 'Unknown',
              pricing: 'Unknown',
              positioning: 'Unknown',
              sentiment: 'neutral',
              differentiators: [],
              researchDate: new Date(),
              confidence: 50
            });
          }
        }

        await this.delay(1000); // Rate limiting
      } catch (error) {
        console.error(`Error researching competitor ${competitor}:`, error);
      }
    }

    return competitorResearch;
  }

  private calculateCompetitorConfidence(competitor: string, semanticContext: any): number {
    let confidence = 50; // Base confidence
    
    // Check if competitor aligns with industry focus
    const industryFocus = semanticContext.themes?.industryFocus || '';
    if (industryFocus && competitor.toLowerCase().includes(industryFocus.toLowerCase())) {
      confidence += 20;
    }

    // Check if competitor aligns with target audience
    const targetAudience = semanticContext.targetAudience?.demographics?.profession || '';
    if (targetAudience && competitor.toLowerCase().includes(targetAudience.toLowerCase())) {
      confidence += 15;
    }

    // Check brand voice alignment
    const brandValues = semanticContext.brandVoice?.brandValues || [];
    brandValues.forEach((value: string) => {
      if (competitor.toLowerCase().includes(value.toLowerCase())) {
        confidence += 10;
      }
    });

    return Math.min(100, confidence);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default IntentPhraseService; 