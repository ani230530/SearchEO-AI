import { describe, expect, it } from 'vitest';
import { deriveProductContext, refineCategory } from './enrichmentService';

describe('refineCategory', () => {
  it('does not use broad selected industry as the buyer-facing category', () => {
    const category = refineCategory({
      category: 'Technology & IT',
      inferredIndustry: 'Technology & IT',
      useCases: ['Version control for collaborative coding'],
      summary: 'GitHub provides code hosting, Git repositories, pull requests, and developer collaboration.',
    });

    expect(category).toBe('version control platform');
  });

  it('derives prompt context from crawl language, not the selected industry', () => {
    const productContext = deriveProductContext({
      category: 'version control platform',
      useCases: ['Version control for collaborative coding'],
      summary: 'GitHub provides code hosting, Git repositories, pull requests, and developer collaboration.',
    });

    expect(productContext).toBe('version control and code collaboration');
  });

  it('keeps a specific product/service category', () => {
    const category = refineCategory({
      category: 'luxury hotel brand',
      inferredIndustry: 'Hospitality & Tourism',
      useCases: ['Booking high-end venues'],
      summary: 'Luxury hotels and resorts for travelers.',
    });

    expect(category).toBe('luxury hotel brand');
  });
});
