import { Bell, CircleHelp, LogOut, UserRound, Link as LinkIcon } from "lucide-react"; // Renamed icon to LinkIcon
import { Link } from "react-router-dom"; // Link for navigation (use "next/link" if using Next.js)
import { resolveDashboardPath } from "@/features/sidebar-dashboard/navigation";

import type { DashboardHeaderProps } from "@/features/sidebar-dashboard/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// Added userEmail to props since it was being used below
interface ExtendedProps extends DashboardHeaderProps {
  userEmail?: string;
}

export function DashboardHeader({
  activeTab,
  tabs,
  userName,
  userEmail,
  lastSyncedAt,
  onLogout,
  onTabChange,
}: ExtendedProps) {
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

  const profileLink = resolveDashboardPath("settings", { settingsSubTab: "profile" });

  // This one variable now contains all your header buttons (Bell, Help, Profile)
  const headerActions = (
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

      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#e5e7eb] bg-white text-[#6b7280] transition-colors hover:text-[#1f2937]"
                aria-label="Profile"
              >
                <UserRound className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">Profile</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end" className="min-w-[14rem] p-1">
          <DropdownMenuItem asChild className="cursor-pointer">
            <Link to={profileLink}>Profile information</Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              void onLogout();
            }}
            className="text-red-500 focus:text-red-500 focus:bg-red-50 cursor-pointer"
          >
            <span className="inline-flex items-center gap-2">
              <LogOut className="h-4 w-4" />
              Logout
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  return (
    <header className="content-header">
      <TooltipProvider delayDuration={120}>
        {activeTab === "overview" || activeTab === "ai-visibility" ? (
          /* OVERVIEW LAYOUT */
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[20px] font-medium tracking-[-0.02em] text-[#1d1d1f]">
                Welcome back, {displayName}!
              </p>
              <p className="mt-1 text-[12px] text-[#6b7280]">
                Last sync: {formattedLastSynced}
              </p>
            </div>
            {headerActions}
          </div>
        ) : (
          /* DEFAULT TAB LAYOUT */
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <h2 className="text-[28px] font-normal tracking-[-0.022em] text-[#1d1d1f] m-0">
                {activeLabel}
              </h2>
            </div>

            <div className="flex items-center gap-3">
              {userEmail && (
                <div className="bg-[#007AFF1A] text-[#007AFF] px-3 py-1.5 rounded-[12px] text-[14px] font-medium">
                  {userEmail}
                </div>
              )}
              {headerActions}
            </div>
          </div>
        )}
      </TooltipProvider>
    </header>
  );
}
