import { describe, expect, it } from 'vitest';
import { mapN8nPromptResearchResponse } from './n8nPromptResearchService';

const context = {
  category: 'AI SEO tools',
  vertical: 'B2B SaaS',
  personas: ['B2B marketer'],
  useCases: ['content optimization'],
  constraints: ['small team'],
  competitors: ['semrush.com', 'ahrefs.com'],
  locations: [],
  priceBand: 'paid',
  productContext: 'AI SEO content optimization',
  year: '2026',
};

describe('mapN8nPromptResearchResponse', () => {
  it('maps n8n prompt groups into domain-analysis prompt categories', () => {
    const prompts = mapN8nPromptResearchResponse(
      {
        niche: 'surferseo',
        input: 'https://www.surferseo.com/',
        total: 4,
        prompts: {
          problem_statement: ['how to optimize content for ai search'],
          top_n: ['best SEO content optimization tools'],
          alternatives: ['alternative to Semrush for SEO analysis'],
          recommendation: ['recommend Surfer SEO for a small marketing team'],
        },
      },
      {
        brand: 'Surfer SEO',
        host: 'surferseo.com',
        url: 'https://www.surferseo.com/',
        context,
      }
    );

    expect(prompts).toHaveLength(4);
    expect(prompts.map((prompt) => prompt.category)).toEqual([
      'problem_statement',
      'top_n_listicle',
      'alternatives_to_competitor',
      'unbranded_recommendation',
    ]);
    expect(prompts.find((prompt) => prompt.category === 'alternatives_to_competitor')).toMatchObject({
      competitorMentioned: 'semrush',
      keyword: 'semrush alternatives',
      intent: 'Commercial',
    });
    expect(prompts.find((prompt) => prompt.text.includes('Surfer SEO'))?.isBranded).toBe(true);
  });
});
