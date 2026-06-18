import { describe, expect, it } from 'vitest';
import { buildPromptDiversityThemes, validateHumanPromptSet } from './humanPromptService';

const validationOptions = {
  targetBrand: 'SearchEO AI',
  competitors: ['Ahrefs', 'Semrush', 'Sistrix'],
  commercialTerms: ['AI search tracking', 'citations', 'brand mentions'],
};

describe('validateHumanPromptSet', () => {
  it('accepts a mixed human-like prompt set with commercial intent', () => {
    const prompts = [
      'Anyone tracking AI citations yet?',
      'Is AI search tracking worth paying for yet?',
      'Ahrefs vs Semrush for AI citations - which is less messy?',
      'I am still manually checking ChatGPT and Perplexity for clients. What are people using instead?',
      'Do any cheaper tools show why an AI answer cites a competitor and not our site?',
      'We use Sistrix and Semrush for regular SEO, but clients are asking about ChatGPT, Gemini, and Perplexity mentions now. Is there a budget-friendly way to track this without buying another huge SaaS dashboard?',
    ];

    const result = validateHumanPromptSet(prompts, validationOptions);

    expect(result.pass).toBe(true);
    expect(result.failures).toEqual([]);
    expect(result.wordCounts).toEqual([5, 8, 11, 15, 16, 33]);
    expect(result.buckets).toEqual({
      under7: 1,
      sevenTo13: 2,
      fourteenTo28: 2,
      twentyNineTo55: 1,
    });
    expect(result.targetBrandCount).toBe(0);
    expect(result.duplicateCount).toBe(0);
    expect(result.bannedWordHits).toEqual([]);
  });

  it('rejects polished, branded, duplicate, and unbalanced prompt sets', () => {
    const prompts = [
      'How can SearchEO AI unlock comprehensive AI visibility?',
      'How can SearchEO AI unlock comprehensive AI visibility?',
      'Ensure robust AI visibility tracking for enterprise teams',
      'Best AI visibility tools',
      'Best AI visibility tools',
      'Optimize the strategic AI visibility landscape',
    ];

    const result = validateHumanPromptSet(prompts, validationOptions);

    expect(result.pass).toBe(false);
    expect(result.failures).toContain('target brand leaked into prompt set');
    expect(result.failures).toContain('2 duplicate prompt(s)');
    expect(result.failures).toContain('AI-polished banned words found');
    expect(result.failures).toContain('need at least one prompt from 29-55 words');
  });

  it('rejects human-sounding sets that collapse around one keyword angle', () => {
    const diversityThemes = buildPromptDiversityThemes({
      brand: 'GitHub',
      host: 'github.com',
      signals: [],
      context: {
        category: 'version control platform',
        vertical: 'software development',
        productContext: 'version control and code collaboration',
        personas: ['software team lead', 'startup developer', 'engineering manager'],
        useCases: [
          'collaborate on software projects',
          'manage version control for code',
          'automate development workflows',
        ],
        constraints: ['team permissions', 'code review workflow', 'budget fit'],
        competitors: ['gitlab.com', 'bitbucket.org'],
        priceBand: 'freemium',
        year: '2026',
      },
    });

    const narrowPrompts = [
      'version control worth it yet?',
      'Is version control worth paying for yet?',
      'Any cheaper version control tools for teams?',
      'Which version control platform feels less messy?',
      'I am comparing version control options. What are people using?',
      'We need a version control platform and keep asking about version control pricing, version control setup, and whether another version control dashboard is worth paying for this year.',
    ];

    const result = validateHumanPromptSet(narrowPrompts, {
      targetBrand: 'GitHub',
      competitors: ['gitlab.com', 'bitbucket.org'],
      commercialTerms: ['version control', 'code collaboration', 'workflow automation'],
      diversityThemes,
    });

    expect(result.pass).toBe(false);
    expect(result.failures).toContain('too many prompts focus on the same topic angle');
  });

  it('accepts a GitHub-like set spread across scraped product angles', () => {
    const diversityThemes = buildPromptDiversityThemes({
      brand: 'GitHub',
      host: 'github.com',
      signals: [],
      context: {
        category: 'version control platform',
        vertical: 'software development',
        productContext: 'version control and code collaboration',
        personas: ['software team lead', 'startup developer', 'engineering manager'],
        useCases: [
          'collaborate on software projects',
          'manage version control for code',
          'automate development workflows',
        ],
        constraints: ['team permissions', 'code review workflow', 'budget fit'],
        competitors: ['gitlab.com', 'bitbucket.org'],
        priceBand: 'freemium',
        year: '2026',
      },
    });

    const prompts = [
      'Code collaboration worth it yet?',
      'Is version control worth paying for yet?',
      'Anyone using pull request reviews for small teams, or are people still doing this by hand?',
      'gitlab.com vs bitbucket.org when permissions matter - which feels less messy?',
      "I'm comparing workflow automation options for code reviews. What are people actually using instead?",
      'We need code collaboration for a small engineering team, but people keep asking about permissions, automation, and cost before we switch. Is there a budget-friendly version control option teams actually trust?',
    ];

    const result = validateHumanPromptSet(prompts, {
      targetBrand: 'GitHub',
      competitors: ['gitlab.com', 'bitbucket.org'],
      commercialTerms: ['version control', 'code collaboration', 'workflow automation', 'permissions'],
      diversityThemes,
    });

    expect(result.pass).toBe(true);
    expect(result.topicCoverageCount).toBeGreaterThanOrEqual(4);
  });
});
