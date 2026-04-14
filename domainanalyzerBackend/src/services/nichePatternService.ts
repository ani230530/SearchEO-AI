import OpenAI from 'openai';
import { PrismaClient } from '../../generated/prisma';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const prisma = new PrismaClient();

// ── Retrieval frames (from Visiblie research) ────────────────────────────────

export const RETRIEVAL_FRAMES = [
  'category_formation',     // "What is [category]?"
  'attribute_recall',       // "Which tools do [capability]?"
  'procedural',            // "How do I [task]?"
  'evaluation',            // "Is [method A] better than [method B]?"
  'provider_comparison',   // "Best [category] tools for [constraint]"
  'trust',                 // "Is [brand] safe/reliable for [use case]?"
  'roi',                   // "Is [brand] worth it for [situation]?"
] as const;

export type RetrievalFrame = typeof RETRIEVAL_FRAMES[number];

export const BUYER_STAGES = ['awareness', 'consideration', 'decision'] as const;
export type BuyerStage = typeof BUYER_STAGES[number];

// ── Types ────────────────────────────────────────────────────────────────────

export interface PromptPattern {
  template: string;
  retrievalFrame: RetrievalFrame;
  buyerStage: BuyerStage;
  source: string;
  realExample?: string;
  variables?: Record<string, { type: string; examples: string[] }>;
  humannessScore: number;
}

// ── Humanness scoring ────────────────────────────────────────────────────────

function scoreHumanness(text: string): number {
  let score = 0;
  const lower = text.toLowerCase();
  const wordCount = text.split(/\s+/).length;

  // Personal pronouns (52% of real prompts use them)
  if (lower.match(/\b(i|my|me|we|our|i'm|i've|we're)\b/)) score += 0.3;

  // Problem-first framing (21% of real prompts)
  if (lower.match(/\b(need|looking for|struggling|trying to|help with|problem)\b/)) score += 0.2;

  // Specific constraints (budget, team size, industry)
  if (lower.match(/\b(\d+[-\s]person|\$\d|small team|startup|enterprise|budget|integration)\b/)) score += 0.2;

  // Conversational tone
  if (lower.match(/\b(anyone|you guys|thoughts on|has anyone|honestly|actually)\b/)) score += 0.15;

  // Right length range (12-20 words is most human)
  if (wordCount >= 10 && wordCount <= 25) score += 0.15;
  else if (wordCount >= 6 && wordCount < 10) score += 0.05;

  return Math.min(1, score);
}

// ── Public API ───────────────────────────────────────────────────────────────

export const nichePatternService = {
  /**
   * Extract prompt patterns from Reddit posts using LLM.
   * Takes raw Reddit post titles and converts them into reusable templates.
   */
  extractPatternsFromReddit: async (params: {
    niche: string;
    redditPosts: Array<{ title: string; subreddit: string; score: number; url?: string }>;
  }): Promise<PromptPattern[]> => {
    const { niche, redditPosts } = params;

    if (redditPosts.length === 0) return [];

    // Take top posts by score
    const topPosts = redditPosts
      .sort((a, b) => b.score - a.score)
      .slice(0, 40);

    const postTitles = topPosts.map((p, i) => `${i + 1}. [r/${p.subreddit}, score: ${p.score}] ${p.title}`).join('\n');

    const prompt = `You are analyzing real Reddit post titles to extract REUSABLE PROMPT PATTERNS for testing AI chatbot recommendations in the "${niche}" niche.

These are REAL posts from Reddit where users asked for recommendations, comparisons, or help:

${postTitles}

TASK: Extract 15-25 reusable prompt TEMPLATES from these posts. Each template should:
1. Replace specific products/tools with {category}
2. Replace specific use cases with {use_case}
3. Replace specific constraints with {constraint} (budget, team size, industry)
4. Replace specific personas with {persona}
5. Keep the EXACT conversational structure and phrasing

RETRIEVAL FRAME CATEGORIES (distribute across all 7):
- category_formation: "What is [category]?" — definitional queries
- attribute_recall: "Which tools do [capability]?" — feature-matching
- procedural: "How do I [task]?" — instructional
- evaluation: "Is [method A] better than [method B]?" — comparative
- provider_comparison: "Best [category] for [constraint]" — competitive/BOFU
- trust: "Is [brand] safe/reliable for [use case]?" — trust validation
- roi: "Is [brand] worth it for [situation]?" — decision support

BUYER STAGES:
- awareness: learning about the category
- consideration: comparing options
- decision: ready to choose/buy

IMPORTANT RULES:
- Keep personal pronouns ("I", "my", "we") — they make prompts sound human
- Keep constraints and specificity
- Keep the conversational tone exactly as-is
- Do NOT make them sound like SEO keywords
- Statement-form templates are just as valid as question-form

Return JSON array ONLY:
[{
  "template": "I need a {category} for {use_case}. My team is {constraint} and we need {capability}",
  "retrievalFrame": "provider_comparison",
  "buyerStage": "consideration",
  "realExample": "I need a CRM for my sales team. We're a 5-person startup and need Gmail integration",
  "variables": {
    "category": {"type": "product_type", "examples": ["CRM", "project management tool"]},
    "use_case": {"type": "context", "examples": ["sales tracking", "client management"]},
    "constraint": {"type": "qualifier", "examples": ["5-person startup", "remote team"]},
    "capability": {"type": "feature", "examples": ["Gmail integration", "mobile app"]}
  }
}]`;

    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'Extract reusable prompt templates from real Reddit posts. Output valid JSON arrays only.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.4,
        max_tokens: 3000,
        response_format: { type: 'json_object' },
      });

      const text = completion.choices[0]?.message?.content || '[]';
      let patterns: any[];
      try {
        const parsed = JSON.parse(text);
        patterns = Array.isArray(parsed) ? parsed : (parsed.patterns || parsed.templates || parsed.data || []);
      } catch {
        return [];
      }

      return patterns
        .filter((p: any) => p.template && p.retrievalFrame && p.buyerStage)
        .map((p: any) => ({
          template: p.template,
          retrievalFrame: RETRIEVAL_FRAMES.includes(p.retrievalFrame) ? p.retrievalFrame : 'provider_comparison',
          buyerStage: BUYER_STAGES.includes(p.buyerStage) ? p.buyerStage : 'consideration',
          source: `reddit_${niche}`,
          realExample: p.realExample || null,
          variables: p.variables || null,
          humannessScore: scoreHumanness(p.template),
        }));
    } catch (err) {
      console.error('[NichePatterns] Pattern extraction failed:', err);
      return [];
    }
  },

  /**
   * Store extracted patterns in the database.
   */
  storePatterns: async (niche: string, patterns: PromptPattern[]): Promise<number> => {
    let stored = 0;
    for (const pattern of patterns) {
      try {
        // Check for duplicate template in same niche
        const existing = await prisma.nichePromptPattern.findFirst({
          where: {
            niche: { equals: niche, mode: 'insensitive' },
            template: pattern.template,
          },
        });
        if (existing) continue;

        await prisma.nichePromptPattern.create({
          data: {
            niche,
            template: pattern.template,
            retrievalFrame: pattern.retrievalFrame,
            buyerStage: pattern.buyerStage,
            source: pattern.source || 'reddit',
            realExample: pattern.realExample || null,
            variables: pattern.variables || undefined,
            humannessScore: pattern.humannessScore,
          },
        });
        stored++;
      } catch {
        // Ignore duplicates
      }
    }
    return stored;
  },

  /**
   * Get existing patterns for a niche. Returns empty array if none exist yet.
   */
  getPatterns: async (niche: string, options?: {
    retrievalFrame?: RetrievalFrame;
    buyerStage?: BuyerStage;
    minHumannessScore?: number;
    limit?: number;
  }): Promise<any[]> => {
    const where: any = { niche: { equals: niche, mode: 'insensitive' } };
    if (options?.retrievalFrame) where.retrievalFrame = options.retrievalFrame;
    if (options?.buyerStage) where.buyerStage = options.buyerStage;
    if (options?.minHumannessScore) where.humannessScore = { gte: options.minHumannessScore };

    return prisma.nichePromptPattern.findMany({
      where,
      orderBy: [
        { humannessScore: 'desc' },
        { usageCount: 'desc' },
      ],
      take: options?.limit || 50,
    });
  },

  /**
   * Check if we already have sufficient patterns for a niche.
   */
  hasPatterns: async (niche: string, minCount = 10): Promise<boolean> => {
    const count = await prisma.nichePromptPattern.count({
      where: { niche: { equals: niche, mode: 'insensitive' } },
    });
    return count >= minCount;
  },

  /**
   * Fill a pattern template with domain-specific variables to create a concrete prompt.
   */
  fillTemplate: (template: string, vars: Record<string, string>): string => {
    let filled = template;
    for (const [key, value] of Object.entries(vars)) {
      filled = filled.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    }
    return filled;
  },

  /**
   * Increment usage count for patterns that were used.
   */
  markUsed: async (patternIds: number[]): Promise<void> => {
    if (patternIds.length === 0) return;
    await prisma.nichePromptPattern.updateMany({
      where: { id: { in: patternIds } },
      data: { usageCount: { increment: 1 } },
    });
  },

  /**
   * Generate fallback patterns using LLM when no Reddit data is available.
   * Creates patterns based on the 7 retrieval frames for the given niche.
   */
  generateFallbackPatterns: async (niche: string, domainContext: string): Promise<PromptPattern[]> => {
    const prompt = `Generate 20 human-like prompt TEMPLATES for testing whether AI chatbots recommend businesses in the "${niche}" niche.

Business context: ${domainContext.slice(0, 500)}

CRITICAL RULES FOR HUMAN-LIKE PROMPTS:
- 52% MUST use personal pronouns ("I", "my", "we", "our")
- 77% should be STATEMENTS, not questions ("I need a..." not "What is the best...")
- Average 15 words per prompt
- Include SPECIFIC constraints (budget, team size, industry, use case)
- Problem-first: describe the challenge BEFORE asking for a solution
- Use everyday vocabulary ("track" not "monitor", "tool" not "solution")
- NEVER start with "Best" — only 11% of real prompts do

DISTRIBUTE ACROSS ALL 7 RETRIEVAL FRAMES:
- 2 category_formation: definitional ("What exactly is {category}?")
- 3 attribute_recall: feature-matching ("Which {category} can {capability}?")
- 3 procedural: how-to ("How do I {task} with {category}?")
- 3 evaluation: comparative ("Is {option_a} better than {option_b} for {use_case}?")
- 4 provider_comparison: competitive ("I need a {category} for {constraint}")
- 3 trust: validation ("Is {category} reliable enough for {use_case}?")
- 2 roi: justification ("Is it worth switching from {alternative} to {category}?")

Return JSON array:
[{"template": "...", "retrievalFrame": "...", "buyerStage": "awareness|consideration|decision"}]`;

    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'Generate human-like prompt templates for AI visibility testing. Output JSON arrays only.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 2500,
        response_format: { type: 'json_object' },
      });

      const text = completion.choices[0]?.message?.content || '[]';
      let patterns: any[];
      try {
        const parsed = JSON.parse(text);
        patterns = Array.isArray(parsed) ? parsed : (parsed.patterns || parsed.templates || parsed.data || []);
      } catch {
        return [];
      }

      return patterns
        .filter((p: any) => p.template && p.retrievalFrame)
        .map((p: any) => ({
          template: p.template,
          retrievalFrame: RETRIEVAL_FRAMES.includes(p.retrievalFrame) ? p.retrievalFrame : 'provider_comparison',
          buyerStage: BUYER_STAGES.includes(p.buyerStage) ? p.buyerStage : 'consideration',
          source: 'llm_generated',
          humannessScore: scoreHumanness(p.template),
        }));
    } catch (err) {
      console.error('[NichePatterns] Fallback generation failed:', err);
      return [];
    }
  },
};
