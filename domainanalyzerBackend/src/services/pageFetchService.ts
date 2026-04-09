import axios from 'axios';
import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';
import type { CrawlPolicy, PageFetchMode, PageSnapshot, UrlCandidate } from './domainContextTypes';

interface PageFetchResult {
  url: string;
  requestedUrl: string;
  status: number;
  html: string | null;
  fetchMode: PageFetchMode;
  headers: Record<string, string | undefined>;
  notModified?: boolean;
  cachedSnapshot?: PageSnapshot;
  error?: string;
}

function parseRetryAfter(value?: string): number | null {
  if (!value) {
    return null;
  }

  const seconds = Number(value);
  if (Number.isFinite(seconds)) {
    return Math.max(seconds * 1000, 0);
  }

  const date = Date.parse(value);
  if (Number.isFinite(date)) {
    return Math.max(date - Date.now(), 0);
  }

  return null;
}

function hasMeaningfulMainContent(html: string): boolean {
  const $ = cheerio.load(html);
  const mainText = $('main, article, [role="main"]').text().replace(/\s+/g, ' ').trim();
  return mainText.length > 250;
}

function looksLikeAppShell(html: string): boolean {
  const normalized = html.toLowerCase();
  const bodyText = cheerio.load(html)('body').text().replace(/\s+/g, ' ').trim();

  return (
    bodyText.length < 250 ||
    normalized.includes('__next_data__') ||
    normalized.includes('id="__next"') ||
    normalized.includes('id="app"') ||
    normalized.includes('id="root"') ||
    normalized.includes('enable javascript') ||
    normalized.includes('loading...')
  );
}

async function fetchWithBrowser(url: string, timeoutMs: number): Promise<{ html: string; finalUrl: string }> {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    headless: true,
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    await page.waitForFunction(() => (document.body?.innerText || '').trim().length > 200, { timeout: Math.min(5000, timeoutMs) }).catch(() => undefined);
    const html = await page.content();
    return {
      html,
      finalUrl: page.url(),
    };
  } finally {
    await browser.close().catch(() => undefined);
  }
}

function buildCachedFallback(candidate: UrlCandidate, previousSnapshot: PageSnapshot, reason: string): PageFetchResult {
  return {
    url: previousSnapshot.url,
    requestedUrl: candidate.url,
    status: 304,
    html: null,
    fetchMode: 'cached',
    headers: {
      etag: previousSnapshot.etag ?? undefined,
      'last-modified': previousSnapshot.lastModified ?? undefined,
    },
    notModified: true,
    cachedSnapshot: previousSnapshot,
    error: reason,
  };
}

export async function fetchPageWithFallback(params: {
  candidate: UrlCandidate;
  policy: CrawlPolicy;
  previousSnapshot?: PageSnapshot;
}): Promise<PageFetchResult> {
  const { candidate, policy, previousSnapshot } = params;
  const headers: Record<string, string> = {
    'User-Agent': policy.userAgent,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  };

  if (previousSnapshot?.etag) {
    headers['If-None-Match'] = previousSnapshot.etag;
  }
  if (previousSnapshot?.lastModified) {
    headers['If-Modified-Since'] = previousSnapshot.lastModified;
  }

  let attempt = 0;
  while (attempt <= policy.rateLimits.retryBackoffMs.length) {
    let response;
    try {
      response = await axios.get<string>(candidate.url, {
        timeout: policy.timeouts.responseMs,
        responseType: 'text',
        validateStatus: () => true,
        headers,
        maxRedirects: 5,
      });
    } catch (error) {
      const axiosError = axios.isAxiosError(error) ? error : null;
      const isTimeout = axiosError?.code === 'ECONNABORTED' || String(axiosError?.message || '').toLowerCase().includes('timeout');
      const responseHeaders: Record<string, string | undefined> = {};

      if (isTimeout) {
        try {
          const browserResult = await fetchWithBrowser(candidate.url, policy.timeouts.browserMs);
          return {
            url: browserResult.finalUrl,
            requestedUrl: candidate.url,
            status: 200,
            html: browserResult.html,
            fetchMode: 'browser',
            headers: responseHeaders,
          };
        } catch (browserError) {
          if (previousSnapshot) {
            return buildCachedFallback(candidate, previousSnapshot, 'HTTP timeout; reused cached snapshot');
          }

          return {
            url: candidate.url,
            requestedUrl: candidate.url,
            status: 408,
            html: null,
            fetchMode: 'http',
            headers: responseHeaders,
            error: browserError instanceof Error ? browserError.message : 'Timed out fetching page',
          };
        }
      }

      if (previousSnapshot) {
        return buildCachedFallback(candidate, previousSnapshot, 'Network error; reused cached snapshot');
      }

      return {
        url: candidate.url,
        requestedUrl: candidate.url,
        status: 599,
        html: null,
        fetchMode: 'http',
        headers: responseHeaders,
        error: axiosError?.message || 'Failed to fetch page',
      };
    }

    if (response.status === 304 && previousSnapshot) {
      return {
        url: previousSnapshot.url,
        requestedUrl: candidate.url,
        status: 304,
        html: null,
        fetchMode: 'cached',
        headers: {
          etag: previousSnapshot.etag ?? undefined,
          'last-modified': previousSnapshot.lastModified ?? undefined,
        },
        notModified: true,
        cachedSnapshot: previousSnapshot,
      };
    }

    if ((response.status === 429 || response.status === 503) && attempt < policy.rateLimits.retryBackoffMs.length) {
      const retryAfter = parseRetryAfter(response.headers['retry-after']) ?? policy.rateLimits.retryBackoffMs[attempt];
      await new Promise((resolve) => setTimeout(resolve, retryAfter));
      attempt += 1;
      continue;
    }

    const responseHeaders: Record<string, string | undefined> = {
      etag: response.headers.etag,
      'last-modified': response.headers['last-modified'],
      'content-language': response.headers['content-language'],
    };

    if (response.status < 200 || response.status >= 400 || !response.data) {
      return {
        url: response.request?.res?.responseUrl || candidate.url,
        requestedUrl: candidate.url,
        status: response.status,
        html: null,
        fetchMode: 'http',
        headers: responseHeaders,
      };
    }

    const responseUrl = response.request?.res?.responseUrl || candidate.url;
    let html = response.data;
    let fetchMode: PageFetchMode = 'http';
    let finalUrl = responseUrl;

      if (looksLikeAppShell(html) || !hasMeaningfulMainContent(html)) {
        try {
          const browserResult = await fetchWithBrowser(responseUrl, policy.timeouts.browserMs);
        html = browserResult.html;
        finalUrl = browserResult.finalUrl;
        fetchMode = 'browser';
      } catch {
        fetchMode = 'http';
      }
    }

    return {
      url: finalUrl,
      requestedUrl: candidate.url,
      status: response.status,
      html,
      fetchMode,
      headers: responseHeaders,
    };
  }

  return {
    url: candidate.url,
    requestedUrl: candidate.url,
    status: 429,
    html: null,
    fetchMode: 'http',
    headers: {},
    error: 'Host throttled after retries',
  };
}
