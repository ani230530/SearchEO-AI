import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { isTokenExpired, getTimeUntilExpiration } from '@/services/tokenService';
import { tokenManager, apiRequest } from '@/services/apiClient';

export interface User {
  id: number;
  email: string;
  name?: string;
}

export interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
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
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken: refreshTokenValue }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Token refresh failed');
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

      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token: tokenToVerify }),
      });

      const data = await response.json();

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
              const retryResponse = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/verify`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ token: newToken }),
              });
              const retryData = await retryResponse.json();
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
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
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

  const register = async (email: string, password: string, name?: string) => {
    setError(null);
    setLoading(true);
    
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password, name }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Registration failed');
      }

      setUser(data.user);
      setToken(data.token);
      tokenManager.setTokens(data.token, data.refreshToken);
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
          await fetch(`${import.meta.env.VITE_API_URL}/api/auth/logout`, {
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