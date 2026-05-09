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
  priceBand: string | null;
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
  priceBand: null,
  year: new Date().getFullYear().toString(),
};

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
    'Crawled summary of the brand\'s own site:',
    (input.inferredSummary ?? input.rawText ?? '').slice(0, 3500),
    '',
    'Extract the entities a prompt generator needs to write 24 audit prompts.',
    'Be specific. Avoid generic placeholders like "businesses" or "users".',
    'Personas should be roles + scale + vertical. Use cases should be jobs-to-be-done.',
    '',
    'Return JSON:',
    '{',
    '  "category": "<canonical noun phrase, e.g. project management software>",',
    '  "vertical": "<industry tag, e.g. B2B SaaS | Fintech | Beauty | DTC>",',
    '  "personas": ["<role + scale + vertical>", "...", "..."],     // exactly 3',
    '  "useCases": ["<job-to-be-done>", "...", "..."],              // exactly 3',
    '  "constraints": ["<qualifier>", "<qualifier>", "<qualifier>"],// 2-4 items',
    '  "competitors": ["<host>", "<host>", "<host>"],               // up to 3, lowercase hosts',
    '  "priceBand": "free|freemium|paid|enterprise|null",',
    '  "year": "<current year>"',
    '}',
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

  return {
    category: typeof parsed.category === 'string' && parsed.category.trim()
      ? parsed.category.trim()
      : FALLBACK.category,
    vertical: typeof parsed.vertical === 'string' && parsed.vertical.trim() ? parsed.vertical.trim() : null,
    personas: personas.length === 3 ? personas : [...personas, ...FALLBACK.personas].slice(0, 3),
    useCases: useCases.length === 3 ? useCases : [...useCases, ...FALLBACK.useCases].slice(0, 3),
    constraints: constraints.length >= 2 ? constraints : [...constraints, ...FALLBACK.constraints].slice(0, 4),
    competitors: Array.from(competitorSet).slice(0, 5),
    priceBand: typeof parsed.priceBand === 'string' && parsed.priceBand.trim() && parsed.priceBand !== 'null'
      ? parsed.priceBand.trim()
      : null,
    year: new Date().getFullYear().toString(),
  };
}
