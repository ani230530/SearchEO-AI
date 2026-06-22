/**
 * enrichmentService — Stage 1 of the new prompt generator.
 *
 * Single LLM call against the crawled domain context that extracts the real
 * entities the prompt generator needs:
 *
 *   - category        canonical noun phrase ("project management software")
 *   - vertical        industry tag for citation-graph awareness ("B2B SaaS")
 *   - personas[3]     real buyer roles ("Series B SaaS founder", …)
 *   - useCases[3]     job-to-be-done framings ("tracking team OKRs", …)
 *   - constraints[]   budget / scale / integration qualifiers
 *   - competitors[3]  named competitors mined from the crawl + LLM knowledge
 *   - priceBand       "free | freemium | paid | enterprise"
 *   - year            current year string for recency markers
 *
 * Without this enrichment step the generator produces generic "best CRM"
 * prompts that don't discriminate visibility (Radyant / Visiblie research).
 * With it, every prompt template gets filled with real entities the LLMs
 * are likely to have indexed — which is what produces signal.
 */

import { callJson, Models } from './llmClient';

export interface EnrichedContext {
  category: string;
  vertical: string | null;
  personas: string[];
  useCases: string[];
  constraints: string[];
  competitors: string[];
  /** Real service areas / buyer locations to use in natural local prompts. */
  locations: string[];
  priceBand: string | null;
  /** Scrape-derived plain-English topic to use inside prompts. More specific than industry/category. */
  productContext: string;
  year: string;
}

export interface EnrichInput {
  url: string;
  host: string;
  companyName: string | null;
  rawText: string;
  inferredSummary: string | null;
  inferredIndustry: string | null;
  /** User-supplied competitor hosts (from Step 3 selection) — pre-seeds the LLM. */
  knownCompetitors: string[];
  country: string | null;
  state: string | null;
}

const FALLBACK: EnrichedContext = {
  category: 'business software',
  vertical: null,
  personas: ['founder', 'product manager', 'small business owner'],
  useCases: ['daily operations', 'managing growth', 'reducing costs'],
  constraints: ['budget under $100/mo', 'team under 20 people', 'no engineering required'],
  competitors: [],
  locations: [],
  priceBand: null,
  productContext: 'daily operations',
  year: new Date().getFullYear().toString(),
};

const BROAD_INDUSTRY_RE =
  /\b(technology|it|software|business|services|consulting|hospitality|tourism|transportation|logistics|retail|consumer|healthcare|financial|education|media|entertainment|manufacturing|construction)\b/i;

function normalize(value: string | null | undefined): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function compactPhrase(value: string | null | undefined, maxWords: number): string {
  return String(value ?? '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[^\w\s&+./-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, maxWords)
    .join(' ');
}

function isBroadCategory(category: string | null | undefined, industry: string | null | undefined): boolean {
  const cleanCategory = normalize(category);
  if (!cleanCategory) return true;
  if (industry && cleanCategory === normalize(industry)) return true;
  const words = cleanCategory.split(/\s+/).filter(Boolean);
  return words.length <= 4 && BROAD_INDUSTRY_RE.test(cleanCategory);
}

export function refineCategory(input: {
  category: string | null | undefined;
  inferredIndustry: string | null | undefined;
  useCases: string[];
  summary: string | null | undefined;
}): string {
  const rawCategory = typeof input.category === 'string' ? input.category.trim() : '';
  if (rawCategory && !isBroadCategory(rawCategory, input.inferredIndustry)) return rawCategory;

  const blob = [input.summary, ...input.useCases].filter(Boolean).join(' ').toLowerCase();
  if (/\b(version control|git repositories?|source code management|code hosting)\b/.test(blob)) {
    return 'version control platform';
  }
  if (/\b(devops|ci\/cd|continuous integration|deployment pipeline)\b/.test(blob)) {
    return 'DevOps platform';
  }
  if (/\b(collaborative coding|developer collaboration|software projects?)\b/.test(blob)) {
    return 'developer collaboration platform';
  }
  if (/\b(luxury hotel|hotel|hospitality|resort)\b/.test(blob)) {
    return 'luxury hotel brand';
  }
  if (/\b(digital transformation|technology consulting|expert witness|reputation management)\b/.test(blob)) {
    return 'technology consulting firm';
  }

  const firstUseCase = input.useCases.find((item) => item && item.trim());
  if (firstUseCase) {
    const cleaned = compactPhrase(firstUseCase, 5)
      .replace(/^(using|managing|tracking|finding|providing|implementing|seeking|booking|planning)\s+/i, '')
      .replace(/\s+for\s+.+$/i, '')
      .trim();
    if (cleaned && !isBroadCategory(cleaned, input.inferredIndustry)) return cleaned;
  }

  return rawCategory || FALLBACK.category;
}

export function deriveProductContext(input: {
  category: string;
  useCases: string[];
  summary: string | null | undefined;
}): string {
  const blob = [input.summary, input.category, ...input.useCases].filter(Boolean).join(' ').toLowerCase();
  if (/\b(version control|git repositories?|source code management|code hosting|pull requests?)\b/.test(blob)) {
    return 'version control and code collaboration';
  }
  if (/\b(devops|ci\/cd|continuous integration|deployment pipeline|workflow automation)\b/.test(blob)) {
    return 'DevOps and development workflow automation';
  }
  if (/\b(collaborative coding|developer collaboration|software projects?)\b/.test(blob)) {
    return 'software project collaboration';
  }
  if (/\b(luxury hotel|hotel|hospitality|resort|venue|wedding)\b/.test(blob)) {
    return 'luxury hotel booking and guest experiences';
  }
  if (/\b(digital transformation|technology consulting|expert witness|reputation management)\b/.test(blob)) {
    return 'digital transformation consulting';
  }

  const useCase = input.useCases.find((item) => item && item.trim());
  if (useCase) return compactPhrase(useCase, 7);
  return compactPhrase(input.category, 6) || FALLBACK.productContext;
}

export async function enrichDomainContext(input: EnrichInput): Promise<EnrichedContext> {
  const profileBlock = [
    `Brand: ${input.companyName ?? input.host}`,
    `Domain: ${input.host}`,
    input.inferredIndustry ? `Industry hint: ${input.inferredIndustry}` : null,
    input.country || input.state ? `Location: ${[input.country, input.state].filter(Boolean).join(', ')}` : null,
    input.knownCompetitors.length ? `Already-known competitors: ${input.knownCompetitors.join(', ')}` : null,
  ].filter(Boolean).join('\n');

  const userPrompt = [
    profileBlock,
    '',
    'Site summary:',
    (input.inferredSummary ?? input.rawText ?? '').slice(0, 3500),
    '',
    'Extract brand profile entities.',
    'Category MUST be the specific product/service category a buyer asks about, not a broad industry label.',
    'Good category examples: "version control platform", "luxury hotel brand", "digital transformation consulting".',
    'Bad category examples: "Technology & IT", "Hospitality & Tourism", "business software".',
    'Personas: role + scale + vertical.',
    'Use cases: jobs-to-be-done.',
    'Return JSON: {category, vertical, personas[3], useCases[3], constraints[2-4], competitors[0-3], locations[0-5], priceBand, year}',
  ].join('\n');

  let parsed: Partial<EnrichedContext> & { competitors?: unknown } = {};
  try {
    parsed = await callJson<Partial<EnrichedContext>>({
      model: Models.synthesis,
      system:
        'You analyse a brand from its website crawl and output a structured profile a prompt generator can use. ' +
        'Be specific. Cite no sources. JSON only.',
      user: userPrompt,
      temperature: 0.1,
      maxTokens: 800,
    });
  } catch {
    // fall through to defaults below
  }

  const sanitizeArr = (arr: unknown, max: number, min: number): string[] => {
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
      .map((v) => v.trim().slice(0, 120))
      .slice(0, max)
      .concat([])
      .slice(0, max)
      .filter(Boolean)
      // Pad to min so generator templates always have something to substitute
      .concat([]);
  };

  const personas = sanitizeArr(parsed.personas, 3, 3);
  const useCases = sanitizeArr(parsed.useCases, 3, 3);
  const constraints = sanitizeArr(parsed.constraints, 4, 2);
  const competitorsRaw = sanitizeArr(parsed.competitors, 5, 0);
  const locationsRaw = sanitizeArr((parsed as { locations?: unknown }).locations, 5, 0);

  // Merge user-supplied competitors first; LLM-proposed ones as fillers.
  const competitorSet = new Set<string>();
  for (const c of input.knownCompetitors) {
    const host = c.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].toLowerCase();
    if (host) competitorSet.add(host);
  }
  for (const c of competitorsRaw) {
    const host = c.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0].toLowerCase();
    if (host && host !== input.host) competitorSet.add(host);
  }

  const locations = Array.from(
    new Set(
      [
        input.state,
        input.country && !/^united states$/i.test(input.country) ? input.country : null,
        ...locationsRaw,
      ]
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        .map((value) => compactPhrase(value, 5))
        .filter(Boolean)
    )
  ).slice(0, 5);

  const category = refineCategory({
      category: typeof parsed.category === 'string' ? parsed.category : null,
      inferredIndustry: input.inferredIndustry,
      useCases,
      summary: input.inferredSummary ?? input.rawText,
    });

  return {
    category,
    vertical: typeof parsed.vertical === 'string' && parsed.vertical.trim() ? parsed.vertical.trim() : null,
    personas: personas.length === 3 ? personas : [...personas, ...FALLBACK.personas].slice(0, 3),
    useCases: useCases.length === 3 ? useCases : [...useCases, ...FALLBACK.useCases].slice(0, 3),
    constraints: constraints.length >= 2 ? constraints : [...constraints, ...FALLBACK.constraints].slice(0, 4),
    competitors: Array.from(competitorSet).slice(0, 5),
    locations,
    priceBand: typeof parsed.priceBand === 'string' && parsed.priceBand.trim() && parsed.priceBand !== 'null'
      ? parsed.priceBand.trim()
      : null,
    productContext: deriveProductContext({
      category,
      useCases: useCases.length ? useCases : FALLBACK.useCases,
      summary: input.inferredSummary ?? input.rawText,
    }),
    year: new Date().getFullYear().toString(),
  };
}
