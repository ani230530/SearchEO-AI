import { canonicalizeUrl } from './crawlPolicyService';
import type { CrawlPolicy, PageSnapshot, UrlCandidate } from './domainContextTypes';

const HIGH_VALUE_SEGMENTS = [
  '/about',
  '/about-us',
  '/company',
  '/services',
  '/solutions',
  '/products',
  '/what-we-do',
  '/pricing',
  '/plans',
  '/contact',
  '/contact-us',
  '/docs',
  '/documentation',
  '/blog',
  '/features',
  '/industries',
  '/who-we-serve',
  '/customers',
  '/use-cases',
  '/integrations',
  '/partners',
  '/careers',
  '/jobs',
  '/team',
  '/testimonials',
  '/case-studies',
];

export function scoreUrl(url: string, baseUrl: string): number {
  let parsed: URL;
  try {
    parsed = new URL(url, baseUrl);
  } catch {
    return 0;
  }

  const path = parsed.pathname.toLowerCase();
  let score = 0;

  if (path === '/' || path === '') {
    score += 120;
  }

  for (const segment of HIGH_VALUE_SEGMENTS) {
    if (path.includes(segment)) {
      score += 50;
    }
  }

  if (path.split('/').filter(Boolean).length <= 2) {
    score += 15;
  }

  if (/\b(blog|docs|guides?)\b/.test(path)) {
    score += 10;
  }

  if (/\b(login|register|cart|checkout|account|privacy|terms|wp-admin)\b/.test(path)) {
    score -= 150;
  }

  return score;
}

function dedupeCandidates(candidates: UrlCandidate[], baseUrl: string): UrlCandidate[] {
  const seen = new Set<string>();
  const deduped: UrlCandidate[] = [];

  for (const candidate of candidates.sort((a, b) => b.priority - a.priority)) {
    const canonicalUrl = canonicalizeUrl(candidate.url, baseUrl);
    if (seen.has(canonicalUrl)) {
      continue;
    }
    seen.add(canonicalUrl);
    deduped.push({ ...candidate, url: canonicalUrl });
  }

  return deduped;
}

export function buildInitialUrlCandidates(params: {
  policy: CrawlPolicy;
  sitemapUrls: string[];
  priorityUrls?: string[];
  customPaths?: string[];
}): UrlCandidate[] {
  const { policy, sitemapUrls, priorityUrls = [], customPaths = [] } = params;
  const baseCandidates: UrlCandidate[] = [
    {
      url: policy.baseUrl,
      discoveredVia: 'homepage',
      priority: 200,
    },
  ];

  for (const url of priorityUrls) {
    baseCandidates.push({
      url,
      discoveredVia: 'priority',
      priority: 300 + scoreUrl(url, policy.baseUrl),
    });
  }

  for (const path of customPaths) {
    const normalized = path.startsWith('http') ? path : new URL(path.startsWith('/') ? path : `/${path}`, policy.baseUrl).toString();
    baseCandidates.push({
      url: normalized,
      discoveredVia: 'custom_path',
      priority: 250 + scoreUrl(normalized, policy.baseUrl),
    });
  }

  for (const url of sitemapUrls.slice(0, 50)) {
    baseCandidates.push({
      url,
      discoveredVia: 'sitemap',
      priority: 100 + scoreUrl(url, policy.baseUrl),
    });
  }

  return dedupeCandidates(baseCandidates, policy.baseUrl).slice(0, policy.maxPages * 4);
}

export function expandCandidatesFromPage(params: {
  page: PageSnapshot;
  policy: CrawlPolicy;
  knownUrls: Set<string>;
}): UrlCandidate[] {
  const { page, policy, knownUrls } = params;
  const candidates: UrlCandidate[] = [];

  if (page.canonicalUrl && !knownUrls.has(page.canonicalUrl)) {
    candidates.push({
      url: page.canonicalUrl,
      discoveredVia: 'canonical',
      priority: page.contentScore + 30 + scoreUrl(page.canonicalUrl, policy.baseUrl),
      sourceUrl: page.url,
    });
  }

  for (const link of page.internalLinks.slice(0, policy.maxPages * 2)) {
    const canonical = canonicalizeUrl(link, policy.baseUrl);
    if (knownUrls.has(canonical)) {
      continue;
    }

    candidates.push({
      url: canonical,
      discoveredVia: 'internal_link',
      priority: 60 + scoreUrl(canonical, policy.baseUrl),
      sourceUrl: page.url,
    });
  }

  return dedupeCandidates(candidates, policy.baseUrl);
}
