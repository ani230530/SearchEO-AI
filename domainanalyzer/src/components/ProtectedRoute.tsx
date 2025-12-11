import React, { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { isTokenExpired } from '@/services/tokenService';
import { tokenManager } from '@/services/apiClient';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

/**
 * ProtectedRoute - Wrapper component that ensures user is authenticated
 * before rendering protected content. Verifies token validity and redirects
 * to login if authentication fails.
 */
export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { user, loading, token } = useAuth();
  const location = useLocation();

  useEffect(() => {
    // Check token validity if we have a token
    if (token) {
      const storedToken = tokenManager.getAuthToken();
      if (storedToken && isTokenExpired(storedToken)) {
        // Token is expired, try to refresh
        const refreshToken = tokenManager.getRefreshToken();
        if (!refreshToken) {
          // No refresh token, clear and redirect
          tokenManager.clearTokens();
        }
      }
    }
  }, [token]);

  // Show loading while checking authentication
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-slate-100">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent mx-auto"></div>
          <p className="text-slate-600">Checking authentication...</p>
        </div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!user || !token) {
    // Save the attempted location for redirect after login
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  // Check if token is expired
  if (isTokenExpired(token)) {
    // Token expired, but let apiClient handle refresh
    // For now, still render children - apiClient will handle refresh
    return <>{children}</>;
  }

  // User is authenticated, render children
  return <>{children}</>;
};

