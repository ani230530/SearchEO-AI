/**
 * Centralized API Client with automatic token refresh and request interceptors
 */

import { isTokenExpired } from './tokenService';

const API_BASE_URL = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : 'http://localhost:3002/api';

// Request queue for handling concurrent requests during token refresh
let isRefreshing = false;
let refreshPromise: Promise<string | null> | null = null;
const requestQueue: Array<{
  resolve: (token: string | null) => void;
  reject: (error: Error) => void;
}> = [];

/**
 * Get auth token from localStorage
 */
function getAuthToken(): string | null {
  return localStorage.getItem('authToken');
}

/**
 * Get refresh token from localStorage
 */
function getRefreshToken(): string | null {
  return localStorage.getItem('refreshToken');
}

/**
 * Store tokens in localStorage
 */
function setTokens(accessToken: string, refreshToken?: string): void {
  localStorage.setItem('authToken', accessToken);
  if (refreshToken) {
    localStorage.setItem('refreshToken', refreshToken);
  }
}

/**
 * Clear tokens from localStorage
 */
function clearTokens(): void {
  localStorage.removeItem('authToken');
  localStorage.removeItem('refreshToken');
}

/**
 * Refresh access token using refresh token
 */
async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    return null;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Failed to refresh token');
    }

    const data = await response.json();
    setTokens(data.token, data.refreshToken);
    return data.token;
  } catch (error) {
    console.error('Token refresh failed:', error);
    clearTokens();
    // Redirect to login
    if (window.location.pathname !== '/auth' && window.location.pathname !== '/') {
      window.location.href = '/auth';
    }
    return null;
  }
}

/**
 * Process queued requests after token refresh
 */
function processQueue(error: Error | null, token: string | null = null): void {
  requestQueue.forEach((promise) => {
    if (error) {
      promise.reject(error);
    } else {
      promise.resolve(token);
    }
  });
  requestQueue.length = 0;
}

/**
 * Ensure valid access token (refresh if needed)
 */
async function ensureValidToken(): Promise<string | null> {
  const token = getAuthToken();
  
  if (!token) {
    return null;
  }

  // Check if token is expired or will expire soon
  if (isTokenExpired(token)) {
    // If already refreshing, wait for that to complete
    if (isRefreshing && refreshPromise) {
      return refreshPromise;
    }

    // Start refresh process
    isRefreshing = true;
    refreshPromise = refreshAccessToken();

    try {
      const newToken = await refreshPromise;
      isRefreshing = false;
      refreshPromise = null;
      processQueue(null, newToken);
      return newToken;
    } catch (error) {
      isRefreshing = false;
      refreshPromise = null;
      const err = error instanceof Error ? error : new Error('Token refresh failed');
      processQueue(err);
      throw err;
    }
  }

  return token;
}

/**
 * Make an API request, with automatic token refresh when a token IS
 * present. When no token is present (anonymous flow) the call still goes
 * through — the backend's authenticateOrSession middleware handles the
 * identity via the wizard cookie, which we round-trip with
 * `credentials: 'include'` so HttpOnly cookies are sent.
 *
 * Anonymous mode contract:
 *   - No Authorization header
 *   - 401/403 from the server is NOT auto-redirected to /auth (anonymous
 *     callers don't have a JWT to invalidate)
 *   - 402 with code SIGNUP_REQUIRED is surfaced verbatim so callers can
 *     pop the signup wall modal
 *
 * Authenticated mode contract (unchanged):
 *   - Authorization: Bearer <token>
 *   - 401 → try refresh once → retry
 *   - 401/403 after retry → clear tokens, redirect to /auth
 */
export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  // Try to get a valid token; absent token means anonymous mode.
  const token = await ensureValidToken();
  const isAuthenticated = Boolean(token);

  const baseHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) baseHeaders['Authorization'] = `Bearer ${token}`;

  let response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: baseHeaders,
    // Cookies (the anon wizard cookie in particular) MUST round-trip for
    // the cookie-based identity path to work. Safe for the authenticated
    // path too — sending cookies alongside a Bearer is harmless.
    credentials: 'include',
  });

  // 401 with a refreshable token — try once.
  if (response.status === 401 && isAuthenticated) {
    const refreshToken = getRefreshToken();
    if (refreshToken && !isRefreshing) {
      const newToken = await refreshAccessToken();
      if (newToken) {
        response = await fetch(`${API_BASE_URL}${endpoint}`, {
          ...options,
          headers: { ...baseHeaders, Authorization: `Bearer ${newToken}` },
          credentials: 'include',
        });
      }
    }
  }

  // Auth failure handling: only redirect-to-/auth when we WERE
  // authenticated. Anonymous callers seeing a 401/403 just get the error
  // bubbled — they're expected to handle it (or it's the signup wall).
  if ((response.status === 401 || response.status === 403) && isAuthenticated) {
    clearTokens();
    if (window.location.pathname !== '/auth' && window.location.pathname !== '/') {
      window.location.href = '/auth';
    }
    const errorText = await response.clone().text().catch(() => '');
    const error = errorText
      ? (() => {
          try {
            return JSON.parse(errorText);
          } catch {
            return { error: errorText };
          }
        })()
      : {};
    throw new Error(error.error || 'Authentication failed');
  }

  if (!response.ok) {
    const errorText = await response.clone().text().catch(() => '');
    const error = errorText
      ? (() => {
          try {
            return JSON.parse(errorText);
          } catch {
            return { error: errorText };
          }
        })()
      : {};
    // Preserve the server's code in the thrown Error so callers can
    // discriminate (e.g. SIGNUP_REQUIRED → open the wall instead of
    // surfacing a generic toast).
    const err: Error & { status?: number; code?: string } = new Error(
      error.details || error.error || `HTTP ${response.status}: ${response.statusText}`
    );
    err.status = response.status;
    err.code = error.code;
    throw err;
  }

  return response.json();
}

/**
 * GET request
 */
export async function apiGet<T>(endpoint: string): Promise<T> {
  return apiRequest<T>(endpoint, { method: 'GET' });
}

/**
 * POST request
 */
export async function apiPost<T>(endpoint: string, body?: unknown): Promise<T> {
  return apiRequest<T>(endpoint, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * PUT request
 */
export async function apiPut<T>(endpoint: string, body?: unknown): Promise<T> {
  return apiRequest<T>(endpoint, {
    method: 'PUT',
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * PATCH request
 */
export async function apiPatch<T>(endpoint: string, body?: unknown): Promise<T> {
  return apiRequest<T>(endpoint, {
    method: 'PATCH',
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * DELETE request
 */
export async function apiDelete<T>(endpoint: string): Promise<T> {
  return apiRequest<T>(endpoint, { method: 'DELETE' });
}

/**
 * Export token management functions for AuthContext
 */
export const tokenManager = {
  getAuthToken,
  getRefreshToken,
  setTokens,
  clearTokens,
  refreshAccessToken,
};

// Re-export isTokenExpired from tokenService
export { isTokenExpired } from './tokenService';

