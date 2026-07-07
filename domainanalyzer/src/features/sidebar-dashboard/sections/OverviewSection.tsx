import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  ArrowRight,
  ArrowUpDown,
  AlertCircle,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChartNoAxesCombined,
  Clock3,
  ExternalLink,
  FileText,
  Download,
  Info,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  UsersRound,
} from "lucide-react";
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

type RecentQueryStatus = "success" | "warning" | "danger";

interface RecentQueryCard {
  title: string;
  url: string;
  logo: string;
  status: RecentQueryStatus;
  statusLabel: string;
}

const RECENT_QUERY_CARDS: RecentQueryCard[] = [
  {
    title: "Blue Ocean Technology",
    url: "https://blueoceantech.com",
    logo: "/blue_ocean_global_technology_logo.jpg",
    status: "success",
    statusLabel: "Healthy",
  },
  {
    title: "SEMrush",
    url: "https://Semrush.com",
    logo: "/semrush-icon.png",
    status: "warning",
    statusLabel: "Pending",
  },
  {
    title: "SEMrush",
    url: "https://Semrush.com",
    logo: "/semrush-icon.png",
    status: "danger",
    statusLabel: "Attention",
  },
];

const RECENT_QUERY_STATUS_STYLES: Record<
  RecentQueryStatus,
  { container: string; icon: JSX.Element }
> = {
  success: {
    container: "bg-[#ECFDF3] text-[#16A34A]",
    icon: <CheckCircle2 className="h-4 w-4" strokeWidth={2.2} />,
  },
  warning: {
    container: "bg-[#FEF3C7] text-[#D97706]",
    icon: <Clock3 className="h-4 w-4" strokeWidth={2.2} />,
  },
  danger: {
    container: "bg-[#FEE2E2] text-[#DC2626]",
    icon: <AlertCircle className="h-4 w-4" strokeWidth={2.2} />,
  },
};

const SECTION_TOOLTIPS = {
  "Recent Queries": "Displays recent domain checks, visibility scores, and analysis status.",
  "Your overall performance": "Shows domain performance across AI search, visibility, relevance, and content progress.",
  "AI Summary": "Gives a quick health breakdown of visibility, sentiment, mentions, and accuracy.",
  "Performance Over Time": "Tracks visibility changes across blogs and LLM results over time.",
  "Opportunities to Outrank Competitors": "Highlights actions to close gaps and win more AI driven traffic.",
  "GSC Analytics": "Shows search performance trends from Google Search Console data.",
} as const;

type SectionTooltipTitle = keyof typeof SECTION_TOOLTIPS;

function SectionHeadingTooltip({ title }: { title: SectionTooltipTitle }) {
  return (
    <Tooltip delayDuration={150}>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex h-5 w-5 items-center justify-center rounded-full text-slate-500 transition-colors hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4C74C2] focus-visible:ring-offset-2 focus-visible:ring-offset-white"
          aria-label={`More info about ${title}`}
        >
          <Info className="h-4 w-4" aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        align="start"
        className="max-w-[280px] rounded-lg bg-white px-3 py-2 text-[12px] font-normal leading-relaxed text-[#414651] shadow-xl"
      >
        {SECTION_TOOLTIPS[title]}
      </TooltipContent>
    </Tooltip>
  );
}

interface PerformanceMetricCard {
  title: string;
  value: string;
  delta: string;
  helperText: string;
  badgeClass: string;
  iconClass: string;
  deltaClass: string;
  icon: JSX.Element;
}

const PERFORMANCE_METRIC_CARDS: PerformanceMetricCard[] = [
  {
    title: "Organic Traffic",
    value: "2,847",
    delta: "+12.5%",
    helperText: "from last month",
    badgeClass: "bg-[#ECFDF3]",
    iconClass: "text-[#16A34A]",
    deltaClass: "text-[#65A30D]",
    icon: <ChartNoAxesCombined className="h-5 w-5" strokeWidth={2} />,
  },
  {
    title: "Blogs Published",
    value: "4",
    delta: "Awaiting Response",
    helperText: "New Invitations",
    badgeClass: "bg-[#FEF3C7]",
    iconClass: "text-[#D97706]",
    deltaClass: "text-[#DC2626]",
    icon: <FileText className="h-5 w-5" strokeWidth={2} />,
  },
  {
    title: "Blogs In Progress",
    value: "12",
    delta: "+12.5%",
    helperText: "from last month",
    badgeClass: "bg-[#FEF3C7]",
    iconClass: "text-[#D97706]",
    deltaClass: "text-[#65A30D]",
    icon: <Clock3 className="h-5 w-5" strokeWidth={2} />,
  },
  {
    title: "Ranking Prompts",
    value: "52",
    delta: "+2",
    helperText: "from last month",
    badgeClass: "bg-[#EEF2FF]",
    iconClass: "text-[#7C8DE8]",
    deltaClass: "text-[#65A30D]",
    icon: <UsersRound className="h-5 w-5" strokeWidth={2} />,
  },
];

export function OverviewSection({
  auditComplete,
  auditLoading,
  auditResult,
  companyDomain,
  hasWordpressIntegration,
  competitorOverview,
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
  const navigate = useNavigate();
  const blogAnalyticsQuery = useBlogAnalyticsAggregate(28);
  const blogAggregateData: AggregateData | null =
    blogAnalyticsQuery.data && blogAnalyticsQuery.data.success ? blogAnalyticsQuery.data : null;
  const isLoadingBlogData = blogAnalyticsQuery.isLoading;

  const [heroDomainInput, setHeroDomainInput] = useState("");
  const [heroDomainError, setHeroDomainError] = useState("");
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

  const recommendedActions = [
    {
      title: "See Where Competitors Are Winning",
      description: "Identify competitor strengths, visibility gaps, and content opportunities.",
      icon: "/sidebar-icons/recommended-actions-group.svg",
      arrowIcon: "/sidebar-icons/recommended-actions-arrow.svg",
      onClick: onOpenAnalytics,
    },
    {
      title: "Discover Prompt Opportunities",
      description: "Surface high-value prompts that can improve discovery and coverage.",
      icon: "/sidebar-icons/discover-prompt-opportunities.svg",
      arrowIcon: "/sidebar-icons/recommended-actions-arrow.svg",
      onClick: onOpenProjects,
    },
    {
      title: "Develop Content That AI Recommends",
      description: "Build targeted content ideas to improve rankings and AI visibility.",
      icon: "/sidebar-icons/develop-content-that-ai-recommends.svg",
      arrowIcon: "/sidebar-icons/recommended-actions-arrow.svg",
      onClick: onOpenProjects,
    },
  ];

  const isPageLoading = auditLoading && !auditResult;
  const handleCheckDomain = () => {
    const nextDomain = heroDomainInput.trim();
    if (nextDomain) {
      setHeroDomainError("");
      navigate(`/audit?prefillHost=${encodeURIComponent(nextDomain)}`);
      return;
    }
    setHeroDomainError("Please type a domain first.");
  };

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
        <div className="mx-auto flex w-full max-w-[1637px] flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8">
          <section className="self-stretch overflow-hidden rounded-[12px] bg-[#F9F9F9] px-6 py-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)] sm:px-8">
            <div className="mx-auto flex w-full max-w-[1080px] flex-col items-center justify-center gap-6 lg:flex-row lg:items-center lg:gap-8">
              <div className="flex justify-center lg:shrink-0">
                <img
                  src="/penguin-hero.svg"
                  alt=""
                  aria-hidden="true"
                  className="h-48 w-48 select-none object-contain sm:h-56 sm:w-56 lg:h-40 lg:w-40"
                />
              </div>

              <div className="min-w-0 flex-1 max-w-[760px]">
                <div className="space-y-2">
                  <h1 className="text-4xl font-semibold tracking-tight text-[#414651] sm:text-[2.15rem]">
                    See how AI ranks your domain
                  </h1>
                  <p className="max-w-3xl text-base leading-7 text-[#535862] sm:text-lg">
                    Uncover how your content appears in AI search, which keywords you&apos;re visible for, and where you&apos;re missing opportunities.
                  </p>
                </div>

                <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-center">
                  <label htmlFor="overview-domain-input" className="sr-only">
                    Domain to analyze
                  </label>
                  <div className="relative flex-1">
                    <img
                      src="/sidebar-icons/vector.svg"
                      alt=""
                      aria-hidden="true"
                      className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 select-none object-contain"
                    />
                    {heroDomainError ? (
                      <span
                        className="pointer-events-none absolute left-11 top-1/2 -translate-y-1/2 truncate text-base text-[#B42318]"
                        aria-live="polite"
                      >
                        {heroDomainError}
                      </span>
                    ) : null}
                    <Input
                      id="overview-domain-input"
                      value={heroDomainInput}
                      onChange={(event) => {
                        setHeroDomainInput(event.target.value);
                        if (heroDomainError) setHeroDomainError("");
                      }}
                      placeholder={heroDomainError ? "" : "https://domain.com/"}
                      className="h-12 rounded-xl border-slate-200 bg-white pl-11 text-base text-slate-900 shadow-sm placeholder:text-[#D5D7DA]"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleCheckDomain}
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border-0 bg-[linear-gradient(90deg,#2D4059_0%,#4C74C2_100%)] px-5 text-sm font-semibold text-white shadow-[0_1px_2px_0_#1018280D] transition hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-[#4C74C2] focus:ring-offset-2"
                  >
                    <Plus className="h-4 w-4" />
                    Check your domain
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section aria-labelledby="recommended-actions" className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p id="recommended-actions" className="text-xl font-semibold leading-none text-[#414651] sm:text-2xl">
                  Recommended Actions
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              {recommendedActions.map((action) => {
                const Icon = typeof action.icon === "string" ? null : action.icon;
                return (
                  <article
                    key={action.title}
                    className={
                      action.title === "See Where Competitors Are Winning"
                        ? "flex h-full min-h-[168px] flex-col rounded-[10px] border border-[#E3ECFB] bg-[#EEF4FF] px-4 py-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
                        : "flex h-full min-h-[168px] flex-col rounded-[10px] border border-[#E3ECFB] bg-[#F4F8FF] px-4 py-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
                    }
                  >
                    <div className="flex flex-1 flex-col">
                      {action.title === "See Where Competitors Are Winning" ? (
                        <img
                          src="/sidebar-icons/recommended-actions-group.svg"
                          alt=""
                          aria-hidden="true"
                          className="h-10 w-10 shrink-0 select-none object-contain"
                        />
                      ) : typeof action.icon === "string" ? (
                        <img
                          src={action.icon}
                          alt=""
                          aria-hidden="true"
                          className="h-10 w-10 shrink-0 select-none object-contain"
                        />
                      ) : (
                        <Icon className="h-10 w-10 shrink-0 text-[#7F95BD]" strokeWidth={1.7} />
                      )}

                      <h3 className="mt-3 text-base font-semibold leading-6 text-[#414651]">
                        {action.title}
                      </h3>
                      <p className="mt-1 text-base font-normal leading-6 text-[#717680]">
                        {action.description}
                      </p>
                      <button
                        type="button"
                        onClick={action.onClick}
                        className="mt-4 inline-flex h-9 w-9 items-center justify-center rounded-[8px] bg-[#7E94BA] text-white transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[#4C74C2] focus:ring-offset-2"
                        aria-label={action.title}
                      >
                        {action.title === "See Where Competitors Are Winning" ? (
                          <img
                            src="/sidebar-icons/recommended-actions-arrow.svg"
                            alt=""
                            aria-hidden="true"
                            className="h-9 w-9 select-none object-contain"
                          />
                        ) : (
                          <ArrowRight className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <section aria-labelledby="recent-queries-title" className="space-y-4">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-0.5">
                  <h2 id="recent-queries-title" className="text-xl font-semibold tracking-tight text-slate-900">
                    Recent Queries
                  </h2>
                  <SectionHeadingTooltip title="Recent Queries" />
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center xl:justify-end">
                <label className="relative w-full sm:w-[240px]">
                  <span className="sr-only">Search domains</span>
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    placeholder="Search Domains..."
                    className="h-10 w-full rounded-xl border border-[#D5D9E3] bg-white pl-9 pr-4 text-sm text-slate-700 shadow-[0_1px_2px_rgba(16,24,40,0.04)] outline-none placeholder:text-slate-400 focus:border-[#4C74C2] focus:ring-2 focus:ring-[#4C74C2]/20"
                  />
                </label>
                <button
                  type="button"
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#D5D9E3] bg-white px-3.5 text-sm font-medium text-slate-700 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#4C74C2] focus:ring-offset-2"
                >
                  <Calendar className="h-4 w-4" />
                  Select Duration
                  <ChevronDown className="h-4 w-4 text-slate-400" />
                </button>
                <button
                  type="button"
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#D5D9E3] bg-white px-3.5 text-sm font-medium text-slate-700 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#4C74C2] focus:ring-offset-2"
                >
                  <ArrowUpDown className="h-4 w-4" />
                  Sort
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
              {RECENT_QUERY_CARDS.map((card) => {
                const statusStyles = RECENT_QUERY_STATUS_STYLES[card.status];

                return (
                  <article
                    key={`${card.title}-${card.status}`}
                    className="flex min-h-[90px] items-center justify-between gap-4 rounded-[12px] border border-[#E5EAF2] bg-white px-4 py-4 shadow-[0_1px_2px_rgba(16,24,40,0.06)]"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#E5EAF2] bg-[#F8FAFF]">
                        <img src={card.logo} alt="" aria-hidden="true" className="h-7 w-7 select-none object-contain" />
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <h3 className="truncate text-base font-semibold text-[#1F2937]">{card.title}</h3>
                          <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
                        </div>
                        <a
                          href={card.url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 inline-flex items-center gap-1 rounded-full bg-[#EEF4FF] px-2.5 py-1 text-[11px] font-medium text-[#4C74C2]"
                        >
                          {card.url.replace(/^https?:\/\//, "")}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </div>

                    <div
                      className={cn(
                        "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                        statusStyles.container,
                      )}
                      aria-label={card.statusLabel}
                      title={card.statusLabel}
                    >
                      {statusStyles.icon}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <section aria-labelledby="overall-performance-title" className="space-y-4">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-0.5">
                  <h2
                    id="overall-performance-title"
                    className="text-xl font-semibold tracking-tight text-slate-900"
                  >
                    Your overall performance
                  </h2>
                  <SectionHeadingTooltip title="Your overall performance" />
                </div>
                <p className="mt-1 max-w-3xl text-sm text-slate-500">
                  See how your domain appears across AI platforms and where you can improve visibility,
                  relevance, and performance.
                </p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center xl:justify-end">
                <button
                  type="button"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#D5D9E3] bg-white text-slate-600 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#4C74C2] focus:ring-offset-2"
                  aria-label="Download performance report"
                >
                  <Download className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#D5D9E3] bg-white px-3.5 text-sm font-medium text-slate-700 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#4C74C2] focus:ring-offset-2"
                >
                  <Calendar className="h-4 w-4 text-slate-500" />
                  7 days
                  <ChevronDown className="h-4 w-4 text-slate-400" />
                </button>
                <button
                  type="button"
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#D5D9E3] bg-white px-3.5 text-sm font-medium text-slate-700 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#4C74C2] focus:ring-offset-2"
                >
                  <ArrowUpDown className="h-4 w-4 text-slate-500" />
                  Sort: Impact
                  <ChevronDown className="h-4 w-4 text-slate-400" />
                </button>
                <button
                  type="button"
                  onClick={onRunAudit}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border-0 bg-[linear-gradient(90deg,#2D4059_0%,#4C74C2_100%)] px-4 text-sm font-semibold text-white shadow-[0_1px_2px_0_#1018280D] transition hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-[#4C74C2] focus:ring-offset-2"
                >
                  <Plus className="h-4 w-4" />
                  Start New Audit
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-4">
              {PERFORMANCE_METRIC_CARDS.map((metric) => (
                <article
                  key={metric.title}
                  className="flex min-h-[86px] items-center justify-between gap-4 rounded-[12px] border border-[#E5EAF2] bg-white px-4 py-4 shadow-[0_1px_2px_rgba(16,24,40,0.06)]"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div
                      className={cn(
                        "flex h-12 w-12 shrink-0 items-center justify-center rounded-full",
                        metric.badgeClass,
                      )}
                    >
                      <span className={metric.iconClass}>{metric.icon}</span>
                    </div>

                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[#667085]">{metric.title}</p>
                      <p className="mt-0.5 text-[1.8rem] font-semibold leading-none text-[#101828]">
                        {metric.value}
                      </p>
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <p className={cn("text-xl font-semibold leading-none", metric.deltaClass)}>{metric.delta}</p>
                    <p className="mt-1 text-xs text-[#98A2B3]">{metric.helperText}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <article className="rounded-[18px] border border-[#EEF1F6] bg-white p-5 shadow-[0_1px_3px_rgba(16,24,40,0.06)] sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-0.5">
                    <h2 className="text-lg font-semibold tracking-tight text-slate-700">AI Summary</h2>
                    <SectionHeadingTooltip title="AI Summary" />
                  </div>
                  <p className="mt-1 text-sm text-slate-400">Lighthouse performance breakdown</p>
                </div>
                <button
                  type="button"
                  className="text-sm font-semibold text-slate-600 underline-offset-4 hover:underline focus:outline-none focus:ring-2 focus:ring-[#4C74C2] focus:ring-offset-2"
                >
                  View Details
                </button>
              </div>

              <div className="mt-8 space-y-6">
                <div>
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-sm font-semibold text-slate-700">Overall Website health</p>
                    <p className="text-2xl font-semibold text-[#7F9FE6]">78%</p>
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-[#D8DEEA]">
                    <div className="h-2 w-[78%] rounded-full bg-[#7F9FE6]" />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                  <div className="space-y-5">
                    <div>
                      <p className="text-sm font-semibold text-slate-700">Share Of Voice</p>
                      <p className="mt-1 text-[2rem] font-semibold leading-none text-slate-700">16</p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-700">Brand Sentiment</p>
                      <p className="mt-1 text-[1.7rem] font-semibold leading-none text-[#138808]">Positive</p>
                    </div>
                  </div>

                  <div className="space-y-5 sm:text-right">
                    <div>
                      <p className="text-sm font-semibold text-slate-700">Mentions</p>
                      <p className="mt-1 text-[2rem] font-semibold leading-none text-slate-700">38</p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-700">Brand accuracy</p>
                      <p className="mt-1 text-[2rem] font-semibold leading-none text-slate-500">78%</p>
                    </div>
                  </div>
                </div>
              </div>
            </article>

            <article className="rounded-[18px] border border-[#EEF1F6] bg-white p-5 shadow-[0_1px_3px_rgba(16,24,40,0.06)] sm:p-6">
              <div className="flex flex-col gap-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-0.5">
                      <h2 className="text-lg font-semibold tracking-tight text-slate-700">Performance Over Time</h2>
                      <SectionHeadingTooltip title="Performance Over Time" />
                    </div>
                  </div>

                  <button
                    type="button"
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#D7DBE4] bg-white px-3.5 text-sm font-medium text-slate-600 shadow-[0_1px_2px_rgba(16,24,40,0.06)] transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#4C74C2] focus:ring-offset-2"
                  >
                    <Calendar className="h-4 w-4" />
                    Select Duration
                  </button>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <div className="inline-flex rounded-lg border border-[#D7DBE4] bg-[#F9FAFC] p-0.5">
                    <button
                      type="button"
                      className="rounded-md bg-[#E9EEF9] px-4 py-1.5 text-sm font-medium text-slate-700 shadow-sm"
                    >
                      Blogs
                    </button>
                    <button
                      type="button"
                      className="rounded-md px-4 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-white"
                    >
                      LLM
                    </button>
                  </div>
                </div>

                <div className="relative mt-3 h-[230px] overflow-hidden rounded-xl bg-white">
                  <svg viewBox="0 0 640 230" className="h-full w-full" aria-hidden="true" preserveAspectRatio="none">
                    <g>
                      {Array.from({ length: 10 }).map((_, index) => {
                        const x = 40 + index * 62;
                        return <line key={`v-${index}`} x1={x} y1="22" x2={x} y2="206" stroke="#EEF2F7" strokeWidth="1" />;
                      })}
                      {Array.from({ length: 7 }).map((_, index) => {
                        const y = 22 + index * 30;
                        return <line key={`h-${index}`} x1="40" y1={y} x2="620" y2={y} stroke="#EEF2F7" strokeWidth="1" />;
                      })}
                      <polyline
                        fill="none"
                        stroke="#6A8AE8"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        points="40,172 95,170 150,166 205,176 260,139 315,131 370,181 425,137 480,89 535,97 590,22 620,20"
                      />
                      <line x1="40" y1="206" x2="620" y2="206" stroke="#9CA3AF" strokeWidth="1.25" />
                      {["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].map((label, index) => (
                        <text key={label} x={40 + index * 53} y="224" fill="#9CA3AF" fontSize="10" textAnchor="middle">
                          {label}
                        </text>
                      ))}
                    </g>
                  </svg>
                </div>
              </div>
            </article>
          </section>

          <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <article className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] sm:p-6">
              <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-0.5">
                    <h2 className="text-xl font-semibold tracking-tight text-slate-900">Opportunities to Outrank Competitors</h2>
                    <SectionHeadingTooltip title="Opportunities to Outrank Competitors" />
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    Data-backed actions to close visibility gaps and capture missed AI-driven traffic.
                  </p>
                </div>
                <button
                  type="button"
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-[#F5F8FF] px-4 text-sm font-semibold text-[#4C74C2] transition hover:bg-[#EEF4FF] focus:outline-none focus:ring-2 focus:ring-[#4C74C2] focus:ring-offset-2"
                >
                  View all
                </button>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-600 shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
                >
                  <ArrowUpDown className="h-4 w-4" />
                  Sort: By Models
                  <ChevronDown className="h-4 w-4 text-slate-400" />
                </button>
                <button
                  type="button"
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-600 shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
                >
                  <span className="text-base">?</span>
                  Filters (2)
                  <ChevronDown className="h-4 w-4 text-slate-400" />
                </button>
                <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
                  Gemini 2.0
                  <button type="button" className="ml-1 text-slate-400" aria-label="Remove Gemini 2.0 filter">
                    ×
                  </button>
                </span>
                <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600">
                  +1
                </span>
              </div>

              <div className="mt-5 space-y-4">
                {Array.from({ length: 4 }).map((_, index) => (
                  <article
                    key={index}
                    className="rounded-[12px] border border-[#E8EDF7] bg-white px-4 py-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <h3 className="truncate text-base italic text-[#374151]">
                          Create comprehensive backlink analysis guide
                        </h3>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center rounded-full border border-[#FECACA] bg-[#FFF1F1] px-2.5 py-0.5 text-[11px] font-medium text-[#EF4444]">
                            Critical
                          </span>
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#15803D]">
                            <span>?</span>
                            Very High
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        className="inline-flex items-center gap-2 rounded-xl border border-[#D9E4FF] bg-[#F5F8FF] px-4 py-2 text-sm font-semibold text-[#3B5BDB] shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
                      >
                        <span className="text-base">?</span>
                        Draft
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </article>

            <article className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] sm:p-6">
              <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-5">
                <div>
                  <div className="flex items-center gap-0.5">
                    <h2 className="text-xl font-semibold tracking-tight text-slate-900">GSC Analytics</h2>
                    <SectionHeadingTooltip title="GSC Analytics" />
                  </div>
                </div>
                <button
                  type="button"
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
                >
                  <Calendar className="h-4 w-4" />
                  Last Month
                </button>
              </div>

              <div className="mt-6 h-[380px]">
                <svg viewBox="0 0 640 380" className="h-full w-full" aria-hidden="true" preserveAspectRatio="none">
                  <g>
                    {Array.from({ length: 6 }).map((_, index) => {
                      const y = 40 + index * 55;
                      return <line key={`gsc-grid-${index}`} x1="48" y1={y} x2="620" y2={y} stroke="#EEF2F7" strokeWidth="1" />;
                    })}
                    <line x1="48" y1="334" x2="620" y2="334" stroke="#D1D5DB" strokeWidth="1.25" />
                    <polyline
                      fill="none"
                      stroke="#5B7CFF"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      points="48,260 82,260 116,252 150,246 184,228 218,210 252,228 286,228 320,224 354,218 388,214 422,208 456,198 490,170 524,164 558,112 592,110 620,118"
                    />
                    <polyline
                      fill="none"
                      stroke="#9EB5FF"
                      strokeWidth="2"
                      strokeDasharray="3 7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      points="48,300 82,320 116,312 150,302 184,272 218,284 252,264 286,252 320,246 354,264 388,258 422,262 456,236 490,244 524,212 558,206 592,192 620,200"
                    />
                    <polyline
                      fill="none"
                      stroke="#8B5CF6"
                      strokeWidth="2"
                      strokeDasharray="2 8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      points="48,334 82,312 116,322 150,314 184,306 218,282 252,280 286,262 320,250 354,252 388,246 422,232 456,236 490,220 524,230 558,204 592,186 620,168"
                    />
                    {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((label, index) => (
                      <text key={label} x={48 + index * 52} y="354" fill="#6B7280" fontSize="10" textAnchor="middle">
                        {label}
                      </text>
                    ))}
                  </g>
                </svg>
              </div>
            </article>
          </section>          {showAuditModal ? (
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
                            return `${best.k} - ${best.s}%`;
                          })()
                        ) : (
                          "-"
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
