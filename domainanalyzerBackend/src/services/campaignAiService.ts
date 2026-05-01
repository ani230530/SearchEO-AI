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

const extractJsonFromResponse = (response: string): any => {
  const trimmed = response.trim();
  if (!trimmed) return null;
  const fenceMatch = trimmed.match(/```(?:json)?([\s\S]*?)```/);
  const jsonText = fenceMatch ? fenceMatch[1] : trimmed;
  const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
  const candidate = jsonMatch ? jsonMatch[0] : jsonText;
  return JSON.parse(candidate);
};

const callOpenAiJson = async <T>(prompt: string, fallback: () => T): Promise<T> => {
  if (!openai) return fallback();
  try {
    const completion = await openai.chat.completions.create({
      model: CAMPAIGN_AI_MODEL,
      temperature: 0.8,
      messages: [
        {
          role: 'system',
          content:
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
- For every topic, return 4–6 keywords. The first keyword should be the primary search term; the rest are longtails.

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

export async function generateKeywordsSuggestion(
  context: BaseAiContext & { topicTitle?: string; count?: number }
): Promise<GeneratedKeyword[]> {
  const { domainUrl, domainContext, keywords = [], topicTitle, count = 5 } = context;
  const scope = topicTitle || domainUrl;

  const prompt = `
Suggest ${count} SEO keywords for the worksheet topic "${scope}".
Company context: ${domainContext || 'Not provided'}
Existing priority keywords: ${keywords.slice(0, 8).join(', ') || 'none'}
Random Seed: ${Date.now()}

Return JSON:
  {
    "keywords": [
      { "term": "string", "volume": 1200, "difficulty": "Medium", "intent": "informational" }
    ]
  }
Only return JSON.`;

  const fallback = () => ({
    keywords: Array.from({ length: count }).map((_, index) =>
      buildKeyword(
        {
          term: `${scope} keyword ${index + 1}`,
          volume: Math.floor(800 + Math.random() * 1400),
          difficulty: difficultyBuckets[index % difficultyBuckets.length],
        },
        `${scope} keyword ${index + 1}`
      )
    ),
  });

  const aiResponse = await callOpenAiJson<{ keywords: any[] }>(prompt, fallback);
  const keywordList =
    Array.isArray(aiResponse?.keywords) && aiResponse.keywords.length > 0
      ? aiResponse.keywords
      : fallback().keywords;

  return keywordList.map((kw: any, index: number) =>
    buildKeyword(kw, `${scope} keyword ${index + 1}`)
  );
}
