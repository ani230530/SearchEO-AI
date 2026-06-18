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
  const isAiVisibilitySubItemActive = (subItemKey: string) =>
    (subItemKey === "ai-results" && isAiResultsActive) ||
    (subItemKey === "competitor-intelligence" && isCompetitorIntelligenceActive) ||
    (subItemKey === "prompt-research" && isPromptResearchActive);
  const isAiVisibilityParentActive = activeTab === "ai-visibility" || isAiResultsActive || isCompetitorIntelligenceActive || isPromptResearchActive;

  useEffect(() => {
    localStorage.setItem("dashboard:aiVisibilityExpanded", String(isAiVisibilityExpanded));
  }, [isAiVisibilityExpanded]);

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
            subItems: [
              {
                key: "ai-results",
                label: "AI Results",
                icon: <ClipboardList className="h-3.5 w-3.5" />,
                href: aiVisibilityDomainSlug
                  ? resolveAIResultsNavigation("ai-results", aiVisibilityDomainSlug)
                  : resolveDashboardPath("ai-visibility"),
              },
              {
                key: "competitor-intelligence",
                label: "Competitor Intelligence",
                icon: <BarChart3 className="h-3.5 w-3.5" />,
                href: aiVisibilityDomainSlug
                  ? resolveAIResultsNavigation("competitors", aiVisibilityDomainSlug)
                  : resolveDashboardPath("ai-visibility"),
              },
              {
                key: "prompt-research",
                label: "Prompt Research",
                icon: <Send className="h-3.5 w-3.5" />,
                href: aiVisibilityDomainSlug
                  ? resolveAIResultsNavigation("prompts", aiVisibilityDomainSlug)
                  : resolveDashboardPath("ai-visibility"),
              },
            ],
          },
        ],
      },
      {
        title: "Content Planner",
        items: [
          {
            key: "create-project",
            label: "Create New Campaign",
            icon: <Plus className="h-4 w-4" />,
            onClick: onSelectCreateProject,
            href: `${resolveDashboardPath("projects")}?action=create`,
          },
          {
            key: "all-projects",
            label: "Campaigns",
            icon: <Send className="h-4 w-4" />,
            isActive: activeTab === "projects",
            onClick: () => onSelectTab("projects"),
            href: resolveDashboardPath("projects"),
          },
        ],
      },
      {
        title: "Site Audit",
        items: [
          {
            key: "integration",
            label: "Integration",
            icon: <LinkIcon className="h-4 w-4" />,
            isActive: activeTab === "integration",
            onClick: () => {
              onSelectTab("integration");
              onSelectCompanySubTab("integration");
            },
            href: resolveDashboardPath("integration"),
          },
          {
            key: "website-audit",
            label: "Website Audit",
            icon: <Globe className="h-4 w-4" />,
            isActive: activeTab === "audit",
            onClick: () => onSelectTab("audit"),
            href: resolveDashboardPath("audit"),
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
          {
            key: "attribution",
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
  }, [activeSettingsSubTab, activeTab, onSelectCompanySubTab, onSelectPricing, onSelectTab]);

  return (
    <TooltipProvider delayDuration={180}>
      <aside
        className={`${sidebarClass} relative`}
      >
        <div className="sidebar-header">
          <div className="sidebar-header-inner">
            {isSidebarExpanded ? (
              <div className="sidebar-brand">
                <img src="/Searcheo-full-logo.svg" alt="Searcheo Logo" className="h-6 w-auto" />
              </div>
            ) : (
              <div
                className="sidebar-brand flex items-center justify-center rounded-xl bg-white/80 shadow-sm"
                style={{ width: "52px", height: "52px" }}
              >
                <img src="/searcheo-logo.png" alt="Searcheo Logo" className="h-8 w-8 object-contain" />
              </div>
            )}

            {!isCompactViewport && (
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
                      <ChevronLeft className="h-6 w-6" />
                    ) : (
                      <ChevronRight className="h-6 w-6" />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  {isSidebarExpanded ? "Collapse sidebar" : "Expand sidebar"}
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>

        <div className="sidebar-content">
          <nav>
            {sections.map((section) => (
              <div key={section.title || "primary"} className="sidebar-section">
                {section.title ? (
                  <h2 className="sidebar-section-title">{section.title}</h2>
                ) : null}

                <div className="sidebar-section-items">
                  {section.items.map((item) => {
                    const tabContent = (
                      <>
                        <span className="sidebar-tab-icon">{item.icon}</span>
                        <span className="sidebar-tab-label">{item.label}</span>
                      </>
                    );

                    const commonProps = {
                      className: `sidebar-tab ${item.isActive ? "active" : ""} ${item.variant === "primary"
                          ? "sidebar-tab-primary"
                          : item.variant === "premium"
                            ? "sidebar-tab-premium"
                            : ""
                        }`,
                      onClick: (event: MouseEvent<HTMLElement>) => {
                        if (isModifiedClick(event)) {
                          return;
                        }
                        item.onClick?.();
                        if (isCompactViewport) {
                          onToggleSidebar(false);
                        }
                      },
                    };

                    return (
                      <div key={item.key}>
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

                        {item.subItems?.length && (isSidebarExpanded || isAiVisibilityExpanded) ? (
                          <div className={isSidebarExpanded ? "mt-1 ml-4 space-y-1 border-l border-slate-200 pl-3" : "mt-1 flex flex-col items-center gap-1"}>
                            {item.subItems.map((subItem) => (
                              <Tooltip key={subItem.key}>
                                <TooltipTrigger asChild>
                                  <Link
                                    to={subItem.href ?? resolveDashboardPath("ai-visibility")}
                                    onClick={() => setIsAiVisibilityExpanded(true)}
                                    className={
                                      isSidebarExpanded
                                        ? `group flex items-center gap-2 rounded-md px-2 py-1.5 transition ${isAiVisibilitySubItemActive(subItem.key)
                                          ? "border border-[#9DB3DD] bg-[#EFF5FF] text-[#213A63] shadow-[0_6px_16px_rgba(47,68,98,0.10)]"
                                          : "border border-transparent text-slate-500 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-900"
                                        }`
                                        : `group flex h-9 w-9 items-center justify-center rounded-lg transition ${isAiVisibilitySubItemActive(subItem.key)
                                          ? "border border-[#9DB3DD] bg-[#EFF5FF] text-[#213A63] shadow-[0_6px_16px_rgba(47,68,98,0.10)]"
                                          : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                                        }`
                                    }
                                  >
                                    <span
                                      className={`flex h-6 w-6 items-center justify-center rounded-md transition ${isAiVisibilitySubItemActive(subItem.key)
                                          ? "bg-white text-[#355A9B]"
                                          : "bg-white text-slate-400"
                                        }`}
                                    >
                                      {subItem.icon}
                                    </span>
                                    {isSidebarExpanded ? (
                                      <span
                                        className={`sidebar-tab-label text-[12px] font-semibold transition ${isAiVisibilitySubItemActive(subItem.key)
                                            ? "text-[#213A63]"
                                            : "text-slate-500"
                                          }`}
                                      >
                                        {subItem.label}
                                      </span>
                                    ) : null}
                                  </Link>
                                </TooltipTrigger>
                                <TooltipContent side="right">{subItem.label}</TooltipContent>
                              </Tooltip>
                            ))}
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
            <div className="space-y-1 mb-3">
              <Tooltip>
                <TooltipTrigger asChild>
                  <a href="mailto:support@searcheo.ai" className="sidebar-tab">
                    <CircleHelp className="sidebar-tab-icon h-4 w-4" />
                    <span className="sidebar-tab-label">Support</span>
                  </a>
                </TooltipTrigger>
                <TooltipContent side="right">Support</TooltipContent>
              </Tooltip>

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
                    <Settings className="sidebar-tab-icon h-4 w-4" />
                    <span className="sidebar-tab-label">Settings</span>
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">Settings</TooltipContent>
              </Tooltip>
            </div>

            <div className="sidebar-credit-balance rounded-xl border border-[#EBEDF0] bg-[#F7F8FA] px-3 py-2.5 mb-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Coins className="h-4 w-4 text-[#5172B6] shrink-0" />
                  <span className="sidebar-credit-balance-label text-[13px] font-semibold text-[#355A9B] truncate">Credit Balance</span>
                </div>
                <span className="sidebar-credit-balance-value inline-flex h-6 items-center rounded-full border border-[#9EB7E9] bg-[#EDF3FF] px-2 text-[12px] font-medium text-[#5D7EC0]">
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
