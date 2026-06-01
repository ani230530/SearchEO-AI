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
  User,
  ChevronRight,
} from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useMemo, useState, useEffect, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAuth } from "@/contexts/AuthContext";
import { maskDomainId } from "@/lib/domainUtils";
import { DashboardSidebar } from "@/features/sidebar-dashboard/components/DashboardSidebar";
import { DASHBOARD_TABS } from "@/features/sidebar-dashboard/constants";
import { resolveSidebarNavigation, resolveAIResultsNavigation } from "@/features/sidebar-dashboard/navigation";
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

const sidebarItems: Array<{
  id: AIResultsNavItemId;
  iconSrc: string;
  label: string;
}> = [
    { id: "ai-results", label: "AI Results", iconSrc: "/sidebar-icons/ai-results.svg" },
    { id: "competitors", label: "Competitors", iconSrc: "/sidebar-icons/track-prompts.svg" },
    { id: "prompts", label: "Prompts", iconSrc: "/sidebar-icons/competitors.svg" },
  ];

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
  const resolvedMaskedDomainId = maskedDomainId ?? (currentDomainId ? maskDomainId(currentDomainId) : undefined);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isSidebarHovered, setIsSidebarHovered] = useState(false);
  const isSidebarExpanded = sidebarOpen || isSidebarHovered;

  const [isResultsSidebarOpen, setIsResultsSidebarOpen] = useState(() => {
    const saved = localStorage.getItem("ai-visibility:sidebarOpen");
    return saved !== null ? JSON.parse(saved) : true;
  });

  useEffect(() => {
    localStorage.setItem("ai-visibility:sidebarOpen", JSON.stringify(isResultsSidebarOpen));
  }, [isResultsSidebarOpen]);

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

  return (
    <div className="flex min-h-screen w-full flex-col bg-[#f5f5f7] text-slate-900 lg:flex-row">
      {/* Collapsible icon rail. The outer <aside> reserves a fixed 84px/280px slot
       *  on desktop so the rest of the layout never reflows. */}
      <aside 
        className="group relative z-40 hidden min-h-[220px] shrink-0 basis-auto overflow-visible border-b border-slate-300 bg-transparent lg:sticky lg:top-0 lg:flex lg:h-screen lg:max-h-screen lg:border-b-0 lg:self-start lg:w-[var(--rail-width)]"
        style={{
          ["--rail-width" as string]: sidebarOpen ? "280px" : "84px",
          fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", "Helvetica Neue", Helvetica, Arial, sans-serif',
          transition: "width 0.26s ease",
        } as CSSProperties}
      >
        <DashboardSidebar
          activeCompanySubTab="company-info"
          activeTab="ai-visibility"
          isSidebarExpanded={isSidebarExpanded}
          onHoverChange={setIsSidebarHovered}
          onToggleSidebar={setSidebarOpen}
          onLogout={() => {
            logout();
            navigate("/auth");
          }}
          onSelectPricing={() => navigate(resolveSidebarNavigation("pricing").path)}
          onSelectCompanySubTab={() => {}}
          onSelectCreateProject={() => navigate("/dashboard?tab=projects&action=create")}
          onSelectTab={handleSelectTab}
          activeSettingsSubTab={undefined}
          showResults={true}
          sidebarOpen={sidebarOpen}
          tabs={dashboardSidebarTabs}
          defaultCollapsedOnDesktop={true}
        />
      </aside>

      <aside className={cn(
        "min-h-[220px] shrink-0 basis-auto border-b border-slate-300 bg-white lg:sticky lg:top-0 lg:h-screen lg:max-h-screen lg:border-b-0 lg:border-r lg:self-start transition-all duration-300 ease-in-out overflow-hidden flex flex-col",
        isResultsSidebarOpen 
          ? "p-4 w-full lg:basis-[18%] lg:min-w-[260px] lg:max-w-[342px]" 
          : "p-2 w-full lg:basis-0 lg:min-w-[64px] lg:max-w-[64px]"
      )}>
        <div className="flex h-full flex-col overflow-hidden">
          {/* Top of the sidebar — domain logo and toggle button */}
          <div className={cn("flex items-center", isResultsSidebarOpen ? "justify-between" : "justify-center flex-col gap-4")}>
            <span className={cn("grid shrink-0 place-items-center overflow-hidden rounded-xl bg-slate-50 ring-1 ring-slate-200", isResultsSidebarOpen ? "h-10 w-10" : "h-9 w-9")}>
              {triggerLogo ? (
                <img
                  src={triggerLogo}
                  alt={triggerName}
                  className={cn("object-contain", isResultsSidebarOpen ? "h-9 w-9" : "h-8 w-8")}
                  onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
                />
              ) : (
                <Globe2 className={cn("text-slate-400", isResultsSidebarOpen ? "h-5 w-5" : "h-4 w-4")} />
              )}
            </span>
            
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="sidebar-toggle hidden lg:inline-flex"
                    onClick={() => setIsResultsSidebarOpen(!isResultsSidebarOpen)}
                    aria-label={isResultsSidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
                  >
                    <ChevronRight 
                      className={cn(
                        "h-6 w-6 transition-transform duration-200",
                        isResultsSidebarOpen ? "rotate-180" : ""
                      )} 
                    />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  {isResultsSidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <div className={cn("mt-6", !isResultsSidebarOpen && "flex flex-col items-center")}>
            {isResultsSidebarOpen ? (
              <DropdownMenu>
                <p className="mb-2 text-xs font-semibold text-gray-700">Domain</p>
                <DropdownMenuTrigger asChild>
                  <button className="flex w-full items-center justify-between rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-xs shadow-sm transition hover:bg-gray-50">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="grid h-6 w-6 shrink-0 place-items-center overflow-hidden rounded-md bg-slate-50">
                        {triggerLogo ? (
                          <img
                            src={triggerLogo}
                            alt=""
                            className="h-5 w-5 object-contain"
                            onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
                          />
                        ) : (
                          <Globe2 className="h-3.5 w-3.5 text-slate-500" />
                        )}
                      </span>
                      <span className="truncate font-medium text-slate-900">{triggerName}</span>
                    </span>
                    <ChevronDown className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  className="w-[280px] p-1 max-h-[60vh] overflow-y-auto custom-scrollbar"
                  align="start"
                >
                  {allDomains.length > 0 ? (
                    allDomains.map((domain) => {
                      const nextMaskedId = maskDomainId(domain.id);
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
                                    year: 'numeric'
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
            ) : (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link 
                      to={resolveSidebarNavigation("domain-history").path}
                      className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-white shadow-sm transition hover:bg-gray-50"
                    >
                      <Globe2 className="h-5 w-5 text-slate-500" />
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right">Change Domain</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>

          <nav className={cn("mt-5 space-y-1", !isResultsSidebarOpen && "flex flex-col items-center")}>
            {sidebarItems.map((item) => {
              const isActive = item.id === activeItem;
              const targetPath = resolvedMaskedDomainId 
                ? resolveAIResultsNavigation(item.id, resolvedMaskedDomainId, item.id === "prompts" ? "all-prompts" : undefined)
                : "#";

              return (
                <TooltipProvider key={item.id}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Link
                        to={targetPath}
                        className={cn(
                          "flex items-center gap-3 rounded-lg transition",
                          isResultsSidebarOpen ? "w-full px-3 py-2 text-left text-xs font-medium" : "h-10 w-10 justify-center",
                          isActive ? "bg-[#2f4462] text-white" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                        )}
                      >
                        <img
                          src={item.iconSrc}
                          alt=""
                          aria-hidden="true"
                          className={cn(
                            "shrink-0",
                            isResultsSidebarOpen ? "h-4 w-4" : "h-5 w-5",
                            item.id === "ai-results"
                              ? isActive ? "opacity-100" : "brightness-0 opacity-80"
                              : isActive ? "brightness-0 invert" : "opacity-80"
                          )}
                        />
                        {isResultsSidebarOpen && item.label}
                      </Link>
                    </TooltipTrigger>
                    {!isResultsSidebarOpen && <TooltipContent side="right">{item.label}</TooltipContent>}
                  </Tooltip>
                </TooltipProvider>
              );
            })}
          </nav>
        </div>
      </aside>

      <main className="ml-0 flex min-h-screen min-w-0 flex-1 flex-col gap-2.5 bg-white">
        <header className="w-full bg-white px-6 py-4">
          <div className="flex min-h-[2.25rem] w-full items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <h1 className="truncate text-2xl font-semibold leading-[1.35] tracking-normal text-gray-950 sm:text-2xl">
                {title}
              </h1>
            </div>

            <TooltipProvider delayDuration={120}>
              <div className="flex items-center gap-2 text-[#98A2B3]">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label="Help"
                      className="inline-flex h-5 w-5 items-center justify-center bg-transparent transition-colors hover:text-slate-700"
                    >
                      <CircleHelp className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Quick tips</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label="Notifications"
                      className="inline-flex h-5 w-5 items-center justify-center bg-transparent transition-colors hover:text-slate-700"
                    >
                      <Bell className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Notifications</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link
                      to="/dashboard?tab=profile"
                      aria-label="Profile"
                      className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#F2F4F7] text-[#667085] transition hover:text-slate-700"
                    >
                      <User className="h-3.5 w-3.5" />
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Profile</TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>
          </div>
        </header>

        {children}
      </main>
    </div>
  );
}
