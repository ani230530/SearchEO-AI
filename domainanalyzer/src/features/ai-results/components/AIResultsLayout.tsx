import {
  ArrowLeft,
  BarChart3,
  Bell,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Globe,
  Globe2,
  HelpCircle,
  History,
  LayoutDashboard,
  Link,
  Lightbulb,
  LogOut,
  PieChart,
  Settings,
  Sparkles,
  Send,
  Tag,
  User,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useMemo } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/AuthContext";
import { maskDomainId } from "@/lib/domainUtils";

type AIResultsNavItemId =
  | "ai-results"
  | "competitors"
  | "track-prompts"
  | "top-keywords"
  | "analytics";

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
    { id: "competitors", label: "Competitors", iconSrc: "/sidebar-icons/competitors.svg" },
    { id: "track-prompts", label: "Track Prompts", iconSrc: "/sidebar-icons/track-prompts.svg" },
    { id: "top-keywords", label: "Track Keyword", iconSrc: "/sidebar-icons/track-keyword.svg" },
    { id: "analytics", label: "Opportunities", iconSrc: "/sidebar-icons/analytics.svg" },
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
  const location = useLocation();
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
  const activeRailItem = "projects";

  const navigateToItem = (itemId: AIResultsNavItemId, nextMaskedId = resolvedMaskedDomainId) => {
    if (!nextMaskedId) return;

    if (itemId === "ai-results") {
      navigate(`/ai-results/${nextMaskedId}`);
      return;
    }

    if (itemId === "top-keywords") {
      navigate(`/ai-results/${nextMaskedId}/track-keywords`);
      return;
    }

    if (itemId === "track-prompts") {
      navigate(`/ai-results/${nextMaskedId}/track-prompts`);
      return;
    }

    if (itemId === "competitors") {
      navigate(`/airesults-competitors-preview`);
      return;
    }

    navigate(`/dashboard?tab=analytics&domain=${nextMaskedId}`);
  };

  const railSections = useMemo<RailSection[]>(() => {
    return [
      {
        title: "",
        items: [
          {
            id: "dashboard",
            label: "Dashboard",
            icon: LayoutDashboard,
            onClick: () => navigate("/dashboard"),
            isActive: activeRailItem === "dashboard",
          },
          {
            id: "ai-visibility",
            label: "AI Visibility",
            icon: Sparkles,
            onClick: () => navigate("/ai-visibility"),
            isActive: activeRailItem === "ai-visibility",
          },
        ],
      },
      {
        title: "Projects",
        items: [
          {
            id: "all-projects",
            label: "All Projects",
            icon: Send,
            onClick: () => navigate("/dashboard?tab=projects"),
            isActive: activeRailItem === "projects",
          },
        ],
      },
      {
        title: "Company Tools",
        items: [
          {
            id: "domain-info",
            label: "Domain Info",
            icon: Globe,
            onClick: () => navigate("/dashboard?tab=analytics"),
          },
          {
            id: "website-audit",
            label: "Website Audit",
            icon: Globe2,
            onClick: () => navigate("/dashboard?tab=audit"),
          },
          {
            id: "domain-history",
            label: "Domain History",
            icon: History,
            onClick: () => navigate("/dashboard?tab=domain-history"),
          },
          {
            id: "competitor-analysis",
            label: "Competitor analysis",
            icon: ClipboardList,
            onClick: () => navigate("/dashboard?tab=competitor-intelligence"),
            isActive: location.pathname === "/airesults-competitors-preview",
          },
          {
            id: "gsc-analytics",
            label: "GSC Analytics",
            icon: PieChart,
            onClick: () => navigate("/dashboard?tab=gsc-analytics"),
          },
          {
            id: "performance-reports",
            label: "Performance Reports",
            icon: BarChart3,
            onClick: () => navigate("/dashboard?tab=analytics-report"),
          },
          {
            id: "integration",
            label: "Integration",
            icon: Link,
            onClick: () => navigate("/dashboard?tab=integration"),
          },
        ],
      },
      {
        title: "Drive & Data",
        items: [
          {
            id: "knowledge-base",
            label: "Knowledge Base",
            icon: Lightbulb,
            onClick: () => navigate("/knowledge-base"),
          },
        ],
      },
      {
        title: "Billing",
        items: [
          {
            id: "pricing",
            label: "Pricing",
            icon: Tag,
            onClick: () => navigate("/dashboard?tab=settings"),
          },
          {
            id: "settings",
            label: "Settings",
            icon: Settings,
            onClick: () => navigate("/dashboard?tab=settings"),
          },
        ],
      },
    ];
  }, [activeRailItem, location.pathname, navigate]);

  return (
    <div className="flex min-h-screen w-full flex-col bg-[#f5f5f7] text-slate-900 lg:flex-row">
      {/* Collapsible icon rail. The outer <aside> reserves a fixed 72px slot
       *  so the rest of the layout never reflows. The inner panel is
       *  absolutely positioned and widens on hover, so the expanded rail
       *  overlays the next column instead of pushing it. */}
      <aside 
        className="group relative z-40 hidden min-h-[220px] w-[72px] shrink-0 basis-auto overflow-visible border-b border-slate-300 bg-transparent lg:sticky lg:top-0 lg:flex lg:h-screen lg:max-h-screen lg:border-b-0 lg:self-start"
        style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", "Helvetica Neue", Helvetica, Arial, sans-serif' }}
      >
        <div className="absolute inset-y-0 left-0 z-50 flex h-full w-[72px] flex-col overflow-hidden border-b border-slate-300 bg-[rgba(255,255,255,0.9)] px-0 py-0 shadow-sm transition-[width] duration-200 ease-out group-hover:w-[280px] group-hover:shadow-lg lg:border-b-0 lg:border-r border-[#d9dde3]">
          <div className="flex h-full w-full flex-col overflow-hidden">
            <div className="flex w-full items-center justify-center px-[14px] py-[18px] pb-2 group-hover:justify-start group-hover:px-[16px]">
              <span className="hidden group-hover:block min-w-0 flex-1">
                <h1 className="m-0 text-[28px] font-medium leading-none tracking-[-0.03em] text-[#141414]">
                  SearchEO AI
                </h1>
              </span>
              <span className="grid h-9 w-9 shrink-0 place-items-center group-hover:hidden">
                {/* Collapsed icon for brand */}
                <span className="font-bold text-xl text-[#141414]">S</span>
              </span>
              <ChevronRight className="hidden group-hover:block h-5 w-5 text-gray-500 shrink-0" />
            </div>

            <nav className="mt-2 flex flex-1 flex-col overflow-y-auto px-[6px] group-hover:px-[10px] pb-3">
              {railSections.map((section) => (
                <div key={section.title || "primary"} className="mb-[14px]">
                  {section.title ? (
                    <h2 className="hidden group-hover:block m-0 mb-[6px] px-[10px] text-[12px] font-medium leading-[1.3] tracking-[0.01em] text-[#7b828d] normal-case">
                      {section.title}
                    </h2>
                  ) : null}

                  <div className="space-y-[3px]">
                    {section.items.map((item) => {
                      const ItemIcon = item.icon;
                      const isActive = Boolean(item.isActive);
                      const isPremium = item.id === "ai-visibility";

                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={item.onClick}
                          className={`flex w-full items-center gap-[10px] rounded-lg px-0 py-[10px] group-hover:px-[10px] group-hover:py-[9px] transition-colors justify-center group-hover:justify-start ${
                            isActive
                              ? "bg-[#2f4462] text-[#ffffff]"
                              : "text-[#020202] hover:bg-[#e6e9ee]"
                          }`}
                          aria-label={item.ariaLabel ?? item.label}
                          title={item.label}
                        >
                          <ItemIcon 
                            className={`h-[20px] w-[20px] shrink-0 inline-flex transition-colors ${
                              isActive ? "text-[#ffffff]" : isPremium ? "text-[#3f62ab]" : "text-[#6d7480]"
                            }`} 
                            strokeWidth={isPremium ? 2.4 : 2} 
                          />
                          <span 
                            className={`hidden whitespace-nowrap text-[14px] group-hover:inline ${
                              isActive
                                ? "font-medium"
                                : isPremium
                                  ? "font-bold bg-gradient-to-r from-[#2D4059] to-[#4C74C2] bg-clip-text text-transparent"
                                  : "font-medium"
                            }`}
                          >
                            {item.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>

            <div className="mt-auto flex w-full flex-col pt-3 border-t border-[#d9dde3] px-[6px] group-hover:px-[10px] pb-3">
              <button
                type="button"
                onClick={() => {
                  logout();
                  navigate("/auth");
                }}
                className="flex w-full items-center gap-[10px] rounded-lg px-0 py-[10px] group-hover:px-[10px] group-hover:py-[9px] transition-colors justify-center group-hover:justify-start text-[#b83030] hover:bg-[#e6e9ee]"
                aria-label="Logout"
                title="Logout"
              >
                <LogOut className="h-[20px] w-[20px] shrink-0 text-[#b83030] inline-flex" strokeWidth={2} />
                <span className="hidden whitespace-nowrap text-[14px] font-medium text-[#b83030] group-hover:inline">
                  Logout
                </span>
              </button>
            </div>
          </div>
        </div>
      </aside>

      <aside className="min-h-[220px] w-full shrink-0 basis-auto border-b border-slate-300 bg-white p-4 lg:sticky lg:top-0 lg:h-screen lg:max-h-screen lg:basis-[18%] lg:min-w-[260px] lg:max-w-[342px] lg:border-b-0 lg:border-r lg:self-start">
        <div className="flex h-full flex-col overflow-hidden">
          {/* Top of the sidebar — domain logo on the left, back button on the right.
              The logo replaces the "logo" placeholder; the back button replaces
              the Settings icon and goes to the user's domain history. The main
              content header no longer has its own back arrow. */}
          <div className="flex items-center justify-between">
            <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-slate-50 ring-1 ring-slate-200">
              {triggerLogo ? (
                <img
                  src={triggerLogo}
                  alt={triggerName}
                  className="h-9 w-9 object-contain"
                  onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
                />
              ) : (
                <Globe2 className="h-5 w-5 text-slate-400" />
              )}
            </span>
            <button
              type="button"
              aria-label="Back to domain history"
              onClick={() => navigate("/dashboard?tab=domain-history")}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-gray-500 transition hover:bg-gray-50 hover:text-gray-900"
              title="Back to domain history"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-6">
            <p className="mb-2 text-xs font-semibold text-gray-700">Domain</p>
            <DropdownMenu>
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
                    return (
                      <DropdownMenuItem
                        key={domain.id}
                        onClick={() => navigateToItem(activeItem, nextMaskedId)}
                        className={`flex cursor-pointer items-center gap-2.5 px-2.5 py-2 ${isCurrent ? "bg-gray-50" : ""}`}
                      >
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
                      </DropdownMenuItem>
                    );
                  })
                ) : (
                  <div className="p-3 text-center text-xs text-gray-500">No other domains found</div>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <nav className="mt-5 space-y-1">
            {sidebarItems.map((item) => {
              const isActive = item.id === activeItem;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigateToItem(item.id)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-xs font-medium transition ${isActive ? "bg-[#2f4462] text-white" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"}`}
                >
                  <img
                    src={item.iconSrc}
                    alt=""
                    aria-hidden="true"
                    className={`h-4 w-4 shrink-0 ${item.id === "ai-results"
                      ? isActive
                        ? "opacity-100"
                        : "brightness-0 opacity-80"
                      : isActive
                        ? "brightness-0 invert"
                        : "opacity-80"
                      }`}
                  />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>
      </aside>

      <main className="ml-0 flex min-h-screen min-w-0 flex-1 flex-col gap-2.5 bg-white">
        <header className="w-full bg-white px-6 py-4">
          <div className="flex min-h-[2.25rem] w-full items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                aria-label="Back"
                onClick={() => navigate("/dashboard?tab=domain-history")}
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center text-[#101828] transition hover:text-slate-700"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <h1 className="truncate text-base font-semibold leading-[1.35] tracking-normal text-gray-950 sm:text-lg">
                {title}
              </h1>
            </div>

            <div className="flex items-center gap-3 text-[#98A2B3]">
              <button
                type="button"
                aria-label="Help"
                className="inline-flex h-5 w-5 items-center justify-center bg-transparent transition-colors hover:text-slate-700"
              >
                <HelpCircle className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                aria-label="Notifications"
                className="inline-flex h-5 w-5 items-center justify-center bg-transparent transition-colors hover:text-slate-700"
              >
                <Bell className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                aria-label="Profile"
                className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#F2F4F7] text-[#667085] transition hover:text-slate-700"
              >
                <User className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </header>

        {children}
      </main>
    </div>
  );
}
