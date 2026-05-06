import {
  AlertTriangle,
  CalendarDays,
  Check,
  ChevronDown,
  CircleAlert,
  Eye,
  Globe,
  Grid2x2,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiGet } from "../../../services/apiClient";
import { maskDomainId } from "../../../lib/domainUtils";
import { AddDomainModal } from "../components/AddDomainModal";
import { TabId } from "../types";

type DashboardDomain = {
  id: number;
  url: string;
  context?: string;
  lastAnalyzed?: string;
  currentStep?: number;
  metrics?: {
    visibilityScore?: number;
    keywordCount?: number;
    phraseCount?: number;
    totalQueries?: number;
  };
  industry?: string;
};

type DomainItem = {
  id: number;
  name: string;
  url: string;
  status: "success" | "retry";
  visibility?: number;
  topKeywords?: number;
  topPrompts?: number;
};

type FetchState =
  | { status: "loading" }
  | { status: "ready"; domains: DashboardDomain[] }
  | { status: "error"; message: string };

const getLogoUrl = (domainUrl: string) => {
  const host = domainUrl.replace(/^https?:\/\//, "").replace(/^www\./, "");
  return `https://img.logo.dev/${host}?token=pk_DTdFFG1JT9WOCjATvZEzIA&size=64`;
};

const getDisplayName = (domain: DashboardDomain) => {
  return domain.url.replace(/^https?:\/\//, "").replace(/^www\./, "");
};

const toItem = (d: DashboardDomain): DomainItem => {
  const isComplete = d.currentStep === 4 && Boolean(d.metrics);
  return {
    id: d.id,
    name: getDisplayName(d),
    url: d.url,
    status: isComplete ? "success" : "retry",
    visibility: d.metrics?.visibilityScore,
    topKeywords: d.metrics?.keywordCount,
    topPrompts: d.metrics?.phraseCount,
  };
};

interface DomainHistorySectionProps {
  onMenuItemClick?: (tabId: TabId, domainId?: string | number) => void;
}

export function DomainHistorySection({ onMenuItemClick }: DomainHistorySectionProps) {
  const navigate = useNavigate();
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [state, setState] = useState<FetchState>({ status: "loading" });
  const [retryUrl, setRetryUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    apiGet<{ domains: DashboardDomain[] }>("/dashboard/all")
      .then((data) => {
        if (!alive) return;
        setState({ status: "ready", domains: data?.domains ?? [] });
      })
      .catch((err) => {
        if (!alive) return;
        setState({
          status: "error",
          message: err instanceof Error ? err.message : "Failed to load domains",
        });
      });
    return () => {
      alive = false;
    };
  }, []);

  const allDomains = state.status === "ready" ? state.domains : [];

  const stats = useMemo(() => {
    const total = allDomains.length;
    const completed = allDomains.filter((d) => d.currentStep === 4).length;
    const inProgress = allDomains.filter(
      (d) => (d.currentStep ?? 0) > 0 && (d.currentStep ?? 0) < 4
    ).length;
    const totalQueries = allDomains.reduce(
      (sum, d) => sum + (d.metrics?.totalQueries ?? 0),
      0
    );
    const completedPct = total > 0 ? Math.round((completed / total) * 100) : 0;
    const inProgressPct = total > 0 ? Math.round((inProgress / total) * 100) : 0;

    return [
      {
        id: "total",
        title: "Total Queries",
        value: totalQueries.toLocaleString(),
        percent: total > 0 ? `${total}` : "0",
        subtext: "domains tracked",
        percentClass: "text-[#4e9f2d]",
        iconBg: "bg-[#eaf7e9]",
        iconColor: "text-[#4e9f2d]",
        icon: Globe,
      },
      {
        id: "completed",
        title: "Analysis Completed",
        value: completed.toString(),
        percent: `${completedPct}%`,
        subtext: "of domains",
        percentClass: "text-[#4e9f2d]",
        iconBg: "bg-[#eef3ff]",
        iconColor: "text-[#4f628a]",
        icon: Eye,
      },
      {
        id: "progress",
        title: "Analysis In Progress",
        value: inProgress.toString(),
        percent: `${inProgressPct}%`,
        subtext: "of domains",
        percentClass: "text-[#d59a00]",
        iconBg: "bg-[#fff7e5]",
        iconColor: "text-[#d59a00]",
        icon: CircleAlert,
      },
      {
        id: "error",
        title: "Error occured",
        value: "0",
        percent: "0%",
        subtext: "Retry",
        percentClass: "text-[#cf3d3d]",
        iconBg: "bg-[#ffeef0]",
        iconColor: "text-[#cf3d3d]",
        icon: AlertTriangle,
      },
    ];
  }, [allDomains]);

  const items = useMemo<DomainItem[]>(() => allDomains.map(toItem), [allDomains]);

  const filteredDomains = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (d) => d.name.toLowerCase().includes(q) || d.url.toLowerCase().includes(q)
    );
  }, [items, searchQuery]);

  const hasDomains = items.length > 0;

  const handleViewReport = (domain: DomainItem) => {
    navigate(`/ai-results/${maskDomainId(domain.id)}`);
  };

  const domainMenuItems = [
    "View AI Dashboard",
    "View Report",
    "Top Prompts",
    "Top Keywords",
    "Competitors",
    "Inspect",
  ];

  return (
    <div className="w-full">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-medium text-[#252b33]">Search History</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[#d7dbe3] bg-white px-3 text-xs font-medium text-[#a2aab8]"
          >
            <CalendarDays className="h-3.5 w-3.5" />
            Select Duration
          </button>
          <button
            type="button"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[#d7dbe3] bg-white px-3 text-xs font-medium text-[#a2aab8]"
          >
            <ShieldAlert className="h-3.5 w-3.5" />
            Sort
          </button>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 xl:grid-cols-4">
        {stats.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.id} className="rounded-xl border border-[#e2e6ee] bg-white p-4">
              <div className="flex items-center justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full ${item.iconBg}`}>
                    <Icon className={`h-4 w-4 ${item.iconColor}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-medium text-[#6d7583]">{item.title}</p>
                    <p className="text-[38px] font-semibold leading-none tracking-tight text-[#252b33]">{item.value}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-[26px] font-semibold leading-none ${item.percentClass}`}>{item.percent}</p>
                  <p className="mt-1 text-[11px] text-[#8e96a3]">{item.subtext}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="min-h-[210px] rounded-2xl border border-[#e2e6ee] bg-[#f7f8fb]">
        <div
          className={
            hasDomains
              ? "flex min-h-[280px] items-center justify-center gap-6 px-10"
              : "flex h-full min-h-[350px] flex-col items-center justify-center px-6 text-center"
          }
        >
          <div className={hasDomains ? "flex h-24 w-24 items-center justify-center" : "mb-4 flex h-16 w-16 items-center justify-center rounded-full shadow-sm"}>
            <img
              src="https://res.cloudinary.com/dgfzjdi68/image/upload/v1777375322/Group_fiapy5.png"
              alt=""
              className={hasDomains ? "h-24 w-24 object-contain" : "h-16 w-16 object-contain"}
            />
          </div>

          <div className={hasDomains ? "max-w-2xl" : ""}>
            <h3
              className={
                hasDomains
                  ? "text-[43px] font-semibold leading-tight tracking-tight text-[#252b33]"
                  : "text-[38px] font-semibold leading-tight tracking-tight text-[#252b33]"
              }
            >
              See how AI ranks your domain
            </h3>
            <p className="mt-2 max-w-2xl text-sm text-[#7f8795]">
              Uncover how your content appears in AI search, which keywords you're visible for, and
              where you're missing opportunities.
            </p>
            <button
              type="button"
              onClick={() => navigate("/ai-checker-page")}
              className="mt-5 inline-flex h-10 items-center gap-2 rounded-md px-5 text-sm font-medium text-white"
              style={{ background: "linear-gradient(90deg, #2D4059 0%, #4E76C7 100%)" }}
            >
              <Plus className="h-4 w-4" />
              Add Domain
            </button>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold tracking-tight text-[#252b33]">Analysis History</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[#d7dbe3] bg-white px-3 text-xs font-medium text-[#6b7382]"
            >
              <Grid2x2 className="h-3.5 w-3.5" />
              Grid
            </button>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#9aa3b2]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search Domains..."
                className="h-9 w-[250px] rounded-md border border-[#d7dbe3] bg-white pl-8 pr-3 text-xs text-[#374252] placeholder:text-[#a2aab8] focus:border-[#9cb0d9] focus:outline-none"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          {state.status === "loading" ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-[230px] animate-pulse rounded-xl border border-[#e2e6ee] bg-white"
              />
            ))
          ) : state.status === "error" ? (
            <div className="col-span-full rounded-xl border border-[#fad4d4] bg-[#fff5f5] p-8 text-center text-sm text-[#cf3d3d]">
              {state.message}
            </div>
          ) : filteredDomains.length === 0 ? (
            <div className="col-span-full rounded-xl border border-[#e2e6ee] bg-white p-8 text-center text-sm text-[#7f8795]">
              {searchQuery ? "No matching domains found." : "No domains analyzed yet."}
            </div>
          ) : (
            filteredDomains.map((domain) => (
              <div key={domain.id} className="rounded-xl border border-[#e2e6ee] bg-white p-4">
                <div className="mb-3 flex items-start justify-between">
                  <div className="relative min-w-0">
                    <div className="flex items-start gap-4">
                      <span className="inline-flex h-19 w-19 items-center justify-center rounded-md">
                        <img src={getLogoUrl(domain.url)} alt={`${domain.name} icon`} className="h-11 w-11 object-contain"/>
                      </span>
                      <div className="min-w-0 flex flex-col items-start">
                        <button
                          type="button"
                          onClick={() => setOpenMenuId((prev) => (prev === domain.id ? null : domain.id))}
                          className="inline-flex items-center gap-1 text-sm font-semibold text-[#252b33]"
                        >
                          {domain.name}
                          <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                        <div className="mt-1 block rounded bg-[#eef3fb] px-2 py-0.5 text-[10px] text-[#4e76c7]">
                          {domain.url}
                        </div>
                      </div>
                    </div>
                    {openMenuId === domain.id && (
                      <div className="absolute z-20 mt-2 w-44 rounded-md border border-[#d7dbe3] bg-white py-1 shadow-lg">
                        {domainMenuItems.map((item) => (
                          <button
                            key={item}
                            type="button"
                            onClick={() => {
                              if (item === "Competitors") {
                                onMenuItemClick?.("competitor-intelligence", domain.id);
                              } else if (
                                item === "View AI Dashboard" ||
                                item === "View Report" ||
                                item === "Top Prompts" ||
                                item === "Top Keywords"
                              ) {
                                handleViewReport(domain);
                              }
                              setOpenMenuId(null);
                            }}
                            className="block w-full px-3 py-2 text-left text-xs text-[#374252] hover:bg-[#f4f6fa]"
                          >
                            {item}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${domain.status === "retry" ? "bg-[#ffeef0]" : "bg-[#eaf7e9]"}`}>
                    {domain.status === "retry" ? (
                      <RefreshCw className="h-3.5 w-3.5 text-[#cf3d3d]" />
                    ) : (
                      <Check className="h-4 w-4 text-[#4e9f2d]" />
                    )}
                  </div>
                </div>

                {domain.status === "retry" ? (
                  <div className="flex h-[145px] flex-col items-center justify-center">
                    <p className="text-[20px] font-semibold text-[#414651]">Retry analysis</p>
                    <button
                      type="button"
                      onClick={() => setRetryUrl(domain.url)}
                      aria-label={`Retry analysis for ${domain.name}`}
                      className="mt-4 inline-flex h-11 w-11 items-center justify-center rounded-md bg-[#f0f3f8] text-[#4d5d78] hover:bg-[#e6ebf3]"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleViewReport(domain)}
                    className="block w-full text-left"
                  >
                    <div className="mb-2 border-t border-[#edf1f7] pt-3">
                      <p className="mb-2 text-[19px] font-semibold text-[#414651]">Visibility Score</p>
                      <div className="flex items-center gap-3">
                        <div className="h-2 flex-1 rounded-full bg-[#d6dbe5]">
                          <div className="h-2 rounded-full bg-[#6f8fc9]" style={{ width: `${domain.visibility ?? 0}%` }} />
                        </div>
                        <span className="text-4xl font-semibold leading-none text-[#6f8fc9]">{domain.visibility ?? 0}%</span>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-[18px] font-semibold text-[#5f6878] pb-2">Top Keywords</p>
                        <p className="text-[30px] font-medium leading-none text-[#3d83df]">{domain.topKeywords ?? 0}</p>
                      </div>
                      <div>
                        <p className="text-[18px] font-semibold text-[#5f6878] pb-2">Top Prompts</p>
                        <p className="text-[30px] font-medium leading-none text-[#3d83df]">{domain.topPrompts ?? 0}</p>
                      </div>
                    </div>
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <AddDomainModal
        open={retryUrl !== null}
        onOpenChange={(open) => {
          if (!open) setRetryUrl(null);
        }}
        initialUrl={retryUrl ?? ""}
        lockUrl
        title="Retry audit"
        description="Re-runs the full audit pipeline for this URL."
        ctaLabel="Retry audit"
      />
    </div>
  );
}
