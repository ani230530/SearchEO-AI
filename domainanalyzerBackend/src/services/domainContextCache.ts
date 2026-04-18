import Redis from 'ioredis';
import { formatRedisError, getRedisUrl } from '../lib/redisConfig';
import type { DomainContextJson } from './domainContextTypes';

// ── Redis client ─────────────────────────────────────────────────────────────

const REDIS_URL = getRedisUrl(process.env.REDIS_URL);
let redis: Redis | null = null;

try {
  redis = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => Math.min(times * 200, 3000),
    lazyConnect: true,
  });
  redis.connect().catch((err) => {
    console.warn(`[DomainContextCache] Redis connection failed for ${REDIS_URL}, caching disabled: ${formatRedisError(err)}`);
    redis = null;
  });
} catch (err) {
  console.warn(`[DomainContextCache] Redis init failed for ${REDIS_URL}, caching disabled: ${formatRedisError(err)}`);
  redis = null;
}

// ── Cache TTLs (seconds) ─────────────────────────────────────────────────────

const CACHE_TTL = {
  DOMAIN_CONTEXT: 7 * 24 * 60 * 60,   // 7 days for full domain context
  SCRAPE_LOCK: 5 * 60,                 // 5-minute lock to prevent duplicate scrapes
  FAILED_DOMAIN: 60 * 60,              // 1 hour cooldown for failed domains
  AI_DETECTION: 14 * 24 * 60 * 60,     // 14 days for AI content detection results
};

// ── Cache interfaces ─────────────────────────────────────────────────────────

interface CachedDomainContext {
  contextJson: DomainContextJson;
  contextText: string;
  summaryContext: string;
  tokenUsage: number;
  cachedAt: string;
  domain: string;
}

// ── Public API ───────────────────────────────────────────────────────────────

export const domainContextCache = {
  /**
   * Get cached domain context. Returns null if not cached or expired.
   */
  get: async (domain: string): Promise<CachedDomainContext | null> => {
    if (!redis) return null;
    try {
      const key = `domain:context:${normalizeDomain(domain)}`;
      const cached = await redis.get(key);
      if (!cached) return null;
      return JSON.parse(cached) as CachedDomainContext;
    } catch (err) {
      console.warn('[DomainContextCache] Get failed:', err);
      return null;
    }
  },

  /**
   * Cache domain context with 7-day TTL.
   */
  set: async (domain: string, data: {
    contextJson: DomainContextJson;
    contextText: string;
    summaryContext: string;
    tokenUsage: number;
  }): Promise<void> => {
    if (!redis) return;
    try {
      const key = `domain:context:${normalizeDomain(domain)}`;
      const payload: CachedDomainContext = {
        ...data,
        cachedAt: new Date().toISOString(),
        domain,
      };
      await redis.setex(key, CACHE_TTL.DOMAIN_CONTEXT, JSON.stringify(payload));
    } catch (err) {
      console.warn('[DomainContextCache] Set failed:', err);
    }
  },

  /**
   * Try to acquire a scrape lock for a domain (prevents concurrent scrapes).
   * Returns true if lock was acquired, false if another scrape is in progress.
   */
  acquireScrapeLock: async (domain: string): Promise<boolean> => {
    if (!redis) return true; // No Redis = no locking = always proceed
    try {
      const key = `domain:lock:${normalizeDomain(domain)}`;
      const result = await redis.set(key, Date.now().toString(), 'EX', CACHE_TTL.SCRAPE_LOCK, 'NX');
      return result === 'OK';
    } catch {
      return true; // On error, allow the scrape
    }
  },

  /**
   * Release the scrape lock for a domain.
   */
  releaseScrapeLock: async (domain: string): Promise<void> => {
    if (!redis) return;
    try {
      const key = `domain:lock:${normalizeDomain(domain)}`;
      await redis.del(key);
    } catch { /* ignore */ }
  },

  /**
   * Mark a domain as failed (1-hour cooldown to avoid re-scraping immediately).
   */
  markFailed: async (domain: string): Promise<void> => {
    if (!redis) return;
    try {
      const key = `domain:failed:${normalizeDomain(domain)}`;
      await redis.setex(key, CACHE_TTL.FAILED_DOMAIN, new Date().toISOString());
    } catch { /* ignore */ }
  },

  /**
   * Check if a domain is in the failed cooldown period.
   */
  isFailed: async (domain: string): Promise<boolean> => {
    if (!redis) return false;
    try {
      const key = `domain:failed:${normalizeDomain(domain)}`;
      return (await redis.exists(key)) === 1;
    } catch {
      return false;
    }
  },

  /**
   * Cache AI content detection results with 14-day TTL.
   */
  setAIDetection: async (domain: string, data: any): Promise<void> => {
    if (!redis) return;
    try {
      const key = `domain:ai-detection:${normalizeDomain(domain)}`;
      await redis.setex(key, CACHE_TTL.AI_DETECTION, JSON.stringify({
        ...data,
        cachedAt: new Date().toISOString(),
      }));
    } catch { /* ignore */ }
  },

  /**
   * Get cached AI content detection results.
   */
  getAIDetection: async (domain: string): Promise<any | null> => {
    if (!redis) return null;
    try {
      const key = `domain:ai-detection:${normalizeDomain(domain)}`;
      const cached = await redis.get(key);
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  },

  /**
   * Invalidate all caches for a domain (force re-scrape).
   */
  invalidate: async (domain: string): Promise<void> => {
    if (!redis) return;
    try {
      const normalized = normalizeDomain(domain);
      await redis.del(
        `domain:context:${normalized}`,
        `domain:lock:${normalized}`,
        `domain:failed:${normalized}`,
        `domain:ai-detection:${normalized}`
      );
    } catch { /* ignore */ }
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function normalizeDomain(domain: string): string {
  return domain.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
}
