/**
 * Logo proxy — wraps img.logo.dev so the token stays server-side and the
 * frontend doesn't make 50 parallel external requests on a domain list view.
 *
 * Why this exists:
 *   - The previous design hard-coded `pk_DTdFFG1JT9WOCjATvZEzIA` in the
 *     frontend. Anyone viewing source could enumerate every tracked domain
 *     by hitting img.logo.dev directly (and exhaust the shared rate-limit
 *     for all users).
 *   - Logos rarely change. Caching the bytes in Redis (30d) + emitting a
 *     long Cache-Control header lets the browser/CDN cache aggressively
 *     too. Repeat views are free.
 *
 * Behavior:
 *   - GET /api/logo/:host?size=64|128 — returns the image bytes with
 *     correct Content-Type.
 *   - Bare host only (no protocol, no path). Anything weird returns a 400.
 *   - On upstream miss (404/timeout), serves a 1x1 transparent PNG so the
 *     <img> tag doesn't render a broken-image icon.
 *
 * No auth: logos are public. The route is unauthenticated, but we sanitize
 * the host param hard to avoid open-proxy abuse.
 */

import { Router, Request, Response } from 'express';
import { redisService } from '../services/RedisService';

const router = Router();

const LOGO_DEV_TOKEN = process.env.LOGO_DEV_TOKEN || 'pk_DTdFFG1JT9WOCjATvZEzIA';
const UPSTREAM_TIMEOUT_MS = 5_000;
const REDIS_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
const BROWSER_CACHE_SECONDS = 30 * 24 * 60 * 60;
const ALLOWED_SIZES = new Set([16, 24, 32, 48, 64, 96, 128, 192, 256]);

// 1×1 transparent PNG used when upstream has no logo. Same bytes regardless
// of host so the browser caches it.
const FALLBACK_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

/** Reject anything that's not a plain hostname (no slashes, no spaces, no protocol). */
function sanitizeHost(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;
  // Strip accidental protocol/path/port the frontend may have left in.
  const cleaned = trimmed
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, '');
  // Hostname grammar: at least one dot, only alphanumerics + dots + hyphens.
  if (!/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(cleaned)) return null;
  // Cap length so we don't burn cache keys on accidental garbage.
  if (cleaned.length > 253) return null;
  return cleaned;
}

router.get('/:host', async (req: Request, res: Response) => {
  const host = sanitizeHost(req.params.host);
  if (!host) {
    return res.status(400).json({ error: 'Invalid host' });
  }

  const sizeParam = Number.parseInt(String(req.query.size ?? '64'), 10);
  const size = ALLOWED_SIZES.has(sizeParam) ? sizeParam : 64;

  const cacheKey = `logo:${host}:${size}`;

  // Fast path: Redis hit.
  try {
    const cached = await redisService.get(cacheKey);
    if (cached) {
      // We serialize as base64 because ioredis returns strings; binary mode
      // would also work but base64 keeps the helper simple and is small enough
      // for ≤8KB logos.
      const bytes = Buffer.from(cached, 'base64');
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', `public, max-age=${BROWSER_CACHE_SECONDS}, immutable`);
      res.setHeader('X-Logo-Cache', 'hit');
      return res.send(bytes);
    }
  } catch (err) {
    // Don't fail the request just because Redis is degraded — fall through
    // to the upstream fetch and serve the live response.
    console.warn('[logo-proxy] Redis read failed', err);
  }

  // Slow path: fetch from img.logo.dev.
  const upstream = `https://img.logo.dev/${encodeURIComponent(host)}?token=${LOGO_DEV_TOKEN}&size=${size}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const resp = await fetch(upstream, { signal: controller.signal });
    clearTimeout(timer);

    if (!resp.ok || resp.status === 404) {
      // Cache the fallback briefly so we don't hammer logo.dev on every
      // request for a host that genuinely doesn't have a logo (5 min TTL).
      await redisService.set(cacheKey, FALLBACK_PNG.toString('base64'), 5 * 60).catch(() => {});
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', `public, max-age=300`);
      res.setHeader('X-Logo-Cache', 'miss-fallback');
      return res.send(FALLBACK_PNG);
    }

    const arrayBuffer = await resp.arrayBuffer();
    const bytes = Buffer.from(arrayBuffer);
    const contentType = resp.headers.get('content-type') ?? 'image/png';

    // Persist to Redis. Don't block the response if Redis write fails.
    redisService
      .set(cacheKey, bytes.toString('base64'), REDIS_TTL_SECONDS)
      .catch((err) => console.warn('[logo-proxy] Redis write failed', err));

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', `public, max-age=${BROWSER_CACHE_SECONDS}, immutable`);
    res.setHeader('X-Logo-Cache', 'miss');
    return res.send(bytes);
  } catch (err) {
    clearTimeout(timer);
    console.warn('[logo-proxy] upstream fetch failed', err);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.setHeader('X-Logo-Cache', 'error-fallback');
    return res.send(FALLBACK_PNG);
  }
});

export default router;
