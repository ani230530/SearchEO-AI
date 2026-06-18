import { useEffect, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  BarChart3,
  ChevronRight,
  ChevronLeft,
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
import { resolveDashboardPath, resolveSidebarNavigation } from "@/features/sidebar-dashboard/navigation";

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
  const [isCompactViewport, setIsCompactViewport] = useState(false);
  void _tabs;
  void _activeCompanySubTab;
  void _showResults;

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
            isActive: activeTab === "ai-visibility",
            onClick: () => onSelectTab("ai-visibility"),
            href: resolveDashboardPath("ai-visibility"),
            variant: "premium",
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
              <div className="sidebar-brand flex items-center justify-center" style={{ width: "40px" }}>
                <img src="/18Searcheo 2.svg" alt="Searcheo Logo" className="h-6 w-auto" />
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
                      className: `sidebar-tab ${item.isActive ? "active" : ""} ${
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
                        item.onClick?.();
                        if (isCompactViewport) {
                          onToggleSidebar(false);
                        }
                      },
                    };

                    return (
                      <Tooltip key={item.key}>
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
