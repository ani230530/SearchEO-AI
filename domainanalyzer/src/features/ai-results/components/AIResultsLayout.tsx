import {
  ArrowLeft,
  BarChart3,
  Bell,
  CircleHelp,
  ChevronDown,
  ClipboardList,
  Globe,
  Globe2,
  History,
  LayoutDashboard,
  Lightbulb,
  LogOut,
  PieChart,
  Settings,
  Sparkles,
  Send,
  Tag,
  UserRound,
} from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useMemo, useState, useEffect, useCallback, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAuth } from "@/contexts/AuthContext";
import { buildDomainSlug } from "@/lib/domainUtils";
import { DashboardSidebar } from "@/features/sidebar-dashboard/components/DashboardSidebar";
import { DASHBOARD_TABS } from "@/features/sidebar-dashboard/constants";
import { resolveDashboardPath, resolveSidebarNavigation, resolveAIResultsNavigation } from "@/features/sidebar-dashboard/navigation";
import type { TabId } from "@/features/sidebar-dashboard/types";

type AIResultsNavItemId =
  | "ai-results"
  | "competitors"
  | "prompts";

type DomainOption = {
  id: number;
  url: string;
  createdAt: string;
  lastAnalyzed?: string | Date | null;
  /** Optional — backend supplies these via /wizard/domains for display. */
  host?: string;
  companyName?: string | null;
};

type AIResultsLayoutProps = {
  activeItem: AIResultsNavItemId;
  allDomains: DomainOption[];
  children: React.ReactNode;
  currentDomainId?: number | null;
  currentDomainUrl?: string | null;
  /** Optional — used in the trigger button next to the logo. */
  currentDomainHost?: string | null;
  currentDomainName?: string | null;
  maskedDomainId?: string;
  title: string;
};

/** Friendly display name for a domain row — falls back gracefully. */
const displayDomainName = (
  d: {
    companyName?: string | null;
    host?: string;
    url: string;
    createdAt?: string | Date | null;
  }
): string => {
  if (d.companyName && d.companyName.trim()) return d.companyName.trim();
  if (d.host && d.host.trim()) return d.host.trim();
  // Last-resort: strip protocol + www + path off the url.
  return d.url
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .split('/')[0];
};

import { logoUrl as logoUrlHelper } from "@/lib/logoUrl";

/** Backend-proxied logo URL for a host. Returns null if host is missing. */
const logoUrlFor = (host: string | null | undefined): string | null => logoUrlHelper(host, 64);

type RailSectionItem = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  onClick: () => void;
  isActive?: boolean;
  ariaLabel?: string;
};

type RailSection = {
  title: string;
  items: RailSectionItem[];
};

const AI_OVERVIEW_TABS: Array<{ id: AIResultsNavItemId; label: string }> = [
  { id: "ai-results", label: "AI Results" },
  { id: "competitors", label: "Competitor Intelligence" },
];

export function AIResultsLayout({
  activeItem,
  allDomains,
  children,
  currentDomainId,
  currentDomainUrl,
  currentDomainHost,
  currentDomainName,
  maskedDomainId,
  title,
}: AIResultsLayoutProps) {
  const { logout } = useAuth();
  // Resolve the trigger button's display name. Prefer explicit props, then
  // look up the current domain in allDomains, then fall back to the host
  // sliced out of currentDomainUrl.
  const currentDomainEntry = allDomains.find((d) => d.id === currentDomainId);
  const triggerHost =
    currentDomainHost ??
    currentDomainEntry?.host ??
    (currentDomainUrl ?? "").replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0] ??
    null;
  const triggerName =
    currentDomainName ??
    (currentDomainEntry ? displayDomainName(currentDomainEntry) : null) ??
    triggerHost ??
    "Loading…";
  const triggerLogo = logoUrlFor(triggerHost);
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 1024);
  const isSidebarExpanded = sidebarOpen;

  const location = useLocation();

  const dashboardSidebarTabs = useMemo(() => {
    return DASHBOARD_TABS.map((tab) => ({
      ...tab,
      icon: <tab.icon className="h-5 w-5" />,
    }));
  }, []);

  const handleSelectTab = (tabId: TabId) => {
    const route = resolveSidebarNavigation(tabId);
    navigate(route.path);
  };

  const handleLogout = useCallback(async () => {
    await logout();
    navigate("/auth");
  }, [logout, navigate]);

  return (
    <div className="flex min-h-screen w-full flex-col bg-[#f5f5f7] text-slate-900 lg:flex-row">
      {/* Collapsible icon rail. The outer <aside> reserves a fixed 72px/268px slot
       *  on desktop so the rest of the layout never reflows. */}
      <aside
        className="group relative z-40 hidden min-h-[220px] shrink-0 basis-auto overflow-visible border-b border-slate-300 bg-transparent lg:sticky lg:top-0 lg:flex lg:h-screen lg:max-h-screen lg:border-b-0 lg:self-start lg:w-[var(--rail-width)]"
        style={{
          ["--rail-width" as string]: sidebarOpen ? "268px" : "72px",
          fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", "Helvetica Neue", Helvetica, Arial, sans-serif',
          transition: "width 0.26s ease",
        } as CSSProperties}
      >
        <DashboardSidebar
          activeCompanySubTab="company-info"
          activeTab="ai-visibility"
          isSidebarExpanded={isSidebarExpanded}
          onToggleSidebar={setSidebarOpen}
          onSelectPricing={() => navigate(resolveSidebarNavigation("pricing").path)}
          onSelectCompanySubTab={() => {}}
          onSelectCreateProject={() => navigate(`${resolveDashboardPath("projects")}?action=create`)}
          onSelectTab={handleSelectTab}
          activeSettingsSubTab={undefined}
          showResults={true}
          sidebarOpen={sidebarOpen}
          tabs={dashboardSidebarTabs}
          defaultCollapsedOnDesktop={false}
        />
      </aside>

      <main className="ml-0 flex min-h-screen min-w-0 flex-1 flex-col gap-2.5 bg-white">
        <header className="w-full border-b border-slate-200 bg-white px-6 py-4">
          <div className="flex min-h-[2.25rem] w-full items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <h1 className="truncate text-2xl font-semibold leading-[1.35] tracking-normal text-gray-950 sm:text-2xl">
                {title}
              </h1>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex max-w-[18rem] items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-100"
                    aria-label="Change domain"
                  >
                    <span className="grid h-5 w-5 shrink-0 place-items-center overflow-hidden rounded-full bg-white">
                      {triggerLogo ? (
                        <img
                          src={triggerLogo}
                          alt=""
                          className="h-4 w-4 object-contain"
                          onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
                        />
                      ) : (
                        <Globe2 className="h-3.5 w-3.5 text-slate-500" />
                      )}
                    </span>
                    <span className="truncate">{triggerName}</span>
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  className="w-[280px] p-1 max-h-[60vh] overflow-y-auto custom-scrollbar"
                  align="start"
                >
                  {allDomains.length > 0 ? (
                    allDomains.map((domain) => {
                      const nextMaskedId = buildDomainSlug(domain);
                      const name = displayDomainName(domain);
                      const logo = logoUrlFor(domain.host ?? domain.url);
                      const isCurrent = domain.id === currentDomainId;
                      const targetPath = resolveAIResultsNavigation(activeItem, nextMaskedId);

                      return (
                        <DropdownMenuItem
                          key={domain.id}
                          asChild
                          className={`flex cursor-pointer items-center gap-2.5 px-2.5 py-2 ${isCurrent ? "bg-gray-50" : ""}`}
                        >
                          <Link to={targetPath}>
                            <span className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-md bg-slate-50">
                              {logo ? (
                                <img
                                  src={logo}
                                  alt=""
                                  className="h-6 w-6 object-contain"
                                  onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
                                />
                              ) : (
                                <Globe2 className="h-3.5 w-3.5 text-slate-500" />
                              )}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className="truncate text-xs font-semibold text-gray-900">{name}</span>
                                {isCurrent ? <Sparkles className="h-3 w-3 shrink-0 text-emerald-600" /> : null}
                              </div>
                              <span className="block truncate text-[10px] text-gray-500">
                                {domain.host ?? domain.url.replace(/^https?:\/\//, '')}
                                {' · '}
                                {domain.lastAnalyzed
                                  ? new Date(domain.lastAnalyzed).toLocaleString('en-IN', {
                                      day: '2-digit',
                                      month: 'short',
                                      year: 'numeric',
                                    })
                                  : 'No date'}
                              </span>
                            </div>
                          </Link>
                        </DropdownMenuItem>
                      );
                    })
                  ) : (
                    <div className="p-3 text-center text-xs text-gray-500">No other domains found</div>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <TooltipProvider delayDuration={120}>
              <div className="flex items-center gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex h-6 w-6 items-center justify-center text-[#6b7280] transition-colors hover:text-[#1f2937]"
                      aria-label="Notifications"
                    >
                      <Bell className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Notifications</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex h-6 w-6 items-center justify-center text-[#6b7280] transition-colors hover:text-[#1f2937]"
                      aria-label="Help"
                    >
                      <CircleHelp className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Quick tips</TooltipContent>
                </Tooltip>

                <DropdownMenu>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#e5e7eb] bg-white text-[#6b7280] transition-colors hover:text-[#1f2937]"
                          aria-label="Profile"
                        >
                          <UserRound className="h-4 w-4" />
                        </button>
                      </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">Profile</TooltipContent>
                  </Tooltip>
                  <DropdownMenuContent align="end" className="min-w-[14rem] p-1">
                    <DropdownMenuItem asChild className="cursor-pointer">
                      <Link to={resolveDashboardPath("settings", { settingsSubTab: "profile" })}>Profile information</Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={(event) => {
                        event.preventDefault();
                        void handleLogout();
                      }}
                      className="text-red-500 focus:text-red-500 focus:bg-red-50 cursor-pointer"
                    >
                      <span className="inline-flex items-center gap-2">
                        <LogOut className="h-4 w-4" />
                        Logout
                      </span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </TooltipProvider>
          </div>
          {maskedDomainId && activeItem !== "prompts" ? (
            <div className="mt-4">
              <Tabs value={activeItem} className="w-full">
                <TabsList className="h-auto gap-1 rounded-[14px] bg-transparent p-0">
                  {AI_OVERVIEW_TABS.map((tab) => (
                    <TabsTrigger
                      key={tab.id}
                      value={tab.id}
                      onClick={() => navigate(resolveAIResultsNavigation(tab.id, maskedDomainId))}
                      className={cn(
                        "rounded-[10px] px-4 py-2 text-[13px] font-medium text-slate-500 shadow-none transition",
                        "data-[state=active]:bg-[#eef4ff] data-[state=active]:text-[#2f5fd1] data-[state=active]:shadow-[inset_0_0_0_1px_rgba(79,110,200,0.18)]"
                      )}
                    >
                      {tab.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>
          ) : null}
        </header>

        {children}
      </main>
    </div>
  );
}
