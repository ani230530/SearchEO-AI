import axios from 'axios';
import type { EnrichedContext } from './enrichmentService';
import type { Intent } from './types';
import type { GeneratedPrompt, IntentStage, PromptCategory } from './topicsService';

type N8nPromptGroup = 'problem_statement' | 'top_n' | 'alternatives' | 'recommendation';

interface N8nPromptResearchResponse {
  niche?: unknown;
  input?: unknown;
  total?: unknown;
  prompts?: Partial<Record<N8nPromptGroup, unknown>>;
}

interface N8nPromptResearchInput {
  brand: string;
  host: string;
  url?: string;
  niche?: string;
  context: EnrichedContext;
}

interface GroupMapItem {
  key: N8nPromptGroup;
  category: PromptCategory;
  intentStage: IntentStage;
  intent: Intent;
}

const GROUP_MAP: GroupMapItem[] = [
  {
    key: 'problem_statement',
    category: 'problem_statement',
    intentStage: 'awareness',
    intent: 'Informational',
  },
  {
    key: 'top_n',
    category: 'top_n_listicle',
    intentStage: 'consideration',
    intent: 'Informational',
  },
  {
    key: 'alternatives',
    category: 'alternatives_to_competitor',
    intentStage: 'consideration',
    intent: 'Commercial',
  },
  {
    key: 'recommendation',
    category: 'unbranded_recommendation',
    intentStage: 'decision',
    intent: 'Commercial',
  },
];

const N8N_PROMPT_RESEARCH_TIMEOUT_MS = Number(process.env.N8N_PROMPT_RESEARCH_TIMEOUT_MS) || 45000;

const trimString = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

const normalizeKey = (value: string): string =>
  value
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const compactKeyword = (value: unknown, fallback: string): string => {
  const text = trimString(value) || fallback;
  const compacted = text
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/[^a-zA-Z0-9\s&+./-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return (compacted.split(/\s+/).slice(0, 4).join(' ') || fallback).slice(0, 80);
};

const normalizeHostish = (value: string): string =>
  value
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .replace(/\.[a-z]{2,}(\.[a-z]{2,})?$/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const asPromptArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => trimString(item).replace(/^["']|["']$/g, '').trim())
    .filter((item) => item.length > 0);
};

function extractCompetitorMention(prompt: string, competitors: string[]): string | null {
  const promptKey = normalizeKey(prompt);
  for (const competitor of competitors) {
    const normalized = normalizeHostish(competitor);
    if (normalized && promptKey.includes(normalized)) return normalized.slice(0, 80);
  }

  const match = prompt.match(/\b(?:alternative(?:s)? to|instead of|similar to|like)\s+([a-z0-9][a-z0-9 .&+-]{1,60})/i);
  const raw = match?.[1]?.split(/\b(?:for|with|but|under|on|within|that)\b/i)[0];
  const normalized = raw ? normalizeHostish(raw) : '';
  return normalized ? normalized.slice(0, 80) : null;
}

function promptMentionsBrand(prompt: string, args: N8nPromptResearchInput, responseNiche: string): boolean {
  const promptKey = normalizeKey(prompt);
  const candidates = [
    args.brand,
    args.host,
    responseNiche,
  ]
    .map(normalizeHostish)
    .filter((candidate) => candidate.length >= 3);

  return candidates.some((candidate) => promptKey.includes(candidate));
}

function keywordForPrompt(group: GroupMapItem, prompt: string, args: N8nPromptResearchInput, responseNiche: string): string {
  const baseKeyword = compactKeyword(
    responseNiche || args.niche || args.context.productContext || args.context.category,
    'domain research'
  );

  if (group.key === 'alternatives') {
    const competitor = extractCompetitorMention(prompt, args.context.competitors);
    return competitor ? `${competitor} alternatives`.slice(0, 80) : `${baseKeyword} alternatives`.slice(0, 80);
  }

  if (group.key === 'problem_statement') {
    return compactKeyword(args.context.productContext || args.context.category || baseKeyword, baseKeyword);
  }

  return baseKeyword;
}

export function mapN8nPromptResearchResponse(
  response: N8nPromptResearchResponse,
  args: N8nPromptResearchInput
): GeneratedPrompt[] {
  const responseNiche = trimString(response.niche);
  const seen = new Set<string>();
  const out: GeneratedPrompt[] = [];

  for (const group of GROUP_MAP) {
    const prompts = asPromptArray(response.prompts?.[group.key]);
    for (const prompt of prompts) {
      const key = normalizeKey(prompt);
      if (!key || seen.has(key)) continue;
      seen.add(key);

      const competitorMentioned =
        group.key === 'alternatives'
          ? extractCompetitorMention(prompt, args.context.competitors)
          : null;

      out.push({
        text: prompt,
        category: group.category,
        intentStage: group.intentStage,
        isBranded: Boolean(args.url) && promptMentionsBrand(prompt, args, responseNiche),
        persona: null,
        useCase: null,
        constraint: null,
        competitorMentioned,
        keyword: keywordForPrompt(group, prompt, args, responseNiche),
        intent: group.intent,
      });
    }
  }

  return out;
}

export async function fetchN8nPromptResearchPrompts(input: N8nPromptResearchInput): Promise<GeneratedPrompt[]> {
  const webhookUrl = process.env.N8N_PROMPT_RESEARCH_WEBHOOK_URL?.trim();
  const apiKey = (process.env.N8N_PROMPT_RESEARCH_API_KEY || process.env.N8N_API_KEY || '').trim();
  const apiKeyHeader = (process.env.N8N_PROMPT_RESEARCH_API_KEY_HEADER || 'x-api-key').trim();
  if (!webhookUrl || !apiKey) return [];

  const body = input.url ? { url: input.url } : { niche: input.niche || input.context.category };
  const startedAt = Date.now();

  try {
    const response = await axios.post<N8nPromptResearchResponse>(webhookUrl, body, {
      headers: {
        'Content-Type': 'application/json',
        [apiKeyHeader]: apiKey,
      },
      timeout: N8N_PROMPT_RESEARCH_TIMEOUT_MS,
    });
    const prompts = mapN8nPromptResearchResponse(response.data, input);
    console.log(
      `[PROMPTS:n8n] fetched ${prompts.length} prompts in ${Date.now() - startedAt}ms ` +
      `via=${input.url ? 'url' : 'niche'} status=${response.status}`
    );
    return prompts;
  } catch (error: any) {
    const detail =
      error?.response?.data?.error ||
      error?.response?.data?.message ||
      error?.message ||
      'unknown error';
    console.warn(
      `[PROMPTS:n8n] prompt research failed after ${Date.now() - startedAt}ms; ` +
      `falling back to local generator: ${detail}`
    );
    return [];
  }
}
