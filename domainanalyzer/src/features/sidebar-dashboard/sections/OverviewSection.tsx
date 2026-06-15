import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
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
import { AlertDialogHeader } from "@/components/ui/alert-dialog";
import { OverallScoreGauge } from "@/components/audit/AuditCharts";
import { AuditPDF } from "@/components/audit/AuditPDF";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  ArrowRight,
  ArrowUpDown,
  Calendar,
  ChevronRight,
  ChartNoAxesCombined,
  Globe2,
  FileText,
  Loader2,
  Plus,
  RefreshCw,
  Search,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import type { OverviewSectionProps } from "@/features/sidebar-dashboard/types";
import { useBlogAnalyticsAggregate } from "@/features/sidebar-dashboard/queries";

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
  const blogAnalyticsQuery = useBlogAnalyticsAggregate(28);
  const blogAggregateData: AggregateData | null =
    blogAnalyticsQuery.data && blogAnalyticsQuery.data.success ? blogAnalyticsQuery.data : null;
  const isLoadingBlogData = blogAnalyticsQuery.isLoading;

  const [showAuditModal, setShowAuditModal] = useState(false);

  useEffect(() => {
    onAuditModalOpenChange(showAuditModal);
  }, [onAuditModalOpenChange, showAuditModal]);

  useEffect(() => {
    if (auditComplete) {
      setShowAuditModal(true);
    }
  }, [auditComplete]);

  const overallScorePercent = Math.round((overallScore || 0) * 100);

  const blogTrendData = useMemo(
    () =>
      blogAggregateData?.dateBreakdown.map((point) => ({
        date: point.date,
        clicks: point.clicks,
        impressions: point.impressions,
      })) ?? [],
    [blogAggregateData],
  );

  const topKeywords = useMemo(
    () =>
      [...keywordsTableData]
        .slice()
        .sort((a, b) => (b.volume || 0) - (a.volume || 0))
        .slice(0, 5),
    [keywordsTableData],
  );

  const latestKeywordUpdatedAt = useMemo(() => {
    const newest = [...keywordsTableData]
      .map((item) => item.updated)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1);

    if (!newest) return null;

    const parsed = new Date(newest);
    if (Number.isNaN(parsed.getTime())) return null;

    return parsed.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }, [keywordsTableData]);

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

  const isPageLoading = auditLoading && !auditResult;

  return (
    <>
      {isPageLoading ? (
        <div className="flex min-h-[60vh] items-center justify-center bg-[#F5F7FB] px-6">
          <div className="text-center">
            <Loader2 className="mx-auto h-12 w-12 animate-spin text-slate-400" />
            <h3 className="mt-4 text-lg font-semibold text-slate-900">Loading overview</h3>
            <p className="mt-1 text-sm text-slate-500">Preparing your dashboard...</p>
          </div>
        </div>
      ) : (
        <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8">
          <section className="self-stretch overflow-hidden rounded-[12px] bg-[#F9F9F9] px-6 py-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)] sm:px-8">
            <div className="flex flex-col items-center justify-center gap-6 lg:flex-row lg:items-center">
                <div className="flex justify-center lg:shrink-0">
                  <img
                    src="/penguin-hero.svg"
                    alt=""
                    aria-hidden="true"
                    className="h-28 w-28 select-none object-contain sm:h-32 sm:w-32 lg:h-36 lg:w-36"
                  />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="space-y-2">
                    <h1 className="text-3xl font-semibold tracking-tight text-[#1F2937] sm:text-[2.15rem]">
                      See how AI ranks your domain
                    </h1>
                    <p className="max-w-3xl text-base leading-7 text-[#4B5563] sm:text-lg">
                      Uncover how your content appears in AI search, which keywords you&apos;re visible for, and where you&apos;re missing opportunities.
                    </p>
                  </div>

                  <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-center">
                    <label htmlFor="overview-domain-input" className="sr-only">
                      Domain to analyze
                    </label>
                    <div className="relative flex-1">
                      <Globe2 className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input
                        id="overview-domain-input"
                        value={companyDomain}
                        onChange={(event) => setCompanyDomain(event.target.value)}
                        placeholder="https://domain.com/"
                        className="h-12 rounded-xl border-slate-200 bg-white pl-11 text-sm shadow-sm"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={onAddDomain}
                      className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[linear-gradient(135deg,#3b4d8f_0%,#5c7dc0_100%)] px-5 text-sm font-semibold text-white shadow-[0_10px_20px_rgba(45,64,89,0.18)] transition hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-[#4C74C2] focus:ring-offset-2"
                    >
                      <Plus className="h-4 w-4" />
                      Check your domain
                    </button>
                  </div>
                </div>
              </div>
          </section>

          <section aria-labelledby="dashboard-metrics" className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 id="dashboard-metrics" className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
                  Your dashboard snapshot
                </h2>
                <p className="mt-1 text-sm text-slate-500">A quick pulse on visibility, coverage, and connected tooling.</p>
              </div>
              <button
                type="button"
                onClick={onOpenAuditDetails}
                className="inline-flex items-center gap-1 text-sm font-semibold text-[#2D4059] underline-offset-4 hover:underline focus:outline-none focus:ring-2 focus:ring-[#4C74C2] focus:ring-offset-2"
              >
                View full report
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[
                {
                  label: "Visibility score",
                  value: `${overallScorePercent}%`,
                  helper: "Overall AI visibility",
                },
                {
                  label: "Coverage",
                  value: `${keywordsTableData.length}`,
                  helper: "Tracked prompts and keywords",
                },
                {
                  label: "Projects",
                  value: `${campaignsCount}`,
                  helper: "Active campaign workspaces",
                },
                {
                  label: "Connected site",
                  value: hasWordpressIntegration ? "Yes" : "No",
                  helper: hasWordpressIntegration ? "Publishing enabled" : "Connect to publish",
                },
              ].map((card) => (
                <article
                  key={card.label}
                  className="rounded-[20px] border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
                >
                  <p className="text-sm font-medium text-slate-500">{card.label}</p>
                  <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">{card.value}</p>
                  <p className="mt-2 text-sm text-slate-500">{card.helper}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.4fr_0.95fr]">
            <article className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] sm:p-6">
              <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold tracking-tight text-slate-900">Visibility & coverage</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    A readable summary of audit quality, blog performance, and AI discovery signals.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={onRunAudit}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#2D4059] px-4 text-sm font-semibold text-white transition hover:bg-[#24364d] focus:outline-none focus:ring-2 focus:ring-[#4C74C2] focus:ring-offset-2"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Re-run audit
                  </button>
                  <button
                    type="button"
                    onClick={onOpenProjects}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#4C74C2] focus:ring-offset-2"
                  >
                    <FileText className="h-4 w-4" />
                    Open projects
                  </button>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[0.9fr_1.1fr]">
                <div className="rounded-2xl border border-slate-100 bg-[#F8FAFF] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-slate-500">Overall score</p>
                      <p className="mt-1 text-3xl font-semibold text-slate-900">
                        {overallScorePercent}%
                      </p>
                    </div>
                    <div className="shrink-0">
                      <OverallScoreGauge score={overallScore} />
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-3">
                    {[
                      { label: "Performance", value: auditResult ? `${Math.round((auditResult.performance || 0) * 100)}%` : "—" },
                      { label: "SEO", value: auditResult ? `${Math.round((auditResult.seo || 0) * 100)}%` : "—" },
                      { label: "Accessibility", value: auditResult ? `${Math.round((auditResult.accessibility || 0) * 100)}%` : "—" },
                      { label: "Best practices", value: auditResult ? `${Math.round((auditResult.bestPractices || 0) * 100)}%` : "—" },
                    ].map((item) => (
                      <div
                        key={item.label}
                        className="rounded-xl border border-white bg-white p-3 shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
                      >
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{item.label}</p>
                        <p className="mt-2 text-lg font-semibold text-slate-900">{item.value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-100 bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-slate-500">Performance trend</p>
                      <h3 className="mt-1 text-lg font-semibold text-slate-900">Blog analytics</h3>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                      {blogAggregateData && blogAggregateData.totalBlogsAnalyzed > 0
                        ? `Tracking ${blogAggregateData.totalBlogsAnalyzed} blogs`
                        : "No blogs yet"}
                    </span>
                  </div>

                  <div className="mt-4 min-h-[280px]">
                    {isLoadingBlogData ? (
                      <div className="flex h-[280px] items-center justify-center">
                        <div className="text-center">
                          <Loader2 className="mx-auto h-8 w-8 animate-spin text-slate-400" />
                          <p className="mt-2 text-sm text-slate-500">Loading performance data...</p>
                        </div>
                      </div>
                    ) : blogTrendData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={280}>
                        <AreaChart data={blogTrendData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                          <defs>
                            <linearGradient id="blogClicks" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#4C74C2" stopOpacity={0.35} />
                              <stop offset="95%" stopColor="#4C74C2" stopOpacity={0.02} />
                            </linearGradient>
                            <linearGradient id="blogImpressions" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#2D4059" stopOpacity={0.28} />
                              <stop offset="95%" stopColor="#2D4059" stopOpacity={0.02} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid stroke="#E5E7EB" strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#6B7280" }} />
                          <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#6B7280" }} />
                          <Tooltip />
                          <Area type="monotone" dataKey="clicks" stroke="#4C74C2" fill="url(#blogClicks)" strokeWidth={2} />
                          <Area type="monotone" dataKey="impressions" stroke="#2D4059" fill="url(#blogImpressions)" strokeWidth={1.5} />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex h-[280px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-center">
                        <p className="max-w-sm text-sm text-slate-500">
                          No performance data yet. Publish a few blogs to start tracking trends.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </article>

            <aside className="space-y-6">
              <article className="rounded-[24px] border border-[#DDE7F5] bg-[#F1F6FF] p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] sm:p-6">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold tracking-tight text-[#2D4059]">Suggested next actions</h2>
                    <p className="mt-1 text-sm text-slate-500">Shortcuts to the work your team can act on immediately.</p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-slate-400" />
                </div>

                <div className="mt-4 space-y-3">
                  {suggestedActions.map((action) => {
                    const toneClass =
                      action.tone === "danger"
                        ? "border-[#F4D6D6] bg-white"
                        : action.tone === "warning"
                          ? "border-[#F2E8BF] bg-white"
                          : "border-slate-200 bg-white";

                    return (
                      <button
                        key={action.title}
                        type="button"
                        onClick={action.onClick}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-2xl border px-4 py-4 text-left shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition hover:-translate-y-0.5 hover:shadow-[0_4px_12px_rgba(16,24,40,0.08)] focus:outline-none focus:ring-2 focus:ring-[#4C74C2] focus:ring-offset-2",
                          toneClass,
                        )}
                      >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-[#F8FAFF]">
                          <img src={action.icon} alt="" aria-hidden className="h-5 w-5 object-contain" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-900">{action.title}</p>
                          <p className="mt-1 text-sm leading-6 text-slate-500">{action.subtitle}</p>
                        </div>
                        <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
                      </button>
                    );
                  })}
                </div>
              </article>

              <article className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] sm:p-6">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold tracking-tight text-slate-900">Recent activity</h2>
                    <p className="mt-1 text-sm text-slate-500">What happened most recently in your dashboard.</p>
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  {recentActivities.map((activity) => (
                    <div key={activity.title} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                      <p className="text-sm font-medium text-slate-900">{activity.title}</p>
                      <p className="mt-1 text-xs text-slate-500">{activity.time}</p>
                    </div>
                  ))}
                </div>
              </article>
            </aside>
          </section>

          <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_1.05fr]">
            <article className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold tracking-tight text-slate-900">Recent queries</h2>
                  <p className="mt-1 text-sm text-slate-500">Search terms and keywords most recently surfaced in your workspace.</p>
                </div>
                <button
                  type="button"
                  onClick={onOpenAnalytics}
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#4C74C2] focus:ring-offset-2"
                >
                  View all
                </button>
              </div>

              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <label className="relative flex-1">
                  <span className="sr-only">Search domains</span>
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    placeholder="Search domains..."
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-4 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-[#4C74C2] focus:ring-2 focus:ring-[#4C74C2]/20"
                  />
                </label>
                <button
                  type="button"
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#4C74C2] focus:ring-offset-2"
                >
                  <Calendar className="h-4 w-4" />
                  Select duration
                </button>
                <button
                  type="button"
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#4C74C2] focus:ring-offset-2"
                >
                  <ArrowUpDown className="h-4 w-4" />
                  Sort
                </button>
              </div>

              <div className="mt-5 space-y-3">
                {topKeywords.length > 0 ? (
                  topKeywords.map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">{item.keyword}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {item.intent || "Commercial"} · {item.type === "keyword" ? "Keyword" : "Prompt"}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                          {item.volume ? item.volume.toLocaleString() : "—"}
                        </span>
                        <button
                          type="button"
                          onClick={onOpenAnalytics}
                          className="text-sm font-semibold text-[#2D4059] underline-offset-4 hover:underline focus:outline-none focus:ring-2 focus:ring-[#4C74C2] focus:ring-offset-2"
                        >
                          Open
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                    No queries yet. Once your domain is analyzed, they will appear here.
                  </div>
                )}
              </div>
            </article>

            <article className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold tracking-tight text-slate-900">Competitor overview</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Compare your domain against leading competitors from the current dataset.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onOpenAnalytics}
                  className="inline-flex items-center gap-1 text-sm font-semibold text-[#2D4059] underline-offset-4 hover:underline focus:outline-none focus:ring-2 focus:ring-[#4C74C2] focus:ring-offset-2"
                >
                  View details
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
                <div className="grid grid-cols-[1.5fr_.8fr_.8fr_.9fr] bg-slate-50 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  <div>Domain</div>
                  <div>Keywords</div>
                  <div>Overlap</div>
                  <div>Est. Traffic</div>
                </div>
                <div className="divide-y divide-slate-100 bg-white">
                  {competitorOverview.loading && competitorOverview.rows.length === 0 ? (
                    [0, 1, 2].map((idx) => (
                      <div key={idx} className="grid grid-cols-[1.5fr_.8fr_.8fr_.9fr] items-center px-4 py-4">
                        <div className="h-4 w-36 animate-pulse rounded bg-slate-200" />
                        <div className="h-4 w-16 animate-pulse rounded bg-slate-200" />
                        <div className="h-6 w-16 animate-pulse rounded-full bg-slate-200" />
                        <div className="h-4 w-24 animate-pulse rounded bg-slate-200" />
                      </div>
                    ))
                  ) : competitorOverview.error && competitorOverview.rows.length === 0 ? (
                    <div className="px-4 py-8 text-sm text-slate-500">{competitorOverview.error}</div>
                  ) : competitorOverview.rows.length === 0 ? (
                    <div className="px-4 py-8 text-sm text-slate-500">No competitor overview data available yet.</div>
                  ) : (
                    competitorOverview.rows.map((row) => (
                      <div key={row.domain} className="grid grid-cols-[1.5fr_.8fr_.8fr_.9fr] items-center gap-3 px-4 py-4 text-sm">
                        <div className="min-w-0 font-semibold text-slate-900">{row.domain}</div>
                        <div className="font-medium text-slate-700">{row.keywords}</div>
                        <div>
                          <span className="inline-flex items-center rounded-full border border-[#9EB5FF] bg-[#F5F8FF] px-2.5 py-1 text-xs font-medium text-[#5B7CFF]">
                            {row.overlap}
                          </span>
                        </div>
                        <div className="font-semibold text-slate-700">{row.traffic}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </article>
          </section>

          <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <article className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold tracking-tight text-slate-900">Activity and access</h2>
                  <p className="mt-1 text-sm text-slate-500">A compact view of the latest operational signals.</p>
                </div>
                <button
                  type="button"
                  onClick={onVisitSite}
                  className="inline-flex items-center gap-1 text-sm font-semibold text-[#2D4059] underline-offset-4 hover:underline focus:outline-none focus:ring-2 focus:ring-[#4C74C2] focus:ring-offset-2"
                >
                  Visit site
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {recentActivities.map((activity) => (
                  <div key={activity.title} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                    <p className="text-sm font-medium text-slate-900">{activity.title}</p>
                    <p className="mt-1 text-xs text-slate-500">{activity.time}</p>
                  </div>
                ))}
              </div>
            </article>

            <article className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold tracking-tight text-slate-900">Quick actions</h2>
                  <p className="mt-1 text-sm text-slate-500">The shortest path to the next useful step.</p>
                </div>
                <Plus className="h-5 w-5 text-slate-400" />
              </div>

              <div className="mt-4 space-y-3">
                <button
                  type="button"
                  onClick={onAddDomain}
                  className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-4 text-left transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#4C74C2] focus:ring-offset-2"
                >
                  <span>
                    <span className="block text-sm font-semibold text-slate-900">Connect or update a domain</span>
                    <span className="mt-1 block text-sm text-slate-500">Add a new site to compare visibility across your workspace.</span>
                  </span>
                  <ArrowRight className="h-4 w-4 text-slate-400" />
                </button>

                <button
                  type="button"
                  onClick={onOpenProjects}
                  className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-4 text-left transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#4C74C2] focus:ring-offset-2"
                >
                  <span>
                    <span className="block text-sm font-semibold text-slate-900">Open projects</span>
                    <span className="mt-1 block text-sm text-slate-500">Review draft-ready work and publishing tasks.</span>
                  </span>
                  <ArrowRight className="h-4 w-4 text-slate-400" />
                </button>

                <button
                  type="button"
                  onClick={onOpenAnalytics}
                  className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-4 text-left transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#4C74C2] focus:ring-offset-2"
                >
                  <span>
                    <span className="block text-sm font-semibold text-slate-900">Open analytics report</span>
                    <span className="mt-1 block text-sm text-slate-500">Inspect coverage, competitors, and keyword detail.</span>
                  </span>
                  <ArrowRight className="h-4 w-4 text-slate-400" />
                </button>
              </div>
            </article>
          </section>

          <section className="grid grid-cols-1 gap-6">
            <article className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] sm:p-6">
              <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold tracking-tight text-slate-900">Your AI Visibility Report</h2>
                  <p className="mt-1 text-sm text-slate-500">The primary summary view for your connected domain.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={onOpenAuditDetails}
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#4C74C2] focus:ring-offset-2"
                  >
                    <ChartNoAxesCombined className="mr-2 h-4 w-4" />
                    Details
                  </button>
                  <button
                    type="button"
                    onClick={onRunAudit}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#2D4059] px-4 text-sm font-semibold text-white transition hover:bg-[#24364d] focus:outline-none focus:ring-2 focus:ring-[#4C74C2] focus:ring-offset-2"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Re-run audit
                  </button>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[0.7fr_1.3fr]">
                <div className="rounded-2xl border border-slate-100 bg-[#F8FAFF] p-4">
                  <p className="text-sm font-medium text-slate-500">Overall score</p>
                  <div className="mt-4 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-4xl font-semibold tracking-tight text-slate-900">{overallScorePercent}%</p>
                      <p className="mt-2 text-sm text-slate-500">
                        {auditResult ? "Based on the latest audit" : "Run an audit to populate the score"}
                      </p>
                    </div>
                    <OverallScoreGauge score={overallScore} />
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-3">
                    {[
                      { label: "Performance", value: auditResult ? `${Math.round((auditResult.performance || 0) * 100)}%` : "—" },
                      { label: "SEO", value: auditResult ? `${Math.round((auditResult.seo || 0) * 100)}%` : "—" },
                      { label: "Accessibility", value: auditResult ? `${Math.round((auditResult.accessibility || 0) * 100)}%` : "—" },
                      { label: "Best practices", value: auditResult ? `${Math.round((auditResult.bestPractices || 0) * 100)}%` : "—" },
                    ].map((item) => (
                      <div key={item.label} className="rounded-xl border border-white bg-white p-3 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{item.label}</p>
                        <p className="mt-2 text-lg font-semibold text-slate-900">{item.value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-100 bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-slate-500">Performance trend</p>
                      <h3 className="mt-1 text-lg font-semibold text-slate-900">Published content trend</h3>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                      {blogAggregateData && blogAggregateData.totalBlogsAnalyzed > 0
                        ? `Tracking ${blogAggregateData.totalBlogsAnalyzed} blogs`
                        : "No blogs yet"}
                    </span>
                  </div>

                  <div className="mt-4 min-h-[280px]">
                    {isLoadingBlogData ? (
                      <div className="flex h-[280px] items-center justify-center">
                        <div className="text-center">
                          <Loader2 className="mx-auto h-8 w-8 animate-spin text-slate-400" />
                          <p className="mt-2 text-sm text-slate-500">Loading performance data...</p>
                        </div>
                      </div>
                    ) : blogTrendData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={280}>
                        <AreaChart data={blogTrendData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                          <defs>
                            <linearGradient id="blogClicks" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#4C74C2" stopOpacity={0.35} />
                              <stop offset="95%" stopColor="#4C74C2" stopOpacity={0.02} />
                            </linearGradient>
                            <linearGradient id="blogImpressions" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#2D4059" stopOpacity={0.28} />
                              <stop offset="95%" stopColor="#2D4059" stopOpacity={0.02} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid stroke="#E5E7EB" strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#6B7280" }} />
                          <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#6B7280" }} />
                          <Tooltip />
                          <Area type="monotone" dataKey="clicks" stroke="#4C74C2" fill="url(#blogClicks)" strokeWidth={2} />
                          <Area type="monotone" dataKey="impressions" stroke="#2D4059" fill="url(#blogImpressions)" strokeWidth={1.5} />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex h-[280px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-center">
                        <p className="max-w-sm text-sm text-slate-500">
                          No performance data yet. Publish a few blogs to start tracking trends.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </article>
          </section>

          {showAuditModal ? (
            <AlertDialog open={showAuditModal} onOpenChange={setShowAuditModal}>
              <AlertDialogOverlay className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm" />
              <AlertDialogContent className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl">
                <div className="rounded-2xl bg-gradient-to-br from-white to-slate-50 p-6">
                  <AlertDialogHeader>
                    <AlertDialogTitle className="text-2xl font-semibold text-slate-900">Audit completed</AlertDialogTitle>
                    <AlertDialogDescription className="text-sm text-slate-500">
                      Your latest audit is ready. Open the full report or export a PDF copy.
                    </AlertDialogDescription>
                  </AlertDialogHeader>

                  <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center">
                    <div className="shrink-0">
                      <OverallScoreGauge score={overallScore} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-500">Top category</p>
                      <p className="mt-1 text-base font-semibold text-slate-900">
                        {auditResult ? (
                          (() => {
                            const cats = [
                              { k: "Performance", v: auditResult.performance },
                              { k: "SEO", v: auditResult.seo },
                              { k: "Accessibility", v: auditResult.accessibility },
                              { k: "Best Practices", v: auditResult.bestPractices },
                            ];
                            const scored = cats.map((c) => ({ ...c, s: Math.round((c.v || 0) * 100) }));
                            const best = scored.reduce((a, b) => (b.s > a.s ? b : a), scored[0]);
                            return `${best.k} · ${best.s}%`;
                          })()
                        ) : (
                          "—"
                        )}
                      </p>
                      <p className="mt-2 text-sm text-slate-500">Click below to view the full interactive report.</p>
                    </div>
                  </div>

                  <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <AlertDialogCancel className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700">
                      Close
                    </AlertDialogCancel>
                    <AlertDialogAction
                      onClick={onViewReport}
                      className="inline-flex h-11 items-center justify-center rounded-xl bg-[#2D4059] px-4 text-sm font-semibold text-white"
                    >
                      View full report
                    </AlertDialogAction>
                    {auditResult && companyDomain ? (
                      <PDFDownloadLink
                        document={<AuditPDF data={auditResult} domain={companyDomain} />}
                        fileName={`audit-${companyDomain}-${new Date().toISOString().split("T")[0]}.pdf`}
                        className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700"
                      >
                        {({ loading }) => (loading ? "Preparing..." : "Export PDF")}
                      </PDFDownloadLink>
                    ) : null}
                  </div>
                </div>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
        </div>
      )}
    </>
  );
}
