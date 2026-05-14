/**
 * keywordsService — keyword-only generation for the inline Website Audit
 * setup flow.
 *
 * Why a separate service from topicsService:
 *   - topicsService generates 24 prompts in 6 categories; its "keywords"
 *     come out as a grouping seed on each prompt, optimized for prompt
 *     clustering, not for keyword quality.
 *   - The Website Audit setup flow doesn't run AI prompts. It needs first-
 *     class commercial-intent keywords to surface in Domain Info and feed
 *     downstream campaigns.
 *   - One LLM call (~1s) instead of 6 in parallel (~3-5s + 6× cost).
 *
 * The wizard standalone path (Step 4 → Step 5) is untouched.
 */

import type { PrismaClient } from '../../generated/prisma';
import type { Intent } from './types';
import type { EnrichedContext } from './enrichmentService';
import { callJson, Models } from './llmClient';

// ── Types ──────────────────────────────────────────────────────────────────

export interface GeneratedKeyword {
  term: string;
  intent: Intent;
  rationale: string | null;
}

interface LlmKeywordItem {
  term?: unknown;
  intent?: unknown;
  rationale?: unknown;
}

const SYSTEM = [
  'You generate SEO-style keyword phrases for a domain audit.',
  '',
  'Hard rules for EVERY keyword you produce:',
  '- 1 to 4 words. Lowercase. No punctuation except a single hyphen.',
  '- Real phrases a buyer or researcher would actually type into Google.',
  '- Mix of intents — include at least 2 of {Informational, Commercial, Transactional}.',
  '- No brand names. No date suffixes ("2025"). No question forms ("how to ...").',
  '- No duplicates, no near-duplicates (singular/plural, with/without "best").',
  '',
  'Output strict JSON only. No prose, no preamble.',
].join('\n');

const VALID_INTENTS: Intent[] = ['Informational', 'Commercial', 'Transactional', 'Navigational'];

function normalizeTerm(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9\- ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Public API ─────────────────────────────────────────────────────────────

export interface GenerateKeywordsInput {
  brand: string;
  context: EnrichedContext;
  /** Soft cap on returned keywords. The LLM may return slightly fewer after
   *  validation; we never return more than this. */
  count?: number;
}

export async function generateKeywordsForDomain(
  input: GenerateKeywordsInput
): Promise<GeneratedKeyword[]> {
  const count = Math.max(4, Math.min(20, input.count ?? 10));
  const ctx = input.context;

  const competitorList = ctx.competitors.length > 0
    ? ctx.competitors.join(', ')
    : '(none known)';

  const userPrompt = [
    `Brand:           ${input.brand}`,
    `Category:        ${ctx.category}`,
    `Vertical:        ${ctx.vertical ?? 'unspecified'}`,
    `Personas:        ${ctx.personas.join(' | ')}`,
    `Use cases:       ${ctx.useCases.join(' | ')}`,
    `Constraints:     ${ctx.constraints.join(' | ')}`,
    `Top competitors: ${competitorList}`,
    '',
    `Generate exactly ${count} keyword phrases worth tracking for ${input.brand}.`,
    'Return JSON exactly in this shape:',
    '{',
    '  "keywords": [',
    '    { "term": "<1-4 word phrase>", "intent": "Commercial|Informational|Transactional|Navigational", "rationale": "<one short sentence>" }',
    '  ]',
    '}',
  ].join('\n');

  let payload: { keywords?: LlmKeywordItem[] } = {};
  try {
    payload = await callJson<{ keywords?: LlmKeywordItem[] }>({
      model: Models.topics,
      system: SYSTEM,
      user: userPrompt,
      temperature: 0.4,
      maxTokens: 800,
    });
  } catch {
    return [];
  }

  const arr = Array.isArray(payload.keywords) ? payload.keywords : [];
  const seen = new Set<string>();
  const out: GeneratedKeyword[] = [];

  for (const raw of arr) {
    const term = typeof raw.term === 'string' ? normalizeTerm(raw.term) : '';
    if (!term) continue;
    const wc = term.split(/\s+/).filter(Boolean).length;
    if (wc < 1 || wc > 4) continue;
    if (term.length > 80) continue;
    if (seen.has(term)) continue;

    const intent = typeof raw.intent === 'string' && VALID_INTENTS.includes(raw.intent as Intent)
      ? (raw.intent as Intent)
      : 'Commercial';
    const rationale = typeof raw.rationale === 'string' && raw.rationale.trim()
      ? raw.rationale.trim().slice(0, 200)
      : null;

    seen.add(term);
    out.push({ term, intent, rationale });
    if (out.length >= count) break;
  }
  return out;
}

// ── Persistence ────────────────────────────────────────────────────────────

export interface PersistKeywordsArgs {
  prisma: PrismaClient;
  domainId: number;
  keywords: GeneratedKeyword[];
  /** When true, delete all AI-source keyword rows for this domain before
   *  upserting. Prompt.keywordId is `onDelete: SetNull` so existing prompts
   *  (if any) are preserved with a null keyword link — they were already
   *  decoupled by the schema. */
  replaceAi?: boolean;
}

export interface PersistedKeyword {
  id: number;
  term: string;
  intent: Intent;
}

export async function persistKeywords(args: PersistKeywordsArgs): Promise<PersistedKeyword[]> {
  if (args.replaceAi) {
    await args.prisma.keyword.deleteMany({
      where: { domainId: args.domainId, source: 'ai' },
    });
  }
  const out: PersistedKeyword[] = [];
  for (const k of args.keywords) {
    const row = await args.prisma.keyword.upsert({
      where: { domainId_term: { domainId: args.domainId, term: k.term } },
      update: { intent: k.intent, source: 'ai', isSelected: true },
      create: {
        domainId: args.domainId,
        term: k.term,
        intent: k.intent,
        source: 'ai',
        isSelected: true,
      },
    });
    out.push({ id: row.id, term: row.term, intent: row.intent as Intent });
  }
  return out;
}
