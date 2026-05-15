import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { isTokenExpired, getTimeUntilExpiration } from '@/services/tokenService';
import { tokenManager, apiRequest } from '@/services/apiClient';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3002';

type AuthResponseBody = Record<string, any>;

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

export interface User {
  id: number;
  email: string;
  name?: string;
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
  logout: () => void;
  updateProfile: (name: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
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

  // Check for existing token on app load
  useEffect(() => {
  const storedToken = tokenManager.getAuthToken();
    if (storedToken) {
      verifyToken(storedToken);
    } else {
      setLoading(false);
    }
  }, []);

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
  }, [token]);

  const refreshToken = async (): Promise<void> => {
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

      tokenManager.setTokens(data.token, data.refreshToken);
      setToken(data.token);
    } catch (error) {
      console.error('Token refresh failed:', error);
      tokenManager.clearTokens();
      setToken(null);
      setUser(null);
      throw error;
    }
  };

  const verifyToken = async (tokenToVerify: string) => {
    try {
      // If token is expired, try to refresh first
      if (isTokenExpired(tokenToVerify)) {
        const refreshTokenValue = tokenManager.getRefreshToken();
        if (refreshTokenValue) {
          try {
            await refreshToken();
            const newToken = tokenManager.getAuthToken();
            if (newToken) {
              tokenToVerify = newToken;
            }
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
            const newToken = tokenManager.getAuthToken();
            if (newToken) {
              // Retry verification with new token
              const retryResponse = await fetch(`${API_BASE_URL}/api/auth/verify`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ token: newToken }),
              });
              const retryData = await readAuthResponse(retryResponse);
              if (retryData.valid && retryData.user) {
                setUser(retryData.user);
                setToken(newToken);
                tokenManager.setTokens(newToken);
                setLoading(false);
                return;
              }
            }
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
        },
        body: JSON.stringify({ email, password, name }),
      });

      const data = await readAuthResponse(response);

      if (!response.ok) {
        throw new Error(getAuthErrorMessage(data, 'Registration failed'));
      }

      if (data.token && data.user) {
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

  const logout = async () => {
    try {
      // Call backend logout to invalidate refresh token
      const currentToken = tokenManager.getAuthToken();
      if (currentToken) {
        try {
          await fetch(`${API_BASE_URL}/api/auth/logout`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${currentToken}`,
            },
          });
        } catch (error) {
          // Ignore logout errors, still clear local state
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
    logout,
    updateProfile,
    changePassword,
    loading,
    error,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}; 
