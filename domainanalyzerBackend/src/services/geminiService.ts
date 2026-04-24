import axios from 'axios';
import * as cheerio from 'cheerio';
import OpenAI from 'openai';
import { PrismaClient } from '../../generated/prisma';
import { collectSitemapUrls, fetchCrawlPolicy, isUrlAllowed } from './crawlPolicyService';
import { parsePageSnapshots } from './crawlResultUtils';
import { synthesizeDomainContext } from './domainSynthesisService';
import type { CrawlPolicy, CrawlQualitySummary, DomainContextJson, PageSnapshot } from './domainContextTypes';
import { extractPageSnapshot } from './pageExtractionService';
import { fetchPageWithFallback } from './pageFetchService';
import { buildInitialUrlCandidates, expandCandidatesFromPage } from './urlDiscoveryService';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set in environment variables');

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const prisma = new PrismaClient();

export interface ExtractionResult {
  pagesScanned: number;
  analyzedUrls: string[];
  extractedContext: string;
  tokenUsage?: number;
  contextJson?: DomainContextJson;
  summaryContext?: string;
  pages?: PageSnapshot[];
  crawlPolicy?: CrawlPolicy;
  quality?: CrawlQualitySummary;
  metadata?: {
    domainsAnalyzed: number;
    contentQuality: number;
    crawlEfficiency: number;
    locationContext: boolean;
  };
}

export interface CrawlProgress {
  phase: 'discovery' | 'content' | 'ai_processing' | 'validation';
  step: string;
  progress: number;
  stats: {
    pagesScanned: number;
    analyzedUrls: string[];
  };
}

export type ProgressCallback = (progress: CrawlProgress) => void;

function buildQualitySummary(params: {
  pages: PageSnapshot[];
  policy: CrawlPolicy;
  blockedUrls: string[];
  cacheHits: number;
  browserFallbacks: number;
}): CrawlQualitySummary {
  const { pages, policy, blockedUrls, cacheHits, browserFallbacks } = params;
  const totalPages = Math.max(pages.length, 1);
  const pagesWithMetadata = pages.filter((page) => page.title || page.metaDescription).length;
  const canonicalCoverage = pages.filter((page) => !!page.canonicalUrl).length;

  return {
    contentQuality: Math.round(
      pages.reduce((sum, page) => sum + page.contentScore, 0) / totalPages
    ),
    crawlEfficiency: Math.round((pages.length / Math.max(policy.maxPages, 1)) * 100),
    thinContentRate: Math.round((pages.filter((page) => page.thinContent).length / totalPages) * 100),
    schemaCoverage: Math.round((pages.reduce((sum, page) => sum + page.schemaCoverage, 0) / totalPages) * 100) / 100,
    browserFallbackRate: Math.round((browserFallbacks / totalPages) * 100),
    cacheHitRate: Math.round((cacheHits / totalPages) * 100),
    reusedPages: cacheHits,
    canonicalCoverage: Math.round((canonicalCoverage / totalPages) * 100),
    pagesWithMetadata: Math.round((pagesWithMetadata / totalPages) * 100),
    blockedUrls,
  };
}

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeUrlOrDomain(input: string): { isUrl: boolean; baseUrl: string; domain: string } {
  const trimmed = input.trim();
  
  // Check if it's already a full URL
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    const url = new URL(trimmed);
    return {
      isUrl: true,
      baseUrl: trimmed,
      domain: url.hostname.replace(/^www\./, '')
    };
  }
  
  // It's a domain, construct the URL
  const cleanDomain = trimmed.replace(/^www\./, '');
  return {
    isUrl: false,
    baseUrl: `https://${cleanDomain}`,
    domain: cleanDomain
  };
}

async function crawlWebsiteWithProgress(
  urlOrDomain: string,
  maxPages = 8,
  onProgress?: ProgressCallback,
  relevantPaths?: string[],
  priorityUrls?: string[]
): Promise<{contentBlocks: string[], urls: string[]}> {
  const visited = new Set<string>();
  const queue: string[] = [];
  
  // Check if we have specific URLs/paths to crawl
  const hasSpecificUrls = priorityUrls && priorityUrls.length > 0;
  const hasSpecificPaths = relevantPaths && relevantPaths.length > 0;
  const hasSpecificTargets = hasSpecificUrls || hasSpecificPaths;
  
  // Determine if input is a full URL or just a domain
  const isFullUrl = urlOrDomain.startsWith('http://') || urlOrDomain.startsWith('https://');
  
  let domain: string;
  let baseUrl: string;
  
  if (isFullUrl) {
    // It's a full URL - crawl only this single page
    const url = new URL(urlOrDomain);
    domain = url.hostname.replace(/^www\./, '');
    baseUrl = urlOrDomain;
    queue.push(urlOrDomain);
    maxPages = 1;
  } else {
    // It's a domain
    domain = urlOrDomain.replace(/^www\./, '');
    baseUrl = `https://${domain}`;
    
    if (hasSpecificTargets) {
      // If URLs/paths are provided, crawl only those (no discovery)
      if (hasSpecificUrls) {
        priorityUrls.forEach(url => {
          try {
            const urlObj = new URL(url);
            const urlDomain = urlObj.hostname.replace(/^www\./, '');
            if (urlDomain === domain) {
              queue.push(url);
            } else {
              console.warn(`Skipping URL ${url} as it doesn't match domain ${domain}`);
            }
          } catch (error) {
            console.warn(`Invalid URL format: ${url}`);
          }
        });
      }
      if (hasSpecificPaths) {
        const pathUrls = relevantPaths.map(path => {
          const cleanPath = path.startsWith('/') ? path : `/${path}`;
          return `https://${domain}${cleanPath}`;
        });
        queue.push(...pathUrls);
      }
      // Set maxPages to exactly the number of URLs/paths
      maxPages = queue.length;
    } else {
      // Only domain: crawl up to 8 pages, discover links
      queue.push(baseUrl);
      // Try www variant as well if different
      const wwwUrl = `https://www.${domain}`;
      if (wwwUrl !== baseUrl) {
        queue.push(wwwUrl);
      }
      maxPages = 8;
      console.log(`Initialized for domain crawling: baseUrl=${baseUrl}, wwwUrl=${wwwUrl}, maxPages=${maxPages}`);
      console.log(`Initial queue:`, queue);
    }
  }

  const contentBlocks: string[] = [];
  const discoveredUrls: string[] = [];
  let stats = { pagesScanned: 0, analyzedUrls: [] as string[] };

  // Phase 1: Domain Discovery
  onProgress?.({
    phase: 'discovery',
    step: isFullUrl ? 'Validating URL accessibility...' : 
          hasSpecificUrls ? `Validating domain and ${priorityUrls?.length} specific URLs...` :
          hasSpecificPaths ? `Validating domain and ${relevantPaths?.length} specific paths...` : 
          'Validating domain accessibility...',
    progress: 5,
    stats
  });

  // Real validation check - test the base domain first
  let domainAccessible = true;
  try {
    await axios.get(baseUrl, { timeout: 5000 });
  } catch (error) {
    console.warn(`Domain ${urlOrDomain} is not accessible, will use fallback content`);
    domainAccessible = false;
  }

  onProgress?.({
    phase: 'discovery',
    step: hasSpecificUrls ? `Analyzing ${queue.length} specified pages...` : 
          hasSpecificPaths ? `Analyzing ${queue.length} specified paths...` :
          isFullUrl ? 'Analyzing single page...' : 
          'Scanning site architecture...',
    progress: 10,
    stats
  });

  // Phase 2: Content Analysis
  onProgress?.({
    phase: 'content',
    step: 'Extracting page content...',
    progress: 20,
    stats
  });

  let progressIncrement = 50 / Math.max(1, queue.length);

    // Helper function to crawl a single page
  async function crawlSinglePage(url: string) {
    if (!url || visited.has(url)) return;
    try {
      console.log(`Crawling: ${url}`); // Debug log
      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; SEO-Analyzer/1.0)',
        }
      });
      visited.add(url);
      discoveredUrls.push(url);
      stats.pagesScanned = visited.size;
      const $ = cheerio.load(response.data);
      
      const contentSelectors = [
        'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'article', 'section', '.content', '.main',
        '[role="main"]', '.description', '.about',
        '.services', '.products', '.features',
        '.company', '.team', '.mission', '.vision',
        '.values', '.approach', '.methodology',
        '.expertise', '.capabilities', '.solutions',
        '.industries', '.clients', '.case-studies',
        '.testimonials', '.leadership', '.careers',
        '.contact', '.faq', '.blog', '.news',
        '.hero', '.banner', '.intro', '.overview',
        '.benefits', '.advantages', '.process',
        '.portfolio', '.projects', '.work'
      ];
      contentSelectors.forEach(selector => {
        $(selector).each((_, element) => {
          const text = $(element).text().trim();
          if (text.length > 15 && text.length < 3000) {
            contentBlocks.push(text);
          }
        });
      });
      const title = $('title').text().trim();
      const description = $('meta[name="description"]').attr('content');
      const keywords = $('meta[name="keywords"]').attr('content');
      const ogTitle = $('meta[property="og:title"]').attr('content');
      const ogDescription = $('meta[property="og:description"]').attr('content');
      const ogType = $('meta[property="og:type"]').attr('content');
      const twitterTitle = $('meta[name="twitter:title"]').attr('content');
      const twitterDescription = $('meta[name="twitter:description"]').attr('content');
      const schemaScripts = $('script[type="application/ld+json"]');
      schemaScripts.each((_, script) => {
        try {
          const schemaData = JSON.parse($(script).html() || '');
          if (schemaData.name) contentBlocks.push(`Schema Name: ${schemaData.name}`);
          if (schemaData.description) contentBlocks.push(`Schema Description: ${schemaData.description}`);
          if (schemaData.address) contentBlocks.push(`Schema Address: ${JSON.stringify(schemaData.address)}`);
        } catch (e) {
          // Ignore invalid JSON
        }
      });
      contentBlocks.push(`Page URL: ${url}`);
      if (title) contentBlocks.push(`Page Title: ${title}`);
      if (description) contentBlocks.push(`Meta Description: ${description}`);
      if (keywords) contentBlocks.push(`Meta Keywords: ${keywords}`);
      if (ogTitle) contentBlocks.push(`Open Graph Title: ${ogTitle}`);
      if (ogDescription) contentBlocks.push(`Open Graph Description: ${ogDescription}`);
      if (ogType) contentBlocks.push(`Open Graph Type: ${ogType}`);
      if (twitterTitle) contentBlocks.push(`Twitter Title: ${twitterTitle}`);
      if (twitterDescription) contentBlocks.push(`Twitter Description: ${twitterDescription}`);
      const nav = $('nav, .nav, .navigation, .menu, .navbar').text().trim();
      if (nav.length > 10) contentBlocks.push(`Navigation: ${nav}`);
      const footer = $('footer, .footer, .site-footer').text().trim();
      if (footer.length > 10) contentBlocks.push(`Footer: ${footer}`);
      const contactInfo = $('.contact, .contact-info, .address, .phone, .email').text().trim();
      if (contactInfo.length > 10) contentBlocks.push(`Contact Info: ${contactInfo}`);
      const businessInfo = $('.about, .company, .business, .mission, .vision, .values').text().trim();
      if (businessInfo.length > 10) contentBlocks.push(`Business Info: ${businessInfo}`);
      const services = $('.services, .products, .offerings, .solutions').text().trim();
      if (services.length > 10) contentBlocks.push(`Services: ${services}`);
      stats.analyzedUrls = discoveredUrls;
      onProgress?.({
        phase: 'content',
        step: `Processed ${visited.size}/${maxPages} pages - Extracted ${contentBlocks.length} content blocks...`,
        progress: 20 + (visited.size / maxPages) * 30,
        stats
      });
      
      // --- Link Discovery ---
      // Only discover links if we haven't hit maxPages and we're not using specific targets
      if (visited.size < maxPages && !hasSpecificTargets) {
        const pageDomain = (() => {
          try {
            return new URL(url).hostname.replace(/^www\./, '');
          } catch { return null; }
        })();
        
        // Find relevant internal links
        const relevantLinks = new Set<string>();
        const allLinks: string[] = [];
        
        $('a[href]').each((_, el) => {
          const href = $(el).attr('href');
          if (!href) return;
          
          let fullUrl = '';
          if (href.startsWith('http')) {
            try {
              const linkDomain = new URL(href).hostname.replace(/^www\./, '');
              if (linkDomain === pageDomain) fullUrl = href;
            } catch { /* ignore invalid URLs */ }
          } else if (href.startsWith('/')) {
            fullUrl = `https://${pageDomain}${href}`;
          }
          
          if (fullUrl) {
            allLinks.push(fullUrl);
            
            // Filter for relevant pages (avoid admin, login, etc.)
            if (!visited.has(fullUrl) && !queue.includes(fullUrl)) {
              const path = fullUrl.toLowerCase();
              // Skip unwanted paths
              const skipPaths = [
                '/admin', '/login', '/register', '/cart', '/checkout', 
                '/wp-admin', '/wp-login', '?', '#', '/search', '/tag/',
                '/category/', '/author/', '/date/', '/page/', '/feed',
                '.pdf', '.jpg', '.jpeg', '.png', '.gif', '.css', '.js',
                '.xml', '.txt', '.zip', '.doc', '.docx', '.xls', '.xlsx'
              ];
              
              const shouldSkip = skipPaths.some(skip => path.includes(skip));
              if (!shouldSkip) {
                relevantLinks.add(fullUrl);
              }
            }
          }
        });
        
        // Add relevant links to queue (up to remaining slots)
        const remainingSlots = maxPages - visited.size;
        const linksToAdd = Array.from(relevantLinks).slice(0, remainingSlots);
        queue.push(...linksToAdd);
        
        console.log(`Page ${url}:`);
        console.log(`  - Found ${allLinks.length} total links`);
        console.log(`  - ${relevantLinks.size} relevant links after filtering`);
        console.log(`  - Added ${linksToAdd.length} to queue (remaining slots: ${remainingSlots})`);
        console.log(`  - Queue size now: ${queue.length}, Visited: ${visited.size}/${maxPages}`);
        if (relevantLinks.size > 0) {
          console.log(`  - Sample relevant links:`, Array.from(relevantLinks).slice(0, 3));
        }
      }
      await delay(50);
    } catch (error) {
      console.warn(`Failed to crawl ${url}:`, error);
      // Continue with other URLs
    }
  }

  // Parallel crawling with concurrency limit
  const CONCURRENCY = 3;
  console.log(`Starting crawl loop. Initial queue: ${queue.length} URLs, maxPages: ${maxPages}`);
  
  while (queue.length > 0 && visited.size < maxPages) {
    const batch: string[] = [];
    while (batch.length < CONCURRENCY && queue.length > 0 && visited.size + batch.length < maxPages) {
      const nextUrl = queue.shift();
      if (nextUrl && !visited.has(nextUrl)) {
        batch.push(nextUrl);
      }
    }
    if (batch.length === 0) {
      console.log(`Breaking crawl loop: batch is empty. Queue: ${queue.length}, Visited: ${visited.size}`);
      break;
    }
    
    console.log(`Processing batch of ${batch.length} URLs. Visited: ${visited.size}/${maxPages}, Queue remaining: ${queue.length}`);
    await Promise.all(batch.map(url => crawlSinglePage(url)));
  }
  
  console.log(`Crawl complete. Visited ${visited.size} pages, found ${discoveredUrls.length} URLs`);

  return { contentBlocks, urls: discoveredUrls };
}

export async function crawlAndExtractWithGpt4o(
  domains: string[] | string,
  onProgress?: ProgressCallback,
  customPaths?: string[],
  priorityUrls?: string[],
  location?: string,
  options?: {
    maxPages?: number;
    maxTokens?: number;
    contentQualityThreshold?: number;
    parallelDomains?: boolean;
  }
): Promise<ExtractionResult> {
  try {
    const domainList = Array.isArray(domains) ? domains : [domains];
    const primaryDomain = domainList[0];
    const {
      maxPages = 12,
    } = options || {};

    onProgress?.({
      phase: 'discovery',
      step: 'Loading crawl policy, robots, and sitemap hints...',
      progress: 10,
      stats: { pagesScanned: 0, analyzedUrls: [] }
    });

    const policy = await fetchCrawlPolicy(primaryDomain, { maxPages });
    const sitemapUrls = await collectSitemapUrls(policy);

    const latestDomain = await prisma.domain.findFirst({
      where: { url: { contains: primaryDomain } },
      include: {
        crawlResults: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    const previousSnapshots = parsePageSnapshots(latestDomain?.crawlResults?.[0]?.pageSnapshots);
    const previousSnapshotMap = new Map(previousSnapshots.map((page) => [page.url, page]));

    onProgress?.({
      phase: 'discovery',
      step: 'Seeding crawl queue from priority URLs, homepage, and sitemap URLs...',
      progress: 20,
      stats: { pagesScanned: 0, analyzedUrls: [] }
    });

    const queue = buildInitialUrlCandidates({
      policy,
      sitemapUrls,
      priorityUrls: priorityUrls || [],
      customPaths: customPaths || [],
    });
    const knownUrls = new Set(queue.map((candidate) => candidate.url));
    const visitedUrls = new Set<string>();
    const pages: PageSnapshot[] = [];
    const blockedUrls: string[] = [];
    let cacheHits = 0;
    let browserFallbacks = 0;

    while (queue.length > 0 && pages.length < policy.maxPages) {
      const candidate = queue.shift();
      if (!candidate) {
        break;
      }

      if (visitedUrls.has(candidate.url)) {
        continue;
      }

      if (!isUrlAllowed(policy, candidate.url)) {
        blockedUrls.push(candidate.url);
        visitedUrls.add(candidate.url);
        continue;
      }

      onProgress?.({
        phase: 'content',
        step: `Fetching ${pages.length + 1}/${policy.maxPages} candidate pages...`,
        progress: Math.min(75, 25 + pages.length * (45 / Math.max(policy.maxPages, 1))),
        stats: {
          pagesScanned: pages.length,
          analyzedUrls: pages.map((page) => page.url),
        },
      });

      const previousSnapshot = previousSnapshotMap.get(candidate.url);
      const fetchResult = await fetchPageWithFallback({
        candidate,
        policy,
        previousSnapshot,
      });

      let pageSnapshot: PageSnapshot | null = null;

      if (fetchResult.notModified && fetchResult.cachedSnapshot) {
        cacheHits += 1;
        pageSnapshot = {
          ...fetchResult.cachedSnapshot,
          fetchedAt: new Date().toISOString(),
          fetchMode: 'cached',
          discoveredVia: candidate.discoveredVia,
          sourceUrl: candidate.sourceUrl ?? fetchResult.cachedSnapshot.sourceUrl ?? null,
          notModified: true,
        };
      } else if (fetchResult.html) {
        pageSnapshot = extractPageSnapshot({
          html: fetchResult.html,
          requestedUrl: fetchResult.requestedUrl,
          finalUrl: fetchResult.url,
          status: fetchResult.status,
          fetchMode: fetchResult.fetchMode,
          discoveredVia: candidate.discoveredVia,
          sourceUrl: candidate.sourceUrl,
          headers: fetchResult.headers,
          policy,
        });
        if (fetchResult.fetchMode === 'browser') {
          browserFallbacks += 1;
        }
      }

      visitedUrls.add(candidate.url);

      if (!pageSnapshot) {
        continue;
      }

      pages.push(pageSnapshot);
      visitedUrls.add(pageSnapshot.url);
      knownUrls.add(pageSnapshot.url);
      if (pageSnapshot.canonicalUrl) {
        knownUrls.add(pageSnapshot.canonicalUrl);
      }

      const discoveredCandidates = expandCandidatesFromPage({
        page: pageSnapshot,
        policy,
        knownUrls,
      });

      for (const nextCandidate of discoveredCandidates) {
        if (knownUrls.has(nextCandidate.url) || visitedUrls.has(nextCandidate.url)) {
          continue;
        }
        knownUrls.add(nextCandidate.url);
        queue.push(nextCandidate);
      }
      queue.sort((a, b) => b.priority - a.priority);
    }

    const quality = buildQualitySummary({
      pages,
      policy,
      blockedUrls,
      cacheHits,
      browserFallbacks,
    });

    onProgress?.({
      phase: 'ai_processing',
      step: 'Synthesizing structured domain context from page evidence...',
      progress: 85,
      stats: {
        pagesScanned: pages.length,
        analyzedUrls: pages.map((page) => page.url),
      },
    });

    const synthesis = await synthesizeDomainContext({
      domain: primaryDomain,
      location,
      pages,
      policy,
      quality,
    });

    onProgress?.({
      phase: 'validation',
      step: 'Finalizing structured context and compatibility output...',
      progress: 95,
      stats: {
        pagesScanned: pages.length,
        analyzedUrls: pages.map((page) => page.url),
      },
    });

    return {
      pagesScanned: pages.length,
      analyzedUrls: pages.map((page) => page.url),
      extractedContext: synthesis.contextText,
      tokenUsage: synthesis.tokenUsage,
      contextJson: synthesis.contextJson,
      summaryContext: synthesis.summaryContext,
      pages,
      crawlPolicy: policy,
      quality,
      metadata: {
        domainsAnalyzed: domainList.length,
        contentQuality: quality.contentQuality,
        crawlEfficiency: quality.crawlEfficiency / 100,
        locationContext: !!location,
      },
    };

  } catch (error) {
    console.error('Enhanced crawling error:', error);
    if (error instanceof Error) {
      if (error.message.includes('rate limit')) {
        throw new Error(`API rate limit reached. Please wait before retrying.`);
      }
    }
    
    throw new Error(`Crawling failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Helper functions for optimization
function prioritizeAndFilterContent(
  crawlResults: Array<{contentBlocks: string[], urls: string[]}>,
  options: {
    maxPages: number;
    maxTokens: number;
    contentQualityThreshold: number;
    priorityUrls: string[];
  }
) {
  let allContent: Array<{content: string, url: string, priority: number}> = [];
  let allUrls: string[] = [];

  // Combine and score content
  crawlResults.forEach(result => {
    result.contentBlocks.forEach((content, index) => {
      const url = result.urls[index] || '';
      const priority = calculateContentPriority(content, url, options.priorityUrls);
      
      if (content.length >= options.contentQualityThreshold) {
        allContent.push({ content, url, priority });
      }
    });
    allUrls.push(...result.urls);
  });

  // Sort by priority and deduplicate
  const uniqueContent = deduplicateContent(allContent);
  const sortedContent = uniqueContent
    .sort((a, b) => b.priority - a.priority)
    .slice(0, options.maxPages);

  return {
    prioritizedContent: sortedContent.map(item => item.content),
    analyzedUrls: [...new Set(allUrls)],
    totalPages: allUrls.length
  };
}

function calculateContentPriority(
  content: string, 
  url: string, 
  priorityUrls: string[]
): number {
  let score = 0;
  
  // Priority URL bonus
  if (priorityUrls.some(pUrl => url.includes(pUrl))) {
    score += 100;
  }
  
  // Content quality factors
  score += Math.min(content.length / 100, 50); // Length score (max 50)
  score += (content.match(/\b(about|service|product|solution)\b/gi) || []).length * 5;
  score += url.includes('/about') ? 20 : 0;
  score += url === '/' || url.endsWith('/') ? 15 : 0; // Homepage bonus
  
  // Penalize thin content
  if (content.length < 200) score -= 20;
  
  return score;
}

function deduplicateContent(
  contentArray: Array<{content: string, url: string, priority: number}>
): Array<{content: string, url: string, priority: number}> {
  const seen = new Set<string>();
  return contentArray.filter(item => {
    // Simple similarity check - could be enhanced with fuzzy matching
    const signature = item.content.substring(0, 200).toLowerCase();
    if (seen.has(signature)) {
      return false;
    }
    seen.add(signature);
    return true;
  });
}

function buildLocationContext(
  domainContextMap: Map<string, string | null>, 
  domainList: string[]
): string {
  const contexts = domainList
    .map(domain => domainContextMap.get(domain))
    .filter(Boolean) as string[];
  
  return contexts.length > 0 
    ? `\n\n**LOCATION-DOMAIN CONTEXT:**\n${contexts.join('\n\n')}`
    : '';
}

function buildAnalysisPrompt(params: {
  primaryDomain: string;
  location?: string;
  contentBlocks: string[];
  locationDomainContext: string;
  totalPages: number;
  analyzedUrls: string[];
}): string {
  const { primaryDomain, location, contentBlocks, locationDomainContext, totalPages, analyzedUrls } = params;
  
  return `You are an expert business intelligence analyst and SEO strategist. Conduct a comprehensive domain analysis that will serve as the foundation for all subsequent AI-powered analysis phases.

**ANALYSIS CONTEXT:**
Domain: ${primaryDomain}
Location: ${location || 'Global'}
Pages Analyzed: ${totalPages}
Content Blocks: ${contentBlocks.length} high-quality pages
Sample URLs: ${analyzedUrls.slice(0, 5).join(', ')}${analyzedUrls.length > 5 ? '...' : ''}${locationDomainContext}

**COMPREHENSIVE BUSINESS INTELLIGENCE FRAMEWORK:**

1. **BUSINESS MODEL ANALYSIS**:
   - **Core Business**: Primary revenue streams and business model (SaaS, Agency, E-commerce, etc.)
   - **Industry Classification**: Specific industry, sub-industry, and market segment
   - **Company Profile**: Size (startup/SME/enterprise), type (B2B/B2C/B2B2C), maturity stage
   - **Geographic Scope**: Local, regional, national, or global market presence

2. **TARGET AUDIENCE PROFILING**:
   - **Primary Audience**: Detailed customer personas with demographics, job roles, company sizes
   - **Secondary Audiences**: Additional market segments and use cases
   - **Customer Journey**: Awareness, consideration, decision, and action stages
   - **Pain Points**: Specific problems and challenges their customers face
   - **Decision Factors**: What influences customer purchasing decisions

3. **VALUE PROPOSITION & POSITIONING**:
   - **Unique Selling Propositions**: 3-5 key differentiators and competitive advantages
   - **Brand Positioning**: How they position themselves in the market
   - **Key Benefits**: Primary value delivered to customers
   - **Solution Categories**: Types of problems they solve
   - **Market Positioning**: Leader, challenger, niche, or disruptor

4. **SEO & CONTENT STRATEGY INSIGHTS**:
   - **Primary Keywords**: Core terms they should target (industry, service, product terms)
   - **Content Themes**: Major topics and themes they should cover
   - **Expertise Areas**: Technical capabilities and knowledge domains
   - **Authority Building**: Thought leadership and industry expertise areas
   - **Content Gaps**: Underserved topics and opportunities

5. **COMPETITIVE INTELLIGENCE**:
   - **Direct Competitors**: Companies offering similar products/services
   - **Indirect Competitors**: Alternative solutions and substitutes
   - **Market Leaders**: Top players in their space
   - **Competitive Advantages**: What makes them unique vs. competitors
   - **Vulnerability Areas**: Where competitors might have advantages

6. **MARKET DYNAMICS**:
   - **Market Size**: Estimated market size and growth potential
   - **Industry Trends**: Key trends affecting their business
   - **Seasonal Patterns**: Business cycles and seasonal variations
   - **Geographic Considerations**: Location-specific factors and opportunities

7. **LOCATION-BASED SEO ANALYSIS**:
   - **Local Market Opportunities**: Location-specific business opportunities and market gaps
   - **Cultural Considerations**: Local cultural factors affecting content and messaging
   - **Location-Specific Keywords**: Geographic modifiers and local search terms
   - **Local Search Behavior**: How location affects user search patterns and intent
   - **Competitive Landscape**: Local competitors and market positioning
   - **Local SEO Strategy**: Location-based optimization opportunities

8. **SEO OPPORTUNITY ANALYSIS**:
   - **Keyword Opportunities**: High-potential keywords based on business model
   - **Content Opportunities**: Underserved content areas and topics
   - **Competitive Gaps**: Areas where competitors are weak
   - **Long-tail Opportunities**: Specific, targeted keyword phrases
   - **Local SEO**: Location-based opportunities if applicable

**WEBSITE CONTENT ANALYSIS:**
${contentBlocks.join('\n\n')}

**OUTPUT REQUIREMENTS:**
Provide a comprehensive, structured analysis that serves as the foundation for:
- Keyword generation and research (including location-specific keywords)
- Competitor analysis and positioning (local and global)
- Content strategy development (location-aware content)
- SEO optimization planning (local and organic)
- User intent mapping (location-influenced search behavior)
- AI-powered phrase generation (geographic modifiers)

**QUALITY STANDARDS:**
- Be specific and actionable, not generic
- Include real business insights and market context
- Focus on SEO-relevant information that can drive strategy
- Provide detailed audience and competitive intelligence
- Include specific keyword and content opportunities
- Consider geographic and industry-specific factors
- Integrate location context insights into all analysis sections
- Provide location-specific recommendations when applicable

This analysis will be used by subsequent AI phases for keyword generation, competitor analysis, intent classification, and phrase generation. Ensure all insights are accurate, realistic, and actionable for SEO strategy development.`;
}

function estimateTokenCount(text: string): number {
  // Rough estimation: ~4 characters per token
  return Math.ceil(text.length / 4);
}

function truncateToTokenLimit(contentBlocks: string[], maxTokens: number): string[] {
  let currentTokens = 0;
  const result: string[] = [];
  
  for (const block of contentBlocks) {
    const blockTokens = estimateTokenCount(block);
    if (currentTokens + blockTokens > maxTokens) {
      break;
    }
    result.push(block);
    currentTokens += blockTokens;
  }
  
  return result;
}

function calculateContentQualityScore(contentBlocks: string[]): number {
  if (contentBlocks.length === 0) return 0;
  
  const avgLength = contentBlocks.reduce((sum, block) => sum + block.length, 0) / contentBlocks.length;
  const uniquenessScore = contentBlocks.length / new Set(contentBlocks).size;
  
  return Math.min(100, (avgLength / 10) + (uniquenessScore * 20));
}

export async function generatePhrases(keyword: string, domain?: string, context?: string, location?: string): Promise<{ phrases: string[], tokenUsage: number }> {
  try {
    const domainContext = domain ? `\nDomain: ${domain}` : '';
    const businessContext = context ? `\nBusiness Context: ${context}` : '';
    const hasLocation = location && location.trim();
    const locationContext = hasLocation ? `\nLocation: ${location.trim()}` : '';
    
    const prompt = `Generate 5 highly realistic, intent-based search phrases for the keyword "${keyword}". These should be EXACTLY what real users would type into Google when searching for this type of business or service.

BUSINESS CONTEXT:
${businessContext}

DOMAIN: ${domain || 'Not specified'}

LOCATION: ${hasLocation ? location : 'No specific location'}

CRITICAL REQUIREMENTS - Generate 5 DIFFERENT search intents:

1. **INFORMATIONAL SEARCH** (User wants to learn/understand):
   - "how to [keyword]"
   - "what is [keyword]"
   - "[keyword] guide"
   - "[keyword] tutorial"
   - "[keyword] explained"

2. **COMPARISON/RESEARCH SEARCH** (User is comparing options):
   - "compare [keyword] providers"
   - "which [keyword] company is best"
   - "[keyword] vs competitors"
   - "best [keyword] companies 2024"
   - "[keyword] alternatives"

3. **SOLUTION/PROBLEM-SOLVING SEARCH** (User has a specific need):
   - "[keyword] for [specific use case]"
   - "affordable [keyword] solutions"
   - "[keyword] for small business"
   - "emergency [keyword] services"
   - "[keyword] help"

4. **REVIEW/TRUST SEARCH** (User wants to verify quality):
   - "[keyword] reviews and ratings"
   - "best rated [keyword] companies"
   - "[keyword] customer reviews"
   - "trusted [keyword] providers"
   - "[keyword] testimonials"

5. **LOCAL/NEAR ME SEARCH** (User wants to find nearby options - ONLY if location is relevant):
   - "best [keyword] near me"
   - "[keyword] companies in [location]"
   - "[keyword] services near me"
   - "[keyword] providers [location]"
   - "local [keyword] companies"

REALISTIC PATTERNS TO INCLUDE:
- Use natural language like real people: "I need", "looking for", "want to find"
- Include common modifiers: "best", "top", "affordable", "reviews", "2024"
- Add urgency indicators: "urgent", "emergency", "same day", "24/7"
- Include specific use cases: "for small business", "for home", "for office"
- Add quality indicators: "licensed", "certified", "insured", "experienced"
- Include price sensitivity: "cheap", "affordable", "budget", "cost-effective"

LOCATION HANDLING GUIDELINES:
**IMPORTANT**: Only include location when it naturally fits the search intent and user need. Do NOT force location into every phrase.

**When to include location:**
- User is actively seeking local services ("near me", "in [city]", "local")
- Location is relevant to the service type (restaurants, contractors, events, local services)
- User is comparing options in a specific area
- The business has a strong local presence

**When NOT to include location:**
- User is researching general information or concepts
- User is comparing national/global brands
- Location doesn't add value to the search intent
- The service is primarily online or global

**Natural location integration examples:**
- ✅ "best [keyword] near me" (when seeking local services)
- ✅ "[keyword] companies in [location]" (when location matters)
- ❌ "how to [keyword] in [location]" (forced location)
- ❌ "[keyword] guide [location]" (unnecessary location)

${hasLocation ? 
  `LOCATION CONTEXT: ${location}
   - Include 1-2 location-specific phrases ONLY if location is naturally relevant
   - Include 3-4 general phrases without location for broader reach
   - Use realistic location formats: "downtown ${location}", "${location} area"`
  : 
  `- Create general phrases without location
   - Focus on brand discovery and comparison searches
   - Include phrases that work nationally/globally`
}

BUSINESS CONTEXT INTEGRATION:
- Consider the actual business type and industry
- Make phrases relevant to the specific services offered
- Include industry-specific terminology when appropriate
- Consider the target market and customer pain points
- Reflect the business's unique value proposition

EXAMPLES OF REALISTIC PHRASES:

WITH LOCATION (when relevant):
- "best [keyword] companies in ${location}"
- "affordable [keyword] services near me"
- "[keyword] reviews and ratings"
- "how to find [keyword] providers"
- "top rated [keyword] companies"

WITHOUT LOCATION:
- "best [keyword] companies to work with"
- "affordable [keyword] solutions for small business"
- "[keyword] reviews and ratings 2024"
- "how to choose [keyword] provider"
- "top rated [keyword] providers"

KEYWORD: "${keyword}"
${domainContext}${businessContext}${locationContext}

Generate 5 diverse, realistic phrases that real users would actually type. Make them specific, varied, and useful for brand discovery. Use location naturally, not forced.

IMPORTANT: Return ONLY a JSON array of 5 strings, no other text or formatting:

["phrase 1", "phrase 2", "phrase 3", "phrase 4", "phrase 5"]`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: `You are an expert SEO specialist and search behavior analyst. Your task is to generate highly realistic search phrases that real users would actually type into search engines.

CRITICAL REQUIREMENTS:
- Generate 5 DIFFERENT types of search intents (local, comparison, solution, review, brand discovery)
- Use natural, conversational language like real users would type
- Include common search modifiers: "best", "top", "affordable", "reviews", "near me", "2024"
- Make phrases specific enough to surface real businesses
- Consider different user personas and search contexts
- Include urgency indicators and specific use cases when appropriate
- Avoid repetitive or overly generic phrases
- Ensure each phrase serves a different search intent and user need

IMPORTANT: You must return ONLY a valid JSON array of exactly 5 strings. Do not include any other text, explanations, or formatting outside the JSON array.

Your goal is to create phrases that would help users discover and compare real businesses, not just generic keyword variations. Think of real people with real problems searching for solutions.` },
        { role: 'user', content: prompt }
      ],
      max_tokens: 600,
      temperature: 0.9
    });
    const text = completion.choices[0].message?.content;
    if (!text) throw new Error('Empty response from GPT-4o-mini API');
    
    // Try multiple approaches to extract JSON
    let phrases: string[] = [];
    
    // First, try to find JSON array in the response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      try {
        phrases = JSON.parse(jsonMatch[0]);
      } catch (e) {
        console.log('Failed to parse JSON match:', jsonMatch[0]);
      }
    }
    
    // If that fails, try to parse the entire response as JSON
    if (!Array.isArray(phrases) || phrases.length === 0) {
      try {
        phrases = JSON.parse(text);
      } catch (e) {
        console.log('Failed to parse entire response as JSON:', text);
      }
    }
    
    // If still no success, try to extract phrases manually
    if (!Array.isArray(phrases) || phrases.length === 0) {
      // Look for numbered items or quoted strings
      const phraseMatches = text.match(/"([^"]+)"/g) || text.match(/'([^']+)'/g);
      if (phraseMatches) {
        phrases = phraseMatches.map(match => match.replace(/['"]/g, ''));
      }
    }
    
    // If still no success, generate fallback phrases
    if (!Array.isArray(phrases) || phrases.length === 0) {
      console.log('Generating fallback phrases for keyword:', keyword);
      phrases = generateFallbackPhrases(keyword, hasLocation ? location : undefined);
    }
    
    // Ensure we have exactly 5 phrases
    if (phrases.length > 5) {
      phrases = phrases.slice(0, 5);
    } else if (phrases.length < 5) {
      const fallbackPhrases = generateFallbackPhrases(keyword, hasLocation ? location : undefined);
      while (phrases.length < 5 && fallbackPhrases.length > 0) {
        const phrase = fallbackPhrases.shift();
        if (phrase && !phrases.includes(phrase)) {
          phrases.push(phrase);
        }
      }
    }
    
    return {
      phrases: phrases.filter((phrase: any) => typeof phrase === 'string' && phrase.length > 0),
      tokenUsage: completion.usage?.total_tokens || 0
    };
  } catch (parseError) {
    console.error('Failed to parse GPT-4o-mini response JSON:', parseError);
    // Return fallback phrases instead of throwing error
    return {
      phrases: generateFallbackPhrases(keyword, location),
      tokenUsage: 0
    };
  }
}

// Helper function to generate fallback phrases
function generateFallbackPhrases(keyword: string, location?: string): string[] {
  const basePhrases = [
    `best ${keyword} companies`,
    `top ${keyword} providers`,
    `${keyword} reviews and ratings`,
    `affordable ${keyword} solutions`,
    `${keyword} near me`
  ];
  
  if (location) {
    return [
      `best ${keyword} companies in ${location}`,
      `${keyword} providers near me`,
      `${keyword} reviews ${location} area`,
      `affordable ${keyword} solutions in ${location}`,
      `top rated ${keyword} companies in ${location}`
    ];
  }
  
  return basePhrases;
}

// ── Google Autocomplete expansion (free, validates real searches) ────────────

async function fetchGoogleAutocomplete(seed: string): Promise<string[]> {
  try {
    const url = `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(seed)}`;
    const response = await axios.get(url, { timeout: 5000, responseType: 'json' });
    // Response format: ["query", ["suggestion1", "suggestion2", ...]]
    const suggestions: string[] = Array.isArray(response.data?.[1]) ? response.data[1] : [];
    // Only keep short suggestions (1-4 words)
    return suggestions
      .map((s: string) => s.trim().toLowerCase())
      .filter((s: string) => {
        const wordCount = s.split(/\s+/).length;
        return wordCount >= 1 && wordCount <= 4 && s.length > 2;
      });
  } catch {
    return [];
  }
}

export async function generateKeywordsForDomain(domain: string, context: string, location?: string): Promise<{ keywords: Array<{ term: string, volume: number, difficulty: string, cpc: number, intent: string }>, tokenUsage: number }> {
  try {
    const locationContext = location ? `\nLocation: ${location}` : '';

    // Get location context from database if available
    let locationDomainContext = '';
    try {
      const domainRecord = await prisma.domain.findFirst({
        where: { url: { contains: domain } },
        select: { locationContext: true }
      });
      if (domainRecord?.locationContext) {
        locationDomainContext = `\nLocation Context: ${domainRecord.locationContext}`;
      }
    } catch (error) {
      console.warn('Could not fetch location context from database:', error);
    }

    // AI-visibility-focused prompt: generate keywords that make good AI prompts
    const prompt = `Generate 40 SHORT-TAIL KEYWORDS (1-4 words max) for testing AI visibility of the following business. These keywords will be turned into prompts like "What is the best [keyword]?" or "Recommend a [keyword]" to test whether AI models mention this domain.

Business: ${context}${locationContext}${locationDomainContext}

STRICT RULES:
- Every keyword MUST be 1-4 words. NO phrases longer than 4 words.
- Do NOT include the brand name "${domain}" or any brand variants
- Do NOT include navigational terms
- Keywords should be generic industry/service/product terms that someone would ask an AI about
- Focus on terms where this business COULD be recommended by an AI

GOOD examples (1-4 words): "project management software", "CRM tool", "email marketing", "web hosting", "data analytics platform"
BAD examples (too long): "best project management software for remote teams", "how to choose a CRM tool for small business"

Intent Distribution:
- Informational (30%): category terms, "what is" topics
- Commercial (40%): "best X", comparison terms, tool categories
- Transactional (30%): service terms, "near me" if local

Difficulty (how competitive is this term in AI responses):
- Low: niche terms, specific subcategories
- Medium: established categories, moderate competition
- High: broad popular terms, many competitors

Return JSON array only, no explanations:
[{"term":"keyword","difficulty":"Medium","intent":"Commercial"}]`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are an AI visibility analyst. Generate short-tail keywords (1-4 words) that will be used to build prompts for testing whether AI chatbots mention a specific domain. Output clean JSON arrays only.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 1500,
      temperature: 0.4,
      response_format: { type: 'json_object' }
    });

    const text = completion.choices[0].message?.content;
    if (!text) throw new Error('Empty response from keyword generation');

    // Extract JSON array from response
    let keywords: any[];
    try {
      const parsed = JSON.parse(text);
      keywords = Array.isArray(parsed) ? parsed : (parsed.keywords || parsed.data || []);
    } catch {
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        console.error('No JSON found in keyword response');
        return { keywords: generateDomainFallbackKeywords(domain, context), tokenUsage: completion.usage?.total_tokens || 0 };
      }
      keywords = JSON.parse(jsonMatch[0]);
    }

    if (!Array.isArray(keywords)) {
      return { keywords: generateDomainFallbackKeywords(domain, context), tokenUsage: completion.usage?.total_tokens || 0 };
    }

    // ── Post-generation filtering ──────────────────────────────────────────
    const seen = new Set<string>();
    const domainLower = domain.toLowerCase().replace(/\.(com|io|net|org|co)$/, '').replace(/^www\./, '');

    const validatedKeywords = keywords
      .map((kw: any) => {
        const term = String(kw.term || '').trim().toLowerCase();
        if (!term || term.length < 2) return null;

        // HARD REJECT: more than 4 words
        const wordCount = term.split(/\s+/).length;
        if (wordCount > 4) return null;

        // Reject brand terms
        if (term.includes(domainLower)) return null;

        // Dedup
        if (seen.has(term)) return null;
        seen.add(term);

        // Validate difficulty
        let difficulty = kw.difficulty;
        if (!['Low', 'Medium', 'High'].includes(difficulty)) {
          if (wordCount >= 3) difficulty = 'Low';
          else if (wordCount >= 2) difficulty = 'Medium';
          else difficulty = 'High';
        }

        const intent = ['Informational', 'Commercial', 'Transactional'].includes(kw.intent)
          ? kw.intent
          : determineIntent(term);

        return {
          term,
          volume: 0,       // No hallucinated volume — 0 means "not measured"
          difficulty,
          cpc: 0,          // CPC removed
          intent
        };
      })
      .filter(Boolean) as Array<{ term: string, volume: number, difficulty: string, cpc: number, intent: string }>;

    // ── Google Autocomplete expansion ──────────────────────────────────────
    // Pick top 8 seed keywords and expand via autocomplete to find real searches
    const seeds = validatedKeywords.slice(0, 8).map(k => k.term);
    const autocompleteResults = await Promise.all(seeds.map(s => fetchGoogleAutocomplete(s)));
    const autocompleteKeywords = new Set<string>();

    for (const suggestions of autocompleteResults) {
      for (const s of suggestions) {
        const wordCount = s.split(/\s+/).length;
        if (wordCount <= 4 && !seen.has(s) && !s.includes(domainLower)) {
          autocompleteKeywords.add(s);
          seen.add(s);
        }
      }
    }

    // Add autocomplete-validated keywords (mark as Medium difficulty, Commercial intent by default)
    for (const term of autocompleteKeywords) {
      if (validatedKeywords.length >= 40) break;
      validatedKeywords.push({
        term,
        volume: 0,
        difficulty: 'Medium',
        cpc: 0,
        intent: determineIntent(term),
      });
    }

    return {
      keywords: validatedKeywords.slice(0, 40),
      tokenUsage: completion.usage?.total_tokens || 0
    };

  } catch (error) {
    console.error('Keyword generation error:', error);
    return { keywords: generateDomainFallbackKeywords(domain, context), tokenUsage: 0 };
  }
}

// Helper function for intent determination
function determineIntent(term: string): string {
  const termLower = term.toLowerCase();
  
  // Informational patterns
  if (termLower.match(/(how to|what is|guide|tutorial|learn|tips|why|when|where)/)) {
    return 'Informational';
  }
  
  // Transactional patterns
  if (termLower.match(/(buy|price|cost|hire|contact|near me|book|order|get quote)/)) {
    return 'Transactional';
  }
  
  // Commercial patterns
  if (termLower.match(/(best|review|compare|vs|top|alternative|rating)/)) {
    return 'Commercial';
  }
  
  // Default to Commercial for middle-funnel terms
  return 'Commercial';
}

function generateDomainFallbackKeywords(domain: string, context: string): Array<{ term: string, volume: number, difficulty: string, cpc: number, intent: string }> {
  // Extract meaningful words from context for fallback keyword seeds
  const contextWords = context
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 3)
    .filter(w => !['the', 'and', 'for', 'with', 'that', 'this', 'from', 'have', 'been', 'they', 'their', 'about', 'which', 'when', 'make', 'more', 'also', 'into', 'some', 'than', 'them'].includes(w));

  // Pick up to 5 unique context words as seeds
  const seeds = [...new Set(contextWords)].slice(0, 5);

  const baseKeywords: Array<{ term: string, difficulty: string, intent: string }> = [];

  for (const word of seeds) {
    baseKeywords.push(
      { term: `best ${word}`, difficulty: 'High', intent: 'Commercial' },
      { term: `${word} software`, difficulty: 'Medium', intent: 'Commercial' },
      { term: `${word} tools`, difficulty: 'Medium', intent: 'Commercial' },
      { term: `${word} services`, difficulty: 'Medium', intent: 'Commercial' },
      { term: `${word} platform`, difficulty: 'Medium', intent: 'Commercial' },
    );
  }

  // Dedup and limit
  const seen = new Set<string>();
  return baseKeywords
    .filter(kw => {
      if (seen.has(kw.term)) return false;
      seen.add(kw.term);
      return kw.term.split(/\s+/).length <= 4;
    })
    .slice(0, 25)
    .map(kw => ({
      term: kw.term,
      volume: 0,
      difficulty: kw.difficulty,
      cpc: 0,
      intent: kw.intent,
    }));
}

export async function analyzeCompetitors(
  domain: string, 
  context: string, 
  selectedCompetitors: string[] = [],
  location?: string
): Promise<{
  competitors: Array<{
    name: string;
    domain: string;
    strength: string;
    marketShare: string;
    keyStrengths: string[];
    weaknesses: string[];
    threatLevel: string;
    recommendations: string[];
    comparisonToDomain: {
      keywordOverlap: string;
      marketPosition: string;
      competitiveAdvantage: string;
      vulnerabilityAreas: string[];
    };
  }>;
  marketInsights: {
    totalCompetitors: string;
    marketLeader: string;
    emergingThreats: string[];
    opportunities: string[];
    marketTrends: string[];
    marketSize: string;
    growthRate: string;
  };
  strategicRecommendations: Array<{
    category: string;
    priority: string;
    action: string;
    expectedImpact: string;
    timeline: string;
    resourceRequirement: string;
  }>;
  competitiveAnalysis: {
    domainAdvantages: string[];
    domainWeaknesses: string[];
    competitiveGaps: string[];
    marketOpportunities: string[];
    threatMitigation: string[];
  };
  tokenUsage: number;
}> {
  console.log(`Starting competitor analysis for ${domain} with context: ${context}, selected competitors: ${selectedCompetitors.join(', ')}`);
  
  try {
    const locationContext = location ? `\nTarget Market: ${location}` : '';
    const competitorContext = selectedCompetitors.length > 0 
      ? `\nSelected Competitors to Analyze: ${selectedCompetitors.join(', ')}`
      : '';
    
    const prompt = `You are an expert market research analyst specializing in competitive intelligence and market positioning. Analyze the competitive landscape for the domain "${domain}" based on the following context:

DOMAIN CONTEXT: ${context}${locationContext}${competitorContext}

Perform a comprehensive competitive analysis and provide:

1. COMPETITOR ANALYSIS: ${selectedCompetitors.length > 0 
  ? `Analyze ONLY the following selected competitors: ${selectedCompetitors.join(', ')}. Do not identify additional competitors - focus exclusively on these selected ones.`
  : 'Identify 5-8 direct and indirect competitors based on the domain\'s business model, target audience, and market positioning. Include both established players and emerging threats.'
}

2. DETAILED COMPETITOR PROFILES: For each competitor, provide:
   - Company name and domain
   - Market strength (Strong/Moderate/Weak)
   - Estimated market share
   - Key strengths (3-4 points)
   - Weaknesses (2-3 points)
   - Threat level (High/Medium/Low)
   - Monitoring recommendations
   - Comparison to target domain (keyword overlap %, market position, competitive advantages, vulnerability areas)

3. MARKET INSIGHTS: Analyze the overall market including:
   - Total number of significant competitors
   - Current market leader
   - Emerging threats and disruptors
   - Market opportunities
   - Key market trends
   - Market size and growth rate estimates

4. STRATEGIC RECOMMENDATIONS: Provide 5-7 actionable recommendations with:
   - Category (Content, SEO, Product, Marketing, etc.)
   - Priority level (High/Medium/Low)
   - Specific action items
   - Expected impact
   - Implementation timeline
   - Resource requirements

5. COMPETITIVE ANALYSIS SUMMARY:
   - Target domain's competitive advantages
   - Target domain's weaknesses
   - Competitive gaps to exploit
   - Market opportunities to pursue
   - Threat mitigation strategies

Return ONLY a valid JSON object with this exact structure:
{
  "competitors": [
    {
      "name": "Company Name",
      "domain": "competitor.com",
      "strength": "Strong|Moderate|Weak",
      "marketShare": "X%",
      "keyStrengths": ["strength1", "strength2", "strength3"],
      "weaknesses": ["weakness1", "weakness2"],
      "threatLevel": "High|Medium|Low",
      "recommendations": ["recommendation1", "recommendation2"],
      "comparisonToDomain": {
        "keywordOverlap": "X%",
        "marketPosition": "Leading|Competing|Following",
        "competitiveAdvantage": "description",
        "vulnerabilityAreas": ["area1", "area2"]
      }
    }
  ],
  "marketInsights": {
    "totalCompetitors": "number",
    "marketLeader": "company name",
    "emergingThreats": ["threat1", "threat2"],
    "opportunities": ["opportunity1", "opportunity2", "opportunity3"],
    "marketTrends": ["trend1", "trend2", "trend3"],
    "marketSize": "$X.XB",
    "growthRate": "X% YoY"
  },
  "strategicRecommendations": [
    {
      "category": "category",
      "priority": "High|Medium|Low",
      "action": "specific action",
      "expectedImpact": "impact description",
      "timeline": "timeframe",
      "resourceRequirement": "High|Medium|Low"
    }
  ],
  "competitiveAnalysis": {
    "domainAdvantages": ["advantage1", "advantage2"],
    "domainWeaknesses": ["weakness1", "weakness2"],
    "competitiveGaps": ["gap1", "gap2"],
    "marketOpportunities": ["opportunity1", "opportunity2"],
    "threatMitigation": ["strategy1", "strategy2"]
  }
}

Be specific, accurate, and provide actionable insights based on real market dynamics and competitive positioning.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 4000,
      temperature: 0.3
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from AI service');
    }

    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No valid JSON found in AI response');
    }

    const analysisData = JSON.parse(jsonMatch[0]);
    const tokenUsage = response.usage?.total_tokens || 0;

    console.log(`Competitor analysis completed with ${tokenUsage} tokens`);
    
    return {
      ...analysisData,
      tokenUsage
    };

  } catch (error) {
    console.error('Error in competitor analysis:', error);
    
    // Return fallback analysis based on domain and context
    const fallbackAnalysis = generateFallbackCompetitorAnalysis(domain, context, selectedCompetitors, location);
    return {
      ...fallbackAnalysis,
      tokenUsage: 0
    };
  }
}

function generateFallbackCompetitorAnalysis(domain: string, context: string, selectedCompetitors: string[] = [], location?: string) {
  const baseDomain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const domainName = baseDomain.split('.')[0];
  
  // If specific competitors are selected, use them; otherwise create fallback competitors
  const competitors = selectedCompetitors.length > 0 
    ? selectedCompetitors.map((comp, index) => ({
        name: comp,
        domain: comp,
        strength: ['Strong', 'Moderate', 'Weak'][index % 3],
        marketShare: `${Math.floor(Math.random() * 30 + 5)}%`,
        keyStrengths: ['Established market presence', 'Strong brand recognition', 'Good user base'],
        weaknesses: ['Limited innovation', 'Technical debt', 'Slow adaptation'],
        threatLevel: ['High', 'Medium', 'Low'][index % 3],
        recommendations: ['Monitor their strategy', 'Track their updates'],
        comparisonToDomain: {
          keywordOverlap: `${Math.floor(Math.random() * 40 + 10)}%`,
          marketPosition: ['Leading', 'Competing', 'Following'][index % 3],
          competitiveAdvantage: 'Better implementation approach',
          vulnerabilityAreas: ['User experience', 'Technology stack']
        }
      }))
    : [{
        name: `${domainName}Alternative`,
        domain: `${domainName}alternative.com`,
        strength: 'Moderate',
        marketShare: '15%',
        keyStrengths: ['Established brand presence', 'Strong SEO performance', 'Active user community'],
        weaknesses: ['Limited mobile optimization', 'Older technology stack'],
        threatLevel: 'Medium',
        recommendations: ['Monitor their content strategy', 'Track their keyword rankings'],
        comparisonToDomain: {
          keywordOverlap: '25%',
          marketPosition: 'Competing',
          competitiveAdvantage: 'Better technical implementation',
          vulnerabilityAreas: ['Content freshness', 'User experience']
        }
      }];
  
  return {
    competitors,
    marketInsights: {
      totalCompetitors: '12',
      marketLeader: `${domainName}Leader`,
      emergingThreats: ['AI-powered solutions', 'Mobile-first platforms'],
      opportunities: ['Voice search optimization', 'Emerging markets', 'AI integration'],
      marketTrends: ['Mobile-first design', 'AI integration', 'Personalization'],
      marketSize: '$1.2B',
      growthRate: '12% YoY'
    },
    strategicRecommendations: [
      {
        category: 'Content Strategy',
        priority: 'High',
        action: 'Develop comprehensive content calendar targeting competitor keywords',
        expectedImpact: 'Increase organic visibility by 30%',
        timeline: '3-6 months',
        resourceRequirement: 'Medium'
      },
      {
        category: 'Technical SEO',
        priority: 'High',
        action: 'Optimize site speed and mobile experience',
        expectedImpact: 'Improve user engagement and search rankings',
        timeline: '1-2 months',
        resourceRequirement: 'Low'
      }
    ],
    competitiveAnalysis: {
      domainAdvantages: ['Modern technology stack', 'User-focused design', 'Agile development'],
      domainWeaknesses: ['Limited brand recognition', 'Smaller content library'],
      competitiveGaps: ['Social media presence', 'Industry partnerships', 'Content volume'],
      marketOpportunities: ['Underserved niches', 'Geographic expansion', 'Technology integration'],
      threatMitigation: ['Strengthen content strategy', 'Build brand authority', 'Improve technical performance']
    }
  };
}

// Export the service for backward compatibility
export const gptService = {
  generatePhrases,
  generateKeywordsForDomain,
  crawlAndExtractWithGpt4o
};
