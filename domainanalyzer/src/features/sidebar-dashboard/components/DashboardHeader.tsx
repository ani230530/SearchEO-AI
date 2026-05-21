import { Bell, CircleHelp } from "lucide-react";

import type { DashboardHeaderProps } from "@/features/sidebar-dashboard/types";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export function DashboardHeader({
  activeTab,
  tabs,
  userEmail,
  userName,
  lastSyncedAt,
  onTabChange,
}: DashboardHeaderProps) {
  const activeLabel = tabs.find((tab) => tab.id === activeTab)?.label || "Dashboard";
  const displayName = userName?.trim() || "Admin";
  const formattedLastSynced = lastSyncedAt
    ? lastSyncedAt.toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "Not synced yet";

  if (activeTab === "overview") {
    return (
      <header className="content-header">
        <TooltipProvider delayDuration={120}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[20px] font-medium tracking-[-0.02em] text-[#1d1d1f]">
                Welcome back, {displayName}!
              </p>
              <p className="mt-1 text-[12px] text-[#6b7280]">
                Last sync: {formattedLastSynced}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex h-6 w-6 items-center justify-center text-[#6b7280] transition-colors hover:text-[#1f2937]"
                    aria-label="Notifications"
                  >
                    <Bell className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Notifications</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex h-6 w-6 items-center justify-center text-[#6b7280] transition-colors hover:text-[#1f2937]"
                    aria-label="Help"
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
                    onClick={() => onTabChange?.("profile")}
                    className="inline-flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-[#e5e7eb] bg-white transition-opacity hover:opacity-80"
                    aria-label="Profile"
                  >
                    <img
                      src="/overview-avatar-label-group.svg"
                      alt=""
                      className="h-8 w-8 object-contain"
                    />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Profile</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </TooltipProvider>
      </header>
    );
  }

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
              <img src="/overview-avatar-label-group.svg" alt="" className="h-8 w-8 rounded-full object-contain" />
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
