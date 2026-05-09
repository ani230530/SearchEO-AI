/**
 * Shared types for the wizard pipeline.
 *
 * All names match the Prisma schema. Anything not declared here is not part of
 * the public wizard API — keep this file as the single source of truth.
 */

export type Phase =
  | 'crawl'
  | 'profile'
  | 'competitors'
  | 'topics'
  | 'select'
  | 'run';

export type PhaseStatus = 'pending' | 'running' | 'completed' | 'failed';

export type Intent =
  | 'Informational'
  | 'Commercial'
  | 'Transactional'
  | 'Navigational';

export type Source = 'ai' | 'custom';

export type CompanySize = 'solo' | 'smb' | 'mid' | 'enterprise';

export type CompetitorSource =
  | 'serp'
  | 'overlap'
  | 'mention'
  | 'enrichment'
  | 'llm-rank';

export type ThreatLevel = 'High' | 'Medium' | 'Low';

export interface CrawledPage {
  url: string;
  title: string | null;
  description: string | null;
  ogTags: Record<string, string>;
  schemaJson: unknown[];
  content: string;
  fetchedVia: 'http' | 'browser';
}

export interface CrawlOutput {
  pagesScanned: number;
  pages: CrawledPage[];
  rawText: string;
  contextJson: ContextJson | null;
  quality: CrawlQuality;
  policy: CrawlPolicy;
  tokenUsage: number;
}

export interface ContextJson {
  companyName: string | null;
  industry: string | null;
  products: string[];
  services: string[];
  location: string | null;
  summary: string;
  schemaOrg: unknown;
}

export interface CrawlQuality {
  contentQualityPct: number;
  thinContentRatePct: number;
  schemaCoveragePct: number;
  browserFallbackRatePct: number;
}

export interface CrawlPolicy {
  robotsAllowed: boolean;
  sitemapFound: boolean;
  sitemapUrls: string[];
  startUrl: string;
}

export interface DomainProfileInput {
  country: string | null;
  state: string | null;
  industry: string | null;
  targetLocation: string | null;
  customSeeds: { keywords: string[]; prompts: string[] };
}

export interface CompetitorCandidate {
  competitorHost: string;
  source: CompetitorSource;
  rawSignals: Record<string, unknown>;
}

export interface VerifiedCompetitor extends CompetitorCandidate {
  verified: true;
  industry: string | null;
  location: string | null;
  companySize: CompanySize | null;
  candidateText: string; // raw text from candidate's mini-crawl, for embedding
}

export interface ScoredCompetitor extends VerifiedCompetitor {
  similarityScore: number; // 0..1
}

export interface RankedCompetitor extends ScoredCompetitor {
  rank: number;
  threatLevel: ThreatLevel;
  reasoning: string;
}

export interface TopicsInput {
  url: string;
  rawText: string;
  industry: string | null;
  companySize: string | null;
  country: string | null;
  state: string | null;
  competitors: string[];
  customKeywords: string[];
  customPrompts: string[];
}

export interface GeneratedTopic {
  keyword: string;
  intent: Intent;
  prompts: string[];
}
