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
  ArrowUpRight,
  BarChart3,
  Calendar,
  ChevronRight,
  ExternalLink,
  FileText,
  FolderOpen,
  Loader2,
  Search,
  Send,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { AlertDialogHeader } from "@/components/ui/alert-dialog";
import { OverallScoreGauge } from "@/components/audit/AuditCharts";
import { AuditPDF } from "@/components/audit/AuditPDF";
import D3LineChart from "@/components/charts/D3LineChart";
import { cn } from "@/lib/utils";
import type { OverviewSectionProps } from "@/features/sidebar-dashboard/types";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3002";

interface BlogDateBreakdown {
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
  dateBreakdown: BlogDateBreakdown[];
  totalBlogsAnalyzed: number;
}

interface CompetitorRow {
  domain: string;
  keywords: number;
  overlap: number;
  estimatedTraffic: number | string;
}

interface CampaignSummary {
  id: number;
  title: string;
}

const RECENT_ACTIVITY: Array<{ title: string; meta: string }> = [
  { title: 'Published "Ultimate Guide to SEO"', meta: "less than a minute ago" },
  { title: 'Edited "Keyword Research Tips"', meta: "about 1 hour ago" },
  { title: 'Generated "Link Building Strategies"', meta: "about 1 hour ago" },
  { title: "Added 15 new keywords", meta: "about 1 hour ago" },
  { title: "Generated subpages from top keywords", meta: "about 1 hour ago" },
];

interface NextAction {
  title: string;
  description: string;
  Icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  iconFg: string;
  rowBg: string;
}

const SUGGESTED_ACTIONS: NextAction[] = [
  {
    title: "Publish-Ready Blog",
    description: "These blogs have been reviewed and are ready to go live",
    Icon: Send,
    iconBg: "bg-yellow-100",
    iconFg: "text-yellow-700",
    rowBg: "bg-yellow-50/40",
  },
  {
    title: "Integrate your website",
    description: "Enable one-click publishing to your site",
    Icon: ({ className }) => (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M12.158 12.786 9.46 20.625a9 9 0 0 0 5.526-.144c-.05-.082-.06-.164-.118-.247Zm-9.057-3.86a8.95 8.95 0 0 0 4.683 7.84L3.846 8.18a9 9 0 0 0-.745 3.747l.001.998Zm15.143-.479c0-1.082-.387-1.832-.722-2.417-.443-.722-.86-1.337-.86-2.06 0-.808.611-1.557 1.473-1.557h.108A8.957 8.957 0 0 0 12 1.108a9 9 0 0 0-7.55 4.13c.394.012.772.02 1.092.02 1.029 0 2.62-.117 2.62-.117.531-.03.594.749.063.81 0 0-.534.062-1.127.094l3.59 10.681 2.158-6.469-1.535-4.211c-.531-.031-1.034-.094-1.034-.094-.531-.031-.469-.84.062-.81 0 0 1.621.122 2.591.122 1.029 0 2.621-.117 2.621-.117.532-.03.594.749.063.81 0 0-.535.062-1.127.094l3.563 10.6 1.014-3.144c.444-1.349.78-2.301.78-3.131Z" />
      </svg>
    ),
    iconBg: "bg-pink-100",
    iconFg: "text-pink-600",
    rowBg: "bg-pink-50/50",
  },
  {
    title: "Connect Google Search Console",
    description: "Enable your google search console to fetch data",
    Icon: ({ className }) => (
      <svg className={className} viewBox="0 0 24 24" fill="none">
        <path
          d="M12 4 4 8.5l8 4.5 8-4.5L12 4Z"
          fill="#4285F4"
        />
        <path d="M4 8.5v6L12 19v-6L4 8.5Z" fill="#34A853" />
        <path d="M20 8.5v6L12 19v-6l8-4.5Z" fill="#FBBC04" />
      </svg>
    ),
    iconBg: "bg-red-100",
    iconFg: "text-red-600",
    rowBg: "bg-red-50/40",
  },
  {
    title: "Optimize 2 Blogs",
    description: "Optimize content to improve search rankings",
    Icon: TrendingUp,
    iconBg: "bg-blue-100",
    iconFg: "text-blue-600",
    rowBg: "bg-white",
  },
  {
    title: "Create Pages from Top Keywords",
    description: "Create supporting content to boost your pillar pages",
    Icon: FolderOpen,
    iconBg: "bg-amber-100",
    iconFg: "text-amber-600",
    rowBg: "bg-white",
  },
];

const getAuthHeaders = (): HeadersInit => {
  const token = localStorage.getItem("authToken");
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
};

function formatNumber(value: number | undefined | null): string {
  if (value === undefined || value === null || Number.isNaN(value)) return "—";
  if (value >= 1000) {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    return value.toLocaleString();
  }
  return value.toString();
}

function deriveBrandFromDomain(input: string | undefined | null): string {
  if (!input) return "—";
  return input.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
}

interface KpiCardProps {
  label: string;
  value: string | number;
  Icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  iconFg: string;
  delta?: { text: string; trend: "up" | "down" | "info" };
}

function KpiCard({ label, value, Icon, iconBg, iconFg, delta }: KpiCardProps) {
  const deltaColor =
    delta?.trend === "up"
      ? "text-green-600"
      : delta?.trend === "down"
      ? "text-red-600"
      : "text-amber-600";
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5 hover:shadow-sm transition">
      <div className="flex items-center gap-3 sm:gap-4">
        <div
          className={cn(
            "h-12 w-12 sm:h-14 sm:w-14 rounded-full flex items-center justify-center shrink-0",
            iconBg
          )}
        >
          <Icon className={cn("h-6 w-6 sm:h-7 sm:w-7", iconFg)} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs sm:text-sm text-gray-500 truncate">{label}</p>
          <div className="mt-1 flex items-end justify-between gap-2">
            <p className="text-xl sm:text-2xl font-semibold text-gray-900 truncate">
              {value}
            </p>
            {delta && (
              <p className={cn("text-xs sm:text-sm font-medium whitespace-nowrap", deltaColor)}>
                {delta.text}
              </p>
            )}
          </div>
          {delta?.trend === "info" && (
            <p className="text-[10px] text-amber-600 mt-0.5">New invitations</p>
          )}
        </div>
      </div>
    </div>
  );
}

interface AuditMetricTileProps {
  label: string;
  pct: number;
}

function AuditMetricTile({ label, pct }: AuditMetricTileProps) {
  return (
    <div className="rounded-lg border border-gray-100 bg-white p-3 flex items-center gap-3">
      <BarChart3 className="h-7 w-7 text-gray-500 shrink-0" />
      <div className="flex flex-col">
        <span className="text-xs sm:text-sm text-gray-600">{label}</span>
        <span className="text-xl font-semibold text-gray-900">{pct}%</span>
      </div>
    </div>
  );
}

export function OverviewSection({
  auditResult,
  campaigns,
  campaignsCount,
  companyDomain,
  domainId,
  keywordsTableData,
  normalizedDomain,
  onOpenAnalytics,
  onOpenAuditDetails,
  onOpenCompetitor,
  onVisitSite,
}: OverviewSectionProps) {
  const [activePerfTab, setActivePerfTab] = useState<"blogs" | "keywords">("blogs");
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [competitorSearch, setCompetitorSearch] = useState("");
  const resultsRef = useRef<HTMLDivElement | null>(null);

  const handleViewReport = () => {
    setShowAuditModal(false);
    setTimeout(() => {
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 220);
  };

  // ----- GSC connection + organic traffic -----
  const { data: gscStatus } = useQuery({
    queryKey: ["gscStatusOverview"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE_URL}/api/gsc/status`, { headers: getAuthHeaders() });
      if (!res.ok) return { connected: false };
      return res.json();
    },
  });
  const gscConnected = !!gscStatus?.connected;

  const { data: pagesData } = useQuery({
    queryKey: ["gscPagesOverview"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE_URL}/api/gsc/pages?days=28`, { headers: getAuthHeaders() });
      if (!res.ok) return { success: false, pages: [] };
      return res.json();
    },
    enabled: gscConnected,
  });

  const organicTrafficClicks = useMemo<number>(() => {
    if (!pagesData?.success || !Array.isArray(pagesData.pages)) return 0;
    return (pagesData.pages as Array<{ clicks?: number }>).reduce(
      (sum, page) => sum + (page.clicks || 0),
      0
    );
  }, [pagesData]);

  // ----- Blog analytics aggregate (clicks/impressions over time) -----
  const { data: blogAggregateData } = useQuery<AggregateData | null>({
    queryKey: ["blogAggregateOverview"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE_URL}/api/blog-analytics/aggregate?days=28`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data?.success ? data : null;
    },
  });

  const blogClicksData = useMemo(
    () => blogAggregateData?.dateBreakdown.map((d) => ({ date: d.date, value: d.clicks })) ?? [],
    [blogAggregateData]
  );
  const blogImpressionsData = useMemo(
    () => blogAggregateData?.dateBreakdown.map((d) => ({ date: d.date, value: d.impressions })) ?? [],
    [blogAggregateData]
  );

  // ----- Campaign topics → Blogs Published / In Progress -----
  const campaignList: CampaignSummary[] = campaigns ?? [];

  const { data: topicCounts } = useQuery({
    queryKey: ["campaignTopicCountsOverview", campaignList.map((c) => c.id).join(",")],
    queryFn: async () => {
      if (!campaignList.length) return { published: 0, inProgress: 0 };
      const results = await Promise.all(
        campaignList.map(async (c) => {
          try {
            const res = await fetch(`${API_BASE_URL}/api/campaigns/${c.id}/structure`, {
              headers: getAuthHeaders(),
            });
            if (!res.ok) return { published: 0, inProgress: 0 };
            const data = await res.json();
            const topics: Array<{ publishStatus?: string | null }> = data?.structure?.topics ?? [];
            let published = 0;
            let inProgress = 0;
            for (const topic of topics) {
              if ((topic.publishStatus ?? "").toLowerCase() === "published") published += 1;
              else inProgress += 1;
            }
            return { published, inProgress };
          } catch {
            return { published: 0, inProgress: 0 };
          }
        })
      );
      return results.reduce(
        (acc, cur) => ({
          published: acc.published + cur.published,
          inProgress: acc.inProgress + cur.inProgress,
        }),
        { published: 0, inProgress: 0 }
      );
    },
    enabled: campaignList.length > 0,
  });

  const blogsPublished = topicCounts?.published ?? 0;
  const blogsInProgress = topicCounts?.inProgress ?? 0;

  // ----- Competitor data -----
  const { data: competitorData } = useQuery<CompetitorRow[]>({
    queryKey: ["competitorOverview", domainId],
    queryFn: async () => {
      if (!domainId) return [];
      const res = await fetch(`${API_BASE_URL}/api/competitor/${domainId}`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) return [];
      const data = await res.json();
      const metrics = data?.competitiveAnalysis?.metricsTable ?? [];
      return (metrics as Array<{
        domain: string;
        keywords?: number;
        keywordCount?: number;
        estimatedKeywordCount?: number;
        overlap?: number;
        traffic?: number | string;
        estimatedTraffic?: number | string;
        estimatedMonthlyTraffic?: number | string;
      }>).map((m) => ({
        domain: m.domain,
        keywords: Number(m.keywords ?? m.keywordCount ?? m.estimatedKeywordCount ?? 0),
        overlap: Number(m.overlap ?? 0),
        estimatedTraffic: m.traffic ?? m.estimatedTraffic ?? m.estimatedMonthlyTraffic ?? "—",
      }));
    },
    enabled: !!domainId,
  });

  const filteredCompetitors = useMemo(() => {
    const rows = competitorData ?? [];
    if (!competitorSearch.trim()) return rows;
    const q = competitorSearch.toLowerCase();
    return rows.filter((r) => r.domain?.toLowerCase().includes(q));
  }, [competitorData, competitorSearch]);

  // ----- Performance Over Time data (Blogs vs Keywords) -----
  const keywordsValueData = useMemo(() => {
    if (!keywordsTableData?.length) return [];
    return keywordsTableData
      .slice()
      .sort((a, b) => (b.volume || 0) - (a.volume || 0))
      .slice(0, 12)
      .map((k, idx) => ({ date: k.keyword?.slice(0, 10) || `kw-${idx}`, value: k.volume || 0 }));
  }, [keywordsTableData]);

  // ----- Top Growth Opportunities -----
  const topOpportunities = useMemo(() => {
    return keywordsTableData
      .slice()
      .sort((a, b) => (b.volume || 0) - (a.volume || 0))
      .slice(0, 6);
  }, [keywordsTableData]);

  return (
    <>
      {/* ===== AUDIT COMPLETED MODAL ===== */}
      {showAuditModal && (
        <AlertDialog open={showAuditModal} onOpenChange={setShowAuditModal}>
          <AlertDialogOverlay className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40" />
          <AlertDialogContent className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 max-w-md w-full rounded-2xl bg-white border border-gray-200 shadow-2xl">
            <div className="p-4 rounded-lg bg-gradient-to-r from-white/80 to-gray-50 border border-gray-200">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-2xl font-medium">Audit Completed</AlertDialogTitle>
                <AlertDialogDescription className="text-sm text-muted-foreground">
                  Your domain audit has finished. Here&apos;s a quick summary — you can view the full
                  report or download it.
                </AlertDialogDescription>
              </AlertDialogHeader>

              <div className="mt-4 flex items-center gap-4">
                <div className="flex-shrink-0">
                  <OverallScoreGauge
                    score={
                      Math.round(
                        ((auditResult?.performance || 0) +
                          (auditResult?.seo || 0) +
                          (auditResult?.accessibility || 0) +
                          (auditResult?.bestPractices || 0)) /
                          4 *
                          100
                      ) / 100 || 0
                    }
                  />
                </div>
                <div className="flex-1">
                  <div className="text-sm text-gray-600 mb-2">Top category</div>
                  <div className="text-base font-medium text-gray-900">
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
                        return `${best.k} — ${best.s}%`;
                      })()
                    ) : (
                      "—"
                    )}
                  </div>
                  <div className="text-xs text-gray-500 mt-2">Click below to view the full report.</div>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-end gap-2">
                {auditResult && companyDomain && (
                  <PDFDownloadLink
                    document={<AuditPDF data={auditResult} domain={companyDomain} />}
                    fileName={`audit-${companyDomain}-${new Date().toISOString().split("T")[0]}.pdf`}
                    className="px-4 py-2 rounded-full border border-gray-200 text-sm font-light bg-white hover:bg-gray-50 flex items-center justify-center"
                  >
                    {({ loading }) => (loading ? "Preparing..." : "Export PDF")}
                  </PDFDownloadLink>
                )}
                <AlertDialogAction
                  onClick={handleViewReport}
                  className="px-4 py-2 rounded-full bg-black text-white text-sm"
                >
                  View Full Report
                </AlertDialogAction>
                <AlertDialogCancel className="px-4 py-2 rounded-full border border-gray-200 text-sm">
                  Close
                </AlertDialogCancel>
              </div>
            </div>
          </AlertDialogContent>
        </AlertDialog>
      )}

      <div ref={resultsRef} className="px-4 sm:px-6 py-4 sm:py-6 space-y-5 sm:space-y-6">
        {/* ===== HERO: FREE WEBSITE AUDIT ===== */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
          <p className="text-xs sm:text-sm text-gray-500">Free Website Audit</p>
          <h2 className="mt-1 text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 leading-tight">
            Deep scan your site for SEO, speed and visibility gaps in seconds.
          </h2>
          <p className="mt-2 text-sm text-gray-500 max-w-3xl">
            Scan your website to uncover SEO issues, improve performance, and boost search visibility
            with actionable insights.
          </p>

          <div className="mt-5 flex flex-col sm:flex-row gap-3">
            <div className="flex-1 flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gray-200 bg-white min-w-0">
              {companyDomain && normalizedDomain ? (
                <img
                  src={`https://img.logo.dev/${normalizedDomain}?token=pk_DTdFFG1JT9WOCjATvZEzIA&size=64`}
                  alt="Site logo"
                  width={20}
                  height={20}
                  className="h-5 w-5 rounded shrink-0"
                  loading="lazy"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : (
                <ExternalLink className="h-4 w-4 text-gray-400 shrink-0" />
              )}
              <a
                href={
                  companyDomain
                    ? companyDomain.startsWith("http")
                      ? companyDomain
                      : `https://${companyDomain}`
                    : "#"
                }
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:underline truncate"
              >
                {companyDomain
                  ? companyDomain.replace(/^https?:\/\//, "").replace(/^www\./, "")
                  : "https://domain.com/"}
              </a>
            </div>

            <button
              type="button"
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition shrink-0"
            >
              <span className="text-lg leading-none">+</span>
              Add New Domain
            </button>
          </div>
        </div>

        {/* ===== OVERVIEW HEADER ===== */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-1">
          <h2 className="text-lg sm:text-xl font-bold text-gray-900">Overview</h2>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={onVisitSite}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-blue-600 rounded-lg hover:bg-blue-50 transition"
            >
              <ExternalLink className="h-4 w-4" />
              Visit Site
            </button>
            <button
              onClick={onOpenAnalytics}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
            >
              <TrendingUp className="h-4 w-4" />
              Analytics
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
            >
              <Calendar className="h-4 w-4" />
              Select Duration
            </button>
          </div>
        </div>

        {/* ===== KPI GRID ===== */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <KpiCard
            label="Organic Traffic"
            value={formatNumber(organicTrafficClicks)}
            Icon={TrendingUp}
            iconBg="bg-green-50"
            iconFg="text-green-600"
            delta={
              gscConnected
                ? { text: "+12.5% from last month", trend: "up" }
                : undefined
            }
          />
          <KpiCard
            label="Keywords"
            value={formatNumber(keywordsTableData.length)}
            Icon={Search}
            iconBg="bg-blue-50"
            iconFg="text-blue-600"
            delta={{ text: `+${Math.min(keywordsTableData.length, 2)}`, trend: "up" }}
          />
          <KpiCard
            label="Blogs Published"
            value={formatNumber(blogsPublished)}
            Icon={FileText}
            iconBg="bg-amber-50"
            iconFg="text-amber-600"
            delta={
              blogsPublished === 0
                ? { text: "Awaiting Response", trend: "info" }
                : { text: `+${blogsPublished}`, trend: "up" }
            }
          />
          <KpiCard
            label="Blogs in Progress"
            value={formatNumber(blogsInProgress)}
            Icon={Sparkles}
            iconBg="bg-purple-50"
            iconFg="text-purple-600"
            delta={
              blogsInProgress > 0
                ? { text: `${campaignsCount} projects`, trend: "up" }
                : undefined
            }
          />
        </div>

        {/* ===== ROW 1: AUDIT SUMMARY | PERFORMANCE OVER TIME ===== */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
          {/* Audit Summary */}
          <div className="rounded-xl bg-white border border-gray-200 p-5 sm:p-6">
            <div className="flex items-start justify-between mb-4 gap-3">
              <div className="min-w-0">
                <h3 className="text-base sm:text-lg font-semibold text-gray-900">Audit summary</h3>
                <p className="text-xs text-gray-500 mt-0.5">Lighthouse performance breakdown</p>
              </div>
              <button
                onClick={onOpenAuditDetails}
                className="group text-xs sm:text-sm font-medium text-gray-700 hover:text-gray-900 flex items-center gap-1 shrink-0"
              >
                View Details
                <ChevronRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </button>
            </div>

            {!auditResult ? (
              <p className="text-sm text-gray-500">Run an audit to view performance metrics.</p>
            ) : (
              <div className="flex flex-col sm:flex-row gap-4 sm:gap-6">
                <div className="grid grid-cols-2 gap-3 flex-1">
                  <AuditMetricTile label="Performance" pct={Math.round((auditResult.performance || 0) * 100)} />
                  <AuditMetricTile label="SEO" pct={Math.round((auditResult.seo || 0) * 100)} />
                  <AuditMetricTile label="Accessibility" pct={Math.round((auditResult.accessibility || 0) * 100)} />
                  <AuditMetricTile label="Best Practices" pct={Math.round((auditResult.bestPractices || 0) * 100)} />
                </div>
                <div className="flex items-center justify-center shrink-0">
                  <OverallScoreGauge
                    size={170}
                    score={
                      ((auditResult.performance || 0) +
                        (auditResult.seo || 0) +
                        (auditResult.accessibility || 0) +
                        (auditResult.bestPractices || 0)) /
                      4
                    }
                  />
                </div>
              </div>
            )}
          </div>

          {/* Performance Over Time */}
          <div className="rounded-xl bg-white border border-gray-200 p-5 sm:p-6">
            <div className="flex items-start justify-between mb-4 gap-3">
              <h3 className="text-base sm:text-lg font-semibold text-gray-900">
                Performance Over Time
              </h3>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <div className="inline-flex rounded-lg border border-gray-200 p-0.5 self-start">
                {(["blogs", "keywords"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActivePerfTab(tab)}
                    className={cn(
                      "px-3 sm:px-4 py-1.5 text-xs sm:text-sm font-medium rounded-md transition capitalize",
                      activePerfTab === tab
                        ? "bg-gray-900 text-white"
                        : "text-gray-600 hover:bg-gray-50"
                    )}
                  >
                    {tab}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition self-start"
              >
                <Calendar className="h-4 w-4" />
                Select Duration
              </button>
            </div>

            <div className="w-full overflow-hidden">
              {activePerfTab === "blogs" ? (
                blogClicksData.length === 0 ? (
                  <div className="h-[200px] flex items-center justify-center text-sm text-gray-400">
                    {gscConnected ? "No blog performance data yet." : "Connect GSC to see blog trends."}
                  </div>
                ) : (
                  <D3LineChart
                    data={blogClicksData}
                    secondaryData={blogImpressionsData}
                    width={600}
                    height={200}
                    primaryColor="#111111"
                    secondaryColor="#4E76C7"
                    primaryLabel="Clicks"
                    secondaryLabel="Impressions"
                  />
                )
              ) : keywordsValueData.length === 0 ? (
                <div className="h-[200px] flex items-center justify-center text-sm text-gray-400">
                  No keyword data available.
                </div>
              ) : (
                <D3LineChart
                  data={keywordsValueData}
                  width={600}
                  height={200}
                  primaryColor="#4E76C7"
                  primaryLabel="Search Volume"
                />
              )}
            </div>
          </div>
        </div>

        {/* ===== ROW 2: GROWTH OPPORTUNITIES | GSC ANALYTICS ===== */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
          {/* Growth Opportunities */}
          <div className="rounded-xl bg-white border border-gray-200 p-5 sm:p-6">
            <div className="flex items-start justify-between mb-4 gap-3">
              <h3 className="text-base sm:text-lg font-semibold text-gray-900">
                Growth Opportunities
              </h3>
              <button
                onClick={onOpenAnalytics}
                className="group text-xs sm:text-sm font-medium text-gray-700 hover:text-gray-900 flex items-center gap-1 shrink-0"
              >
                View Details
                <ChevronRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </button>
            </div>

            {topOpportunities.length === 0 ? (
              <p className="text-sm text-gray-500">No keywords yet — add some to see growth opportunities.</p>
            ) : (
              <ul className="space-y-3">
                {topOpportunities.map((item, idx) => (
                  <li key={`${item.keyword}-${idx}`} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm sm:text-base font-medium text-gray-900 truncate">
                        {item.keyword
                          ? item.keyword.charAt(0).toUpperCase() + item.keyword.slice(1)
                          : "—"}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">High potential growth keyword</p>
                    </div>
                    <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-green-50 shrink-0">
                      <ArrowUpRight className="h-4 w-4 text-green-600" />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* GSC Analytics — small chart */}
          <div className="rounded-xl bg-white border border-gray-200 p-5 sm:p-6">
            <div className="flex items-start justify-between mb-4 gap-3">
              <h3 className="text-base sm:text-lg font-semibold text-gray-900">GSC Analytics</h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
                >
                  <Calendar className="h-4 w-4" />
                  Select Duration
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
                >
                  Sort
                </button>
              </div>
            </div>

            <div className="w-full overflow-hidden">
              {!gscConnected ? (
                <div className="h-[200px] flex items-center justify-center text-sm text-gray-400">
                  Google Search Console not connected.
                </div>
              ) : blogClicksData.length === 0 ? (
                <div className="h-[200px] flex items-center justify-center text-sm text-gray-400">
                  No analytics data yet.
                </div>
              ) : (
                <D3LineChart
                  data={blogClicksData}
                  secondaryData={blogImpressionsData}
                  width={600}
                  height={200}
                  primaryColor="#4E76C7"
                  secondaryColor="#94a3b8"
                  primaryLabel="Clicks"
                  secondaryLabel="Impressions"
                />
              )}
            </div>
          </div>
        </div>

        {/* ===== ROW 3: RECENT ACTIVITY | SUGGESTED NEXT ACTIONS ===== */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
          {/* Recent Activity */}
          <div className="rounded-xl bg-white border border-gray-200 p-5 sm:p-6">
            <div className="flex items-start justify-between mb-4 gap-3">
              <h3 className="text-base sm:text-lg font-semibold text-gray-900">Recent Activity</h3>
              <button
                type="button"
                className="text-xs sm:text-sm font-medium text-gray-700 hover:text-gray-900"
              >
                View All
              </button>
            </div>

            <ul className="divide-y divide-gray-100">
              {RECENT_ACTIVITY.map((item, idx) => (
                <li key={idx} className="py-3 sm:py-4">
                  <p className="text-sm sm:text-base font-medium text-gray-900 truncate">
                    {item.title}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">{item.meta}</p>
                </li>
              ))}
            </ul>
          </div>

          {/* Suggested Next Actions */}
          <div className="rounded-xl bg-white border border-gray-200 p-5 sm:p-6">
            <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-4">
              Suggested Next Actions
            </h3>
            <ul className="space-y-3">
              {SUGGESTED_ACTIONS.map((action, idx) => (
                <li
                  key={idx}
                  className={cn(
                    "flex items-center gap-3 sm:gap-4 rounded-lg border border-gray-100 p-3 sm:p-4 hover:border-gray-300 transition cursor-pointer",
                    action.rowBg
                  )}
                >
                  <div
                    className={cn(
                      "h-10 w-10 rounded-lg flex items-center justify-center shrink-0",
                      action.iconBg
                    )}
                  >
                    <action.Icon className={cn("h-5 w-5", action.iconFg)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm sm:text-base font-medium text-gray-900 truncate">
                      {action.title}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{action.description}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-gray-400 shrink-0" />
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* ===== COMPETITOR OVERVIEW ===== */}
        <div className="rounded-xl bg-white border border-gray-200 p-5 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div className="flex items-center gap-3">
              <h3 className="text-base sm:text-lg font-semibold text-gray-900">Competitor overview</h3>
              {onOpenCompetitor && (
                <button
                  onClick={onOpenCompetitor}
                  className="text-xs sm:text-sm font-medium text-blue-600 hover:underline"
                >
                  View all
                </button>
              )}
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={competitorSearch}
                onChange={(e) => setCompetitorSearch(e.target.value)}
                placeholder="Find Keyword..."
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
              />
            </div>
          </div>

          <div className="overflow-x-auto -mx-5 sm:mx-0">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="border-y border-gray-100 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                  <th className="px-4 sm:px-5 py-3 font-medium">Domain</th>
                  <th className="px-4 sm:px-5 py-3 font-medium">Key words</th>
                  <th className="px-4 sm:px-5 py-3 font-medium">Overlap</th>
                  <th className="px-4 sm:px-5 py-3 font-medium text-right">Est. Traffic</th>
                </tr>
              </thead>
              <tbody>
                {filteredCompetitors.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 sm:px-5 py-8 text-center text-sm text-gray-400">
                      {domainId
                        ? "No competitors yet — run an analysis to populate this table."
                        : "Connect a domain to see competitor overview."}
                    </td>
                  </tr>
                ) : (
                  filteredCompetitors.slice(0, 4).map((row, idx) => (
                    <tr key={`${row.domain}-${idx}`} className="border-b border-gray-100 last:border-0">
                      <td className="px-4 sm:px-5 py-4 text-gray-900 font-medium">
                        {deriveBrandFromDomain(row.domain)}
                      </td>
                      <td className="px-4 sm:px-5 py-4 text-gray-700">
                        {formatNumber(row.keywords)}
                      </td>
                      <td className="px-4 sm:px-5 py-4">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-blue-50 text-blue-600 text-xs font-medium">
                          {row.overlap ? `${Math.round(row.overlap)}%` : "—"}
                        </span>
                      </td>
                      <td className="px-4 sm:px-5 py-4 text-gray-700 text-right">
                        {typeof row.estimatedTraffic === "number"
                          ? formatNumber(row.estimatedTraffic)
                          : row.estimatedTraffic}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
