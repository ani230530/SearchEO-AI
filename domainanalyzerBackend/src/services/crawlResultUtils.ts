import type { CrawlPolicy, CrawlQualitySummary, DomainContextJson, PageSnapshot } from './domainContextTypes';

export function parseJsonValue<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) {
    return fallback;
  }

  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }

  return value as T;
}

export function parseStringArray(value: unknown): string[] {
  const parsed = parseJsonValue<unknown[]>(value, []);
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.filter((item): item is string => typeof item === 'string');
}

export function parsePageSnapshots(value: unknown): PageSnapshot[] {
  const parsed = parseJsonValue<unknown[]>(value, []);
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.filter((item): item is PageSnapshot => !!item && typeof item === 'object' && typeof (item as PageSnapshot).url === 'string');
}

export function parseCrawlPolicy(value: unknown): CrawlPolicy | null {
  const parsed = parseJsonValue<CrawlPolicy | null>(value, null);
  return parsed && typeof parsed === 'object' ? parsed : null;
}

export function parseCrawlQuality(value: unknown): CrawlQualitySummary | null {
  const parsed = parseJsonValue<CrawlQualitySummary | null>(value, null);
  return parsed && typeof parsed === 'object' ? parsed : null;
}

export function parseContextJson(value: unknown): DomainContextJson | null {
  const parsed = parseJsonValue<DomainContextJson | null>(value, null);
  return parsed && typeof parsed === 'object' ? parsed : null;
}
