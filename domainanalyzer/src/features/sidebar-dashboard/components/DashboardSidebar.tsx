import { ChevronDown, FileText, LogOut, Plug } from "lucide-react";

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
  onLogout: () => void;
  onSelectCompanySubTab: (tabId: CompanySubTabId) => void;
  onSelectTab: (tabId: TabId) => void;
  showResults: boolean;
  sidebarOpen: boolean;
  tabs: DashboardSidebarTab[];
}

export function DashboardSidebar({
  activeCompanySubTab,
  activeTab,
  isSidebarExpanded,
  onHoverChange,
  onLogout,
  onSelectCompanySubTab,
  onSelectTab,
  showResults,
  sidebarOpen,
  tabs,
}: DashboardSidebarProps) {
  return (
    <aside
      className={`sidebar ${isSidebarExpanded ? "open" : "closed"}`}
      onMouseEnter={() => {
        if (!sidebarOpen) {
          onHoverChange(true);
        }
      }}
      onMouseLeave={() => {
        if (!sidebarOpen) {
          onHoverChange(false);
        }
      }}
    >
      <div className="sidebar-header">
        <div className="flex items-center justify-between mb-4">
          <h1
            className="sidebar-title"
            style={{
              fontSize: "24px",
              fontWeight: "400",
              letterSpacing: "-0.022em",
              color: "#1d1d1f",
              marginTop: "20px",
            }}
          >
            SEO Tool
          </h1>
        </div>
      </div>

      <div className="sidebar-content">
        <nav className="space-y-2">
          {tabs.map((tab) => (
            <div key={tab.id}>
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
                    className={`h-4 w-4 ml-auto sidebar-tab-chevron transition-transform ${
                      activeTab === "analytics" && showResults ? "rotate-180" : ""
                    }`}
                  />
                )}
              </button>

              {tab.id === "analytics" &&
                activeTab === "analytics" &&
                showResults && (
                  <div className="ml-8 mt-1 space-y-1 sidebar-subtabs">
                    <button
                      onClick={() => onSelectCompanySubTab("company-info")}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-light transition-all duration-200 ${
                        activeCompanySubTab === "company-info"
                          ? "bg-blue-50 text-blue-700"
                          : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                      }`}
                    >
                      <FileText className="h-4 w-4" />
                      <span>Domain Info</span>
                    </button>
                    <button
                      onClick={() => onSelectCompanySubTab("integration")}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-light transition-all duration-200 ${
                        activeCompanySubTab === "integration"
                          ? "bg-blue-50 text-blue-700"
                          : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                      }`}
                    >
                      <Plug className="h-4 w-4" />
                      <span>Integration</span>
                    </button>
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
          <button
            onClick={onLogout}
            className="sidebar-tab"
            style={{ color: "#FF3B30" }}
          >
            <LogOut
              className="h-5 w-5 sidebar-tab-icon"
              style={{ color: "#FF3B30" }}
            />
            <span className="sidebar-tab-label sidebar-logout-label">
              Logout
            </span>
          </button>
        </div>
      </div>
    </aside>
  );
}
