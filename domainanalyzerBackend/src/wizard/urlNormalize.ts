/**
 * URL normalization — single source of truth for "how do we represent a host".
 *
 * Two outputs we care about:
 *   - canonicalUrl: `https://${host}` (what we store in Domain.url)
 *   - host:         lowercased, no www, no path, no port (what we key by)
 *
 * Pure function, deterministic. All other modules call this — never roll
 * their own URL parsing.
 */

export interface NormalizedUrl {
  canonicalUrl: string;
  host: string;
  origin: string;
}

export function normalizeUrl(input: string): NormalizedUrl | null {
  if (!input || typeof input !== 'string') return null;
  let candidate = input.trim();
  if (!candidate) return null;
  if (!/^https?:\/\//i.test(candidate)) candidate = `https://${candidate}`;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }
  const host = parsed.hostname.replace(/^www\./i, '').toLowerCase();
  if (!host || !host.includes('.')) return null;
  return {
    canonicalUrl: `https://${host}`,
    host,
    origin: `${parsed.protocol}//${host}`,
  };
}

/**
 * Cheap variant for matching against arbitrary user input (search bar, paste).
 * Returns just the bare host or null.
 */
export function extractHost(input: string): string | null {
  return normalizeUrl(input)?.host ?? null;
}

/** Stable hash of a list of strings — used as cache keys. Order-independent. */
export function hashStringList(list: string[]): string {
  const sorted = [...list].map((s) => s.toLowerCase().trim()).filter(Boolean).sort();
  let h = 5381;
  for (const s of sorted) {
    for (let i = 0; i < s.length; i++) {
      h = ((h << 5) + h) ^ s.charCodeAt(i);
    }
  }
  return (h >>> 0).toString(16);
}
