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

export type GeneratedPage = {
  title: string;
  summary?: string;
  keywords?: GeneratedKeyword[];
};

export type GeneratedTopic = {
  title: string;
  description?: string;
  pillarPage?: GeneratedPage | null;
  subPages?: GeneratedPage[];
  keywords?: GeneratedKeyword[];
};

type BaseAiContext = {
  domainUrl: string;
  domainContext?: string | null;
  keywords?: string[];
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
  if (!openai) {
    return fallback();
  }
  try {
    const completion = await openai.chat.completions.create({
      model: CAMPAIGN_AI_MODEL,
      temperature: 0.7,
      messages: [
        {
          role: 'system',
          content: 'You are an expert content marketing strategist. Generate creative, diverse, and unique ideas. Always return valid JSON that matches the requested schema.'
        },
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    const content = completion.choices[0].message?.content || '';
    if (!content) {
      return fallback();
    }
    const parsed = extractJsonFromResponse(content);
    if (!parsed) {
      return fallback();
    }
    return parsed as T;
  } catch (error) {
    console.warn('Campaign AI generation failed, using fallback output.', error);
    console.warn('Prompt context:', prompt);
    return fallback();
  }
};

const buildKeyword = (keyword?: any, seed?: string): GeneratedKeyword => {
  if (!keyword && seed) {
    return {
      term: seed,
      volume: Math.floor(500 + Math.random() * 2500),
      difficulty: DEFAULT_DIFFICULTY
    };
  }

  const term = keyword?.term || keyword?.keyword || seed || 'New Keyword';

  return {
    term,
    volume: sanitizeNumber(keyword?.volume ?? keyword?.searchVolume ?? keyword?.estimatedSearches, Math.floor(800 + Math.random() * 1200)),
    difficulty: sanitizeDifficulty(keyword?.difficulty),
    intent: keyword?.intent
  };
};

const buildPage = (page?: any, seed?: string): GeneratedPage => {
  if (!page) {
    return {
      title: seed || 'New Page Idea',
      summary: seed ? `Blueprint for ${seed}` : undefined,
      keywords: seed ? [buildKeyword(undefined, `${seed} strategy`)] : []
    };
  }

  return {
    title: page.title || seed || 'New Page Idea',
    summary: page.summary || page.description,
    keywords: Array.isArray(page.keywords)
      ? page.keywords.map((kw: any) => buildKeyword(kw))
      : seed
        ? [buildKeyword(undefined, `${seed} outline`)]
        : []
  };
};

const buildTopic = (topic: any, fallbackSeed: string): GeneratedTopic => {
  const seed = topic?.title || fallbackSeed;
  return {
    title: seed,
    description: topic?.description || `Campaign theme for ${seed}`,
    pillarPage: topic?.pillarPage ? buildPage(topic.pillarPage, `${seed} pillar`) : null,
    subPages: Array.isArray(topic?.subPages)
      ? topic.subPages.map((page: any, index: number) => buildPage(page, `${seed} sub ${index + 1}`))
      : [],
    keywords: Array.isArray(topic?.keywords)
      ? topic.keywords.map((kw: any) => buildKeyword(kw))
      : []
  };
};

export async function generateCampaignTopics(
  context: BaseAiContext & { count?: number; focus?: string }
): Promise<GeneratedTopic[]> {
  const { domainUrl, domainContext, keywords = [], count = 1, focus } = context;
  const prompt = `
Create ${count} campaign topics for ${domainUrl}.
Context: ${domainContext || 'Not provided'}
Important keywords: ${keywords.slice(0, 8).join(', ') || 'none'}
Focus: ${focus || 'balanced mix of awareness and consideration'}
Random Seed: ${Date.now()}

Return JSON matching:
{
  "topics": [
    {
      "title": "string",
      "description": "string",
      "pillarPage": {
        "title": "string",
        "summary": "string",
        "keywords": [
          { "term": "string", "volume": 1800, "difficulty": "Medium" }
        ]
      },
      "subPages": [
        {
          "title": "string",
          "summary": "string",
          "keywords": [
            { "term": "string", "volume": 900, "difficulty": "Low" }
          ]
        }
      ]
    }
  ]
}
Only return JSON.`;

  const fallback = () => ({
    topics: Array.from({ length: count }).map((_, index) =>
      buildTopic(
        {
          title: focus
            ? `${focus} Topic ${index + 1}`
            : keywords[index] || `Campaign Topic ${index + 1}`,
          description: `Content angle inspired by ${keywords[index] || 'brand narrative'}.`,
          pillarPage: {
            title: `Ultimate Guide to ${keywords[index] || 'Brand Strategy'}`,
            summary: `Deep dive resource covering ${keywords[index] || 'core capabilities'}.`
          },
          subPages: [
            {
              title: `${keywords[index] || 'Brand'} playbook`,
              summary: 'Tactical execution guide.'
            }
          ]
        },
        `Topic ${index + 1}`
      )
    )
  });

  const aiResponse = await callOpenAiJson<{ topics: any[] }>(prompt, fallback);
  const topics = Array.isArray(aiResponse?.topics) && aiResponse.topics.length > 0
    ? aiResponse.topics
    : fallback().topics;

  return topics.map((topic: any, index: number) =>
    buildTopic(topic, `Topic ${index + 1}`)
  );
}

export async function generatePillarPageSuggestion(
  context: BaseAiContext & { topicTitle: string }
): Promise<GeneratedPage> {
  const { domainUrl, domainContext, keywords = [], topicTitle } = context;
  const prompt = `
Create a single pillar page idea for the topic "${topicTitle}" for ${domainUrl}.
Context: ${domainContext || 'Not provided'}
Important keywords: ${keywords.slice(0, 8).join(', ') || 'none'}
Random Seed: ${Date.now()}

Return JSON:
{
  "title": "string",
  "summary": "string",
  "keywords": [
    { "term": "string", "volume": 2000, "difficulty": "Medium" }
  ]
}
Only return JSON.`;

  const fallback = () =>
    buildPage(
      {
        title: `${topicTitle} Master Guide`,
        summary: `Comprehensive resource for ${topicTitle.toLowerCase()}.`,
        keywords: keywords.slice(0, 3).map(term => ({
          term,
          volume: Math.floor(1500 + Math.random() * 1000),
          difficulty: DEFAULT_DIFFICULTY
        }))
      },
      topicTitle
    );

  const aiResponse = await callOpenAiJson<GeneratedPage>(prompt, fallback);
  return buildPage(aiResponse, topicTitle);
}

export async function generateSubPagesSuggestion(
  context: BaseAiContext & { topicTitle: string; count?: number }
): Promise<GeneratedPage[]> {
  const { domainUrl, domainContext, keywords = [], topicTitle, count = 2 } = context;
  const prompt = `
Suggest ${count} supporting sub-pages for the topic "${topicTitle}".
Company: ${domainUrl}
Context: ${domainContext || 'Not provided'}
Important keywords: ${keywords.slice(0, 8).join(', ') || 'none'}
Random Seed: ${Date.now()}

Return JSON:
{
  "subPages": [
    {
      "title": "string",
      "summary": "string",
      "keywords": [
        { "term": "string", "volume": 900, "difficulty": "Low" }
      ]
    }
  ]
}
Only return JSON.`;

  const fallback = () => ({
    subPages: Array.from({ length: count }).map((_, index) =>
      buildPage(
        {
          title: `${topicTitle} Sub Topic ${index + 1}`,
          summary: `Supporting article for ${topicTitle}.`
        },
        `${topicTitle} sub ${index + 1}`
      )
    )
  });

  const aiResponse = await callOpenAiJson<{ subPages: any[] }>(prompt, fallback);
  const subPages = Array.isArray(aiResponse?.subPages) && aiResponse.subPages.length > 0
    ? aiResponse.subPages
    : fallback().subPages;

  return subPages.map((page: any, index: number) =>
    buildPage(page, `${topicTitle} sub ${index + 1}`)
  );
}

export async function generateKeywordsSuggestion(
  context: BaseAiContext & { topicTitle?: string; pageTitle?: string; count?: number }
): Promise<GeneratedKeyword[]> {
  const { domainUrl, domainContext, keywords = [], topicTitle, pageTitle, count = 5 } = context;
  const scope = pageTitle || topicTitle || domainUrl;
  const prompt = `
Suggest ${count} SEO keywords for "${scope}".
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
          difficulty: difficultyBuckets[index % difficultyBuckets.length]
        },
        `${scope} keyword ${index + 1}`
      )
    )
  });

  const aiResponse = await callOpenAiJson<{ keywords: any[] }>(prompt, fallback);
  const keywordList = Array.isArray(aiResponse?.keywords) && aiResponse.keywords.length > 0
    ? aiResponse.keywords
    : fallback().keywords;

  return keywordList.map((kw: any, index: number) =>
    buildKeyword(kw, `${scope} keyword ${index + 1}`)
  );
}

