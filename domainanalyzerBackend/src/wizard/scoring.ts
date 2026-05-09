/**
 * Deterministic scoring functions for the competitor pipeline.
 *
 * Pure, no side effects, no LLM. Same inputs → same outputs. This is the layer
 * that replaces "ask GPT to rank candidates" — we score them ourselves so two
 * runs with the same data produce the same ranking.
 */

import type { CompanySize, ScoredCompetitor, VerifiedCompetitor } from './types';

/** Cosine similarity of two same-length number vectors. Returns 0..1 (clamped from -1..1 → 0..1). */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a?.length || !b?.length || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  const cos = dot / (Math.sqrt(na) * Math.sqrt(nb));
  return Math.max(0, Math.min(1, (cos + 1) / 2));
}

/** Jaccard similarity of two string sets. Case-insensitive, whitespace-trimmed. */
export function jaccardSimilarity(a: string[], b: string[]): number {
  const norm = (s: string) => s.toLowerCase().trim();
  const sa = new Set(a.map(norm).filter(Boolean));
  const sb = new Set(b.map(norm).filter(Boolean));
  if (sa.size === 0 && sb.size === 0) return 0;
  let intersection = 0;
  for (const x of sa) if (sb.has(x)) intersection++;
  const union = sa.size + sb.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Location match: same country+state→1, same country→0.5, else 0. Tolerant of nulls. */
export function locationMatch(
  a: { country: string | null; state: string | null } | null,
  b: { country: string | null; state: string | null } | null
): number {
  if (!a || !b) return 0;
  const ac = (a.country ?? '').toLowerCase().trim();
  const bc = (b.country ?? '').toLowerCase().trim();
  if (!ac || !bc) return 0;
  if (ac !== bc) return 0;
  const as = (a.state ?? '').toLowerCase().trim();
  const bs = (b.state ?? '').toLowerCase().trim();
  if (!as || !bs) return 0.5;
  return as === bs ? 1 : 0.5;
}

/**
 * Company-size proximity. Same tier=1, adjacent=0.5, two apart=0.25, far=0.
 * Order: solo < smb < mid < enterprise.
 */
const SIZE_ORDER: CompanySize[] = ['solo', 'smb', 'mid', 'enterprise'];
export function sizeMatch(a: CompanySize | null, b: CompanySize | null): number {
  if (!a || !b) return 0;
  const ai = SIZE_ORDER.indexOf(a);
  const bi = SIZE_ORDER.indexOf(b);
  if (ai < 0 || bi < 0) return 0;
  const diff = Math.abs(ai - bi);
  if (diff === 0) return 1;
  if (diff === 1) return 0.5;
  if (diff === 2) return 0.25;
  return 0;
}

export interface ScoreInputs {
  domainEmbedding: number[] | null;
  domainSeedKeywords: string[];
  domainLocation: { country: string | null; state: string | null } | null;
  domainSize: CompanySize | null;
  candidate: VerifiedCompetitor;
  candidateEmbedding: number[] | null;
  candidateSeedKeywords: string[];
}

export interface ScoreWeights {
  embedding: number;
  keywordOverlap: number;
  location: number;
  size: number;
}

export const DEFAULT_WEIGHTS: ScoreWeights = {
  embedding: 0.4,
  keywordOverlap: 0.2,
  location: 0.2,
  size: 0.2,
};

export function scoreCandidate(
  inputs: ScoreInputs,
  weights: ScoreWeights = DEFAULT_WEIGHTS
): ScoredCompetitor {
  const { candidate } = inputs;
  const embScore =
    inputs.domainEmbedding && inputs.candidateEmbedding
      ? cosineSimilarity(inputs.domainEmbedding, inputs.candidateEmbedding)
      : 0;
  const kwScore = jaccardSimilarity(inputs.domainSeedKeywords, inputs.candidateSeedKeywords);
  const locScore = locationMatch(inputs.domainLocation, {
    country: candidate.location ?? null,
    state: null,
  });
  const sizeScore = sizeMatch(inputs.domainSize, candidate.companySize);

  const total =
    embScore * weights.embedding +
    kwScore * weights.keywordOverlap +
    locScore * weights.location +
    sizeScore * weights.size;

  return { ...candidate, similarityScore: Math.max(0, Math.min(1, total)) };
}

/** Sort scored competitors high → low and slice the top N. */
export function topN<T extends { similarityScore: number }>(items: T[], n: number): T[] {
  return [...items].sort((a, b) => b.similarityScore - a.similarityScore).slice(0, n);
}
