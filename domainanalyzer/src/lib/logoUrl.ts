/**
 * Resolves a logo URL for a given hostname.
 *
 * Hits the backend proxy at `/api/logo/:host` instead of img.logo.dev
 * directly. The proxy:
 *   - keeps the logo.dev token server-side (no exposure in frontend source)
 *   - caches bytes in Redis for 30 days + long browser Cache-Control headers
 *   - serves a 1×1 transparent PNG fallback so missing logos never render
 *     a broken-image icon
 *
 * Always use this helper instead of constructing img.logo.dev URLs inline.
 */
const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3002';

/** Strip protocol/path/www so the path param is a bare host. */
function normalizeHost(input: string): string {
  return input
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .split('/')[0]
    .toLowerCase();
}

/**
 * @param host hostname or full URL (we normalize internally).
 * @param size pixel size; backend whitelists 16|24|32|48|64|96|128|192|256.
 */
export function logoUrl(host: string | null | undefined, size: number = 64): string | null {
  if (!host) return null;
  const clean = normalizeHost(host);
  if (!clean) return null;
  return `${API_BASE_URL}/api/logo/${encodeURIComponent(clean)}?size=${size}`;
}
