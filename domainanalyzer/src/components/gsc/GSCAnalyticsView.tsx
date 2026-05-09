import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, Calendar, Plug, AlertCircle, Loader2, ExternalLink } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import PagesTable from "./PagesTable";
import PageQueriesTable from "./PageQueriesTable";
import { getDefaultDateRange, formatDateForDisplay, getDateRangeDescription } from "@/lib/gsc/dateUtils";

type BlogAggregateRow = {
  id: number;
  url: string;
  title: string;
  primaryKeyword: string | null;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

type BlogAggregate = {
  success: boolean;
  connected: boolean;
  totalClicks: number;
  totalImpressions: number;
  avgCTR: number;
  avgPosition: number;
  blogs: BlogAggregateRow[];
  topPerformingBlogs: BlogAggregateRow[];
  totalBlogsAnalyzed: number;
};

const BlogPerformancePanel = ({ days }: { days: string }) => {
  const { data, isLoading, error, refetch } = useQuery<BlogAggregate>({
    queryKey: ['blog-analytics-aggregate', days],
    queryFn: async () => {
      const params = days !== 'custom' ? `?days=${days}` : '';
      const r = await fetch(`${API_BASE_URL}/api/blog-analytics/aggregate${params}`, {
        headers: getAuthHeaders(),
      });
      if (!r.ok) throw new Error(`Aggregate fetch failed (${r.status})`);
      return r.json();
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="text-center py-16">
        <AlertCircle className="h-8 w-8 mx-auto mb-3 text-rose-400" />
        <p className="text-sm text-slate-600">{(error as Error).message}</p>
        <button
          onClick={() => refetch()}
          className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Retry
        </button>
      </div>
    );
  }
  if (!data) return null;
  if (!data.connected) {
    return (
      <div className="text-center py-16">
        <Plug className="h-8 w-8 mx-auto mb-3 text-gray-400" />
        <p className="text-sm text-slate-600">
          Connect Google Search Console to see how your published blogs are performing.
        </p>
      </div>
    );
  }
  if (data.totalBlogsAnalyzed === 0) {
    return (
      <div className="text-center py-16">
        <AlertCircle className="h-8 w-8 mx-auto mb-3 text-gray-400" />
        <p className="text-sm text-slate-600">No published blogs yet to analyse.</p>
      </div>
    );
  }
  const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;
  return (
    <div className="space-y-4 p-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="Total clicks" value={data.totalClicks.toLocaleString()} />
        <SummaryCard label="Impressions" value={data.totalImpressions.toLocaleString()} />
        <SummaryCard label="Avg CTR" value={fmtPct(data.avgCTR)} />
        <SummaryCard label="Avg position" value={data.avgPosition.toFixed(1)} />
      </div>
      <div className="overflow-hidden rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Page</th>
              <th className="px-3 py-2 text-right">Clicks</th>
              <th className="px-3 py-2 text-right">Impr.</th>
              <th className="px-3 py-2 text-right">CTR</th>
              <th className="px-3 py-2 text-right">Position</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.blogs.map((b) => (
              <tr key={b.id} className="hover:bg-slate-50">
                <td className="px-3 py-2">
                  <a
                    href={b.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-slate-800 hover:text-blue-600"
                  >
                    {b.title || b.url}
                    <ExternalLink className="h-3 w-3 text-slate-400" />
                  </a>
                  {b.primaryKeyword ? (
                    <p className="mt-0.5 text-xs text-slate-500">{b.primaryKeyword}</p>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{b.clicks.toLocaleString()}</td>
                <td className="px-3 py-2 text-right tabular-nums">{b.impressions.toLocaleString()}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtPct(b.ctr)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{b.position.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const SummaryCard = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
    <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
    <p className="mt-0.5 text-lg font-semibold text-slate-900 tabular-nums">{value}</p>
  </div>
);

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3002';

interface DateRange {
  startDate: string;
  endDate: string;
  requestedStartDate: string;
  requestedEndDate: string;
  filterType: string;
  daysRequested: number;
  totalResults: number;
}

const getAuthHeaders = () => {
  const token = localStorage.getItem('authToken');
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
};

const GSCAnalyticsView = () => {
  const { toast } = useToast();
  const [selectedPage, setSelectedPage] = useState<string | null>(null);
  const [days, setDays] = useState("28");
  const [customStartDate, setCustomStartDate] = useState<string | undefined>(getDefaultDateRange().startDate);
  const [customEndDate, setCustomEndDate] = useState<string | undefined>(getDefaultDateRange().endDate);
  const [gscConnected, setGscConnected] = useState(false);
  const [gscStatusLoading, setGscStatusLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeGscSubTab, setActiveGscSubTab] = useState<'whole-analytics' | 'blog-performance'>('whole-analytics');

  // Check GSC connection status
  useEffect(() => {
    const checkGSCStatus = async () => {
      try {
        setGscStatusLoading(true);
        const response = await fetch(`${API_BASE_URL}/api/gsc/status`, {
          headers: getAuthHeaders(),
        });
        
        if (!response.ok) throw new Error('Failed to fetch GSC status');
        
        const data = await response.json();
        setGscConnected(data.connected || false);
      } catch (error) {
        console.error('Error checking GSC status:', error);
        setGscConnected(false);
      } finally {
        setGscStatusLoading(false);
      }
    };

    checkGSCStatus();
  }, []);

  // Fetch pages data
  const { data: pagesData, isLoading: isLoadingPages, refetch: refetchPages } = useQuery({
    queryKey: ['gscPages', days, customStartDate, customEndDate],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (days !== 'custom') {
        params.append('days', days);
      } else {
        if (customStartDate) params.append('startDate', customStartDate);
        if (customEndDate) params.append('endDate', customEndDate);
      }

      const response = await fetch(`${API_BASE_URL}/api/gsc/pages?${params.toString()}`, {
        headers: getAuthHeaders(),
      });

      const data = await response.json();
      
      if (!response.ok || !data.success) {
        return { success: false, error: data.error || 'Failed to fetch pages data' };
      }

      return data;
    },
    enabled: gscConnected && !selectedPage,
    staleTime: 60 * 60 * 1000,
  });

  // Fetch queries for selected page
  const { data: queriesData, isLoading: isLoadingQueries } = useQuery({
    queryKey: ['gscPageQueries', selectedPage, days, customStartDate, customEndDate],
    queryFn: async () => {
      if (!selectedPage) return null;

      const params = new URLSearchParams();
      if (days !== 'custom') {
        params.append('days', days);
      } else {
        if (customStartDate) params.append('startDate', customStartDate);
        if (customEndDate) params.append('endDate', customEndDate);
      }

      const encodedPageUrl = encodeURIComponent(selectedPage);
      const response = await fetch(`${API_BASE_URL}/api/gsc/pages/${encodedPageUrl}/queries?${params.toString()}`, {
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch page queries');
      }

      return response.json();
    },
    enabled: gscConnected && !!selectedPage,
    staleTime: 60 * 60 * 1000,
  });

  const [showTrends, setShowTrends] = useState(true);
  const [loadingPageUrl, setLoadingPageUrl] = useState<string | null>(null);

  // Fetch queries with date breakdown for trends
  const { data: trendsData, isLoading: isLoadingTrends } = useQuery({
    queryKey: ['gscPageQueriesTrends', selectedPage, days, customStartDate, customEndDate],
    queryFn: async () => {
      if (!selectedPage) return null;

      const params = new URLSearchParams();
      if (days !== 'custom') {
        params.append('days', days);
      } else {
        if (customStartDate) params.append('startDate', customStartDate);
        if (customEndDate) params.append('endDate', customEndDate);
      }
      params.append('includeDateBreakdown', 'true');

      const encodedPageUrl = encodeURIComponent(selectedPage);
      const response = await fetch(`${API_BASE_URL}/api/gsc/pages/${encodedPageUrl}/queries?${params.toString()}`, {
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch trends data');
      }

      return response.json();
    },
    enabled: gscConnected && !!selectedPage && showTrends,
    staleTime: 60 * 60 * 1000,
  });

  const handleDateRangeChange = (value: string) => {
    setDays(value);
    if (value !== 'custom') {
      setCustomStartDate(undefined);
      setCustomEndDate(undefined);
    }
  };

  const handlePageSelect = (pageUrl: string) => {
    setSelectedPage(pageUrl);
    setLoadingPageUrl(pageUrl);
  };

  const handleBackToPages = () => {
    setSelectedPage(null);
    setLoadingPageUrl(null);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refetchPages();
      toast({
        title: "Data refreshed",
        description: "GSC data has been updated.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to refresh data.",
        variant: "destructive",
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleConnectGSC = () => {
    window.location.href = '/newdashboard?tab=analytics&subtab=integration';
  };

  // Loading state
  if (gscStatusLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-gray-400" />
          <p className="text-sm font-light text-gray-600">Loading GSC connection...</p>
        </div>
      </div>
    );
  }

  // Not connected state
  if (!gscConnected) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="text-center space-y-6 max-w-md">
          <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto">
            <Plug className="h-8 w-8 text-gray-400" />
          </div>
          <div>
            <h3 className="text-2xl font-light text-gray-900 mb-2 tracking-tight">Google Search Console Not Connected</h3>
            <p className="text-sm font-light text-gray-600 leading-relaxed">
              Connect your Google Search Console account to view analytics data.
            </p>
          </div>
          <button
            onClick={handleConnectGSC}
            className="inline-flex items-center gap-2 px-6 py-3 bg-black text-white rounded-full text-sm font-medium hover:bg-gray-600  disabled:opacity-60 transition"
          >
            <Plug className="h-4 w-4" />
            Connect Google Search Console
          </button>
        </div>
      </div>
    );
  }

  // Domain error state
  const hasDomainError = pagesData?.success === false && 
    pagesData?.error?.includes('not found in your Google Search Console account');

  if (hasDomainError && !isLoadingPages) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="text-center space-y-6 max-w-md">
          <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto">
            <AlertCircle className="h-8 w-8 text-amber-500" />
          </div>
          <div>
            <h3 className="text-2xl font-light text-gray-900 mb-2 tracking-tight">Company Domain Not Found</h3>
            <p className="text-sm font-light text-gray-600 leading-relaxed">
              {pagesData?.error || 'Your company domain is not found in your Google Search Console account.'}
            </p>
          </div>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => refetchPages()}
              disabled={isRefreshing}
              className="h-10 px-5 border border-gray-200 text-gray-700 rounded-full hover:bg-gray-50 text-sm font-normal tracking-tight inline-flex items-center gap-2 disabled:opacity-50"
            >
              {isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Retry
            </button>
            <button
              onClick={handleConnectGSC}
              className="h-10 px-5 bg-gray-900 text-white rounded-full hover:bg-gray-800 transition-all duration-200 text-sm font-normal tracking-tight inline-flex items-center gap-2"
            >
              <Plug className="h-4 w-4" />
              Check Settings
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Queries view
  if (selectedPage) {
    return (
      <div className="min-w-7xl">
        <PageQueriesTable
          data={queriesData?.queries || []}
          pageUrl={selectedPage}
          dateRange={queriesData?.dateRange}
          isLoading={isLoadingQueries}
          onBack={handleBackToPages}
          showTrends={showTrends}
          onShowTrendsChange={setShowTrends}
          trendsData={trendsData?.dateBreakdown}
          isLoadingTrends={isLoadingTrends}
        />
      </div>
    );
  }

  // Pages list view - Hero style
 return (
  <div className="min-w-7xl">

    <div className="space-y-6">

      {/* ✅ Toggle (NOW IN CORRECT PLACE) */}
      <div className="flex items-center gap-6 border-b border-gray-200 pb-0">
  <button
    onClick={() => setActiveGscSubTab('whole-analytics')}
    className={`relative pb-3 text-sm font-medium transition-all duration-200 ${
      activeGscSubTab === 'whole-analytics'
        ? 'text-black'
        : 'text-gray-500 hover:text-black'
    }`}
  >
    Overall Performance
    {activeGscSubTab === 'whole-analytics' && (
      <span className="absolute left-0 bottom-0 h-[2px] w-full bg-black rounded-full"></span>
    )}
  </button>

  <button
    onClick={() => setActiveGscSubTab('blog-performance')}
    className={`relative pb-3 text-sm font-medium transition-all duration-200 ${
      activeGscSubTab === 'blog-performance'
        ? 'text-black'
        : 'text-gray-500 hover:text-black'
    }`}
  >
    Our Blog Performance
    {activeGscSubTab === 'blog-performance' && (
      <span className="absolute left-0 bottom-0 h-[2px] w-full bg-black rounded-full"></span>
    )}
  </button>
</div>

      {/* ✅ Conditional Rendering */}
      {activeGscSubTab === 'whole-analytics' && (
        <>
          {isLoadingPages ? (
            <PagesTable
              data={[]}
              onPageSelect={handlePageSelect}
              isLoading={true}
              loadingPageUrl={null}
              isQueriesLoading={false}
            />
          ) : pagesData?.success === false ? (
            <div className="text-center py-16">
              <AlertCircle className="h-8 w-8 mx-auto mb-4 text-red-400" />
              <p className="text-sm font-light text-red-600">
                {pagesData.error || 'Failed to fetch pages data'}
              </p>
            </div>
          ) : pagesData?.pages && pagesData.pages.length > 0 ? (
            <PagesTable
              data={pagesData.pages}
              onPageSelect={handlePageSelect}
              isLoading={false}
              loadingPageUrl={loadingPageUrl}
              isQueriesLoading={isLoadingQueries && !!selectedPage}
              dateRange={pagesData?.dateRange}
              days={days}
              onDateChange={handleDateRangeChange}
              onRefresh={handleRefresh}
              isRefreshing={isRefreshing || isLoadingPages}
            />
          ) : (
            <div className="text-center py-16">
              <AlertCircle className="h-8 w-8 mx-auto mb-4 text-gray-400" />
              <p className="text-sm font-light text-gray-600">
                No pages data available for the selected date range.
              </p>
            </div>
          )}
        </>
      )}

      {activeGscSubTab === 'blog-performance' && (
        <BlogPerformancePanel days={days} />
      )}

    </div>
  </div>
);
};

export default GSCAnalyticsView;
