import OpenAI from 'openai';
import { nichePatternService, RETRIEVAL_FRAMES, type RetrievalFrame } from './nichePatternService';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// ── Types ────────────────────────────────────────────────────────────────────

export interface GeneratedPrompt {
  phrase: string;
  retrievalFrame: RetrievalFrame;
  buyerStage: string;
  intent: string;
  humannessScore: number;
  sourcePatternId?: number;
  sources: string[];
  trend: string;
  relevanceScore: number;
}

interface DomainVars {
  category: string;        // e.g. "CRM", "project management tool"
  capabilities: string[];  // e.g. ["email integration", "task tracking"]
  constraints: string[];   // e.g. ["small team", "under $50/month"]
  useCases: string[];      // e.g. ["sales tracking", "client management"]
  personas: string[];      // e.g. ["startup founder", "marketing manager"]
  competitors: string[];   // e.g. ["HubSpot", "Salesforce"]
  painPoints: string[];    // e.g. ["too many spreadsheets", "lost deals"]
}

// ── Extract domain variables from context ────────────────────────────────────

async function extractDomainVars(
  domainContext: string,
  keywords: string[],
  semanticContext: any
): Promise<DomainVars> {
  const prompt = `From this business context, extract variables for generating AI test prompts.

Business context: ${domainContext.slice(0, 800)}
Keywords: ${keywords.join(', ')}

Extract these as JSON:
{
  "category": "main product/service category (1-3 words)",
  "capabilities": ["5-8 key features or capabilities"],
  "constraints": ["5-8 buyer constraints: team size, budget, industry, company stage"],
  "useCases": ["5-8 specific use cases"],
  "personas": ["4-6 buyer personas with role and context, e.g. 'marketing manager at a SaaS startup'"],
  "competitors": ["3-5 competitor categories (not specific brands), e.g. 'traditional spreadsheet solutions'"],
  "painPoints": ["5-8 problems buyers face that this business solves"]
}`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 1000,
      response_format: { type: 'json_object' },
    });

    const text = completion.choices[0]?.message?.content || '{}';
    const data = JSON.parse(text);

    return {
      category: data.category || keywords[0] || 'software',
      capabilities: data.capabilities || [],
      constraints: data.constraints || [],
      useCases: data.useCases || [],
      personas: data.personas || [],
      competitors: data.competitors || [],
      painPoints: data.painPoints || [],
    };
  } catch {
    return {
      category: keywords[0] || 'software',
      capabilities: [],
      constraints: [],
      useCases: [],
      personas: [],
      competitors: [],
      painPoints: [],
    };
  }
}

// ── Pattern-based prompt generation ──────────────────────────────────────────

function fillPatternWithVars(template: string, vars: DomainVars, keyword: string): string {
  const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)] || '';

  let filled = template;
  filled = filled.replace(/\{category\}/g, vars.category || keyword);
  filled = filled.replace(/\{capability\}/g, pick(vars.capabilities));
  filled = filled.replace(/\{constraint\}/g, pick(vars.constraints));
  filled = filled.replace(/\{use_case\}/g, pick(vars.useCases));
  filled = filled.replace(/\{persona\}/g, pick(vars.personas));
  filled = filled.replace(/\{alternative\}/g, pick(vars.competitors));
  filled = filled.replace(/\{option_a\}/g, pick(vars.competitors));
  filled = filled.replace(/\{option_b\}/g, vars.category || keyword);
  filled = filled.replace(/\{pain_point\}/g, pick(vars.painPoints));
  filled = filled.replace(/\{team_size\}/g, pick(['5-person', '20-person', '50-person', 'small', 'growing']));
  filled = filled.replace(/\{budget\}/g, pick(['under $50/month', 'under $100/month', 'limited budget', 'startup budget']));
  filled = filled.replace(/\{task\}/g, pick(vars.useCases));
  filled = filled.replace(/\{keyword\}/g, keyword);

  // Clean up any remaining unfilled variables
  filled = filled.replace(/\{[^}]+\}/g, keyword);

  return filled.trim();
}

// ── Fan-out: expand one prompt into variants ─────────────────────────────────

function fanOut(basePrompt: string, vars: DomainVars, count: number = 3): string[] {
  const variants: string[] = [basePrompt];
  const lower = basePrompt.toLowerCase();

  // Variant 1: Add persona context
  if (!lower.includes('i\'m') && !lower.includes('i am') && vars.personas.length > 0) {
    const persona = vars.personas[Math.floor(Math.random() * vars.personas.length)];
    variants.push(`I'm a ${persona}. ${basePrompt}`);
  }

  // Variant 2: Add constraint
  if (vars.constraints.length > 0) {
    const constraint = vars.constraints[Math.floor(Math.random() * vars.constraints.length)];
    if (!lower.includes(constraint.toLowerCase())) {
      variants.push(`${basePrompt} We're ${constraint}.`);
    }
  }

  // Variant 3: Problem-first reframe
  if (vars.painPoints.length > 0 && !lower.includes('struggling') && !lower.includes('problem')) {
    const pain = vars.painPoints[Math.floor(Math.random() * vars.painPoints.length)];
    variants.push(`I'm dealing with ${pain}. ${basePrompt}`);
  }

  return variants.slice(0, count);
}

// ── Direct LLM generation for a keyword ──────────────────────────────────────

async function generatePromptsForKeywordViaLLM(params: {
  keyword: string;
  domainUrl: string;
  domainContext: string;
  vars: DomainVars;
  existingPatterns: string[];
  semanticContext: any;
}): Promise<GeneratedPrompt[]> {
  const { keyword, domainUrl, domainContext, vars, existingPatterns, semanticContext } = params;

  // Get community insights for richer context
  const communityContext = semanticContext?.communityContext || {};
  const painPoints = semanticContext?.targetAudience?.personas?.[0]?.painPoints || vars.painPoints;

  const prompt = `Generate 8-12 HUMAN-LIKE prompts that someone would type into ChatGPT/Claude/Gemini when looking for a "${keyword}" solution. These prompts will test whether AI chatbots mention the domain "${domainUrl}".

BUSINESS CONTEXT: ${domainContext.slice(0, 400)}
KEYWORD: "${keyword}"
CATEGORY: ${vars.category}
BUYER PAIN POINTS: ${painPoints.join(', ')}
USE CASES: ${vars.useCases.join(', ')}

${existingPatterns.length > 0 ? `AVOID DUPLICATING THESE EXISTING PROMPTS:\n${existingPatterns.slice(0, 10).map(p => `- ${p}`).join('\n')}` : ''}

CRITICAL RULES (based on analysis of 1,827 real ChatGPT queries):
1. 52% MUST use personal pronouns ("I need", "my team", "we're looking for")
2. 70% should be STATEMENTS not questions ("I need a..." NOT "What is the best...")
3. Target 12-20 words per prompt (real user median is 12 words)
4. Include SPECIFIC constraints in 60%+ of prompts (budget, team size, industry)
5. Be PROBLEM-FIRST: describe the challenge BEFORE asking for a solution
6. Use everyday vocabulary: "track" not "monitor", "tool" not "solution"
7. NEVER start more than 1 prompt with "Best" — real users rarely do this
8. Include at least 2 comparison prompts ("{tool} vs alternatives" style)

DISTRIBUTE ACROSS THESE 7 RETRIEVAL FRAMES:
- 1 category_formation: "What exactly is {category}?" — definitional
- 2 attribute_recall: "Which {category} can handle {capability}?" — feature matching
- 1 procedural: "How do I {task}?" — instructional
- 2 evaluation: "Is {option} good for {use_case}?" — comparative
- 3 provider_comparison: "I need a {category} for {constraint}" — competitive (most important!)
- 2 trust: "Can I rely on {category} for {use_case}?" — trust validation
- 1 roi: "Is it worth investing in {category} for {use_case}?" — decision support

Return JSON array ONLY:
[{
  "phrase": "I'm running a 10-person sales team and we need a CRM that integrates with Gmail. Any recommendations?",
  "retrievalFrame": "provider_comparison",
  "buyerStage": "consideration",
  "intent": "commercial"
}]`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'Generate human-like prompts for AI visibility testing. Match real ChatGPT user behavior: conversational, specific constraints, problem-first, personal pronouns. Output JSON arrays only.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.75,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    });

    const text = completion.choices[0]?.message?.content || '[]';
    let prompts: any[];
    try {
      const parsed = JSON.parse(text);
      prompts = Array.isArray(parsed) ? parsed : (parsed.prompts || parsed.phrases || parsed.data || []);
    } catch {
      return [];
    }

    return prompts
      .filter((p: any) => p.phrase)
      .map((p: any) => ({
        phrase: p.phrase,
        retrievalFrame: RETRIEVAL_FRAMES.includes(p.retrievalFrame) ? p.retrievalFrame : 'provider_comparison' as RetrievalFrame,
        buyerStage: p.buyerStage || 'consideration',
        intent: p.intent || 'commercial',
        humannessScore: scoreHumanness(p.phrase),
        sources: ['AI Generated', 'User Behavior Research'],
        trend: 'stable',
        relevanceScore: 80,
      }));
  } catch (err) {
    console.error(`[HumanPromptGen] LLM generation failed for "${keyword}":`, err);
    return [];
  }
}

// ── Humanness scoring (same as nichePatternService) ──────────────────────────

function scoreHumanness(text: string): number {
  let score = 0;
  const lower = text.toLowerCase();
  const wordCount = text.split(/\s+/).length;

  if (lower.match(/\b(i|my|me|we|our|i'm|i've|we're)\b/)) score += 0.3;
  if (lower.match(/\b(need|looking for|struggling|trying to|help with|problem)\b/)) score += 0.2;
  if (lower.match(/\b(\d+[-\s]?person|\$\d|small team|startup|enterprise|budget|integration)\b/)) score += 0.2;
  if (lower.match(/\b(anyone|you guys|thoughts on|has anyone|honestly|actually)\b/)) score += 0.15;
  if (wordCount >= 10 && wordCount <= 25) score += 0.15;
  else if (wordCount >= 6 && wordCount < 10) score += 0.05;

  return Math.min(1, score);
}

// ── Post-generation validation ───────────────────────────────────────────────

function validatePrompts(prompts: GeneratedPrompt[]): GeneratedPrompt[] {
  const validated: GeneratedPrompt[] = [];
  const seen = new Set<string>();

  for (const prompt of prompts) {
    const phrase = prompt.phrase.trim();
    const wordCount = phrase.split(/\s+/).length;

    // Word count check: 6-30 words
    if (wordCount < 6 || wordCount > 30) continue;

    // Dedup (exact match, case-insensitive)
    const key = phrase.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    // Basic semantic dedup: skip if first 6 words match another prompt
    const prefix = key.split(/\s+/).slice(0, 6).join(' ');
    if ([...seen].some(s => s !== key && s.startsWith(prefix))) continue;

    validated.push({
      ...prompt,
      phrase,
      humannessScore: scoreHumanness(phrase),
    });
  }

  return validated;
}

/**
 * Check retrieval frame coverage and report gaps.
 */
function checkCoverage(prompts: GeneratedPrompt[]): { covered: string[]; missing: string[] } {
  const frames = new Set(prompts.map(p => p.retrievalFrame));
  const covered = RETRIEVAL_FRAMES.filter(f => frames.has(f));
  const missing = RETRIEVAL_FRAMES.filter(f => !frames.has(f));
  return { covered: [...covered], missing: [...missing] };
}

// ── Main export ──────────────────────────────────────────────────────────────

export const humanPromptGenerator = {
  /**
   * Generate human-like prompts for a domain using pattern library + LLM + fan-out.
   * This is the main entry point called from the intent phrase pipeline.
   */
  generateForDomain: async (params: {
    keywords: Array<{ id: number; term: string }>;
    domainUrl: string;
    domainContext: string;
    niche: string;
    semanticContext: any;
    onPrompt?: (prompt: GeneratedPrompt & { keywordId: number }) => void;
  }): Promise<Array<GeneratedPrompt & { keywordId: number }>> => {
    const { keywords, domainUrl, domainContext, niche, semanticContext, onPrompt } = params;

    // 1. Extract domain-specific variables
    const vars = await extractDomainVars(
      domainContext,
      keywords.map(k => k.term),
      semanticContext
    );

    // 2. Get existing patterns for this niche (if any)
    const existingPatterns = await nichePatternService.getPatterns(niche, { limit: 30 });

    const allPrompts: Array<GeneratedPrompt & { keywordId: number }> = [];
    const usedPatternIds: number[] = [];

    for (const keyword of keywords) {
      const keywordPrompts: GeneratedPrompt[] = [];
      const existingPhrases = allPrompts.map(p => p.phrase);

      // 3a. Fill existing patterns with domain vars (if we have patterns)
      if (existingPatterns.length > 0) {
        // Pick 3-4 patterns per keyword, distributed across retrieval frames
        const perKeywordPatterns = selectDistributedPatterns(existingPatterns, 4);

        for (const pattern of perKeywordPatterns) {
          const filled = fillPatternWithVars(pattern.template, vars, keyword.term);
          if (filled && filled.length > 10) {
            keywordPrompts.push({
              phrase: filled,
              retrievalFrame: pattern.retrievalFrame as RetrievalFrame,
              buyerStage: pattern.buyerStage,
              intent: mapFrameToIntent(pattern.retrievalFrame),
              humannessScore: scoreHumanness(filled),
              sourcePatternId: pattern.id,
              sources: ['Pattern Library', pattern.source || 'reddit'],
              trend: 'stable',
              relevanceScore: 80,
            });
            usedPatternIds.push(pattern.id);
          }
        }
      }

      // 3b. Generate additional prompts via LLM (always, to fill gaps)
      const llmPrompts = await generatePromptsForKeywordViaLLM({
        keyword: keyword.term,
        domainUrl,
        domainContext,
        vars,
        existingPatterns: existingPhrases,
        semanticContext,
      });
      keywordPrompts.push(...llmPrompts);

      // 4. Fan-out: expand top prompts into variants
      const topPrompts = keywordPrompts
        .sort((a, b) => b.humannessScore - a.humannessScore)
        .slice(0, 6);

      const expanded: GeneratedPrompt[] = [];
      for (const p of topPrompts) {
        const variants = fanOut(p.phrase, vars, 2);
        for (const v of variants) {
          expanded.push({
            ...p,
            phrase: v,
            humannessScore: scoreHumanness(v),
          });
        }
      }

      // 5. Validate all prompts
      const validated = validatePrompts([...keywordPrompts, ...expanded]);

      // 6. Take best prompts per keyword (sorted by humanness)
      const bestPrompts = validated
        .sort((a, b) => b.humannessScore - a.humannessScore)
        .slice(0, 10); // Max 10 per keyword

      for (const prompt of bestPrompts) {
        const tagged = { ...prompt, keywordId: keyword.id };
        allPrompts.push(tagged);
        if (onPrompt) onPrompt(tagged);
      }
    }

    // 7. Mark used patterns
    if (usedPatternIds.length > 0) {
      await nichePatternService.markUsed(usedPatternIds);
    }

    // 8. Check coverage
    const coverage = checkCoverage(allPrompts);
    if (coverage.missing.length > 0) {
      console.log(`[HumanPromptGen] Missing retrieval frames: ${coverage.missing.join(', ')}`);
    }

    return allPrompts;
  },

  validatePrompts,
  checkCoverage,
  scoreHumanness,
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function selectDistributedPatterns(patterns: any[], count: number): any[] {
  const byFrame = new Map<string, any[]>();
  for (const p of patterns) {
    const arr = byFrame.get(p.retrievalFrame) || [];
    arr.push(p);
    byFrame.set(p.retrievalFrame, arr);
  }

  const selected: any[] = [];
  const frames = [...byFrame.keys()];
  let idx = 0;

  while (selected.length < count && frames.length > 0) {
    const frame = frames[idx % frames.length];
    const arr = byFrame.get(frame)!;
    if (arr.length > 0) {
      selected.push(arr.shift()!);
    } else {
      frames.splice(idx % frames.length, 1);
    }
    idx++;
  }

  return selected;
}

function mapFrameToIntent(frame: string): string {
  switch (frame) {
    case 'category_formation': return 'informational';
    case 'attribute_recall': return 'informational';
    case 'procedural': return 'informational';
    case 'evaluation': return 'commercial';
    case 'provider_comparison': return 'commercial';
    case 'trust': return 'commercial';
    case 'roi': return 'transactional';
    default: return 'commercial';
  }
}
