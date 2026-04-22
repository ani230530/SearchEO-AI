import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  BarChart3,
  ChevronRight,
  Globe,
  Info,
  Lightbulb,
  Link,
  LogOut,
  Menu,
  Plus,
  Send,
  CopyCheck,
  Sparkles,
  Tag,
  LayoutDashboard,
  ClipboardList,
  PieChart,
  Settings,
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

interface DashboardSidebarProps {
  activeCompanySubTab: CompanySubTabId;
  activeTab: TabId;
  isSidebarExpanded: boolean;
  onHoverChange: (hovered: boolean) => void;
  onToggleSidebar: (open: boolean) => void;
  onLogout: () => void;
  onSelectCompanySubTab: (tab: CompanySubTabId) => void;
  onSelectTab: (tab: TabId) => void;
  showResults: boolean;
  sidebarOpen: boolean;
  tabs: DashboardSidebarTab[];
}

type SidebarActionItem = {
  key: string;
  label: string;
  icon: ReactNode;
  isActive?: boolean;
  onClick: () => void;
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
  onHoverChange,
  onToggleSidebar,
  onLogout,
  onSelectCompanySubTab,
  onSelectTab,
  showResults: _showResults,
  sidebarOpen,
  tabs: _tabs,
}: DashboardSidebarProps) {
  const [isCompactViewport, setIsCompactViewport] = useState(false);
  void _tabs;
  void _activeCompanySubTab;
  void _showResults;

  useEffect(() => {
    const check = () => {
      const compact = window.innerWidth < 1024;
      setIsCompactViewport(compact);

      if (compact) {
        onHoverChange(false);
        onToggleSidebar(false);
        return;
      }

      onHoverChange(false);
      onToggleSidebar(true);
    };

    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [onHoverChange, onToggleSidebar]);

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
            icon: <LayoutDashboard className="h-4 w-4" />,
            isActive: activeTab === "overview",
            onClick: () => onSelectTab("overview"),
            variant: "primary",
          },
          {
            key: "ai-visibility",
            label: "AI Visibility",
            icon: <Sparkles className="h-4 w-4" />,
            isActive: activeTab === "ai-checker",
            onClick: () => onSelectTab("ai-checker"),
            variant: "premium",
          },
        ],
      },
      {
        title: "Projects",
        items: [
          {
            key: "create-project",
            label: "Create New Project",
            icon: <Plus className="h-4 w-4" />,
            onClick: () => onSelectTab("projects"),
          },
          {
            key: "all-projects",
            label: "All Projects",
            icon: <Send className="h-4 w-4" />,
            isActive: activeTab === "projects",
            onClick: () => onSelectTab("projects"),
          },
          {
            key: "publish",
            label: "Publish",
            icon: <CopyCheck className="h-4 w-4" />,
            isActive: activeTab === "publish",
            onClick: () => onSelectTab("publish"),
          },
        ],
      },
      {
        title: "Company Tools",
        items: [
          {
            key: "domain-info",
            label: "Domain Info",
            icon: <Info className="h-4 w-4" />,
            isActive: activeTab === "analytics",
            onClick: () => {
              onSelectTab("analytics");
              onSelectCompanySubTab("company-info");
            },
          },
          {
            key: "site-auditor",
            label: "Site Auditor",
            icon: <Globe className="h-4 w-4" />,
            isActive: activeTab === "audit",
            onClick: () => onSelectTab("audit"),
          },
          {
            key: "competitor-analysis",
            label: "Competitor analysis",
            icon: <ClipboardList className="h-4 w-4" />,
            isActive: activeTab === "competitor-intelligence",
            onClick: () => onSelectTab("competitor-intelligence"),
          },
          {
            key: "gsc-analytics",
            label: "GSC Analytics",
            icon: <PieChart className="h-4 w-4" />,
            isActive: activeTab === "gsc-analytics",
            onClick: () => onSelectTab("gsc-analytics"),
          },
          {
            key: "performance-reports",
            label: "Performance Reports",
            icon: <BarChart3 className="h-4 w-4" />,
            isActive: activeTab === "analytics-report",
            onClick: () => onSelectTab("analytics-report"),
          },
          {
            key: "integration",
            label: "Integration",
            icon: <Link className="h-4 w-4" />,
            isActive: activeTab === "integration",
            onClick: () => {
              onSelectTab("integration");
              onSelectCompanySubTab("integration");
            },
          },
        ],
      },
      {
        title: "Drive & Data",
        items: [
          {
            key: "knowledge-base",
            label: "Knowledge Base",
            icon: <Lightbulb className="h-4 w-4" />,
            isActive: activeTab === "knowledge-base",
            onClick: () => onSelectTab("knowledge-base"),
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
            isActive: activeTab === "pricing",
            onClick: () => onSelectTab("pricing"),
          },
          {
            key: "settings",
            label: "Settings",
            icon: <Settings className="h-4 w-4" />,
            isActive: activeTab === "settings",
            onClick: () => onSelectTab("settings"),
          },
        ],
      },
    ];
  }, [activeTab, onSelectCompanySubTab, onSelectTab]);

  return (
    <TooltipProvider delayDuration={180}>
      <aside className={sidebarClass}>
        <div className="sidebar-header">
          <div className="sidebar-header-inner">
            {isSidebarExpanded ? (
              <div className="sidebar-brand">
                <h1 className="sidebar-title">SearchEO.ai</h1>
              </div>
            ) : (
              <div className="sidebar-brand-spacer" aria-hidden="true" />
            )}

            {!isCompactViewport && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="sidebar-toggle"
                    onClick={() => {
                      onHoverChange(false);
                      onToggleSidebar(!sidebarOpen);
                    }}
                    aria-label={isSidebarExpanded ? "Collapse sidebar" : "Expand sidebar"}
                  >
                    {isSidebarExpanded ? (
                      <ChevronRight className="h-6 w-6" />
                    ) : (
                      <Menu className="h-6 w-6" />
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
                  {section.items.map((item) => (
                    <Tooltip key={item.key}>
                      <TooltipTrigger asChild>
                        <button
                          className={`sidebar-tab ${item.isActive ? "active" : ""} ${
                            item.variant === "primary"
                              ? "sidebar-tab-primary"
                              : item.variant === "premium"
                                ? "sidebar-tab-premium"
                                : ""
                          }`}
                          onClick={item.onClick}
                        >
                          <span className="sidebar-tab-icon">{item.icon}</span>
                          <span className="sidebar-tab-label">{item.label}</span>
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="right">{item.label}</TooltipContent>
                    </Tooltip>
                  ))}
                </div>
              </div>
            ))}
          </nav>

          <div className="sidebar-footer-actions">
            <Tooltip>
              <TooltipTrigger asChild>
                <button onClick={onLogout} className="sidebar-tab sidebar-logout-tab">
                  <LogOut className="sidebar-tab-icon h-4 w-4" />
                  <span className="sidebar-tab-label sidebar-logout-label">Logout</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Logout</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </aside>
    </TooltipProvider>
  );
}
