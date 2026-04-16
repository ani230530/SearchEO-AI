import { useEffect, useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  Info,
  Link,
  LogOut,
  Menu,
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

export function DashboardSidebar({
  activeCompanySubTab,
  activeTab,
  isSidebarExpanded,
  onHoverChange,
  onToggleSidebar,
  onLogout,
  onSelectCompanySubTab,
  onSelectTab,
  showResults,
  sidebarOpen,
  tabs,
}: DashboardSidebarProps) {
  const [isCompactViewport, setIsCompactViewport] = useState(false);

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

  return (
    <TooltipProvider delayDuration={180}>
      <aside className={sidebarClass}>
        <div className="sidebar-header">
          <div className="sidebar-header-inner">
            {isSidebarExpanded ? (
              <div className="sidebar-brand">
                <h1 className="sidebar-title">SEO Tool</h1>
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
                      <ChevronRight className="h-4 w-4" />
                    ) : (
                      <Menu className="h-4 w-4" />
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
          <nav className="space-y-2">
            {tabs.map((tab) => (
              <div key={tab.id}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      className={`sidebar-tab ${
                        activeTab === tab.id ? "active" : ""
                      } ${tab.id === "ai-checker" ? "ai-checker-tab" : ""}`}
                      onClick={() => onSelectTab(tab.id)}
                    >
                      <span className="sidebar-tab-icon">{tab.icon}</span>
                      <span className="sidebar-tab-label">{tab.label}</span>

                      {tab.id === "analytics" && (
                        <ChevronDown
                          className={`sidebar-tab-chevron ml-auto h-4 w-4 transition-transform ${
                            activeTab === "analytics" && showResults ? "rotate-180" : ""
                          }`}
                        />
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">{tab.label}</TooltipContent>
                </Tooltip>

                {tab.id === "analytics" && activeTab === "analytics" && showResults && (
                  <div className="sidebar-subtabs ml-8 mt-1 space-y-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => onSelectCompanySubTab("company-info")}
                          className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-light transition-all duration-200 ${
                            activeCompanySubTab === "company-info"
                              ? "bg-blue-50 text-blue-700"
                              : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                          }`}
                        >
                          <Info className="h-4 w-4" />
                          <span>Domain Info</span>
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="right">Domain Info</TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => onSelectCompanySubTab("integration")}
                          className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-light transition-all duration-200 ${
                            activeCompanySubTab === "integration"
                              ? "bg-blue-50 text-blue-700"
                              : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                          }`}
                        >
                          <Link className="h-4 w-4" />
                          <span>Integration</span>
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="right">Integration</TooltipContent>
                    </Tooltip>
                  </div>
                )}
              </div>
            ))}
          </nav>

          <div
            style={{
              marginTop: "32px",
              paddingTop: "32px",
              borderTop: "0.5px solid rgba(0, 0, 0, 0.1)",
            }}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={onLogout}
                  className="sidebar-tab"
                  style={{ color: "#FF3B30" }}
                >
                  <LogOut
                    className="sidebar-tab-icon h-5 w-5"
                    style={{ color: "#FF3B30" }}
                  />
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
