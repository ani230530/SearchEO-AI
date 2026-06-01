import { Bell, CircleHelp, UserRound } from "lucide-react";
import { type MouseEvent } from "react";
import { Link } from "react-router-dom";

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
  const isModifiedClick = (event: MouseEvent<HTMLAnchorElement>) =>
    event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;
  const handleProfileClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (isModifiedClick(event)) {
      return;
    }
    onTabChange?.("profile");
  };

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
                  <Link
                    to="/dashboard?tab=profile"
                    onClick={handleProfileClick}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#e5e7eb] bg-white text-[#6b7280] transition-colors hover:text-[#1f2937]"
                    aria-label="Profile"
                  >
                    <UserRound className="h-4 w-4" />
                  </Link>
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
            <Link
              to="/dashboard?tab=profile"
              onClick={handleProfileClick}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#e5e7eb] bg-white text-[#6b7280] transition-colors hover:text-[#1f2937]"
              title="Profile"
            >
              <UserRound className="h-4 w-4" />
            </Link>
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
