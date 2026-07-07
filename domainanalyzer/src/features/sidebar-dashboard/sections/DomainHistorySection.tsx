import {
  AlertTriangle,
  CalendarDays,
  Check,
  ChevronDown,
  CircleAlert,
  Eye,
  Globe,
  Grid2x2,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { logoUrl as logoUrlHelper } from "@/lib/logoUrl";
import { useNavigate } from "react-router-dom";
import { apiGet } from "../../../services/apiClient";
import { buildDomainSlug } from "../../../lib/domainUtils";
import { AddDomainModal } from "../components/AddDomainModal";
import { TabId } from "../types";
import { resolveDashboardPath } from "../navigation";

type DashboardDomain = {
  id: number;
  url: string;
  context?: string;
  lastAnalyzed?: string;
  currentStep?: number;
  isCompanyDomain?: boolean;
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
  /**
   * - "success": run has completed at least once → render visibility score
   * - "inprogress": wizard partially done → render "Resume at Step N"
   * - "retry": never crawled → render "Run analysis"
   */
  status: "success" | "inprogress" | "retry";
  /** Wizard step the user left off at (1..5). Used for the resume label. */
  currentStep: number;
  /** The single user-owned domain marked as the brand's primary site. */
  isCompanyDomain: boolean;
  visibility?: number;
  topKeywords?: number;
  topPrompts?: number;
};

// Human-readable label for the next thing the user should DO, given the
// last completed phase (currentStep).
//
// Note: at currentStep 3 the topics LLM has generated, but the user has
// not yet picked which prompts to run — so the next user action is still
// "Pick prompts", not "Run analysis". The cached topics just mean the
// picker loads instantly when the user resumes.
const NEXT_STEP_LABEL: Record<number, string> = {
  0: "Start audit",
  1: "Pick competitors",
  2: "Pick prompts",
  3: "Pick prompts",
  4: "Resume run",
};

type FetchState =
  | { status: "loading" }
  | { status: "ready"; domains: DashboardDomain[] }
  | { status: "error"; message: string };

const getLogoUrl = (domainUrl: string) => logoUrlHelper(domainUrl, 64) ?? "";

const getDisplayName = (domain: DashboardDomain) => {
  return domain.url.replace(/^https?:\/\//, "").replace(/^www\./, "");
};

const MAX_DOMAIN_HISTORY_RETRIES = 6;
const DOMAIN_HISTORY_RETRY_DELAY_MS = 450;
const MAX_WIZARD_STEPS = 5;

const clampPercent = (value: number) => Math.min(100, Math.max(0, Math.round(value)));

const normalizeVisibilityScore = (value: number) => {
  return clampPercent(value <= 10 ? value * 10 : value);
};

const hasRenderableDomainDetails = (domain: DashboardDomain) => {
  return (
    typeof domain.currentStep === "number" ||
    typeof domain.metrics?.visibilityScore === "number" ||
    typeof domain.metrics?.keywordCount === "number" ||
    typeof domain.metrics?.phraseCount === "number" ||
    typeof domain.metrics?.totalQueries === "number" ||
    typeof domain.lastAnalyzed === "string" ||
    Boolean(domain.context) ||
    domain.isCompanyDomain === true
  );
};

const isRenderableDomainHistoryResponse = (domains: DashboardDomain[]) => {
  if (!Array.isArray(domains)) return false;
  if (domains.length === 0) return true;

  // The endpoint can briefly return a bare domain list while the analysis
  // fields are still hydrating. Keep the loader up until at least one domain
  // includes analysis-ready data.
  return domains.some(hasRenderableDomainDetails);
};

const toItem = (d: DashboardDomain): DomainItem => {
  const step = d.currentStep ?? 0;
  const hasVisibility = typeof d.metrics?.visibilityScore === "number";
  // A completed audit owns the card. Even if the user later re-enters the
  // wizard to pick new prompts (which demotes currentStep below 5), the
  // existing run's visibility score should keep showing until the next run
  // replaces it — otherwise the card flips to "Pick prompts" mid-edit and
  // the prior result looks lost.
  const status: DomainItem["status"] =
    hasVisibility ? "success" : step > 0 ? "inprogress" : "retry";
  return {
    id: d.id,
    name: getDisplayName(d),
    url: d.url,
    status,
    currentStep: step,
    isCompanyDomain: Boolean(d.isCompanyDomain),
    visibility: typeof d.metrics?.visibilityScore === "number"
      ? Math.round((d.metrics.visibilityScore as number) * 10) // 0..10 → 0..100 for the bar
      : undefined,
    topKeywords: d.metrics?.keywordCount,
    topPrompts: d.metrics?.phraseCount,
  };
};

interface DomainHistorySectionProps {
  onMenuItemClick?: (tabId: TabId, domainId?: string | number) => void;
}

function DomainHistoryLoader() {
  return (
    <div className="w-full p-8">
      <div className="flex min-h-[72vh] items-center justify-center rounded-2xl border border-[#e2e6ee] bg-white">
        <div className="flex flex-col items-center gap-3 text-center">
          <Loader2 className="h-9 w-9 animate-spin text-[#4d5d78]" />
          <div>
            <p className="text-sm font-medium text-[#252b33]">Loading Domain History</p>
            <p className="mt-1 text-xs text-[#7f8795]">Preparing your history and analysis cards...</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function DomainHistorySection({ onMenuItemClick }: DomainHistorySectionProps) {
  const navigate = useNavigate();
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [historyView, setHistoryView] = useState<"list" | "grid">("list");
  const [state, setState] = useState<FetchState>({ status: "loading" });
  const [retryUrl, setRetryUrl] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);

  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current !== null) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const loadDomains = useCallback(async (attempt = 0): Promise<void> => {
    const requestId = ++requestIdRef.current;

    try {
      const data = await apiGet<{ domains: DashboardDomain[] }>("/wizard/domains");
      if (requestId !== requestIdRef.current) {
        return;
      }

      const domains = data?.domains ?? [];
      if (isRenderableDomainHistoryResponse(domains)) {
        clearRetryTimer();
        setState({ status: "ready", domains });
        return;
      }

      if (attempt >= MAX_DOMAIN_HISTORY_RETRIES) {
        clearRetryTimer();
        setState({
          status: "error",
          message: "Domain history is still syncing. Please try again.",
        });
        return;
      }

      clearRetryTimer();
      retryTimerRef.current = window.setTimeout(() => {
        void loadDomains(attempt + 1);
      }, DOMAIN_HISTORY_RETRY_DELAY_MS * (attempt + 1));
    } catch (err) {
      if (requestId !== requestIdRef.current) {
        return;
      }

      if (attempt >= MAX_DOMAIN_HISTORY_RETRIES) {
        clearRetryTimer();
        setState({
          status: "error",
          message: err instanceof Error ? err.message : "Failed to load domains",
        });
        return;
      }

      clearRetryTimer();
      retryTimerRef.current = window.setTimeout(() => {
        void loadDomains(attempt + 1);
      }, DOMAIN_HISTORY_RETRY_DELAY_MS * (attempt + 1));
    }
  }, [clearRetryTimer]);

  useEffect(() => {
    void loadDomains();
    return () => {
      requestIdRef.current += 1;
      clearRetryTimer();
    };
  }, [clearRetryTimer, loadDomains]);

  const allDomains = useMemo(
    () => (state.status === "ready" ? state.domains : []),
    [state]
  );

  const stats = useMemo(() => {
    const total = allDomains.length;
    const completed = allDomains.filter((d) => (d.currentStep ?? 0) >= 5).length;
    const inProgress = allDomains.filter(
      (d) => (d.currentStep ?? 0) > 0 && (d.currentStep ?? 0) < 5
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

  const handleViewReport = useCallback((domain: DomainItem) => {
    navigate(`/ai-results/${buildDomainSlug(domain)}`);
  }, [navigate]);

  if (state.status === "loading") {
    return <DomainHistoryLoader />;
  }

  // AI Dashboard sidebar tabs — these mirror the rail in AIResultsLayout so
  // a domain card's dropdown lands the user on the same screens they'd reach
  // by clicking the sidebar inside the AI Dashboard.
  const aiDashboardTabs: Array<{ label: string; path: (masked: string) => string }> = [
    { label: "AI Results", path: (m) => `/ai-results/${m}` },
    { label: "Competitors", path: () => `/airesults-competitors-preview` },
    { label: "Prompts", path: (m) => `/ai-results/${m}/prompts` },
  ];

  return (
    <div className="w-full p-8">
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
              onClick={() => navigate(resolveDashboardPath("settings", { settingsSubTab: "integrations" }))}
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
              onClick={() => setHistoryView((prev) => (prev === "grid" ? "list" : "grid"))}
              className={`inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition ${historyView === "grid"
                  ? "border-[#c8d5f0] bg-[#eef3ff] text-[#4e76c7]"
                  : "border-[#d7dbe3] bg-white text-[#6b7382]"
                }`}
            >
              <Grid2x2 className="h-3.5 w-3.5" />
              {historyView === "grid" ? "List" : "Grid"}
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

        <div className={historyView === "grid" ? "grid grid-cols-1 gap-4 xl:grid-cols-3" : "flex flex-col gap-4"}>
          {state.status === "error" ? (
            <div className="col-span-full rounded-xl border border-[#fad4d4] bg-[#fff5f5] p-8 text-center text-sm text-[#cf3d3d]">
              <p>{state.message}</p>
              <button
                type="button"
                onClick={() => {
                  setState({ status: "loading" });
                  void loadDomains();
                }}
                className="mt-4 inline-flex h-9 items-center rounded-md bg-white px-3 text-xs font-medium text-[#cf3d3d] shadow-sm ring-1 ring-inset ring-[#fad4d4] hover:bg-[#fff9f9]"
              >
                Try again
              </button>
            </div>
          ) : filteredDomains.length === 0 ? (
            <div className="col-span-full rounded-xl border border-[#e2e6ee] bg-white p-8 text-center text-sm text-[#7f8795]">
              {searchQuery ? "No matching domains found." : "No domains analyzed yet."}
            </div>
          ) : (
            filteredDomains.map((domain) => (
              <div
                key={domain.id}
                className={`rounded-xl border border-[#e2e6ee] bg-white p-4 ${historyView === "list" ? "w-full" : ""
                  }`}
              >
                <div className="mb-3 flex items-start justify-between">
                  <div className="relative min-w-0">
                    <div className="flex items-start gap-4">
                      <span className="inline-flex h-19 w-19 items-center justify-center rounded-md">
                        <img src={getLogoUrl(domain.url)} alt={`${domain.name} icon`} className="h-11 w-11 object-contain" loading="lazy" />
                      </span>
                      <div className="min-w-0 flex flex-col items-start">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setOpenMenuId((prev) => (prev === domain.id ? null : domain.id))}
                            className="inline-flex items-center gap-1 text-sm font-semibold text-[#252b33]"
                          >
                            {domain.name}
                            <ChevronDown className="h-3.5 w-3.5" />
                          </button>
                          {domain.isCompanyDomain && (
                            <span
                              title="Your company's primary domain"
                              className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-700"
                            >
                              <Check className="h-2.5 w-2.5" />
                              Company
                            </span>
                          )}
                        </div>
                        <div className="mt-1 block rounded bg-[#eef3fb] px-2 py-0.5 text-[10px] text-[#4e76c7]">
                          {domain.url}
                        </div>
                      </div>
                    </div>
                    {openMenuId === domain.id && (
                      <div className="absolute z-20 mt-2 w-48 rounded-md border border-[#d7dbe3] bg-white py-1 shadow-lg">
                        {aiDashboardTabs.map((tab) => (
                          <button
                            key={tab.label}
                            type="button"
                            onClick={() => {
                              navigate(tab.path(buildDomainSlug(domain)));
                              setOpenMenuId(null);
                            }}
                            className="block w-full px-3 py-2 text-left text-xs text-[#374252] hover:bg-[#f4f6fa]"
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-lg ${domain.status === "success"
                        ? "bg-[#eaf7e9]"
                        : domain.status === "inprogress"
                          ? "bg-[#fff7e5]"
                          : "bg-[#ffeef0]"
                      }`}
                  >
                    {domain.status === "success" ? (
                      <Check className="h-4 w-4 text-[#4e9f2d]" />
                    ) : domain.status === "inprogress" ? (
                      <CircleAlert className="h-3.5 w-3.5 text-[#d59a00]" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5 text-[#cf3d3d]" />
                    )}
                  </div>
                </div>

                {domain.status === "retry" ? (
                  <div className={`flex flex-col items-center justify-center ${historyView === "list" ? "min-h-[120px]" : "h-[145px]"}`}>
                    <p className="text-[20px] font-semibold text-[#414651]">Run analysis</p>
                    <button
                      type="button"
                      onClick={() => navigate(`/ai-checker-v2?domain=${domain.id}`)}
                      aria-label={`Run analysis for ${domain.name}`}
                      className="mt-4 inline-flex h-11 w-11 items-center justify-center rounded-md bg-[#f0f3f8] text-[#4d5d78] hover:bg-[#e6ebf3]"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </button>
                  </div>
                ) : domain.status === "inprogress" ? (
                  <button
                    type="button"
                    onClick={() => navigate(`/ai-checker-v2?domain=${domain.id}`)}
                    className="block w-full text-left"
                  >
                    <div className={`mb-2 border-t border-[#edf1f7] pt-3 ${historyView === "list" ? "max-w-3xl" : ""}`}>
                      <p className="mb-1 text-[13px] font-medium uppercase tracking-wide text-[#7f8795]">
                        Resume at step {Math.min(MAX_WIZARD_STEPS, domain.currentStep + 1)} of {MAX_WIZARD_STEPS}
                      </p>
                      <p className="text-[20px] font-semibold text-[#414651]">
                        {NEXT_STEP_LABEL[domain.currentStep] ?? "Continue"}
                      </p>
                      <div className="mt-3 h-2 rounded-full bg-[#d6dbe5]">
                        <div
                          className="h-2 rounded-full bg-[#6f8fc9] transition-all"
                          style={{ width: `${clampPercent((domain.currentStep / MAX_WIZARD_STEPS) * 100)}%` }}
                        />
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs text-[#7f8795]">
                      <span>Click to resume</span>
                      <span className="text-[#3d83df] font-medium">→</span>
                    </div>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleViewReport(domain)}
                    className="block w-full text-left"
                  >
                    <div
                      className={`border-t border-[#edf1f7] pt-3 ${historyView === "list" ? "flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between" : ""
                        }`}
                    >
                      <div className={historyView === "list" ? "min-w-0 flex-1" : ""}>
                        <p className="mb-2 text-[19px] font-semibold text-[#414651]">Visibility Score</p>
                        <div className="flex items-center gap-3">
                          <div className="h-2 flex-1 rounded-full bg-[#d6dbe5]">
                            <div className="h-2 rounded-full bg-[#6f8fc9]" style={{ width: `${domain.visibility ?? 0}%` }} />
                          </div>
                          <span className="text-4xl font-semibold leading-none text-[#6f8fc9]">{domain.visibility ?? 0}%</span>
                        </div>
                      </div>
                      <div className={`grid grid-cols-2 gap-3 ${historyView === "list" ? "lg:min-w-[280px]" : "mt-3"}`}>
                        <div>
                          <p className="pb-2 text-[18px] font-semibold text-[#5f6878]">Top Keywords</p>
                          <p className="text-[30px] font-medium leading-none text-[#3d83df]">{domain.topKeywords ?? 0}</p>
                        </div>
                        <div>
                          <p className="pb-2 text-[18px] font-semibold text-[#5f6878]">Prompts</p>
                          <p className="text-[30px] font-medium leading-none text-[#3d83df]">{domain.topPrompts ?? 0}</p>
                        </div>
                      </div>
                    </div>
                    {historyView === "grid" ? null : <div className="mt-3 text-xs text-[#7f8795]">Click to view report</div>}
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
