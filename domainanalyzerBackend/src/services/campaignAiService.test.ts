/**
 * Tests for the keyword-shape validator used as defense-in-depth alongside
 * the LLM prompt in campaignAiService. The prompt asks for crisp short
 * keywords, but the model occasionally slips into phrase / question /
 * marketing-blurb mode — this filter is what keeps those out of the worksheet.
 */
import { describe, it, expect } from 'vitest';
import { isKeywordShaped } from './campaignAiService';

describe('isKeywordShaped', () => {
  describe('accepts crisp SEO keywords', () => {
    const accepted = [
      'version control',
      'git rebase',
      'self hosted git',
      'open source version control system',
      'version control for designers',
      'distributed vcs',
      'monorepo',
      'github vs gitlab',
    ];

    for (const term of accepted) {
      it(`accepts "${term}"`, () => {
        expect(isKeywordShaped(term)).toBe(true);
      });
    }
  });

  describe('rejects phrases / questions / marketing blurbs', () => {
    const rejected: Array<[string, string]> = [
      ['', 'empty string'],
      ['   ', 'whitespace only'],
      ['What is the best version control system for remote teams?', 'question with question mark'],
      ['How do I migrate from svn to git', 'how question'],
      ['Why use a distributed version control system', 'why question'],
      ['When should I use git rebase', 'when question'],
      ['Best version control system for small remote teams', 'best/for marketing phrase'],
      ['Top 10 version control tools for developers in 2026', 'top/for marketing phrase'],
      ['Ultimate guide to git workflows', 'ultimate guide phrase'],
      ['Complete guide to monorepo setup', 'complete guide phrase'],
      ['Step by step git tutorial for beginners', 'step by step phrase'],
      ['step-by-step git tutorial', 'step-by-step variant'],
      [
        'version control software for distributed engineering teams working remotely globally',
        '11 words — too long',
      ],
      [
        'A really really really really really long keyword string that goes way past fifty characters',
        '> 50 chars',
      ],
      ['Git is a distributed version control system.', 'ends with period'],
      ['Use git!', 'ends with exclamation'],
    ];

    for (const [term, label] of rejected) {
      it(`rejects ${label}: "${term}"`, () => {
        expect(isKeywordShaped(term)).toBe(false);
      });
    }
  });

  it('trims surrounding whitespace before validating', () => {
    expect(isKeywordShaped('   git rebase   ')).toBe(true);
  });

  it('accepts terms with up to seven words', () => {
    expect(isKeywordShaped('best git client for windows remote teams')).toBe(true);
  });

  it('rejects terms with eight or more words', () => {
    expect(
      isKeywordShaped('best git client for windows remote teams worldwide today')
    ).toBe(false);
  });
});
