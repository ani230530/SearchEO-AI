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
      'Best AI citation tracking tools for agencies',
      'What are the best brand mention tracking tools for client reports?',
      'Who specializes in ChatGPT citation tracking for SEO teams?',
      'Are there any good independent tools for Perplexity mentions?',
      'I want a tool that can help with AI citations, competitor mentions, and client reporting.',
      'What should I ask before choosing an AI search tracking tool?',
    ];

    const result = validateHumanPromptSet(prompts, validationOptions);

    expect(result.pass).toBe(true);
    expect(result.failures).toEqual([]);
    expect(result.wordCounts).toEqual([7, 11, 9, 9, 15, 11]);
    expect(result.buckets).toEqual({
      under7: 0,
      sevenTo13: 5,
      fourteenTo28: 1,
      twentyNineTo55: 0,
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
    expect(result.failures).toContain('need at least one prompt from 14-28 words');
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
        locations: [],
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
        locations: [],
        priceBand: 'freemium',
        year: '2026',
      },
    });

    const prompts = [
      'Best version control platforms for small teams',
      'What are the best private repo tools for code reviews?',
      'Who specializes in workflow automation for engineering teams?',
      'Are there any good developer collaboration tools for permissions?',
      'I want a tool that can help with code collaboration, CI/CD, and access control.',
      'What should I ask before choosing a version control platform?',
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
