/**
 * Public types for the anonymous AI Visibility audit flow.
 *
 * The flow is a three-step state machine: `domain` → `preview` → `signup`
 * → `done`. Each step is a distinct screen rendered by AnonAuditFlow.
 *
 * `DomainSnapshot` is everything the flow knows about the entered domain
 * after Step 1's /validate call. It survives across steps so the preview
 * and the signup wall can reference the host the user just entered, and
 * so we know what report to redirect them to after signup.
 */

export type AnonAuditStep = 'domain' | 'preview' | 'signup' | 'done';

export interface DomainSnapshot {
  /** Canonical https://host form. */
  canonicalUrl: string;
  /** Normalized lowercased host, no www, no path. Matches Domain.host. */
  host: string;
  /** Whether the site answered at all (any HTTP status counts). */
  reachable: boolean;
  /** Final URL after redirects. */
  finalUrl?: string;
}

export interface ValidateApiResponse {
  ok: boolean;
  canonicalUrl?: string;
  normalizedUrl?: string;
  host?: string;
  reachable?: boolean;
  finalUrl?: string;
  /** "user" when JWT was present, "anon" when the cookie path was used. */
  mode?: 'user' | 'anon';
  reason?: string;
  dbExistsForUser?: boolean;
  existingDomainId?: number;
}
