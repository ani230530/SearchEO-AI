import { User } from "lucide-react";

import type { DashboardHeaderProps } from "@/features/sidebar-dashboard/types";

export function DashboardHeader({
  activeTab,
  tabs,
  userEmail,
  onTabChange,
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

        {userEmail && (
          <div className="flex items-center gap-3">
            <button
              onClick={() => onTabChange?.("profile")}
              className="cursor-pointer transition-opacity hover:opacity-70"
              title="Profile"
            >
              <User className="h-5 w-5 text-gray-400" />
            </button>
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
