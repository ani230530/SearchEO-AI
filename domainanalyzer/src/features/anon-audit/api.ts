/**
 * API client for the anonymous AI Visibility audit flow.
 *
 * All requests use `credentials: 'include'` so the HttpOnly wizard cookie
 * set by the first /validate call is round-tripped to the backend. Without
 * it the second-step calls would mint a fresh session each time, and the
 * signup linkage would orphan the original wizard work.
 *
 * The functions here intentionally don't go through @/services/apiClient
 * — that helper attaches a Bearer token and assumes an authenticated user.
 * The anon flow has no Bearer; identity is the cookie.
 */

import type { ValidateApiResponse } from './types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3002';

export class AnonAuditApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'AnonAuditApiError';
  }
}

/**
 * Validate a domain entered in Step 1. Issues / refreshes the anonymous
 * wizard cookie as a side effect (the backend's authenticateOrSession
 * middleware mints one when no Bearer + no valid cookie are present).
 *
 * Returns `ok: false` for malformed URLs (a 200 user-validation error,
 * NOT an HTTP error). Throws for transport-level failures.
 */
export async function validateDomain(url: string): Promise<ValidateApiResponse> {
  const response = await fetch(`${API_BASE_URL}/api/wizard/validate`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  // The /validate route returns 200 with `ok:false` for user-facing
  // validation errors. Only treat actual HTTP errors as throwable.
  if (!response.ok) {
    let detail = '';
    try {
      const data = await response.json();
      detail = data?.error || data?.reason || '';
    } catch {
      // body wasn't JSON — fall through
    }
    throw new AnonAuditApiError(
      response.status,
      detail || `Validation request failed (${response.status})`
    );
  }
  return (await response.json()) as ValidateApiResponse;
}
