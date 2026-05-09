/**
 * Single classifier the whole wizard uses to translate caught errors into
 * (a) something the user should *read* and (b) something we know how to *do*
 * about it (retry, edit, go back, sign in again).
 *
 * Every step routes its catch blocks through `classifyError(err)` so the UI
 * stays consistent and we never leak raw stack traces or server JSON to the
 * user.
 */

export type WizardErrorKind =
  | 'offline'         // navigator.onLine === false / DNS / connection refused
  | 'timeout'         // SSE stream went silent past our watchdog window
  | 'aborted'         // user navigated away — silent, NOT shown
  | 'unauthorized'    // 401 from the API
  | 'rate_limited'    // 429 from the API or the upstream LLM
  | 'server'          // 5xx from our backend
  | 'user'            // 4xx with a server-supplied reason
  | 'unknown';        // catch-all — show generic + retry

export interface WizardError {
  kind: WizardErrorKind;
  /** Plain-English line shown to the user. Never includes JSON or stack frames. */
  message: string;
  /** Suggested action label for the retry button. null = no retry available. */
  retryLabel: string | null;
}

const OFFLINE_PHRASES = [
  'failed to fetch',
  'network',
  'load failed',
  'connection',
  'enotfound',
  'econnrefused',
  'err_internet_disconnected',
];

export function classifyError(err: unknown): WizardError {
  // AbortController abort — user navigated away. We never surface this.
  if (err instanceof DOMException && err.name === 'AbortError') {
    return { kind: 'aborted', message: '', retryLabel: null };
  }

  const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  const lower = raw.toLowerCase();

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return {
      kind: 'offline',
      message: "Looks like you're offline. Reconnect and try again.",
      retryLabel: 'Try again',
    };
  }

  if (OFFLINE_PHRASES.some((p) => lower.includes(p))) {
    return {
      kind: 'offline',
      message: "Couldn't reach our servers. Check your connection and try again.",
      retryLabel: 'Try again',
    };
  }

  if (lower.includes('timeout') || lower.includes('timed out')) {
    return {
      kind: 'timeout',
      message: "This is taking longer than usual. Want to give it another go?",
      retryLabel: 'Retry',
    };
  }

  // apiClient throws "HTTP 401: Unauthorized" / "HTTP 429: …" / "HTTP 500: …"
  const statusMatch = raw.match(/HTTP (\d{3})/);
  if (statusMatch) {
    const status = Number(statusMatch[1]);
    if (status === 401 || status === 403) {
      return { kind: 'unauthorized', message: 'Your session expired. Please sign in again.', retryLabel: null };
    }
    if (status === 429) {
      return {
        kind: 'rate_limited',
        message: "We hit a usage limit on the AI providers. Give it a minute and try again.",
        retryLabel: 'Retry',
      };
    }
    if (status >= 500) {
      return {
        kind: 'server',
        message: "Something went wrong on our end. We logged it — try again in a moment.",
        retryLabel: 'Retry',
      };
    }
    if (status >= 400) {
      return {
        kind: 'user',
        // Server messages from our backend are already user-friendly (apiClient
        // surfaces error.error from the JSON body when present).
        message: raw.replace(/^HTTP \d{3}:?\s*/, '') || 'That didn\'t work. Adjust your input and retry.',
        retryLabel: 'Retry',
      };
    }
  }

  // Server-supplied error.error string came through directly (no HTTP prefix).
  if (raw && raw.length < 300 && !lower.includes('failed') && !lower.includes('error')) {
    return { kind: 'user', message: raw, retryLabel: 'Retry' };
  }

  return {
    kind: 'unknown',
    message: "Something went sideways. Hit retry — that usually does it.",
    retryLabel: 'Retry',
  };
}

/** True when the error is one we should NOT show (user-initiated abort). */
export function isSilentError(e: WizardError): boolean {
  return e.kind === 'aborted';
}
