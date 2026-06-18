/**
 * scoreService — accurate per-response scoring via a second LLM pass.
 *
 * The deterministic scorer in runService is fast and cheap, but it's blind to
 *   - brand name mentions without a URL
 *   - sentiment with negation/sarcasm
 *   - whether the response actually answered the prompt (relevance)
 *   - the brand's position in a ranked list
 *   - which factual claims were made vs hallucinated
 *
 * This module runs a single OpenRouter call (cheap model, JSON-mode) per
 * (prompt × model) pair and returns a structured score object. The runner
 * uses these numbers to overwrite the heuristic ones, so AiQueryResult
 * persists *accurate* values.
 *
 * Cost: ~$0.0001 per scored response (gpt-4o-mini @ ~700 input + ~250 output).
 */

import OpenAI from 'openai';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const APP_URL = process.env.OPENROUTER_REFERRER || 'http://localhost:3002';

const router = OPENROUTER_API_KEY
  ? new OpenAI({
      apiKey: OPENROUTER_API_KEY,
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: { 'HTTP-Referer': APP_URL, 'X-Title': 'AI Visibility Wizard / Scorer' },
    })
  : null;

const SCORER_MODEL = process.env.SCORER_MODEL || 'openai/gpt-4o-mini';
const SCORER_TIMEOUT_MS = Number(process.env.SCORER_TIMEOUT_MS ?? 15_000);
const FAST_SCORER_ENABLED = process.env.FAST_SCORER_ENABLED !== 'false';

export interface ScoreInput {
  prompt: string;
  response: string;
  brand: {
    name: string | null;          // e.g. "Bajaj Finserv"
    aliases: string[];             // ["BFL", "Bajaj"]
    host: string;                  // "bajajfinserv.in"
  };
  competitors: Array<{ name: string | null; host: string }>;
  /** Optional grounding facts (from crawl) so the scorer can flag inaccuracies. */
  brandFacts: string;
}

export interface ScoreOutput {
  /** 0 or 1 — was the brand mentioned by name OR url? */
  presence: number;
  /**
   * 0..10 — did the response actually answer the user's question?
   * Always meaningful: a great answer that doesn't mention the brand still
   * gets a high relevance score (separates "AI didn't answer" from
   * "AI answered well but ignored my brand").
   */
  relevance: number;
  /**
   * -10..10 sentiment TOWARD THE BRAND. NULL when presence=0 — there's no
   * sentiment to measure if the brand wasn't mentioned. Front-end shows
   * "Not mentioned" instead of a fake Neutral/Negative badge.
   */
  sentiment: number | null;
  /**
   * 0..10 visibility-weighted composite. ALWAYS 0 when presence=0 — overall
   * means "AI visibility for this query"; absence means zero visibility.
   */
  overall: number;
  /**
   * 0..10 factual accuracy of claims about the brand (cross-checked against
   * crawl context). NULL when presence=0 — no claims to verify.
   */
  accuracy: number | null;
  /** Position in any ranked list (1-based); null if not in a list. */
  rankPosition: number | null;
  /** Whether the brand is present in a list at all. */
  inRankedList: boolean;
  /** One-sentence summary of the brand mention's tone & content. */
  summary: string;
  /** Per-competitor mentions discovered in this response. */
  competitorMentions: Array<{
    name: string;
    host: string | null;
    /** -10..10 sentiment toward this competitor; null if just named without commentary. */
    sentiment: number | null;
    /** 1-based rank in any ordered list; null if not in a list. */
    rankPosition: number | null;
    mentionCount: number;
  }>;
  /** Citations classified as direct (model-supplied url/markdown link) or indirect (referenced by name only). */
  citationsClassified: Array<{
    url: string | null;
    title: string | null;
    host: string | null;
    type: 'direct' | 'indirect';
  }>;
  /** Brief factual claims about the brand (each true/false/uncertain vs brandFacts). */
  factualClaims: Array<{ claim: string; verdict: 'true' | 'false' | 'uncertain' }>;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeTerm(value: string | null | undefined): string {
  return String(value ?? '')
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/.*$/, '')
    .trim()
    .toLowerCase();
}

function compactText(value: string | null | undefined): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function textHasTerm(text: string, term: string): boolean {
  const cleaned = normalizeTerm(term);
  if (cleaned.length < 3) return false;
  if (cleaned.includes('.')) return text.includes(cleaned);
  return new RegExp(`\\b${escapeRegExp(cleaned)}\\b`, 'i').test(text);
}

function likelyNeedsSemanticScoring(text: string): boolean {
  return (
    /\b(vs|versus|compare|comparison|alternative|alternatives|competitor|competitors|rank|ranking|top|best|leading|recommend|recommended)\b/i.test(text) ||
    /(?:^|\n)\s*(?:\d+[\).]|[-*])\s+\S+/.test(text)
  );
}

export function shouldUseLlmScorer(input: ScoreInput): boolean {
  if (!FAST_SCORER_ENABLED) return true;
  const response = input.response.trim();
  if (!response) return false;
  const lower = response.toLowerCase();

  const brandTerms = [input.brand.host, input.brand.name, ...input.brand.aliases]
    .map(compactText)
    .filter(Boolean);
  if (brandTerms.some((term) => textHasTerm(lower, term))) return true;

  const competitorTerms = input.competitors.flatMap((competitor) => [competitor.host, competitor.name])
    .map(compactText)
    .filter(Boolean);
  if (competitorTerms.some((term) => textHasTerm(lower, term))) return true;

  return likelyNeedsSemanticScoring(response);
}

/**
 * Score one response. If OPENROUTER_API_KEY is missing or the call fails,
 * returns null and the caller should fall back to the heuristic scorer.
 */
export async function scoreResponse(input: ScoreInput): Promise<ScoreOutput | null> {
  if (!router) return null;
  if (!input.response.trim()) return null;
  if (!shouldUseLlmScorer(input)) return null;

  const competitorBlock = input.competitors.length
    ? input.competitors.map((c) => `  - ${c.name ?? c.host} (${c.host})`).join('\n')
    : '  (none yet — surface any other companies you spot in the response)';

  const aliasBlock = [input.brand.name, ...input.brand.aliases].filter(Boolean).join(' / ') || input.brand.host;

  const userPrompt = [
    `## Target brand`,
    `Name: ${input.brand.name ?? input.brand.host}`,
    `Aliases: ${aliasBlock}`,
    `Domain: ${input.brand.host}`,
    '',
    `## Known competitors (use both name and host to detect mentions; flag any new ones the response brings up)`,
    competitorBlock,
    '',
    `## Brand facts`,
    input.brandFacts ? input.brandFacts.slice(0, 700) : '(none)',
    '',
    `## User asked the AI`,
    input.prompt,
    '',
    `## AI's response`,
    input.response.slice(0, 2600),
    '',
    `## Your task`,
    `Score strictly. Hard rules:`,
    `- presence=1 ONLY if the brand is explicitly named (by name, alias, or domain). Never inferred.`,
    `- relevance: 0..10 answer quality, independent of presence.`,
    `- sentiment/accuracy are null if presence=0.`,
    `- overall is 0 if presence=0.`,
    `- rankPosition is the brand's 1-based position in an ordered list, else null.`,
    `- competitorMentions: known or newly mentioned companies only; max 8.`,
    `- citationsClassified: explicit URLs/sources only; max 5.`,
    `- factualClaims: only claims about the target brand; max 3; empty if presence=0.`,
    '',
    `Return strict JSON, no prose:`,
    `{`,
    `  "presence": 0|1,`,
    `  "relevance": 0..10,`,
    `  "sentiment": -10..10 | null,`,
    `  "overall": 0..10,`,
    `  "accuracy": 0..10 | null,`,
    `  "rankPosition": null | <1-based int>,`,
    `  "inRankedList": true|false,`,
    `  "summary": "one short sentence",`,
    `  "competitorMentions": [{ "name": string, "host": null|string, "sentiment": -10..10|null, "rankPosition": null|int, "mentionCount": int }],`,
    `  "citationsClassified": [{ "url": null|string, "title": null|string, "host": null|string, "type": "direct"|"indirect" }],`,
    `  "factualClaims": [{ "claim": string, "verdict": "true"|"false"|"uncertain" }]`,
    `}`,
  ].join('\n');

  let parsed: any = null;
  try {
    const completion = await Promise.race([
      router.chat.completions.create({
        model: SCORER_MODEL,
        messages: [
          {
            role: 'system',
            content:
              'You are a precise scorer for AI-search visibility analysis. ' +
              'Output strict JSON only. Be honest about uncertainty. ' +
              'Never invent companies that the response did not mention. ' +
              'Never claim "presence: 1" if the brand is not actually in the response.',
          },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.0,
        max_tokens: 650,
      }),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('scorer timeout')), SCORER_TIMEOUT_MS)),
    ]);
    const text = completion.choices[0]?.message?.content ?? '';
    parsed = JSON.parse(text);
  } catch {
    return null;
  }

  // Defensive normalization — the LLM is generally compliant but we don't
  // trust outputs verbatim; clamp every numeric range and validate strings.
  const clamp = (n: unknown, min: number, max: number, fallback = 0) => {
    const num = typeof n === 'number' ? n : Number(n);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(min, Math.min(max, num));
  };

  const presence = clamp(parsed.presence, 0, 1) ? 1 : 0;
  // Enforce the "no presence → no sentiment/accuracy/overall" rule on the
  // server side too, so even if the model violates the spec we don't leak
  // misleading numbers to the dashboard.
  const sentiment = presence === 1 && parsed.sentiment !== null && parsed.sentiment !== undefined
    ? clamp(parsed.sentiment, -10, 10)
    : null;
  const accuracy = presence === 1 && parsed.accuracy !== null && parsed.accuracy !== undefined
    ? clamp(parsed.accuracy, 0, 10)
    : null;
  const overall = presence === 1 ? clamp(parsed.overall, 0, 10) : 0;

  const out: ScoreOutput = {
    presence,
    relevance: clamp(parsed.relevance, 0, 10),
    sentiment,
    overall,
    accuracy,
    rankPosition: typeof parsed.rankPosition === 'number' && parsed.rankPosition > 0
      ? Math.floor(parsed.rankPosition)
      : null,
    inRankedList: Boolean(parsed.inRankedList),
    summary: typeof parsed.summary === 'string' ? parsed.summary.slice(0, 240) : '',
    competitorMentions: Array.isArray(parsed.competitorMentions)
      ? parsed.competitorMentions
          .map((c: any) => ({
            name: typeof c?.name === 'string' ? c.name.trim().slice(0, 100) : '',
            host: typeof c?.host === 'string' && c.host.trim() ? c.host.trim().toLowerCase().replace(/^www\./, '') : null,
            sentiment: c?.sentiment === null || c?.sentiment === undefined ? null : clamp(c.sentiment, -10, 10),
            rankPosition: typeof c?.rankPosition === 'number' && c.rankPosition > 0 ? Math.floor(c.rankPosition) : null,
            mentionCount: clamp(c?.mentionCount, 0, 50, 1),
          }))
          .filter((c: any) => c.name.length > 0)
      : [],
    citationsClassified: Array.isArray(parsed.citationsClassified)
      ? parsed.citationsClassified.map((c: any) => ({
          url: typeof c?.url === 'string' ? c.url.trim() : null,
          title: typeof c?.title === 'string' ? c.title.trim().slice(0, 200) : null,
          host: typeof c?.host === 'string' ? c.host.trim().toLowerCase().replace(/^www\./, '') : null,
          type: c?.type === 'direct' ? 'direct' : 'indirect',
        }))
      : [],
    factualClaims: Array.isArray(parsed.factualClaims)
      ? parsed.factualClaims
          .map((c: any) => ({
            claim: typeof c?.claim === 'string' ? c.claim.trim().slice(0, 300) : '',
            verdict: c?.verdict === 'true' || c?.verdict === 'false' ? c.verdict : 'uncertain',
          }))
          .filter((c: any) => c.claim.length > 0)
      : [],
  };
  return out;
}
