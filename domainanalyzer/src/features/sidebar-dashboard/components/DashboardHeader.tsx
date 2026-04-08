import { List, Network, Table } from "lucide-react";

import type {
  DashboardCampaignViewMode,
  DashboardHeaderProps,
} from "@/features/sidebar-dashboard/types";

const VIEW_MODE_OPTIONS: Array<{
  icon: typeof List;
  label: string;
  mode: DashboardCampaignViewMode;
}> = [
  { icon: List, label: "Topics", mode: "split" },
  { icon: Network, label: "Map", mode: "graph" },
  { icon: Table, label: "Table", mode: "table" },
];

export function DashboardHeader({
  activeTab,
  campaignViewMode,
  selectedCampaignId,
  tabs,
  userEmail,
  onCampaignViewModeChange,
}: DashboardHeaderProps) {
  const activeLabel = tabs.find((tab) => tab.id === activeTab)?.label || "Dashboard";

  return (
    <header className="content-header">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2
            style={{
              fontSize: "28px",
              fontWeight: "400",
              letterSpacing: "-0.022em",
              color: "#1d1d1f",
              margin: "0",
            }}
          >
            {activeLabel}
          </h2>
        </div>

        {activeTab === "projects" && selectedCampaignId && (
          <div className="flex items-center gap-2 bg-gray-100/80 p-1 rounded-lg border border-gray-200/50 mr-4">
            {VIEW_MODE_OPTIONS.map(({ icon: Icon, label, mode }) => (
              <button
                key={mode}
                onClick={() => onCampaignViewModeChange(mode)}
                className={`p-1.5 rounded-md transition-all flex items-center gap-2 text-xs font-medium ${
                  campaignViewMode === mode
                    ? "bg-white text-black shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{label}</span>
              </button>
            ))}
          </div>
        )}

        {userEmail && (
          <div className="flex items-center gap-3">
            <div
              style={{
                background: "rgba(0, 122, 255, 0.1)",
                color: "#007AFF",
                padding: "6px 12px",
                borderRadius: "12px",
                fontSize: "14px",
                fontWeight: "500",
              }}
            >
              {userEmail}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
