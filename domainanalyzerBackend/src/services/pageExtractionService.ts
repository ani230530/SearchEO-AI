import crypto from 'crypto';
import * as cheerio from 'cheerio';
import { canonicalizeUrl } from './crawlPolicyService';
import { scoreUrl } from './urlDiscoveryService';
import type { CrawlPolicy, PageFetchMode, PageSnapshot } from './domainContextTypes';

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function safeJsonParse(value: string): unknown | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function extractMainText($: cheerio.CheerioAPI): string {
  $('script, style, noscript, iframe, svg, canvas').remove();
  const candidates = $('main, article, [role="main"], .content, .main, .page-content, .post, .article, section');

  let bestText = '';
  let bestScore = 0;

  candidates.each((_, element) => {
    const clone = $(element).clone();
    clone.find('nav, header, footer, aside, form, button').remove();
    const text = collapseWhitespace(clone.text());
    const score = text.length + clone.find('h1, h2, h3').length * 80;
    if (score > bestScore) {
      bestScore = score;
      bestText = text;
    }
  });

  if (bestText.length > 200) {
    return bestText;
  }

  const bodyClone = $('body').clone();
  bodyClone.find('nav, header, footer, aside, form, button').remove();
  return collapseWhitespace(bodyClone.text());
}

function computeReadability(text: string): number {
  if (!text) {
    return 0;
  }

  const sentences = Math.max(1, text.split(/[.!?]+/).filter(Boolean).length);
  const words = Math.max(1, text.split(/\s+/).filter(Boolean).length);
  const syllables = text
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .reduce((total, word) => total + Math.max(1, (word.match(/[aeiouy]+/g) || []).length), 0);

  const score = 206.835 - 1.015 * (words / sentences) - 84.6 * (syllables / words);
  return Math.max(0, Math.min(100, Math.round(score)));
}

function extractMetaMap($: cheerio.CheerioAPI, selectorPrefix: string): Record<string, string> {
  const map: Record<string, string> = {};
  $(`meta[${selectorPrefix}]`).each((_, element) => {
    const key = $(element).attr(selectorPrefix)?.replace(/^og:|^twitter:/, '');
    const value = $(element).attr('content');
    if (key && value) {
      map[key] = value.trim();
    }
  });
  return map;
}

export function extractPageSnapshot(params: {
  html: string;
  requestedUrl: string;
  finalUrl: string;
  status: number;
  fetchMode: PageFetchMode;
  discoveredVia: PageSnapshot['discoveredVia'];
  sourceUrl?: string;
  headers: Record<string, string | undefined>;
  policy: CrawlPolicy;
}): PageSnapshot {
  const { html, requestedUrl, finalUrl, status, fetchMode, discoveredVia, sourceUrl, headers, policy } = params;
  const $ = cheerio.load(html);

  const title = collapseWhitespace($('title').first().text());
  const metaDescription = collapseWhitespace($('meta[name="description"]').attr('content') || '');
  const og = extractMetaMap($, 'property');
  const twitter = extractMetaMap($, 'name');
  const jsonLd = $('script[type="application/ld+json"]')
    .map((_, element) => safeJsonParse($(element).contents().text()))
    .get()
    .filter((item): item is unknown => item !== null);
  const headings = $('h1, h2, h3')
    .map((_, element) => collapseWhitespace($(element).text()))
    .get()
    .filter(Boolean)
    .slice(0, 12);
  const canonicalHref = $('link[rel="canonical"]').attr('href');
  const canonicalUrl = canonicalHref ? canonicalizeUrl(canonicalHref, finalUrl) : canonicalizeUrl(finalUrl, policy.baseUrl);
  const language = $('html').attr('lang') || headers['content-language'] || null;
  const mainText = extractMainText($);
  const internalLinks = $('a[href]')
    .map((_, element) => $(element).attr('href'))
    .get()
    .filter((href): href is string => !!href && !href.startsWith('mailto:') && !href.startsWith('tel:') && !href.startsWith('#'))
    .map((href) => canonicalizeUrl(href, finalUrl))
    .filter((href) => {
      try {
        return new URL(href).hostname.replace(/^www\./, '').toLowerCase() === policy.normalizedDomain;
      } catch {
        return false;
      }
    });
  const wordCount = mainText ? mainText.split(/\s+/).filter(Boolean).length : 0;
  const schemaCoverage = jsonLd.length;
  const thinContent = wordCount < 120 || mainText.length < 500;
  const contentHash = crypto.createHash('sha1').update(`${canonicalUrl}\n${title}\n${mainText}`).digest('hex');
  const readability = computeReadability(mainText);
  const metadataSignals = (title ? 1 : 0) + (metaDescription ? 1 : 0) + (headings.length > 0 ? 1 : 0) + (schemaCoverage > 0 ? 1 : 0);
  const contentScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        Math.min(mainText.length / 80, 55) +
          Math.min(wordCount / 20, 20) +
          Math.min(schemaCoverage * 8, 16) +
          metadataSignals * 2 +
          Math.max(scoreUrl(canonicalUrl, policy.baseUrl), 0) / 6
      )
    )
  );

  return {
    url: canonicalizeUrl(finalUrl, policy.baseUrl),
    requestedUrl: canonicalizeUrl(requestedUrl, policy.baseUrl),
    canonicalUrl,
    status,
    fetchMode,
    discoveredVia,
    sourceUrl: sourceUrl ? canonicalizeUrl(sourceUrl, policy.baseUrl) : null,
    etag: headers.etag ?? null,
    lastModified: headers['last-modified'] ?? null,
    title,
    metaDescription,
    og,
    twitter,
    jsonLd,
    headings,
    mainText,
    language,
    contentHash,
    contentScore,
    thinContent,
    schemaCoverage,
    wordCount,
    readability,
    internalLinks: Array.from(new Set(internalLinks)),
    fetchedAt: new Date().toISOString(),
  };
}
