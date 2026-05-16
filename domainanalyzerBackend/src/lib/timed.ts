/**
 * Tiny request-latency logger for slow endpoint observability.
 *
 * Drop-in Express middleware. Mount in front of a heavy route and we log
 * a single line when wall time exceeds the threshold. No-op for fast
 * requests so the log stays clean.
 *
 * Example:
 *   router.get('/heavy', timed('GET /heavy', 500), async (req, res) => { ... });
 *   router.post('/domain/:id/competitors', timed('POST /competitors', 1000), authenticateOrSession(), handler);
 *
 * Production goal: surface p95 outliers. The default threshold (500 ms)
 * is below human-perceptible jank so anything noisier than that is
 * already worth investigating.
 */

import type { NextFunction, Request, Response } from 'express';

export function timed(label: string, thresholdMs: number = 500) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const started = Date.now();
    res.on('finish', () => {
      const elapsed = Date.now() - started;
      if (elapsed > thresholdMs || res.statusCode >= 500) {
        const tag = res.statusCode >= 500 ? '✗' : '⚠';
        console.log(`[PERF] ${tag} ${label} → ${res.statusCode} ${elapsed}ms`);
      }
    });
    next();
  };
}
