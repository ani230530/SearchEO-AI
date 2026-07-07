import { useEffect, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  BarChart3,
  ChevronRight,
  ChevronLeft,
  ClipboardList,
  Lightbulb,
  Link as LinkIcon,
  CircleHelp,
  Coins,
  Send,
  Sparkles,
  Tag,
  Globe,
  House,
  PieChart,
  Settings,
  Route,
  Plus,
  ChevronDown,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type {
  CompanySubTabId,
  DashboardSidebarTab,
  TabId,
} from "@/features/sidebar-dashboard/types";
import type { SettingsSubTab } from "@/features/sidebar-dashboard/sections/settings/types";
import { resolveAIResultsNavigation, resolveDashboardPath, resolveSidebarNavigation } from "@/features/sidebar-dashboard/navigation";

interface DashboardSidebarProps {
  activeCompanySubTab: CompanySubTabId;
  activeTab: TabId;
  isSidebarExpanded: boolean;
  onToggleSidebar: (open: boolean) => void;
  onSelectCompanySubTab: (tab: CompanySubTabId) => void;
  onSelectCreateProject: () => void;
  onSelectPricing: () => void;
  onSelectTab: (tab: TabId) => void;
  activeSettingsSubTab?: SettingsSubTab;
  showResults: boolean;
  sidebarOpen: boolean;
  tabs: DashboardSidebarTab[];
  defaultCollapsedOnDesktop?: boolean;
}

type SidebarActionItem = {
  key: string;
  label: string;
  icon: ReactNode;
  isActive?: boolean;
  onClick?: () => void;
  href?: string;
  variant?: "standard" | "primary" | "premium";
  subItems?: SidebarActionItem[];
};

type SidebarSection = {
  title: string;
  items: SidebarActionItem[];
};

type SidebarGroupKey = "ai-visibility" | "content-studio" | "site-audit";

export function DashboardSidebar({
  activeCompanySubTab: _activeCompanySubTab,
  activeTab,
  isSidebarExpanded,
  onToggleSidebar,
  onSelectCompanySubTab,
  onSelectCreateProject,
  onSelectPricing,
  onSelectTab,
  activeSettingsSubTab,
  showResults: _showResults,
  sidebarOpen,
  tabs: _tabs,
  defaultCollapsedOnDesktop = false,
}: DashboardSidebarProps) {
  const location = useLocation();
  const [isCompactViewport, setIsCompactViewport] = useState(false);
  const [isAiVisibilityExpanded, setIsAiVisibilityExpanded] = useState(() => {
    const saved = localStorage.getItem("dashboard:aiVisibilityExpanded");
    return saved !== "false";
  });
  const [isAiChatPromoVisible, setIsAiChatPromoVisible] = useState(true);
  const [expandedGroup, setExpandedGroup] = useState<SidebarGroupKey | null>(null);
  const [dismissedActiveGroup, setDismissedActiveGroup] = useState<SidebarGroupKey | null>(null);
  void _tabs;
  void _activeCompanySubTab;
  void _showResults;
  const aiVisibilityDomainSlug = localStorage.getItem("ai-visibility:lastDomainSlug") ?? undefined;

  const isModifiedClick = (event: MouseEvent<HTMLElement>) =>
    event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;

  useEffect(() => {
    const check = () => {
      const compact = window.innerWidth < 1024;
      setIsCompactViewport(compact);

      if (compact) {
        onToggleSidebar(false);
      } else {
        onToggleSidebar(!defaultCollapsedOnDesktop);
      }
    };

    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [onToggleSidebar, defaultCollapsedOnDesktop]);

  const sidebarClass = isCompactViewport
    ? "sidebar closed compact"
    : `sidebar ${isSidebarExpanded ? "open" : "closed"}`;

  const currentPathname = location.pathname;
  const isAiResultsActive = /^\/ai-results\/[^/]+\/?$/.test(currentPathname) && !currentPathname.endsWith("/prompts");
  const isCompetitorIntelligenceActive = currentPathname.startsWith("/airesults-competitors-preview");
  const isPromptResearchActive = /^\/ai-results\/[^/]+\/prompts\/?$/.test(currentPathname);
  const isAiVisibilityParentActive = activeTab === "ai-visibility" || isAiResultsActive || isCompetitorIntelligenceActive || isPromptResearchActive;
  const activeDropdownGroup: SidebarGroupKey | null =
    isAiVisibilityParentActive
      ? "ai-visibility"
      : activeTab === "projects"
        ? "content-studio"
          : activeTab === "audit" || activeTab === "integration"
          ? "site-audit"
          : null;
  const isGroupExpanded = (groupKey: SidebarGroupKey) =>
    expandedGroup === groupKey || (activeDropdownGroup === groupKey && dismissedActiveGroup !== groupKey);
  const showTooltips = !isSidebarExpanded;
  const hideSidebarTitles = true;
  const hoverMenus = useMemo<Record<SidebarGroupKey, { label: string; subItems: SidebarActionItem[] }>>(
    () => ({
      "ai-visibility": {
        label: "AI Visibility",
        subItems: [
          {
            key: "ai-overview",
            label: "AI Overview",
            icon: <ClipboardList className="h-3.5 w-3.5" />,
            isActive: isAiResultsActive || isCompetitorIntelligenceActive,
            href: aiVisibilityDomainSlug
              ? resolveAIResultsNavigation("ai-results", aiVisibilityDomainSlug)
              : resolveDashboardPath("ai-visibility"),
          },
          {
            key: "prompt-research",
            label: "Prompt Research",
            icon: <Send className="h-3.5 w-3.5" />,
            isActive: isPromptResearchActive,
            href: aiVisibilityDomainSlug
              ? resolveAIResultsNavigation("prompts", aiVisibilityDomainSlug)
              : resolveDashboardPath("ai-visibility"),
          },
        ],
      },
      "content-studio": {
        label: "Content Studio",
        subItems: [
          {
            key: "create-project",
            label: "Create New Campaign",
            icon: <Plus className="h-3.5 w-3.5" />,
            onClick: onSelectCreateProject,
            href: `${resolveDashboardPath("projects")}?action=create`,
          },
          {
            key: "all-projects",
            label: "Campaigns",
            icon: <Send className="h-3.5 w-3.5" />,
            isActive: activeTab === "projects",
            onClick: () => onSelectTab("projects"),
            href: resolveDashboardPath("projects"),
          },
        ],
      },
      "site-audit": {
        label: "Site Audit",
        subItems: [
          {
            key: "website-audit",
            label: "Website Audit",
            icon: <Globe className="h-3.5 w-3.5" />,
            isActive: activeTab === "audit",
            onClick: () => onSelectTab("audit"),
            href: resolveDashboardPath("audit"),
          },
          {
            key: "integration",
            label: "Integration",
            icon: <LinkIcon className="h-3.5 w-3.5" />,
            isActive: activeTab === "integration",
            onClick: () => {
              onSelectTab("integration");
              onSelectCompanySubTab("integration");
            },
            href: resolveDashboardPath("integration"),
          },
        ],
      },
    }),
    [
      activeTab,
      aiVisibilityDomainSlug,
      isAiResultsActive,
      isCompetitorIntelligenceActive,
      isPromptResearchActive,
      onSelectCompanySubTab,
      onSelectCreateProject,
      onSelectTab,
    ]
  );

  useEffect(() => {
    localStorage.setItem("dashboard:aiVisibilityExpanded", String(isAiVisibilityExpanded));
  }, [isAiVisibilityExpanded]);

  useEffect(() => {
    if (dismissedActiveGroup && dismissedActiveGroup !== activeDropdownGroup) {
      setDismissedActiveGroup(null);
    }
  }, [activeDropdownGroup, dismissedActiveGroup]);

  const sections = useMemo<SidebarSection[]>(() => {
    return [
      {
        title: "",
        items: [
          {
            key: "dashboard",
            label: "Dashboard",
            icon: <House className="h-4 w-4" />,
            isActive: activeTab === "overview",
            onClick: () => onSelectTab("overview"),
            href: resolveDashboardPath("overview"),
            variant: "primary",
          },
          {
            key: "ai-visibility",
            label: "AI Visibility",
            icon: <Sparkles className="h-4 w-4" />,
            isActive: isAiVisibilityParentActive,
            onClick: () => {
              setIsAiVisibilityExpanded(true);
              onSelectTab("ai-visibility");
            },
            href: resolveDashboardPath("ai-visibility"),
            variant: "premium",
            subItems: hoverMenus["ai-visibility"].subItems,
          },
          {
            key: "content-studio",
            label: "Content Studio",
            icon: <Send className="h-4 w-4" />,
            isActive: activeTab === "projects",
            onClick: () => onSelectTab("projects"),
            href: resolveDashboardPath("projects"),
            variant: "premium",
            subItems: hoverMenus["content-studio"].subItems,
          },
          {
            key: "site-audit",
            label: "Site Audit",
            icon: <Globe className="h-4 w-4" />,
            isActive: activeTab === "audit" || activeTab === "integration",
            onClick: () => onSelectTab("audit"),
            href: resolveDashboardPath("audit"),
            subItems: hoverMenus["site-audit"].subItems,
          },
        ],
      },
      {
        title: "Analytics",
        items: [
         {
            key: "gsc-analytics",
            label: "GSC Analytics",
            icon: <PieChart className="h-4 w-4" />,
            isActive: activeTab === "gsc-analytics",
            onClick: () => onSelectTab("gsc-analytics"),
            href: resolveDashboardPath("gsc-analytics"),
          },
          {
            key: "performance-reports",
            label: "Performance Reports",
            icon: <BarChart3 className="h-4 w-4" />,
            isActive: activeTab === "analytics-report",
            onClick: () => onSelectTab("analytics-report"),
            href: resolveDashboardPath("analytics-report"),
          },
        ],
      },
      {
        title: "Drive & Data",
        items: [
          {
            key: "knowledge-base",
            label: "Resources",
            icon: <Lightbulb className="h-4 w-4" />,
            isActive: activeTab === "knowledge-base",
            onClick: () => onSelectTab("knowledge-base"),
            href: resolveDashboardPath("knowledge-base"),
          },

        ],
      },
      {
        title: "Attribution",
        items: [
         {key: "attribution",
           label: "Attribution",
           icon: <Route className="h-4 w-4" />,
           isActive: activeTab === "attribution",
           onClick: () => onSelectTab("attribution"),
           href: resolveDashboardPath("attribution"),
          },
        ],
      },
      {
        title: "Billing",
        items: [
           {
            key: "Pricing",
            label: "Pricing",
            icon: <Tag className="h-4 w-4" />,
            isActive: activeTab === "settings" && activeSettingsSubTab === "subscription",
            onClick: onSelectPricing,
            href: resolveSidebarNavigation("pricing").path,
          },
        ],
      },
    ];
  }, [activeSettingsSubTab, activeTab, hoverMenus, isAiVisibilityParentActive, onSelectPricing, onSelectTab]);

  return (
    <TooltipProvider delayDuration={180}>
      <aside
        className={`${sidebarClass} relative`}
      >
        <div className="sidebar-header">
          <div className="sidebar-header-inner">
            {isSidebarExpanded ? (
              <div className="sidebar-brand">
                <img src="/Searcheo-full-logo.svg" alt="Searcheo Logo" className="h-5 w-auto" />
              </div>
            ) : (
              <div
                className="sidebar-brand flex items-center justify-center rounded-xl bg-white/80 shadow-sm"
                style={{ width: "44px", height: "44px" }}
              >
                <img src="/searcheo-logo.png" alt="Searcheo Logo" className="h-6 w-6 object-contain" />
              </div>
            )}

            {!isCompactViewport ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="sidebar-toggle"
                    onClick={() => {
                      onToggleSidebar(!sidebarOpen);
                    }}
                    aria-label={isSidebarExpanded ? "Collapse sidebar" : "Expand sidebar"}
                  >
                    {isSidebarExpanded ? (
                      <ChevronLeft className="h-5 w-5" />
                    ) : (
                      <ChevronRight className="h-5 w-5" />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  {isSidebarExpanded ? "Collapse sidebar" : "Expand sidebar"}
                </TooltipContent>
              </Tooltip>
            ) : (
              <button
                type="button"
                className="sidebar-toggle"
                onClick={() => {
                  onToggleSidebar(!sidebarOpen);
                }}
                aria-label={isSidebarExpanded ? "Collapse sidebar" : "Expand sidebar"}
              >
                {isSidebarExpanded ? (
                  <ChevronLeft className="h-5 w-5" />
                ) : (
                  <ChevronRight className="h-5 w-5" />
                )}
              </button>
            )}
          </div>
        </div>

        <div className="sidebar-content">
          <nav>
            {sections.map((section) => (
              <div key={section.title || "primary"} className="sidebar-section">
                {!hideSidebarTitles && section.title ? (
                  <h2 className="sidebar-section-title">{section.title}</h2>
                ) : null}

                <div className="sidebar-section-items space-y-[2px]">
                  {section.items.map((item) => {
                    const hasSubItems = Boolean(item.subItems?.length);
                    const groupKey = item.key as SidebarGroupKey | undefined;
                    const groupExpanded = groupKey ? isGroupExpanded(groupKey) : false;
                    const tabContent = (
                      <>
                        <span className="sidebar-tab-icon">{item.icon}</span>
                        <span className="sidebar-tab-label text-[13px]">{item.label}</span>
                        {hasSubItems && isSidebarExpanded ? (
                          <ChevronDown
                            className={`ml-auto h-3 w-3 shrink-0 opacity-45 transition-transform ${groupExpanded ? "rotate-180" : ""}`}
                          />
                        ) : null}
                      </>
                    );

                    const commonProps = {
                      className: `sidebar-tab px-2.5 py-2 text-[13px] ${item.isActive ? "active sidebar-tab-section-active" : ""} ${
                        item.variant === "primary"
                          ? "sidebar-tab-primary"
                          : item.variant === "premium"
                            ? "sidebar-tab-premium"
                            : ""
                      }`,
                      onClick: (event: MouseEvent<HTMLElement>) => {
                        if (isModifiedClick(event)) {
                          return;
                        }
                        if (hasSubItems && groupKey && isSidebarExpanded) {
                          if (groupExpanded) {
                            event.preventDefault();
                            setExpandedGroup((current) => (current === groupKey ? null : current));
                            if (activeDropdownGroup === groupKey) {
                              setDismissedActiveGroup(groupKey);
                            }
                            return;
                          }

                          setExpandedGroup(groupKey);
                          setDismissedActiveGroup(null);
                        }

                        item.onClick?.();
                        if (isCompactViewport) {
                          onToggleSidebar(false);
                        }
                      },
                    };

                    return (
                      <div key={item.key}>
                        {showTooltips ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              {item.href ? (
                                <Link to={item.href} {...commonProps}>
                                  {tabContent}
                                </Link>
                              ) : (
                                <button type="button" {...commonProps}>
                                  {tabContent}
                                </button>
                              )}
                            </TooltipTrigger>
                            <TooltipContent side="right">{item.label}</TooltipContent>
                          </Tooltip>
                        ) : item.href ? (
                          <Link to={item.href} {...commonProps}>
                            {tabContent}
                          </Link>
                        ) : (
                          <button type="button" {...commonProps}>
                            {tabContent}
                          </button>
                        )}
                        {hasSubItems && isSidebarExpanded && groupKey && groupExpanded ? (
                          <div className="mt-1 space-y-1 pl-4">
                            {item.subItems?.map((subItem) => {
                              const subItemContent = (
                                <>
                                  <span
                                    className={`sidebar-tab-icon flex  items-center justify-center rounded-md transition ${
                                      subItem.isActive ? "bg-[#47648B] !text-white" : " !text-slate-400"
                                    }`}
                                  >
                                    {subItem.icon}
                                  </span>
                                  <span className="sidebar-tab-label text-[13px] font-medium transition">
                                    {subItem.label}
                                  </span>
                                </>
                              );

                              const subItemClassName = `sidebar-tab group rounded-lg px-2.5 py-2 ${
                                subItem.isActive ? "active sidebar-tab-subitem-active" : ""
                              }`;

                              return subItem.href ? (
                                <Link
                                  key={subItem.key}
                                  to={subItem.href}
                                  onClick={() => setExpandedGroup(groupKey)}
                                  className={subItemClassName}
                                >
                                  {subItemContent}
                                </Link>
                              ) : (
                                <button
                                  key={subItem.key}
                                  type="button"
                                  onClick={() => {
                                    subItem.onClick?.();
                                    setExpandedGroup(groupKey);
                                  }}
                                  className={subItemClassName}
                                >
                                  {subItemContent}
                                </button>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          <div className="sidebar-footer-actions">
            <div className="space-y-[2px] mb-[6px]">
              {isSidebarExpanded && isAiChatPromoVisible ? (
                <div className="mb-2 rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-3 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[14px] font-semibold leading-tight text-slate-900">Ask Echo! Search Smarter.</p>
                      <p className="mt-1 text-[12px] leading-relaxed text-slate-500">
                        Get instant insights, recommendations, and answers for smarter SEO decisions.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsAiChatPromoVisible(false)}
                      aria-label="Dismiss AI chatbot promo"
                      className="text-slate-300 transition-colors hover:text-slate-500"
                    >
                      ×
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => window.dispatchEvent(new Event("open-ai-chatbot"))}
                    className="mt-3 text-[13px] font-semibold transition-opacity hover:opacity-90"
                    style={{
                      backgroundImage: "linear-gradient(90deg, #55B3FF 0%, #9A38FF 100%)",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      backgroundClip: "text",
                    }}
                  >
                    Explore AI Chatbot
                  </button>
                </div>
              ) : null}

              {showTooltips ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link
                      to={resolveDashboardPath("support")}
                      className={`sidebar-tab ${activeTab === "support" ? "active" : ""}`}
                      onClick={(event) => {
                        if (isModifiedClick(event)) return;
                        onSelectTab("support");
                        if (isCompactViewport) onToggleSidebar(false);
                      }}
                    >
                      <CircleHelp className="sidebar-tab-icon h-3.5 w-3.5" />
                      <span className="sidebar-tab-label">Support</span>
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right">Support</TooltipContent>
                </Tooltip>
              ) : (
                <Link
                  to={resolveDashboardPath("support")}
                  className={`sidebar-tab ${activeTab === "support" ? "active" : ""}`}
                  onClick={(event) => {
                    if (isModifiedClick(event)) return;
                    onSelectTab("support");
                    if (isCompactViewport) onToggleSidebar(false);
                  }}
                >
                  <CircleHelp className="sidebar-tab-icon h-3.5 w-3.5" />
                  <span className="sidebar-tab-label">Support</span>
                </Link>
              )}

              {showTooltips ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link
                      to={resolveDashboardPath("settings")}
                      className={`sidebar-tab ${activeTab === "settings" && activeSettingsSubTab !== "subscription" ? "active" : ""}`}
                      onClick={(event) => {
                        if (isModifiedClick(event)) return;
                        onSelectTab("settings");
                        if (isCompactViewport) onToggleSidebar(false);
                      }}
                    >
                      <Settings className="sidebar-tab-icon h-3.5 w-3.5" />
                      <span className="sidebar-tab-label">Settings</span>
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right">Settings</TooltipContent>
                </Tooltip>
              ) : (
                <Link
                  to={resolveDashboardPath("settings")}
                  className={`sidebar-tab ${activeTab === "settings" && activeSettingsSubTab !== "subscription" ? "active" : ""}`}
                  onClick={(event) => {
                    if (isModifiedClick(event)) return;
                    onSelectTab("settings");
                    if (isCompactViewport) onToggleSidebar(false);
                  }}
                >
                  <Settings className="sidebar-tab-icon h-3.5 w-3.5" />
                  <span className="sidebar-tab-label">Settings</span>
                </Link>
              )}
            </div>

            <div className="sidebar-credit-balance rounded-xl border border-[#EBEDF0] bg-[#F7F8FA] px-2.5 py-2 mb-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Coins className="h-3.5 w-3.5 text-[#5172B6] shrink-0" />
                  <span className="sidebar-credit-balance-label text-[12px] font-semibold text-[#355A9B] truncate">Credit Balance</span>
                </div>
                <span className="sidebar-credit-balance-value inline-flex h-5 items-center rounded-full border border-[#9EB7E9] bg-[#EDF3FF] px-2 text-[11px] font-medium text-[#5D7EC0]">
                  2,465
                </span>
              </div>
            </div>

          </div>
        </div>
      </aside>

    </TooltipProvider>
  );
}
