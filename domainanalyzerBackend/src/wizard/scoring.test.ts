import { describe, it, expect } from 'vitest';
import {
  cosineSimilarity,
  jaccardSimilarity,
  locationMatch,
  sizeMatch,
  scoreCandidate,
  topN,
  DEFAULT_WEIGHTS,
} from './scoring';
import type { VerifiedCompetitor } from './types';

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors (mapped to 0..1, identical → 1)', () => {
    expect(cosineSimilarity([1, 0, 1], [1, 0, 1])).toBeCloseTo(1, 4);
  });

  it('returns 0.5 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0.5, 4);
  });

  it('returns 0 for opposite vectors', () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(0, 4);
  });

  it('returns 0 for empty / mismatched / zero vectors', () => {
    expect(cosineSimilarity([], [1])).toBe(0);
    expect(cosineSimilarity([1, 2], [1])).toBe(0);
    expect(cosineSimilarity([0, 0], [0, 0])).toBe(0);
  });
});

describe('jaccardSimilarity', () => {
  it('handles full overlap', () => {
    expect(jaccardSimilarity(['a', 'b'], ['b', 'a'])).toBe(1);
  });

  it('handles partial overlap', () => {
    expect(jaccardSimilarity(['a', 'b', 'c'], ['b', 'c', 'd'])).toBeCloseTo(0.5, 4);
  });

  it('handles no overlap', () => {
    expect(jaccardSimilarity(['a'], ['b'])).toBe(0);
  });

  it('is case-insensitive and whitespace-trimmed', () => {
    expect(jaccardSimilarity([' A ', 'b'], ['a', 'B'])).toBe(1);
  });

  it('returns 0 for two empty sets', () => {
    expect(jaccardSimilarity([], [])).toBe(0);
  });
});

describe('locationMatch', () => {
  it('returns 1 for same country + state', () => {
    expect(locationMatch({ country: 'US', state: 'CA' }, { country: 'US', state: 'CA' })).toBe(1);
  });

  it('returns 0.5 for same country, different state', () => {
    expect(locationMatch({ country: 'US', state: 'CA' }, { country: 'US', state: 'NY' })).toBe(0.5);
  });

  it('returns 0 for different country', () => {
    expect(locationMatch({ country: 'US', state: null }, { country: 'IN', state: null })).toBe(0);
  });

  it('returns 0 for missing country on either side', () => {
    expect(locationMatch({ country: null, state: 'CA' }, { country: 'US', state: 'CA' })).toBe(0);
    expect(locationMatch(null, { country: 'US', state: null })).toBe(0);
  });

  it('returns 0.5 when state is missing on either side but country matches', () => {
    expect(locationMatch({ country: 'US', state: null }, { country: 'US', state: 'CA' })).toBe(0.5);
  });
});

describe('sizeMatch', () => {
  it('returns 1 for same tier', () => {
    expect(sizeMatch('smb', 'smb')).toBe(1);
  });

  it('returns 0.5 for adjacent tiers', () => {
    expect(sizeMatch('smb', 'mid')).toBe(0.5);
    expect(sizeMatch('solo', 'smb')).toBe(0.5);
  });

  it('returns 0.25 for two-apart', () => {
    expect(sizeMatch('solo', 'mid')).toBe(0.25);
  });

  it('returns 0 for far-apart', () => {
    expect(sizeMatch('solo', 'enterprise')).toBe(0);
  });

  it('returns 0 if either is null', () => {
    expect(sizeMatch(null, 'smb')).toBe(0);
    expect(sizeMatch('smb', null)).toBe(0);
  });
});

const verified = (overrides: Partial<VerifiedCompetitor> = {}): VerifiedCompetitor => ({
  competitorHost: 'rival.com',
  source: 'serp',
  rawSignals: {},
  verified: true,
  industry: 'SaaS',
  location: 'US',
  companySize: 'smb',
  candidateText: 'we are a saas',
  ...overrides,
});

describe('scoreCandidate', () => {
  it('combines all four signals with default weights', () => {
    const out = scoreCandidate({
      domainEmbedding: [1, 0, 1],
      domainSeedKeywords: ['analytics', 'crm'],
      domainLocation: { country: 'US', state: null },
      domainSize: 'smb',
      candidate: verified(),
      candidateEmbedding: [1, 0, 1],
      candidateSeedKeywords: ['analytics', 'crm'],
    });
    // 1 * 0.4 + 1 * 0.2 + 0.5 * 0.2 (no state) + 1 * 0.2 = 0.9
    expect(out.similarityScore).toBeCloseTo(0.9, 4);
  });

  it('returns the candidate spread + similarityScore', () => {
    const c = verified({ industry: 'Marketing' });
    const out = scoreCandidate({
      domainEmbedding: null,
      domainSeedKeywords: [],
      domainLocation: null,
      domainSize: null,
      candidate: c,
      candidateEmbedding: null,
      candidateSeedKeywords: [],
    });
    expect(out.industry).toBe('Marketing');
    expect(out.similarityScore).toBe(0);
  });

  it('honours custom weights', () => {
    const c = verified();
    const out = scoreCandidate(
      {
        domainEmbedding: null,
        domainSeedKeywords: [],
        domainLocation: { country: 'US', state: null },
        domainSize: null,
        candidate: c,
        candidateEmbedding: null,
        candidateSeedKeywords: [],
      },
      { embedding: 0, keywordOverlap: 0, location: 1, size: 0 }
    );
    expect(out.similarityScore).toBe(0.5); // location-only: same country, state null
  });

  it('clamps result into 0..1', () => {
    // Even with all signals at 1, default weights sum to 1 so we never exceed 1.
    const out = scoreCandidate({
      domainEmbedding: [1],
      domainSeedKeywords: ['a'],
      domainLocation: { country: 'US', state: 'CA' },
      domainSize: 'smb',
      candidate: verified({ location: 'US', companySize: 'smb' }),
      candidateEmbedding: [1],
      candidateSeedKeywords: ['a'],
    });
    expect(out.similarityScore).toBeLessThanOrEqual(1);
    expect(out.similarityScore).toBeGreaterThanOrEqual(0);
  });
});

describe('topN', () => {
  it('returns the highest-scored items in order', () => {
    const items = [
      { id: 1, similarityScore: 0.3 },
      { id: 2, similarityScore: 0.9 },
      { id: 3, similarityScore: 0.5 },
    ];
    expect(topN(items, 2).map((i) => i.id)).toEqual([2, 3]);
  });

  it('returns all items when n exceeds length', () => {
    const items = [{ id: 1, similarityScore: 0.5 }];
    expect(topN(items, 10).length).toBe(1);
  });

  it('does not mutate the input', () => {
    const items = [{ id: 1, similarityScore: 0.1 }, { id: 2, similarityScore: 0.5 }];
    const before = items.map((i) => i.id);
    topN(items, 2);
    expect(items.map((i) => i.id)).toEqual(before);
  });
});

describe('default weights sum to 1', () => {
  it('keeps similarityScore in 0..1 with default weights', () => {
    const sum = DEFAULT_WEIGHTS.embedding + DEFAULT_WEIGHTS.keywordOverlap + DEFAULT_WEIGHTS.location + DEFAULT_WEIGHTS.size;
    expect(sum).toBeCloseTo(1, 6);
  });
});
