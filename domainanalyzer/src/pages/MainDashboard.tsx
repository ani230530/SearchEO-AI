import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Search, Plus, TrendingUp, Calendar, Globe, BarChart3, Sparkles, Target, Zap, ArrowUpRight, Filter, SortDesc, Clock, Play, User, LogOut, Settings, Bell, Trash } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/contexts/AuthContext';
import { maskDomainId } from '@/lib/domainUtils';


interface DashboardDomain {
  id: number;
  url: string;
  context?: string;
  lastAnalyzed: string;
  currentStep?: number;
  metrics?: {
    visibilityScore: number;
  keywordCount: number;
  phraseCount: number;
    totalQueries?: number;
    topPhrases?: { phrase: string; score: number }[];
    modelPerformance?: { model: string; score: number }[];
    detectionMethod?: string;
    confidence?: number;
  };
  industry?: string;
}

interface ActiveOnboardingSession {
  domain: {
    id: number;
    url: string;
    context?: string;
    industry?: string;
  };
  currentStep: number;
  lastActivity: string;
}

const ProfessionalDashboard = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [domains, setDomains] = useState<DashboardDomain[]>([]);
  const [activeSessions, setActiveSessions] = useState<ActiveOnboardingSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user, logout, loading: authLoading, token } = useAuth();
  const navigate = useNavigate();

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{ id: number; url?: string } | null>(null);

  // Filters & Sorting
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'in-progress' | 'not-started'>('all');
  const [sortBy, setSortBy] = useState<'recent' | 'visibility' | 'keywords' | 'phrases' | 'url'>('recent');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');

  // Function to handle domain card clicks
  const handleDomainClick = (domain: DashboardDomain) => {
    const currentStep = domain.currentStep ?? 0;
    
    // If analysis is completed (currentStep === 4), go to dashboard
    if (currentStep === 4) {
      const maskedId = maskDomainId(domain.id);
      navigate(`/dashboard/${maskedId}`);
    } else {
      // Otherwise, go to the analysis flow at the current step
      navigate(`/analyze?domainId=${domain.id}`);
    }
  };

  const openDeleteConfirm = (domainId: number, domainUrl?: string) => {
    setPendingDelete({ id: domainId, url: domainUrl });
    setConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      const resp = await fetch(`${import.meta.env.VITE_API_URL}/api/domain/${pendingDelete.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!resp.ok) {
        const msg = await resp.text().catch(() => 'Failed to delete domain');
        throw new Error(msg || 'Failed to delete domain');
      }

      setDomains(prev => prev.filter(d => Number(d.id) !== Number(pendingDelete.id)));
      setActiveSessions(prev => prev.filter(s => Number(s.domain.id) !== Number(pendingDelete.id)));

      try {
        const domainsResponse = await fetch(`${import.meta.env.VITE_API_URL}/api/dashboard/all`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
        if (domainsResponse.ok) {
          const domainsData = await domainsResponse.json();
          setDomains(domainsData.domains || []);
        }
      } catch (_) {
        // ignore refetch errors
      }
      setConfirmOpen(false);
      setPendingDelete(null);
    } catch (err) {
      console.error(err);
    } finally {
      setDeleting(false);
    }
  };

  // Redirect to landing page if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/');
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        // Fetch completed domains
        const domainsResponse = await fetch(`${import.meta.env.VITE_API_URL}/api/dashboard/all`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
        
        if (domainsResponse.status === 403) {
          // Access denied - user may be trying to access unauthorized resources
          console.warn('Access denied - redirecting to login');
          navigate('/auth');
          return;
        }
        
        if (!domainsResponse.ok) {
          throw new Error('Failed to fetch dashboard analyses');
        }
        
        const domainsData = await domainsResponse.json();
        setDomains(domainsData.domains || []);

        // Onboarding sessions removed
        setActiveSessions([]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    };
    
    if (token) {
      fetchData();
    }
  }, [token, navigate]);

  // Show loading while checking authentication
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-slate-100">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent mx-auto"></div>
          <p className="text-slate-600">Checking authentication...</p>
        </div>
      </div>
    );
  }

  // Don't render anything if not authenticated (will redirect)
  if (!user) {
    return null;
  }

  const activeSessionIds = new Set(activeSessions.map(s => s.domain.id));
  const normalizedQuery = searchTerm.trim().toLowerCase();
  const filteredDomains = domains
    .filter(domain => {
      if (activeSessionIds.has(domain.id)) return false; // Exclude active sessions

      // Status filter
      const currentStep = domain.currentStep ?? 0;
      const status = currentStep === 4 ? 'completed' : currentStep > 0 ? 'in-progress' : 'not-started';
      if (statusFilter !== 'all' && status !== statusFilter) return false;

      // Search filter: url, context, industry
      if (!normalizedQuery) return true;
      const url = (domain.url || '').toLowerCase();
      const context = (domain.context || '').toLowerCase();
      const industry = (domain.industry || '').toLowerCase();
      return url.includes(normalizedQuery) || context.includes(normalizedQuery) || industry.includes(normalizedQuery);
    })
    .sort((a, b) => {
      // Sort comparator
      const dir = sortDir === 'asc' ? 1 : -1;
      switch (sortBy) {
        case 'recent': {
          const aTime = a.lastAnalyzed ? new Date(a.lastAnalyzed).getTime() : 0;
          const bTime = b.lastAnalyzed ? new Date(b.lastAnalyzed).getTime() : 0;
          return (aTime - bTime) * dir;
        }
        case 'visibility': {
          const aScore = a.metrics?.visibilityScore ?? -Infinity;
          const bScore = b.metrics?.visibilityScore ?? -Infinity;
          return (aScore - bScore) * dir;
        }
        case 'keywords': {
          const aVal = a.metrics?.keywordCount ?? -Infinity;
          const bVal = b.metrics?.keywordCount ?? -Infinity;
          return (aVal - bVal) * dir;
        }
        case 'phrases': {
          const aVal = a.metrics?.phraseCount ?? -Infinity;
          const bVal = b.metrics?.phraseCount ?? -Infinity;
          return (aVal - bVal) * dir;
        }
        case 'url': {
          const aUrl = (a.url || '').toLowerCase();
          const bUrl = (b.url || '').toLowerCase();
          return aUrl.localeCompare(bUrl) * (sortDir === 'asc' ? 1 : -1);
        }
        default:
          return 0;
      }
    });

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'bg-green-500';
    if (score >= 80) return 'bg-blue-500';
    if (score >= 70) return 'bg-orange-500';
    return 'bg-red-500';
  };

  const getScoreBadgeStyle = (score: number) => {
    if (score >= 90) return 'bg-gradient-to-r from-emerald-50 to-teal-50 text-emerald-700 border-emerald-200';
    if (score >= 80) return 'bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700 border-blue-200';
    if (score >= 70) return 'bg-gradient-to-r from-amber-50 to-orange-50 text-amber-700 border-amber-200';
    return 'bg-gradient-to-r from-rose-50 to-pink-50 text-rose-700 border-rose-200';
  };

  const getStatusBadge = (domain: DashboardDomain) => {
    const currentStep = domain.currentStep ?? 0;
    
    if (currentStep === 4) {
      return <Badge className="bg-gradient-to-r from-emerald-50 to-teal-50 text-emerald-700 border-emerald-200 hover:from-emerald-100 hover:to-teal-100 transition-all duration-200">Completed</Badge>;
    } else if (currentStep > 0) {
      return <Badge className="bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700 border-blue-200 animate-pulse">In Progress</Badge>;
    } else {
      return <Badge className="bg-gradient-to-r from-amber-50 to-orange-50 text-amber-700 border-amber-200">Not Started</Badge>;
    }
  };

  const getStepName = (step: number) => {
    const steps = [
      'Domain Submission',
      'Context Extraction', 
      'Keyword Discovery',
      'Phrase Generation',
      'AI Query Results',
      'Response Scoring'
    ];
    return steps[step] || 'Unknown Step';
  };

  const totalDomains = domains.length;
  const completedDomains = domains.filter(d => d.metrics).length;
  const avgVisibilityScore = domains
    .filter(d => d.metrics)
    .reduce((acc, d) => acc + (d.metrics?.visibilityScore || 0), 0) / (completedDomains || 1);

  const totalKeywords = domains
    .filter(d => d.metrics)
    .reduce((acc, d) => acc + (d.metrics?.keywordCount || 0), 0);

  // Calculate previous month domain count for growth stat
  // For demo, assume domains have a lastAnalyzed date and count those from previous month
  const now = new Date();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();
  const lastMonth = thisMonth === 0 ? 11 : thisMonth - 1;
  const lastMonthYear = thisMonth === 0 ? thisYear - 1 : thisYear;
  const domainsThisMonth = domains.filter(d => {
    if (!d.lastAnalyzed) return false;
    const date = new Date(d.lastAnalyzed);
    return date.getMonth() === thisMonth && date.getFullYear() === thisYear;
  }).length;
  const domainsLastMonth = domains.filter(d => {
    if (!d.lastAnalyzed) return false;
    const date = new Date(d.lastAnalyzed);
    return date.getMonth() === lastMonth && date.getFullYear() === lastMonthYear;
  }).length;
  const domainGrowth = domainsLastMonth > 0 ? Math.round(((domainsThisMonth - domainsLastMonth) / domainsLastMonth) * 100) : 0;

  // Industry average for visibility
  const industryAvgVisibility = 65;
  const aboveIndustryAvg = avgVisibilityScore > industryAvgVisibility;

  // High coverage threshold for keywords
  const highCoverageThreshold = 1000;
  const highCoverage = totalKeywords >= highCoverageThreshold;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-black border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="text-red-600 text-6xl mb-4">⚠️</div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Error Loading Dashboard</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button onClick={() => window.location.reload()} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen overflow-x-hidden" style={{ 
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", "Helvetica Neue", Helvetica, Arial, sans-serif',
      background: '#f5f5f7'
    }}>
      <style>{`
        .dashboard-header {
          position: sticky;
          top: 0;
          padding: calc(env(safe-area-inset-top) + 12px) 24px 12px 24px;
          background: rgba(255, 255, 255, 0.72);
          backdrop-filter: saturate(180%) blur(20px);
          -webkit-backdrop-filter: saturate(180%) blur(20px);
          border-bottom: 0.5px solid rgba(0, 0, 0, 0.1);
          z-index: 100;
        }
        
        .dashboard-content {
          margin-top: 16px;
          padding: 24px;
        }
        
        .apple-card {
          background: rgba(255, 255, 255, 0.8);
          backdrop-filter: saturate(180%) blur(20px);
          -webkit-backdrop-filter: saturate(180%) blur(20px);
          border: 0.5px solid rgba(0, 0, 0, 0.1);
          border-radius: 16px;
          transition: all 0.3s ease;
        }
        
        .apple-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
        }
        
        .apple-button {
          background: #000000;
          color: white;
          border: none;
          border-radius: 980px;
          padding: 12px 24px;
          font-size: 16px;
          font-weight: 400;
          letter-spacing: -0.022em;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .apple-button:hover {
          background: rgba(0, 0, 0, 0.9);
          transform: scale(1.02);
        }
        
        .apple-input {
          background: rgba(255, 255, 255, 0.8);
          border: 0.5px solid rgba(0, 0, 0, 0.1);
          border-radius: 12px;
          padding: 12px 16px;
          font-size: 16px;
          font-weight: 400;
          letter-spacing: -0.022em;
          transition: all 0.2s ease;
        }
        
        .apple-input:focus {
          outline: none;
          border-color: #000000;
          box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.1);
        }

        .apple-icon-button {
          background: rgba(0, 0, 0, 0.04);
          border: 0.5px solid rgba(0, 0, 0, 0.08);
          border-radius: 10px;
          width: 28px;
          height: 28px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .apple-icon-button:hover {
          background: rgba(0, 0, 0, 0.08);
          transform: translateY(-0.5px);
        }

        .apple-icon-button:active {
          transform: translateY(0);
        }

        .apple-icon-button:focus-visible {
          outline: none;
          box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.25);
        }

        .apple-icon-button-danger {
          background: rgba(255, 59, 48, 0.06);
          border-color: rgba(255, 59, 48, 0.12);
        }

        .apple-icon-button-danger:hover {
          background: rgba(255, 59, 48, 0.12);
        }

        .apple-alert-content {
          background: #ffffff;
          border: 0.5px solid rgba(0,0,0,0.08);
          box-shadow: 0 20px 50px rgba(0,0,0,0.15);
        }
        .apple-alert-title {
          font-weight: 500;
          letter-spacing: -0.022em;
          color: #1d1d1f;
        }
        .apple-alert-desc {
          color: #6b7280;
        }

        .apple-modal {
          padding: 20px 22px;
          border-radius: 16px;
        }
        .apple-modal-header {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .apple-modal-icon {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #FF3B30 0%, #FF6B35 100%);
        }
        .apple-chip {
          display: inline-flex;
          align-items: center;
          padding: 4px 10px;
          border-radius: 999px;
          background: rgba(0,0,0,0.05);
          color: #6b7280;
          font-size: 12px;
          font-weight: 500;
        }
        .apple-outline-button {
          background: rgba(0, 0, 0, 0.04);
          border: 0.5px solid rgba(0, 0, 0, 0.1);
          color: #1f2937;
          border-radius: 980px;
          padding: 8px 16px;
          transition: all 0.2s ease;
        }
        .apple-outline-button:hover { background: rgba(0,0,0,0.06); }
        .apple-outline-button:disabled { opacity: 0.6; cursor: not-allowed; }

        .apple-danger-button {
          background: #000000;
          color: #fff;
          border: none;
          border-radius: 980px;
          padding: 8px 16px;
          transition: all 0.2s ease;
        }
        .apple-danger-button:hover { background: rgba(0,0,0,0.9); }
        .apple-danger-button:disabled { background: rgba(0,0,0,0.5); cursor: not-allowed; }

        /* Mobile-first responsive refinements */
        @media (max-width: 640px) {
          .dashboard-header { padding: calc(env(safe-area-inset-top) + 10px) 16px 10px 16px; }
          .dashboard-content { margin-top: 12px; padding: 16px; }
          .apple-card { border-radius: 14px; }
          .apple-button { padding: 10px 18px; font-size: 14px; }
          .apple-input { padding: 10px 14px; font-size: 14px; }
        }

        @media (max-width: 480px) {
          .dashboard-header { padding: 10px 14px; }
          .dashboard-content { margin-top: 68px; padding: 14px; }
        }
      `}</style>

      {/* Confirmation Dialog */}
      <DeleteConfirmDialog
        open={confirmOpen}
        onOpenChange={(v) => { if (!deleting) setConfirmOpen(v); }}
        domainUrl={pendingDelete?.url}
        onConfirm={confirmDelete}
        loading={deleting}
      />

      {/* Apple-style Header */}
      <header className="dashboard-header">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center justify-between w-full sm:w-auto space-x-3 sm:space-x-6">
            <h1 style={{ 
              fontSize: '24px',
              fontWeight: '400',
              letterSpacing: '-0.022em',
              color: '#1d1d1f',
              margin: '0'
            }}>
              Dashboard
            </h1>
            <div style={{
              background: 'rgba(0, 122, 255, 0.1)',
              color: '#007AFF',
              padding: '4px 12px',
              borderRadius: '12px',
              fontSize: '14px',
              fontWeight: '500'
            }}>
              {domains.length} domains
            </div>
          </div>
          
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:space-x-4 w-full sm:w-auto">
            <div className="relative group w-full sm:w-auto">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4 group-focus-within:text-black transition-colors" />
              <input
                placeholder="Search domains..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="apple-input pl-10 w-full sm:w-64"
                style={{ paddingLeft: '40px' }}
              />
            </div>
            
            <button 
              onClick={() => navigate('/ai-checker-page')} 
              className="apple-button w-full sm:w-auto"
            >
              <Plus className="h-4 w-4 mr-2" />
              New Analysis
            </button>
            
            <div className="flex items-center justify-end space-x-2">
              <button 
                onClick={() => navigate('/profile')}
                style={{
                  background: 'transparent',
                  border: 'none',
                  padding: '8px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(0, 0, 0, 0.05)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <User className="h-4 w-4 text-gray-600" />
              </button>
              <button 
                onClick={logout}
                style={{
                  background: 'transparent',
                  border: 'none',
                  padding: '8px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(0, 0, 0, 0.05)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <LogOut className="h-4 w-4 text-gray-600" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="dashboard-content">
        <div className="max-w-6xl mx-auto">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
            <div className="apple-card p-6 group cursor-pointer">
              <div className="flex items-start justify-between mb-4">
                <div style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '12px',
                  background: 'linear-gradient(135deg, #007AFF 0%, #5856D6 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Globe className="h-6 w-6 text-white" />
                </div>
                <ArrowUpRight className="h-4 w-4 text-gray-400 group-hover:text-blue-500 transition-colors" />
              </div>
              <div className="space-y-1">
                <p style={{ 
                  fontSize: '32px',
                  fontWeight: '200',
                  letterSpacing: '-0.022em',
                  color: '#1d1d1f',
                  margin: '0'
                }}>{totalDomains}</p>
                <p style={{ 
                  fontSize: '17px',
                  fontWeight: '300',
                  letterSpacing: '0.011em',
                  color: '#86868b',
                  margin: '0'
                }}>Total Domains</p>
                <p style={{ 
                  fontSize: '14px',
                  fontWeight: '400',
                  color: domainGrowth > 0 ? '#34C759' : domainGrowth < 0 ? '#FF3B30' : '#86868b',
                  margin: '0'
                }}>
                  {domainGrowth > 0 ? `+${domainGrowth}% this month` : domainGrowth < 0 ? `${domainGrowth}% this month` : 'No change'}
                </p>
              </div>
            </div>

            <div className="apple-card p-6 group cursor-pointer">
              <div className="flex items-start justify-between mb-4">
                <div style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '12px',
                  background: 'linear-gradient(135deg, #34C759 0%, #30D158 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <BarChart3 className="h-6 w-6 text-white" />
                </div>
                <ArrowUpRight className="h-4 w-4 text-gray-400 group-hover:text-green-500 transition-colors" />
              </div>
              <div className="space-y-1">
                <p style={{ 
                  fontSize: '32px',
                  fontWeight: '200',
                  letterSpacing: '-0.022em',
                  color: '#1d1d1f',
                  margin: '0'
                }}>{completedDomains}</p>
                <p style={{ 
                  fontSize: '17px',
                  fontWeight: '300',
                  letterSpacing: '0.011em',
                  color: '#86868b',
                  margin: '0'
                }}>Analyzed</p>
                <p style={{ 
                  fontSize: '14px',
                  fontWeight: '400',
                  color: '#34C759',
                  margin: '0'
                }}>
                  {Math.round((completedDomains/totalDomains)*100)}% complete
                </p>
              </div>
            </div>

            <div className="apple-card p-6 group cursor-pointer">
              <div className="flex items-start justify-between mb-4">
                <div style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '12px',
                  background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Target className="h-6 w-6 text-white" />
                </div>
                <ArrowUpRight className="h-4 w-4 text-gray-400 group-hover:text-purple-500 transition-colors" />
              </div>
              <div className="space-y-1">
                <p style={{ 
                  fontSize: '32px',
                  fontWeight: '200',
                  letterSpacing: '-0.022em',
                  color: '#1d1d1f',
                  margin: '0'
                }}>{avgVisibilityScore.toFixed(1)}%</p>
                <p style={{ 
                  fontSize: '17px',
                  fontWeight: '300',
                  letterSpacing: '0.011em',
                  color: '#86868b',
                  margin: '0'
                }}>Avg Visibility</p>
                <p style={{ 
                  fontSize: '14px',
                  fontWeight: '400',
                  color: aboveIndustryAvg ? '#34C759' : '#FF9500',
                  margin: '0'
                }}>
                  {aboveIndustryAvg ? 'Above average' : 'Below average'}
                </p>
              </div>
            </div>

            <div className="apple-card p-6 group cursor-pointer">
              <div className="flex items-start justify-between mb-4">
                <div style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '12px',
                  background: 'linear-gradient(135deg, #FF9500 0%, #FF6B35 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Zap className="h-6 w-6 text-white" />
                </div>
                <ArrowUpRight className="h-4 w-4 text-gray-400 group-hover:text-orange-500 transition-colors" />
              </div>
              <div className="space-y-1">
                <p style={{ 
                  fontSize: '32px',
                  fontWeight: '200',
                  letterSpacing: '-0.022em',
                  color: '#1d1d1f',
                  margin: '0'
                }}>{totalKeywords.toLocaleString()}</p>
                <p style={{ 
                  fontSize: '17px',
                  fontWeight: '300',
                  letterSpacing: '0.011em',
                  color: '#86868b',
                  margin: '0'
                }}>Keywords</p>
                <p style={{ 
                  fontSize: '14px',
                  fontWeight: '400',
                  color: highCoverage ? '#34C759' : '#007AFF',
                  margin: '0'
                }}>
                  {highCoverage ? 'High coverage' : 'Growing'}
                </p>
              </div>
            </div>
          </div>

          {/* Filters Section */}
          <div className="apple-card p-6 mb-8">
            <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center justify-between">
              <div className="relative flex-1 max-w-md group">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4 group-focus-within:text-black transition-colors" />
                <input
                  type="text"
                  placeholder="Search domains..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="apple-input w-full pl-11 pr-4 py-3"
                  style={{ paddingLeft: '44px' }}
                />
              </div>
              <div className="flex items-center gap-3">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as 'all' | 'completed' | 'in-progress' | 'not-started')}
                  className="apple-input px-4 py-2 text-sm font-medium text-gray-700 appearance-none cursor-pointer"
                >
                  <option value="all">All Status</option>
                  <option value="completed">Completed</option>
                  <option value="in-progress">In Progress</option>
                  <option value="not-started">Not Started</option>
                </select>
                
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as 'recent' | 'visibility' | 'keywords' | 'phrases' | 'url')}
                  className="apple-input px-4 py-2 text-sm font-medium text-gray-700 appearance-none cursor-pointer"
                >
                  <option value="recent">Recent</option>
                  <option value="visibility">Visibility</option>
                  <option value="keywords">Keywords</option>
                  <option value="phrases">Phrases</option>
                  <option value="url">URL</option>
                </select>
              </div>
            </div>
          </div>

          {/* Domain Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {/* Active Sessions Cards */}
          {activeSessions.map((session) => {
            const domain = session.domain;
            const currentStepName = getStepName(session.currentStep);
            const progressPercentage = Math.round(((session.currentStep + 1) / 6) * 100);
            const industry = domain.industry ?? 'General';
            const contextPreview = domain.context
              ? domain.context.split(' ').slice(0, 28).join(' ') + (domain.context.split(' ').length > 28 ? '...' : '')
              : '';

            return (
              <div
                key={`session-${session.domain.id}`}
                className="apple-card p-6 group cursor-pointer"
                role="button"
                tabIndex={0}
                onClick={() => handleDomainClick({ id: session.domain.id, url: session.domain.url, lastAnalyzed: session.lastActivity, currentStep: session.currentStep })}
                onKeyPress={e => { if (e.key === 'Enter' || e.key === ' ') handleDomainClick({ id: session.domain.id, url: session.domain.url, lastAnalyzed: session.lastActivity, currentStep: session.currentStep }); }}
                aria-label={`Resume analysis for ${domain.url}`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <div style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '12px',
                      background: 'linear-gradient(135deg, #007AFF 0%, #5856D6 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <Clock className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <h3 style={{ 
                        fontSize: '18px',
                        fontWeight: '500',
                        letterSpacing: '-0.022em',
                        color: '#1d1d1f',
                        margin: '0 0 4px 0'
                      }}>
                        {domain.url}
                      </h3>
                      <div className="flex items-center space-x-2">
                        <span style={{
                          background: 'rgba(0, 122, 255, 0.1)',
                          color: '#007AFF',
                          padding: '2px 8px',
                          borderRadius: '8px',
                          fontSize: '12px',
                          fontWeight: '500'
                        }}>
                          In Progress
                        </span>
                        <span style={{
                          background: 'rgba(0, 0, 0, 0.05)',
                          color: '#86868b',
                          padding: '2px 8px',
                          borderRadius: '8px',
                          fontSize: '12px',
                          fontWeight: '400'
                        }}>
                          {industry}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => { e.stopPropagation(); openDeleteConfirm(session.domain.id, domain.url); }}
                      aria-label="Delete domain"
                      title="Delete"
                      className="apple-icon-button apple-icon-button-danger"
                    >
                      <Trash className="h-4 w-4" strokeWidth={1.75} color="#FF3B30" />
                    </button>
                    <ArrowUpRight className="h-4 w-4 text-gray-400 group-hover:text-blue-500 transition-colors" />
                  </div>
                </div>

                {contextPreview && (
                  <p style={{ 
                    fontSize: '15px',
                    fontWeight: '300',
                    letterSpacing: '0.011em',
                    color: '#86868b',
                    lineHeight: '1.4',
                    margin: '0 0 16px 0'
                  }}>
                    {contextPreview}
                  </p>
                )}

                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span style={{ 
                        fontSize: '14px',
                        fontWeight: '500',
                        color: '#1d1d1f'
                      }}>Current Step</span>
                    </div>
                    <h4 style={{ 
                      fontSize: '20px',
                      fontWeight: '400',
                      letterSpacing: '-0.022em',
                      color: '#007AFF',
                      margin: '0 0 8px 0'
                    }}>
                      {currentStepName}
                    </h4>
                    <div style={{
                      width: '100%',
                      height: '4px',
                      background: 'rgba(0, 0, 0, 0.1)',
                      borderRadius: '2px',
                      overflow: 'hidden'
                    }}>
                      <div 
                        style={{
                          height: '100%',
                          background: 'linear-gradient(90deg, #007AFF 0%, #5856D6 100%)',
                          borderRadius: '2px',
                          width: `${progressPercentage}%`,
                          transition: 'width 0.3s ease'
                        }}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div style={{
                      background: 'rgba(0, 122, 255, 0.05)',
                      borderRadius: '12px',
                      padding: '16px',
                      border: '0.5px solid rgba(0, 122, 255, 0.1)'
                    }}>
                      <div className="flex items-center space-x-2 mb-2">
                        <div style={{
                          width: '24px',
                          height: '24px',
                          background: '#007AFF',
                          borderRadius: '6px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}>
                          <Play className="h-3 w-3 text-white" />
                        </div>
                        <span style={{ 
                          fontSize: '12px',
                          fontWeight: '500',
                          color: '#007AFF'
                        }}>Progress</span>
                      </div>
                      <p style={{ 
                        fontSize: '20px',
                        fontWeight: '400',
                        color: '#1d1d1f',
                        margin: '0'
                      }}>{progressPercentage}%</p>
                    </div>
                    <div style={{
                      background: 'rgba(52, 199, 89, 0.05)',
                      borderRadius: '12px',
                      padding: '16px',
                      border: '0.5px solid rgba(52, 199, 89, 0.1)'
                    }}>
                      <div className="flex items-center space-x-2 mb-2">
                        <div style={{
                          width: '24px',
                          height: '24px',
                          background: '#34C759',
                          borderRadius: '6px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}>
                          <Clock className="h-3 w-3 text-white" />
                        </div>
                        <span style={{ 
                          fontSize: '12px',
                          fontWeight: '500',
                          color: '#34C759'
                        }}>Steps Left</span>
                      </div>
                      <p style={{ 
                        fontSize: '20px',
                        fontWeight: '400',
                        color: '#1d1d1f',
                        margin: '0'
                      }}>{6 - (session.currentStep + 1)}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-4" style={{ borderTop: '0.5px solid rgba(0, 0, 0, 0.1)' }}>
                    <span style={{ 
                      fontSize: '12px',
                      fontWeight: '400',
                      color: '#86868b'
                    }}>
                      Last activity: {new Date(session.lastActivity).toLocaleDateString('en-US', { 
                        month: 'short', 
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit'
                      })}
                    </span>
                    <div className="flex items-center text-blue-600 text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      Resume
                      <Play className="h-3 w-3 ml-1" />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Domain Cards */}
          {filteredDomains.map((domain) => {
            const currentStep = domain.currentStep ?? 0;
            const status = currentStep === 4 ? 'completed' : currentStep > 0 ? 'in-progress' : 'not-started';
            const visibilityScore = domain.metrics?.visibilityScore ?? 0;
            const keywordCount = domain.metrics?.keywordCount ?? 0;
            const phraseCount = domain.metrics?.phraseCount ?? 0;
            const industry = domain.industry ?? 'General';

            return (
              <div
                key={domain.id}
                className="apple-card p-6 group cursor-pointer"
                role="button"
                tabIndex={0}
                onClick={() => handleDomainClick(domain)}
                onKeyPress={e => { if (e.key === 'Enter' || e.key === ' ') handleDomainClick(domain); }}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <div style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '12px',
                      background: status === 'completed' 
                        ? 'linear-gradient(135deg, #34C759 0%, #30D158 100%)'
                        : status === 'in-progress'
                        ? 'linear-gradient(135deg, #007AFF 0%, #5856D6 100%)'
                        : 'linear-gradient(135deg, #8E8E93 0%, #6D6D70 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <Globe className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <h3 style={{ 
                        fontSize: '18px',
                        fontWeight: '500',
                        letterSpacing: '-0.022em',
                        color: '#1d1d1f',
                        margin: '0 0 4px 0'
                      }}>
                        {domain.url}
                      </h3>
                      <div className="flex items-center space-x-2">
                        {status === 'completed' ? (
                          <span style={{
                            background: 'rgba(52, 199, 89, 0.1)',
                            color: '#34C759',
                            padding: '2px 8px',
                            borderRadius: '8px',
                            fontSize: '12px',
                            fontWeight: '500'
                          }}>
                            Completed
                          </span>
                        ) : status === 'in-progress' ? (
                          <span style={{
                            background: 'rgba(0, 122, 255, 0.1)',
                            color: '#007AFF',
                            padding: '2px 8px',
                            borderRadius: '8px',
                            fontSize: '12px',
                            fontWeight: '500'
                          }}>
                            In Progress
                          </span>
                        ) : (
                          <span style={{
                            background: 'rgba(0, 0, 0, 0.05)',
                            color: '#86868b',
                            padding: '2px 8px',
                            borderRadius: '8px',
                            fontSize: '12px',
                            fontWeight: '500'
                          }}>
                            Not Started
                          </span>
                        )}
                        <span style={{
                          background: 'rgba(0, 0, 0, 0.05)',
                          color: '#86868b',
                          padding: '2px 8px',
                          borderRadius: '8px',
                          fontSize: '12px',
                          fontWeight: '400'
                        }}>
                          {industry}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => { e.stopPropagation(); openDeleteConfirm(domain.id, domain.url); }}
                      aria-label="Delete domain"
                      title="Delete"
                      className="apple-icon-button apple-icon-button-danger"
                    >
                      <Trash className="h-4 w-4" strokeWidth={1.75} color="#FF3B30" />
                    </button>
                    <ArrowUpRight className="h-4 w-4 text-gray-400 group-hover:text-blue-500 transition-colors" />
                  </div>
                </div>

                {status === 'completed' ? (
                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span style={{ 
                          fontSize: '14px',
                          fontWeight: '500',
                          color: '#1d1d1f'
                        }}>Visibility Score</span>
                        <span style={{ 
                          fontSize: '24px',
                          fontWeight: '400',
                          color: '#1d1d1f'
                        }}>{visibilityScore}%</span>
                      </div>
                      <div style={{
                        width: '100%',
                        height: '4px',
                        background: 'rgba(0, 0, 0, 0.1)',
                        borderRadius: '2px',
                        overflow: 'hidden'
                      }}>
                        <div 
                          style={{
                            height: '100%',
                            background: 'linear-gradient(90deg, #34C759 0%, #30D158 100%)',
                            borderRadius: '2px',
                            width: `${visibilityScore}%`,
                            transition: 'width 0.3s ease'
                          }}
                        />
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 pt-4" style={{ borderTop: '0.5px solid rgba(0, 0, 0, 0.1)' }}>
                      <div>
                        <p style={{ 
                          fontSize: '20px',
                          fontWeight: '400',
                          color: '#1d1d1f',
                          margin: '0 0 4px 0'
                        }}>{keywordCount.toLocaleString()}</p>
                        <p style={{ 
                          fontSize: '12px',
                          fontWeight: '400',
                          color: '#86868b',
                          margin: '0'
                        }}>Keywords</p>
                      </div>
                      <div>
                        <p style={{ 
                          fontSize: '20px',
                          fontWeight: '400',
                          color: '#1d1d1f',
                          margin: '0 0 4px 0'
                        }}>{phraseCount.toLocaleString()}</p>
                        <p style={{ 
                          fontSize: '12px',
                          fontWeight: '400',
                          color: '#86868b',
                          margin: '0'
                        }}>Phrases</p>
                      </div>
                    </div>
                  </div>
                ) : status === 'in-progress' ? (
                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span style={{ 
                          fontSize: '14px',
                          fontWeight: '500',
                          color: '#1d1d1f'
                        }}>Progress</span>
                        <span style={{ 
                          fontSize: '18px',
                          fontWeight: '400',
                          color: '#007AFF'
                        }}>Step {currentStep + 1}/5</span>
                      </div>
                      <div style={{
                        width: '100%',
                        height: '4px',
                        background: 'rgba(0, 0, 0, 0.1)',
                        borderRadius: '2px',
                        overflow: 'hidden'
                      }}>
                        <div 
                          style={{
                            height: '100%',
                            background: 'linear-gradient(90deg, #007AFF 0%, #5856D6 100%)',
                            borderRadius: '2px',
                            width: `${((currentStep + 1) / 5) * 100}%`,
                            transition: 'width 0.3s ease'
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center py-8">
                    <div className="text-center">
                      <div style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '12px',
                        background: 'linear-gradient(135deg, #007AFF 0%, #5856D6 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 12px auto'
                      }}>
                        <Play className="h-6 w-6 text-white" />
                      </div>
                      <span style={{ 
                        fontSize: '15px',
                        fontWeight: '400',
                        color: '#86868b'
                      }}>Ready to analyze</span>
                    </div>
                  </div>
                )}
                
                <div className="flex items-center justify-between pt-4 mt-4" style={{ borderTop: '0.5px solid rgba(0, 0, 0, 0.1)' }}>
                  <span style={{ 
                    fontSize: '12px',
                    fontWeight: '400',
                    color: '#86868b'
                  }}>
                    {domain.lastAnalyzed ? new Date(domain.lastAnalyzed).toLocaleDateString() : 'Not analyzed'}
                  </span>
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => { e.stopPropagation(); navigate(`/analyze?domainId=${domain.id}&reanalyze=1`); }}
                      className="px-3 py-1.5 text-xs rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50"
                    >
                      Re-analyze
                    </button>
                    <span style={{ 
                      fontSize: '14px',
                      fontWeight: '400',
                      color: '#007AFF',
                      transition: 'opacity 0.3s ease'
                    }}>
                      {status === 'completed' ? 'View' : status === 'in-progress' ? 'Continue' : 'Start'}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

          {filteredDomains.length === 0 && (
            <div className="text-center py-20">
              <div style={{
                width: '64px',
                height: '64px',
                borderRadius: '16px',
                background: 'linear-gradient(135deg, #007AFF 0%, #5856D6 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 24px auto'
              }}>
                <Globe className="h-8 w-8 text-white" />
              </div>
              <h3 style={{ 
                fontSize: '24px',
                fontWeight: '400',
                letterSpacing: '-0.022em',
                color: '#1d1d1f',
                margin: '0 0 8px 0'
              }}>No domains found</h3>
              <p style={{ 
                fontSize: '17px',
                fontWeight: '300',
                letterSpacing: '0.011em',
                color: '#86868b',
                lineHeight: '1.4',
                margin: '0 0 32px 0',
                maxWidth: '400px',
                marginLeft: 'auto',
                marginRight: 'auto'
              }}>
                {searchTerm ? 'Try adjusting your search or filters' : 'Get started by analyzing your first domain'}
              </p>
              <button 
                className="apple-button"
                onClick={() => navigate('/analyze')}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Domain
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProfessionalDashboard;

// Apple-like delete confirmation dialog
function DeleteConfirmDialog({
  open,
  onOpenChange,
  domainUrl,
  onConfirm,
  loading,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  domainUrl?: string;
  onConfirm: () => void;
  loading?: boolean;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="apple-alert-content apple-modal">
        <AlertDialogHeader className="space-y-3">
          <div className="apple-modal-header">
            <div className="apple-modal-icon">
              <Trash className="h-5 w-5 text-white" />
            </div>
            <div>
              <AlertDialogTitle className="apple-alert-title">Delete domain</AlertDialogTitle>
              <div className="apple-chip">Irreversible</div>
            </div>
          </div>
          <AlertDialogDescription className="apple-alert-desc">
            {domainUrl ? `“${domainUrl}”` : 'This domain'} and all associated analysis data will be permanently deleted.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <button className="apple-outline-button" disabled={loading} onClick={(e) => { if (loading) e.preventDefault(); onOpenChange(false); }}>Cancel</button>
          <button className="apple-danger-button" onClick={onConfirm} disabled={loading}>
            {loading ? 'Deleting…' : 'Delete'}
          </button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}