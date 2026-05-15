/**
 * competitorInsightEnrichment — turns the per-competitor analytics rollup
 * into a Strength / Weakness / Competitive-Edge insight table via a single
 * batched LLM call.
 *
 * Same shape and caching strategy as opportunityEnrichment:
 *   - heuristic input is correct on *what* (mentions, sentiment, source mix)
 *   - LLM job is the *narrative* — what makes this competitor strong, what's
 *     their weakness, and where can the user's brand win
 *   - cached on AiRun.summary.competitorInsights so subsequent reads are free
 */

import OpenAI from 'openai';
import type { CompetitorAnalysisRow } from './analyticsService';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const APP_URL = process.env.OPENROUTER_REFERRER || 'http://localhost:3002';

const router = OPENROUTER_API_KEY
  ? new OpenAI({
      apiKey: OPENROUTER_API_KEY,
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'HTTP-Referer': APP_URL,
        'X-Title': 'AI Visibility / Competitor insight enrichment',
      },
    })
  : null;

const MODEL = 'openai/gpt-4o-mini';
const TIMEOUT_MS = 30_000;

export type InsightCategory = 'Strength' | 'Weakness' | 'Competitive Edge';
export type InsightPriority = 'high' | 'medium' | 'low';

export interface CompetitorInsight {
  category: InsightCategory;
  insight: string;
  aiPromptSource: string;
  priority: InsightPriority;
}

interface InsightEnrichmentContext {
  brandName: string;
  brandHost: string;
  industry: string | null;
  promptsById: Map<number, { text: string; category: string | null }>;
}

interface LlmInsightResponse {
  competitors?: Array<{
    host?: string;
    insights?: Array<{
      category?: string;
      insight?: string;
      aiPromptSource?: string;
      priority?: string;
    }>;
  }>;
}

/**
 * Per-host insight map. Hosts that fail enrichment fall back to a deterministic
 * heuristic insight derived from the rollup numbers.
 */
export async function enrichCompetitorInsights(
  competitors: CompetitorAnalysisRow[],
  context: InsightEnrichmentContext
): Promise<Record<string, CompetitorInsight[]>> {
  if (competitors.length === 0) return {};
  // Only enrich competitors with at least one mention — the LLM has nothing
  // to ground "Strength" / "Weakness" claims on for zero-mention rows.
  const enrichable = competitors.filter((c) => c.mentions > 0);
  if (enrichable.length === 0 || !router) {
    const out: Record<string, CompetitorInsight[]> = {};
    for (const c of competitors) out[c.host] = heuristicInsights(c);
    return out;
  }

  const userPrompt = buildPrompt(enrichable, context);
  let parsed: LlmInsightResponse | null = null;

  try {
    const completion = await Promise.race([
      router.chat.completions.create({
        model: MODEL,
        messages: [
          {
            role: 'system',
            content:
              'You are a competitive intelligence analyst for an AI search visibility tool. Your job: given mention/sentiment/source-type stats for each competitor in AI responses, produce specific Strength / Weakness / Competitive-Edge insights the user can act on. Output strict JSON only — no preamble. Be concrete, never generic.',
          },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.4,
        max_tokens: 4500,
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('insight enrichment timeout')), TIMEOUT_MS)),
    ]);
    const text = completion.choices[0]?.message?.content ?? '';
    parsed = JSON.parse(text) as LlmInsightResponse;
  } catch {
    const out: Record<string, CompetitorInsight[]> = {};
    for (const c of competitors) out[c.host] = heuristicInsights(c);
    return out;
  }

  const byHost = new Map<string, NonNullable<LlmInsightResponse['competitors']>[number]>();
  for (const c of parsed?.competitors ?? []) {
    if (typeof c?.host === 'string') byHost.set(c.host.toLowerCase(), c);
  }

  const out: Record<string, CompetitorInsight[]> = {};
  for (const c of competitors) {
    const e = byHost.get(c.host);
    if (!e || !Array.isArray(e.insights) || e.insights.length === 0) {
      out[c.host] = heuristicInsights(c);
      continue;
    }
    const cleaned: CompetitorInsight[] = [];
    for (const raw of e.insights) {
      const category = sanitizeCategory(raw?.category);
      const insight = typeof raw?.insight === 'string' ? raw.insight.trim().slice(0, 200) : '';
      const aiPromptSource = typeof raw?.aiPromptSource === 'string' ? raw.aiPromptSource.trim().slice(0, 200) : '';
      const priority = sanitizePriority(raw?.priority);
      if (!insight) continue;
      cleaned.push({ category, insight, aiPromptSource, priority });
    }
    out[c.host] = cleaned.length > 0 ? cleaned.slice(0, 9) : heuristicInsights(c);
  }
  return out;
}

function buildPrompt(competitors: CompetitorAnalysisRow[], ctx: InsightEnrichmentContext): string {
  const blocks = competitors.map((c, i) => {
    const examplePrompts = c.examplePromptIds
      .map((pid) => ctx.promptsById.get(pid))
      .filter((p): p is NonNullable<typeof p> => Boolean(p))
      .slice(0, 4)
      .map((p, j) => `      ${j + 1}. "${p.text}"${p.category ? ` [category: ${p.category}]` : ''}`)
      .join('\n');
    const sourceMix = c.topCitedSourceTypes.map((s) => `${s.type} (${s.count})`).join(', ') || '(none)';
    return [
      `${i + 1}) competitor`,
      `   host:           ${c.host}`,
      `   industry:       ${c.industry ?? '(unknown)'}`,
      `   threatLevel:    ${c.threatLevel ?? '(unknown)'}`,
      `   rank:           ${c.rank ?? '(none)'}`,
      `   mentions:       ${c.mentions}`,
      `   promptCoverage: ${c.promptCoverage} of ${ctx.promptsById.size} prompts`,
      `   marketShare:    ${(c.marketShare * 100).toFixed(0)}%`,
      `   avgSentiment:   ${c.avgSentiment ?? 'n/a'} (raw -10..10)`,
      `   avgRank:        ${c.avgRankPosition ?? 'n/a'}`,
      `   strongestCluster: ${c.strongestPromptCluster ? `${c.strongestPromptCluster.category} (${c.strongestPromptCluster.count} mentions)` : '(none)'}`,
      `   topCitedSourceTypes: ${sourceMix}`,
      `   exemplar prompts where they appear:`,
      examplePrompts || '      (none)',
    ].join('\n');
  }).join('\n\n');

  return [
    `## User brand`,
    `Name: ${ctx.brandName}`,
    `Domain: ${ctx.brandHost}`,
    `Industry: ${ctx.industry ?? 'unspecified'}`,
    '',
    `## Competitors to analyze (${competitors.length})`,
    blocks,
    '',
    `## Your task`,
    `For EACH competitor above, produce 6-9 insights total split across these three categories:`,
    `  - "Strength":         what the competitor does well in AI answers, evidenced by the supplied numbers/prompts`,
    `  - "Weakness":         where the competitor underperforms or shows poor sentiment / narrow source mix`,
    `  - "Competitive Edge": what the user's brand (${ctx.brandName}) should do to outflank this competitor — be specific`,
    '',
    `Each insight has:`,
    `  - insight: ONE concrete sentence (no fluff). Reference real numbers ("cited in 7 of 12 prompts on pricing") when possible.`,
    `  - aiPromptSource: a representative prompt question from the exemplar list above that supports this insight (verbatim, can shorten).`,
    `  - priority: "high" | "medium" | "low" — how urgent is it for the user to act on this.`,
    `  - category: exactly one of "Strength", "Weakness", "Competitive Edge".`,
    '',
    `Hard rules:`,
    `- Use the exact "host" string from above so we can match.`,
    `- Never invent stats not in the supplied data.`,
    `- If a competitor has 0 mentions, skip it (don't emit insights about it).`,
    `- Distribute insights across all three categories per competitor — don't return only Strengths.`,
    '',
    `Return JSON exactly:`,
    `{ "competitors": [ { "host": "...", "insights": [ { "category": "...", "insight": "...", "aiPromptSource": "...", "priority": "..." } ] } ] }`,
  ].join('\n');
}

// ── Heuristic fallback ─────────────────────────────────────────────────────

function heuristicInsights(c: CompetitorAnalysisRow): CompetitorInsight[] {
  const out: CompetitorInsight[] = [];
  if (c.mentions === 0) return out;

  // One strength: highest signal (mentions OR source mix).
  if (c.mentions > 0) {
    out.push({
      category: 'Strength',
      insight: `Mentioned in ${c.promptCoverage} prompt${c.promptCoverage === 1 ? '' : 's'} with ${(c.marketShare * 100).toFixed(0)}% share of competitor voice.`,
      aiPromptSource: '',
      priority: c.marketShare > 0.25 ? 'high' : 'medium',
    });
  }
  if (c.strongestPromptCluster) {
    out.push({
      category: 'Strength',
      insight: `Dominates ${c.strongestPromptCluster.category.replace(/_/g, ' ')} prompts with ${c.strongestPromptCluster.count} mentions.`,
      aiPromptSource: '',
      priority: 'medium',
    });
  }

  // One weakness: if sentiment is below 0 or narrow source coverage.
  if (c.avgSentiment !== null && c.avgSentiment < 0) {
    out.push({
      category: 'Weakness',
      insight: `Average sentiment is ${c.avgSentiment.toFixed(1)} (out of -10..10) — AI responses describe them in a less favorable light.`,
      aiPromptSource: '',
      priority: 'high',
    });
  } else {
    out.push({
      category: 'Weakness',
      insight: c.topCitedSourceTypes.length <= 1
        ? `Narrow citation footprint — sources come from only ${c.topCitedSourceTypes[0]?.type ?? 'one'} type of page.`
        : `Coverage is concentrated; not yet appearing on ${Math.max(0, 12 - c.promptCoverage)} of the prompts we tracked.`,
      aiPromptSource: '',
      priority: 'medium',
    });
  }

  // One competitive edge.
  if (c.strongestPromptCluster) {
    out.push({
      category: 'Competitive Edge',
      insight: `Publish original research and case studies on ${c.strongestPromptCluster.category.replace(/_/g, ' ')} to challenge them on their strongest cluster.`,
      aiPromptSource: '',
      priority: c.marketShare > 0.2 ? 'high' : 'medium',
    });
  } else {
    out.push({
      category: 'Competitive Edge',
      insight: `Earn citations from authoritative third-party sources to crowd them out of AI answers.`,
      aiPromptSource: '',
      priority: 'medium',
    });
  }

  return out;
}

function sanitizeCategory(raw: unknown): InsightCategory {
  if (typeof raw !== 'string') return 'Strength';
  const v = raw.trim().toLowerCase();
  if (v.startsWith('weak')) return 'Weakness';
  if (v.startsWith('comp') || v.includes('edge')) return 'Competitive Edge';
  return 'Strength';
}

function sanitizePriority(raw: unknown): InsightPriority {
  if (typeof raw !== 'string') return 'medium';
  const v = raw.trim().toLowerCase();
  if (v.startsWith('high')) return 'high';
  if (v.startsWith('low')) return 'low';
  return 'medium';
}
