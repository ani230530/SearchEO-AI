import axios from 'axios';
import * as cheerio from 'cheerio';
import type { CrawlPolicy, CrawlPolicyRule } from './domainContextTypes';

const DEFAULT_USER_AGENT = 'Mozilla/5.0 (compatible; SEO-Analyzer/2.0; +https://blueoceanglobaltech.com)';

export function normalizeUrlOrDomain(input: string): { baseUrl: string; domain: string } {
  const trimmed = input.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    const parsed = new URL(trimmed);
    return {
      baseUrl: `${parsed.protocol}//${parsed.host}`,
      domain: parsed.hostname.replace(/^www\./, '').toLowerCase(),
    };
  }

  const domain = trimmed.replace(/^www\./, '').replace(/\/+$/, '').toLowerCase();
  return {
    baseUrl: `https://${domain}`,
    domain,
  };
}

export function canonicalizeUrl(rawUrl: string, baseUrl?: string): string {
  const resolved = baseUrl ? new URL(rawUrl, baseUrl) : new URL(rawUrl);
  resolved.hash = '';
  resolved.hostname = resolved.hostname.toLowerCase();

  if ((resolved.protocol === 'https:' && resolved.port === '443') || (resolved.protocol === 'http:' && resolved.port === '80')) {
    resolved.port = '';
  }

  const queryEntries = Array.from(resolved.searchParams.entries()).filter(([key]) => !key.toLowerCase().startsWith('utm_'));
  resolved.search = '';
  for (const [key, value] of queryEntries) {
    resolved.searchParams.append(key, value);
  }

  if (resolved.pathname !== '/') {
    resolved.pathname = resolved.pathname.replace(/\/+$/, '');
  }

  return resolved.toString();
}

export function canonicalizeUrlOrNull(rawUrl: string, baseUrl?: string): string | null {
  try {
    return canonicalizeUrl(rawUrl, baseUrl);
  } catch {
    return null;
  }
}

function parseRobotsRules(body: string): CrawlPolicyRule[] {
  const lines = body.split(/\r?\n/);
  const rules: CrawlPolicyRule[] = [];
  let activeAgents: string[] = [];

  for (const line of lines) {
    const normalized = line.replace(/#.*/, '').trim();
    if (!normalized || !normalized.includes(':')) {
      continue;
    }

    const [rawKey, ...rest] = normalized.split(':');
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(':').trim();

    if (key === 'user-agent') {
      activeAgents.push(value.toLowerCase());
      continue;
    }

    if ((key === 'allow' || key === 'disallow') && activeAgents.length > 0) {
      for (const agent of activeAgents) {
        rules.push({
          directive: key,
          path: value || '/',
          userAgent: agent,
        });
      }
      continue;
    }

    if (key !== 'allow' && key !== 'disallow') {
      activeAgents = [];
    }
  }

  return rules;
}

function parseSitemapUrls(body: string): string[] {
  return body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.toLowerCase().startsWith('sitemap:'))
    .map((line) => line.slice('sitemap:'.length).trim())
    .filter(Boolean);
}

async function fetchSitemapUrls(url: string, timeoutMs: number, depth = 0, seen = new Set<string>()): Promise<string[]> {
  if (depth > 2 || seen.has(url)) {
    return [];
  }

  seen.add(url);

  try {
    const response = await axios.get<string>(url, {
      timeout: timeoutMs,
      responseType: 'text',
      validateStatus: (status) => status >= 200 && status < 400,
      headers: { 'User-Agent': DEFAULT_USER_AGENT, Accept: 'application/xml,text/xml;q=0.9,*/*;q=0.1' },
    });

    const $ = cheerio.load(response.data, { xmlMode: true });
    const sitemapLocs = $('sitemap > loc')
      .map((_, element) => $(element).text().trim())
      .get()
      .filter(Boolean);

    if (sitemapLocs.length > 0) {
      const nested = await Promise.all(sitemapLocs.slice(0, 5).map((nestedUrl) => fetchSitemapUrls(nestedUrl, timeoutMs, depth + 1, seen)));
      return nested.flat().slice(0, 50);
    }

    return $('url > loc')
      .map((_, element) => $(element).text().trim())
      .get()
      .filter(Boolean)
      .slice(0, 50);
  } catch {
    return [];
  }
}

export async function fetchCrawlPolicy(
  input: string,
  options?: {
    maxPages?: number;
    connectMs?: number;
    responseMs?: number;
    browserMs?: number;
  }
): Promise<CrawlPolicy> {
  const { baseUrl, domain } = normalizeUrlOrDomain(input);
  const connectMs = options?.connectMs ?? 5000;
  const responseMs = options?.responseMs ?? 12000;
  const browserMs = options?.browserMs ?? 20000;
  const robotsUrl = `${baseUrl}/robots.txt`;

  let robotsStatus: number | null = null;
  let robotsFetched = false;
  let rules: CrawlPolicyRule[] = [];
  let sitemapSources: string[] = [];

  try {
    const robotsResponse = await axios.get<string>(robotsUrl, {
      timeout: responseMs,
      responseType: 'text',
      validateStatus: () => true,
      headers: { 'User-Agent': DEFAULT_USER_AGENT },
    });

    robotsStatus = robotsResponse.status;
    robotsFetched = robotsResponse.status >= 200 && robotsResponse.status < 300;

    if (robotsFetched) {
      rules = parseRobotsRules(robotsResponse.data);
      sitemapSources = parseSitemapUrls(robotsResponse.data);
    }
  } catch {
    robotsFetched = false;
  }

  if (sitemapSources.length === 0) {
    sitemapSources = [`${baseUrl}/sitemap.xml`, `${baseUrl}/sitemap_index.xml`];
  }

  const sitemapUrls = Array.from(new Set(sitemapSources.map((url) => canonicalizeUrl(url, baseUrl))));
  const discoveredSitemapUrls = (
    await Promise.all(sitemapUrls.map((sitemapUrl) => fetchSitemapUrls(sitemapUrl, responseMs)))
  ).flat().length;

  return {
    baseUrl,
    normalizedDomain: domain,
    robotsUrl,
    robotsStatus,
    robotsFetched,
    sitemaps: sitemapUrls,
    discoveredSitemapUrls,
    rules,
    maxPages: options?.maxPages ?? 12,
    userAgent: DEFAULT_USER_AGENT,
    rateLimits: {
      hostConcurrency: 2,
      globalConcurrency: 8,
      retryBackoffMs: [5000, 15000, 60000],
    },
    timeouts: {
      connectMs,
      responseMs,
      browserMs,
    },
  };
}

export function isUrlAllowed(policy: CrawlPolicy, url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (parsed.hostname.replace(/^www\./, '').toLowerCase() !== policy.normalizedDomain) {
    return false;
  }

  const path = parsed.pathname || '/';
  const relevantRules = policy.rules.filter((rule) => rule.userAgent === '*' || policy.userAgent.toLowerCase().includes(rule.userAgent));

  let winningRule: CrawlPolicyRule | null = null;
  for (const rule of relevantRules) {
    if (!rule.path || !path.startsWith(rule.path)) {
      continue;
    }

    if (!winningRule || rule.path.length > winningRule.path.length) {
      winningRule = rule;
    }
  }

  return winningRule ? winningRule.directive !== 'disallow' : true;
}

export async function collectSitemapUrls(policy: CrawlPolicy): Promise<string[]> {
  const discovered = await Promise.all(policy.sitemaps.map((sitemapUrl) => fetchSitemapUrls(sitemapUrl, policy.timeouts.responseMs)));
  return Array.from(new Set(discovered.flat().map((url) => canonicalizeUrl(url, policy.baseUrl))));
}
