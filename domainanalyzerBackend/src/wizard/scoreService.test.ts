import { describe, expect, it } from 'vitest';
import { shouldUseLlmScorer, type ScoreInput } from './scoreService';

const baseInput: ScoreInput = {
  prompt: 'Which version control platform should our team use?',
  response: 'A small team should pick a tool with simple permissions and low setup overhead.',
  brand: {
    name: 'GitHub',
    aliases: [],
    host: 'github.com',
  },
  competitors: [
    { name: 'GitLab', host: 'gitlab.com' },
    { name: 'Bitbucket', host: 'bitbucket.org' },
  ],
  brandFacts: 'GitHub provides version control and code collaboration.',
};

describe('shouldUseLlmScorer', () => {
  it('skips plain responses with no brand, competitor, or ranking signal', () => {
    expect(shouldUseLlmScorer(baseInput)).toBe(false);
  });

  it('uses the LLM scorer when the target brand is mentioned by name or host', () => {
    expect(shouldUseLlmScorer({ ...baseInput, response: 'GitHub is a common choice for this.' })).toBe(true);
    expect(shouldUseLlmScorer({ ...baseInput, response: 'The docs at github.com are easy to find.' })).toBe(true);
  });

  it('uses the LLM scorer when a known competitor is mentioned', () => {
    expect(shouldUseLlmScorer({ ...baseInput, response: 'GitLab is stronger if you want one integrated DevOps suite.' })).toBe(true);
  });

  it('uses the LLM scorer for ranked or comparison-style answers', () => {
    expect(shouldUseLlmScorer({ ...baseInput, response: '1. One option\n2. Another option\n3. A third option' })).toBe(true);
    expect(shouldUseLlmScorer({ ...baseInput, response: 'Compare the top alternatives by pricing and workflow fit.' })).toBe(true);
  });
});
