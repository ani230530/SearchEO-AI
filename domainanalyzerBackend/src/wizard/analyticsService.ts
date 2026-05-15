/**
 * analyticsService — derives the two action-oriented widgets on the AI
 * Results dashboard:
 *
 *   1. Phrase Visibility Map        (one row per queried prompt)
 *   2. Outrank Opportunities        (distilled action items)
 *
 * Pure read-model: takes pre-loaded prompts + AiQueryResult rows + selected
 * competitors and returns plain JSON shapes. The route handler calls this
 * with whatever it already fetched for the rest of /report — no extra DB
 * hits, no LLM calls. (Action-title generation is intentionally NOT here —
 * it lives behind the dashboard's "Generate Content" click so we don't pay
 * for titles on rows the user never opens.)
 *
 * Methodology references — sources cited in the planning doc:
 *   - Profound's share-of-voice (own mentions vs competitors per prompt)
 *   - HubSpot AEO presence/sentiment weighting
 *   - AISVS position scoring (1=10, 2=7, 3=4, mention-only=1)
 *   - Similarweb's gap-prompt definition (they appear, you don't)
 */

import type { Prompt as DbPrompt, AiQueryResult as DbAiResult, Keyword as DbKeyword } from '../../generated/prisma';

// ── Inputs ─────────────────────────────────────────────────────────────────

export interface AnalyticsInput {
  ownDomainHost: string;
  ownBrandName: string | null;
  selectedCompetitorHosts: string[];
  /** Domain's keywords (for keyword name lookup + grouping). */
  keywords: Pick<DbKeyword, 'id' | 'term' | 'intent'>[];
  /** Selected prompts (only ones that actually ran). */
  prompts: Array<
    Pick<DbPrompt, 'id' | 'text' | 'intent' | 'keywordId' | 'category' | 'intentStage' | 'persona' | 'useCase' | 'isBranded' | 'competitorMentioned'>
  >;
  /** Every AiQueryResult tied to the latest completed run. */
  results: Array<
    Pick<DbAiResult, 'id' | 'promptId' | 'model' | 'presence' | 'overall' | 'sentiment' | 'rankPosition' | 'competitorMentions' | 'competitorHosts' | 'citations'>
  >;
}

// ── Phrase Visibility Map ──────────────────────────────────────────────────

export type PhraseStatus = 'won' | 'at_risk' | 'lost';

export interface PhraseVisibilityRow {
  promptId: number;
  phrase: string;
  keywordId: number | null;
  keyword: string | null;
  intent: string | null;
  intentStage: string | null;
  category: string | null;
  status: PhraseStatus;
  ownCoverage: number;        // 0..1 — fraction of models that mentioned the brand
  ownBestPosition: number | null;
  competitorCoverage: number; // 0..1 — best coverage across selected competitors
  competitorBestPosition: number | null;
  /** Names the user cares about — limited to selected competitors actually mentioned for this prompt. */
  competitorsMentioned: Array<{ host: string; coverage: number; bestPosition: number | null }>;
  /** Subtitle copy ready for the UI — derived to keep the renderer dumb. */
  subtitle: string;
}

const intentStageRank = (s: string | null | undefined): number =>
  s === 'decision' ? 3 : s === 'consideration' ? 2 : s === 'awareness' ? 1 : 0;

export function computePhraseVisibility(input: AnalyticsInput): PhraseVisibilityRow[] {
  const keywordById = new Map(input.keywords.map((k) => [k.id, k]));

  // Group results by prompt for O(prompts + results).
  const resultsByPrompt = new Map<number, AnalyticsInput['results']>();
  for (const r of input.results) {
    const arr = resultsByPrompt.get(r.promptId) ?? [];
    arr.push(r);
    resultsByPrompt.set(r.promptId, arr);
  }

  const selectedSet = new Set(input.selectedCompetitorHosts.map((h) => h.toLowerCase()));

  const rows: PhraseVisibilityRow[] = [];

  for (const p of input.prompts) {
    const rs = resultsByPrompt.get(p.id);
    if (!rs || rs.length === 0) continue; // never queried — skip

    const totalModels = rs.length;
    const ourPresence = rs.reduce((s, r) => s + r.presence, 0);
    const ourCoverage = totalModels > 0 ? ourPresence / totalModels : 0;
    const ourPositions = rs
      .map((r) => r.rankPosition)
      .filter((n): n is number => typeof n === 'number' && n > 0);
    const ourBestPosition = ourPositions.length > 0 ? Math.min(...ourPositions) : null;

    // Aggregate per-competitor signals across this prompt's models.
    const compAccum = new Map<
      string,
      { presenceModels: number; positions: number[] }
    >();
    for (const r of rs) {
      const mentions = Array.isArray(r.competitorMentions)
        ? (r.competitorMentions as Array<{ host?: string; rankPosition?: number | null }>)
        : [];
      for (const m of mentions) {
        const host = (m.host ?? '').toLowerCase();
        if (!host || !selectedSet.has(host)) continue;
        const acc = compAccum.get(host) ?? { presenceModels: 0, positions: [] };
        acc.presenceModels += 1;
        if (typeof m.rankPosition === 'number' && m.rankPosition > 0) {
          acc.positions.push(m.rankPosition);
        }
        compAccum.set(host, acc);
      }
      // Fallback: legacy `competitorHosts` array (no rank info).
      const hosts = Array.isArray(r.competitorHosts) ? (r.competitorHosts as unknown[]) : [];
      for (const raw of hosts) {
        const host = typeof raw === 'string' ? raw.toLowerCase() : '';
        if (!host || !selectedSet.has(host) || compAccum.has(host)) continue;
        compAccum.set(host, { presenceModels: 1, positions: [] });
      }
    }

    const competitorsMentioned = Array.from(compAccum.entries())
      .map(([host, v]) => ({
        host,
        coverage: v.presenceModels / totalModels,
        bestPosition: v.positions.length > 0 ? Math.min(...v.positions) : null,
      }))
      .sort((a, b) => b.coverage - a.coverage);

    const competitorCoverage =
      competitorsMentioned.length > 0 ? competitorsMentioned[0].coverage : 0;
    const competitorBestPosition =
      competitorsMentioned.length > 0 ? competitorsMentioned[0].bestPosition : null;

    // Status logic — see plan doc §3.
    //   lost   = we're not mentioned at all (regardless of competitors —
    //            either competitors took the slot or no one did, both are
    //            failure states for AI visibility).
    //   at_risk= we appear, but a competitor outranks us / shows up more.
    //   won    = we appear and no selected competitor outranks us.
    let status: PhraseStatus;
    if (ourCoverage === 0) {
      status = 'lost';
    } else if (
      (ourBestPosition !== null && competitorBestPosition !== null && competitorBestPosition < ourBestPosition) ||
      competitorCoverage > ourCoverage
    ) {
      status = 'at_risk';
    } else {
      status = 'won';
    }

    const kw = p.keywordId ? keywordById.get(p.keywordId) ?? null : null;

    // Honest subtitle copy.
    const fmtCoverage = (c: number, total: number) => {
      const n = Math.round(c * total);
      return `${n} of ${total} model${total === 1 ? '' : 's'}`;
    };
    let subtitle: string;
    if (status === 'won') {
      subtitle = `Mentioned by ${fmtCoverage(ourCoverage, totalModels)}${
        ourBestPosition ? ` · #${ourBestPosition} best position` : ''
      }`;
    } else if (status === 'at_risk') {
      const top = competitorsMentioned[0];
      const compSnippet =
        top && top.bestPosition
          ? `${top.host} #${top.bestPosition}`
          : top
            ? `${top.host} mentioned`
            : 'a competitor outranks you';
      subtitle = `You ${ourBestPosition ? `#${ourBestPosition}` : 'mentioned'} · ${compSnippet}`;
    } else {
      // status === 'lost' — we're not mentioned at all.
      const named = competitorsMentioned.map((c) => c.host).slice(0, 3).join(', ');
      if (competitorsMentioned.length > 0) {
        subtitle = `Not mentioned · ${competitorsMentioned.length} competitor${
          competitorsMentioned.length === 1 ? '' : 's'
        } found${named ? ` · ${named}` : ''}`;
      } else {
        subtitle = `Not mentioned by ${totalModels} of ${totalModels} model${totalModels === 1 ? '' : 's'}`;
      }
    }

    rows.push({
      promptId: p.id,
      phrase: p.text,
      keywordId: kw?.id ?? null,
      keyword: kw?.term ?? null,
      intent: p.intent ?? kw?.intent ?? null,
      intentStage: p.intentStage ?? null,
      category: p.category ?? null,
      status,
      ownCoverage: ourCoverage,
      ownBestPosition: ourBestPosition,
      competitorCoverage,
      competitorBestPosition,
      competitorsMentioned,
      subtitle,
    });
  }

  // Sort: lost > at_risk > won; within each by intent-stage rank desc, then competitor coverage desc.
  const statusOrder: Record<PhraseStatus, number> = { lost: 2, at_risk: 1, won: 0 };
  rows.sort((a, b) => {
    if (statusOrder[a.status] !== statusOrder[b.status]) return statusOrder[b.status] - statusOrder[a.status];
    const stageDiff = intentStageRank(b.intentStage) - intentStageRank(a.intentStage);
    if (stageDiff !== 0) return stageDiff;
    return b.competitorCoverage - a.competitorCoverage;
  });

  return rows;
}

// ── Outrank Opportunities ──────────────────────────────────────────────────

export type OpportunityType =
  | 'topic_gap'
  | 'position_downgrade'
  | 'citation_gap'
  | 'negative_sentiment'
  | 'brand_comparison_gap'
  | 'listicle_absence';

export type Severity = 'critical' | 'high' | 'medium' | 'low';
export type TrafficPotential = 'very_high' | 'high' | 'medium' | 'low';

export interface OutrankOpportunity {
  /** Stable key — used by the dashboard to dedupe + by the worksheet to identify the source. */
  key: string;
  type: OpportunityType;
  severity: Severity;
  severityScore: number;
  trafficPotential: TrafficPotential;
  /** Short imperative title — generated client-side or via a separate LLM call when the user opens it. */
  title: string;
  rationale: string;
  /** Keyword + competitor signals that make this opportunity actionable. */
  keywordId: number | null;
  keyword: string | null;
  primaryKeyword: string | null;
  longtailKeywords: string[];
  competitors: string[];
  promptIds: number[];
  /** Suggested template type for the worksheet auto-build. */
  suggestedTemplate: 'blog' | 'landing_page' | 'case_study' | 'faq';
  intentStage: string | null;
  category: string | null;
}

const baseSeverity: Record<OpportunityType, number> = {
  topic_gap: 10,
  brand_comparison_gap: 10,
  negative_sentiment: 9,
  position_downgrade: 7,
  citation_gap: 7,
  listicle_absence: 6,
};

const intentStageWeight = (s: string | null | undefined): number =>
  s === 'decision' ? 1.5 : s === 'consideration' ? 1.0 : s === 'awareness' ? 0.6 : 1.0;

const trafficForStage = (s: string | null | undefined, isBranded: boolean): TrafficPotential => {
  if (isBranded) return 'low';
  if (s === 'decision') return 'very_high';
  if (s === 'consideration') return 'high';
  if (s === 'awareness') return 'medium';
  return 'medium';
};

const binSeverity = (score: number): Severity => {
  if (score >= 10) return 'critical';
  if (score >= 5) return 'high';
  if (score >= 2) return 'medium';
  return 'low';
};

const templateForCategory = (category: string | null): OutrankOpportunity['suggestedTemplate'] => {
  if (category === 'brand_vs_competitor') return 'landing_page';
  if (category === 'branded_trust') return 'case_study';
  if (category === 'problem_statement') return 'faq';
  return 'blog';
};

export function computeOpportunities(
  input: AnalyticsInput,
  visibility: PhraseVisibilityRow[]
): OutrankOpportunity[] {
  const opportunities: OutrankOpportunity[] = [];
  const seen = new Set<string>();
  const promptById = new Map(input.prompts.map((p) => [p.id, p]));

  // ── A. Topic gaps — keyword groups where every queried prompt is Lost.
  const lostByKeyword = new Map<number, PhraseVisibilityRow[]>();
  const allByKeyword = new Map<number, PhraseVisibilityRow[]>();
  for (const v of visibility) {
    if (v.keywordId == null) continue;
    const all = allByKeyword.get(v.keywordId) ?? [];
    all.push(v);
    allByKeyword.set(v.keywordId, all);
    if (v.status === 'lost') {
      const lost = lostByKeyword.get(v.keywordId) ?? [];
      lost.push(v);
      lostByKeyword.set(v.keywordId, lost);
    }
  }
  for (const [kwId, lost] of lostByKeyword) {
    const all = allByKeyword.get(kwId) ?? [];
    if (all.length === 0 || lost.length !== all.length) continue;
    const keywordRow = input.keywords.find((k) => k.id === kwId);
    if (!keywordRow) continue;
    const competitors = unique(lost.flatMap((l) => l.competitorsMentioned.map((c) => c.host))).slice(0, 5);
    const competitorCoverage = lost[0]?.competitorCoverage ?? 0;
    const stage = lost[0]?.intentStage ?? null;
    const isBranded = lost.every((l) => promptById.get(l.promptId)?.isBranded);
    // Score is still useful even when no competitors appear — total invisibility
    // on a decision-stage keyword is a real opportunity. Floor at 0.5 so the
    // severity bin doesn't collapse to "low" purely because competitorCoverage=0.
    const score = baseSeverity.topic_gap * intentStageWeight(stage) * (0.5 + competitorCoverage / 2);
    const key = `topic_gap:${kwId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const rationale = competitors.length > 0
      ? `Lost on all ${lost.length} prompts under "${keywordRow.term}"; ${competitors.length} competitor${competitors.length === 1 ? '' : 's'} appear here.`
      : `Lost on all ${lost.length} prompts under "${keywordRow.term}" — no AI model is mentioning you for this keyword.`;
    opportunities.push({
      key,
      type: 'topic_gap',
      severity: binSeverity(score),
      severityScore: Number(score.toFixed(2)),
      trafficPotential: trafficForStage(stage, isBranded),
      title: `Build a comprehensive guide on ${keywordRow.term}`,
      rationale,
      keywordId: kwId,
      keyword: keywordRow.term,
      primaryKeyword: keywordRow.term,
      longtailKeywords: unique(lost.map((l) => l.phrase)).slice(0, 6),
      competitors,
      promptIds: lost.map((l) => l.promptId),
      suggestedTemplate: 'blog',
      intentStage: stage,
      category: lost[0]?.category ?? null,
    });
  }

  // ── B. Brand-comparison gaps — Lost on a `brand_vs_competitor` prompt.
  for (const v of visibility) {
    if (v.status !== 'lost' || v.category !== 'brand_vs_competitor') continue;
    const p = promptById.get(v.promptId);
    if (!p) continue;
    const namedCompetitor =
      p.competitorMentioned ??
      v.competitorsMentioned[0]?.host ??
      null;
    if (!namedCompetitor) continue;
    const score = baseSeverity.brand_comparison_gap * intentStageWeight(v.intentStage) * (0.5 + v.competitorCoverage / 2);
    const key = `brand_comparison_gap:${v.promptId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    opportunities.push({
      key,
      type: 'brand_comparison_gap',
      severity: binSeverity(score),
      severityScore: Number(score.toFixed(2)),
      trafficPotential: trafficForStage(v.intentStage, false),
      title: `Publish a ${input.ownBrandName ?? input.ownDomainHost} vs ${namedCompetitor} comparison`,
      rationale: `Lost on a head-to-head comparison prompt where ${namedCompetitor} won.`,
      keywordId: v.keywordId,
      keyword: v.keyword,
      primaryKeyword: v.keyword ?? namedCompetitor,
      longtailKeywords: [v.phrase],
      competitors: [namedCompetitor],
      promptIds: [v.promptId],
      suggestedTemplate: 'landing_page',
      intentStage: v.intentStage,
      category: v.category,
    });
  }

  // ── C. Listicle absence — Lost on a `top_n_listicle` with multiple competitors winning.
  for (const v of visibility) {
    if (v.status !== 'lost' || v.category !== 'top_n_listicle') continue;
    if (v.competitorsMentioned.length < 2) continue;
    const score = baseSeverity.listicle_absence * intentStageWeight(v.intentStage) * (0.5 + v.competitorCoverage / 2);
    const key = `listicle_absence:${v.keywordId ?? v.promptId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    opportunities.push({
      key,
      type: 'listicle_absence',
      severity: binSeverity(score),
      severityScore: Number(score.toFixed(2)),
      trafficPotential: trafficForStage(v.intentStage, false),
      title: `Earn a place on top-N listicles for ${v.keyword ?? 'your category'}`,
      rationale: `${v.competitorsMentioned.length} competitors appear in listicle answers here; you don't.`,
      keywordId: v.keywordId,
      keyword: v.keyword,
      primaryKeyword: v.keyword ?? v.phrase,
      longtailKeywords: [v.phrase, ...visibility.filter((o) => o.keywordId === v.keywordId && o.promptId !== v.promptId).map((o) => o.phrase).slice(0, 4)],
      competitors: v.competitorsMentioned.map((c) => c.host).slice(0, 5),
      promptIds: [v.promptId],
      suggestedTemplate: 'blog',
      intentStage: v.intentStage,
      category: v.category,
    });
  }

  // ── D. Position-downgrade — At-risk on decision-stage.
  for (const v of visibility) {
    if (v.status !== 'at_risk') continue;
    if (v.intentStage !== 'decision') continue;
    const score = baseSeverity.position_downgrade * intentStageWeight(v.intentStage) * (0.5 + v.competitorCoverage / 2);
    const key = `position_downgrade:${v.promptId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    opportunities.push({
      key,
      type: 'position_downgrade',
      severity: binSeverity(score),
      severityScore: Number(score.toFixed(2)),
      trafficPotential: trafficForStage(v.intentStage, false),
      title: `Strengthen ${v.keyword ?? 'this topic'} to outrank competitors`,
      rationale: `You're mentioned but ${v.competitorsMentioned[0]?.host ?? 'a competitor'} ranks above you on a decision-stage prompt.`,
      keywordId: v.keywordId,
      keyword: v.keyword,
      primaryKeyword: v.keyword ?? v.phrase,
      longtailKeywords: [v.phrase],
      competitors: v.competitorsMentioned.map((c) => c.host).slice(0, 5),
      promptIds: [v.promptId],
      suggestedTemplate: templateForCategory(v.category),
      intentStage: v.intentStage,
      category: v.category,
    });
  }

  // ── E. Citation gap — competitor cited on ≥3 prompts where we aren't.
  const competitorCitationCount = new Map<string, Set<number>>();
  const ourCitationCount = new Map<string, Set<number>>();
  for (const r of input.results) {
    const cits = Array.isArray(r.citations) ? (r.citations as Array<{ host?: string }>) : [];
    for (const c of cits) {
      const host = (c.host ?? '').toLowerCase();
      if (!host) continue;
      if (host === input.ownDomainHost) {
        const set = ourCitationCount.get(host) ?? new Set();
        set.add(r.promptId);
        ourCitationCount.set(host, set);
      } else {
        const set = competitorCitationCount.get(host) ?? new Set();
        set.add(r.promptId);
        competitorCitationCount.set(host, set);
      }
    }
  }
  const weCitedAt = ourCitationCount.get(input.ownDomainHost) ?? new Set<number>();
  for (const [host, prompts] of competitorCitationCount) {
    if (prompts.size < 3) continue;
    const overlap = Array.from(prompts).filter((pid) => !weCitedAt.has(pid));
    if (overlap.length < 3) continue;
    const score = baseSeverity.citation_gap * 1.0 * Math.min(1, overlap.length / 5);
    const key = `citation_gap:${host}`;
    if (seen.has(key)) continue;
    seen.add(key);
    opportunities.push({
      key,
      type: 'citation_gap',
      severity: binSeverity(score),
      severityScore: Number(score.toFixed(2)),
      trafficPotential: 'high',
      title: `Get cited on ${host}`,
      rationale: `${host} is cited as a source on ${overlap.length} prompts where your domain isn't.`,
      keywordId: null,
      keyword: null,
      primaryKeyword: null,
      longtailKeywords: [],
      competitors: [],
      promptIds: overlap,
      suggestedTemplate: 'blog',
      intentStage: null,
      category: null,
    });
  }

  // ── F. Negative-sentiment opportunities.
  const sentimentByPrompt = new Map<number, { sum: number; count: number }>();
  for (const r of input.results) {
    if (r.presence !== 1 || r.sentiment === null || r.sentiment === undefined) continue;
    const acc = sentimentByPrompt.get(r.promptId) ?? { sum: 0, count: 0 };
    acc.sum += r.sentiment;
    acc.count += 1;
    sentimentByPrompt.set(r.promptId, acc);
  }
  for (const v of visibility) {
    const s = sentimentByPrompt.get(v.promptId);
    if (!s || s.count === 0) continue;
    const avg = s.sum / s.count;
    if (avg >= -3) continue; // raw -10..10 scale; -3 ~ "frustrated"
    const score = baseSeverity.negative_sentiment * intentStageWeight(v.intentStage);
    const key = `negative_sentiment:${v.promptId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    opportunities.push({
      key,
      type: 'negative_sentiment',
      severity: binSeverity(score),
      severityScore: Number(score.toFixed(2)),
      trafficPotential: trafficForStage(v.intentStage, false),
      title: `Address negative narrative on ${v.keyword ?? 'this topic'}`,
      rationale: `Average sentiment around your brand on this prompt is ${avg.toFixed(1)} (out of -10..10) across ${s.count} model${s.count === 1 ? '' : 's'}.`,
      keywordId: v.keywordId,
      keyword: v.keyword,
      primaryKeyword: v.keyword ?? v.phrase,
      longtailKeywords: [v.phrase],
      competitors: v.competitorsMentioned.map((c) => c.host).slice(0, 3),
      promptIds: [v.promptId],
      suggestedTemplate: templateForCategory(v.category),
      intentStage: v.intentStage,
      category: v.category,
    });
  }

  // ── G. Per-prompt topic-gap fallback — any Lost prompt not already
  // covered by sections A–F (e.g. unbranded_recommendation Lost where
  // sibling prompts under the same keyword Won, so the keyword-rollup in
  // A didn't fire). Without this, a single Lost prompt would never surface
  // as an opportunity, leaving the user with "No outrank opportunities yet"
  // even when their dashboard clearly shows a Lost row.
  const coveredPromptIds = new Set<number>();
  for (const o of opportunities) for (const pid of o.promptIds) coveredPromptIds.add(pid);
  for (const v of visibility) {
    if (v.status !== 'lost') continue;
    if (coveredPromptIds.has(v.promptId)) continue;
    const stage = v.intentStage ?? null;
    const isBranded = promptById.get(v.promptId)?.isBranded ?? false;
    const competitors = v.competitorsMentioned.map((c) => c.host).slice(0, 5);
    const score = baseSeverity.topic_gap * intentStageWeight(stage) * (0.5 + v.competitorCoverage / 2);
    const key = `topic_gap_phrase:${v.promptId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const rationale = competitors.length > 0
      ? `Lost on this prompt; ${competitors.length} competitor${competitors.length === 1 ? '' : 's'} appear (${competitors.slice(0, 3).join(', ')}).`
      : `Lost on this prompt — no AI model is mentioning you for this phrase.`;
    opportunities.push({
      key,
      type: 'topic_gap',
      severity: binSeverity(score),
      severityScore: Number(score.toFixed(2)),
      trafficPotential: trafficForStage(stage, isBranded),
      title: `Win answers for "${v.keyword ?? v.phrase.slice(0, 60)}"`,
      rationale,
      keywordId: v.keywordId,
      keyword: v.keyword,
      primaryKeyword: v.keyword ?? v.phrase,
      longtailKeywords: [v.phrase],
      competitors,
      promptIds: [v.promptId],
      suggestedTemplate: templateForCategory(v.category),
      intentStage: stage,
      category: v.category,
    });
  }

  // ── Dedup precedence: topic_gap > brand_comparison_gap > listicle_absence > position_downgrade.
  // For each keyword, drop lower-precedence types if a higher-precedence one already covers it.
  const precedence: Record<OpportunityType, number> = {
    topic_gap: 5,
    brand_comparison_gap: 4,
    negative_sentiment: 3,
    listicle_absence: 2,
    position_downgrade: 1,
    citation_gap: 0, // citation_gap is host-keyed, not keyword-keyed — never preempt others
  };
  const byKeyword = new Map<number, OpportunityType>();
  for (const o of opportunities) {
    if (o.keywordId == null) continue;
    const cur = byKeyword.get(o.keywordId);
    if (!cur || precedence[o.type] > precedence[cur]) byKeyword.set(o.keywordId, o.type);
  }
  const filtered = opportunities.filter((o) => {
    if (o.keywordId == null) return true; // citation gaps & host-level rows survive
    return byKeyword.get(o.keywordId) === o.type;
  });

  // Sort by severityScore desc, cap at 12.
  filtered.sort((a, b) => b.severityScore - a.severityScore);
  return filtered.slice(0, 12);
}

// ── Competitor Analysis ────────────────────────────────────────────────────
//
// Per-competitor rollup powering the AI Checker "Competitors" page (cards
// grid, bubble chart, detail drawer). Uses the same input shape as
// computePhraseVisibility / computeOpportunities — single pass over the
// already-loaded results, no extra DB hits.

export type CompetitorSourceType = 'blog' | 'docs' | 'case_study' | 'comparison' | 'product' | 'other';

export interface CompetitorAnalysisRow {
  host: string;
  /** Competitor table metadata (carries through unchanged from DB). */
  rank: number | null;
  threatLevel: 'High' | 'Medium' | 'Low' | null;
  similarityScore: number | null;
  reasoning: string | null;
  industry: string | null;
  companySize: string | null;
  /** Aggregates derived from AiQueryResult.competitorMentions / citations. */
  mentions: number;             // total mention count across all results
  promptCoverage: number;       // distinct prompts the competitor appeared in
  coveragePct: number;          // promptCoverage / totalQueriedPrompts (0..1)
  avgSentiment: number | null;  // -10..10 raw; null when no sentiment samples
  avgRankPosition: number | null;
  marketShare: number;          // 0..1 of all competitor mentions in run
  /** Most-common prompt category the competitor wins on. */
  strongestPromptCluster: { category: string; count: number } | null;
  /** Citation breakdown filtered to the competitor's own host. */
  topCitedSourceTypes: Array<{ type: CompetitorSourceType; count: number }>;
  /** Prompts where this competitor is mentioned — feeds the LLM insight pass. */
  examplePromptIds: number[];
}

export interface CompetitorAnalysisOwnBrand {
  host: string;
  mentions: number;
  marketShare: number;
  avgSentiment: number | null;
}

export interface CompetitorAnalysisOutput {
  competitors: CompetitorAnalysisRow[];
  ownBrand: CompetitorAnalysisOwnBrand;
  totals: {
    prompts: number;             // distinct queried prompts
    results: number;             // total AiQueryResult rows
    competitorMentions: number;  // sum of mentions across all competitors
  };
}

/** Classify a citation URL into a coarse content type. */
function classifyCitationUrl(url: string): CompetitorSourceType {
  const path = (() => {
    try { return new URL(url).pathname.toLowerCase(); } catch { return url.toLowerCase(); }
  })();
  if (/\/(blog|articles?|insights?|news|posts?|guides?)\b/.test(path)) return 'blog';
  if (/\/(docs?|documentation|developer|api|reference|help|support)\b/.test(path)) return 'docs';
  if (/\/(case-?stud(y|ies)|customers?|success-?stor(y|ies))\b/.test(path)) return 'case_study';
  if (/\/(compare|comparison|vs|alternatives?|reviews?)\b/.test(path)) return 'comparison';
  if (/\/(products?|features?|platform|solutions?|pricing)\b/.test(path)) return 'product';
  return 'other';
}

export function computeCompetitorAnalysis(input: AnalyticsInput): CompetitorAnalysisOutput {
  const selectedSet = new Set(input.selectedCompetitorHosts.map((h) => h.toLowerCase()));
  const promptById = new Map(input.prompts.map((p) => [p.id, p]));

  // Per-competitor accumulators.
  type Acc = {
    mentions: number;
    promptIds: Set<number>;
    sentimentSum: number;
    sentimentCount: number;
    rankSum: number;
    rankCount: number;
    categoryCounts: Map<string, number>;
    sourceTypeCounts: Map<CompetitorSourceType, number>;
  };
  const accByHost = new Map<string, Acc>();
  const ensureAcc = (host: string): Acc => {
    let a = accByHost.get(host);
    if (!a) {
      a = {
        mentions: 0,
        promptIds: new Set(),
        sentimentSum: 0,
        sentimentCount: 0,
        rankSum: 0,
        rankCount: 0,
        categoryCounts: new Map(),
        sourceTypeCounts: new Map(),
      };
      accByHost.set(host, a);
    }
    return a;
  };

  // Own-brand accumulators.
  let ownBrandMentions = 0;
  let ownSentimentSum = 0;
  let ownSentimentCount = 0;

  // Single pass over results.
  for (const r of input.results) {
    ownBrandMentions += r.presence;
    if (r.presence === 1 && r.sentiment !== null && r.sentiment !== undefined) {
      ownSentimentSum += r.sentiment;
      ownSentimentCount += 1;
    }

    const prompt = promptById.get(r.promptId);
    const category = prompt?.category ?? 'uncategorized';

    const compMentions = Array.isArray(r.competitorMentions)
      ? (r.competitorMentions as Array<{ host?: string; count?: number; sentiment?: number | null; rankPosition?: number | null }>)
      : [];
    for (const m of compMentions) {
      const host = (m.host ?? '').toLowerCase();
      if (!host || !selectedSet.has(host)) continue;
      const a = ensureAcc(host);
      const count = typeof m.count === 'number' && m.count > 0 ? m.count : 1;
      a.mentions += count;
      a.promptIds.add(r.promptId);
      if (typeof m.sentiment === 'number') {
        a.sentimentSum += m.sentiment;
        a.sentimentCount += 1;
      }
      if (typeof m.rankPosition === 'number' && m.rankPosition > 0) {
        a.rankSum += m.rankPosition;
        a.rankCount += 1;
      }
      a.categoryCounts.set(category, (a.categoryCounts.get(category) ?? 0) + count);
    }

    // Fallback for legacy competitorHosts array (no count/sentiment).
    const fallbackHosts = Array.isArray(r.competitorHosts) ? (r.competitorHosts as unknown[]) : [];
    for (const raw of fallbackHosts) {
      const host = typeof raw === 'string' ? raw.toLowerCase() : '';
      if (!host || !selectedSet.has(host)) continue;
      const a = ensureAcc(host);
      if (!a.promptIds.has(r.promptId)) {
        a.mentions += 1;
        a.promptIds.add(r.promptId);
        a.categoryCounts.set(category, (a.categoryCounts.get(category) ?? 0) + 1);
      }
    }

    // Citation classification — only for hosts in selectedSet.
    const citations = Array.isArray(r.citations) ? (r.citations as Array<{ host?: string; url?: string }>) : [];
    for (const c of citations) {
      const host = (c.host ?? '').toLowerCase();
      if (!host || !selectedSet.has(host)) continue;
      const a = ensureAcc(host);
      const url = typeof c.url === 'string' ? c.url : '';
      const type = url ? classifyCitationUrl(url) : 'other';
      a.sourceTypeCounts.set(type, (a.sourceTypeCounts.get(type) ?? 0) + 1);
    }
  }

  const totalCompetitorMentions = [...accByHost.values()].reduce((s, a) => s + a.mentions, 0);
  const totalQueriedPrompts = new Set(input.results.map((r) => r.promptId)).size;
  const totalMentionsForSov = ownBrandMentions + totalCompetitorMentions;

  const competitors: CompetitorAnalysisRow[] = [...accByHost.entries()].map(([host, a]) => {
    const strongest = [...a.categoryCounts.entries()].sort((x, y) => y[1] - x[1])[0] ?? null;
    const topCitedSourceTypes = [...a.sourceTypeCounts.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((x, y) => y.count - x.count)
      .slice(0, 3);
    return {
      host,
      // metadata is filled in by the route handler from the Competitor table
      rank: null,
      threatLevel: null,
      similarityScore: null,
      reasoning: null,
      industry: null,
      companySize: null,
      mentions: a.mentions,
      promptCoverage: a.promptIds.size,
      coveragePct: totalQueriedPrompts > 0 ? a.promptIds.size / totalQueriedPrompts : 0,
      avgSentiment: a.sentimentCount > 0 ? Number((a.sentimentSum / a.sentimentCount).toFixed(2)) : null,
      avgRankPosition: a.rankCount > 0 ? Number((a.rankSum / a.rankCount).toFixed(2)) : null,
      marketShare: totalCompetitorMentions > 0 ? a.mentions / totalCompetitorMentions : 0,
      strongestPromptCluster: strongest ? { category: strongest[0], count: strongest[1] } : null,
      topCitedSourceTypes,
      examplePromptIds: [...a.promptIds].slice(0, 5),
    };
  });

  // Ensure every selected competitor appears even if not yet mentioned in
  // any response — the cards grid should still render an empty-state row.
  for (const host of selectedSet) {
    if (competitors.find((c) => c.host === host)) continue;
    competitors.push({
      host,
      rank: null,
      threatLevel: null,
      similarityScore: null,
      reasoning: null,
      industry: null,
      companySize: null,
      mentions: 0,
      promptCoverage: 0,
      coveragePct: 0,
      avgSentiment: null,
      avgRankPosition: null,
      marketShare: 0,
      strongestPromptCluster: null,
      topCitedSourceTypes: [],
      examplePromptIds: [],
    });
  }

  competitors.sort((a, b) => b.mentions - a.mentions);

  return {
    competitors,
    ownBrand: {
      host: input.ownDomainHost,
      mentions: ownBrandMentions,
      marketShare: totalMentionsForSov > 0 ? ownBrandMentions / totalMentionsForSov : 0,
      avgSentiment: ownSentimentCount > 0 ? Number((ownSentimentSum / ownSentimentCount).toFixed(2)) : null,
    },
    totals: {
      prompts: totalQueriedPrompts,
      results: input.results.length,
      competitorMentions: totalCompetitorMentions,
    },
  };
}

// ── tiny helpers ───────────────────────────────────────────────────────────

function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}
