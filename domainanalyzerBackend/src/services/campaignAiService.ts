/**
 * AI generation for the worksheet flat-topic model.
 *
 * Two surface APIs:
 *   - generateCampaignTopics: returns N flat topics, each with a title,
 *     summary, description, and a small set of keywords.
 *   - generateKeywordsSuggestion: returns N keyword suggestions for a topic.
 *
 * No pillar/subpage concept anywhere — each topic is a single content unit.
 */

import OpenAI from 'openai';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const CAMPAIGN_AI_MODEL = process.env.CAMPAIGN_AI_MODEL || 'gpt-4o-mini';
const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

export type GeneratedKeyword = {
  term: string;
  volume?: number;
  difficulty?: string;
  intent?: string;
};

export type GeneratedTopic = {
  title: string;
  description?: string;
  summary?: string;
  keywords: GeneratedKeyword[];
};

type BaseAiContext = {
  domainUrl: string;
  domainContext?: string | null;
  keywords?: string[];
  location?: string | null;
  locationContext?: string | null;
  brandVoice?: any;
  targetAudience?: any;
};

const DEFAULT_DIFFICULTY = 'Medium';
const difficultyBuckets = ['Low', 'Medium', 'High'];

const sanitizeNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === 'number' && !isNaN(value)) return Math.round(value);
  if (typeof value === 'string') {
    const numeric = parseInt(value.replace(/[^\d]/g, ''), 10);
    if (!isNaN(numeric)) return numeric;
  }
  return fallback;
};

const sanitizeDifficulty = (value: unknown): string => {
  if (typeof value === 'string') {
    const normalized = value.trim();
    if (difficultyBuckets.includes(normalized)) {
      return normalized;
    }
  }
  return DEFAULT_DIFFICULTY;
};

/**
 * Keyword vs phrase classifier. Returns true when the candidate looks
 * like a real SEO keyword (what a user types in a search box), false
 * when it looks like a marketing phrase or a full sentence.
 *
 * Rules — all must hold for a candidate to pass:
 *   • Total length ≤ 50 chars (real keywords are short)
 *   • Word count ≤ 7 (long-tails top out around 6 words; 7+ reads as phrase)
 *   • No terminating punctuation other than nothing (no '.', '!', '?')
 *   • Does NOT start with a question word in lowercase ("what", "how",
 *     "why", "when", "where", "which", "who"). FAQ-style "what is X"
 *     queries belong on the prompt side of the schema, not as keywords.
 *   • Does NOT contain superlative marketing phrasing
 *     ("best ... for", "top ... for", "ultimate guide to"). These are
 *     content angles, not keywords.
 *
 * This is a CHEAP heuristic on top of the LLM output — the LLM is told
 * the rules in its prompt, and most of the time it complies. This
 * catches the remaining ~10% of bad outputs.
 */
export function isKeywordShaped(candidate: string): boolean {
  const term = candidate.trim();
  if (!term) return false;
  if (term.length > 50) return false;
  const wordCount = term.split(/\s+/).filter(Boolean).length;
  if (wordCount > 7) return false;
  if (/[.!?]/.test(term)) return false;
  const lower = term.toLowerCase();
  if (/^(what|how|why|when|where|which|who)\b/.test(lower)) return false;
  if (
    /\b(best\s+\S+\s+for|top\s+\S+\s+for|ultimate\s+guide|complete\s+guide|step[-\s]?by[-\s]?step)\b/.test(
      lower
    )
  ) {
    return false;
  }
  return true;
}

const extractJsonFromResponse = (response: string): any => {
  const trimmed = response.trim();
  if (!trimmed) return null;
  const fenceMatch = trimmed.match(/```(?:json)?([\s\S]*?)```/);
  const jsonText = fenceMatch ? fenceMatch[1] : trimmed;
  const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
  const candidate = jsonMatch ? jsonMatch[0] : jsonText;
  return JSON.parse(candidate);
};

interface OpenAiJsonOptions {
  /** Override the default content-strategist system prompt. Used by the
   *  keyword-suggest path which needs an SEO-analyst persona instead.
   *  When omitted, the default creative-strategist persona is used. */
  systemPrompt?: string;
  /** Temperature override. Defaults to 0.8 for the strategist persona;
   *  the keyword path drops this to 0.3 for more structured output. */
  temperature?: number;
  /** Cap output length. Defaults to OpenAI's model default. Lower
   *  values are useful for short structured outputs (keywords) where
   *  verbosity is failure. */
  maxTokens?: number;
}

const callOpenAiJson = async <T>(
  prompt: string,
  fallback: () => T,
  options: OpenAiJsonOptions = {}
): Promise<T> => {
  if (!openai) return fallback();
  try {
    const completion = await openai.chat.completions.create({
      model: CAMPAIGN_AI_MODEL,
      temperature: options.temperature ?? 0.8,
      max_tokens: options.maxTokens,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            options.systemPrompt ??
            'You are an expert content marketing strategist. Generate creative, diverse, and unique ideas. Always return valid JSON that matches the requested schema.',
        },
        { role: 'user', content: prompt },
      ],
    });

    const content = completion.choices[0].message?.content || '';
    if (!content) return fallback();
    const parsed = extractJsonFromResponse(content);
    if (!parsed) return fallback();
    return parsed as T;
  } catch (error) {
    console.warn('Campaign AI generation failed, using fallback output.', error);
    return fallback();
  }
};

const buildKeyword = (keyword?: any, seed?: string): GeneratedKeyword => {
  if (!keyword && seed) {
    return {
      term: seed,
      volume: Math.floor(500 + Math.random() * 2500),
      difficulty: DEFAULT_DIFFICULTY,
    };
  }

  const term = keyword?.term || keyword?.keyword || seed || 'New Keyword';

  return {
    term,
    volume: sanitizeNumber(
      keyword?.volume ?? keyword?.searchVolume ?? keyword?.estimatedSearches,
      Math.floor(800 + Math.random() * 1200)
    ),
    difficulty: sanitizeDifficulty(keyword?.difficulty),
    intent: keyword?.intent,
  };
};

const buildTopic = (topic: any, fallbackSeed: string): GeneratedTopic => {
  const title = (topic?.title && String(topic.title).trim()) || fallbackSeed;
  const summary = topic?.summary || topic?.description || undefined;
  const description = topic?.description || undefined;

  const rawKeywords: any[] = Array.isArray(topic?.keywords) ? topic.keywords : [];
  const keywords = rawKeywords.length
    ? rawKeywords.map((kw) => buildKeyword(kw))
    : [buildKeyword(undefined, `${title} strategy`)];

  return { title, description, summary, keywords };
};

export async function generateCampaignTopics(
  context: BaseAiContext & {
    count?: number;
    focus?: string;
    excludeTopics?: string[];
    campaignTitle?: string;
    campaignDescription?: string;
  }
): Promise<GeneratedTopic[]> {
  const {
    domainUrl,
    domainContext,
    keywords = [],
    count = 1,
    focus,
    excludeTopics = [],
    campaignTitle,
    campaignDescription,
    location,
    locationContext,
    brandVoice,
    targetAudience,
  } = context;

  const exclusionPrompt = excludeTopics.length
    ? `\nCRITICAL: DO NOT generate topics that overlap with these existing ones (avoid these themes entirely): ${excludeTopics.join(', ')}`
    : '';

  const geoContext = location
    ? `\nTarget Location: ${location}${locationContext ? `\nLocation Context: ${locationContext}` : ''}`
    : '';

  const voiceContext = brandVoice
    ? `\nBrand Voice: ${typeof brandVoice === 'object' ? JSON.stringify(brandVoice) : brandVoice}`
    : '';

  const audienceContext = targetAudience
    ? `\nTarget Audience: ${typeof targetAudience === 'object' ? JSON.stringify(targetAudience) : targetAudience}`
    : '';

  const campaignContext = campaignTitle
    ? `\nCampaign Name: ${campaignTitle}\nCampaign Goal: ${campaignDescription || 'Not provided'}`
    : '';

  const prompt = `
Create ${count} UNIQUE and NEW worksheet topics for ${domainUrl}. Each topic is a single content unit (not a hierarchy) — it will become one row in the worksheet and one piece of generated content.
Context: ${domainContext || 'Not provided'}. Use this to align topics with the brand's voice and expertise.${geoContext}${voiceContext}${audienceContext}${campaignContext}
Important keywords: ${keywords.join(', ') || 'none'}. Keep each topic relevant to these.
Focus: ${focus || 'balanced mix of awareness and consideration'}${exclusionPrompt}

GUIDELINES for VARIETY:
- Explore different content angles: Technical/Deep-Dive, Strategic/Management, Trend/Future-focused, Beginners Guide, or Contrarian/Opinion.
- Don't only do "How to" guides. Mix in "Why X is the future", "The state of Y", or "Strategic approach to Z".
- Each topic must have a distinct angle — no overlapping themes.

KEYWORD RULES (every keyword on every topic):
- Return 4–6 keywords per topic. First keyword = primary head term (1–3 words); rest are midtail/longtail variants (2–5 words).
- A keyword is what a user types in a search box. NEVER a question, NEVER a sentence, NEVER a marketing phrase.
- Each keyword MUST be 1–5 words and 3–50 chars. NO trailing punctuation.
- Do NOT start a keyword with question words ("what", "how", "why", "when", "where", "which", "who").
- Do NOT use marketing patterns like "best X for Y", "top X for Y", "ultimate guide to X" — those are content angles, not keywords.
- GOOD: "version control", "git for distributed teams", "self-hosted git", "private git hosting".
- BAD:  "best version control platform for remote teams" (phrase), "what is git" (question), "ultimate guide to git" (marketing).

Random Seed: ${Date.now()}

Return JSON matching:
{
  "topics": [
    {
      "title": "string",
      "summary": "string",
      "description": "string",
      "keywords": [
        { "term": "string", "volume": 1500, "difficulty": "Medium", "intent": "informational" }
      ]
    }
  ]
}
Only return JSON. Ensure titles are distinct from the excluded list.`;

  const fallback = () => ({
    topics: Array.from({ length: count }).map((_, index) => {
      const seed = focus
        ? `${focus} angle ${index + 1}`
        : keywords[index] || `Worksheet topic ${index + 1}`;
      return buildTopic(
        {
          title: seed,
          summary: `Content angle inspired by ${keywords[index] || 'brand narrative'}.`,
          description: '',
          keywords: keywords.slice(index, index + 4).map((term) => ({ term })),
        },
        seed
      );
    }),
  });

  const aiResponse = await callOpenAiJson<{ topics: any[] }>(prompt, fallback);
  const topics =
    Array.isArray(aiResponse?.topics) && aiResponse.topics.length > 0
      ? aiResponse.topics
      : fallback().topics;

  return topics.map((topic: any, index: number) =>
    buildTopic(topic, `Worksheet topic ${index + 1}`)
  );
}

/**
 * Suggests a title (and short summary) for an existing worksheet row, using
 * the row's keywords + campaign/domain context. Used by the row-level
 * "AI Suggest" button — does NOT create a new topic, only proposes content
 * for an existing one.
 */
export async function generateTopicTitleSuggestion(
  context: BaseAiContext & {
    /** Keywords already on the topic — primary first if present. */
    keywordTerms: string[];
    campaignTitle?: string;
    campaignDescription?: string;
    /** Existing title, if the user wants the AI to "rewrite" rather than fill in. */
    currentTitle?: string;
  }
): Promise<{ title: string; summary: string }> {
  const {
    domainUrl,
    domainContext,
    keywordTerms,
    campaignTitle,
    campaignDescription,
    currentTitle,
    location,
    locationContext,
    brandVoice,
    targetAudience,
  } = context;

  const geoContext = location
    ? `\nTarget Location: ${location}${locationContext ? `\nLocation Context: ${locationContext}` : ''}`
    : '';
  const voiceContext = brandVoice
    ? `\nBrand Voice: ${typeof brandVoice === 'object' ? JSON.stringify(brandVoice) : brandVoice}`
    : '';
  const audienceContext = targetAudience
    ? `\nTarget Audience: ${typeof targetAudience === 'object' ? JSON.stringify(targetAudience) : targetAudience}`
    : '';
  const campaignContext = campaignTitle
    ? `\nCampaign Name: ${campaignTitle}\nCampaign Goal: ${campaignDescription || 'Not provided'}`
    : '';

  const seedKeywords = keywordTerms.filter(Boolean).slice(0, 8);
  const currentTitleHint =
    currentTitle && currentTitle.trim()
      ? `\nThe row currently has the working title "${currentTitle.trim()}". You may improve it or replace it.`
      : '';

  const prompt = `
Propose a single, distinct content title and a one-sentence summary for a worksheet row on ${domainUrl}.
The row will become one piece of generated content, so the title must be specific and indexable, not a category name.
Context: ${domainContext || 'Not provided'}${geoContext}${voiceContext}${audienceContext}${campaignContext}${currentTitleHint}
Keywords already attached to this row: ${seedKeywords.length ? seedKeywords.join(', ') : 'none yet'}.
- If keywords are present, the title MUST be relevant to them. The first keyword is the primary search term and should drive the angle.
- If no keywords, lean on the campaign + brand context.
- Avoid generic phrasings like "Ultimate Guide to X" — be specific and action-oriented.

Random Seed: ${Date.now()}

Return JSON:
{
  "title": "string",
  "summary": "string"
}
Only return JSON.`;

  const fallback = () => {
    const seed = seedKeywords[0] || campaignTitle || domainUrl;
    return {
      title: `How ${seed} drives measurable outcomes`,
      summary: `A focused take on ${seed} for ${campaignTitle || 'this campaign'}.`,
    };
  };

  const aiResponse = await callOpenAiJson<{ title?: string; summary?: string }>(
    prompt,
    fallback
  );
  const title = (aiResponse?.title || '').trim() || fallback().title;
  const summary = (aiResponse?.summary || '').trim() || '';
  return { title, summary };
}

/**
 * Suggest crisp short SEO keywords for a worksheet topic.
 *
 * Quality bar
 * -----------
 * The previous prompt asked for "longtail variants" and the LLM
 * obediently produced 7-10 word phrases ("best version control
 * platform for remote collaboration"). We now:
 *
 *   1. Use an SEO-analyst system persona (not creative strategist).
 *      Drops temperature from 0.8 → 0.3 — keywords are not creative
 *      writing, they're structured data.
 *   2. Give explicit GOOD/BAD examples in the user prompt, including
 *      character counts and word counts for each tier (head / midtail
 *      / longtail).
 *   3. Cap max_tokens at 400 to discourage rambling output.
 *   4. Use response_format: json_object (defined in callOpenAiJson).
 *   5. Apply a server-side validator (isKeywordShaped) that drops
 *      candidates that still look like phrases or questions. On
 *      shortfall, ask once more with the rejects called out.
 *   6. Respect existingTerms — never suggest a term the row already
 *      has. The caller (the route) is also responsible for never
 *      demoting an existing primary on the same import.
 */
export async function generateKeywordsSuggestion(
  context: BaseAiContext & {
    topicTitle: string;
    /** Keywords already on the row, so the AI doesn't propose duplicates. */
    existingTerms?: string[];
    campaignTitle?: string;
    campaignDescription?: string;
    count?: number;
  }
): Promise<GeneratedKeyword[]> {
  const {
    domainUrl,
    domainContext,
    keywords: domainKeywords = [],
    topicTitle,
    existingTerms = [],
    campaignTitle,
    campaignDescription,
    count = 5,
    location,
    locationContext,
    brandVoice,
    targetAudience,
  } = context;

  const geoContext = location
    ? `\nTarget Location: ${location}${locationContext ? `\nLocation Context: ${locationContext}` : ''}`
    : '';
  const voiceContext = brandVoice
    ? `\nBrand Voice: ${typeof brandVoice === 'object' ? JSON.stringify(brandVoice) : brandVoice}`
    : '';
  const audienceContext = targetAudience
    ? `\nTarget Audience: ${typeof targetAudience === 'object' ? JSON.stringify(targetAudience) : targetAudience}`
    : '';
  const campaignContext = campaignTitle
    ? `\nProject Name: ${campaignTitle}\nProject Goal: ${campaignDescription || 'Not provided'}`
    : '';
  const exclusion = existingTerms.length
    ? `\nALREADY ON THIS ROW (do not propose any of these): ${existingTerms.slice(0, 16).join(', ')}.`
    : '';

  const buildPrompt = (extraRejects: string[] = []) => `
You are doing keyword research for the worksheet topic: "${topicTitle}" on ${domainUrl}.
Company context: ${domainContext || 'Not provided'}${geoContext}${voiceContext}${audienceContext}${campaignContext}
Domain priority terms (for space/intent alignment): ${domainKeywords.slice(0, 8).join(', ') || 'none'}.${exclusion}${
    extraRejects.length
      ? `\nRecent REJECTED suggestions (do NOT repeat these — they read as phrases, not keywords): ${extraRejects.join(', ')}.`
      : ''
  }

Output ${count} SEO KEYWORDS. A keyword is what a user types in a search box.

STRICT RULES — every keyword you return MUST satisfy ALL of these:
  • 1 to 5 words. Never more than 5.
  • 3 to 50 characters total.
  • NO trailing punctuation (no '.', '!', '?').
  • NO question words at the start ("what", "how", "why", "when", "where", "which", "who").
    Those are PROMPTS, not keywords.
  • NO marketing phrases ("best ___ for ___", "top ___ for ___",
    "ultimate guide to ___"). Those are CONTENT ANGLES, not keywords.
  • Each keyword should be SEARCHABLE by a real user with intent —
    not a category label, not a sentence, not a slogan.

Distribution: one HEAD keyword (the strongest primary, 1-3 words),
then ${Math.max(0, count - 1)} MIDTAIL / LONGTAIL variants (2-5 words each,
qualified by intent or audience).

EXAMPLES — for a topic about "version control for software teams":
  ✅ GOOD KEYWORDS (return shape like these):
       "version control"               (head, 2 words)
       "git for distributed teams"     (midtail, 4 words)
       "self-hosted git"               (midtail, 2 words)
       "git vs mercurial"              (midtail, 3 words)
       "private git hosting"           (midtail, 3 words)
  ❌ BAD — DO NOT return things like:
       "best version control platform for remote collaboration"  (phrase, 7 words, marketing)
       "what is the best git alternative"                        (question, starts with "what")
       "How to set up version control for remote teams"          (sentence, starts with "How")
       "ultimate guide to version control"                       (marketing phrase)

Random Seed: ${Date.now()}

Return JSON only:
{
  "keywords": [
    { "term": "string", "tier": "head"|"midtail"|"longtail", "volume": 1200, "difficulty": "Low"|"Medium"|"High", "intent": "informational"|"commercial"|"transactional"|"navigational" }
  ]
}
`;

  const fallback = () => ({
    keywords: Array.from({ length: count }).map((_, index) => {
      // Fallback keeps it short — title + at most one qualifier word.
      const term =
        index === 0
          ? topicTitle.split(/\s+/).slice(0, 3).join(' ').toLowerCase()
          : `${topicTitle.split(/\s+/).slice(0, 2).join(' ').toLowerCase()} ${
              ['guide', 'tools', 'tips', 'examples'][index % 4]
            }`;
      return buildKeyword(
        {
          term,
          volume: Math.floor(800 + Math.random() * 1400),
          difficulty: difficultyBuckets[index % difficultyBuckets.length],
        },
        term
      );
    }),
  });

  const seoSystemPrompt =
    'You are an SEO keyword research analyst. Output crisp, structured keywords — what a user types in a search box. NOT marketing phrases, NOT questions, NOT full sentences. Return valid JSON exactly matching the requested schema.';

  // First pass.
  const firstPass = await callOpenAiJson<{ keywords: any[] }>(
    buildPrompt(),
    fallback,
    { systemPrompt: seoSystemPrompt, temperature: 0.3, maxTokens: 400 }
  );

  // Validate + de-dupe against existing.
  const seen = new Set(existingTerms.map((t) => t.toLowerCase()));
  const accepted: GeneratedKeyword[] = [];
  const rejected: string[] = [];
  const consider = (rawList: any[]) => {
    for (const kw of rawList) {
      const built = buildKeyword(kw, topicTitle);
      const term = built.term.trim();
      const key = term.toLowerCase();
      if (!key || seen.has(key)) continue;
      if (!isKeywordShaped(term)) {
        rejected.push(term);
        continue;
      }
      seen.add(key);
      accepted.push({ ...built, term });
      if (accepted.length >= count) break;
    }
  };
  consider(
    Array.isArray(firstPass?.keywords) && firstPass.keywords.length > 0
      ? firstPass.keywords
      : []
  );

  // If we don't have enough after validation, run ONE follow-up pass
  // that calls out the rejected candidates so the LLM doesn't repeat
  // them. Bounded to one retry to keep token spend predictable.
  if (accepted.length < count && rejected.length > 0) {
    const secondPass = await callOpenAiJson<{ keywords: any[] }>(
      buildPrompt(rejected.slice(0, 8)),
      () => ({ keywords: [] }),
      { systemPrompt: seoSystemPrompt, temperature: 0.2, maxTokens: 400 }
    );
    consider(
      Array.isArray(secondPass?.keywords) && secondPass.keywords.length > 0
        ? secondPass.keywords
        : []
    );
  }

  // Final pad-with-fallback if the LLM still fell short.
  if (accepted.length < count) {
    for (const f of fallback().keywords) {
      const term = f.term.trim();
      const key = term.toLowerCase();
      if (!key || seen.has(key)) continue;
      if (!isKeywordShaped(term)) continue;
      seen.add(key);
      accepted.push({ ...f, term });
      if (accepted.length >= count) break;
    }
  }

  return accepted.slice(0, count);
}
