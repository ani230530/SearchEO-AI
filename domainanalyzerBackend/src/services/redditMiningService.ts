import axios from 'axios';
import { PrismaClient } from '../../generated/prisma';

const prisma = new PrismaClient();

// ── Types ────────────────────────────────────────────────────────────────────

export interface RedditPost {
  title: string;
  selftext: string;
  subreddit: string;
  score: number;
  num_comments: number;
  url: string;
  permalink: string;
  created_utc: number;
  author: string;
}

export interface MinedRedditData {
  posts: RedditPost[];
  questionPatterns: string[];    // extracted question templates
  subreddit: string;
  totalFound: number;
}

// ── PullPush API (free, real Reddit data) ────────────────────────────────────

const PULLPUSH_BASE = 'https://api.pullpush.io/reddit/search/submission/';
const PULLPUSH_DELAY_MS = 4500; // ~15 req/min soft limit → 1 every 4s

/**
 * Search Reddit posts via PullPush API.
 * Returns actual posts with real scores, comment counts, and full titles.
 */
async function searchPullPush(params: {
  query: string;
  subreddit?: string;
  minScore?: number;
  size?: number;
  sort?: 'score' | 'created_utc';
}): Promise<RedditPost[]> {
  try {
    const searchParams: Record<string, string> = {
      q: params.query,
      size: String(params.size || 50),
      sort: params.sort || 'score',
      sort_type: 'desc',
    };
    if (params.subreddit) {
      searchParams.subreddit = params.subreddit.replace(/^r\//, '');
    }
    if (params.minScore && params.minScore > 0) {
      searchParams.score = `>${params.minScore}`;
    }

    const response = await axios.get(PULLPUSH_BASE, {
      params: searchParams,
      timeout: 15000,
    });

    const posts: RedditPost[] = (response.data?.data || []).map((p: any) => ({
      title: p.title || '',
      selftext: p.selftext || '',
      subreddit: p.subreddit || '',
      score: p.score || 0,
      num_comments: p.num_comments || 0,
      url: p.url || '',
      permalink: p.permalink ? `https://reddit.com${p.permalink}` : '',
      created_utc: p.created_utc || 0,
      author: p.author || '',
    }));

    return posts;
  } catch (err: any) {
    console.warn(`[RedditMining] PullPush search failed for "${params.query}":`, err.message);
    return [];
  }
}

// ── Recommendation-seeking query templates ───────────────────────────────────

const RECOMMENDATION_QUERIES = [
  'recommend',
  'looking for',
  'what do you use',
  'suggestion',
  'best tool',
  'anyone tried',
  'alternative to',
  'need help choosing',
  'which one should I',
  'vs',
];

// ── Public API ───────────────────────────────────────────────────────────────

export const redditMiningService = {
  /**
   * Mine Reddit posts from target subreddits for a given keyword/niche.
   * Uses PullPush (free) for real Reddit data with actual engagement metrics.
   */
  mineSubreddit: async (params: {
    keyword: string;
    subreddit: string;
    minScore?: number;
  }): Promise<MinedRedditData> => {
    const { keyword, subreddit, minScore = 3 } = params;
    const allPosts: RedditPost[] = [];
    const seen = new Set<string>();

    // Search with keyword + recommendation-seeking queries
    const queries = [
      keyword,
      ...RECOMMENDATION_QUERIES.slice(0, 4).map(q => `${keyword} ${q}`),
    ];

    for (const query of queries) {
      const posts = await searchPullPush({
        query,
        subreddit,
        minScore,
        size: 25,
      });

      for (const post of posts) {
        const key = post.permalink || post.title;
        if (!seen.has(key)) {
          seen.add(key);
          allPosts.push(post);
        }
      }

      // Respect rate limit
      await new Promise(r => setTimeout(r, PULLPUSH_DELAY_MS));
    }

    // Sort by score (highest engagement first)
    allPosts.sort((a, b) => b.score - a.score);

    // Extract question patterns from titles
    const questionPatterns = extractQuestionPatterns(allPosts.map(p => p.title));

    return {
      posts: allPosts.slice(0, 100), // Cap at 100 per subreddit
      questionPatterns,
      subreddit,
      totalFound: allPosts.length,
    };
  },

  /**
   * Mine multiple subreddits for a niche and store patterns in DB.
   */
  mineNiche: async (params: {
    niche: string;
    subreddits: string[];
    keywords: string[];
  }): Promise<{ postsFound: number; patternsExtracted: number }> => {
    const { niche, subreddits, keywords } = params;
    let totalPosts = 0;
    let totalPatterns = 0;

    for (const subreddit of subreddits.slice(0, 5)) {
      for (const keyword of keywords.slice(0, 3)) {
        try {
          const data = await redditMiningService.mineSubreddit({
            keyword,
            subreddit,
            minScore: 3,
          });

          totalPosts += data.posts.length;

          // Store each high-quality post as a RedditPattern
          for (const post of data.posts.slice(0, 20)) {
            const patternType = classifyPostType(post.title);
            try {
              await prisma.redditPattern.create({
                data: {
                  subreddit: `r/${post.subreddit}`,
                  postTitle: post.title,
                  postUrl: post.permalink || null,
                  postScore: post.score,
                  commentCount: post.num_comments,
                  patternType,
                  extractedPattern: extractStructuralPattern(post.title),
                  niche,
                  keywords: [keyword],
                },
              });
              totalPatterns++;
            } catch {
              // Ignore duplicates
            }
          }
        } catch (err) {
          console.warn(`[RedditMining] Failed to mine r/${subreddit} for "${keyword}":`, err);
        }
      }
    }

    return { postsFound: totalPosts, patternsExtracted: totalPatterns };
  },

  /**
   * Get stored Reddit patterns for a niche.
   */
  getPatternsForNiche: async (niche: string): Promise<any[]> => {
    return prisma.redditPattern.findMany({
      where: { niche: { equals: niche, mode: 'insensitive' } },
      orderBy: { postScore: 'desc' },
      take: 100,
    });
  },
};

// ── Pattern extraction helpers ───────────────────────────────────────────────

/**
 * Classify a Reddit post title by intent type.
 */
function classifyPostType(title: string): string {
  const lower = title.toLowerCase();
  if (lower.match(/\brecommend|looking for|suggestion|anyone use|what do you use|need help|which.*should/))
    return 'recommendation';
  if (lower.match(/\bvs\b|compared?\b|versus|or\b.*better|alternative/))
    return 'comparison';
  if (lower.match(/\bproblem|issue|error|broken|not working|help|stuck|struggling/))
    return 'troubleshooting';
  if (lower.match(/\bcomplain|worst|terrible|disappointed|frustrat/))
    return 'complaint';
  if (lower.match(/\bwhat is|how does|explain|understand|learn/))
    return 'discovery';
  return 'general';
}

/**
 * Extract the structural pattern (template) from a Reddit post title.
 * e.g. "What CRM do you use for a small team?" → "What {category} do you use for {constraint}?"
 */
function extractStructuralPattern(title: string): string {
  let pattern = title;

  // Replace specific numbers with {number}
  pattern = pattern.replace(/\b\d+[-\s]?(?:person|people|employee|member|user)s?\b/gi, '{team_size}');
  pattern = pattern.replace(/\$[\d,.]+(?:\/mo(?:nth)?|\/yr|\/year)?/gi, '{budget}');
  pattern = pattern.replace(/\b\d{4}\b/g, '{year}');

  return pattern;
}

/**
 * Extract common question patterns from a set of Reddit post titles.
 */
function extractQuestionPatterns(titles: string[]): string[] {
  const patterns: string[] = [];
  const seen = new Set<string>();

  for (const title of titles) {
    const lower = title.toLowerCase().trim();

    // Extract question-format patterns
    const questionMatch = lower.match(
      /^(what(?:'s| is| are)?|how (?:do|does|can|should|would)|which|where|why|is (?:there|it)|can (?:you|anyone)|does anyone|has anyone|anyone (?:know|use|recommend))/i
    );

    if (questionMatch) {
      const prefix = questionMatch[1];
      if (!seen.has(prefix)) {
        seen.add(prefix);
        patterns.push(title);
      }
    }

    // Extract "I need/looking for" statement patterns
    const statementMatch = lower.match(
      /^(i(?:'m| am) looking for|i need|looking for|need (?:help|a|an)|trying to find)/i
    );

    if (statementMatch && !seen.has(title.slice(0, 30))) {
      seen.add(title.slice(0, 30));
      patterns.push(title);
    }
  }

  return patterns.slice(0, 30);
}
