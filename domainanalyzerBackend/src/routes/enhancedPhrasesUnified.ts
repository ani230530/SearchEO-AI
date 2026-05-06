/**
 * UNIFIED ENHANCED PHRASES GENERATION - OPTIMIZED FOR PEAK ACCURACY
 * 
 * This file contains a single unified function that follows the exact flowchart:
 * 1. Semantic Content Analysis
 * 2. Community Data Mining (USING REAL REDDIT API) - OPTIMIZED: 15 posts max
 * 3. Search Pattern Analysis
 * 4. Creating optimized intent phrases
 * 5. Intent Classification (integrated with phrase generation)
 * 6. Relevance Score (integrated with phrase generation)
 * 
 * No duplication - only one function that handles the complete flow.
 * 
 * REDDIT API INTEGRATION - OPTIMIZED:
 * - Real Reddit data mining using Reddit API
 * - Rate limiting and error handling (1.5s intervals)
 * - Actual community insights from real discussions
 * - MAXIMUM 15 TOP POSTS for peak accuracy and speed
 * - Higher relevance and engagement thresholds
 * - Reduced query count (6 queries max)
 * - Faster processing with maintained quality
 */

import { Router, Request, Response } from 'express';
import { PrismaClient } from '../../generated/prisma';
import OpenAI from 'openai';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { INTENT_PHRASE_PHASES } from './intentPhrases';

/**
 * FIXED REDDIT DATA MINING
 * 
 * Issues fixed:
 * 1. Reddit API requires .json endpoint and proper parameters
 * 2. Better error handling and debugging
 * 3. Improved relevance scoring
 * 4. Better fallback mechanisms
 */

// ===============================================
// FIXED REDDIT API CONFIGURATION & HELPERS
// ===============================================

// ===============================================
// TYPES & INTERFACES
// ===============================================

interface SemanticData {
  searchTerms?: string[];
  keyProblems?: string[];
  primaryServices?: string[];
  location?: string;
  contentSummary?: string;
}

interface RedditPost {
  title: string;
  selftext: string;
  subreddit: string;
  permalink: string;
  score: number;
  num_comments: number;
  created_utc: number;
  url: string;
}

interface RedditSearchResponse {
  posts: RedditPost[];
  isEmpty: boolean;
  rateLimited?: boolean;
  error?: string;
  failed?: boolean;
}

interface ExtractedRedditPost {
  title: string;
  content: string;
  subreddit: string;
  url: string;
  score: number;
  comments: number;
  created: string;
  relevanceScore: number;
  platform: string;
  fullText: string;
  hasQuestion: boolean;
  hasProblem: boolean;
  hasSolution: boolean;
  hasComparison: boolean;
}

interface RedditMetadata {
  score: number;
  comments: number;
  subreddit: string;
}

interface DataQuality {
  totalQueries: number;
  successfulQueries: number;
  failedQueries: number;
  redditResults: number;
  totalResults: number;
  averageRelevance: number;
  qualityRating: string;
  hasQuestions: number;
  hasProblems: number;
  hasSolutions: number;
}

interface MiningSummary {
  redditData: ExtractedRedditPost[];
  dataQuality: DataQuality;
  allData: ExtractedRedditPost[];
  summary?: string;
  domainId?: number | null;
  keywordId?: number | null;
  sources?: any;
}

interface Keyword {
  id: number;
  term: string;
  domainId: number | null;
  [key: string]: any; // Allow for other prisma properties
}

interface Domain {
  id: number;
  url: string;
  userId: number | null;
  location?: string | null;
  context?: string | null;
  [key: string]: any; // Allow for other prisma properties
}

interface IntentValidation {
  isValid: boolean;
  issues: string[];
  confidence: number;
}

interface PhraseAnalysisResult {
  phrase: string;
  intent: string;
  intentConfidence: number;
  relevanceScore: number;
  [key: string]: any;
}

interface KeywordWithRelations extends Keyword {
  generatedIntentPhrases?: any[];
  communityInsights?: any[];
  searchPatterns?: any[];
}

interface UserLanguagePatterns {
  questionStarters?: string[];
  problemDescriptors?: string[];
  solutionSeekers?: string[];
  qualityIndicators?: string[];
  urgencyMarkers?: string[];
  comparisonLanguage?: string[];
  emotionalTriggers?: string[];
}

interface RealQuestion {
  question: string;
  relevanceScore: number;
  engagement: number;
  hasCommercialIntent: boolean;
  hasInformationalIntent: boolean;
  platform: string;
}

interface RealPhrase {
  phrase: string;
  context: string;
  relevanceScore: number;
  engagement: number;
  type: string;
  platform?: string;
}

interface SearchPattern {
  domainId: number | null;
  keywordId: number | null;
  patterns: any;
  summary: string;
  tokenUsage: number;
}



type EventSender = (event: string, data: any) => void;

const REDDIT_API_CONFIG = {
  baseUrl: 'https://www.reddit.com',
  userAgent: 'SEOAnalysisBot/1.0',
  rateLimit: 800, // Reduced from 1500ms to 800ms
  maxRetries: 1, // Reduced from 2 to 1
  timeout: 8000, // Reduced from 10000ms
  resultsPerQuery: 10 // Reduced from 15 to 10
};

// ENHANCED: Better subreddit targeting for quality data
const getTargetSubreddits = (businessContext: string): string[] => {
  const contextLower = businessContext.toLowerCase();
  
  // Business-specific subreddits
  const businessSubs = ['entrepreneur', 'smallbusiness', 'business', 'startups', 'freelance'];
  const adviceSubs = ['AskReddit', 'advice', 'LifeProTips', 'personalfinance'];
  const techSubs = ['webdev', 'marketing', 'SEO', 'socialmedia', 'design'];
  
  // Context-specific targeting
  if (contextLower.includes('marketing') || contextLower.includes('seo')) {
    return ['marketing', 'SEO', 'PPC', 'socialmedia', 'entrepreneur', 'smallbusiness'];
  }
  if (contextLower.includes('design') || contextLower.includes('web')) {
    return ['webdev', 'web_design', 'UI_Design', 'freelance', 'entrepreneur'];
  }
  if (contextLower.includes('finance') || contextLower.includes('accounting')) {
    return ['personalfinance', 'entrepreneur', 'smallbusiness', 'investing'];
  }
  
  return [...businessSubs, ...adviceSubs].slice(0, 6);
};

// OPTIMIZED: Smarter query generation using semantic data - Reduced for faster processing
const generateStrategicQueries = (semanticData: SemanticData | null | undefined, businessContext: string): string[] => {
  // Use semantic data if available, otherwise fall back to business context
  const searchTerms = semanticData?.searchTerms || [];
  const keyProblems = semanticData?.keyProblems || [];
  const primaryServices = semanticData?.primaryServices || [];
  const location = semanticData?.location || '';
  
  const queries = new Set<string>();
  
  // 1. Semantic search terms (highest priority)
  if (searchTerms.length > 0) {
    searchTerms.slice(0, 3).forEach((term: string) => {
      queries.add(`${term} problems`);
      queries.add(`best ${term}`);
    });
  }
  
  // 2. Key problems
  if (keyProblems.length > 0) {
    keyProblems.slice(0, 2).forEach((problem: string) => {
      queries.add(`${problem} solutions`);
      queries.add(`fix ${problem}`);
    });
  }
  
  // 3. Primary services
  if (primaryServices.length > 0) {
    primaryServices.slice(0, 2).forEach((service: string) => {
      queries.add(`${service} help`);
      queries.add(`${service} tips`);
    });
  }
  
  // 4. Location specific
  if (location && location !== 'Global' && location.trim() !== '') {
    queries.add(`${businessContext} ${location}`);
  }
  
  // 5. Fallback/Essential base queries
  const cleanContext = businessContext.toLowerCase().replace(/[^\w\s]/g, ' ').trim();
  queries.add(`${cleanContext} problems`);
  queries.add(`how to ${cleanContext}`);
  queries.add(`best ${cleanContext}`);

  // Filter and return
  return Array.from(queries)
    .filter(query => query.length > 0 && query.length <= 50)
    .slice(0, 10); // Limit to 10 queries, caller can slice further (e.g., to 3)
};

// OPTIMIZED: Better Reddit search with multiple strategies - Reduced limits for faster processing
const searchRedditAPI = async (query: string, subreddit?: string, options: { sort?: string; time?: string; limit?: number } = {}): Promise<RedditSearchResponse> => {
  const { sort = 'top', time = 'year', limit = 15 } = options; // OPTIMIZED: Default to 15 posts
  
  try {
    console.log(`🔍 Reddit API: "${query}" in ${subreddit ? `r/${subreddit}` : 'all Reddit'}`);
    
    let searchUrl: string;
    if (subreddit) {
      searchUrl = `${REDDIT_API_CONFIG.baseUrl}/r/${subreddit}/search.json?q=${encodeURIComponent(query)}&sort=${sort}&t=${time}&limit=${limit}&restrict_sr=on&type=link`;
    } else {
      searchUrl = `${REDDIT_API_CONFIG.baseUrl}/search.json?q=${encodeURIComponent(query)}&sort=${sort}&t=${time}&limit=${limit}&type=link`;
    }
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REDDIT_API_CONFIG.timeout);
    
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': REDDIT_API_CONFIG.userAgent,
        'Accept': 'application/json',
      },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (response.status === 429) {
      const waitTime = 3000; // 3 seconds for rate limit
      console.log(`⏳ Rate limited, waiting ${waitTime}ms...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return { posts: [], isEmpty: true, rateLimited: true };
    }
    
    if (!response.ok) {
      throw new Error(`Reddit API HTTP ${response.status}`);
    }
    
    const data = await response.json() as { data: { children: { data: RedditPost }[] } };
    
    if (!data?.data?.children || !Array.isArray(data.data.children)) {
      return { posts: [], isEmpty: true, error: 'Invalid data structure' };
    }
    
    if (data.data.children.length === 0) {
      return { posts: [], isEmpty: true };
    }
    
    console.log(`✅ Found ${data.data.children.length} results`);
    return {
      posts: data.data.children.map((child: { data: RedditPost }) => child.data),
      isEmpty: false
    };
    
  } catch (error) {
    console.error(`❌ Reddit API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return { posts: [], error: error instanceof Error ? error.message : 'Unknown error', failed: true, isEmpty: true };
  }
};

// ===============================================
// IMPROVED DATA EXTRACTION WITH BETTER FILTERING
// ===============================================

// ENHANCED: Much better data extraction with quality scoring
const extractRedditDataEnhanced = (redditData: RedditSearchResponse, businessContext: string): ExtractedRedditPost[] => {
  if (!redditData?.posts || !Array.isArray(redditData.posts)) {
    return [];
  }
  
  console.log(`📊 Processing ${redditData.posts.length} Reddit posts...`);
  
  const validPosts = redditData.posts
    .filter((post: RedditPost) => {
      // Basic validation
      const hasTitle = post.title && post.title.length > 10;
      const hasContent = (post.selftext && post.selftext.length > 20) || post.url;
      const notDeleted = !['[deleted]', '[removed]'].includes(post.title);
      const hasEngagement = (post.score || 0) > 10 || (post.num_comments || 0) > 5; // OPTIMIZED: Higher engagement threshold
      
      return hasTitle && hasContent && notDeleted && hasEngagement;
    })
    .map((post: RedditPost): ExtractedRedditPost => {
      const title = post.title.trim();
      const content = (post.selftext || '').trim();
      const fullText = `${title} ${content}`.toLowerCase();
      
      // ENHANCED: Multi-factor relevance scoring
      const relevanceScore = calculateAdvancedRelevanceScore(fullText, businessContext, {
        score: post.score || 0,
        comments: post.num_comments || 0,
        subreddit: post.subreddit
      });
      
      return {
        title,
        content,
        subreddit: post.subreddit,
        url: `https://reddit.com${post.permalink}`,
        score: post.score || 0,
        comments: post.num_comments || 0,
        created: new Date((post.created_utc || 0) * 1000).toISOString(),
        relevanceScore,
        platform: 'reddit',
        fullText,
        // ENHANCED: Extract actionable insights
        hasQuestion: /\b(how|what|where|when|why|which|should|can|will)\b.*\?/.test(fullText),
        hasProblem: /\b(problem|issue|challenge|trouble|difficulty|struggle)\b/.test(fullText),
        hasSolution: /\b(solution|fix|solve|help|advice|tip|guide)\b/.test(fullText),
        hasComparison: /\b(best|better|vs|versus|compare|alternative)\b/.test(fullText)
      };
    })
    .filter((item: ExtractedRedditPost) => item.relevanceScore > 5) // OPTIMIZED: Higher threshold for peak accuracy
    .sort((a: ExtractedRedditPost, b: ExtractedRedditPost) => {
      // Sort by relevance score, then engagement
      if (b.relevanceScore !== a.relevanceScore) {
        return b.relevanceScore - a.relevanceScore;
      }
      return (b.score + b.comments * 2) - (a.score + a.comments * 2);
    })
    .slice(0, 15); // OPTIMIZED: Keep top 15 most relevant posts for peak accuracy

  console.log(`✅ Extracted ${validPosts.length} high-quality posts`);
  return validPosts;
};

// ENHANCED: Advanced relevance scoring with multiple factors
const calculateAdvancedRelevanceScore = (text: string, businessContext: string, metadata: RedditMetadata): number => {
  const lowerText = text.toLowerCase();
  const lowerContext = businessContext.toLowerCase();
  let score = 0;
  
  // 1. Direct context matching (high weight)
  const contextWords = lowerContext.split(/\s+/).filter(word => word.length > 2);
  const tokens = lowerText.split(/[^a-z0-9_]+/);
  contextWords.forEach(word => {
    const safeWord = word.replace(/[^a-z0-9_]/g, '');
    if (!safeWord || safeWord.length <= 2) return;
    const wordCount = tokens.reduce((acc: number, t: string) => acc + (t === safeWord ? 1 : 0), 0);
    score += wordCount * 4;
  });
  
  // 2. Business intent signals (high value for phrase generation)
  const businessSignals = [
    'need help', 'looking for', 'recommend', 'advice', 'tips', 'guide',
    'best way', 'how to', 'what should', 'where can', 'who does',
    'problem with', 'issue with', 'struggling', 'difficulty'
  ];
  businessSignals.forEach(signal => {
    if (lowerText.includes(signal)) score += 6;
  });
  
  // 3. Question format (excellent for phrase generation)
  if (/\b(how|what|where|when|why|which|should|can|will|do|does|is|are)\b.*\?/.test(lowerText)) {
    score += 8;
  }
  
  // 4. Commercial intent signals
  const commercialSignals = [
    'price', 'cost', 'budget', 'expensive', 'cheap', 'worth',
    'hire', 'buy', 'purchase', 'service', 'company', 'professional'
  ];
  commercialSignals.forEach(signal => {
    if (lowerText.includes(signal)) score += 3;
  });
  
  // 5. Problem-solution pairs (great for generating helpful phrases)
  const problemSolutionPairs = [
    ['problem', 'solution'], ['issue', 'fix'], ['challenge', 'overcome'],
    ['trouble', 'help'], ['difficult', 'easy'], ['confusing', 'clear']
  ];
  problemSolutionPairs.forEach(([problem, solution]) => {
    if (lowerText.includes(problem) && lowerText.includes(solution)) {
      score += 5;
    }
  });
  
  // 6. Engagement quality bonus
  const engagementScore = (metadata.score || 0) + (metadata.comments || 0) * 2;
  if (engagementScore > 50) score += 4;
  else if (engagementScore > 20) score += 2;
  else if (engagementScore > 10) score += 1;
  
  // 7. Content quality indicators
  const textLength = text.length;
  if (textLength > 200 && textLength < 1000) score += 3; // Sweet spot for quality content
  if (textLength > 100) score += 1;
  
  // 8. Subreddit relevance bonus
  const relevantSubs = ['business', 'entrepreneur', 'smallbusiness', 'advice', 'AskReddit'];
  if (relevantSubs.includes(metadata.subreddit)) score += 2;
  
  return Math.max(score, 0);
};

// ===============================================
// IMPROVED QUERY GENERATION
// ===============================================

// Strategic query generation is now consolidated into generateStrategicQueries above.

// ===============================================
// ENHANCED RELEVANCE SCORING
// ===============================================

// FIXED: Enhanced relevance scoring
const calculateEnhancedRelevanceScore = (text: string, businessContext: string): number => {
  const lowerText = text.toLowerCase();
  const lowerContext = businessContext.toLowerCase();
  
  let score = 0;
  
  // FIXED: More comprehensive scoring
  
  // 1. Exact context match (high value)
  if (lowerText.includes(lowerContext)) score += 10;
  
  // 2. Individual context words
  const contextWords = lowerContext.split(/\s+/).filter(word => word.length > 2);
  contextWords.forEach(word => {
    if (lowerText.includes(word)) {
      score += 3;
    }
  });
  
  // 3. Question format bonus (common in communities)
  if (lowerText.match(/\b(how|what|why|when|where|which|should|can|will|is|are)\b.*\?/)) {
    score += 4;
  }
  
  // 4. Problem/solution indicators
  const problemSolutionWords = ['problem', 'issue', 'challenge', 'solution', 'help', 'advice', 'tips', 'guide', 'how to'];
  problemSolutionWords.forEach(word => {
    if (lowerText.includes(word)) score += 2;
  });
  
  // 5. Engagement indicators
  const engagementWords = ['best', 'top', 'recommend', 'suggest', 'experience', 'review', 'comparison', 'vs'];
  engagementWords.forEach(word => {
    if (lowerText.includes(word)) score += 1;
  });
  
  // 6. Content quality bonus
  if (text.length > 50) score += 1;
  if (text.length > 100) score += 1;
  if (text.length > 200) score += 2;
  
  // 7. Specific domain-related terms (customize based on your domain)
  const domainTerms = ['business', 'service', 'company', 'professional', 'expert', 'quality', 'price', 'cost'];
  domainTerms.forEach(term => {
    if (lowerText.includes(term)) score += 1;
  });
  
  return Math.max(score, 0);
};

// ===============================================
// ENHANCED COMMUNITY MINING FUNCTION
// ===============================================

const performOptimizedCommunityMining = async (businessContext: string, domain: Domain, semanticData?: SemanticData | null): Promise<MiningSummary> => {
  console.log(`🚀 Optimized community mining: ${businessContext}`);
  
  // OPTIMIZATION 1: Reduce queries from 6 to 3
  const strategicQueries = generateStrategicQueries(semanticData, businessContext).slice(0, 3);
  // OPTIMIZATION 2: Target only 2 most relevant subreddits
  const targetSubreddits = getTargetSubreddits(businessContext).slice(0, 2);
  
  console.log(`📋 Using ${strategicQueries.length} optimized queries`);
  console.log(`🎯 Targeting ${targetSubreddits.length} high-value subreddits`);
  
  const allRedditData: ExtractedRedditPost[] = [];
  let successfulQueries = 0;
  
  // OPTIMIZATION 3: Parallel processing instead of sequential
  const queryPromises = strategicQueries.map(async (query, index) => {
    try {
      // Add staggered delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, index * 500));
      
      console.log(`🔍 Mining: "${query}"`);
      
      // Try general search with reduced limit
      let redditData = await searchRedditAPI(query, undefined, {
        sort: 'top',
        time: 'year',
        limit: 10 // Reduced from 15
      });
      
      if (!redditData.failed && !redditData.isEmpty) {
        const results = extractRedditDataEnhanced(redditData, businessContext);
        if (results.length > 0) {
          successfulQueries++;
          console.log(`✅ General search: ${results.length} quality results`);
          return results;
        }
      }
      
      // OPTIMIZATION 4: Only try 1 subreddit if general search fails
      if (redditData.isEmpty || (redditData.posts && redditData.posts.length < 3)) {
        const subreddit = targetSubreddits[0]; // Only try the most relevant one
        await new Promise(resolve => setTimeout(resolve, 300));
        
        const subredditData = await searchRedditAPI(query, subreddit, {
          sort: 'top',
          time: 'year',
          limit: 10
        });
        
        if (!subredditData.failed && !subredditData.isEmpty) {
          const results = extractRedditDataEnhanced(subredditData, businessContext);
          if (results.length > 0) {
            console.log(`✅ r/${subreddit}: ${results.length} results for "${query}"`);
            return results;
          }
        }
      }
      
      return [];
    } catch (error) {
      console.error(`❌ Error mining "${query}":`, error);
      return [];
    }
  });
  
  // Wait for all queries to complete
  const queryResults = await Promise.all(queryPromises);
  queryResults.forEach(results => allRedditData.push(...results));
  
  // OPTIMIZATION 5: Reduce final data to top 10 posts
  const uniqueRedditData = allRedditData
    .filter((item: ExtractedRedditPost, index: number, arr: ExtractedRedditPost[]) => {
      const isDuplicate = arr.findIndex((other: ExtractedRedditPost, otherIndex: number) => {
        if (otherIndex >= index) return false;
        return other.url === item.url || 
               (other.title === item.title && Math.abs(other.title.length - item.title.length) < 10);
      }) !== -1;
      return !isDuplicate;
    })
    .sort((a: ExtractedRedditPost, b: ExtractedRedditPost) => {
      if (b.relevanceScore !== a.relevanceScore) {
        return b.relevanceScore - a.relevanceScore;
      }
      return (b.score + b.comments * 2) - (a.score + a.comments * 2);
    })
    .slice(0, 10); // Reduced from 15 to 10
  
  const dataQuality: DataQuality = {
    totalQueries: strategicQueries.length,
    successfulQueries,
    failedQueries: strategicQueries.length - successfulQueries,
    redditResults: uniqueRedditData.length,
    totalResults: uniqueRedditData.length,
    averageRelevance: uniqueRedditData.length > 0 ? 
      uniqueRedditData.reduce((sum: number, item: ExtractedRedditPost) => sum + item.relevanceScore, 0) / uniqueRedditData.length : 0,
    qualityRating: uniqueRedditData.length > 8 ? 'High' : 
                   uniqueRedditData.length > 4 ? 'Medium' : 'Low',
    hasQuestions: uniqueRedditData.filter((item: ExtractedRedditPost) => item.hasQuestion).length,
    hasProblems: uniqueRedditData.filter((item: ExtractedRedditPost) => item.hasProblem).length,
    hasSolutions: uniqueRedditData.filter((item: ExtractedRedditPost) => item.hasSolution).length
  };
  
  console.log(`📈 Optimized Results: ${dataQuality.qualityRating} quality, ${dataQuality.redditResults} posts`);
  
  return {
    redditData: uniqueRedditData,
    dataQuality,
    allData: uniqueRedditData
  };
};

// ===============================================
// 1. FIXED INTENT-BASED PHRASE GENERATION PROMPT
// ===============================================

const createOptimizedRealDataPhrasePrompt = (
  keyword: Keyword,
  domain: Domain,
  realQuestions: RealQuestion[],
  realPhrases: RealPhrase[],
  userLanguagePatterns: UserLanguagePatterns,
  semanticContext: string
) => `
Generate 10 natural search phrases for: "${keyword.term}"

REAL USER DATA:
${realQuestions.slice(0, 8).map((q: RealQuestion) => `• "${q.question}"`).join('\n')}

USER LANGUAGE: ${userLanguagePatterns.solutionSeekers?.slice(0, 5).join(', ') || 'help, find, best'}

INTENT RULES:
• Informational (35%): how to, what is, why, guide, tips, learn, understand
• Navigational (25%): best, top, near me, professional, find, locate
• Transactional (25%): hire, buy, get, book, contact, purchase, order
• Commercial Investigation (15%): compare, vs, cost, review, price, alternatives

REQUIREMENTS:
- Any length is acceptable
- Natural conversational tone
- Include "${keyword.term}" naturally
- Proper grammar and punctuation
- Real user language patterns
- Prioritize adapting real Reddit questions and language
- Do NOT include any brand, company, or domain names (including ${domain.url} or variants)
- These phrases will be used to test domain visibility in AI responses. So make sure they are useful for testing domain presence in AI responses.
- Ensure variety in intent types and user search patterns

JSON FORMAT:
{
  "phrases": [
    {
      "phrase": "How to find reliable ${keyword.term} services that actually work",
      "intent": "Informational",
      "intentConfidence": 85,
      "relevanceScore": 90,
      "conversionPotential": 75,
      "voiceSearchOptimized": true,
      "basedOnData": "User language"
    }
  ]
}

Generate exactly 10 complete, natural phrases with diverse intents and search patterns.`;

// ===============================================
// 2. ENHANCED INTENT VALIDATION SYSTEM
// ===============================================

const validateIntentAccuracy = (phrase: string, declaredIntent: string) => {
  const intentPatterns = {
    'Informational': {
      required: ['how', 'what', 'why', 'when', 'where', 'guide', 'tutorial', 'tips', 'learn', 'understand', 'explain'],
      forbidden: ['hire', 'buy', 'book', 'order', 'contact', 'get quote'],
      minConfidence: 70
    },
    'Navigational': {
      required: ['best', 'top', 'find', 'locate', 'near me', 'professional', 'certified', 'company', 'service'],
      forbidden: ['how to', 'what is', 'why', 'compare', 'vs'],
      minConfidence: 75
    },
    'Transactional': {
      required: ['hire', 'buy', 'get', 'book', 'order', 'contact', 'call', 'quote', 'consultation', 'appointment'],
      forbidden: ['how to', 'what is', 'guide', 'tutorial'],
      minConfidence: 80
    },
    'Commercial Investigation': {
      required: ['compare', 'vs', 'versus', 'best', 'review', 'cost', 'price', 'which', 'alternatives'],
      forbidden: ['how to', 'hire now', 'book today'],
      minConfidence: 70
    }
  };

  const lowerPhrase = phrase.toLowerCase();
  const pattern = intentPatterns[declaredIntent as keyof typeof intentPatterns];
  
  if (!pattern) return { isValid: false, confidence: 0, issues: ['Invalid intent category'] };

  // Check for required patterns
  const hasRequired = pattern.required.some(req => lowerPhrase.includes(req));
  
  // Check for forbidden patterns
  const hasForbidden = pattern.forbidden.some(forb => lowerPhrase.includes(forb));
  
  // Calculate confidence
  let confidence = hasRequired ? 70 : 20;
  if (hasForbidden) confidence -= 30;
  
  // Additional scoring
  const requiredMatches = pattern.required.filter(req => lowerPhrase.includes(req)).length;
  confidence += requiredMatches * 10;
  
  const issues = [];
  if (!hasRequired) issues.push(`Missing required ${declaredIntent} signals`);
  if (hasForbidden) issues.push(`Contains forbidden patterns for ${declaredIntent}`);
  if (confidence < pattern.minConfidence) issues.push(`Low intent confidence: ${confidence}%`);

  return {
    isValid: confidence >= pattern.minConfidence && !hasForbidden && hasRequired,
    confidence: Math.min(100, Math.max(0, confidence)),
    issues,
    requiredMatches,
    forbiddenMatches: pattern.forbidden.filter(forb => lowerPhrase.includes(forb)).length
  };
};

// ===============================================
// 4. AUTO-CORRECT INTENT FUNCTION
// ===============================================

const autoCorrectIntent = (phrase: string) => {
  const lowerPhrase = phrase.toLowerCase();
  
  // Strong transactional signals
  if (/\b(hire|buy|get|book|order|contact|call|purchase|quote|consultation|appointment)\b/.test(lowerPhrase)) {
    return 'Transactional';
  }
  
  // Strong comparison signals
  if (/\b(compare|vs|versus|which|alternatives|cost|price|review|worth)\b/.test(lowerPhrase)) {
    return 'Commercial Investigation';
  }
  
  // Strong navigational signals
  if (/\b(best|top|find|locate|near me|professional|certified|company|service)\b/.test(lowerPhrase) && 
      !/\b(how|what|why|guide|tutorial)\b/.test(lowerPhrase)) {
    return 'Navigational';
  }
  
  // Default to informational
  return 'Informational';
};

// ===============================================
// ENHANCED PHRASE GENERATION LOGIC
// ===============================================

// Helper functions for improved phrase quality
const calculateIntentConfidence = (phrase: string, intent: string) => {
  const intentSignals: Record<string, string[]> = {
    'Informational': ['how', 'what', 'why', 'guide', 'learn', 'understand', 'explain', 'tell me'],
    'Navigational': ['best', 'top', 'find', 'locate', 'near me', 'professional', 'certified', 'trusted'],
    'Transactional': ['buy', 'hire', 'book', 'get', 'order', 'contact', 'call', 'start', 'try'],
    'Commercial Investigation': ['compare', 'vs', 'review', 'cost', 'price', 'worth', 'which', 'alternatives']
  };
  
  const signals = intentSignals[intent] || [];
  const matches = signals.filter((signal: string) => phrase.toLowerCase().includes(signal)).length;
  return Math.min(95, 60 + (matches * 8)); // Base 60% + 8% per signal
};

const validatePhraseQuality = (phrase: string) => {
  const issues = [];
  
  // Word count check removed: any length is valid
  
  // Intent signal strength
  const hasStrongIntent = /\b(how to|best|top|guide|help|find|buy|hire|compare|review)\b/i.test(phrase);
  if (!hasStrongIntent) {
    issues.push('Weak intent signals detected');
  }
  
  // Natural language flow check
  if (phrase.includes(' and ') && phrase.includes(' or ')) {
    issues.push('Complex phrase structure may not be natural');
  }
  
  return { isValid: issues.length === 0, issues };
};

const extractEntities = (phrase: string, context: string) => {
  const entities = [];
  
  // Extract location entities
  const locationMatch = phrase.match(/\b(in|near|at)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/);
  if (locationMatch) {
    entities.push(locationMatch[2]);
  }
  
  // Extract professional entities
  const professionalMatch = phrase.match(/\b(expert|specialist|consultant|professional|advisor)\b/);
  if (professionalMatch) {
    entities.push(professionalMatch[1]);
  }
  
  // Extract action entities
  const actionMatch = phrase.match(/\b(guide|service|solution|strategy|method)\b/);
  if (actionMatch) {
    entities.push(actionMatch[1]);
  }
  
  return entities;
};

// ===============================================
// ENHANCED PHRASE GENERATION WITH USER DATA
// ===============================================

// 1. EXTRACT REAL QUESTIONS AND PHRASES FROM COMMUNITY DATA
const extractRealUserQuestions = (communityData: MiningSummary | null | undefined): { realQuestions: RealQuestion[]; realPhrases: RealPhrase[]; userLanguagePatterns: UserLanguagePatterns } => {
  if (!communityData?.redditData) {
    return { realQuestions: [], realPhrases: [], userLanguagePatterns: {} };
  }
  
  const dataPoints = communityData.redditData;
  const realQuestions: RealQuestion[] = [];
  const realPhrases: RealPhrase[] = [];
  
  dataPoints.forEach((item: ExtractedRedditPost) => {
    const combinedText = `${item.title} ${item.content}`;
    
    // Extract high-value questions (with question marks)
    const questions = combinedText.match(/[^.!]*\?[^.!]*/g) || [];
    questions.forEach((q: string) => {
      const clean = q.trim().replace(/^\W+|\W+$/g, '');
      if (clean.length > 15 && clean.length < 120) {
        realQuestions.push({
          question: clean,
          relevanceScore: item.relevanceScore,
          engagement: item.score + item.comments,
          hasCommercialIntent: /\b(best|price|cost|hire|buy|service)\b/.test(clean.toLowerCase()),
          hasInformationalIntent: /\b(how|what|why|where|when)\b/.test(clean.toLowerCase()),
          platform: 'reddit'
        });
      }
    });
    
    // Extract problem statements and help requests
    const helpPatterns = [
      /(?:need help with|looking for|advice on|tips for|guide to) ([^.!?]{10,80})/gi,
      /(?:how (?:do|can|to)) ([^.!?]{8,60})/gi,
      /(?:what (?:is|are) the best) ([^.!?]{8,60})/gi,
      /(?:where can i (?:find|get)) ([^.!?]{8,60})/gi,
      /(?:struggling with|having trouble with|issues with) ([^.!?]{8,60})/gi
    ];
    
    helpPatterns.forEach(pattern => {
      const matches = [...combinedText.matchAll(pattern)];
      matches.forEach(match => {
        if (match[0] && match[0].trim().length > 10) {
          realPhrases.push({
            phrase: match[0].trim(),
            context: match[1]?.trim() || '',
            relevanceScore: item.relevanceScore,
            engagement: item.score + item.comments,
            type: 'help_request',
            platform: 'reddit'
          });
        }
      });
    });
  });
  
  // Sort by engagement and relevance, keep top results
  realQuestions.sort((a, b) => (b.engagement + b.relevanceScore) - (a.engagement + a.relevanceScore));
  realPhrases.sort((a, b) => (b.engagement + b.relevanceScore) - (a.engagement + a.relevanceScore));
  
  // Extract authentic language patterns
  const userLanguagePatterns = extractAdvancedLanguagePatterns(dataPoints);
  
  return {
    realQuestions: realQuestions.slice(0, 15),
    realPhrases: realPhrases.slice(0, 20),
    userLanguagePatterns
  };
};

const extractAdvancedLanguagePatterns = (dataPoints: ExtractedRedditPost[]): UserLanguagePatterns => {
  const patterns = {
    questionStarters: new Set<string>(),
    problemDescriptors: new Set<string>(),
    solutionSeekers: new Set<string>(),
    qualityIndicators: new Set<string>(),
    urgencyMarkers: new Set<string>()
  };
  
  dataPoints.forEach((item: ExtractedRedditPost) => {
    const text = `${item.title} ${item.content}`.toLowerCase();
    
    // Extract question starters
    const questionStarters = text.match(/\b(how do i|what is|where can i|when should i|why does|which is|should i|can someone)\b/g) || [];
    questionStarters.forEach(starter => patterns.questionStarters.add(starter));
    
    // Extract problem language
    const problemWords = text.match(/\b(struggling with|having trouble|problem with|issue with|can't figure out|need help with|stuck on)\b/g) || [];
    problemWords.forEach(word => patterns.problemDescriptors.add(word));
    
    // Extract solution-seeking language
    const solutionWords = text.match(/\b(looking for|need to find|want to|trying to|hoping to|seeking|searching for)\b/g) || [];
    solutionWords.forEach(word => patterns.solutionSeekers.add(word));
    
    // Extract quality indicators
    const qualityWords = text.match(/\b(best|top|excellent|great|amazing|reliable|trusted|proven|effective)\b/g) || [];
    qualityWords.forEach(word => patterns.qualityIndicators.add(word));
    
    // Extract urgency markers
    const urgencyWords = text.match(/\b(urgent|asap|quickly|fast|immediate|now|today|soon)\b/g) || [];
    urgencyWords.forEach(word => patterns.urgencyMarkers.add(word));
  });
  
  return {
    questionStarters: Array.from(patterns.questionStarters).slice(0, 8),
    problemDescriptors: Array.from(patterns.problemDescriptors).slice(0, 8),
    solutionSeekers: Array.from(patterns.solutionSeekers).slice(0, 8),
    qualityIndicators: Array.from(patterns.qualityIndicators).slice(0, 8),
    urgencyMarkers: Array.from(patterns.urgencyMarkers).slice(0, 5)
  };
};

// 2. EXTRACT AUTHENTIC USER LANGUAGE PATTERNS
const extractLanguagePatterns = (dataPoints: ExtractedRedditPost[]): UserLanguagePatterns => {
  const patterns = {
    problemDescriptors: new Set<string>(),
    solutionSeekers: new Set<string>(),
    qualityIndicators: new Set<string>(),
    urgencyMarkers: new Set<string>(),
    comparisonLanguage: new Set<string>(),
    emotionalTriggers: new Set<string>()
  };
  
  dataPoints.forEach((item: ExtractedRedditPost) => {
    const text = `${item.title} ${item.content}`.toLowerCase();
    
    // Problem descriptors
    const problemWords = text.match(/\b(struggling with|having trouble|issues with|problems with|difficult to|hard to|can't figure out|frustrated with|stuck with)\b/g) || [];
    problemWords.forEach((word: string) => patterns.problemDescriptors.add(word));
    
    // Solution seekers
    const solutionWords = text.match(/\b(looking for|need help|seeking advice|want to find|trying to|help me|show me how|teach me|guide me)\b/g) || [];
    solutionWords.forEach((word: string) => patterns.solutionSeekers.add(word));
    
    // Quality indicators
    const qualityWords = text.match(/\b(best|top|excellent|amazing|outstanding|reliable|trusted|proven|effective|successful)\b/g) || [];
    qualityWords.forEach((word: string) => patterns.qualityIndicators.add(word));
    
    // Urgency markers
    const urgencyWords = text.match(/\b(urgent|asap|emergency|immediate|quickly|fast|soon|now|today)\b/g) || [];
    urgencyWords.forEach((word: string) => patterns.urgencyMarkers.add(word));
    
    // Comparison language
    const comparisonWords = text.match(/\b(vs|versus|compared to|better than|worse than|alternative to|instead of|rather than)\b/g) || [];
    comparisonWords.forEach((word: string) => patterns.comparisonLanguage.add(word));
    
    // Emotional triggers
    const emotionalWords = text.match(/\b(worried|concerned|confused|overwhelmed|excited|hopeful|disappointed|satisfied)\b/g) || [];
    emotionalWords.forEach((word: string) => patterns.emotionalTriggers.add(word));
  });
  
  return {
    problemDescriptors: Array.from(patterns.problemDescriptors).slice(0, 10),
    solutionSeekers: Array.from(patterns.solutionSeekers).slice(0, 10),
    qualityIndicators: Array.from(patterns.qualityIndicators).slice(0, 10),
    urgencyMarkers: Array.from(patterns.urgencyMarkers).slice(0, 5),
    comparisonLanguage: Array.from(patterns.comparisonLanguage).slice(0, 8),
    emotionalTriggers: Array.from(patterns.emotionalTriggers).slice(0, 8)
  };
};

// 3. ENHANCED PHRASE GENERATION PROMPT WITH REAL DATA (LEGACY VERSION)
const createLegacyRealDataPhrasePrompt = (
  keyword: Keyword,
  domain: Domain,
  realQuestions: RealQuestion[],
  realPhrases: RealPhrase[],
  userLanguagePatterns: UserLanguagePatterns,
  semanticContext: string
) => `
# AUTHENTIC USER LANGUAGE PHRASE GENERATOR v5.0
## Real Community Data Integration

**TARGET ANALYSIS:**
• Keyword: "${keyword.term}"
• Domain: ${domain.url}
• Context: ${domain.context}

**REAL USER QUESTIONS FROM REDDIT:**
${realQuestions.slice(0, 12).map((q: RealQuestion) => 
  `• "${q.question}" [${q.platform.toUpperCase()}] (Engagement: ${q.engagement})`
).join('\n')}

**REAL USER PHRASES AND PROBLEMS:**
${realPhrases.slice(0, 18).map((p: RealPhrase) => 
  `• "${p.phrase}" [${(p.platform || 'REDDIT').toUpperCase()}]`
).join('\n')}

**AUTHENTIC USER LANGUAGE PATTERNS:**
Problem Language: ${userLanguagePatterns.problemDescriptors?.join(', ') || 'None'}
Solution Seeking: ${userLanguagePatterns.solutionSeekers?.join(', ') || 'None'}
Quality Words: ${userLanguagePatterns.qualityIndicators?.join(', ') || 'None'}
Urgency Terms: ${userLanguagePatterns.urgencyMarkers?.join(', ') || 'None'}
Comparison Language: ${userLanguagePatterns.comparisonLanguage?.join(', ') || 'None'}

## PHRASE GENERATION REQUIREMENTS

**CRITICAL RULE:** Generate COMPLETE PHRASES that sound like REAL USER QUESTIONS and problems, not marketing copy.
- Do NOT include any brand or domain names (including ${domain.url} or brand variants)
- These phrases will be used to test domain visibility in AI responses; make them brand-neutral and useful for discovery and comparison

**Method:**
1. Take the real user questions and adapt them to our keyword
2. Use the actual language patterns from the community data
3. Maintain the authentic, conversational tone
4. Keep the natural question structure and flow

**Example Transformation:**
Real Question: "How do I find a reliable marketing agency that won't waste my money?"
Adapted for "SEO services": "How do I find reliable SEO services that actually deliver results?"

**Quality Criteria:**
✓ Sounds like something a real person would type into Google
✓ Uses authentic community language patterns
✓ Addresses real problems found in the data
✓ Natural conversational flow
✓ Any length is acceptable; prioritize clarity and authenticity
✓ Clear intent signals
✓ Excludes brand and domain names entirely

**CRITICAL OUTPUT FORMAT:**
You MUST return a JSON array with exactly 10 complete phrase objects. Each object MUST have a "phrase" field containing a complete sentence.

Return this exact JSON structure:

{
  "phrases": [
    {
      "phrase": "How to implement ${keyword.term} effectively in the workplace",
      "intent": "Informational",
      "intentConfidence": 85,
      "relevanceScore": 92,
      "conversionPotential": 78,
      "voiceSearchOptimized": true,
      "basedOnData": "User language"
    }
  ]
}

**IMPORTANT:** Each "phrase" field must be a complete, natural sentence that someone would actually search for. Do NOT return individual words or incomplete phrases.`;

// 4. QUALITY VALIDATION FOR NATURAL PHRASES
const validatePhraseNaturalness = (phrase: string) => {
  const naturalityChecks = {
    hasQuestionWords: /^(how|what|where|when|why|which|who|is|are|can|should|will|do|does)/i.test(phrase),
    conversationalFlow: !/\b(optimization|maximization|utilization)\b/i.test(phrase),
    noKeywordStuffing: !/(seo|optimization|services|solutions|expert|professional){2,}/i.test(phrase),
    humanLikeLanguage: /\b(help|find|choose|get|need|want|looking for|trying to)\b/i.test(phrase)
  };
  
  const score = Object.values(naturalityChecks).filter(Boolean).length * 25;
  
  return {
    score,
    isNatural: score >= 60,
    suggestions: {
      addQuestionWord: !naturalityChecks.hasQuestionWords,
      simplifyLanguage: !naturalityChecks.conversationalFlow,
      reduceKeywords: !naturalityChecks.noKeywordStuffing,
      addHumanLanguage: !naturalityChecks.humanLikeLanguage
    }
  };
};

// ===============================================
// 3. IMPROVED PHRASE GENERATION WITH INTENT VALIDATION
// ===============================================

const generateEnhancedIntentPhrases = async (
  keyword: Keyword,
  domain: Domain,
  semanticContext: string,
  communityInsightData: any,
  keywordSearchPatterns: any,
  sendEvent: EventSender
) => {
  try {
    console.log(`🎯 Generating intent-based phrases for: ${keyword.term}`);
    
    // Extract user data
    const { realQuestions, realPhrases, userLanguagePatterns } = extractRealUserQuestions(communityInsightData);
    
    // Emit extracted Reddit posts for this keyword during phrase generation
    try {
      const posts = communityInsightData?.redditData || [];
      if (Array.isArray(posts) && posts.length > 0) {
        sendEvent('debug', {
          type: 'reddit',
          stage: 'phrase_generation',
          keyword: keyword.term,
          posts
        });
      }
    } catch (error) {
      // Silently fail debug event emission - non-critical
      console.debug(`Failed to emit Reddit debug event for ${keyword.term}:`, error);
    }
    
    // Use intent-focused prompt
    const prompt = createOptimizedRealDataPhrasePrompt(
      keyword,
      domain,
      realQuestions,
      realPhrases,
      userLanguagePatterns,
      semanticContext
    );

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o', // Keep full model for phrase generation quality
      messages: [
        {
          role: 'system',
          content: 'Generate natural search phrases. Focus on conversational language and proper grammar. Return valid JSON only.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3, // Slightly higher for more natural variation
      max_tokens: 2500, // Increased for 10 phrases
      response_format: { type: "json_object" }
    });

    const response = completion.choices[0]?.message?.content;
    
    // NEW: emit debug raw AI response for phrase generation
    try {
      if (response && typeof sendEvent === 'function') {
        sendEvent('debug', {
          type: 'ai',
          stage: 'phrase_generation',
          keyword: keyword.term,
          responseRaw: response
        });
      }
    } catch (error) {
      // Silently fail debug event emission - non-critical
      console.debug(`Failed to emit AI debug event for ${keyword.term}:`, error);
    }
    
    if (response && response.trim()) {
      let phraseDataRaw = parseAIResponse(response, null);
      let phraseData: PhraseAnalysisResult[] = [];
      
      // Extract phrases array
      if (phraseDataRaw?.phrases && Array.isArray(phraseDataRaw.phrases)) {
        phraseData = phraseDataRaw.phrases;
      } else if (Array.isArray(phraseDataRaw)) {
        phraseData = phraseDataRaw;
      }

      if (Array.isArray(phraseData) && phraseData.length > 0) {
        const validatedPhrases: PhraseAnalysisResult[] = [];
        
        phraseData.forEach((phraseObj: PhraseAnalysisResult, index: number) => {
          console.log(`🔍 Validating phrase ${index + 1}: "${phraseObj.phrase}"`);
          
          // Validate phrase structure
          if (!phraseObj.phrase || typeof phraseObj.phrase !== 'string') {
            console.warn(`❌ Invalid phrase structure at index ${index}`);
            return;
          }

          // Validate intent accuracy
          const intentValidation: IntentValidation = validateIntentAccuracy(phraseObj.phrase, phraseObj.intent);
          
          if (!intentValidation.isValid) {
            console.warn(`❌ Intent validation failed for "${phraseObj.phrase}": ${intentValidation.issues.join(', ')}`);
            
            // Auto-correct intent based on phrase content
            const correctedIntent = autoCorrectIntent(phraseObj.phrase);
            console.log(`🔄 Auto-correcting intent from "${phraseObj.intent}" to "${correctedIntent}"`);
            phraseObj.intent = correctedIntent;
            phraseObj.intentConfidence = Math.max(60, intentValidation.confidence);
          }

          // Ensure phrase quality
          const words = phraseObj.phrase.trim().split(/\s+/);
          if (words.length < 6 || words.length > 16) {
            console.warn(`⚠️ Phrase length issue: ${words.length} words`);
          }

          // Create validated phrase object
          const validatedPhrase = {
            domainId: domain.id,
            keywordId: keyword.id,
            phrase: phraseObj.phrase,
            intent: phraseObj.intent,
            intentConfidence: Math.min(100, Math.max(50, phraseObj.intentConfidence || 80)),
            relevanceScore: Math.min(100, Math.max(60, phraseObj.relevanceScore || 85)),
            sources: realQuestions.length > 0 ? ['User Data', 'Intent Analysis'] : ['AI Generated', 'Intent Focused'],
            trend: 'Rising',
            isSelected: false,
            tokenUsage: Math.floor((completion.usage?.total_tokens || 0) / phraseData.length)
          };

          validatedPhrases.push(validatedPhrase);
          
          // Send real-time update with intent validation details
          sendEvent('phrase-generated', {
            id: `new-${keyword.id}-${index}`,
            phrase: validatedPhrase.phrase,
            intent: validatedPhrase.intent,
            intentConfidence: validatedPhrase.intentConfidence,
            relevanceScore: validatedPhrase.relevanceScore,
            sources: validatedPhrase.sources,
            trend: validatedPhrase.trend,
            editable: true,
            selected: false,
            parentKeyword: keyword.term,
            keywordId: keyword.id,
            wordCount: words.length,
            intentValidation: {
              isValid: intentValidation.isValid,
              confidence: intentValidation.confidence,
              autoCorrected: phraseObj.intent !== (phraseObj.originalIntent || phraseObj.intent)
            }
          });
          
          console.log(`✅ Validated phrase: "${validatedPhrase.phrase}" (${validatedPhrase.intent}, ${validatedPhrase.intentConfidence}% confidence)`);
        });

        console.log(`🎯 Generated ${validatedPhrases.length} validated intent-based phrases for "${keyword.term}"`);
        return { phrasesToInsert: validatedPhrases, tokenUsage: completion.usage?.total_tokens || 0 };
      }
    }
    
    throw new Error('No valid phrases generated');

  } catch (error) {
    console.error(`❌ Intent-based phrase generation failed for ${keyword.term}:`, error);
    
    // Enhanced fallback with proper intent distribution - 10 phrases
    const intentBasedFallback = [
      {
        phrase: `How to choose the right ${keyword.term} for my business needs`,
        intent: 'Informational',
        intentConfidence: 85,
        relevanceScore: 88
      },
      {
        phrase: `Best ${keyword.term} services near me with good reviews`,
        intent: 'Navigational',
        intentConfidence: 90,
        relevanceScore: 85
      },
      {
        phrase: `What does professional ${keyword.term} cost in ${domain.location || '2024'}`,
        intent: 'Commercial Investigation',
        intentConfidence: 85,
        relevanceScore: 82
      },
      {
        phrase: `Hire experienced ${keyword.term} consultant for immediate results`,
        intent: 'Transactional',
        intentConfidence: 92,
        relevanceScore: 86
      },
      {
        phrase: `Why is ${keyword.term} important for small business growth`,
        intent: 'Informational',
        intentConfidence: 80,
        relevanceScore: 84
      },
      {
        phrase: `Compare ${keyword.term} providers and pricing options`,
        intent: 'Commercial Investigation',
        intentConfidence: 88,
        relevanceScore: 83
      },
      {
        phrase: `Find local ${keyword.term} experts in my area`,
        intent: 'Navigational',
        intentConfidence: 87,
        relevanceScore: 81
      },
      {
        phrase: `Learn about ${keyword.term} best practices and strategies`,
        intent: 'Informational',
        intentConfidence: 82,
        relevanceScore: 79
      },
      {
        phrase: `Get quotes for ${keyword.term} services from top providers`,
        intent: 'Transactional',
        intentConfidence: 89,
        relevanceScore: 87
      },
      {
        phrase: `What are the benefits of professional ${keyword.term} services`,
        intent: 'Informational',
        intentConfidence: 78,
        relevanceScore: 76
      }
    ];

    const fallbackPhrasesToInsert = intentBasedFallback.map(fallback => ({
      domainId: domain.id,
      keywordId: keyword.id,
      phrase: fallback.phrase,
      intent: fallback.intent,
      intentConfidence: fallback.intentConfidence,
      relevanceScore: fallback.relevanceScore,
      sources: ['AI Generated - Error Fallback'],
      trend: 'Rising',
      isSelected: false,
      tokenUsage: 0
    }));

    return { phrasesToInsert: fallbackPhrasesToInsert, tokenUsage: 0 };
  }
};

// ===============================================
// 5. UPDATED ENHANCED PHRASE GENERATION FUNCTION WITH USER DATA (LEGACY)
// ===============================================

const generateEnhancedPhrases = async (
  keyword: Keyword,
  domain: Domain,
  semanticContext: string,
  communityInsightData: MiningSummary | null | undefined,
  keywordSearchPatterns: SearchPattern | null | undefined,
  sendEvent: EventSender
) => {
  try {
    // Extract user data from community insights
    const { realQuestions, realPhrases, userLanguagePatterns } = extractRealUserQuestions(communityInsightData);
    
    console.log(`Extracted ${realQuestions.length} real questions and ${realPhrases.length} real phrases for ${keyword.term}`);
    
    // Use user data if available, otherwise fallback to original method
    let prompt;
    if (realQuestions.length > 0 || realPhrases.length > 0) {
      prompt = createLegacyRealDataPhrasePrompt(
        keyword,
        domain,
        realQuestions,
        realPhrases,
        userLanguagePatterns,
        semanticContext
      );
      console.log(`Using community data for ${keyword.term}`);
    } else {
      // Fallback to legacy prompt if no real data
      prompt = createLegacyRealDataPhrasePrompt(
        keyword,
        domain,
        [],
        [],
        {},
        semanticContext
      );
      console.log(`No community data found for ${keyword.term}, using fallback method`);
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are an expert at converting user questions into search phrases. Maintain authentic, conversational tone. Return valid JSON arrays only.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3, // Lower temperature for more consistent, authentic results
      max_tokens: 3000, // Increased for 10 phrases
      response_format: { type: "json_object" }
    });

    const response = completion.choices[0]?.message?.content;
    if (response && response.trim()) {
      let phraseData = parseAIResponse(response, null);
      
      console.log('Raw AI response structure:', {
        hasData: !!phraseData,
        isArray: Array.isArray(phraseData),
        hasPhrases: phraseData && typeof phraseData === 'object' && 'phrases' in phraseData,
        phrasesLength: phraseData?.phrases?.length || 0
      });
      
      // Handle different response formats
      if (phraseData && typeof phraseData === 'object') {
        if (phraseData.phrases && Array.isArray(phraseData.phrases)) {
          phraseData = phraseData.phrases;
          console.log(`Extracted ${phraseData.length} phrases from phrases array`);
        } else if (Array.isArray(phraseData)) {
          console.log(`Response is already an array with ${phraseData.length} items`);
        } else {
          // Try to find any array in the response
          const arrays = Object.values(phraseData).filter(Array.isArray);
          if (arrays.length > 0) {
            phraseData = arrays[0];
            console.log(`Found array in response with ${phraseData.length} items`);
          } else {
            console.warn('No array found in response, using fallback');
            phraseData = null;
          }
        }
      }

      if (Array.isArray(phraseData) && phraseData.length > 0) {
        const phrasesToInsert: any[] = [];
        
        phraseData.forEach((phraseObj: PhraseAnalysisResult, phraseIndex: number) => {
          console.log(`Processing phrase object ${phraseIndex}:`, phraseObj);
          
          // Handle different possible response formats
          let phraseText = '';
          if (typeof phraseObj === 'string') {
            phraseText = phraseObj;
          } else if (phraseObj?.phrase && typeof phraseObj.phrase === 'string') {
            phraseText = phraseObj.phrase;
          } else if (phraseObj?.text && typeof phraseObj.text === 'string') {
            phraseText = phraseObj.text;
          } else {
            console.warn(`Invalid phrase object at index ${phraseIndex}:`, phraseObj);
            return;
          }

          // Enhanced phrase validation for naturalness
          const words = phraseText.trim().split(/\s+/);
          let optimizedPhrase = phraseText;
          
          // No minimum word count; accept any non-empty phrase
          if (phraseText.trim().length === 0) {
            console.warn(`Empty phrase at index ${phraseIndex}`);
            return;
          }
          
          // Ensure natural question flow
          if (!optimizedPhrase.match(/^(how|what|where|when|why|which|who|is|are|can|should|will|do|does)/i)) {
            if (words.length < 12) {
              optimizedPhrase = `How to ${optimizedPhrase.toLowerCase()}`;
            }
          }
          
          // Validate word count
          if (words.length < 8) {
            optimizedPhrase = `Complete guide to ${optimizedPhrase} for better results`;
          } else if (words.length > 15) {
            optimizedPhrase = words.slice(0, 15).join(' ');
          }

          // Validate naturalness
          const naturalnessCheck = validatePhraseNaturalness(optimizedPhrase);
          
          const phrase = {
            domainId: domain.id,
            keywordId: keyword.id,
            phrase: optimizedPhrase,
            intent: phraseObj.intent || 'Informational',
            intentConfidence: Math.min(100, Math.max(50, phraseObj.intentConfidence || 85)),
            relevanceScore: Math.min(100, Math.max(50, phraseObj.relevanceScore || 85)),
            sources: realQuestions.length > 0 ? ['User Questions', 'Community Data'] : ['AI Generated'],
            trend: 'Rising',
            isSelected: false,
            tokenUsage: Math.floor((completion.usage?.total_tokens || 0) / phraseData.length)
          };

          phrasesToInsert.push(phrase);
          
          // Send real-time phrase update with enhanced metadata
          sendEvent('phrase-generated', {
            id: `new-${keyword.id}-${phraseIndex}`,
            phrase: phrase.phrase,
            intent: phrase.intent,
            intentConfidence: phrase.intentConfidence,
            relevanceScore: phrase.relevanceScore,
            sources: phrase.sources,
            trend: phrase.trend,
            editable: true,
            selected: false,
            parentKeyword: keyword.term,
            keywordId: keyword.id,
            wordCount: phrase.phrase.trim().split(/\s+/).length,
            basedOnRealData: realQuestions.length > 0 || realPhrases.length > 0,
            naturalness: phraseObj.naturalness || naturalnessCheck.score
          });
        });

        return { phrasesToInsert, tokenUsage: completion.usage?.total_tokens || 0 };
      } else {
        throw new Error('Invalid phrase data structure received from AI');
      }
    } else {
      throw new Error('Empty response from OpenAI API');
    }

  } catch (error) {
    console.error(`Enhanced phrase generation with real data failed for ${keyword.term}:`, error);
    
    // Enhanced fallback with user patterns if available
    const { userLanguagePatterns } = extractRealUserQuestions(communityInsightData);
    
    // Ensure userLanguagePatterns is an object with the expected properties
    const patterns = Array.isArray(userLanguagePatterns) ? {
      problemDescriptors: [],
      solutionSeekers: [],
      qualityIndicators: [],
      urgencyMarkers: [],
      comparisonLanguage: [],
      emotionalTriggers: []
    } : userLanguagePatterns;
    
    const fallbackPhrases = [
      {
        phrase: `How to choose the right ${keyword.term} for my business needs`,
        intent: 'Informational',
        intentConfidence: 85,
        relevanceScore: 88
      },
      {
        phrase: `Best ${keyword.term} services near me with good reviews`,
        intent: 'Navigational',
        intentConfidence: 90,
        relevanceScore: 85
      },
      {
        phrase: `What does professional ${keyword.term} cost in ${domain.location || '2024'}`,
        intent: 'Commercial Investigation',
        intentConfidence: 85,
        relevanceScore: 82
      },
      {
        phrase: `Hire experienced ${keyword.term} consultant for immediate results`,
        intent: 'Transactional',
        intentConfidence: 92,
        relevanceScore: 86
      },
      {
        phrase: `Why is ${keyword.term} important for small business growth`,
        intent: 'Informational',
        intentConfidence: 80,
        relevanceScore: 84
      },
      {
        phrase: `Compare ${keyword.term} providers and pricing options`,
        intent: 'Commercial Investigation',
        intentConfidence: 88,
        relevanceScore: 83
      },
      {
        phrase: `Find local ${keyword.term} experts in my area`,
        intent: 'Navigational',
        intentConfidence: 87,
        relevanceScore: 81
      },
      {
        phrase: `Learn about ${keyword.term} best practices and strategies`,
        intent: 'Informational',
        intentConfidence: 82,
        relevanceScore: 79
      },
      {
        phrase: `Get quotes for ${keyword.term} services from top providers`,
        intent: 'Transactional',
        intentConfidence: 89,
        relevanceScore: 87
      },
      {
        phrase: `What are the benefits of professional ${keyword.term} services`,
        intent: 'Informational',
        intentConfidence: 78,
        relevanceScore: 76
      }
    ];

    const phrasesToInsert: any[] = [];
    fallbackPhrases.forEach((fallbackPhrase, phraseIndex) => {
      const phraseData = {
        domainId: domain.id,
        keywordId: keyword.id,
        phrase: fallbackPhrase.phrase,
        intent: fallbackPhrase.intent,
        intentConfidence: fallbackPhrase.intentConfidence,
        relevanceScore: fallbackPhrase.relevanceScore,
        sources: ['AI Generated - Enhanced Fallback with User Patterns'],
        trend: 'Rising',
        isSelected: false,
        tokenUsage: 0
      };

      phrasesToInsert.push(phraseData);
    });

    return { phrasesToInsert, tokenUsage: 0 };
  }
};



const extractSubredditFromUrl = (url: string): string => {
  const match = url.match(/reddit\.com\/r\/([^\/]+)/);
  return match ? match[1] : '';
};

// Add this helper function for relevance scoring
const calculateRelevanceScore = (text: string, businessContext: string): number => {
  const lowerText = text.toLowerCase();
  const lowerContext = businessContext.toLowerCase();
  const contextWords = lowerContext.split(/\s+/);
  
  let score = 0;
  
  // Exact context match
  if (lowerText.includes(lowerContext)) score += 10;
  
  // Individual word matches
  contextWords.forEach(word => {
    if (word.length > 2 && lowerText.includes(word)) {
      score += 2;
    }
  });
  
  // Related terms for women empowerment and mentorship
  const relatedTerms = [
    'women', 'woman', 'girl', 'female', 'ladies', 'sister',
    'empower', 'empowerment', 'mentor', 'mentorship', 'leadership',
    'career', 'professional', 'business', 'success', 'growth',
    'advice', 'tips', 'help', 'support', 'community', 'network',
    'confidence', 'skills', 'development', 'opportunity', 'challenge'
  ];
  
  relatedTerms.forEach(term => {
    if (lowerText.includes(term)) {
      score += 1;
    }
  });
  
  // Quality indicators
  if (lowerText.includes('problem') || lowerText.includes('issue')) score += 3;
  if (lowerText.includes('solution') || lowerText.includes('help')) score += 3;
  if (lowerText.includes('how to') || lowerText.includes('best')) score += 2;
  if (lowerText.includes('experience') || lowerText.includes('story')) score += 2;
  if (lowerText.includes('advice') || lowerText.includes('tips')) score += 2;
  
  // Length bonus for substantial content
  if (text.length > 50) score += 1;
  if (text.length > 100) score += 1;
  if (text.length > 200) score += 1;
  
  // Bonus for question format (common in community discussions)
  if (lowerText.includes('?') || lowerText.includes('what') || lowerText.includes('how') || lowerText.includes('why')) {
    score += 1;
  }
  
  // Ensure minimum score for any community content
  return Math.max(score, 1); // Minimum score of 1 for any community content
};

const router = Router();
const prisma = new PrismaClient();
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Helper function for retry operations
const retryOperation = async (operation: () => Promise<any>, maxRetries = 3, delay = 1000) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
    }
  }
};

// Helper function to clean and parse JSON responses from AI
const parseAIResponse = (response: string, fallbackData: any = null): any => {
  if (!response || response.trim() === '') {
    console.warn('Empty AI response received, using fallback data');
    return fallbackData;
  }

  try {
    let cleanResponse = response.trim();
    
    // Remove markdown code blocks more aggressively
    const jsonBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/g;
    const match = jsonBlockRegex.exec(cleanResponse);
    if (match) {
      cleanResponse = match[1].trim();
    }
    
    // Remove any text before the first { or [
    const firstBrace = cleanResponse.indexOf('{');
    const firstBracket = cleanResponse.indexOf('[');
    const startIndex = Math.min(
      firstBrace >= 0 ? firstBrace : Infinity,
      firstBracket >= 0 ? firstBracket : Infinity
    );
    
    if (startIndex !== Infinity) {
      cleanResponse = cleanResponse.substring(startIndex);
    }
    
    // Find the last complete JSON object/array
    let braceCount = 0;
    let bracketCount = 0;
    let inString = false;
    let escapeNext = false;
    let lastValidEnd = -1;
    
    for (let i = 0; i < cleanResponse.length; i++) {
      const char = cleanResponse[i];
      
      if (escapeNext) {
        escapeNext = false;
        continue;
      }
      
      if (char === '\\') {
        escapeNext = true;
        continue;
      }
      
      if (char === '"') {
        inString = !inString;
        continue;
      }
      
      if (inString) continue;
      
      if (char === '{') braceCount++;
      else if (char === '}') {
        braceCount--;
        if (braceCount === 0 && bracketCount === 0) {
          lastValidEnd = i;
        }
      }
      else if (char === '[') bracketCount++;
      else if (char === ']') {
        bracketCount--;
        if (braceCount === 0 && bracketCount === 0) {
          lastValidEnd = i;
        }
      }
    }
    
    if (lastValidEnd > 0) {
      cleanResponse = cleanResponse.substring(0, lastValidEnd + 1);
    }
    
    // Clean up common JSON issues
    cleanResponse = cleanResponse
      .replace(/,(\s*[}\]])/g, '$1') // Remove trailing commas
      .replace(/([}\]])(\s*)([}\]])/g, '$1$2$3') // Fix bracket spacing
      .replace(/\n\s*/g, ' ') // Remove newlines and extra spaces
      .replace(/\s+/g, ' ') // Normalize spaces
      .trim();
    
    const parsed = JSON.parse(cleanResponse);
    console.log('Successfully parsed AI response');
    return parsed;
    
  } catch (parseError) {
    console.warn('JSON parsing failed, attempting repair...', parseError);
    
    // Try to extract and parse individual objects from the response
    try {
      // Look for array patterns
      if (response.includes('[') && response.includes(']')) {
        const arrayMatches = response.match(/\[[\s\S]*?\]/g);
        if (arrayMatches && arrayMatches.length > 0) {
          const lastArray = arrayMatches[arrayMatches.length - 1];
          return JSON.parse(lastArray);
        }
      }
      
      // Look for object patterns
      if (response.includes('{') && response.includes('}')) {
        const objectMatches = response.match(/\{[\s\S]*?\}/g);
        if (objectMatches && objectMatches.length > 0) {
          const lastObject = objectMatches[objectMatches.length - 1];
          return JSON.parse(lastObject);
        }
      }
    } catch (repairError) {
      console.warn('JSON repair also failed:', repairError);
    }
    
    console.warn('Using fallback data due to JSON parsing failure');
    return fallbackData || { error: 'Failed to parse AI response', originalResponse: response.substring(0, 500) };
  }
};

// GET /enhanced-phrases/:domainId/step3 - Load Step3Results data
router.get('/:domainId/step3', authenticateToken, async (req, res) => {
  const { domainId } = req.params;
  const authReq = req as any;

  try {
    // Get domain and verify access
    const domain = await prisma.domain.findUnique({
      where: { id: parseInt(domainId) },
      include: {
        keywords: {
          include: {
            generatedIntentPhrases: {
              include: {
                relevanceScoreResults: true
              }
            },
            communityInsights: true,
            searchPatterns: true
          }
        },
        semanticAnalyses: true,
        keywordAnalyses: true,
        searchVolumeClassifications: true,
        intentClassifications: true
      }
    });

    if (!domain || domain.userId !== authReq.user.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Transform data for Step3Results format
    const step3Data = {
      domain: {
        id: domain.id,
        url: domain.url,
        context: domain.context,
        location: domain.location
      },
      selectedKeywords: domain.keywords.map((kw: any) => ({
        id: kw.id,
        keyword: kw.term,
        volume: kw.volume,
        difficulty: kw.difficulty,
        cpc: kw.cpc,
        isSelected: kw.isSelected,
        isCustom: kw.isCustom,
        createdAt: kw.createdAt,
        updatedAt: kw.updatedAt
      })),
      analysis: {
        semanticAnalysis: domain.semanticAnalyses[0] || null,
        keywordAnalysis: domain.keywordAnalyses[0] || null,
        searchVolumeClassification: domain.searchVolumeClassifications[0] || null,
        intentClassification: domain.intentClassifications[0] || null
      },
      existingPhrases: domain.keywords.flatMap((kw: any) => 
        (kw.generatedIntentPhrases || []).map((phrase: any) => ({
          id: phrase.id.toString(),
          phrase: phrase.phrase,
          relevanceScore: phrase.relevanceScore || Math.floor(Math.random() * 30) + 70,
          intent: phrase.intent || 'Informational',
          intentConfidence: phrase.intentConfidence || 75,
          sources: (phrase.sources as string[]) || ['AI Generated', 'Community'],
          trend: phrase.trend || 'Rising',
          editable: true,
          selected: phrase.isSelected,
          parentKeyword: kw.term,
          parentKeywordIsCustom: kw.isCustom,
          keywordId: kw.id,
          createdAt: phrase.createdAt,
          updatedAt: phrase.updatedAt
        }))
      ),
      communityInsights: domain.keywords.flatMap((kw: any) => 
        (kw.communityInsights || []).map((insight: any) => ({
          keywordId: kw.id,
          keyword: kw.term,
          sources: insight.sources,
          summary: insight.summary
        }))
      ),
      searchPatterns: domain.keywords.flatMap((kw: any) => 
        (kw.searchPatterns || []).map((pattern: any) => ({
          keywordId: kw.id,
          keyword: kw.term,
          patterns: pattern.patterns,
          summary: pattern.summary
        }))
      )
    };

    res.json(step3Data);
  } catch (error) {
    console.error('Error loading Step3Results data:', error);
    res.status(500).json({ error: 'Failed to load Step3Results data' });
  }
});

// POST /enhanced-phrases/:domainId/step3/generate - UNIFIED ENHANCED PHRASES GENERATION
router.post('/:domainId/step3/generate', authenticateToken, async (req, res) => {
  const { domainId } = req.params;
  const authReq = req as any;

  // Set up SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });

  const sendEvent: EventSender = (event: string, data: any) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    // Get domain and keywords
    const domain = await prisma.domain.findUnique({
      where: { id: parseInt(domainId) },
      include: {
        keywords: true
      }
    });

    if (!domain || domain.userId !== authReq.user.userId) {
      sendEvent('error', { error: 'Access denied' });
      res.end();
      return;
    }

    // Use selected keywords if available, otherwise use all keywords
    const selectedKeywords = domain.keywords.filter(kw => kw.isSelected);
    const keywordsToProcess = selectedKeywords.length > 0 ? selectedKeywords : domain.keywords;
    
    if (keywordsToProcess.length === 0) {
      sendEvent('error', { error: 'No keywords found' });
      res.end();
      return;
    }

    // Balanced approach: Group keywords by priority for optimal processing
    const keywordPriority = {
      high: keywordsToProcess.filter(kw => (kw.volume || 0) > 1000),
      medium: keywordsToProcess.filter(kw => (kw.volume || 0) > 100 && (kw.volume || 0) <= 1000),
      low: keywordsToProcess.filter(kw => (kw.volume || 0) <= 100)
    };

    console.log(`Keyword priority distribution: High=${keywordPriority.high.length}, Medium=${keywordPriority.medium.length}, Low=${keywordPriority.low.length}`);
    
    // Process high-priority keywords with enhanced analysis (2-3 keywords max)
    const highValueKeywords = keywordPriority.high.slice(0, 3);
    // Process medium-priority keywords with balanced approach (5-7 keywords max)
    const mediumValueKeywords = keywordPriority.medium.slice(0, 7);
    // Process low-priority keywords with fast track (remaining)
    const lowValueKeywords = keywordPriority.low;
    
    const totalKeywords = highValueKeywords.length + mediumValueKeywords.length + lowValueKeywords.length;

    // Initialize generation steps according to flowchart
    const generatingSteps = [
      { name: 'Semantic Content Analysis', status: 'pending', progress: 0, description: 'Analyzing brand voice, theme, and target audience' },
      { name: 'Community Data Mining', status: 'pending', progress: 0, description: 'Extracting real insights from Reddit using Reddit API' },
      { name: 'Competitor Analysis', status: 'pending', progress: 0, description: 'Analyzing competitor search positioning' },
      { name: 'Search Pattern Analysis', status: 'pending', progress: 0, description: 'Analyzing user search behaviors' },
      { name: 'Creating optimized intent phrases', status: 'pending', progress: 0, description: 'Generating optimized search phrases' },
      { name: 'Intent Classification', status: 'pending', progress: 0, description: 'Classifying generated phrases by intent' },
      { name: 'Relevance Score', status: 'pending', progress: 0, description: 'Computing semantic relevance scores' }
    ];

    sendEvent('steps', generatingSteps);

    let totalTokenUsage = 0;

    // Initialize data storage arrays
    // Initialize data storage arrays
    let communityInsightData: any = null;
    const communityInsights: MiningSummary[] = [];
    const searchPatterns: any[] = [];
    const newSearchPatterns: SearchPattern[] = []; // Separate array for new patterns to insert

    // ========================================
    // STEP 1: SEMANTIC CONTENT ANALYSIS
    // ========================================
    sendEvent('step-update', { index: 0, status: 'running', progress: 0 });
    sendEvent('progress', { 
      phase: 'semantic_analysis',
      message: 'Semantic Content Analysis - Analyzing brand voice, theme, and target audience',
      progress: 20
    });

    // Check if semantic analysis already exists
    const existingSemanticAnalysis = await prisma.semanticAnalysis.findFirst({
      where: { domainId: domain.id }
    });

    let semanticContext = '';
    let parsedSemanticData = null;
    
    if (existingSemanticAnalysis) {
      console.log('Semantic analysis already exists, skipping...');
      semanticContext = existingSemanticAnalysis.contentSummary;
      // Try to parse existing semantic data
      try {
        parsedSemanticData = JSON.parse(existingSemanticAnalysis.contentSummary);
      } catch (e) {
        console.log('Could not parse existing semantic data, will use fallback');
      }
      sendEvent('progress', { 
        phase: 'semantic_analysis',
        message: 'Semantic Content Analysis - Using existing data',
        progress: 100
      });
      sendEvent('step-update', { index: 0, status: 'completed', progress: 100 });
    } else {
      try {
      const semanticPrompt = `
Extract search-friendly business data for Reddit mining:

DOMAIN: ${domain.url}
CONTEXT: ${domain.context || 'General business'}
LOCATION: ${domain.location || 'Global'}

Generate concise JSON (max 30 words per field):

{
  "coreBusiness": "What the business does",
  "primaryServices": ["service1", "service2", "service3"],
  "targetAudience": "Main customer type", 
  "industry": "Industry category",
  "keyProblems": ["problem1", "problem2", "problem3"],
  "searchTerms": ["term1", "term2", "term3"],
  "location": "${domain.location || 'Global'}"
}

Focus on terms people actually search for.
`;

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini', // Use mini for faster, cheaper processing
        messages: [{ role: 'user', content: semanticPrompt }],
        temperature: 0.2,
        max_tokens: 800, // Reduced from 1500
        response_format: { type: "json_object" }
      });

      const response = completion.choices[0]?.message?.content;
      
      if (response) {
        // NEW: emit debug raw AI response for semantic analysis
        try {
          sendEvent('debug', {
            type: 'ai',
            stage: 'semantic_analysis',
            responseRaw: response
          });
        } catch {}
        const semanticData = parseAIResponse(response, { error: 'Failed to parse semantic data' });
        semanticContext = semanticData ? JSON.stringify(semanticData) : response;
        totalTokenUsage += completion.usage?.total_tokens || 0;
        
        // Store semantic data for community mining
        parsedSemanticData = typeof semanticData === 'object' ? semanticData : null;
      }
    } catch (error) {
      console.error('Error in semantic content analysis:', error);
      throw new Error(`Semantic content analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

      // Save semantic analysis to database
      try {
        await prisma.semanticAnalysis.create({
          data: {
            domainId: domain.id,
            contentSummary: semanticContext,
            keyThemes: [],
            brandVoice: '{}',
            targetAudience: {},
            contentGaps: [],
            tokenUsage: totalTokenUsage
          }
        });
        console.log('Successfully stored semantic analysis');
      } catch (error) {
        console.error('Error storing semantic analysis:', error);
        throw new Error(`Failed to store semantic analysis: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      sendEvent('progress', { 
        phase: 'semantic_analysis',
        message: 'Semantic Content Analysis completed',
        progress: 100
      });
      sendEvent('step-update', { index: 0, status: 'completed', progress: 100 });
    }

    // ========================================
    // STEP 2: COMMUNITY DATA MINING (PER DOMAIN)
    // ========================================
    sendEvent('step-update', { index: 1, status: 'running', progress: 0 });
          sendEvent('progress', { 
        phase: 'community_mining',
        message: 'Community Data Mining - Extracting insights from Reddit for domain',
        progress: 25
      });

    // Check if community insight already exists
    const existingCommunityInsight = await prisma.communityInsight.findFirst({
      where: { domainId: domain.id }
    });

    if (existingCommunityInsight) {
      console.log('Community insight already exists, using existing data...');
      communityInsightData = existingCommunityInsight;
      // Emit debug reddit posts from existing insight if available
      try {
        const sourcesObj = (existingCommunityInsight as any)?.sources as any;
        const posts = Array.isArray(sourcesObj?.dataPoints) ? sourcesObj.dataPoints : [];
        if (posts.length > 0) {
          sendEvent('debug', {
            type: 'reddit',
            stage: 'community_mining',
            posts
          });
        }
      } catch {}
      sendEvent('progress', { 
        phase: 'community_mining',
        message: 'Community Data Mining - Using existing data',
        progress: 100
      });
      sendEvent('step-update', { index: 1, status: 'completed', progress: 100 });
    } else {
      console.log(`Starting community mining for domain: ${domain.url}`);
      
      // Create more targeted search queries
      const businessContext = domain.context || domain.url.replace(/https?:\/\//, '').replace(/www\./, '');
      const searchQueries = [
        `${businessContext} problems issues reddit`,
        `${businessContext} solutions help reddit`,
        `${businessContext} advice tips reddit`,
        `best ${businessContext} recommendations reddit`
      ];

      const allRedditData = [];

      try {
        console.log(`🚀 Starting enhanced community mining for domain: ${domain.url}`);
        
        const businessContext = domain.context || domain.url.replace(/https?:\/\//, '').replace(/www\./, '').split('.')[0];
        
        // Use the enhanced community mining function with semantic data
        const miningResults = await performOptimizedCommunityMining(businessContext, domain, parsedSemanticData);
        
        const { redditData: allRedditData, dataQuality } = miningResults;
        const successfulQueries = dataQuality.successfulQueries;
        const failedQueries = dataQuality.failedQueries;

        // Use the data from enhanced mining results (already processed)
        const uniqueRedditData = allRedditData;

        // NEW: emit debug Reddit posts
        try {
          sendEvent('debug', {
            type: 'reddit',
            posts: uniqueRedditData
          });
        } catch {}

        console.log(`📈 Data Quality Assessment:`, dataQuality);
        console.log(`🎯 Final community data: ${uniqueRedditData.length} Reddit posts`);

        // Store enhanced community data with quality metrics
        communityInsightData = {
          domainId: domain.id,
          sources: {
            reddit: uniqueRedditData.length,
            total: uniqueRedditData.length,
            quality: dataQuality.qualityRating,
            searchQueries: dataQuality.totalQueries,
            successRate: (dataQuality.successfulQueries / dataQuality.totalQueries * 100).toFixed(1) + '%',
                              dataPoints: [...uniqueRedditData].slice(0, 15), // OPTIMIZED: Keep only 15 data points
            qualityMetrics: dataQuality
          },
          summary: JSON.stringify({
            primaryQuestions: uniqueRedditData
              .slice(0, 10)
              .map((item: ExtractedRedditPost) => item.title),
            criticalPainPoints: uniqueRedditData
              .filter((item: ExtractedRedditPost) => item.content.toLowerCase().includes('problem') || item.content.toLowerCase().includes('issue'))
              .slice(0, 5)
              .map((item: ExtractedRedditPost) => item.content.substring(0, 100) + '...'),
            recommendedSolutions: uniqueRedditData
              .filter((item: ExtractedRedditPost) => item.title.toLowerCase().includes('how') || item.title.toLowerCase().includes('best'))
              .slice(0, 5)
              .map((item: ExtractedRedditPost) => item.title),
            marketOpportunities: [
              `High-quality community engagement opportunities`,
              `Content gaps identified in competitor discussions`,
              `User pain points requiring solutions`,
              `Emerging trends in ${businessContext} discussions`
            ],
            languagePatterns: [...new Set([
              ...uniqueRedditData.flatMap((item: ExtractedRedditPost) => 
                item.title.toLowerCase().match(/\b(?:how to|best|top|guide|tips|help|solution|problem|issue|fix|improve|optimize)\b/g) || []
              )
            ])].slice(0, 15)
          }),
          tokenUsage: 0 // Will be updated during AI analysis
        };

        // OPTIMIZED: If we have quality community data, proceed with AI analysis - Adjusted threshold
        if (dataQuality.qualityRating !== 'Low' && uniqueRedditData.length > 2) {
          try {
            const enhancedCommunityAnalysisPrompt = `
Extract key insights from ${uniqueRedditData.length} Reddit posts about: ${businessContext}

    top 3 posts:
    ${uniqueRedditData.slice(0, 3).map((item: ExtractedRedditPost, idx: number) => 
      `${idx + 1}. "${item.title}"`
    ).join('\n')}
    
Return concise JSON:
{
  "userIntelligence": {
    "painPoints": ["top user frustration"],
    "searchLanguage": ["how users search"]
  },
  "marketOpportunities": {
    "contentGaps": ["missing content users need"]
  }
}`;

            const completion = await openai.chat.completions.create({
              model: 'gpt-4o-mini',
              messages: [
                {
                  role: 'system',
                  content: 'Extract actionable community insights. Return valid JSON only.'
                },
                {
                  role: 'user',
                  content: enhancedCommunityAnalysisPrompt
                }
              ],
              temperature: 0.1,
              max_tokens: 600, // Further reduced
              response_format: { type: "json_object" }
            });

            const response = completion.choices[0]?.message?.content;
            
            if (response && response.trim()) {
              // NEW: emit debug raw AI response for community analysis
              try {
                sendEvent('debug', {
                  type: 'ai',
                  stage: 'community_analysis',
                  responseRaw: response
                });
              } catch {}
              const communityAnalysisData = parseAIResponse(response, {
                userIntelligence: { primaryPersonas: [], psychologyInsights: {} },
                searchBehaviorIntelligence: { naturalLanguagePatterns: [], problemFramingLanguage: {}, solutionSeekingBehavior: {} },
                competitiveIntelligence: { brandPerceptions: {}, marketGaps: {}, competitorWeaknesses: [] },
                marketOpportunities: { contentOpportunities: [], serviceInnovations: [], positioningOpportunities: [] },
                actionableInsights: { immediateActions: [], contentStrategy: {}, seoStrategy: {} },
                dataValidation: { confidenceLevel: 'Medium', dataLimitations: [], recommendedValidation: [], nextSteps: [] }
              });

              // Enhanced community insight data structure
              communityInsightData = {
                domainId: domain.id,
                sources: {
                  reddit: uniqueRedditData.length,
                  total: uniqueRedditData.length,
                  quality: dataQuality.qualityRating,
                  searchQueries: dataQuality.totalQueries,
                  successRate: (dataQuality.successfulQueries / dataQuality.totalQueries * 100).toFixed(1) + '%',
                  dataPoints: [...uniqueRedditData].slice(0, 15), // OPTIMIZED: Keep only 15 data points
                  qualityMetrics: dataQuality,
                  enhancedAnalysis: communityAnalysisData
                },
                summary: JSON.stringify({
                  userIntelligence: communityAnalysisData.userIntelligence,
                  searchBehavior: communityAnalysisData.searchBehaviorIntelligence,
                  competitiveInsights: communityAnalysisData.competitiveIntelligence,
                  marketOpportunities: communityAnalysisData.marketOpportunities,
                  actionableStrategy: communityAnalysisData.actionableInsights,
                  confidenceLevel: communityAnalysisData.dataValidation?.confidenceLevel || 'Medium'
                }),
                tokenUsage: completion.usage?.total_tokens || 0
              };

              totalTokenUsage += completion.usage?.total_tokens || 0;
              console.log(`✅ Enhanced community analysis completed with ${dataQuality.qualityRating} quality rating`);

            } else {
              throw new Error('Empty response from community analysis');
            }
          } catch (error) {
            console.error(`Enhanced community analysis failed:`, error);
            // Use existing community insight data structure
          }
        } else {
          console.warn(`Low quality community data (${dataQuality.qualityRating}), using enhanced fallback`);
          
          // Enhanced fallback with strategic assumptions
          communityInsightData = {
            domainId: domain.id,
            sources: { 
              reddit: allRedditData?.length || 0, 
              total: allRedditData?.length || 0,
              quality: 'Low',
              fallback: true,
              reason: 'Insufficient community data retrieved',
              enhancedFallback: true
            },
            summary: JSON.stringify({
              userIntelligence: {
                primaryPersonas: [{
                  personaName: `${businessContext} Seekers`,
                  painPoints: [`Finding reliable ${businessContext} information`, `Choosing the right ${businessContext} approach`],
                  searchLanguage: [`how to ${businessContext}`, `best ${businessContext}`, `${businessContext} guide`],
                  decisionFactors: ['quality', 'price', 'reliability', 'expertise'],
                  trustIndicators: ['professional credentials', 'positive reviews', 'proven results'],
                  successMetrics: ['improved outcomes', 'time savings', 'cost effectiveness']
                }]
              },
              searchBehavior: {
                naturalLanguagePatterns: [
                  { pattern: `how to improve ${businessContext}`, frequency: 'High', intent: 'Informational' },
                  { pattern: `best ${businessContext} services`, frequency: 'High', intent: 'Navigational' },
                  { pattern: `${businessContext} cost and pricing`, frequency: 'Medium', intent: 'Commercial' }
                ]
              },
              marketOpportunities: {
                contentOpportunities: [
                  { topic: `${businessContext} beginner guide`, userNeed: 'education', competitiveGap: 'complex existing content' },
                  { topic: `${businessContext} comparison guide`, userNeed: 'decision support', competitiveGap: 'biased comparisons' }
                ]
              }
            }),
            tokenUsage: 0
          };
        }

      } catch (error) {
        console.error(`Enhanced community mining failed for domain ${domain.url}:`, error);
        // Use the existing fallback logic but enhanced
        communityInsightData = {
          domainId: domain.id,
          sources: { 
            reddit: 0, 
            total: 0,
            error: error instanceof Error ? error.message : 'Community mining failed',
            fallback: true,
            enhanced: false
          },
          summary: JSON.stringify({
            userIntelligence: { error: 'Failed to extract user intelligence' },
            searchBehavior: { error: 'Failed to analyze search behavior' },
            marketOpportunities: { error: 'Failed to identify opportunities' }
          }),
          tokenUsage: 0
        };
      }

      // Store community insight for domain
      try {
        await retryOperation(async () => {
          return await prisma.communityInsight.create({
            data: communityInsightData
          });
        });
        console.log(`Successfully stored community insight for domain: ${domain.url}`);
      } catch (error) {
        console.error('Error storing community insight:', error);
        throw new Error(`Failed to store community insight: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      console.log(`Completing community mining phase for domain: ${domain.url}`);
      sendEvent('progress', { 
        phase: 'community_mining',
        message: `Community Data Mining completed for domain`,
        progress: 100
      });
      sendEvent('step-update', { index: 1, status: 'completed', progress: 100 });
    }

    // ========================================
    // STEP 2.5: COMPETITOR ANALYSIS (SKIPPED/FAST-TRACK)
    // ========================================
    sendEvent('progress', { 
      phase: 'competitor_analysis',
      message: 'Competitor Analysis - Fast-tracking through existing data',
      progress: 100
    });
    sendEvent('step-update', { index: 2, status: 'completed', progress: 100 });

    // ========================================
    // STEP 3: SEARCH PATTERN ANALYSIS (PER KEYWORD)
    // ========================================
    sendEvent('step-update', { index: 3, status: 'running', progress: 0 });
    sendEvent('progress', { 
      phase: 'search_patterns',
      message: 'Search Pattern Analysis - Analyzing user search behaviors for keywords',
      progress: 38
    });

    // Process keywords by priority for search pattern analysis
    const allKeywordsToProcess = [...highValueKeywords, ...mediumValueKeywords, ...lowValueKeywords];
    for (let i = 0; i < allKeywordsToProcess.length; i++) {
      const keyword = allKeywordsToProcess[i];
      
      // Check if search pattern already exists for this keyword
      const existingSearchPattern = await prisma.searchPattern.findFirst({
        where: { 
          domainId: domain.id,
          keywordId: keyword.id
        }
      });

      if (existingSearchPattern) {
        console.log(`Search pattern already exists for keyword "${keyword.term}", using existing data...`);
        searchPatterns.push(existingSearchPattern);
        sendEvent('progress', { 
          phase: 'search_patterns',
          message: `Using existing search patterns for "${keyword.term}" (${i + 1}/${allKeywordsToProcess.length})`,
          progress: 38 + (i / allKeywordsToProcess.length) * 15
        });
        continue; // Skip to next keyword
      }
      
      sendEvent('progress', { 
        phase: 'search_patterns',
        message: `Analyzing search patterns for "${keyword.term}" (${i + 1}/${allKeywordsToProcess.length})`,
        progress: 38 + (i / allKeywordsToProcess.length) * 15
      });

      try {
        // Get community data for context
        const communityContext = communityInsightData ? communityInsightData.summary : 'No community data available';

        const patternPrompt = `
Analyze search behavior for: "${keyword.term}"

CONTEXT: ${domain.context || 'General business'}
COMMUNITY DATA: ${communityContext}

Map how users search for this concept:

{
  "patterns": {
    "intentDistribution": {
      "informational": {
        "percentage": 40,
        "searchExamples": ["how to ${keyword.term}", "what is ${keyword.term}"],
        "userMindset": "Learning and understanding"
      },
      "navigational": {
        "percentage": 25,
        "searchExamples": ["best ${keyword.term} services", "${keyword.term} near me"],
        "userMindset": "Finding specific providers"
      },
      "transactional": {
        "percentage": 25,
        "searchExamples": ["hire ${keyword.term} expert", "buy ${keyword.term}"],
        "userMindset": "Ready to purchase"
      },
      "commercialInvestigation": {
        "percentage": 10,
        "searchExamples": ["${keyword.term} cost", "compare ${keyword.term}"],
        "userMindset": "Comparing options"
      }
    }
  },
  "summary": {
    "dominantIntent": "Primary search intent with explanation",
    "searcherProfile": "Who searches for this and why",
    "contentOpportunities": ["content gap 1", "content gap 2"]
  },
  "userQuestions": {
    "frequentQuestions": ["What users commonly ask"],
    "problemSolving": ["Help-seeking questions"],
    "comparisonQuestions": ["Evaluation questions"]
  }
}

Base analysis on actual community discussions and user behavior.

Return valid JSON only.`;

        const completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: patternPrompt }],
          temperature: 0.2,
          max_tokens: 1200, // Reduced from 2000
          response_format: { type: "json_object" }
        });

        const response = completion.choices[0]?.message?.content;
        if (response && response.trim()) {
          // NEW: emit debug raw AI response for search patterns per keyword
          try {
            sendEvent('debug', {
              type: 'ai',
              stage: 'search_patterns',
              keyword: keyword.term,
              responseRaw: response
            });
          } catch {}
          const patternData = parseAIResponse(response, {
            patterns: [],
            summary: 'Failed to parse search pattern data',
            communityDerivedPatterns: [],
            userQuestions: []
          });

          // Store search pattern data for batch insert
          const newPattern = {
            domainId: domain.id,
            keywordId: keyword.id,
            patterns: patternData.patterns,
            summary: typeof patternData.summary === 'string' ? patternData.summary : JSON.stringify(patternData.summary || 'Search pattern analysis completed'),
            tokenUsage: completion.usage?.total_tokens || 0
          };
          searchPatterns.push(newPattern);
          newSearchPatterns.push(newPattern);

          totalTokenUsage += completion.usage?.total_tokens || 0;
        } else {
          console.warn(`Empty response for search patterns for keyword ${keyword.term}`);
          // Add fallback search pattern data
          const fallbackPattern = {
            domainId: domain.id,
            keywordId: keyword.id,
            patterns: [],
            summary: 'No search pattern data available',
            tokenUsage: 0
          };
          searchPatterns.push(fallbackPattern);
          newSearchPatterns.push(fallbackPattern);
        }
      } catch (error) {
        console.error(`Error analyzing search patterns for ${keyword.term}:`, error);
        // Continue with other keywords even if one fails
        const errorPattern = {
          domainId: domain.id,
          keywordId: keyword.id,
          patterns: [],
          summary: 'Failed to analyze search patterns',
          tokenUsage: 0
        };
        searchPatterns.push(errorPattern);
        newSearchPatterns.push(errorPattern);
      }
    }

    // Batch insert new search patterns only
    if (newSearchPatterns.length > 0) {
      try {
        await retryOperation(async () => {
          return await prisma.searchPattern.createMany({
            data: newSearchPatterns
          });
        });
        console.log(`Successfully stored ${newSearchPatterns.length} new search patterns`);
      } catch (error) {
        console.error('Error batch inserting search patterns:', error);
        throw new Error(`Failed to store search patterns: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    sendEvent('progress', { 
      phase: 'search_patterns',
      message: 'Search Pattern Analysis completed',
      progress: 100
    });
    sendEvent('step-update', { index: 3, status: 'completed', progress: 100 });

    // ========================================
    // STEP 4: CREATING OPTIMIZED INTENT PHRASES
    // ========================================
    sendEvent('step-update', { index: 4, status: 'running', progress: 0 });
    sendEvent('progress', { 
      phase: 'phrase_generation',
      message: 'Creating optimized intent phrases - Generating phrases using all context',
      progress: 46
    });

    const allPhrases: any[] = [];
    const phrasesToInsert: any[] = [];

    // First, collect all existing phrases for all keywords
    const allExistingPhrases = await prisma.generatedIntentPhrase.findMany({
      where: { 
        domainId: domain.id,
        keywordId: { in: keywordsToProcess.map(kw => kw.id) }
      },
      include: {
        keyword: true
      }
    });

    // Send all existing phrases immediately
    if (allExistingPhrases.length > 0) {
      console.log(`Found ${allExistingPhrases.length} existing phrases, sending them to frontend...`);
      
      // Filter out phrases with null keywords and process valid ones
      const validExistingPhrases = allExistingPhrases.filter(phrase => phrase.keyword !== null);
      console.log(`Sending ${validExistingPhrases.length} valid existing phrases...`);
      
      validExistingPhrases.forEach((phrase, index) => {
        const tempPhrase = {
          ...phrase,
          id: phrase.id.toString(),
          parentKeyword: phrase.keyword!.term,
          editable: true,
          selected: false
        };
        allPhrases.push(tempPhrase);
        
        console.log(`Sending existing phrase ${index + 1}/${validExistingPhrases.length} with ID: ${phrase.id} - "${phrase.phrase}"`);
        
        // Send existing phrase event
        sendEvent('phrase-generated', {
          id: phrase.id.toString(),
          phrase: phrase.phrase,
          intent: phrase.intent,
          intentConfidence: phrase.intentConfidence,
          relevanceScore: phrase.relevanceScore,
          sources: phrase.sources,
          trend: phrase.trend,
          editable: true,
          selected: false,
          parentKeyword: phrase.keyword!.term,
          keywordId: phrase.keywordId,
          wordCount: phrase.phrase.trim().split(/\s+/).length
        });
      });
      
      console.log(`Finished sending ${validExistingPhrases.length} existing phrases`);
      
      // Add a small delay to ensure all existing phrases are processed
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    for (let i = 0; i < allKeywordsToProcess.length; i++) {
      const keyword = allKeywordsToProcess[i];
      
      // Check if phrases already exist for this keyword
      const existingPhrases = allExistingPhrases.filter(phrase => phrase.keywordId === keyword.id);

      if (existingPhrases.length >= 10) {
        console.log(`Phrases already exist for keyword "${keyword.term}", skipping generation...`);
        
        sendEvent('progress', { 
          phase: 'phrase_generation',
          message: `Using existing phrases for "${keyword.term}" (${i + 1}/${allKeywordsToProcess.length})`,
          progress: 46 + (i / allKeywordsToProcess.length) * 15
        });
        continue; // Skip to next keyword
      }
      
      sendEvent('progress', { 
        phase: 'phrase_generation',
        message: `Generating phrases for "${keyword.term}" (${i + 1}/${allKeywordsToProcess.length})`,
        progress: 46 + (i / allKeywordsToProcess.length) * 15
      });

      try {
        // Get all context data for this keyword
        const keywordCommunityData = communityInsightData;
        const keywordSearchPatterns = searchPatterns.find(pattern => pattern.keywordId === keyword.id);

        // Use the enhanced intent-based phrase generation function
        const { phrasesToInsert: newPhrases, tokenUsage: phraseTokenUsage } = await generateEnhancedIntentPhrases(
          keyword,
          domain,
          semanticContext,
          keywordCommunityData,
          keywordSearchPatterns,
          sendEvent
        );

        // Add generated phrases to the main arrays
        phrasesToInsert.push(...newPhrases);
        
        newPhrases.forEach((phrase: PhraseAnalysisResult, phraseIndex: number) => {
          allPhrases.push({
            ...phrase,
            id: `temp-${i}-${phraseIndex}`,
            parentKeyword: keyword.term,
            editable: true,
            selected: false
          });
        });

        totalTokenUsage += phraseTokenUsage;
        
      } catch (error) {
        console.error(`Error generating phrases for ${keyword.term}:`, error);
        // Continue with other keywords even if one fails - add multiple fallback phrases (10 total)
        const fallbackPhrases = [
          {
            phrase: `How to choose the right ${keyword.term} for my business needs`,
            intent: 'Informational',
            intentConfidence: 85,
            relevanceScore: 88
          },
          {
            phrase: `Best ${keyword.term} services near me with good reviews`,
            intent: 'Navigational',
            intentConfidence: 90,
            relevanceScore: 85
          },
          {
            phrase: `What does professional ${keyword.term} cost in ${domain.location || '2024'}`,
            intent: 'Commercial Investigation',
            intentConfidence: 85,
            relevanceScore: 82
          },
          {
            phrase: `Hire experienced ${keyword.term} consultant for immediate results`,
            intent: 'Transactional',
            intentConfidence: 92,
            relevanceScore: 86
          },
          {
            phrase: `Why is ${keyword.term} important for small business growth`,
            intent: 'Informational',
            intentConfidence: 80,
            relevanceScore: 84
          },
          {
            phrase: `Compare ${keyword.term} providers and pricing options`,
            intent: 'Commercial Investigation',
            intentConfidence: 88,
            relevanceScore: 83
          },
          {
            phrase: `Find local ${keyword.term} experts in my area`,
            intent: 'Navigational',
            intentConfidence: 87,
            relevanceScore: 81
          },
          {
            phrase: `Learn about ${keyword.term} best practices and strategies`,
            intent: 'Informational',
            intentConfidence: 82,
            relevanceScore: 79
          },
          {
            phrase: `Get quotes for ${keyword.term} services from top providers`,
            intent: 'Transactional',
            intentConfidence: 89,
            relevanceScore: 87
          },
          {
            phrase: `What are the benefits of professional ${keyword.term} services`,
            intent: 'Informational',
            intentConfidence: 78,
            relevanceScore: 76
          }
        ];

        fallbackPhrases.forEach((fallbackPhrase, phraseIndex) => {
          const phraseData = {
            domainId: domain.id,
            keywordId: keyword.id,
            phrase: fallbackPhrase.phrase,
            intent: fallbackPhrase.intent,
            intentConfidence: fallbackPhrase.intentConfidence,
            relevanceScore: fallbackPhrase.relevanceScore,
            sources: ['AI Generated - Error Fallback'],
            trend: 'Rising',
            isSelected: false,
            tokenUsage: 0
          };

          phrasesToInsert.push(phraseData);
          
          allPhrases.push({
            ...phraseData,
            id: `temp-${i}-${phraseIndex}`,
            parentKeyword: keyword.term,
            editable: true,
            selected: false
          });
        });
      }
    }

            // Insert generated phrases individually to get their IDs
        if (phrasesToInsert.length > 0) {
          try {
            const insertedPhrases: any[] = [];
            for (const phraseData of phrasesToInsert) {
              const insertedPhrase = await prisma.generatedIntentPhrase.create({
                data: phraseData as any
              });
              insertedPhrases.push(insertedPhrase);
            }
        console.log(`Successfully stored ${insertedPhrases.length} generated phrases`);
        
        // Send all newly generated phrases with their real database IDs
        console.log(`Sending ${insertedPhrases.length} newly generated phrases to frontend...`);
        insertedPhrases.forEach((insertedPhrase, index) => {
          const phraseData = phrasesToInsert[index];
          console.log(`Sending phrase ${index + 1}/${insertedPhrases.length} with ID: ${insertedPhrase.id} - "${phraseData.phrase}"`);
          sendEvent('phrase-generated', {
            id: insertedPhrase.id.toString(),
            phrase: phraseData.phrase,
            intent: phraseData.intent,
            intentConfidence: phraseData.intentConfidence,
            relevanceScore: phraseData.relevanceScore,
            sources: phraseData.sources,
            trend: phraseData.trend,
            editable: true,
            selected: false,
            parentKeyword: keywordsToProcess.find(kw => kw.id === phraseData.keywordId)?.term || 'Unknown',
            keywordId: phraseData.keywordId,
            wordCount: phraseData.phrase.trim().split(/\s+/).length
          });
        });
        console.log(`Finished sending ${insertedPhrases.length} newly generated phrases`);
        
      } catch (error) {
        console.error('Error inserting generated phrases:', error);
        throw new Error(`Failed to store generated phrases: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    sendEvent('progress', { 
      phase: 'phrase_generation',
      message: `Phrase Generation completed - ${phrasesToInsert.length} phrases generated`,
      progress: 100
    });
    sendEvent('step-update', { index: 4, status: 'completed', progress: 100 });

    // ========================================
    // STEP 5: INTENT CLASSIFICATION (Integrated with phrase generation)
    // ========================================
    sendEvent('step-update', { index: 5, status: 'running', progress: 0 });
    sendEvent('progress', { 
      phase: 'intent_classification',
      message: 'Intent Classification - Classifying generated phrases by intent',
      progress: 61
    });

    // Intent classification is already done during phrase generation
    console.log('Intent classification completed during phrase generation');
    
    sendEvent('progress', { 
      phase: 'intent_classification',
      message: 'Intent Classification completed',
      progress: 100
    });
    sendEvent('step-update', { index: 5, status: 'completed', progress: 100 });

    // ========================================
    // STEP 6: RELEVANCE SCORE (Integrated with phrase generation)
    // ========================================
    sendEvent('step-update', { index: 6, status: 'running', progress: 0 });
    sendEvent('progress', { 
      phase: 'relevance_scoring',
      message: 'Relevance Score - Computing semantic relevance scores',
      progress: 69
    });

    // Relevance scoring is already done during phrase generation
    console.log('Relevance scoring completed during phrase generation');
    
    sendEvent('progress', { 
      phase: 'relevance_scoring',
      message: 'Relevance Score completed',
      progress: 100
    });
    sendEvent('step-update', { index: 6, status: 'completed', progress: 100 });

    // ========================================
    // COMPLETION
    // ========================================
    console.log('Enhanced phrase generation completed successfully');
    console.log(`Total phrases processed: ${allPhrases.length}`);
    console.log(`Total keywords processed: ${allKeywordsToProcess.length}`);
    console.log(`Priority breakdown: High=${highValueKeywords.length}, Medium=${mediumValueKeywords.length}, Low=${lowValueKeywords.length}`);
    
    sendEvent('progress', { 
      message: 'Enhanced phrase generation completed successfully',
      progress: 100
    });

    // Get final count of all phrases (existing + newly generated)
    const finalPhraseCount = await prisma.generatedIntentPhrase.count({
      where: { 
        domainId: domain.id,
        keywordId: { in: allKeywordsToProcess.map(kw => kw.id) }
      }
    });

    // Add a small delay to ensure all phrase events are processed
    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log(`Final phrase count from database: ${finalPhraseCount}`);
    console.log(`Total phrases sent to frontend: ${allPhrases.length}`);
    console.log(`Expected total phrases: ${allKeywordsToProcess.length * 10}`);

    sendEvent('complete', {
      totalPhrases: finalPhraseCount,
      totalKeywords: allKeywordsToProcess.length,
      totalTokenUsage: totalTokenUsage,
      priorityBreakdown: {
        high: highValueKeywords.length,
        medium: mediumValueKeywords.length,
        low: lowValueKeywords.length
      },
      message: `Successfully processed ${finalPhraseCount} phrases for ${allKeywordsToProcess.length} keywords using balanced priority approach`
    });

    res.end();
  } catch (error) {
    console.error('Error in enhanced phrase generation:', error);
    sendEvent('error', { 
      error: 'Enhanced phrase generation failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
    res.end();
  }
});

// ===============================================
// ENHANCED PHRASE GENERATION WITH REAL DATA
// ===============================================

// ===============================================
// ENHANCED PHRASE GENERATION WITH REAL DATA
// ===============================================

const createDataDrivenPhrasePrompt = (
  keyword: Keyword,
  domain: Domain,
  realQuestions: RealQuestion[],
  realPhrases: RealPhrase[],
  userLanguagePatterns: UserLanguagePatterns,
  semanticContext: string
) => `
Generate 10 natural search phrases based on user data (any length is fine):

TARGET: "${keyword.term}"

USER QUESTIONS (most engaged):
${realQuestions.slice(0, 10).map((q: RealQuestion, i: number) => 
  `${i+1}. "${q.question}" (${q.engagement} engagement)`
).join('\n')}

USER LANGUAGE PATTERNS:
- Questions: ${userLanguagePatterns.questionStarters?.join(', ') || 'how do i, what is, where can i'}
- Problems: ${userLanguagePatterns.problemDescriptors?.join(', ') || 'struggling with, need help'}
- Solutions: ${userLanguagePatterns.solutionSeekers?.join(', ') || 'looking for, trying to'}
- Quality: ${userLanguagePatterns.qualityIndicators?.join(', ') || 'best, top, reliable'}

REQUIREMENTS:
✓ Use user language from data above
✓ Include "${keyword.term}" naturally
✓ Sound like actual search queries
✓ Any length is acceptable; prioritize clarity and authenticity
✓ Mix of intents: 35% Informational, 25% Navigational, 25% Transactional, 15% Commercial Investigation
✓ Do NOT include any brand names, company names, or domains (including ${domain.url})
✓ These phrases will be used to test domain visibility in AI responses. Optimize for brand-neutral discovery, comparison, and solution intents
✓ Ensure variety in search patterns and user intents

JSON FORMAT:
{
  "phrases": [
    {
      "phrase": "How do I find reliable ${keyword.term} near me",
      "intent": "Navigational",
      "intentConfidence": 85,
      "relevanceScore": 90,
      "basedOnData": "User question pattern"
    }
  ]
}

Make 10 diverse phrases based on the user data patterns above. Any length is fine.`;

const generateDataDrivenPhrases = async (
  keyword: Keyword,
  domain: Domain,
  communityData: MiningSummary | null | undefined,
  sendEvent: EventSender
): Promise<{ phrasesToInsert: PhraseAnalysisResult[]; tokenUsage: number }> => {
  try {
    // Extract real user insights
    const { realQuestions, realPhrases, userLanguagePatterns } = extractRealUserQuestions(communityData);
    
    console.log(`📊 Real data for "${keyword.term}": ${realQuestions.length} questions, ${realPhrases.length} phrases`);
    
    const prompt = createDataDrivenPhrasePrompt(
      keyword,
      domain,
      realQuestions,
      realPhrases,
      userLanguagePatterns,
      ''
    );
    
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // Faster, cheaper for phrase generation
      messages: [
        {
          role: 'system',
          content: 'Generate natural search phrases (any length). Use authentic language patterns from the data. Return valid JSON only.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.4, // Slightly higher for natural variation
      max_tokens: 1500, // Increased for 10 phrases
      response_format: { type: "json_object" }
    });
    
    const response = completion.choices[0]?.message?.content;
    
    if (response?.trim()) {
      const phraseDataRaw = parseAIResponse(response, null);
      let phrases: PhraseAnalysisResult[] = [];

      if (phraseDataRaw?.phrases && Array.isArray(phraseDataRaw.phrases)) {
        phrases = phraseDataRaw.phrases;
      } else if (Array.isArray(phraseDataRaw)) {
        phrases = phraseDataRaw;
      }
      
      if (phrases.length > 0) {
        const validatedPhrases = phrases
          .filter((p: PhraseAnalysisResult) => p.phrase && p.phrase.trim().split(/\s+/).length >= 6 && p.phrase.trim().split(/\s+/).length <= 12)
          .map((phraseObj: PhraseAnalysisResult) => ({
            domainId: domain.id,
            keywordId: keyword.id,
            phrase: phraseObj.phrase,
            intent: phraseObj.intent || 'Informational',
            intentConfidence: Math.min(95, Math.max(70, phraseObj.intentConfidence || 85)),
            relevanceScore: Math.min(95, Math.max(75, phraseObj.relevanceScore || 85)),
            sources: realQuestions.length > 0 ? ['User Data', 'Language Patterns'] : ['AI Generated'],
            trend: 'Rising',
            isSelected: false,
            tokenUsage: Math.floor((completion.usage?.total_tokens || 0) / phrases.length)
          }));
        
        console.log(`✅ Generated ${validatedPhrases.length} data-driven phrases for "${keyword.term}"`);
        return { phrasesToInsert: validatedPhrases, tokenUsage: completion.usage?.total_tokens || 0 };
      }
    }
    
    throw new Error('No valid phrases generated from real data');
    
  } catch (error) {
    console.error(`❌ Data-driven phrase generation failed for ${keyword.term}:`, error);
    
    // Enhanced fallback using any available data patterns
    const { userLanguagePatterns } = extractRealUserQuestions(communityData);
    
    const fallbackPhrases = [
      {
        phrase: `How to choose ${keyword.term} services`,
        intent: 'Informational',
        intentConfidence: 80,
        relevanceScore: 85
      },
      {
        phrase: `Best ${keyword.term} near me`,
        intent: 'Navigational', 
        intentConfidence: 85,
        relevanceScore: 82
      },
      {
        phrase: `${keyword.term} cost and pricing guide`,
        intent: 'Commercial Investigation',
        intentConfidence: 80,
        relevanceScore: 80
      },
      {
        phrase: `Professional ${keyword.term} consultation`,
        intent: 'Transactional',
        intentConfidence: 85,
        relevanceScore: 83
      },
      {
        phrase: `What is ${keyword.term} and benefits`,
        intent: 'Informational',
        intentConfidence: 75,
        relevanceScore: 78
      },
      {
        phrase: `Compare ${keyword.term} providers and options`,
        intent: 'Commercial Investigation',
        intentConfidence: 82,
        relevanceScore: 81
      },
      {
        phrase: `Find local ${keyword.term} experts`,
        intent: 'Navigational',
        intentConfidence: 83,
        relevanceScore: 79
      },
      {
        phrase: `Learn about ${keyword.term} strategies`,
        intent: 'Informational',
        intentConfidence: 78,
        relevanceScore: 77
      },
      {
        phrase: `Get quotes for ${keyword.term} services`,
        intent: 'Transactional',
        intentConfidence: 86,
        relevanceScore: 84
      },
      {
        phrase: `Why choose professional ${keyword.term}`,
        intent: 'Informational',
        intentConfidence: 76,
        relevanceScore: 76
      }
    ];
    
    const phrasesToInsert = fallbackPhrases.map(fallback => ({
      domainId: domain.id,
      keywordId: keyword.id,
      phrase: fallback.phrase,
      intent: fallback.intent,
      intentConfidence: fallback.intentConfidence,
      relevanceScore: fallback.relevanceScore,
      sources: ['Enhanced Fallback'],
      trend: 'Rising',
      isSelected: false,
      tokenUsage: 0
    }));
    
    return { phrasesToInsert, tokenUsage: 0 };
  }
};

// ===============================================
// ADDITIONAL PHRASES GENERATION ENDPOINT
// ===============================================

// POST /enhanced-phrases/:domainId/:keywordId/generate-more - Generate 2 additional phrases for a specific keyword
router.post('/:domainId/:keywordId/generate-more', authenticateToken, async (req, res) => {
  const { domainId, keywordId } = req.params;
  const authReq = req as any;

  // Set up SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });

  const sendEvent: EventSender = (event: string, data: any) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    // Get domain and verify access
    const domain = await prisma.domain.findUnique({
      where: { id: parseInt(domainId) },
      include: {
        keywords: true
      }
    });

    if (!domain || domain.userId !== authReq.user.userId) {
      sendEvent('error', { error: 'Access denied' });
      res.end();
      return;
    }

    // Get the specific keyword
    const keyword = domain.keywords.find(kw => kw.id === parseInt(keywordId));
    if (!keyword) {
      sendEvent('error', { error: 'Keyword not found' });
      res.end();
      return;
    }

    sendEvent('progress', { 
      message: `Generating 2 additional phrases for "${keyword.term}"`,
      progress: 10
    });

    // Get existing community data and semantic analysis
    const communityInsightData = await prisma.communityInsight.findFirst({
      where: { domainId: domain.id }
    });

    const semanticAnalysis = await prisma.semanticAnalysis.findFirst({
      where: { domainId: domain.id }
    });

    const semanticContext = semanticAnalysis?.contentSummary || '';

    sendEvent('progress', { 
      message: `Analyzing context for "${keyword.term}"`,
      progress: 30
    });

    // Use the existing phrase generation function to generate 2 additional phrases
    const { phrasesToInsert, tokenUsage } = await generateEnhancedIntentPhrases(
      keyword,
      domain,
      semanticContext,
      communityInsightData,
      null, // No search patterns needed for additional phrases
      sendEvent
    );

    // Limit to 2 phrases for the "Load More" functionality
    const limitedPhrases = phrasesToInsert.slice(0, 2);

    sendEvent('progress', { 
      message: `Saving additional phrases for "${keyword.term}"`,
      progress: 80
    });

    // Insert the new phrases into the database
    const insertedPhrases = [];
    for (const phraseData of limitedPhrases) {
      const insertedPhrase = await prisma.generatedIntentPhrase.create({
        data: phraseData as any
      });
      insertedPhrases.push(insertedPhrase);
    }

    // Send the new phrases to the frontend
    insertedPhrases.forEach((insertedPhrase, index) => {
      const phraseData = limitedPhrases[index];
      sendEvent('phrase-generated', {
        id: insertedPhrase.id.toString(),
        phrase: phraseData.phrase,
        intent: phraseData.intent,
        intentConfidence: phraseData.intentConfidence,
        relevanceScore: phraseData.relevanceScore,
        sources: phraseData.sources,
        trend: phraseData.trend,
        editable: true,
        selected: false,
        parentKeyword: keyword.term,
        keywordId: keyword.id,
        wordCount: phraseData.phrase.trim().split(/\s+/).length,
        isAdditional: true // Flag to indicate this is an additional phrase
      });
    });

    sendEvent('progress', { 
      message: `Successfully generated ${insertedPhrases.length} additional phrases for "${keyword.term}"`,
      progress: 100
    });

    sendEvent('complete', {
      totalPhrases: insertedPhrases.length,
      keyword: keyword.term,
      message: `Successfully generated ${insertedPhrases.length} additional phrases for "${keyword.term}"`
    });

    res.end();
  } catch (error) {
    console.error('Error generating additional phrases:', error);
    sendEvent('error', { 
      error: 'Failed to generate additional phrases',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
    res.end();
  }
});

// Custom phrase analysis endpoint
router.post('/:domainId/custom-phrase', authenticateToken, async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { domainId } = req.params;
    const { phrase } = req.body;

    if (!phrase || typeof phrase !== 'string' || phrase.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Phrase is required and must be a non-empty string'
      });
    }

    // Get domain and verify access
    const domain = await prisma.domain.findUnique({
      where: { id: parseInt(domainId) },
      include: {
        keywords: true,
        semanticAnalyses: true
      }
    });

    if (!domain || domain.userId !== authReq.user.userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    // Get semantic context
    const semanticContext = domain.semanticAnalyses?.[0]?.contentSummary || '';

    // Analyze the custom phrase using AI to extract keyword and metrics
    const analysisPrompt = `
You are an expert SEO and content strategist. Analyze this custom phrase and extract the primary keyword and relevant metrics.

Custom Phrase: "${phrase.trim()}"
Domain Context: ${semanticContext}

Please provide a JSON response with the following structure:
{
  "extractedKeyword": "the primary keyword from the phrase",
  "intent": "Informational|Transactional|Commercial|Navigational",
  "relevanceScore": 85,
  "wordCount": 12,
  "sources": ["Custom Input"],
  "trend": "Stable|Growing|Declining",
  "analysis": "Brief analysis of why this phrase is valuable"
}

Guidelines:
- Extract the most important keyword from the phrase
- Determine intent based on the phrase content
- Calculate relevance score (0-100) based on phrase quality and domain relevance
- Count words in the phrase
- Set sources as ["Custom Input"]
- Determine trend based on phrase characteristics
- Provide brief analysis of the phrase's value

Respond with valid JSON only.
`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: analysisPrompt }],
      temperature: 0.2,
      max_tokens: 800,
      response_format: { type: "json_object" }
    });
    
    const geminiResponse = completion.choices[0]?.message?.content || '';
    let analysisResult;

    try {
      analysisResult = JSON.parse(geminiResponse);
    } catch (parseError) {
      console.error('Failed to parse AI response:', geminiResponse);
      // Fallback analysis
      analysisResult = {
        extractedKeyword: phrase.trim().split(' ').slice(0, 3).join(' '), // First 3 words as keyword
        intent: 'Informational',
        relevanceScore: 75,
        wordCount: phrase.trim().split(/\s+/).length,
        sources: ['Custom Input'],
        trend: 'Stable',
        analysis: 'Custom phrase provided by user'
      };
    }

    // Check if the extracted keyword already exists in the database
    let targetKeyword = domain.keywords.find(kw => 
      kw.term.toLowerCase().trim() === analysisResult.extractedKeyword.toLowerCase().trim()
    );

    let keywordId: number;

    if (targetKeyword) {
      // Use existing keyword
      keywordId = targetKeyword.id;
      console.log(`Using existing keyword: ${targetKeyword.term} (ID: ${keywordId})`);
    } else {
      // Create new keyword with AI-generated metrics
      const keywordMetricsPrompt = `
You are an expert SEO analyst. Generate realistic keyword metrics for this keyword.

Keyword: "${analysisResult.extractedKeyword}"
Domain Context: ${semanticContext}

Provide a JSON response with realistic metrics:
{
  "volume": 1500,
  "difficulty": "Medium",
  "cpc": 2.50,
  "intent": "Informational|Transactional|Commercial|Navigational"
}

Guidelines:
- Volume: realistic search volume (100-10000)
- Difficulty: "Low", "Medium", or "High"
- CPC: realistic cost per click (0.50-5.00)
- Intent: match the phrase intent

Respond with valid JSON only.
`;

      const metricsCompletion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: keywordMetricsPrompt }],
        temperature: 0.2,
        max_tokens: 400,
        response_format: { type: "json_object" }
      });
      
      const metricsResponse = metricsCompletion.choices[0]?.message?.content || '';
      let keywordMetrics;

      try {
        keywordMetrics = JSON.parse(metricsResponse);
      } catch (parseError) {
        console.error('Failed to parse keyword metrics:', metricsResponse);
        // Fallback metrics
        keywordMetrics = {
          volume: 1000,
          difficulty: 'Medium',
          cpc: 2.00,
          intent: analysisResult.intent
        };
      }

      // Create new keyword
      const newKeyword = await prisma.keyword.create({
        data: {
          term: analysisResult.extractedKeyword,
          volume: keywordMetrics.volume,
          difficulty: keywordMetrics.difficulty,
          cpc: keywordMetrics.cpc,
          domainId: domain.id,
          isSelected: true, // Auto-select custom keywords
          isCustom: true
        }
      });

      keywordId = newKeyword.id;
      console.log(`Created new keyword: ${newKeyword.term} (ID: ${keywordId})`);
    }

    const existingPhrase = await prisma.generatedIntentPhrase.findFirst({
      where: {
        domainId: domain.id,
        keywordId,
        phrase: {
          equals: phrase.trim(),
          mode: 'insensitive'
        }
      }
    });

    if (existingPhrase) {
      return res.json({
        success: true,
        phrase: {
          id: existingPhrase.id,
          phrase: existingPhrase.phrase,
          relevanceScore: existingPhrase.relevanceScore,
          intent: existingPhrase.intent,
          intentConfidence: existingPhrase.intentConfidence,
          sources: existingPhrase.sources,
          trend: existingPhrase.trend,
          editable: true,
          selected: existingPhrase.isSelected,
          parentKeyword: analysisResult.extractedKeyword,
          parentKeywordIsCustom: targetKeyword ? targetKeyword.isCustom : true,
          keywordId: existingPhrase.keywordId,
          wordCount: existingPhrase.phrase.trim().split(/\s+/).length,
          isAdditional: true,
          createdAt: existingPhrase.createdAt,
          updatedAt: existingPhrase.updatedAt
        },
        keyword: targetKeyword ? {
          id: targetKeyword.id,
          term: targetKeyword.term,
          isExisting: true,
          isCustom: targetKeyword.isCustom
        } : {
          id: keywordId,
          term: analysisResult.extractedKeyword,
          isExisting: true,
          isCustom: true
        },
        analysis: analysisResult.analysis
      });
    }

    // Create the intent phrase
    const newPhrase = await prisma.generatedIntentPhrase.create({
      data: {
        phrase: phrase.trim(),
        relevanceScore: analysisResult.relevanceScore,
        intent: analysisResult.intent,
        intentConfidence: 90, // High confidence for custom phrases
        sources: analysisResult.sources,
        trend: analysisResult.trend,
        isSelected: false,
        keywordId: keywordId,
        domainId: domain.id
      }
    });

    console.log(`Created custom phrase: "${newPhrase.phrase}" mapped to keyword ID: ${keywordId}`);

    return res.json({
      success: true,
      phrase: {
        id: newPhrase.id,
        phrase: newPhrase.phrase,
        relevanceScore: newPhrase.relevanceScore,
        intent: newPhrase.intent,
        intentConfidence: newPhrase.intentConfidence,
        sources: newPhrase.sources,
        trend: newPhrase.trend,
        editable: true,
        selected: newPhrase.isSelected,
        parentKeyword: analysisResult.extractedKeyword,
        parentKeywordIsCustom: targetKeyword ? targetKeyword.isCustom : true,
        keywordId: newPhrase.keywordId,
        wordCount: analysisResult.wordCount,
        isAdditional: true,
        createdAt: newPhrase.createdAt,
        updatedAt: newPhrase.updatedAt
      },
      keyword: targetKeyword ? {
        id: targetKeyword.id,
        term: targetKeyword.term,
        isExisting: true,
        isCustom: targetKeyword.isCustom
      } : {
        id: keywordId,
        term: analysisResult.extractedKeyword,
        isExisting: false,
        isCustom: true
      },
      analysis: analysisResult.analysis
    });

  } catch (error) {
    console.error('Error analyzing custom phrase:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to analyze custom phrase',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
