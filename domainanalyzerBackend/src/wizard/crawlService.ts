/**
 * crawlService — discovery + extraction for a single domain.
 *
 * Pipeline (no LLM in the hot path; synthesis runs once at the end):
 *   1. Resolve robots.txt + sitemap.xml.
 *   2. Pick up to MAX_PAGES URLs prioritised by sitemap > nav links > home.
 *   3. Fetch each via axios; if first-page content is < THIN_THRESHOLD chars
 *      OR contains a SPA root (`<div id="root">` / `<div id="app">`), retry
 *      that page (and only that page) through Puppeteer.
 *   4. Extract title / description / OG tags / JSON-LD for each.
 *   5. Concatenate text, run one LLM synthesis call → ContextJson.
 *   6. Return CrawlOutput; caller persists CrawlSnapshot + DomainInferred.
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { CrawledPage, CrawlOutput, CrawlPolicy, CrawlQuality, ContextJson } from './types';
import { normalizeUrl } from './urlNormalize';
import { callJson, Models } from './llmClient';

const MAX_PAGES = 12;
const HTTP_FETCH_TIMEOUT_MS = 7_000;
const BROWSER_FETCH_TIMEOUT_MS = 10_000;
const THIN_THRESHOLD_CHARS = 800;
const TARGET_CRAWL_CONCURRENCY = 8;
// Realistic desktop Chrome UA — many WAFs (Cloudflare / Akamai / Shape) reject
// any UA that mentions "bot" outright, even though we honor robots.txt.
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

interface FetchResult {
  ok: boolean;
  status: number;
  html: string;
  fetchedVia: 'http' | 'browser';
}

async function fetchHttp(url: string): Promise<FetchResult> {
  try {
    const res = await axios.get<string>(url, {
      timeout: HTTP_FETCH_TIMEOUT_MS,
      maxRedirects: 5,
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,*/*' },
      responseType: 'text',
      transformResponse: [(d) => d],
      validateStatus: () => true,
    });
    return { ok: res.status >= 200 && res.status < 400, status: res.status, html: String(res.data ?? ''), fetchedVia: 'http' };
  } catch {
    return { ok: false, status: 0, html: '', fetchedVia: 'http' };
  }
}

let _puppeteer: typeof import('puppeteer') | null | undefined;
async function loadPuppeteer() {
  if (_puppeteer === undefined) {
    try {
      _puppeteer = await import('puppeteer');
    } catch {
      _puppeteer = null;
    }
  }
  return _puppeteer;
}

// Shared browser instance — launching Chromium costs ~1–3s; with up to ~30%
// of pages triggering the SPA fallback, launching once per process instead of
// once per page saves 10–30s on a typical wizard run. We close the browser
// after 60s of inactivity so idle workers don't hold ~200MB resident.
const BROWSER_IDLE_MS = 60_000;
let _sharedBrowser: import('puppeteer').Browser | null = null;
let _sharedBrowserLaunch: Promise<import('puppeteer').Browser | null> | null = null;
let _browserIdleTimer: NodeJS.Timeout | null = null;

async function getSharedBrowser(): Promise<import('puppeteer').Browser | null> {
  if (_sharedBrowser) return _sharedBrowser;
  if (_sharedBrowserLaunch) return _sharedBrowserLaunch;
  const puppeteer = await loadPuppeteer();
  if (!puppeteer) return null;
  _sharedBrowserLaunch = puppeteer
    .launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] })
    .then((b) => {
      _sharedBrowser = b;
      // If Chromium dies (OOM, crash, manual kill), null out so the next
      // request re-launches instead of hitting a stale handle.
      b.on('disconnected', () => {
        if (_sharedBrowser === b) _sharedBrowser = null;
      });
      return b;
    })
    .catch(() => null)
    .finally(() => {
      _sharedBrowserLaunch = null;
    });
  return _sharedBrowserLaunch;
}

function scheduleBrowserIdleClose() {
  if (_browserIdleTimer) clearTimeout(_browserIdleTimer);
  _browserIdleTimer = setTimeout(() => {
    const b = _sharedBrowser;
    _sharedBrowser = null;
    if (b) b.close().catch(() => undefined);
  }, BROWSER_IDLE_MS);
  // Don't hold the event loop open in tests / short-lived processes.
  if (typeof _browserIdleTimer.unref === 'function') _browserIdleTimer.unref();
}

async function fetchBrowser(url: string): Promise<FetchResult> {
  const browser = await getSharedBrowser();
  if (!browser) return { ok: false, status: 0, html: '', fetchedVia: 'browser' };
  let page: import('puppeteer').Page | null = null;
  try {
    page = await browser.newPage();
    await page.setUserAgent(USER_AGENT);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: BROWSER_FETCH_TIMEOUT_MS });
    const html = await page.content();
    return { ok: true, status: 200, html, fetchedVia: 'browser' };
  } catch {
    return { ok: false, status: 0, html: '', fetchedVia: 'browser' };
  } finally {
    if (page) await page.close().catch(() => undefined);
    scheduleBrowserIdleClose();
  }
}

/** Exposed for graceful shutdown / tests. */
export async function closeSharedBrowser(): Promise<void> {
  if (_browserIdleTimer) {
    clearTimeout(_browserIdleTimer);
    _browserIdleTimer = null;
  }
  const b = _sharedBrowser;
  _sharedBrowser = null;
  if (b) await b.close().catch(() => undefined);
}

function looksThin(html: string): boolean {
  if (!html) return true;
  const $ = cheerio.load(html);
  const visibleText = $('body').text().replace(/\s+/g, ' ').trim();
  if (visibleText.length < THIN_THRESHOLD_CHARS) return true;
  // Common SPA roots — content is rendered by JS, not in initial HTML.
  if (/<div[^>]+id=["'](root|app|__next|svelte)["']/.test(html) && visibleText.length < THIN_THRESHOLD_CHARS * 2) return true;
  return false;
}

function parsePage(url: string, html: string, fetchedVia: 'http' | 'browser'): CrawledPage {
  const $ = cheerio.load(html);
  const ogTags: Record<string, string> = {};
  $('meta[property^="og:"], meta[name^="og:"], meta[name^="twitter:"]').each((_, el) => {
    const key = ($(el).attr('property') || $(el).attr('name') || '').trim();
    const value = ($(el).attr('content') || '').trim();
    if (key && value) ogTags[key] = value;
  });
  const schemaJson: unknown[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text().trim();
    if (!raw) return;
    try {
      schemaJson.push(JSON.parse(raw));
    } catch {
      /* ignore malformed JSON-LD */
    }
  });
  // Extract text from semantic-meaningful blocks rather than whole body.
  const blocks = $('main, article, section, .content, #content, .about, .services, .products, [role="main"]');
  let extracted = blocks.length
    ? blocks.map((_, el) => $(el).text()).get().join('\n')
    : $('body').text();
  extracted = extracted.replace(/\s+/g, ' ').trim();

  return {
    url,
    title: $('title').first().text().trim() || null,
    description: $('meta[name="description"]').attr('content')?.trim() || null,
    ogTags,
    schemaJson,
    content: extracted.slice(0, 20_000), // cap per page
    fetchedVia,
  };
}

async function fetchRobots(origin: string): Promise<{ raw: string; allowed: boolean }> {
  try {
    const res = await axios.get<string>(`${origin}/robots.txt`, {
      timeout: 4000,
      headers: { 'User-Agent': USER_AGENT },
      responseType: 'text',
      transformResponse: [(d) => d],
      validateStatus: () => true,
    });
    if (res.status >= 200 && res.status < 300) {
      // Cheap parse: only block if `User-agent: *` has `Disallow: /` exact.
      const raw = String(res.data ?? '');
      const blocks = raw.split(/\n\s*\n/);
      for (const block of blocks) {
        if (/User-agent:\s*\*/i.test(block) && /Disallow:\s*\/\s*$/im.test(block)) {
          return { raw, allowed: false };
        }
      }
      return { raw, allowed: true };
    }
  } catch {
    /* fall through to allowed:true */
  }
  return { raw: '', allowed: true };
}

async function discoverSitemap(origin: string): Promise<string[]> {
  const candidates = [`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`];
  for (const url of candidates) {
    try {
      const res = await axios.get<string>(url, {
        timeout: 5000,
        headers: { 'User-Agent': USER_AGENT },
        responseType: 'text',
        transformResponse: [(d) => d],
        validateStatus: () => true,
      });
      if (res.status >= 200 && res.status < 300 && /<loc>/.test(String(res.data ?? ''))) {
        const xml = String(res.data);
        const urls = Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g)).map((m) => m[1].trim());
        return urls.filter((u) => u.startsWith(origin));
      }
    } catch {
      /* continue */
    }
  }
  return [];
}

function pickPriorityUrls(origin: string, sitemap: string[], maxPages: number): string[] {
  const PRIORITY_PATTERNS = [/\/$/, /\/about/i, /\/services/i, /\/products/i, /\/solutions/i, /\/pricing/i, /\/contact/i, /\/team/i];
  const seen = new Set<string>();
  const ordered: string[] = [];

  // Start URL — try both the bare origin and the www variant. Many large
  // sites 301-redirect bare→www, but the WAF behind that redirect sometimes
  // 403s the bare host even though `www.` works. Queue both so the worker
  // picks the one that returns content.
  const wwwOrigin = origin.replace(/^https?:\/\//, (m) => `${m}www.`);
  ordered.push(origin);
  seen.add(origin);
  if (wwwOrigin !== origin && !seen.has(wwwOrigin)) {
    ordered.push(wwwOrigin);
    seen.add(wwwOrigin);
  }

  // Priority paths from sitemap (about / services / products / etc.).
  for (const pat of PRIORITY_PATTERNS) {
    for (const u of sitemap) {
      if (ordered.length >= maxPages) break;
      if (!seen.has(u) && pat.test(u)) {
        ordered.push(u);
        seen.add(u);
      }
    }
  }
  // Fill remainder in sitemap order.
  for (const u of sitemap) {
    if (ordered.length >= maxPages) break;
    if (!seen.has(u)) {
      ordered.push(u);
      seen.add(u);
    }
  }
  return ordered.slice(0, maxPages);
}

export interface CrawlOptions {
  /** Override default page cap (default 12). */
  maxPages?: number;
  /** Disable Puppeteer fallback even if installed (used in tests). */
  disableBrowserFallback?: boolean;
  /** Skip the LLM synthesis step (used in tests). Returns contextJson=null. */
  skipSynthesis?: boolean;
}

// The eight section headings the dashboard's Domain Info card grid expects
// (see domainanalyzer/src/features/sidebar-dashboard/sections/AnalyticsCompanySection.tsx
// — the parser there matches on these exact titles, case-insensitive,
// stripping `# ` / `**` / leading numbers / trailing colons).
const CONTEXT_SECTIONS: ReadonlyArray<string> = [
  'Business Model Analysis',
  'Target Audience Profiling',
  'Value Proposition & Positioning',
  'SEO & Content Strategy Insights',
  'Competitive Intelligence',
  'Market Dynamics',
  'Location-Based SEO Analysis',
  'SEO Opportunity Analysis',
];

export async function synthesizeContext(rawText: string, schemaJson: unknown[]): Promise<{ context: ContextJson; tokens: number } | null> {
  if (!rawText.trim()) return null;
  try {
    const payload = await callJson<{
      companyName: string | null;
      industry: string | null;
      products: string[];
      services: string[];
      location: string | null;
      summary: string;
    }>({
      model: Models.synthesis,
      system:
        'You distil a website crawl into a rich, structured business profile. Output strict JSON. Be specific and substantive. If a field is unknown, use null or [].',
      user: [
        'Crawled text (concatenated from key pages):',
        rawText.slice(0, 12000),
        '',
        'JSON-LD blocks found on the site:',
        JSON.stringify(schemaJson).slice(0, 2000),
        '',
        'Return strict JSON with this exact shape:',
        '{ "companyName": string|null, "industry": string|null, "products": string[], "services": string[], "location": string|null, "summary": string }',
        '',
        'The `summary` field MUST be a markdown string with EIGHT sections, in this exact order, each with its heading on its own line followed by 2–4 substantive sentences:',
        ...CONTEXT_SECTIONS.map((h, i) => `${i + 1}. ${h}`),
        '',
        'Format each section as:',
        '## <Heading>',
        '<2–4 sentences with concrete details from the crawl>',
        '',
        'No bullet points. No tables. Use full prose paragraphs. Reference the actual company / industry / offerings the crawl revealed — do NOT produce generic boilerplate.',
      ].join('\n'),
      temperature: 0.2,
      maxTokens: 2200,
    });
    const context: ContextJson = {
      companyName: payload.companyName ?? null,
      industry: payload.industry ?? null,
      products: Array.isArray(payload.products) ? payload.products : [],
      services: Array.isArray(payload.services) ? payload.services : [],
      location: payload.location ?? null,
      summary: typeof payload.summary === 'string' ? payload.summary : '',
      schemaOrg: schemaJson,
    };
    return { context, tokens: 0 /* token usage not surfaced by SDK helper */ };
  } catch {
    return null;
  }
}

/**
 * Adequacy gate for an LLM-first homepage inference. Returns true when the
 * output is rich enough to ship as-is — otherwise the caller falls back to a
 * full multi-page crawl. We require:
 *
 *   - Both companyName AND industry populated (these gate downstream prompts).
 *   - All 8 section headings present in the summary markdown (the dashboard's
 *     AnalyticsCompanySection parser depends on them).
 *   - Each section has > 80 chars of prose after the heading.
 *
 * Threshold is conservative on purpose: we'd rather pay for a deep crawl
 * occasionally than ship a thin profile.
 */
function isContextAdequate(ctx: ContextJson | null): boolean {
  if (!ctx) return false;
  if (!ctx.companyName || !ctx.industry) return false;
  if (typeof ctx.summary !== 'string' || ctx.summary.length < 1200) return false;
  for (const heading of CONTEXT_SECTIONS) {
    // Headings can appear as `## Heading`, `# Heading`, or `**Heading**` —
    // match leniently (case-insensitive). The downstream parser is just as
    // lenient, so we only need to confirm each heading exists.
    const pattern = new RegExp(
      `(^|\\n)\\s*(#{1,3}\\s*|\\*{1,2}\\s*)?\\d*\\.?\\s*${heading.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}`,
      'i'
    );
    if (!pattern.test(ctx.summary)) return false;
    // Require some prose under the heading — find heading position and
    // check the next 80 chars contain at least 30 word chars.
    const idx = ctx.summary.toLowerCase().indexOf(heading.toLowerCase());
    if (idx < 0) return false;
    const after = ctx.summary.slice(idx + heading.length, idx + heading.length + 300);
    const wordCount = (after.match(/[a-z]{3,}/gi) || []).length;
    if (wordCount < 12) return false;
  }
  return true;
}

/**
 * LLM-first fast path: fetch just the homepage and let the existing
 * synthesizeContext() produce the rich 8-section ContextJson. Falls back to
 * Puppeteer on thin/SPA HTML, same as the multi-page crawler. Returns a
 * fully-populated CrawlOutput (same shape and density as crawlDomain) when
 * the adequacy gate passes, otherwise returns null so the caller can fall
 * back to a full multi-page crawl.
 *
 * Saving on the happy path: 11 of 12 page fetches skipped, plus competitor
 * pipeline can race against this single fetch instead of the full crawl.
 */
export async function inferDomainFromHomepage(rawUrl: string): Promise<CrawlOutput | null> {
  const norm = normalizeUrl(rawUrl);
  if (!norm) return null;

  const robotsStart = Date.now();
  const robots = await fetchRobots(norm.origin);
  console.log(`[PERF] crawl.fastpath.robots ${Date.now() - robotsStart}ms`);
  const policy: CrawlPolicy = {
    robotsAllowed: robots.allowed,
    sitemapFound: false,
    sitemapUrls: [],
    startUrl: norm.canonicalUrl,
  };
  if (!robots.allowed) return null;

  // Try bare origin first; if that 4xx/5xx, also try www. Many WAFs reject
  // the bare host but accept the www variant.
  const wwwOrigin = norm.origin.replace(/^https?:\/\//, (m) => `${m}www.`);
  const candidates = wwwOrigin !== norm.origin ? [norm.origin, wwwOrigin] : [norm.origin];

  let html = '';
  let via: 'http' | 'browser' = 'http';
  const fetchStart = Date.now();
  const httpResults = await Promise.all(candidates.map(async (url) => ({ url, result: await fetchHttp(url) })));
  const httpHit = httpResults.find(({ result }) => result.ok && result.html && !looksThin(result.html));
  if (httpHit) {
    html = httpHit.result.html;
  } else {
    // HTTP failed or content is thin/SPA — try Puppeteer for each candidate in
    // parallel. There are at most two candidates (bare + www), so this removes
    // a worst-case serial wait without increasing crawl breadth.
    const browserResults = await Promise.all(
      candidates.map(async (url) => ({ url, result: await fetchBrowser(url) }))
    );
    const browserHit = browserResults.find(({ result }) => result.ok && result.html);
    if (browserHit) {
      html = browserHit.result.html;
      via = 'browser';
    }
  }
  console.log(`[PERF] crawl.fastpath.fetch ${Date.now() - fetchStart}ms via=${via}`);

  if (!html) return null;

  const page = parsePage(norm.canonicalUrl, html, via);
  // Hard floor: if we couldn't extract enough text from the homepage, don't
  // even attempt LLM inference — fall through to multi-page crawl.
  if (page.content.length < 600) return null;

  const rawText = `# ${page.url}\n${page.title ?? ''}\n${page.description ?? ''}\n${page.content}`;
  const schemaJson = page.schemaJson;

  const synthStart = Date.now();
  const synthesized = await synthesizeContext(rawText, schemaJson);
  console.log(`[PERF] crawl.fastpath.synth ${Date.now() - synthStart}ms`);

  if (!synthesized || !isContextAdequate(synthesized.context)) return null;

  const quality: CrawlQuality = {
    contentQualityPct: 100,
    thinContentRatePct: 0,
    schemaCoveragePct: schemaJson.length > 0 ? 100 : 0,
    browserFallbackRatePct: via === 'browser' ? 100 : 0,
  };

  return {
    pagesScanned: 1,
    pages: [page],
    rawText: rawText.slice(0, 60_000),
    contextJson: synthesized.context,
    quality,
    policy,
    tokenUsage: synthesized.tokens,
  };
}

export async function crawlDomain(rawUrl: string, opts: CrawlOptions = {}): Promise<CrawlOutput> {
  const norm = normalizeUrl(rawUrl);
  if (!norm) throw new Error(`Invalid URL: ${rawUrl}`);
  const maxPages = Math.max(1, Math.min(MAX_PAGES, opts.maxPages ?? MAX_PAGES));

  const [robots, sitemap] = await Promise.all([
    fetchRobots(norm.origin),
    discoverSitemap(norm.origin),
  ]);
  const targetUrls = pickPriorityUrls(norm.origin, sitemap, maxPages);

  const policy: CrawlPolicy = {
    robotsAllowed: robots.allowed,
    sitemapFound: sitemap.length > 0,
    sitemapUrls: sitemap.slice(0, 50),
    startUrl: norm.canonicalUrl,
  };

  if (!robots.allowed) {
    return {
      pagesScanned: 0,
      pages: [],
      rawText: '',
      contextJson: null,
      quality: { contentQualityPct: 0, thinContentRatePct: 100, schemaCoveragePct: 0, browserFallbackRatePct: 0 },
      policy,
      tokenUsage: 0,
    };
  }

  // Concurrency-limited fetch.
  const pages: CrawledPage[] = [];
  const failedUrls: Array<{ url: string; httpStatus: number; browserTried: boolean }> = [];
  let browserFallbacks = 0;
  const CONCURRENCY = TARGET_CRAWL_CONCURRENCY;
  const queue = [...targetUrls];
  async function worker() {
    while (queue.length) {
      const url = queue.shift();
      if (!url) return;
      const httpRes = await fetchHttp(url);
      let html = httpRes.ok ? httpRes.html : '';
      let via: 'http' | 'browser' = 'http';

      // Puppeteer fallback fires if:
      //   1. The HTTP fetch failed (4xx/5xx/0) — likely a WAF / anti-bot block
      //   2. The HTTP fetch succeeded but content is suspiciously thin (SPA)
      const httpFailed = !httpRes.ok || !html;
      const httpThin = httpRes.ok && !!html && looksThin(html);
      const shouldTryBrowser = (httpFailed || httpThin) && !opts.disableBrowserFallback;
      if (shouldTryBrowser) {
        const browser = await fetchBrowser(url);
        if (browser.ok && browser.html) {
          html = browser.html;
          via = 'browser';
          browserFallbacks++;
        } else if (httpFailed) {
          failedUrls.push({ url, httpStatus: httpRes.status, browserTried: true });
          console.warn(`[crawl] ${url} — http=${httpRes.status} browser=failed`);
        }
      } else if (httpFailed) {
        failedUrls.push({ url, httpStatus: httpRes.status, browserTried: false });
      }

      if (html) pages.push(parsePage(url, html, via));
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  // Surface diagnostic info for the dev console — without it, "0 pages
  // scanned" is impossible to debug from logs alone.
  if (pages.length === 0) {
    console.warn(
      `[crawl] zero pages for ${norm.host} — robotsAllowed=${robots.allowed} ` +
        `sitemap=${sitemap.length} attempted=${targetUrls.length} failed=${failedUrls.length}`
    );
    failedUrls.slice(0, 5).forEach((f) => console.warn(`[crawl]   ${f.url} → http=${f.httpStatus}`));
  }

  const rawText = pages.map((p) => `# ${p.url}\n${p.title ?? ''}\n${p.description ?? ''}\n${p.content}`).join('\n\n').slice(0, 60_000);

  const allSchema = pages.flatMap((p) => p.schemaJson);
  const synthesized = opts.skipSynthesis ? null : await synthesizeContext(rawText, allSchema);

  const thinCount = pages.filter((p) => p.content.length < THIN_THRESHOLD_CHARS).length;
  const schemaPages = pages.filter((p) => p.schemaJson.length > 0).length;
  const quality: CrawlQuality = {
    contentQualityPct: pages.length === 0 ? 0 : Math.round(((pages.length - thinCount) / pages.length) * 100),
    thinContentRatePct: pages.length === 0 ? 0 : Math.round((thinCount / pages.length) * 100),
    schemaCoveragePct: pages.length === 0 ? 0 : Math.round((schemaPages / pages.length) * 100),
    browserFallbackRatePct: pages.length === 0 ? 0 : Math.round((browserFallbacks / pages.length) * 100),
  };

  return {
    pagesScanned: pages.length,
    pages,
    rawText,
    contextJson: synthesized?.context ?? null,
    quality,
    policy,
    tokenUsage: synthesized?.tokens ?? 0,
  };
}

/** Inferred companySize from extracted text. Pure heuristic. */
export function inferCompanySize(rawText: string | null | undefined): import('./types').CompanySize {
  if (!rawText) return 'smb';
  const t = rawText.toLowerCase();
  if (/\b(enterprise|fortune\s*(500|100)|publicly\s+traded|nyse|nasdaq|10000\+\s*employees)\b/.test(t)) return 'enterprise';
  if (/\b(mid[- ]market|series\s+[bc]|\d{3,4}\s*employees|growing\s+team\s+of\s+\d+)\b/.test(t)) return 'mid';
  if (/\b(freelancer|self[- ]employed|sole\s+proprietor|consultant\s+working\s+alone)\b/.test(t)) return 'solo';
  return 'smb';
}
