/**
 * opportunityEnrichment — turns the heuristic OutrankOpportunity[] into
 * production-grade action items via a single batched LLM call.
 *
 * Why a separate pass:
 *   - The heuristic in analyticsService is *cheap* and *correct* about the
 *     gap shape (severity bin, traffic bucket, who's mentioned vs not).
 *   - But the heuristic titles are templated ("Build a comprehensive guide
 *     on X") — fine, but not specific enough to act on.
 *   - We want the title, rationale, recommendedAngle, and a real content
 *     brief (audience / tone / structure / key points) — that's an LLM job.
 *
 * Cost: one OpenRouter call per AiRun. ~12 opportunities × small payload.
 * gpt-4o-mini @ $0.15 / $0.60 per M tokens → ~$0.005-0.01 per run.
 *
 * Cached: the enriched output is written to AiRun.summary.opportunities so
 * /report calls never re-hit the LLM after the first time. Subsequent loads
 * just read the cached payload.
 */

import type { OutrankOpportunity } from './analyticsService';
import { callOpenRouterChat, isOpenRouterConfigured } from '../services/openRouterClient';

const MODEL = 'openai/gpt-4o-mini';
const TIMEOUT_MS = 30_000;

export interface OpportunityBrief {
  /** Who the content is being written for (specific persona, not generic). */
  audience: string;
  /** "Authoritative" | "Helpful" | "Conversational" | "Technical" — drives n8n's tone field. */
  tone: 'Authoritative' | 'Helpful' | 'Conversational' | 'Technical';
  /** Recommended structure ("FAQ", "Listicle", "Comparison table", "How-to guide", etc.). */
  structure: string;
  /** 4-7 bullet points the content MUST cover. */
  keyPoints: string[];
  /** Suggested word count. */
  wordCount: number;
  /** One-sentence call-to-action concept. */
  cta: string;
}

export interface EnrichedOpportunity extends OutrankOpportunity {
  /** Specific, action-oriented title (replaces the heuristic templated one). */
  title: string;
  /** One-sentence rationale grounded in the actual prompts + competitors. */
  rationale: string;
  /**
   * What to actually say differently — the *angle* this content should take
   * to win against the named competitors. 1-2 sentences.
   */
  recommendedAngle: string;
  /** Full content brief used by the worksheet → n8n payload. */
  brief: OpportunityBrief;
}

interface EnrichmentContext {
  brandName: string;
  brandHost: string;
  industry: string | null;
  brandSummary: string | null;
  /** prompt id → { text, persona, useCase, category } for the LLM to ground titles in. */
  promptsById: Map<number, { text: string; persona: string | null; useCase: string | null; category: string | null }>;
}

interface LlmEnrichmentResponse {
  enriched?: Array<{
    key?: string;
    title?: string;
    rationale?: string;
    recommendedAngle?: string;
    audience?: string;
    tone?: string;
    structure?: string;
    keyPoints?: string[];
    wordCount?: number;
    cta?: string;
  }>;
}

/**
 * Returns enriched opportunities; falls back to the heuristic input verbatim
 * (with a default brief) if the LLM is unreachable.
 */
export async function enrichOpportunities(
  opportunities: OutrankOpportunity[],
  context: EnrichmentContext
): Promise<EnrichedOpportunity[]> {
  if (opportunities.length === 0) return [];
  if (!isOpenRouterConfigured()) return opportunities.map((o) => withDefaultBrief(o));

  const userPrompt = buildPrompt(opportunities, context);
  let parsed: LlmEnrichmentResponse | null = null;

  try {
    const completion = await callOpenRouterChat({
      payload: {
        model: MODEL,
        messages: [
          {
            role: 'system',
            content:
              'You are a content strategist for an AI search visibility tool. Your job is to turn raw "outrank competitor" signals into concrete, actionable content briefs that a marketer could hand to a writer today. Output strict JSON only — no preamble, no commentary. Be specific, never generic.',
          },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.4,
        max_tokens: 4500,
      },
      timeoutMs: TIMEOUT_MS,
      context: {
        domainHost: context.brandHost,
        feature: 'opportunity_enrichment',
        operation: 'enrich_opportunities',
        modelRequested: MODEL,
      },
    });
    const text = completion.content ?? '';
    parsed = JSON.parse(text) as LlmEnrichmentResponse;
  } catch {
    return opportunities.map((o) => withDefaultBrief(o));
  }

  type EnrichedItem = NonNullable<LlmEnrichmentResponse['enriched']>[number];
  const byKey = new Map<string, EnrichedItem>();
  for (const e of parsed?.enriched ?? []) {
    if (typeof e?.key === 'string') byKey.set(e.key, e);
  }

  return opportunities.map((o) => {
    const e = byKey.get(o.key);
    if (!e) return withDefaultBrief(o);

    const audience = typeof e.audience === 'string' && e.audience.trim().length > 0 ? e.audience.trim() : defaultAudience(o);
    const tone = sanitizeTone(e.tone);
    const structure = typeof e.structure === 'string' && e.structure.trim().length > 0 ? e.structure.trim().slice(0, 80) : defaultStructure(o);
    const keyPoints = Array.isArray(e.keyPoints)
      ? e.keyPoints
          .filter((p: unknown): p is string => typeof p === 'string' && p.trim().length > 0)
          .map((p: string) => p.trim().slice(0, 240))
          .slice(0, 7)
      : [];
    const wordCount = typeof e.wordCount === 'number' && e.wordCount > 0 ? Math.min(3000, Math.max(400, Math.round(e.wordCount))) : defaultWordCount(o);
    const cta = typeof e.cta === 'string' && e.cta.trim().length > 0 ? e.cta.trim().slice(0, 200) : defaultCta(o);

    return {
      ...o,
      title: typeof e.title === 'string' && e.title.trim().length > 0 ? e.title.trim().slice(0, 120) : o.title,
      rationale: typeof e.rationale === 'string' && e.rationale.trim().length > 0 ? e.rationale.trim().slice(0, 400) : o.rationale,
      recommendedAngle:
        typeof e.recommendedAngle === 'string' && e.recommendedAngle.trim().length > 0
          ? e.recommendedAngle.trim().slice(0, 400)
          : defaultAngle(o),
      brief: { audience, tone, structure, keyPoints, wordCount, cta },
    };
  });
}

// ── Prompt building ────────────────────────────────────────────────────────

function buildPrompt(opportunities: OutrankOpportunity[], ctx: EnrichmentContext): string {
  const oppBlock = opportunities
    .map((o, i) => {
      const examplePrompts = o.promptIds
        .map((pid) => ctx.promptsById.get(pid))
        .filter((p): p is NonNullable<typeof p> => Boolean(p))
        .slice(0, 3)
        .map((p, j) => `      ${j + 1}. "${p.text}"${p.persona ? ` [persona: ${p.persona}]` : ''}${p.useCase ? ` [use case: ${p.useCase}]` : ''}`)
        .join('\n');
      return [
        `${i + 1}) opportunity`,
        `   key:        ${o.key}`,
        `   type:       ${o.type}`,
        `   severity:   ${o.severity}`,
        `   trafficPotential: ${o.trafficPotential}`,
        `   keyword:    ${o.keyword ?? '(none)'}`,
        `   competitors: ${o.competitors.join(', ') || '(none)'}`,
        `   intentStage: ${o.intentStage ?? '(unspecified)'}`,
        `   category:   ${o.category ?? '(unspecified)'}`,
        `   suggestedTemplate: ${o.suggestedTemplate}`,
        `   raw heuristic title: ${o.title}`,
        `   raw heuristic rationale: ${o.rationale}`,
        `   underlying prompts (showing up to 3):`,
        examplePrompts || '      (none)',
      ].join('\n');
    })
    .join('\n\n');

  return [
    `## Brand`,
    `Name: ${ctx.brandName}`,
    `Domain: ${ctx.brandHost}`,
    `Industry: ${ctx.industry ?? 'unspecified'}`,
    ctx.brandSummary ? `Summary:\n${ctx.brandSummary.slice(0, 800)}` : '',
    '',
    `## Opportunities to enrich (${opportunities.length})`,
    oppBlock,
    '',
    `## Your task`,
    `For each opportunity above, produce:`,
    `  - title: imperative, 6-12 words, names the actual format (e.g. "Publish a Stripe vs Adyen pricing comparison" not "Build content"). Refer to ACTUAL competitors and ACTUAL keyword from the data.`,
    `  - rationale: ONE sentence explaining the gap, grounded in the supplied prompts/competitors. Don't restate the keyword — explain what's missing.`,
    `  - recommendedAngle: 1-2 sentences on how this content should win — what differentiated POV / proof point should it lead with. Reference how competitors are positioning IF visible from the prompts.`,
    `  - audience: a specific persona, e.g. "Mid-market product managers evaluating identity verification". Pull from the prompts' persona/useCase fields when present.`,
    `  - tone: ONE of "Authoritative", "Helpful", "Conversational", "Technical". Default Authoritative for decision/comparison; Helpful for awareness/problem statements; Technical for developer-focused; Conversational for branded-trust.`,
    `  - structure: the actual content shape, e.g. "Comparison table + verdict", "FAQ with answer-capsules", "Step-by-step guide with screenshots", "Listicle of 7 with criteria-led ranking".`,
    `  - keyPoints: 4-6 must-cover bullet points the writer needs to hit. Be concrete; reference real competitors named above.`,
    `  - wordCount: integer between 500 and 2500, sized to the format (FAQ ~600-900, blog ~1000-1400, deep guide ~1800-2400).`,
    `  - cta: one-sentence call-to-action concept (e.g. "Book a 15-minute API walkthrough"). Tie it to the brand's actual value prop where you can.`,
    '',
    `Hard rules:`,
    `- Use the exact "key" string for each entry so we can match.`,
    `- Never invent competitors not in the supplied list.`,
    `- Never reference content/tools the brand doesn't actually have (you don't know if it does — stay generic about brand offerings).`,
    `- If signal is weak (e.g. only 1 prompt, no competitors), still produce a usable brief but keep keyPoints fewer (3-4) and rationale honest about the small sample.`,
    '',
    `Return JSON exactly: { "enriched": [ { "key": ..., "title": ..., "rationale": ..., "recommendedAngle": ..., "audience": ..., "tone": ..., "structure": ..., "keyPoints": [...], "wordCount": ..., "cta": ... } ] }`,
  ].filter(Boolean).join('\n');
}

// ── Defaults / fallbacks ───────────────────────────────────────────────────

export function withDefaultBrief(o: OutrankOpportunity): EnrichedOpportunity {
  return {
    ...o,
    recommendedAngle: defaultAngle(o),
    brief: {
      audience: defaultAudience(o),
      tone: defaultTone(o),
      structure: defaultStructure(o),
      keyPoints: [],
      wordCount: defaultWordCount(o),
      cta: defaultCta(o),
    },
  };
}

function defaultAudience(o: OutrankOpportunity): string {
  if (o.intentStage === 'awareness') return 'Buyers researching this topic for the first time';
  if (o.intentStage === 'consideration') return 'Evaluators comparing options';
  if (o.intentStage === 'decision') return 'Buyers ready to choose a vendor';
  return 'Buyers in this category';
}

function defaultTone(o: OutrankOpportunity): OpportunityBrief['tone'] {
  if (o.category === 'branded_trust') return 'Conversational';
  if (o.category === 'problem_statement') return 'Helpful';
  return 'Authoritative';
}

function defaultStructure(o: OutrankOpportunity): string {
  switch (o.type) {
    case 'topic_gap':
      return 'How-to guide with answer-capsule intro';
    case 'brand_comparison_gap':
      return 'Side-by-side comparison table with verdict';
    case 'listicle_absence':
      return 'Listicle (top 7) with criteria-led ranking';
    case 'position_downgrade':
      return 'Authoritative deep-dive with proof points';
    case 'citation_gap':
      return 'Original-research piece pitchable to the citing domain';
    case 'negative_sentiment':
      return 'Customer-evidence piece (case studies, testimonials)';
  }
}

function defaultWordCount(o: OutrankOpportunity): number {
  switch (o.type) {
    case 'topic_gap':
    case 'position_downgrade':
      return 1400;
    case 'brand_comparison_gap':
      return 1200;
    case 'listicle_absence':
      return 1100;
    case 'citation_gap':
      return 1800;
    case 'negative_sentiment':
      return 900;
  }
}

function defaultCta(o: OutrankOpportunity): string {
  if (o.intentStage === 'decision') return 'Start a free trial or book a demo';
  if (o.intentStage === 'consideration') return 'Compare side-by-side';
  return 'Read the full guide';
}

function defaultAngle(o: OutrankOpportunity): string {
  if (o.competitors.length === 0) return `Lead with proof points unique to ${o.keyword ?? 'this topic'}.`;
  const list = o.competitors.slice(0, 2).join(' and ');
  return `Position against ${list} on a clear differentiator (price, performance, integration, or support).`;
}

function sanitizeTone(raw: unknown): OpportunityBrief['tone'] {
  if (typeof raw !== 'string') return 'Authoritative';
  const v = raw.trim().toLowerCase();
  if (v.startsWith('help')) return 'Helpful';
  if (v.startsWith('conv')) return 'Conversational';
  if (v.startsWith('tech')) return 'Technical';
  return 'Authoritative';
}
