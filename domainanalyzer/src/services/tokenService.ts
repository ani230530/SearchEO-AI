/**
 * Token Service - Handles JWT token decoding, expiration checking, and refresh logic
 */

export interface DecodedToken {
  userId: number;
  email: string;
  iat?: number;
  exp?: number;
}

/**
 * Decode JWT token without verification (client-side only)
 */
export function decodeToken(token: string): DecodedToken | null {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (error) {
    console.error('Failed to decode token:', error);
    return null;
  }
}

/**
 * Check if token is expired or will expire soon
 * @param token - JWT token string
 * @param bufferSeconds - Buffer time in seconds before expiration (default: 5 minutes)
 */
export function isTokenExpired(token: string, bufferSeconds: number = 300): boolean {
  const decoded = decodeToken(token);
  if (!decoded || !decoded.exp) {
    return true; // If we can't decode or no expiration, consider it expired
  }

  const expirationTime = decoded.exp * 1000; // Convert to milliseconds
  const currentTime = Date.now();
  const bufferTime = bufferSeconds * 1000;

  return currentTime >= (expirationTime - bufferTime);
}

/**
 * Get token expiration time in milliseconds
 */
export function getTokenExpirationTime(token: string): number | null {
  const decoded = decodeToken(token);
  if (!decoded || !decoded.exp) {
    return null;
  }
  return decoded.exp * 1000;
}

/**
 * Get time until token expires in milliseconds
 */
export function getTimeUntilExpiration(token: string): number | null {
  const expirationTime = getTokenExpirationTime(token);
  if (!expirationTime) {
    return null;
  }
  const timeUntilExpiration = expirationTime - Date.now();
  return timeUntilExpiration > 0 ? timeUntilExpiration : 0;
}

