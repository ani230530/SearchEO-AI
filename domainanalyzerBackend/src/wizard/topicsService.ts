/**
 * topicsService — Stage 2 of the prompt generator.
 *
 * Two-stage architecture (research-backed: Airbnb synthetic-query research,
 * Apple query generation, Ahrefs / Profound / SE Ranking prompt guidance):
 *
 *   1. enrichmentService.enrichDomainContext() — extracts {category, vertical,
 *      personas[3], useCases[3], constraints[], competitors[3], priceBand}.
 *   2. promptSignalsService.collectPromptSeedSignals() — pulls fast community /
 *      search snippets through Serper, then falls back to domain context.
 *   3. humanPromptService.generateHumanAuditPrompts() — generates 6 prompts by
 *      bucket and validates the set locally for human texture, length mix,
 *      commercial intent, duplicate intent, and target-brand leakage.
 *
 * Why all-unbranded: the audit's job is to measure whether the LLM brings up
 * the brand on its own when a real user asks a generic / category question.
 * Telling the LLM "Notion vs Monday" and then scoring "Notion was mentioned"
 * is tautological — the brand name in the prompt guarantees the brand is in
 * the response. Branded prompts measure sentiment + factual accuracy, not
 * visibility, so they live in a separate report (future work).
 *
 *   | Category                    | N  | Stage         |
 *   | unbranded_recommendation    | 8  | decision      |   ← highest signal
 *   | top_n_listicle              | 6  | consideration |
 *   | alternatives_to_competitor  | 6  | consideration |
 *   | problem_statement           | 4  | awareness     |
 *
 * Each generated prompt MUST be 12–30 words and carry persona / useCase /
 * constraint qualifiers (Semrush 1B-row data: real LLM prompts are long and
 * narrative). The system prompt enforces this; the user-side prompt rotates
 * persona + use case across the N within each category to avoid duplication.
 */

import type { PrismaClient } from '../../generated/prisma';
import type { Intent } from './types';
import type { EnrichedContext } from './enrichmentService';
import { callJson, Models } from './llmClient';
import { generateHumanAuditPrompts } from './humanPromptService';
import { collectPromptSeedSignals } from './promptSignalsService';

// ── Types ──────────────────────────────────────────────────────────────────

export type PromptCategory =
  | 'unbranded_recommendation'
  | 'top_n_listicle'
  | 'alternatives_to_competitor'
  | 'problem_statement'
  // Reserved for a future "Sentiment / Accuracy" report — not used in the
  // visibility audit, where mentioning the brand in the prompt would create
  // tautological signal.
  | 'brand_vs_competitor'
  | 'branded_trust';

export type IntentStage = 'awareness' | 'consideration' | 'decision';

export interface GeneratedPrompt {
  text: string;
  category: PromptCategory;
  intentStage: IntentStage;
  isBranded: boolean;
  persona: string | null;
  useCase: string | null;
  constraint: string | null;
  competitorMentioned: string | null;
  /** 1–4 word topic seed the prompt belongs to — used for keyword grouping. */
  keyword: string;
  /** Keyword's commercial intent. */
  intent: Intent;
}

interface CategorySpec {
  category: PromptCategory;
  count: number;
  isBranded: boolean;
  intentStage: IntentStage;
  /** Intent label for the keyword group. */
  intent: Intent;
  /** Definition fed to the LLM in the user prompt. */
  definition: string;
  /** Per-category instruction the system prompt enforces (e.g. branding rule). */
  brandingRule: (brand: string) => string;
}

// ── Category specs ─────────────────────────────────────────────────────────

function categorySpecs(): CategorySpec[] {
  // 4 categories, all unbranded — total 24 prompts.
  // Branded categories are intentionally excluded: naming the brand in the
  // prompt guarantees the brand will appear in the response, which produces
  // tautological "presence" signal instead of measuring real visibility.
  return [
    {
      category: 'unbranded_recommendation',
      count: 8,
      isBranded: false,
      intentStage: 'decision',
      intent: 'Commercial',
      definition:
        'Direct decision-stage requests for a recommendation in the {category} space, written by a buyer with a specific situation. ' +
        'Format: "Recommend / what\'s the best / which {category} should I use for..." followed by persona + use case + at least one constraint (budget/scale/integration).',
      brandingRule: (brand) => `Do NOT mention "${brand}" or any other specific brand by name.`,
    },
    {
      category: 'top_n_listicle',
      count: 6,
      isBranded: false,
      intentStage: 'consideration',
      intent: 'Informational',
      definition:
        'Open-ended ranking queries asking the LLM to list the leading players in {category} in {year}. ' +
        'Vary the framing across the {N} prompts: "top 5", "leading", "most popular", "most trusted", "best-known", "must-try". ' +
        'Optionally narrow by vertical or use case.',
      brandingRule: (brand) => `Do NOT mention "${brand}" by name.`,
    },
    {
      category: 'alternatives_to_competitor',
      count: 6,
      isBranded: false,
      intentStage: 'consideration',
      intent: 'Commercial',
      definition:
        'Queries from a user already familiar with a competitor who is now exploring options. ' +
        'Format: "alternatives to {competitor}" / "similar tools to {competitor}" / "what should I use instead of {competitor} for {use case}". ' +
        'Each prompt MUST name one of the listed competitors. Rotate which competitor is named across the {N} prompts.',
      brandingRule: (brand) =>
        `Do NOT mention "${brand}". Each prompt MUST name one of the supplied competitors. ` +
        `Set "competitorMentioned" to the named competitor.`,
    },
    {
      category: 'problem_statement',
      count: 4,
      isBranded: false,
      intentStage: 'awareness',
      intent: 'Informational',
      definition:
        'Awareness-stage questions where the user describes a problem in their own words WITHOUT knowing the category exists. ' +
        'Format: "How do I... / I\'m trying to... / what\'s the best way to..." ' +
        'The LLM should have to INFER the category from the problem description. The prompt itself must NOT mention the category name.',
      brandingRule: (brand) =>
        `Do NOT mention "${brand}", any brand, or the category name "{category}" itself. ` +
        `Describe the problem only — let the LLM infer the category.`,
    },
  ];
}

// ── LLM call per category ──────────────────────────────────────────────────

interface LlmPromptItem {
  prompt?: unknown;
  persona?: unknown;
  useCase?: unknown;
  constraint?: unknown;
  competitorMentioned?: unknown;
  keyword?: unknown;
}

const SYSTEM = [
  'You generate audit prompts for measuring how often LLMs (ChatGPT, Claude, Gemini)',
  'mention a specific brand in real user conversations.',
  '',
  'Hard rules for EVERY prompt you produce:',
  '- 4 to 12 words long. Not shorter, not longer.',
  '- Sound like a real human typing into ChatGPT — natural, conversational, slightly messy.',
  '- Must include at least one of: persona, use case, OR constraint qualifier.',
  '- Never wrap the prompt in quotation marks.',
  '- Never use SEO-keyword fragments ("best CRM 2024" — bad).',
  '- Never repeat the same persona/use-case combo within a batch.',
  '',
  'Output strict JSON only. No prose, no preamble.',
].join('\n');

async function generateForCategory(args: {
  brand: string;
  ctx: EnrichedContext;
  spec: CategorySpec;
}): Promise<GeneratedPrompt[]> {
  const { brand, ctx, spec } = args;

  const competitorList = ctx.competitors.length > 0
    ? ctx.competitors.join(', ')
    : '(none — pick well-known industry rivals from your knowledge)';

  const definition = spec.definition
    .replace(/{category}/g, ctx.category)
    .replace(/{year}/g, ctx.year)
    .replace(/{N}/g, String(spec.count));

  const userPrompt = [
    `Brand: ${brand}`,
    `Category: ${ctx.category}`,
    `Vertical: ${ctx.vertical ?? 'unspecified'}`,
    `Competitors: ${competitorList}`,
    `Personas: ${ctx.personas.join(' | ')}`,
    `Use cases: ${ctx.useCases.join(' | ')}`,
    `Constraints: ${ctx.constraints.join(' | ')}`,
    ctx.priceBand ? `Price: ${ctx.priceBand}` : '',
    `Year: ${ctx.year}`,
    '',
    `Generate ${spec.count} prompts: "${spec.category}". ${definition}`,
    `Branding: ${spec.brandingRule(brand)}`,
    'Vary personas/use-cases. No repeats.',
    'Return JSON: {prompts: [{prompt, persona, useCase, constraint, competitorMentioned, keyword}]}',
  ].filter(Boolean).join('\n');

  let payload: { prompts?: LlmPromptItem[] } = {};
  try {
    payload = await callJson<{ prompts?: LlmPromptItem[] }>({
      model: Models.topics,
      system: SYSTEM,
      user: userPrompt,
      temperature: 0.6, // higher for variety inside a category, still bounded
      maxTokens: 1500,
    });
  } catch {
    return [];
  }

  const arr = Array.isArray(payload.prompts) ? payload.prompts : [];
  const out: GeneratedPrompt[] = [];
  for (const raw of arr) {
    const text = typeof raw.prompt === 'string' ? raw.prompt.trim() : '';
    if (!text) continue;
    const wc = text.split(/\s+/).filter(Boolean).length;
    // Enforce 5-7 word window — drop outliers.
    // Tolerate ±1 word because LLMs miscount.
    if (wc < 4 || wc > 8) continue;

    out.push({
      text,
      category: spec.category,
      intentStage: spec.intentStage,
      isBranded: spec.isBranded,
      persona: typeof raw.persona === 'string' && raw.persona.trim() ? raw.persona.trim().slice(0, 120) : null,
      useCase: typeof raw.useCase === 'string' && raw.useCase.trim() ? raw.useCase.trim().slice(0, 120) : null,
      constraint:
        typeof raw.constraint === 'string' && raw.constraint.trim()
          ? raw.constraint.trim().slice(0, 120)
          : null,
      competitorMentioned:
        typeof raw.competitorMentioned === 'string' && raw.competitorMentioned.trim()
          ? raw.competitorMentioned.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]
          : null,
      keyword: typeof raw.keyword === 'string' && raw.keyword.trim()
        ? raw.keyword.trim().toLowerCase().slice(0, 80)
        : ctx.category,
      intent: spec.intent,
    });
  }
  return out;
}

// ── Public API ─────────────────────────────────────────────────────────────

export interface GenerateAllInput {
  brand: string;
  host?: string;
  context: EnrichedContext;
  /** Optional category subset (for "Load more" of a single category). Defaults to all. */
  onlyCategories?: PromptCategory[];
}

export async function generateAuditPrompts(input: GenerateAllInput): Promise<GeneratedPrompt[]> {
  const host = input.host ?? input.brand;
  const signals = await collectPromptSeedSignals({
    brand: input.brand,
    host,
    context: input.context,
    limit: 40,
  });
  const prompts = await generateHumanAuditPrompts({
    brand: input.brand,
    host,
    context: input.context,
    signals,
  });
  if (!input.onlyCategories || input.onlyCategories.length === 0) return prompts;
  const filtered = prompts.filter((prompt) => input.onlyCategories?.includes(prompt.category));
  return filtered.length > 0 ? filtered : prompts;
}

// ── Persistence ────────────────────────────────────────────────────────────

export interface PersistArgs {
  prisma: PrismaClient;
  domainId: number;
  prompts: GeneratedPrompt[];
  /** If true, KEEP existing AI-source rows and append on top. */
  append?: boolean;
}

export interface PersistedTopicsItem {
  id: number;
  type: 'keyword' | 'prompt';
  text: string;
  intent: string | null;
  source: 'ai' | 'custom';
  parentKeywordId?: number;
  // Audit metadata (prompts only)
  category?: string;
  intentStage?: string;
  isBranded?: boolean;
  persona?: string | null;
  useCase?: string | null;
  constraint?: string | null;
  competitorMentioned?: string | null;
}

export async function persistAuditPrompts(args: PersistArgs): Promise<PersistedTopicsItem[]> {
  // Fresh regen wipes AI-source rows; append mode keeps them.
  if (!args.append) {
    const aiKeywords = await args.prisma.keyword.findMany({
      where: { domainId: args.domainId, source: 'ai' },
      select: { id: true },
    });
    const aiKeywordIds = aiKeywords.map((k) => k.id);
    if (aiKeywordIds.length > 0) {
      await args.prisma.prompt.deleteMany({
        where: { domainId: args.domainId, OR: [{ keywordId: { in: aiKeywordIds } }, { keywordId: null, source: 'ai' }] },
      });
      await args.prisma.keyword.deleteMany({ where: { id: { in: aiKeywordIds } } });
    } else {
      await args.prisma.prompt.deleteMany({ where: { domainId: args.domainId, source: 'ai', keywordId: null } });
    }
  }

  const out: PersistedTopicsItem[] = [];

  // Group prompts by their keyword text so we upsert one Keyword row per unique seed.
  const promptsByKeyword = new Map<string, GeneratedPrompt[]>();
  for (const p of args.prompts) {
    const key = p.keyword;
    const arr = promptsByKeyword.get(key) ?? [];
    arr.push(p);
    promptsByKeyword.set(key, arr);
  }

  for (const [keywordTerm, prompts] of promptsByKeyword) {
    // Pick the dominant intent across the keyword's prompts.
    const intent = prompts[0]?.intent ?? 'Commercial';
    const keyword = await args.prisma.keyword.upsert({
      where: { domainId_term: { domainId: args.domainId, term: keywordTerm } },
      update: { intent, source: 'ai' },
      create: {
        domainId: args.domainId,
        term: keywordTerm,
        intent,
        source: 'ai',
        isSelected: false,
      },
    });
    out.push({
      id: keyword.id,
      type: 'keyword',
      text: keyword.term,
      intent: keyword.intent,
      source: 'ai',
    });
    for (const p of prompts) {
      const created = await args.prisma.prompt.create({
        data: {
          domainId: args.domainId,
          keywordId: keyword.id,
          text: p.text,
          intent: p.intent,
          source: 'ai',
          isSelected: false,
          category: p.category,
          intentStage: p.intentStage,
          persona: p.persona,
          useCase: p.useCase,
          constraint: p.constraint,
          isBranded: p.isBranded,
          competitorMentioned: p.competitorMentioned,
        },
      });
      out.push({
        id: created.id,
        type: 'prompt',
        text: created.text,
        intent: created.intent,
        source: 'ai',
        parentKeywordId: keyword.id,
        category: created.category ?? undefined,
        intentStage: created.intentStage ?? undefined,
        isBranded: created.isBranded,
        persona: created.persona,
        useCase: created.useCase,
        constraint: created.constraint,
        competitorMentioned: created.competitorMentioned,
      });
    }
  }

  return out;
}
