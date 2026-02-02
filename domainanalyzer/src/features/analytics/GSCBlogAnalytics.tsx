import React, { useState, useEffect, useCallback } from 'react';
import { 
  BarChart3, 
  TrendingUp, 
  Eye, 
  MousePointer, 
  Target,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  ExternalLink,
  Loader2,
  XCircle
} from 'lucide-react';
import D3LineChart from '@/components/charts/D3LineChart';
import D3BarChart from '@/components/charts/D3BarChart';
import D3GaugeChart from '@/components/charts/D3GaugeChart';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

interface BlogPerformance {
  id: number;
  url: string;
  title: string;
  primaryKeyword?: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface DateBreakdown {
  date: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface AggregateData {
  totalClicks: number;
  totalImpressions: number;
  avgCTR: number;
  avgPosition: number;
  blogs: BlogPerformance[];
  topPerformingBlogs: BlogPerformance[];
  dateBreakdown: DateBreakdown[];
  dateRange: { startDate: string; endDate: string };
  totalBlogsAnalyzed: number;
}

interface DomainMatchResult {
  match: boolean;
  reason: string;
  wordpressDomain: string | null;
  gscDomain: string | null;
}

const GSCBlogAnalytics: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [domainMatch, setDomainMatch] = useState<DomainMatchResult | null>(null);
  const [aggregateData, setAggregateData] = useState<AggregateData | null>(null);
  const [selectedBlog, setSelectedBlog] = useState<BlogPerformance | null>(null);
  const [dateRange, setDateRange] = useState(28);

  const fetchDomainMatch = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/blog-analytics/check-domain-match`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` }
      });
      const data = await response.json();
      if (data.success) {
        setDomainMatch(data);
      }
      return data;
    } catch (err) {
      console.error('Error checking domain match:', err);
      return null;
    }
  }, []);

  const fetchAggregateData = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/blog-analytics/aggregate?days=${dateRange}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` }
      });
      const data = await response.json();
      if (data.success) {
        setAggregateData(data);
      } else {
        setError(data.error || 'Failed to fetch analytics');
      }
    } catch (err) {
      console.error('Error fetching aggregate data:', err);
      setError('Failed to fetch analytics data');
    }
  }, [dateRange]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    const matchResult = await fetchDomainMatch();
    
    if (matchResult?.match) {
      await fetchAggregateData();
    }
    
    setLoading(false);
  }, [fetchDomainMatch, fetchAggregateData]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = () => {
    loadData();
  };

  const handleBlogClick = (blog: BlogPerformance) => {
    setSelectedBlog(blog);
  };

  // Render loading state
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="w-10 h-10 animate-spin text-purple-600 mb-4" />
        <p className="text-gray-600">Loading analytics...</p>
      </div>
    );
  }

  // Render domain mismatch or not connected states
  if (domainMatch && !domainMatch.match) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-8">
        <div className="flex items-start gap-4">
          {domainMatch.reason === 'wordpress_not_connected' ? (
            <>
              <div className="p-3 rounded-full bg-amber-100">
                <AlertCircle className="w-6 h-6 text-amber-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">WordPress Not Connected</h3>
                <p className="text-gray-600 mb-4">
                  Connect your WordPress site to start tracking published blog performance.
                </p>
                <a 
                  href="/newdashboard?tab=publish" 
                  className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                >
                  Connect WordPress <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            </>
          ) : domainMatch.reason === 'gsc_not_connected' ? (
            <>
              <div className="p-3 rounded-full bg-amber-100">
                <AlertCircle className="w-6 h-6 text-amber-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Google Search Console Not Connected</h3>
                <p className="text-gray-600 mb-4">
                  Connect Google Search Console to view performance analytics for your published blogs.
                </p>
                <p className="text-sm text-gray-500 mb-4">
                  WordPress Domain: <span className="font-mono bg-gray-100 px-2 py-0.5 rounded">{domainMatch.wordpressDomain}</span>
                </p>
                <a 
                  href="/newdashboard?tab=analytics&subtab=integration" 
                  className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                >
                  Connect GSC <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            </>
          ) : (
            <>
              <div className="p-3 rounded-full bg-red-100">
                <XCircle className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Domain Mismatch</h3>
                <p className="text-gray-600 mb-4">
                  Your WordPress site and Google Search Console property are connected to different domains.
                </p>
                <div className="space-y-2 mb-4">
                  <p className="text-sm text-gray-600">
                    WordPress: <span className="font-mono bg-gray-100 px-2 py-0.5 rounded">{domainMatch.wordpressDomain}</span>
                  </p>
                  <p className="text-sm text-gray-600">
                    GSC Property: <span className="font-mono bg-gray-100 px-2 py-0.5 rounded">{domainMatch.gscDomain}</span>
                  </p>
                </div>
                <p className="text-sm text-gray-500">
                  Please ensure both integrations are connected to the same domain to view blog analytics.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // Render error state
  if (error) {
    return (
      <div className="rounded-2xl border border-red-100 bg-red-50 p-8 text-center">
        <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-red-800 mb-2">Error Loading Analytics</h3>
        <p className="text-red-600 mb-4">{error}</p>
        <button 
          onClick={handleRefresh}
          className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
        >
          <RefreshCw className="w-4 h-4" /> Try Again
        </button>
      </div>
    );
  }

  // No data state
  if (!aggregateData || aggregateData.totalBlogsAnalyzed === 0) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-8">
        <div className="text-center py-8">
          <BarChart3 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Published Blogs Found</h3>
          <p className="text-gray-600 mb-4">
            Publish your first blog to start tracking its performance in Google Search Console.
          </p>
          <div className="flex items-center justify-center gap-2 text-sm text-green-600 mb-4">
            <CheckCircle2 className="w-4 h-4" />
            <span>Domains matched: {domainMatch?.wordpressDomain}</span>
          </div>
          <a 
            href="/newdashboard?tab=publish" 
            className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
          >
            Publish Your First Blog <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>
    );
  }

  // Prepare chart data
  const clicksData = aggregateData.dateBreakdown.map(d => ({
    date: d.date,
    value: d.clicks
  }));

  const impressionsData = aggregateData.dateBreakdown.map(d => ({
    date: d.date,
    value: d.impressions
  }));

  const blogBarData = aggregateData.topPerformingBlogs.map(blog => ({
    label: blog.title || blog.url.split('/').pop() || 'Unknown',
    value: blog.clicks,
    id: blog.id
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-light text-gray-900">Published Blog Analytics</h2>
          <div className="flex items-center gap-2 mt-1">
            <CheckCircle2 className="w-4 h-4 text-green-500" />
            <span className="text-sm text-gray-600">
              Tracking {aggregateData.totalBlogsAnalyzed} published blogs on {domainMatch?.wordpressDomain}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(Number(e.target.value))}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            <option value={7}>Last 7 days</option>
            <option value={28}>Last 28 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          <button
            onClick={handleRefresh}
            className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <RefreshCw className="w-4 h-4 text-gray-600" />
          </button>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl border border-gray-100 bg-white p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-purple-100">
              <MousePointer className="w-5 h-5 text-purple-600" />
            </div>
            <span className="text-sm text-gray-600">Total Clicks</span>
          </div>
          <p className="text-2xl font-semibold text-gray-900">
            {aggregateData.totalClicks.toLocaleString()}
          </p>
        </div>

        <div className="rounded-xl border border-gray-100 bg-white p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-blue-100">
              <Eye className="w-5 h-5 text-blue-600" />
            </div>
            <span className="text-sm text-gray-600">Impressions</span>
          </div>
          <p className="text-2xl font-semibold text-gray-900">
            {aggregateData.totalImpressions.toLocaleString()}
          </p>
        </div>

        <div className="rounded-xl border border-gray-100 bg-white p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-green-100">
              <TrendingUp className="w-5 h-5 text-green-600" />
            </div>
            <span className="text-sm text-gray-600">Avg CTR</span>
          </div>
          <p className="text-2xl font-semibold text-gray-900">
            {(aggregateData.avgCTR * 100).toFixed(2)}%
          </p>
        </div>

        <div className="rounded-xl border border-gray-100 bg-white p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-amber-100">
              <Target className="w-5 h-5 text-amber-600" />
            </div>
            <span className="text-sm text-gray-600">Avg Position</span>
          </div>
          <p className="text-2xl font-semibold text-gray-900">
            {aggregateData.avgPosition.toFixed(1)}
          </p>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Line Chart - Performance Over Time */}
        <div className="rounded-xl border border-gray-100 bg-white p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Performance Trend</h3>
          <div className="overflow-x-auto">
            <D3LineChart
              data={clicksData}
              secondaryData={impressionsData}
              width={500}
              height={280}
              primaryColor="#8b5cf6"
              secondaryColor="#3b82f6"
              primaryLabel="Clicks"
              secondaryLabel="Impressions"
            />
          </div>
        </div>

        {/* Bar Chart - Top Blogs */}
        <div className="rounded-xl border border-gray-100 bg-white p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Top Performing Blogs</h3>
          <div className="overflow-x-auto">
            <D3BarChart
              data={blogBarData}
              width={500}
              height={280}
              horizontal
              gradientColors={['#8b5cf6', '#c084fc']}
              onBarClick={(item) => {
                const blog = aggregateData.blogs.find(b => b.id === item.id);
                if (blog) handleBlogClick(blog);
              }}
            />
          </div>
        </div>
      </div>

      {/* Gauges Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="rounded-xl border border-gray-100 bg-white p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4 text-center">Click-Through Rate</h3>
          <div className="flex justify-center">
            <D3GaugeChart
              value={aggregateData.avgCTR * 100}
              maxValue={10}
              label="CTR Performance"
              unit="%"
              size={220}
              colorRanges={[
                { min: 0, max: 1, color: '#ef4444' },
                { min: 1, max: 3, color: '#f59e0b' },
                { min: 3, max: 10, color: '#22c55e' }
              ]}
            />
          </div>
        </div>

        <div className="rounded-xl border border-gray-100 bg-white p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4 text-center">Average Position</h3>
          <div className="flex justify-center">
            <D3GaugeChart
              value={Math.min(aggregateData.avgPosition, 100)}
              maxValue={100}
              label="Lower is Better"
              unit=""
              size={220}
              colorRanges={[
                { min: 0, max: 10, color: '#22c55e' },
                { min: 10, max: 30, color: '#f59e0b' },
                { min: 30, max: 100, color: '#ef4444' }
              ]}
            />
          </div>
        </div>
      </div>

      {/* Blog Details Table */}
      <div className="rounded-xl border border-gray-100 bg-white p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">All Published Blogs</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-gray-500 border-b border-gray-100">
                <th className="py-3 pr-4">Title</th>
                <th className="py-3 pr-4">Keyword</th>
                <th className="py-3 pr-4 text-right">Clicks</th>
                <th className="py-3 pr-4 text-right">Impressions</th>
                <th className="py-3 pr-4 text-right">CTR</th>
                <th className="py-3 text-right">Position</th>
              </tr>
            </thead>
            <tbody>
              {aggregateData.blogs.map((blog) => (
                <tr 
                  key={blog.id} 
                  className="border-b border-gray-50 hover:bg-gray-50/50 cursor-pointer transition-colors"
                  onClick={() => handleBlogClick(blog)}
                >
                  <td className="py-3 pr-4">
                    <div className="max-w-[200px] truncate font-medium text-gray-900" title={blog.title}>
                      {blog.title || 'Untitled'}
                    </div>
                    <div className="text-xs text-gray-500 truncate max-w-[200px]" title={blog.url}>
                      {blog.url}
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-gray-600">{blog.primaryKeyword || '—'}</td>
                  <td className="py-3 pr-4 text-right font-medium text-purple-600">
                    {blog.clicks.toLocaleString()}
                  </td>
                  <td className="py-3 pr-4 text-right text-gray-600">
                    {blog.impressions.toLocaleString()}
                  </td>
                  <td className="py-3 pr-4 text-right text-gray-600">
                    {(blog.ctr * 100).toFixed(2)}%
                  </td>
                  <td className="py-3 text-right">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      blog.position <= 10 ? 'bg-green-100 text-green-700' :
                      blog.position <= 30 ? 'bg-amber-100 text-amber-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {blog.position.toFixed(1)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Selected Blog Detail Modal */}
      {selectedBlog && (
        <div 
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedBlog(null)}
        >
          <div 
            className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-4">{selectedBlog.title}</h3>
            <div className="space-y-3 mb-4">
              <p className="text-sm text-gray-500 break-all">{selectedBlog.url}</p>
              {selectedBlog.primaryKeyword && (
                <p className="text-sm">
                  <span className="text-gray-500">Target Keyword:</span>{' '}
                  <span className="font-medium">{selectedBlog.primaryKeyword}</span>
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="text-center p-4 bg-purple-50 rounded-xl">
                <p className="text-2xl font-bold text-purple-600">{selectedBlog.clicks}</p>
                <p className="text-sm text-gray-600">Clicks</p>
              </div>
              <div className="text-center p-4 bg-blue-50 rounded-xl">
                <p className="text-2xl font-bold text-blue-600">{selectedBlog.impressions}</p>
                <p className="text-sm text-gray-600">Impressions</p>
              </div>
              <div className="text-center p-4 bg-green-50 rounded-xl">
                <p className="text-2xl font-bold text-green-600">{(selectedBlog.ctr * 100).toFixed(2)}%</p>
                <p className="text-sm text-gray-600">CTR</p>
              </div>
              <div className="text-center p-4 bg-amber-50 rounded-xl">
                <p className="text-2xl font-bold text-amber-600">{selectedBlog.position.toFixed(1)}</p>
                <p className="text-sm text-gray-600">Avg Position</p>
              </div>
            </div>
            <div className="flex gap-3">
              <a
                href={selectedBlog.url}
                target="_blank"
                rel="noreferrer"
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
              >
                View Live <ExternalLink className="w-4 h-4" />
              </a>
              <button
                onClick={() => setSelectedBlog(null)}
                className="px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GSCBlogAnalytics;
