export type DiscoverySource =
  | 'priority'
  | 'custom_path'
  | 'homepage'
  | 'sitemap'
  | 'internal_link'
  | 'canonical';

export type PageFetchMode = 'http' | 'browser' | 'cached';

export interface CrawlPolicyRule {
  directive: 'allow' | 'disallow';
  path: string;
  userAgent: string;
}

export interface CrawlPolicy {
  baseUrl: string;
  normalizedDomain: string;
  robotsUrl: string;
  robotsStatus: number | null;
  robotsFetched: boolean;
  sitemaps: string[];
  discoveredSitemapUrls: number;
  rules: CrawlPolicyRule[];
  maxPages: number;
  userAgent: string;
  rateLimits: {
    hostConcurrency: number;
    globalConcurrency: number;
    retryBackoffMs: number[];
  };
  timeouts: {
    connectMs: number;
    responseMs: number;
    browserMs: number;
  };
}

export interface UrlCandidate {
  url: string;
  discoveredVia: DiscoverySource;
  priority: number;
  sourceUrl?: string;
}

export interface PageSnapshot {
  url: string;
  requestedUrl: string;
  canonicalUrl: string;
  status: number;
  fetchMode: PageFetchMode;
  discoveredVia: DiscoverySource;
  sourceUrl?: string | null;
  etag?: string | null;
  lastModified?: string | null;
  title: string;
  metaDescription: string;
  og: Record<string, string>;
  twitter: Record<string, string>;
  jsonLd: unknown[];
  headings: string[];
  mainText: string;
  language: string | null;
  contentHash: string;
  contentScore: number;
  thinContent: boolean;
  schemaCoverage: number;
  wordCount: number;
  readability: number;
  internalLinks: string[];
  fetchedAt: string;
  notModified?: boolean;
}

export interface DomainContextClaim {
  text: string;
  evidencePages: string[];
  confidence: number;
}

export interface DomainContextEntity {
  name: string;
  type: string;
  evidencePages: string[];
}

export interface DomainContextJson {
  companySummary: DomainContextClaim;
  offerings: DomainContextClaim[];
  audience: DomainContextClaim[];
  geoScope: DomainContextClaim;
  brandEntities: DomainContextEntity[];
  evidencePages: Array<{
    url: string;
    title: string;
    reasons: string[];
  }>;
  missingSignals: string[];
  overallConfidence: number;
}

export interface CrawlQualitySummary {
  contentQuality: number;
  crawlEfficiency: number;
  thinContentRate: number;
  schemaCoverage: number;
  browserFallbackRate: number;
  cacheHitRate: number;
  reusedPages: number;
  canonicalCoverage: number;
  pagesWithMetadata: number;
  blockedUrls: string[];
}
