import React, { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react';
import { isTokenExpired, getTimeUntilExpiration } from '@/services/tokenService';
import { getWizardSessionToken, tokenManager, apiRequest } from '@/services/apiClient';
import { queryClient } from '@/lib/queryClient';
import {
  ACTIVE_TAB_STORAGE_KEY,
  AI_VISIBILITY_LAST_DOMAIN_SLUG,
  DOMAIN_ID_MAPPING_KEY,
  DRAFT_OVERLAY_HANDOFF_KEY,
  PENDING_AUTO_AUDIT_RUN_KEY,
  WORKSHEET_IMPORT_KEY,
  WORKSHEET_TARGET_KEY,
} from '@/lib/sessionStorageKeys';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3002';

type AuthResponseBody = {
  error?: string;
  message?: string;
  valid?: boolean;
  user?: User;
  token?: string;
  refreshToken?: string;
  [key: string]: unknown;
};

const readAuthResponse = async (response: Response): Promise<AuthResponseBody> => {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return {
      message: text,
    };
  }
};

const getAuthErrorMessage = (data: AuthResponseBody, fallback: string) => {
  return data.error || data.message || fallback;
};

const getLoginErrorMessage = (response: Response, data: AuthResponseBody) => {
  if (response.status >= 500) {
    return 'Login service is unavailable. Please try again after the backend is healthy.';
  }

  return getAuthErrorMessage(data, 'Login failed. Please try again.');
};

const wizardSessionHeaders = (): Record<string, string> => {
  const wizardSessionToken = getWizardSessionToken();
  return wizardSessionToken ? { 'X-Wizard-Session': wizardSessionToken } : {};
};

export interface User {
  id: number;
  email: string;
  name?: string;
  emailVerified?: boolean;
  googleId?: string | null;
  role?: string;
}

/**
 * Result surfaced by `register()`. `wizardLink` is set when the backend
 * detected an in-flight anonymous wizard cookie on the signup request and
 * materialized its snapshot into a Domain for the new user. Callers in the
 * pre-signup funnel use `primaryDomainId` to redirect into the just-bound
 * report.
 */
export interface RegisterResult {
  wizardLink?: {
    linked: boolean;
    domainsCreated: number;
    primaryDomainId: number | null;
  } | null;
}

export interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<RegisterResult>;
  startGoogleAuth: (mode: 'login' | 'signup') => Promise<void>;
  exchangeGoogleCode: (code: string) => Promise<RegisterResult>;
  logout: () => Promise<void>;
  updateProfile: (name: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  resetPassword: (token: string, newPassword: string) => Promise<void>;
  resendVerificationEmail: (email: string) => Promise<void>;
  loading: boolean;
  error: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const currentUserIdRef = useRef<number | null>(null);
  const currentUserId = user?.id ?? null;

  useEffect(() => {
    currentUserIdRef.current = currentUserId;
  }, [currentUserId]);

  const clearUserScopedStorage = useCallback(() => {
    const keysToClear = [
      AI_VISIBILITY_LAST_DOMAIN_SLUG,
      ACTIVE_TAB_STORAGE_KEY,
      PENDING_AUTO_AUDIT_RUN_KEY,
      DOMAIN_ID_MAPPING_KEY,
      WORKSHEET_IMPORT_KEY,
      WORKSHEET_TARGET_KEY,
      DRAFT_OVERLAY_HANDOFF_KEY,
    ];

    for (const key of keysToClear) {
      try {
        sessionStorage.removeItem(key);
        localStorage.removeItem(key);
      } catch {
        // Ignore storage failures in privacy-restricted environments.
      }
    }
  }, []);

  const resetTransientAppState = useCallback(async () => {
    try {
      await queryClient.cancelQueries();
    } catch {
      // Ignore cancellation errors during logout/login transitions.
    }

    queryClient.clear();
    clearUserScopedStorage();
  }, [clearUserScopedStorage]);

  const applyAuthResponse = useCallback((data: AuthResponseBody) => {
    if (!data.user || !data.token) {
      throw new Error('Authentication failed. Please sign in again.');
    }

    setUser(data.user);
    setToken(data.token);
    tokenManager.setTokens(data.token, data.refreshToken);
  }, []);

  const refreshToken = useCallback(async (): Promise<AuthResponseBody> => {
    const refreshTokenValue = tokenManager.getRefreshToken();
    if (!refreshTokenValue) {
      throw new Error('No refresh token available');
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken: refreshTokenValue }),
      });

      const data = await readAuthResponse(response);

      if (!response.ok) {
        throw new Error(getAuthErrorMessage(data, 'Token refresh failed'));
      }

      applyAuthResponse(data);
      return data;
    } catch (error) {
      console.error('Token refresh failed:', error);
      tokenManager.clearTokens();
      setToken(null);
      setUser(null);
      throw error;
    }
  }, [applyAuthResponse]);

  // Check for existing token on app load.
  useEffect(() => {
    let cancelled = false;

    const bootstrapAuth = async () => {
      const storedToken = tokenManager.getAuthToken();
      const refreshTokenValue = tokenManager.getRefreshToken();

      if (!storedToken && !refreshTokenValue) {
        if (!cancelled) setLoading(false);
        return;
      }

      try {
        if (storedToken && !isTokenExpired(storedToken)) {
          const response = await fetch(`${API_BASE_URL}/api/auth/verify`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ token: storedToken }),
          });

          const data = await readAuthResponse(response);

          if (data.valid && data.user) {
            if (!cancelled) {
              setUser(data.user);
              setToken(storedToken);
              tokenManager.setTokens(storedToken, refreshTokenValue ?? undefined);
              setLoading(false);
            }
            return;
          }
        }

        if (refreshTokenValue) {
          await refreshToken();
          return;
        }

        tokenManager.clearTokens();
        if (!cancelled) {
          setUser(null);
          setToken(null);
        }
      } catch (error) {
        console.error('Initial auth bootstrap failed:', error);
        tokenManager.clearTokens();
        if (!cancelled) {
          setUser(null);
          setToken(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void bootstrapAuth();

    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  // Set up automatic token refresh
  useEffect(() => {
    if (token && !isTokenExpired(token)) {
      const timeUntilExpiration = getTimeUntilExpiration(token);
      if (timeUntilExpiration && timeUntilExpiration > 0) {
        // Refresh 5 minutes before expiration
        const refreshTime = Math.max(timeUntilExpiration - 5 * 60 * 1000, 60000); // At least 1 minute

        refreshIntervalRef.current = setTimeout(async () => {
          try {
            await refreshToken();
          } catch (error) {
            console.error('Automatic token refresh failed:', error);
          }
        }, refreshTime);
      }
    }

    return () => {
      if (refreshIntervalRef.current) {
        clearTimeout(refreshIntervalRef.current);
      }
    };
  }, [token, refreshToken]);

  const verifyToken = async (tokenToVerify: string) => {
    try {
      // If token is expired, try to refresh first
      if (isTokenExpired(tokenToVerify)) {
        const refreshTokenValue = tokenManager.getRefreshToken();
        if (refreshTokenValue) {
          try {
            const refreshed = await refreshToken();
            tokenToVerify = refreshed.token;
          } catch (error) {
            // Refresh failed, clear tokens
            tokenManager.clearTokens();
            setToken(null);
            setUser(null);
            setLoading(false);
            return;
          }
        } else {
          // No refresh token, clear and exit
          tokenManager.clearTokens();
          setToken(null);
          setUser(null);
          setLoading(false);
          return;
        }
      }

      const response = await fetch(`${API_BASE_URL}/api/auth/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token: tokenToVerify }),
      });

      const data = await readAuthResponse(response);

      if (data.valid && data.user) {
        setUser(data.user);
        setToken(tokenToVerify);
        tokenManager.setTokens(tokenToVerify);
      } else {
        // Token is invalid, try refresh token
        const refreshTokenValue = tokenManager.getRefreshToken();
        if (refreshTokenValue) {
          try {
            await refreshToken();
            setLoading(false);
            return;
          } catch (error) {
            // Refresh failed
          }
        }
        // Clear tokens if verification failed
        tokenManager.clearTokens();
        setToken(null);
        setUser(null);
      }
    } catch (error) {
      console.error('Token verification failed:', error);
      tokenManager.clearTokens();
      setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    setError(null);
    setLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await readAuthResponse(response);

      if (!response.ok) {
        throw new Error(getLoginErrorMessage(response, data));
      }

      if (!data.user || !data.token) {
        throw new Error('Login failed. Please try again.');
      }

      if (currentUserIdRef.current != null && currentUserIdRef.current !== data.user.id) {
        await resetTransientAppState();
      }

      setUser(data.user);
      setToken(data.token);
      tokenManager.setTokens(data.token, data.refreshToken);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Login failed';
      setError(errorMessage);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const register = async (
    email: string,
    password: string,
    name?: string
  ): Promise<RegisterResult> => {
    setError(null);
    setLoading(true);

    try {
      // `credentials: 'include'` is load-bearing — the anon wizard cookie
      // lives in an HttpOnly cookie set by /api/wizard/validate, and the
      // backend's register handler reads it to materialize the in-flight
      // session into a Domain for this new user. Without the include,
      // signup-from-the-funnel works but the wizard work is orphaned.
      const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...wizardSessionHeaders(),
        },
        body: JSON.stringify({ email, password, name }),
      });

      const data = await readAuthResponse(response);

      if (!response.ok) {
        throw new Error(getAuthErrorMessage(data, 'Registration failed'));
      }

      if (data.token && data.user) {
        if (currentUserIdRef.current != null && currentUserIdRef.current !== data.user.id) {
          await resetTransientAppState();
        }
        setUser(data.user);
        setToken(data.token);
        tokenManager.setTokens(data.token, data.refreshToken);
      } else {
        setUser(null);
        setToken(null);
      }

      return { wizardLink: data.wizardLink ?? null };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Registration failed';
      setError(errorMessage);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const startGoogleAuth = async (mode: 'login' | 'signup') => {
    setError(null);
    setLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/google/${mode}`, {
        method: 'GET',
        credentials: 'include',
      });
      const data = await readAuthResponse(response);

      if (!response.ok || !data.authUrl) {
        throw new Error(getAuthErrorMessage(data, 'Google sign-in failed'));
      }

      window.location.href = data.authUrl;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Google sign-in failed';
      setError(errorMessage);
      setLoading(false);
      throw error;
    }
  };

  const exchangeGoogleCode = async (code: string): Promise<RegisterResult> => {
    setError(null);
    setLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/google/exchange`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...wizardSessionHeaders(),
        },
        body: JSON.stringify({ code }),
      });
      const data = await readAuthResponse(response);

      if (!response.ok) {
        throw new Error(getAuthErrorMessage(data, 'Google sign-in failed'));
      }
      if (!data.user || !data.token) {
        throw new Error('Google sign-in failed');
      }

      if (currentUserIdRef.current != null && currentUserIdRef.current !== data.user.id) {
        await resetTransientAppState();
      }

      setUser(data.user);
      setToken(data.token);
      tokenManager.setTokens(data.token, data.refreshToken);
      return { wizardLink: data.wizardLink ?? null };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Google sign-in failed';
      setError(errorMessage);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      const currentToken = tokenManager.getAuthToken();
      const currentRefreshToken = tokenManager.getRefreshToken();
      await resetTransientAppState();
      if (currentToken) {
        try {
          await fetch(`${API_BASE_URL}/api/auth/logout`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${currentToken}`,
            },
            // Sending the refresh token scopes revocation to this device's
            // token family. Without it the backend revokes all families
            // (a "log out everywhere" — usually not what a single logout means).
            body: JSON.stringify({ refreshToken: currentRefreshToken }),
          });
        } catch (error) {
          console.error('Logout API call failed:', error);
        }
      }
    } catch (error) {
      // Ignore errors
    } finally {
      setUser(null);
      setToken(null);
      tokenManager.clearTokens();
      if (refreshIntervalRef.current) {
        clearTimeout(refreshIntervalRef.current);
      }
    }
  };

  const requestPasswordReset = async (email: string) => {
    setError(null);
    const response = await fetch(`${API_BASE_URL}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = await readAuthResponse(response);
    if (!response.ok) {
      throw new Error(getAuthErrorMessage(data, 'Could not send reset email'));
    }
  };

  const resetPassword = async (token: string, newPassword: string) => {
    setError(null);
    const response = await fetch(`${API_BASE_URL}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, newPassword }),
    });
    const data = await readAuthResponse(response);
    if (!response.ok) {
      throw new Error(getAuthErrorMessage(data, 'Could not reset password'));
    }
  };

  const resendVerificationEmail = async (email: string) => {
    const response = await fetch(`${API_BASE_URL}/api/auth/resend-verification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = await readAuthResponse(response);
    if (!response.ok) {
      throw new Error(getAuthErrorMessage(data, 'Could not resend verification email'));
    }
  };

  const updateProfile = async (name: string) => {
    if (!token) throw new Error('Not authenticated');

    try {
      await apiRequest('/auth/profile', {
        method: 'PUT',
        body: JSON.stringify({ name }),
      });
      setUser(prev => prev ? { ...prev, name } : null);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Profile update failed';
      setError(errorMessage);
      throw error;
    }
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    if (!token) throw new Error('Not authenticated');

    try {
      await apiRequest('/auth/password', {
        method: 'PUT',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Password change failed';
      setError(errorMessage);
      throw error;
    }
  };

  const value: AuthContextType = {
    user,
    token,
    login,
    register,
    startGoogleAuth,
    exchangeGoogleCode,
    logout,
    updateProfile,
    changePassword,
    requestPasswordReset,
    resetPassword,
    resendVerificationEmail,
    loading,
    error,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
