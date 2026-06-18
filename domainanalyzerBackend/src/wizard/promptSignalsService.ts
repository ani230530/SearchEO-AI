import axios from 'axios';
import type { EnrichedContext } from './enrichmentService';

export type PromptSignalSource = 'serper_organic' | 'serper_people_also_ask' | 'serper_related_search' | 'domain_context';

export interface PromptSeedSignal {
  id: number;
  source: PromptSignalSource;
  query: string;
  title: string;
  snippet: string;
  host: string | null;
  link: string | null;
}

export interface CollectPromptSignalsInput {
  brand: string;
  host: string;
  context: EnrichedContext;
  limit?: number;
}

interface SerperOrganicResult {
  title?: string;
  link?: string;
  snippet?: string;
  date?: string;
  position?: number;
}

interface SerperPeopleAlsoAskResult {
  question?: string;
  title?: string;
  link?: string;
  snippet?: string;
}

interface SerperRelatedSearch {
  query?: string;
}

interface SerperResponse {
  organic?: SerperOrganicResult[];
  peopleAlsoAsk?: SerperPeopleAlsoAskResult[];
  relatedSearches?: SerperRelatedSearch[];
}

const SERPER_ENDPOINT = 'https://google.serper.dev/search';
const SERPER_TIMEOUT_MS = 6500;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const cache = new Map<string, { expiresAt: number; signals: PromptSeedSignal[] }>();

function compactText(value: string | null | undefined, maxWords = 8): string {
  const cleaned = String(value ?? '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[^\w\s&+./-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  return cleaned.split(/\s+/).slice(0, maxWords).join(' ');
}

function quote(value: string): string {
  const cleaned = value.replace(/"/g, '').trim();
  return cleaned ? `"${cleaned}"` : '';
}

function hostFromUrl(link: string | null | undefined): string | null {
  try {
    return new URL(String(link)).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function dedupeSignals(signals: PromptSeedSignal[], limit: number): PromptSeedSignal[] {
  const seen = new Set<string>();
  const out: PromptSeedSignal[] = [];
  for (const signal of signals) {
    const key = normalize(`${signal.title} ${signal.snippet}`).slice(0, 180) || signal.link || signal.query;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ ...signal, id: out.length + 1 });
    if (out.length >= limit) break;
  }
  return out;
}

function buildFallbackSignals(input: CollectPromptSignalsInput, limit: number): PromptSeedSignal[] {
  const category = compactText(input.context.category, 8) || 'this category';
  const productContext = compactText(input.context.productContext, 8) || category;
  const vertical = compactText(input.context.vertical, 6);
  const competitors = input.context.competitors.slice(0, 3).map((c) => compactText(c, 4)).filter(Boolean);
  const personas = input.context.personas.slice(0, 3).map((p) => compactText(p, 4)).filter(Boolean);
  const useCases = input.context.useCases.slice(0, 3).map((u) => compactText(u, 7)).filter(Boolean);
  const constraints = input.context.constraints.slice(0, 3).map((c) => compactText(c, 7)).filter(Boolean);

  const rows = [
    {
      title: `People compare ${category} options before buying`,
      snippet: `Common buyer language should mention ${productContext}, ${competitors[0] ? `${competitors[0]}, alternatives, ` : ''}pricing, fit, and whether the result is worth paying for.`,
    },
    {
      title: `Customers ask messy first-person questions`,
      snippet: `Useful prompts sound like "I'm looking for..." or "what are people using..." rather than polished category keywords.`,
    },
    {
      title: `${personas[0] || 'Teams'} care about workflow and fit`,
      snippet: `Prompts should include practical constraints like ${constraints[0] || 'budget'}, ${productContext || useCases[0] || 'daily workflow'}, and team or stakeholder pressure.`,
    },
    {
      title: `Short questions still matter`,
      snippet: `Not every real prompt is long. Buyers also ask terse questions like "worth it?" or "any cheaper options?"`,
    },
    {
      title: `Comparison intent is commercially useful`,
      snippet: competitors.length > 1
        ? `${competitors[0]} vs ${competitors[1]} style prompts reveal which alternatives AI systems recommend.`
        : `Comparison prompts reveal which alternatives AI systems recommend.`,
    },
    {
      title: `Long prompts carry context`,
      snippet: `A realistic long prompt names the current workflow, pain point, budget concern, and what the user needs next${vertical ? ` in ${vertical}` : ''}.`,
    },
  ];

  return rows.slice(0, limit).map((row, index) => ({
    id: index + 1,
    source: 'domain_context',
    query: 'domain context fallback',
    title: row.title,
    snippet: row.snippet,
    host: input.host,
    link: null,
  }));
}

export function buildSerperQueries(input: CollectPromptSignalsInput): string[] {
  const category = compactText(input.context.category, 7) || 'best tools';
  const categoryShort = compactText(input.context.category, 4) || category;
  const productContext = compactText(input.context.productContext, 7) || categoryShort;
  const vertical = compactText(input.context.vertical, 5);
  const useCase = compactText(input.context.useCases[0], 6);
  const persona = compactText(input.context.personas[0], 4);
  const competitor = compactText(input.context.competitors[0], 4);
  const secondCompetitor = compactText(input.context.competitors[1], 4);

  const queries = [
    `site:reddit.com ${category} tools pricing`,
    `site:reddit.com ${productContext} tools pricing`,
    `site:reddit.com ${quote(categoryShort)} worth it`,
    `site:reddit.com ${productContext} worth it`,
    `site:reddit.com ${categoryShort} teams workflow`,
    `site:reddit.com ${productContext} manual workflow`,
    `site:reddit.com ${categoryShort} API scraping reliability`,
    `site:reddit.com ${productContext} alternatives comparison`,
  ];

  if (useCase) queries.push(`site:reddit.com ${categoryShort} ${quote(useCase)} recommendations`);
  if (persona) queries.push(`site:reddit.com ${categoryShort} ${quote(persona)} best`);
  if (vertical) queries.push(`site:reddit.com ${quote(vertical)} ${categoryShort} tools`);
  if (competitor) queries.push(`site:reddit.com ${quote(competitor)} alternatives ${categoryShort}`);
  if (competitor && secondCompetitor) queries.push(`site:reddit.com ${quote(competitor)} vs ${quote(secondCompetitor)} ${categoryShort}`);

  return Array.from(new Set(queries.map((q) => q.replace(/\s+/g, ' ').trim()).filter(Boolean))).slice(0, 8);
}

async function searchSerper(apiKey: string, query: string): Promise<PromptSeedSignal[]> {
  const response = await axios.post<SerperResponse>(
    SERPER_ENDPOINT,
    { q: query, num: 10, gl: 'us', hl: 'en' },
    {
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
      timeout: SERPER_TIMEOUT_MS,
    }
  );

  const organic = (response.data.organic ?? []).map<PromptSeedSignal>((item, index) => ({
    id: index + 1,
    source: 'serper_organic',
    query,
    title: item.title?.trim() ?? '',
    snippet: item.snippet?.trim() ?? '',
    host: hostFromUrl(item.link),
    link: item.link ?? null,
  }));

  const peopleAlsoAsk = (response.data.peopleAlsoAsk ?? []).map<PromptSeedSignal>((item, index) => ({
    id: index + 1,
    source: 'serper_people_also_ask',
    query,
    title: (item.question || item.title || '').trim(),
    snippet: item.snippet?.trim() ?? '',
    host: hostFromUrl(item.link),
    link: item.link ?? null,
  }));

  const related = (response.data.relatedSearches ?? []).map<PromptSeedSignal>((item, index) => ({
    id: index + 1,
    source: 'serper_related_search',
    query,
    title: item.query?.trim() ?? '',
    snippet: '',
    host: null,
    link: null,
  }));

  return [...organic, ...peopleAlsoAsk, ...related].filter((signal) =>
    `${signal.title} ${signal.snippet}`.trim().length > 24
  );
}

export async function collectPromptSeedSignals(input: CollectPromptSignalsInput): Promise<PromptSeedSignal[]> {
  const limit = input.limit ?? 40;
  const fallback = buildFallbackSignals(input, Math.min(limit, 8));
  const apiKey = process.env.SERPER_API_KEY?.trim();
  if (!apiKey) return fallback;

  const cacheKey = normalize([
    input.context.category,
    input.context.vertical,
    input.context.useCases.slice(0, 3).join('|'),
    input.context.competitors.slice(0, 4).join('|'),
  ].join('|'));
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.signals;

  const queries = buildSerperQueries(input);
  const settled = await Promise.allSettled(queries.map((query) => searchSerper(apiKey, query)));
  const signals = dedupeSignals(
    settled.flatMap((result) => (result.status === 'fulfilled' ? result.value : [])),
    limit
  );
  const merged = signals.length >= 8 ? signals : dedupeSignals([...signals, ...fallback], limit);
  cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, signals: merged });
  return merged;
}
