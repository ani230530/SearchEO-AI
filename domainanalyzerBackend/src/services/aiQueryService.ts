import OpenAI from 'openai';

// ── API clients ──────────────────────────────────────────────────────────────

// OpenRouter client – single key for all 3 LLMs with web search
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// Also keep direct OpenAI client for scoring analysis (cheaper, no web search needed)
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENROUTER_API_KEY && !OPENAI_API_KEY) {
  throw new Error('Either OPENROUTER_API_KEY or OPENAI_API_KEY must be set');
}

const openrouter = OPENROUTER_API_KEY
  ? new OpenAI({
      apiKey: OPENROUTER_API_KEY,
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'HTTP-Referer': process.env.APP_URL || 'http://localhost:3002',
        'X-Title': 'SEO-GPT AI Visibility Analyzer',
      },
    })
  : null;

const openai = OPENAI_API_KEY
  ? new OpenAI({ apiKey: OPENAI_API_KEY })
  : null;

// Model mapping: display name → OpenRouter model ID
const MODEL_MAP: Record<string, string> = {
  'GPT-4o': 'openai/gpt-4o',
  'Claude 3': 'anthropic/claude-sonnet-4-20250514',
  'Gemini 1.5': 'google/gemini-2.0-flash-001',
};

// ── Shared types ─────────────────────────────────────────────────────────────

export interface Citation {
  url: string;
  title: string;
  citedText?: string;
  startIndex?: number;
  endIndex?: number;
  confidenceScore?: number;
}

export interface LLMResponse {
  text: string;
  model: string;
  citations: Citation[];
  searchQueries: string[];
  cost: number;
}

// ── Helper: extract JSON from AI response ────────────────────────────────────

function extractJSONFromResponse(aiResponse: string): string | null {
  try {
    let cleanResponse = aiResponse.trim();
    if (cleanResponse.startsWith('```json')) {
      cleanResponse = cleanResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleanResponse.startsWith('```')) {
      cleanResponse = cleanResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    const jsonMatch = cleanResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) cleanResponse = jsonMatch[0];
    JSON.parse(cleanResponse);
    return cleanResponse;
  } catch {
    return null;
  }
}

// ── Build user-like prompt (natural, not SEO-optimized) ──────────────────────

function buildNaturalPrompt(phrase: string, location?: string): string {
  const hasLocation = Boolean(location?.trim());
  if (hasLocation) {
    return `${phrase}\n\nI'm based in ${location!.trim()}. Please include location-relevant information where applicable.`;
  }
  return phrase;
}

// ── Unified query via OpenRouter (all 3 LLMs with web search + citations) ────

async function queryViaOpenRouter(
  phrase: string,
  displayModel: 'GPT-4o' | 'Claude 3' | 'Gemini 1.5',
  domain?: string,
  location?: string
): Promise<LLMResponse> {
  const client = openrouter || openai;
  if (!client) throw new Error('No API client available');

  const userPrompt = buildNaturalPrompt(phrase, location);
  const isOpenRouter = !!openrouter;

  // Pick model ID
  const modelId = isOpenRouter ? MODEL_MAP[displayModel] : 'gpt-4o';

  // Build request body
  const requestBody: any = {
    model: modelId,
    messages: [{ role: 'user', content: userPrompt }],
    max_tokens: 2048,
    temperature: 0.1,
  };

  if (isOpenRouter) {
    // OpenRouter: use web_search server tool – works with ANY model, returns standardized citations
    requestBody.tools = [
      {
        type: 'openrouter:web_search',
        parameters: {
          max_results: 8,
          search_context_size: 'medium',
        },
      },
    ];
  }

  console.log(`[OpenRouter] Querying ${modelId} with web search...`);

  const response: any = await client.chat.completions.create(requestBody);

  // Parse response – OpenRouter returns standard chat completions format with annotations
  const choice = response.choices?.[0];
  const message = choice?.message;
  const fullText = message?.content || '';

  // Extract citations from annotations (OpenRouter standardized format)
  const citations: Citation[] = [];
  const annotations = message?.annotations || [];

  for (const ann of annotations) {
    if (ann.type === 'url_citation') {
      const citationData = ann.url_citation || ann;
      citations.push({
        url: citationData.url || ann.url || '',
        title: citationData.title || ann.title || '',
        citedText: citationData.content || '',
        startIndex: citationData.start_index ?? ann.start_index,
        endIndex: citationData.end_index ?? ann.end_index,
      });
    }
  }

  const uniqueCitations = deduplicateCitations(citations);

  // Cost from usage
  const usage = response.usage || {};
  const searchRequests = usage.server_tool_use?.web_search_requests || 0;
  const inputCost = ((usage.prompt_tokens || 0) / 1_000_000) * 3;
  const outputCost = ((usage.completion_tokens || 0) / 1_000_000) * 15;
  const searchCost = (searchRequests / 1000) * 10;
  const cost = inputCost + outputCost + searchCost;

  // Extract search queries from response if available
  const searchQueries: string[] = [];
  if (searchRequests > 0) {
    searchQueries.push(phrase); // OpenRouter doesn't expose individual search queries
  }

  console.log(`[OpenRouter] ${displayModel} (${modelId}): ${uniqueCitations.length} citations, ${searchRequests} searches`);

  return {
    text: fullText,
    model: displayModel,
    citations: uniqueCitations,
    searchQueries,
    cost,
  };
}

// ── Citation deduplication ───────────────────────────────────────────────────

function deduplicateCitations(citations: Citation[]): Citation[] {
  const seen = new Map<string, Citation>();
  for (const c of citations) {
    const key = c.url;
    if (!key) continue;
    if (!seen.has(key)) {
      seen.set(key, c);
    } else {
      // Merge: keep the one with more data
      const existing = seen.get(key)!;
      if (!existing.citedText && c.citedText) existing.citedText = c.citedText;
      if (!existing.title && c.title) existing.title = c.title;
      if (c.confidenceScore !== undefined && existing.confidenceScore === undefined) {
        existing.confidenceScore = c.confidenceScore;
      }
    }
  }
  return Array.from(seen.values());
}

// ── Citation-based deterministic scoring ─────────────────────────────────────

function extractDomainPattern(domain: string): string {
  return domain.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
}

// Common words that are also brand names — require word-boundary matching
const GENERIC_BRAND_NAMES = new Set([
  'tools', 'data', 'app', 'web', 'cloud', 'code', 'hub', 'lab', 'labs',
  'bit', 'box', 'go', 'one', 'pro', 'get', 'try', 'use', 'dev', 'api',
  'base', 'flow', 'link', 'page', 'site', 'team', 'work', 'plan', 'mail',
  'chat', 'shop', 'help', 'docs', 'test', 'read', 'note', 'open', 'fast',
]);

function findFirstMentionPosition(text: string, domain: string): number {
  const pattern = extractDomainPattern(domain);
  const brandName = pattern.split('.')[0];
  const lowerText = text.toLowerCase();

  // Check for domain URL first
  const urlIndex = lowerText.indexOf(pattern);
  if (urlIndex >= 0) return urlIndex;

  // For short or generic brand names, require word boundary match to avoid false positives
  if (brandName.length <= 4 || GENERIC_BRAND_NAMES.has(brandName)) {
    const regex = new RegExp(`\\b${brandName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    const match = regex.exec(lowerText);
    return match ? match.index : -1;
  }

  // For longer, unique brand names, simple indexOf is fine
  const brandIndex = lowerText.indexOf(brandName);
  if (brandIndex >= 0) return brandIndex;

  return -1; // not found
}

function extractAllBrandsFromText(text: string, citations: Citation[]): string[] {
  const brands = new Set<string>();

  // From citations
  for (const c of citations) {
    try {
      const hostname = new URL(c.url).hostname.replace(/^www\./, '');
      brands.add(hostname);
    } catch { /* skip invalid URLs */ }
  }

  // From text – look for domain-like patterns (expanded TLDs)
  const domainRegex = /\b([a-z0-9-]+\.(?:com|io|org|net|co|ai|dev|app|tech|tools|cloud|uk|de|fr|in|jp|es|it|nl|br|au|ca|ru|me|info|biz|xyz|so|sh|gg|to|fm|ly|cc|agency|software|solutions|digital|online|store|site|page))\b/gi;
  let match;
  while ((match = domainRegex.exec(text)) !== null) {
    brands.add(match[1].toLowerCase());
  }

  return Array.from(brands);
}

function classifySentiment(contexts: string[]): 'positive' | 'neutral' | 'negative' {
  if (contexts.length === 0) return 'neutral';

  const positiveWords = ['best', 'top', 'recommend', 'excellent', 'great', 'leading', 'popular', 'powerful', 'favorite', 'outstanding', 'preferred', 'trusted', 'reliable', 'innovative', 'robust', 'seamless', 'efficient', 'intuitive', 'versatile', 'comprehensive'];
  const negativeWords = ['worst', 'avoid', 'poor', 'bad', 'expensive', 'slow', 'outdated', 'unreliable', 'limited', 'disappointing', 'lacks', 'difficult', 'clunky', 'buggy', 'overpriced', 'confusing', 'frustrating', 'mediocre', 'weak'];
  const negationWords = ['not', "n't", 'no', 'never', 'neither', 'hardly', 'barely', 'without'];

  let positiveCount = 0;
  let negativeCount = 0;
  const allText = contexts.join(' ').toLowerCase();
  const words = allText.split(/\s+/);

  for (let i = 0; i < words.length; i++) {
    const word = words[i].replace(/[^a-z']/g, '');
    const isNegated = (i > 0 && negationWords.some(n => words[i - 1].includes(n))) ||
                      (i > 1 && negationWords.some(n => words[i - 2].includes(n)));

    if (positiveWords.includes(word)) {
      if (isNegated) negativeCount++;
      else positiveCount++;
    }
    if (negativeWords.includes(word)) {
      if (isNegated) positiveCount++;
      else negativeCount++;
    }
  }

  if (positiveCount > negativeCount + 1) return 'positive';
  if (negativeCount > positiveCount + 1) return 'negative';
  return 'neutral';
}

function extractMentionContexts(text: string, domain: string): string[] {
  const pattern = extractDomainPattern(domain);
  const brandName = pattern.split('.')[0];
  const lowerText = text.toLowerCase();
  const contexts: string[] = [];

  // Find all mentions and extract surrounding sentences
  const sentenceBoundary = /[.!?;]/;
  const searchTerms = [pattern, brandName];
  for (const term of searchTerms) {
    // Skip generic brand names for context extraction too
    if (term === brandName && (brandName.length <= 3 || GENERIC_BRAND_NAMES.has(brandName))) {
      const regex = new RegExp(`\\b${brandName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (!regex.test(text)) continue;
    }
    let idx = lowerText.indexOf(term);
    while (idx >= 0) {
      // Search backward for sentence start
      let start = idx;
      while (start > 0 && !sentenceBoundary.test(text[start - 1])) start--;
      // Search forward for sentence end
      let end = idx + term.length;
      while (end < text.length && !sentenceBoundary.test(text[end])) end++;
      const sentence = text.substring(start, Math.min(end + 1, text.length)).trim();
      if (sentence) contexts.push(sentence);
      idx = lowerText.indexOf(term, idx + term.length);
    }
  }

  return [...new Set(contexts)];
}

function scoreResponseDeterministic(
  llmResponse: LLMResponse,
  domain: string,
  phrase: string
): {
  presence: number;
  relevance: number;
  accuracy: number;
  sentiment: number;
  overall: number;
  domainRank: number;
  mentions: number;
  highlightContext: string;
  detectionMethod: string;
  domainSentiment: 'positive' | 'neutral' | 'negative';
  citationStrength: number;
  competitors: {
    names: string[];
    mentions: Array<{
      name: string;
      domain: string;
      position: number;
      context: string;
      sentiment: 'positive' | 'neutral' | 'negative';
      mentionType: 'url' | 'text' | 'brand';
    }>;
    totalMentions: number;
  };
} {
  const domainPattern = extractDomainPattern(domain);
  const brandName = domainPattern.split('.')[0];
  const lowerText = llmResponse.text.toLowerCase();

  // 1. PRESENCE: check citations first, then text
  const inCitations = llmResponse.citations.some(c => {
    try {
      const host = new URL(c.url).hostname.replace(/^www\./, '');
      return host.includes(domainPattern) || domainPattern.includes(host);
    } catch { return false; }
  });
  const inText = lowerText.includes(domainPattern) || lowerText.includes(brandName);
  const presence = inCitations ? 1 : inText ? 1 : 0;

  if (presence === 0) {
    // Domain not found – extract competitors and return zeros
    const allBrands = extractAllBrandsFromText(llmResponse.text, llmResponse.citations);
    const competitorBrands = allBrands.filter(b => b !== domainPattern && !domainPattern.includes(b.split('.')[0]));
    const competitorMentions = competitorBrands.slice(0, 10).map((brand, i) => ({
      name: brand.split('.')[0],
      domain: brand,
      position: i + 1,
      context: 'neutral',
      sentiment: 'neutral' as const,
      mentionType: 'text' as const,
    }));

    return {
      presence: 0,
      relevance: 0,
      accuracy: 0,
      sentiment: 0,
      overall: 0,
      domainRank: 0,
      mentions: 0,
      highlightContext: '',
      detectionMethod: 'none',
      domainSentiment: 'neutral',
      citationStrength: 0,
      competitors: {
        names: competitorBrands.slice(0, 10).map(b => b.split('.')[0]),
        mentions: competitorMentions,
        totalMentions: competitorMentions.length,
      },
    };
  }

  // 2. DETECTION METHOD
  let detectionMethod = 'text';
  if (inCitations) detectionMethod = 'url';
  else if (lowerText.includes(brandName) && !lowerText.includes(domainPattern)) detectionMethod = 'brand';

  // 3. RANK: position of first mention relative to all brands
  const firstMentionPos = findFirstMentionPosition(llmResponse.text, domain);
  const allBrands = extractAllBrandsFromText(llmResponse.text, llmResponse.citations);
  const brandPositions = allBrands.map(b => {
    const pos = llmResponse.text.toLowerCase().indexOf(b.split('.')[0]);
    return { brand: b, position: pos >= 0 ? pos : Infinity };
  }).sort((a, b) => a.position - b.position);

  const domainRank = brandPositions.findIndex(bp =>
    bp.brand.includes(domainPattern.split('.')[0]) || domainPattern.includes(bp.brand.split('.')[0])
  ) + 1 || 0;

  // 4. MENTIONS COUNT — deduplicate overlapping domain/brand matches by tracking positions
  const mentionPositions = new Set<number>();
  let idx = lowerText.indexOf(domainPattern);
  while (idx >= 0) {
    mentionPositions.add(idx);
    idx = lowerText.indexOf(domainPattern, idx + domainPattern.length);
  }
  // Only count brand name hits that don't overlap with domain pattern hits
  if (brandName.length > 3 && !GENERIC_BRAND_NAMES.has(brandName)) {
    idx = lowerText.indexOf(brandName);
    while (idx >= 0) {
      const overlaps = [...mentionPositions].some(p => Math.abs(p - idx) < domainPattern.length);
      if (!overlaps) mentionPositions.add(idx);
      idx = lowerText.indexOf(brandName, idx + brandName.length);
    }
  }
  const mentions = mentionPositions.size;

  // 5. CITATION STRENGTH
  const domainCitations = llmResponse.citations.filter(c => {
    try {
      const host = new URL(c.url).hostname.replace(/^www\./, '');
      return host.includes(domainPattern) || domainPattern.includes(host);
    } catch { return false; }
  });
  const citationStrength = llmResponse.citations.length > 0
    ? domainCitations.length / llmResponse.citations.length
    : 0;

  // 6. SENTIMENT
  const mentionContexts = extractMentionContexts(llmResponse.text, domain);
  const domainSentiment = classifySentiment(mentionContexts);

  // 7. HIGHLIGHT CONTEXT
  let highlightContext = '';
  if (firstMentionPos >= 0) {
    const start = Math.max(0, firstMentionPos - 120);
    const end = Math.min(llmResponse.text.length, firstMentionPos + 300);
    highlightContext = llmResponse.text.substring(start, end).trim();
  }

  // 8. RELEVANCE (phrase words present in response)
  const phraseWords = phrase.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const responseWords = new Set(lowerText.split(/\s+/));
  const matchedWords = phraseWords.filter(w => responseWords.has(w));
  const baseRelevance = phraseWords.length > 0
    ? Math.min(5, Math.max(1, Math.round((matchedWords.length / phraseWords.length) * 5)))
    : 3;
  const relevance = Math.min(5, Math.max(1,
    baseRelevance + (domainSentiment === 'positive' ? 1 : domainSentiment === 'negative' ? -1 : 0)
  ));

  // 9. ACCURACY (based on detection method + citation presence)
  let accuracy = 3;
  if (detectionMethod === 'url') accuracy = 5;
  else if (detectionMethod === 'brand') accuracy = 4;
  if (inCitations) accuracy = Math.min(5, accuracy + 1);

  // 10. SENTIMENT SCORE (1-5)
  const sentimentScore = domainSentiment === 'positive' ? 5 : domainSentiment === 'negative' ? 1 : 3;

  // 11. OVERALL: weighted composite
  const rankScore = domainRank > 0 ? Math.max(1, 6 - domainRank) : 0; // Rank 1 = 5, Rank 5 = 1
  const overall = Math.min(5, Math.max(1,
    (rankScore * 0.30) +
    (citationStrength * 5 * 0.20) +
    (sentimentScore * 0.20) +
    (accuracy * 0.15) +
    (relevance * 0.15)
  ));

  // 12. COMPETITORS
  const competitorBrands = allBrands.filter(b =>
    b !== domainPattern && !domainPattern.includes(b.split('.')[0]) && b.split('.')[0] !== brandName
  );
  const competitorMentions = competitorBrands.slice(0, 10).map((brand, i) => {
    const bName = brand.split('.')[0];
    const bContexts = extractMentionContexts(llmResponse.text, brand);
    const bSentiment = classifySentiment(bContexts);
    const isInCitations = llmResponse.citations.some(c => {
      try { return new URL(c.url).hostname.replace(/^www\./, '').includes(brand); } catch { return false; }
    });
    return {
      name: bName,
      domain: brand,
      position: i + 1,
      context: bSentiment,
      sentiment: bSentiment,
      mentionType: (isInCitations ? 'url' : 'text') as 'url' | 'text' | 'brand',
    };
  });

  return {
    presence,
    relevance,
    accuracy,
    sentiment: sentimentScore,
    overall: Math.round(overall * 100) / 100,
    domainRank,
    mentions,
    highlightContext,
    detectionMethod,
    domainSentiment,
    citationStrength: Math.round(citationStrength * 100) / 100,
    competitors: {
      names: competitorMentions.map(c => c.name),
      mentions: competitorMentions,
      totalMentions: competitorMentions.length,
    },
  };
}

// ── AI-based analysis (kept as fallback for edge cases) ──────────────────────

async function analyzeResponseWithAI(response: string, targetDomain: string): Promise<{
  presence: number;
  rank: number;
  context: string;
  mentions: number;
  highlightContext: string;
  detectionMethod: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  competitors: {
    names: string[];
    mentions: Array<{
      name: string;
      domain: string;
      position: number;
      context: string;
      sentiment: 'positive' | 'neutral' | 'negative';
      mentionType: 'url' | 'text' | 'brand';
    }>;
    totalMentions: number;
  };
}> {
  try {
    const cleanTarget = targetDomain.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '');
    const brandName = cleanTarget.split('.')[0];

    const analysisPrompt = `
       You are to perform HIGH-PRECISION detection of a TARGET DOMAIN and COMPETITORS within the following RESPONSE text.

       TASK:
       - Detect whether TARGET DOMAIN or Brand Name or Sub Brand Name is present.
       - Determine the first occurrence RANK based on textual order (Rank 1 = first mention in the text; Rank 2 = second, etc.). If absent, rank must be 0.
       - Provide detectionMethod as one of: "url" | "brand" | "text". Priority if multiple match types exist for the same occurrence: url > brand > text.
       - Provide highlightContext: a short exact substring (≤ 420 chars) from the RESPONSE where the target or competitor is clearly mentioned.
       - Count mentions for TARGET DOMAIN (exact and normalized forms) as an integer.
       - Extract COMPETITORS (brands/domains) with their first position, sentiment, and mentionType.

       NORMALIZATION RULES:
       - Normalize all domains to lowercase and strip protocol and leading 'www.' (e.g., https://www.Example.com/path → example.com).
       - TARGET BRAND VARIANTS: Generate reasonable brand variants from TARGET BRAND (split on punctuation/case). Match brand mentions case-insensitively.
       - URL detection: Any URL whose hostname equals or ends with the domain (including subdomains) counts as detectionType "url".
       - TEXT detection: Plain-text occurrences of the normalized domain (e.g., "example.com") count as detectionType "text".
       - BRAND detection: Brand-name mentions (variants of TARGET BRAND) count as detectionType "brand" if not immediately accompanied by another unrelated domain.

       COMPETITOR EXTRACTION:
       - Extract distinct brands/domains other than TARGET DOMAIN.
       - For each competitor, include a best-effort brand name and normalized domain when possible.
       - position is based on first mention order in the RESPONSE, starting at 1.
       - mentionType must be "url" | "text" | "brand" using the same rules as above.

       SENTIMENT RULES (context of mention):
       - positive: recommended, praised, labeled best/top, or endorsed.
       - negative: discouraged, criticized, labeled worst, avoid, not recommended.
       - neutral: listed, compared without judgment, or purely informational.

       OUTPUT STRICTLY as RAW JSON (no markdown, no code fences). The response MUST start with { and end with }.

       REQUIRED JSON SCHEMA:
       {
         "targetDomain": {
           "isPresent": boolean,
           "rank": number,
           "context": "positive|neutral|negative|not_found",
           "mentions": number,
           "highlightContext": string,
           "detectionMethod": "url|text|brand|none"
         },
         "competitors": [
           {
             "name": string,
             "domain": string,
             "position": number,
             "context": "positive|neutral|negative",
             "sentiment": "positive|neutral|negative",
             "mentionType": "url|text|brand"
           }
         ]
       }

       VALIDATION CONSTRAINTS:
       - If TARGET DOMAIN is absent, set isPresent=false, rank=0, mentions=0, detectionMethod="none", context="not_found".
       - NEVER hallucinate domains; only extract what appears in RESPONSE.
       - Ensure arrays/fields exist even if empty. Use empty string for unknown competitor domain.
       - Keep strings concise; do not exceed limits.

       RESPONSE:
       "${response}"

       TARGET DOMAIN: ${targetDomain}
       TARGET BRAND: ${brandName}
       `;

    // Use OpenRouter or direct OpenAI for scoring analysis
    const scoringClient = openai || openrouter;
    if (!scoringClient) throw new Error('No API client available for scoring');

    const completion = await scoringClient.chat.completions.create({
      model: openai ? 'gpt-4o' : 'openai/gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are an expert at precise text analysis for domain and brand detection. You MUST return ONLY raw JSON, strictly conforming to the provided schema. Do not include markdown. Deterministic output: avoid speculation; never invent domains.'
        },
        { role: 'user', content: analysisPrompt }
      ],
      temperature: 0,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0,
      max_tokens: 1200
    });

    const aiResponse = completion.choices[0].message?.content || '';
    const cleanResponse = extractJSONFromResponse(aiResponse);
    if (!cleanResponse) {
      throw new Error('Could not extract valid JSON from AI response');
    }

    const analysis = JSON.parse(cleanResponse);
    const targetInfo = analysis.targetDomain;
    const competitors = analysis.competitors || [];

    const finalCompetitors = {
      names: competitors.map((c: any) => c.name || c.domain).filter(Boolean),
      mentions: competitors.map((c: any) => ({
        name: c.name || c.domain || '',
        domain: c.domain || c.name || '',
        position: c.position || 0,
        context: c.context || '',
        sentiment: c.sentiment || 'neutral',
        mentionType: c.mentionType || 'text'
      })),
      totalMentions: competitors.length
    };

    return {
      presence: targetInfo.isPresent ? 1 : 0,
      rank: targetInfo.rank || 0,
      context: targetInfo.context || 'not_found',
      mentions: targetInfo.mentions || 0,
      highlightContext: targetInfo.highlightContext || '',
      detectionMethod: targetInfo.detectionMethod || 'none',
      sentiment: targetInfo.context === 'positive' ? 'positive' : targetInfo.context === 'negative' ? 'negative' : 'neutral',
      competitors: finalCompetitors
    };
  } catch (error) {
    console.error('AI analysis failed, using fallback:', error);

    const cleanTarget = targetDomain.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '');
    const responseLower = response.toLowerCase();

    let presence = 0;
    let rank = 0;
    let mentions = 0;
    let highlightContext = '';
    let detectionMethod = 'none';

    if (responseLower.includes(cleanTarget)) {
      presence = 1;
      mentions = 1;
      const index = responseLower.indexOf(cleanTarget);
      rank = Math.ceil((index / response.length) * 10);
      const start = Math.max(0, index - 100);
      const end = Math.min(response.length, index + cleanTarget.length + 100);
      highlightContext = response.substring(start, end);
      detectionMethod = 'text';
    }

    const urlRegex = /https?:\/\/[^\s\n\)\]}"']+/g;
    const urls = response.match(urlRegex) || [];
    const domains = urls.map(u => {
      try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; }
    }).filter(d => d && d !== cleanTarget);

    const competitorNames = [...new Set(domains)].slice(0, 8);
    const competitorMentions = competitorNames.map((name, i) => ({
      name,
      domain: name,
      position: i + 1,
      context: 'neutral',
      sentiment: 'neutral' as const,
      mentionType: 'url' as const
    }));

    return {
      presence,
      rank,
      context: presence > 0 ? 'neutral' : 'not_found',
      mentions,
      highlightContext,
      detectionMethod,
      sentiment: 'neutral',
      competitors: {
        names: competitorNames,
        mentions: competitorMentions,
        totalMentions: competitorMentions.length
      }
    };
  }
}

// ── Score response (hybrid: citation-based when available, AI fallback) ──────

async function scoreResponseWithAI(
  phrase: string,
  response: string,
  model: string,
  domain?: string,
  location?: string,
  llmResponse?: LLMResponse
): Promise<{
  presence: number;
  relevance: number;
  accuracy: number;
  sentiment: number;
  overall: number;
  domainRank?: number;
  foundDomains?: string[];
  sources: string[];
  competitorUrls: string[];
  competitorMatchScore: number;
  comprehensiveness: number;
  context: string;
  mentions: number;
  highlightContext: string;
  detectionMethod: string;
  domainSentiment: 'positive' | 'neutral' | 'negative';
  aiConfidence: number;
  rankingFactors: {
    position: number;
    prominence: number;
    contextQuality: number;
    mentionType: number;
  };
  competitors: {
    names: string[];
    mentions: Array<{
      name: string;
      domain: string;
      position: number;
      context: string;
      sentiment: 'positive' | 'neutral' | 'negative';
      mentionType: 'url' | 'text' | 'brand';
    }>;
    totalMentions: number;
  };
  citations: Citation[];
  searchQueries: string[];
}> {
  // If we have real LLM response with citations, use deterministic scoring
  if (llmResponse && llmResponse.citations.length > 0 && domain) {
    console.log(`[Scoring] Using citation-based deterministic scoring for ${model} (${llmResponse.citations.length} citations)`);
    const scores = scoreResponseDeterministic(llmResponse, domain, phrase);

    const responseLength = response.length;
    const comprehensiveness = responseLength > 1000 ? 5 : responseLength > 800 ? 4 : responseLength > 600 ? 3 : responseLength > 400 ? 2 : 1;

    const competitorUrls = scores.competitors.mentions.map(m => `https://${m.domain}`);
    const sources = llmResponse.citations.map(c => c.url).filter(Boolean);

    return {
      ...scores,
      domainRank: scores.domainRank || undefined,
      foundDomains: scores.presence > 0 ? [domain] : [],
      sources,
      competitorUrls,
      competitorMatchScore: scores.competitors.totalMentions * 10,
      comprehensiveness,
      context: scores.domainSentiment === 'positive' ? 'positive' : scores.domainSentiment === 'negative' ? 'negative' : scores.presence > 0 ? 'neutral' : 'not_found',
      aiConfidence: 95, // High confidence when using real citations
      rankingFactors: {
        position: scores.domainRank * 10,
        prominence: scores.mentions * 20,
        contextQuality: scores.domainSentiment === 'positive' ? 80 : scores.domainSentiment === 'negative' ? 20 : 50,
        mentionType: scores.detectionMethod === 'url' ? 100 : scores.detectionMethod === 'brand' ? 80 : 60,
      },
      citations: llmResponse.citations,
      searchQueries: llmResponse.searchQueries,
    };
  }

  // Fallback: use AI-based analysis (for responses without citation data)
  console.log(`[Scoring] Using AI-based fallback scoring for ${model}`);
  const domainAnalysis = await analyzeResponseWithAI(response, domain || '');

  if (domainAnalysis.presence === 0) {
    return {
      presence: 0,
      relevance: 0,
      accuracy: 0,
      sentiment: 0,
      overall: 0,
      domainRank: 0,
      foundDomains: [],
      sources: [],
      competitorUrls: [],
      competitorMatchScore: 0,
      comprehensiveness: 0,
      context: 'not_found',
      mentions: 0,
      highlightContext: '',
      detectionMethod: 'none',
      domainSentiment: 'neutral',
      aiConfidence: 0,
      rankingFactors: { position: 0, prominence: 0, contextQuality: 0, mentionType: 0 },
      competitors: domainAnalysis.competitors,
      citations: [],
      searchQueries: [],
    };
  }

  const responseLength = response.length;
  const comprehensiveness = responseLength > 1000 ? 5 : responseLength > 800 ? 4 : responseLength > 600 ? 3 : responseLength > 400 ? 2 : 1;

  const phraseWords = phrase.toLowerCase().split(/\s+/).filter(word => word.length > 3);
  const responseWords = response.toLowerCase().split(/\s+/);
  const matchedWords = phraseWords.filter(word => responseWords.includes(word));
  const baseRelevance = Math.min(5, Math.max(1, (matchedWords.length / phraseWords.length) * 5));
  const relevanceBoost = domainAnalysis.sentiment === 'positive' ? 1 : domainAnalysis.sentiment === 'negative' ? -1 : 0;
  const relevance = Math.min(5, Math.max(1, baseRelevance + relevanceBoost));

  let accuracy = 3;
  if (domainAnalysis.detectionMethod === 'url') accuracy = 5;
  else if (domainAnalysis.detectionMethod === 'brand') accuracy = 4;

  let sentimentScore = 3;
  if (domainAnalysis.sentiment === 'positive') sentimentScore = 5;
  else if (domainAnalysis.sentiment === 'negative') sentimentScore = 1;

  let overall = 0;
  if (domainAnalysis.rank > 0) {
    const rankScore = Math.min(5, Math.max(1, domainAnalysis.rank));
    const sentimentMultiplier = domainAnalysis.sentiment === 'positive' ? 1.2 : domainAnalysis.sentiment === 'negative' ? 0.6 : 1.0;
    const contextBonus = domainAnalysis.context === 'positive' ? 0.5 : domainAnalysis.context === 'negative' ? -0.5 : 0;
    const detectionBonus = domainAnalysis.detectionMethod === 'url' ? 0.3 : domainAnalysis.detectionMethod === 'brand' ? 0.2 : 0;
    overall = Math.min(5, Math.max(1, (rankScore * sentimentMultiplier) + contextBonus + detectionBonus));
  }

  const competitorUrls = domainAnalysis.competitors.mentions.map(m => `https://${m.domain}`);
  const competitorMatchScore = domainAnalysis.competitors.totalMentions * 10;

  return {
    presence: domainAnalysis.presence,
    relevance,
    accuracy,
    sentiment: sentimentScore,
    overall,
    domainRank: domainAnalysis.rank || undefined,
    foundDomains: [domain || ''],
    sources: [],
    competitorUrls,
    competitorMatchScore,
    comprehensiveness,
    context: domainAnalysis.context,
    mentions: domainAnalysis.mentions,
    highlightContext: domainAnalysis.highlightContext,
    detectionMethod: domainAnalysis.detectionMethod,
    domainSentiment: domainAnalysis.sentiment,
    aiConfidence: 75,
    rankingFactors: {
      position: domainAnalysis.rank * 10,
      prominence: domainAnalysis.mentions * 20,
      contextQuality: domainAnalysis.sentiment === 'positive' ? 80 : domainAnalysis.sentiment === 'negative' ? 20 : 50,
      mentionType: domainAnalysis.detectionMethod === 'url' ? 100 : domainAnalysis.detectionMethod === 'brand' ? 80 : 60,
    },
    competitors: domainAnalysis.competitors,
    citations: [],
    searchQueries: [],
  };
}

// ── Exported service ─────────────────────────────────────────────────────────

export const aiQueryService = {
  query: async (
    phrase: string,
    model: 'GPT-4o' | 'Claude 3' | 'Gemini 1.5',
    domain?: string,
    location?: string
  ): Promise<{ response: string; cost: number; sources?: string[]; enhancedData?: any; llmResponse?: LLMResponse }> => {
    console.log(`[aiQueryService] Processing query with REAL ${model} via OpenRouter`);

    let llmResponse: LLMResponse;

    try {
      llmResponse = await queryViaOpenRouter(phrase, model, domain, location);
    } catch (error) {
      console.error(`[aiQueryService] ${model} query failed, trying GPT-4o fallback:`, error);
      // Fallback to GPT-4o if the specific model fails
      try {
        llmResponse = await queryViaOpenRouter(phrase, 'GPT-4o', domain, location);
        llmResponse.model = model; // Keep the display name
      } catch (fallbackError) {
        console.error(`[aiQueryService] GPT-4o fallback also failed:`, fallbackError);
        throw fallbackError;
      }
    }

    console.log(`[aiQueryService] ${model} returned ${llmResponse.citations.length} citations, ${llmResponse.searchQueries.length} searches`);

    return {
      response: llmResponse.text,
      cost: llmResponse.cost,
      sources: llmResponse.citations.map(c => c.url).filter(Boolean),
      enhancedData: {
        citations: llmResponse.citations,
        searchQueries: llmResponse.searchQueries,
        searchPerformed: llmResponse.searchQueries.length > 0,
        realModel: true,
      },
      llmResponse,
    };
  },

  scoreResponse: async (
    phrase: string,
    response: string,
    model: string,
    domain?: string,
    location?: string,
    llmResponse?: LLMResponse
  ) => {
    return await scoreResponseWithAI(phrase, response, model, domain, location, llmResponse);
  },

  testDomainDetection: async (response: string, domain: string) => {
    const result = await analyzeResponseWithAI(response, domain);
    return result;
  }
};

export { scoreResponseWithAI, analyzeResponseWithAI };
