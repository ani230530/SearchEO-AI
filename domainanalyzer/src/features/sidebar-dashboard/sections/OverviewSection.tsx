import { PDFDownloadLink } from "@react-pdf/renderer";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogOverlay,
  AlertDialogTitle,
} from "@radix-ui/react-alert-dialog";
import {
  ArrowRight,
  ChartNoAxesCombined,
  ChevronRight,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { logoUrl as logoUrlHelper } from "@/lib/logoUrl";
import GSCAnalyticsView from "@/components/gsc/GSCAnalyticsView";
import { AlertDialogHeader } from "@/components/ui/alert-dialog";
import { OverallScoreGauge } from "@/components/audit/AuditCharts";
import { AuditPDF } from "@/components/audit/AuditPDF";
import { cn } from "@/lib/utils";
import D3LineChart from "@/components/charts/D3LineChart";
import type { GscSubTabId, OverviewSectionProps } from "@/features/sidebar-dashboard/types";
import { getStoredActiveTab } from "@/features/sidebar-dashboard/utils";
import { TabId, CompanySubTabId } from "@/features/sidebar-dashboard/types";
import TrendsChart from "@/components/gsc/TrendsChart";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Plug } from "lucide-react";
import { useMemo } from "react";
import { useBlogAnalyticsAggregate, useGscStatus } from "@/features/sidebar-dashboard/queries";

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

export function OverviewSection({
  auditComplete,
  auditLoading,
  auditResult,
  campaignsCount,
  companyDomain,
  hasWordpressIntegration,
  competitorOverview,
  keywordsTableData,
  normalizedDomain,
  onAddDomain,
  onAuditModalOpenChange,
  onOpenAnalytics,
  onOpenAuditDetails,
  onOpenProjects,
  onOpenIntegration,
  onRunAudit,
  onViewReport,
  onVisitSite,
  overallScore,
}: OverviewSectionProps) {
  const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3002';
  const navigate = useNavigate();

  const getAuthHeaders = () => {
    const token = localStorage.getItem('authToken');
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  };

  const [aggregateData, setAggregateData] = useState<AggregateData | null>(null);
  const [showAuditModal, setShowAuditModal] = useState(false);
  const resultsRef = useRef<HTMLDivElement | null>(null);
  const [activeCompanySubTab, setActiveCompanySubTab] =
      useState<CompanySubTabId>("company-info");
  
 const handleViewReport = () => {
    setShowAuditModal(false);
    setTimeout(() => {
      resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 220);
  };


  const [activeTab, setActiveTab] = useState<TabId>(() =>
    getStoredActiveTab(localStorage.getItem("activeTab"))
  );
  useEffect(() => {
    if (activeTab) {
      localStorage.setItem("activeTab", activeTab);
    }
  }, [activeTab]);

const clicksData = aggregateData?.dateBreakdown.map(d => ({
  date: d.date,
  value: d.clicks
})) ?? [];

const impressionsData = aggregateData?.dateBreakdown.map(d => ({
  date: d.date,
  value: d.impressions
})) ?? [];

const [topPageUrl, setTopPageUrl] = useState<string | null>(null);

// GSC connection check goes through the shared cache so it doesn't refetch
// every time the user pops back into Overview.
const gscStatusQuery = useGscStatus();
const gscConnected = Boolean(gscStatusQuery.data?.connected);

// Fetch top page
const { data: pagesData } = useQuery({
  queryKey: ['gscPagesOverview'],
  queryFn: async () => {
    const response = await fetch(`${API_BASE_URL}/api/gsc/pages?days=28`, {
      headers: getAuthHeaders(),
    });
    return response.json();
  },
  enabled: gscConnected,
});

useEffect(() => {
  if (pagesData?.success && pagesData?.pages?.length > 0) {
    const topPage = [...pagesData.pages].sort((a, b) => (b.clicks || 0) - (a.clicks || 0))[0];
    setTopPageUrl(topPage.page);
  }
}, [pagesData]);

// Fetch trends
const { data: trendsData, isLoading: isLoadingTrends } = useQuery({
  queryKey: ['gscOverviewTrends', topPageUrl],
  queryFn: async () => {
    const encodedPageUrl = encodeURIComponent(topPageUrl!);
    const response = await fetch(
      `${API_BASE_URL}/api/gsc/pages/${encodedPageUrl}/queries?days=28&includeDateBreakdown=true`,
      { headers: getAuthHeaders() }
    );
    return response.json();
  },
  enabled: gscConnected && !!topPageUrl,
});

const topQueries = useMemo(() => {
  if (!trendsData?.queries) return [];
  return [...trendsData.queries]
    .sort((a, b) => (b.clicks || 0) - (a.clicks || 0))
    .slice(0, 5)
    .map(q => q.query);
}, [trendsData]);

const formattedTrendsData = useMemo(() => {
  if (!trendsData?.dateBreakdown || !topQueries.length) return [];
  const result: any[] = [];
  topQueries.forEach(query => {
    const queryData = trendsData.dateBreakdown[query];
    if (queryData) {
      Object.entries(queryData).forEach(([date, metrics]: [string, any]) => {
        result.push({ query, date, ...metrics });
      });
    }
  });
  return result;
}, [trendsData, topQueries]);

const blogAnalyticsQuery = useBlogAnalyticsAggregate(28);
const blogAggregateData: AggregateData | null =
  blogAnalyticsQuery.data && blogAnalyticsQuery.data.success ? blogAnalyticsQuery.data : null;
const isLoadingBlogData = blogAnalyticsQuery.isLoading;

// Prepare blog chart data. Memoized so unrelated parent re-renders don't
// hand the chart components a new array identity and force a fresh layout
// pass over up to 28 data points.
const blogClicksData = useMemo(
  () => blogAggregateData?.dateBreakdown.map((d) => ({ date: d.date, value: d.clicks })) ?? [],
  [blogAggregateData],
);

const blogImpressionsData = useMemo(
  () => blogAggregateData?.dateBreakdown.map((d) => ({ date: d.date, value: d.impressions })) ?? [],
  [blogAggregateData],
);

const recentActivities = [
  { title: 'Published "Ultimate Guide to SEO"', time: "less than a minute ago" },
  { title: 'Edited "Keyword Research Tips"', time: "about 1 hour ago" },
  { title: 'Generated "Link Building Strategies"', time: "about 1 hour ago" },
  { title: "Added 15 new keywords", time: "about 1 hour ago" },
  { title: "Generated subpages from top keywords", time: "about 1 hour ago" },
];

const suggestedActions = [
  {
    title: "Publish-Ready Blog",
    subtitle: "These blogs have been reviewed and are ready to go live",
    icon: "/suggested-actions/send-01.svg",
    tone: "warning" as const,
    onClick: onOpenProjects,
  },
  {
    title: "Integrate your website",
    subtitle: "Enable one-click publishing to your site",
    icon: "/suggested-actions/wordpress.svg",
    tone: "danger" as const,
    onClick: onOpenIntegration,
  },
  {
    title: "Connect Google Search Console",
    subtitle: "Enable Google Search Console to fetch data",
    icon: "/suggested-actions/google-search-console.svg",
    tone: "danger" as const,
    onClick: onOpenIntegration,
  },
  {
    title: "Optimize 2 Blogs",
    subtitle: "Optimize content to improve search rankings",
    icon: "/suggested-actions/improve-relevance.svg",
    tone: "default" as const,
    onClick: onOpenProjects,
  },
  {
    title: "Create Pages from Top Keywords",
    subtitle: "Create supporting content to boost your pillar pages",
    icon: "/suggested-actions/open-file-folder.svg",
    tone: "default" as const,
    onClick: onOpenProjects,
  },
];

const [isPageLoading, setIsPageLoading] = useState(true);

useEffect(() => {
  // The previous guard required keywordsTableData.length > 0 — but an empty
  // keywords list is a legitimate state (new users, or company domains with
  // no tracked keywords yet) and the page would spin forever waiting. Drop
  // that check; the other async sources (audit, GSC trends, blog analytics)
  // are sufficient to gate the loading screen.
  const auditReady = !!auditResult || !auditLoading;
  const gscReady = !isLoadingTrends;
  const blogReady = !isLoadingBlogData;

  if (auditReady && gscReady && blogReady) {
    setIsPageLoading(false);
  }
}, [auditResult, auditLoading, isLoadingTrends, isLoadingBlogData]);

  return (
    <>
    {isPageLoading ? (
       <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center space-y-4">
          <Loader2 className="h-12 w-12 animate-spin mx-auto text-gray-400" />
          <div>
            <h3 className="text-lg font-medium text-gray-900">Loading Overview</h3>
            <p className="text-sm text-gray-500 mt-1">Preparing your dashboard...</p>
          </div>
        </div>
      </div>
    ) : (
    <div className="w-full min-w-7xl mx-auto px-4 sm:px-6 py-4 space-y-6">
      <div className="relative overflow-hidden rounded-xl border border-gray-200 bg-[#f9f9f9]">
        <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full blur-3xl" />
        <p className="pl-4 pt-4 text-base text-[#717680]">Free website audit</p>
        <div className="relative p-4 sm:p-4">
          <div className="w-full min-w-0">
            <h1 className="text-3xl sm:text-3xl font-bold text-[#2D4058] leading-tight">
              Deep scan your site for SEO, speed and visibility gaps in seconds.
            </h1>
            <p className="pt-4 text-base text-[#717680]">
              Scan your website to uncover SEO issues, improve performance, and boost search visibility with actionable insights.
            </p>
          </div>

          <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-3 border border-gray-200 bg-white px-4 sm:px-5 py-3 rounded-xl">
              {companyDomain ? (
                <>
                  <img
                    src={logoUrlHelper(normalizedDomain, 128) ?? ""}
                    alt="Company logo"
                    width={32}
                    height={32}
                    className="w-8 h-8 rounded-md"
                    loading="lazy"
                  />
                  <span className="font-medium text-base sm:text-lg tracking-tight break-all text-blue-600">
                    <a
                      href={companyDomain.startsWith("http") ? companyDomain : `https://${companyDomain}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline"
                    >
                      {companyDomain.replace(/^https?:\/\//, "").replace(/^www\./, "")}
                    </a>
                  </span>
                </>
              ) : (
                <span className="font-medium text-base sm:text-lg tracking-tight text-blue-600">
                  https://domain.com/
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                onAddDomain?.();
                navigate("/ai-checker-v2");
              }}
              className="inline-flex shrink-0 items-center gap-2 rounded-[10px] bg-[#334155] px-4 py-3 text-[13px] font-medium text-white transition-colors hover:bg-[#1f2937]"
            >
              <span className="text-base leading-none">+</span>
              Add New Domain
            </button>
          </div>
        </div>
      </div>

      <div className="w-full flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-4">
        <div className="text-xl font-bold text-gray-900">Overview</div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={onVisitSite}
            className="inline-flex items-center gap-1 px-2 py-2 text-sm font-medium text-[#4E76C7] rounded-lg hover:underline transition"
          >
            <img
              src="https://res.cloudinary.com/dgfzjdi68/image/upload/v1775205399/gridicons_external_y0240k.png"
              alt="Visit Site"
              className="w-4 h-4"
            />
            <span className="font-medium">Visit Site</span>
          </button>

          <button
            onClick={onOpenAnalytics}
            className="inline-flex items-center gap-1 px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100 transition"
          >
            <img
              src="https://res.cloudinary.com/dgfzjdi68/image/upload/v1775224313/uil_chart-growth_v4botd.png"
              alt="Analytics"
              className="w-4 h-4"
            />
            Analytics
          </button>

          <button className="inline-flex items-center gap-1 px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100 transition">
            <img
              src="https://res.cloudinary.com/dgfzjdi68/image/upload/v1775224439/calendar_jb8btr.png"
              alt="Select Duration"
              className="w-4 h-4"
            />
            Select Duration
          </button>
        </div>
      </div>
{/* ===================== SNAPSHOT ===================== */}
  <div className="grid grid-cols-1 lg:grid-cols-1 gap-6">

  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
  {[
    ["Ranking Keywords", keywordsTableData.length, "https://res.cloudinary.com/dgfzjdi68/image/upload/v1775648922/Frame_1321316715_sku1sv.png"],
    ["Projects", campaignsCount, "https://res.cloudinary.com/dgfzjdi68/image/upload/v1776261732/Frame_1321316715_1_xpevty.png"],
    ["WordPress", hasWordpressIntegration ? "Connected" : "Not connected", "https://res.cloudinary.com/dgfzjdi68/image/upload/v1775648922/Frame_1321316715_sku1sv.png"],
    ["Integrations", hasWordpressIntegration ? "WordPress" : "—", "https://res.cloudinary.com/dgfzjdi68/image/upload/v1775648922/Frame_1321316715_sku1sv.png"],
  ].map(([label, value, img]) => {
    const isConnected =
      value === "Connected" || value === "Disconnected";

    return (
      <div
        key={label}
        className="group rounded-2xl border border-gray-200 bg-white p-4 flex items-center gap-3 hover:shadow-sm transition min-w-0"
      >
        {/* Left Image */}
        <img
          src={img}
          alt={`${label} icon`}
          className="w-10 h-10 object-contain"
        />

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="text-xs uppercase tracking-wide text-gray-500">
            {label}
          </div>

          <div className="mt-1 flex items-center justify-between">
            <div
              className={cn(
                "text-xl sm:text-2xl font-medium break-words",
                isConnected
                  ? "text-green-600"
                  : "text-gray-900"
              )}
            >
              {value}
            </div>

            {isConnected && (
              <span className="flex items-center gap-1 text-xs font-medium text-green-600">
                <span className="h-2 w-2 rounded-full bg-green-500" />
              </span>
            )}
          </div>
        </div>
      </div>
    );
  })}
</div>
  </div>

          {/* ===================== KPI GRID ===================== */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        
         {/* Audit Completed Modal */}
                      {showAuditModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center">
          <div className="max-w-md w-full rounded-2xl bg-white shadow-2xl">
                      <AlertDialog open={showAuditModal} onOpenChange={setShowAuditModal}>
                        <AlertDialogOverlay className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40" />
                        <AlertDialogContent className=" fixed left-1/2 top-1/2 z-50
            -translate-x-1/2 -translate-y-1/2
            max-w-md w-full
            rounded-2xl
            bg-white
            border border-gray-200
            shadow-2xl
            animate-in fade-in zoom-in-95">
                          <div className="p-4 rounded-lg bg-gradient-to-r from-white/80 to-gray-50 border border-gray-200">
                            <AlertDialogHeader>
                              <AlertDialogTitle className="text-2xl font-medium">Audit Completed</AlertDialogTitle>
                              <AlertDialogDescription className="text-sm text-muted-foreground">
                                Your domain audit has finished. Here's a quick summary — you can view the full report or download it.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
        
                            <div className="mt-4 flex items-center gap-4">
                              <div className="flex-shrink-0">
                                <OverallScoreGauge score={Math.round(((auditResult?.performance||0)+(auditResult?.seo||0)+(auditResult?.accessibility||0)+(auditResult?.bestPractices||0))/4*100)/100 || 0} />
                              </div>
                              <div className="flex-1">
                                <div className="text-sm text-gray-600 mb-2">Top category</div>
                                <div className="text-base font-medium text-gray-900">
                                  {auditResult ? (
                                    (() => {
                                      const cats = [
                                        { k: 'Performance', v: auditResult.performance },
                                        { k: 'SEO', v: auditResult.seo },
                                        { k: 'Accessibility', v: auditResult.accessibility },
                                        { k: 'Best Practices', v: auditResult.bestPractices },
                                      ];
                                      const scored = cats.map(c => ({ ...c, s: Math.round((c.v||0)*100) }));
                                      const best = scored.reduce((a,b)=> b.s > a.s ? b : a, scored[0]);
                                      return `${best.k} — ${best.s}%`;
                                    })()
                                  ) : '—'}
                                </div>
                                <div className="text-xs text-gray-500 mt-2">Click below to view the full interactive report.</div>
                              </div>
                            </div>
        
                            <div className="mt-6 flex items-center justify-end gap-2">
                              {auditResult && companyDomain && (
                                <PDFDownloadLink
                                  document={<AuditPDF data={auditResult} domain={companyDomain} />}
                                  fileName={`audit-${companyDomain}-${new Date().toISOString().split('T')[0]}.pdf`}
                                  className="px-4 py-2 rounded-full border border-gray-200 text-sm font-light bg-white hover:bg-gray-50 flex items-center justify-center"
                                >
                                  {({ loading }) => (loading ? 'Preparing...' : 'Export PDF')}
                                </PDFDownloadLink>
                              )}
                              <AlertDialogAction onClick={handleViewReport} className="px-4 py-2 rounded-full bg-black text-white text-sm">View Full Report</AlertDialogAction>
                              <AlertDialogCancel className="px-4 py-2 rounded-full border border-gray-200 text-sm">Close</AlertDialogCancel>
                            </div>
                          </div>
                        </AlertDialogContent>
                      </AlertDialog>
                        </div>
        </div>
        )}
              {/* Audit Summary */}
           <div className="lg:col-span-1 rounded-xl bg-white border border-gray-200 p-4 sm:p-6 shadow-sm transition-shadow duration-300 overflow-hidden">
          {/* Header */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
            <div className="min-w-0">
              <h3 className="text-2xl sm:text-3xl font-medium text-gray-900 break-words">
                Audit Summary
              </h3>
              <p className="text-xs text-gray-400">
                Lighthouse performance breakdown
              </p>
            </div>
        
            <button
          onClick={onOpenAuditDetails}
          className="group text-sm font-medium text-black  transition-colors duration-200 flex items-center gap-1 hover:underline"
        >
          View Details
          <span className="relative flex items-center w-4 h-4">
            <ChevronRight
              className="absolute inset-0 w-4 h-4 transition-all duration-200 ease-in-out group-hover:opacity-0 group-hover:translate-x-1"
            />
            <ArrowRight
              className="absolute inset-0 w-4 h-4 opacity-0 transition-all duration-200 ease-in-out group-hover:opacity-100 group-hover:translate-x-0"
            />
          </span>
        </button>
          </div>
        
          {!auditResult ? (
          <p className="text-sm text-gray-500">
            Run an audit to view performance metrics.
          </p>
        ) : (
        <div className="flex flex-col 2xl:flex-row gap-4 sm:gap-6 min-w-0 pt-6">
          {/* LEFT: 4 metric cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 flex-1 min-w-0">
            {[
              ["Performance", auditResult.performance],
              ["SEO", auditResult.seo],
              ["Accessibility", auditResult.accessibility],
              ["Best Practices", auditResult.bestPractices],
            ].map(([label, value]) => {
              const pct = Math.round((value || 0) * 100);
        
              return (
                <div
          key={label}
          className="rounded-xl p-3 sm:p-4 bg-white shadow-md flex items-center gap-3 sm:gap-4 min-w-0 w-full overflow-hidden"
        >
          {/* Left Icon */}
          <ChartNoAxesCombined className="w-6 h-6 text-gray-500 shrink-0" />
        
          {/* Right Content */}
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-sm text-gray-600 leading-tight break-words">
              {label}
            </span>
        
            <span className="text-lg sm:text-2xl font-semibold text-gray-900 leading-tight">
              {pct}%
            </span>
          </div>
        </div>
              );
            })}
          </div>
        
          {/* RIGHT: Overall Score */}
          <div className="w-full 2xl:w-auto rounded-xl p-2 sm:p-4 flex flex-col items-center justify-center shrink-0">
            <OverallScoreGauge
              size={160}
              score={
                (
                  auditResult.performance +
                  auditResult.seo +
                  auditResult.accessibility +
                  auditResult.bestPractices
                ) / 4
              }
            />
        
            
          </div>
        </div>
        )}
        </div>
        {/* Performance over Time - Blog Analytics */}
<div className="lg:col-span-1 rounded-xl bg-white border border-gray-200 p-6 shadow-sm transition-shadow duration-300">
  <div className="flex items-center justify-between mb-4">
    <div>
      <h3 className="text-3xl font-medium text-gray-900"> Performance</h3>
      <p className="text-xs text-gray-400">
        {blogAggregateData && blogAggregateData.totalBlogsAnalyzed > 0
          ? `Tracking ${blogAggregateData.totalBlogsAnalyzed} published blogs`
          : "No blogs published yet"}
      </p>
    </div>
  </div>

  {isLoadingBlogData ? (
    <div className="space-y-4">
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-3">
          <Loader2 className="h-10 w-10 animate-spin mx-auto text-gray-400" />
          <p className="text-sm text-gray-500">Loading performance data...</p>
        </div>
      </div>
    </div>
  ) : blogAggregateData && blogAggregateData.dateBreakdown.length > 0 ? (
    <D3LineChart
      data={blogClicksData}
      secondaryData={blogImpressionsData}
      width={500}
      height={180}
      primaryColor="#111111"
      secondaryColor="#4E76C7"
      primaryLabel="Clicks"
      secondaryLabel="Impressions"
    />
  ) : (
    <div className="flex h-64 items-center justify-center">
      <p className="text-sm text-gray-500">
        No performance data yet. Publish few blogs to start tracking trends.
      </p>
    </div>
  )}

      {/* Mini stats below the chart */}
      {/* <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-3 gap-4">
        <div>
          <p className="text-xs text-gray-500">Total Clicks</p>
          <p className="text-lg font-semibold text-gray-900">
            {blogAggregateData.totalClicks.toLocaleString()}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Avg CTR</p>
          <p className="text-lg font-semibold text-gray-900">
            {(blogAggregateData.avgCTR * 100).toFixed(2)}%
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Avg Position</p>
          <p className="text-lg font-semibold text-gray-900">
            {blogAggregateData.avgPosition.toFixed(1)}
          </p>
        </div>
      </div> */}
</div>
</div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Opportunities Card */}
        <div className="rounded-xl bg-white border border-gray-200 p-6 transition">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-3xl font-medium text-gray-900">
              Top Opportunities
            </h3>
            <div
          className="group text-sm font-medium text-black  transition-colors duration-200 flex items-center gap-1 hover:underline"
          onClick={onOpenAnalytics}
        >
          View Details
          <span className="relative flex items-center w-4 h-4">
            <ChevronRight
              className="absolute inset-0 w-4 h-4 transition-all duration-200 ease-in-out group-hover:opacity-0 group-hover:translate-x-1"
            />
            <ArrowRight
              className="absolute inset-0 w-4 h-4 opacity-0 transition-all duration-200 ease-in-out group-hover:opacity-100 group-hover:translate-x-0"
            />
          </span>
        </div>
          </div>
        
          <div className="space-y-4">
            {keywordsTableData
              .slice()
              .sort((a, b) => (b.volume || 0) - (a.volume || 0)) 
              .slice(0, 7) 
              .map((item, idx) => (
                <div key={idx} className="flex items-center justify-between">
                  <div>
                    <div className="text-lg font-medium text-gray-700"> 
                      {item?.keyword.charAt(0).toUpperCase() + item?.keyword.slice(1)|| "No keywords yet"}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      High potential growth keyword
                    </div>
                  </div>
        
                  {/* Volume badge */}
                  <div className="px-3 py-2 rounded-3xl bg-green-50 flex items-center justify-center min-w-[50px]">
                    <span className="text-xs font-medium text-green-700">
                      {item?.volume
                        ? item.volume >= 10002
                          ? `${(item.volume / 1000).toFixed(1)}K`
                          : item.volume.toLocaleString()
                        : "-"}
                    </span>
                  </div>
                </div>
              ))}
          </div>
        </div>
        <div className="rounded-xl bg-white border border-gray-200 p-6 shadow-sm transition-shadow duration-300 h-full">
  <div className="flex items-center justify-between mb-4">
    <div>
      <h3 className="text-3xl font-medium text-gray-900">GSC Analytics</h3>
      <p className="text-xs text-gray-400">
        {gscConnected ? 'Top 5 queries performance trends' : 'Connect GSC to view analytics'}
      </p>
    </div>
  </div>

  <div className="w-full h-[400px]">
    {!gscConnected ? (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-3">
          <Plug className="h-8 w-8 mx-auto text-gray-400" />
          <p className="text-sm font-light text-gray-600">Google Search Console not connected</p>
        </div>
      </div>
    ) : isLoadingTrends ? (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-gray-400" />
          <p className="text-sm font-light text-gray-600">Loading trends data...</p>
        </div>
      </div>
    ) : !formattedTrendsData.length ? (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-3">
          <ChartNoAxesCombined className="h-8 w-8 mx-auto text-gray-400" />
          <p className="text-sm font-light text-gray-600">No trends data available</p>
        </div>
      </div>
    ) : (
      <TrendsChart
  data={formattedTrendsData}
  selectedMetrics={['clicks', 'impressions', 'ctr', 'position']}
  chartType="line"
  height={350}
/>
    )}
  </div>
</div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-xl bg-white border border-gray-200 p-4">
            <div className="flex items-start justify-between mb-4">
              <h3 className="text-[18px] leading-normal font-semibold text-[#414651]">Recent Activity</h3>
              <button className="text-xs font-normal text-[#2D4059] underline underline-offset-2">View All</button>
            </div>

            <div className="space-y-3">
              {recentActivities.map((activity, idx) => (
                <div
                  key={`${activity.title}-${idx}`}
                  className="bg-[#F9F9F9] rounded-lg px-5 py-3 shadow-sm"
                >
                  <p className="text-[15px] font-medium text-[#414651] leading-normal">{activity.title}</p>
                  <p className="text-xs text-[#2D4059] mt-1 leading-normal">{activity.time}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl bg-white border border-gray-200 p-4">
            <h3 className="text-[18px] leading-normal font-semibold text-[#414651] mb-4">Suggested Next Actions</h3>

            <div className="space-y-3">
              {suggestedActions.map((action, idx) => {
                const rowTone =
                  action.tone === "warning"
                    ? "bg-[#FFFEF2] border-l-[#F59E0B]"
                    : action.tone === "danger"
                    ? "bg-[#FFF2F2] border-l-[#B23131]"
                    : "bg-white border-l-[#A4A7AE]";

                const titleTone = action.tone === "danger" ? "text-[#B23131]" : "text-[#414651]";
                const subtitleTone = action.tone === "danger" ? "text-[#7C3636]" : "text-[#2D4059]";
                const iconWrapTone =
                  action.tone === "danger"
                    ? "border-[#F1D0D0] bg-[#FFF2F2]"
                    : action.tone === "warning"
                    ? "border-[#F2E5B9] bg-[#FFFEF2]"
                    : "border-gray-200 bg-white";

                return (
                  <div
                    key={`${action.title}-${idx}`}
                    role="button"
                    tabIndex={0}
                    onClick={action.onClick}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        action.onClick();
                      }
                    }}
                    className={cn(
                      "rounded-lg px-5 py-3 border-l-[3px] shadow-sm flex items-center gap-3 cursor-pointer transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#2D4059]",
                      rowTone
                    )}
                  >
                    <div className={cn("w-9 h-9 rounded-full border flex items-center justify-center shrink-0", iconWrapTone)}>
                      <img src={action.icon} alt="" className="w-6 h-6 object-contain" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-[15px] font-medium leading-normal", titleTone)}>{action.title}</p>
                      <p className={cn("text-xs leading-normal", subtitleTone)}>{action.subtitle}</p>
                    </div>
                    <ArrowRight className={cn("w-4 h-4 shrink-0", action.tone === "danger" ? "text-[#B23131]" : "text-[#2D4059]")} />
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-white border border-gray-200 p-6 shadow-sm transition-shadow duration-300">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h3 className="text-[18px] leading-normal font-semibold text-[#414651]">Competitor overview</h3>
            </div>
            <div className="relative w-full max-w-[260px]">
              <input
                type="text"
                placeholder="Find Keyword..."
                className="h-9 w-full rounded-lg border border-[#D0D5DD] bg-white pl-3 pr-3 text-sm text-[#344054] outline-none placeholder:text-[#98A2B3]"
                readOnly
              />
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-[#EAECF0]">
            <div className="grid grid-cols-[1.7fr_1fr_.8fr_1fr] bg-[#F2F4F7] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#475467]">
              <div>Domain</div>
              <div>Key words</div>
              <div>Overlap</div>
              <div>Est. Traffic</div>
            </div>

            <div className="divide-y divide-[#EAECF0] bg-white">
              {competitorOverview.loading && competitorOverview.rows.length === 0 ? (
                [0, 1, 2, 3].map((idx) => (
                  <div key={idx} className="grid grid-cols-[1.7fr_1fr_.8fr_1fr] items-center px-4 py-5 text-sm">
                    <div className="h-4 w-32 animate-pulse rounded bg-[#EAECF0]" />
                    <div className="h-4 w-20 animate-pulse rounded bg-[#EAECF0]" />
                    <div className="h-5 w-12 animate-pulse rounded-full bg-[#EAECF0]" />
                    <div className="h-4 w-24 animate-pulse rounded bg-[#EAECF0]" />
                  </div>
                ))
              ) : competitorOverview.error && competitorOverview.rows.length === 0 ? (
                <div className="px-4 py-8 text-sm text-[#667085]">
                  {competitorOverview.error}
                </div>
              ) : competitorOverview.rows.length === 0 ? (
                <div className="px-4 py-8 text-sm text-[#667085]">
                  No competitor overview data available yet.
                </div>
              ) : (
                competitorOverview.rows.map((row) => (
                  <div key={row.domain} className="grid grid-cols-[1.7fr_1fr_.8fr_1fr] items-center px-4 py-5 text-sm">
                    <div className="font-semibold text-[#344054]">{row.domain}</div>
                    <div className="font-medium text-[#344054]">{row.keywords}</div>
                    <div>
                      <span className="inline-flex items-center rounded-full border border-[#9EB5FF] bg-[#F5F8FF] px-2 py-0.5 text-[11px] font-medium text-[#5B7CFF]">
                        {row.overlap}
                      </span>
                    </div>
                    <div className="font-semibold text-[#344054]">{row.traffic}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

          {showAuditModal && (
<div className="absolute inset-0 z-50 flex items-center justify-center">
  <div className="max-w-md w-full rounded-2xl bg-white shadow-2xl">
              <AlertDialog open={showAuditModal} onOpenChange={setShowAuditModal}>
                <AlertDialogOverlay className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40" />
                <AlertDialogContent className=" fixed left-1/2 top-1/2 z-50
    -translate-x-1/2 -translate-y-1/2
    max-w-md w-full
    rounded-2xl
    bg-white
    border border-gray-200
    shadow-2xl
    animate-in fade-in zoom-in-95">
                  <div className="p-4 rounded-lg bg-gradient-to-r from-white/80 to-gray-50 border border-gray-200">
                    <AlertDialogHeader>
                      <AlertDialogTitle className="text-2xl font-medium">Audit Completed</AlertDialogTitle>
                      <AlertDialogDescription className="text-sm text-muted-foreground">
                        Your domain audit has finished. Here's a quick summary — you can view the full report or download it.
                      </AlertDialogDescription>
                    </AlertDialogHeader>

                    <div className="mt-4 flex items-center gap-4">
                      <div className="flex-shrink-0">
                        <OverallScoreGauge score={Math.round(((auditResult?.performance||0)+(auditResult?.seo||0)+(auditResult?.accessibility||0)+(auditResult?.bestPractices||0))/4*100)/100 || 0} />
                      </div>
                      <div className="flex-1">
                        <div className="text-sm text-gray-600 mb-2">Top category</div>
                        <div className="text-base font-medium text-gray-900">
                          {auditResult ? (
                            (() => {
                              const cats = [
                                { k: 'Performance', v: auditResult.performance },
                                { k: 'SEO', v: auditResult.seo },
                                { k: 'Accessibility', v: auditResult.accessibility },
                                { k: 'Best Practices', v: auditResult.bestPractices },
                              ];
                              const scored = cats.map(c => ({ ...c, s: Math.round((c.v||0)*100) }));
                              const best = scored.reduce((a,b)=> b.s > a.s ? b : a, scored[0]);
                              return `${best.k} — ${best.s}%`;
                            })()
                          ) : '—'}
                        </div>
                        <div className="text-xs text-gray-500 mt-2">Click below to view the full interactive report.</div>
                      </div>
                    </div>

                    <div className="mt-6 flex items-center justify-end gap-2">
                      {auditResult && companyDomain && (
                        <PDFDownloadLink
                          document={<AuditPDF data={auditResult} domain={companyDomain} />}
                          fileName={`audit-${companyDomain}-${new Date().toISOString().split('T')[0]}.pdf`}
                          className="px-4 py-2 rounded-full border border-gray-200 text-sm font-light bg-white hover:bg-gray-50 flex items-center justify-center"
                        >
                          {({ loading }) => (loading ? 'Preparing...' : 'Export PDF')}
                        </PDFDownloadLink>
                      )}
                      <AlertDialogAction onClick={handleViewReport} className="px-4 py-2 rounded-full bg-black text-white text-sm">View Full Report</AlertDialogAction>
                      <AlertDialogCancel className="px-4 py-2 rounded-full border border-gray-200 text-sm">Close</AlertDialogCancel>
                    </div>
                  </div>
                </AlertDialogContent>
              </AlertDialog>
                </div>
</div>
)}

    
      

    </div>
     )} 
  </>
);
}

