import { Bell, HelpCircle, User } from "lucide-react";

import type { DashboardHeaderProps } from "@/features/sidebar-dashboard/types";

function deriveDisplayName(email?: string | null): string {
  if (!email) return "Admin";
  const local = email.split("@")[0] ?? "";
  if (!local) return "Admin";
  const cleaned = local.replace(/[._-]+/g, " ").trim();
  if (!cleaned) return "Admin";
  return cleaned
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatLastSync(value?: Date | string | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const day = date.getDate();
  const month = date.toLocaleString("en-US", { month: "short" });
  const year = date.getFullYear();
  const time = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${day} ${month} ${year}, ${time}`;
}

export function DashboardHeader({
  activeTab,
  tabs,
  userEmail,
  onTabChange,
  lastSync,
}: DashboardHeaderProps) {
  const activeLabel = tabs.find((tab) => tab.id === activeTab)?.label || "Dashboard";
  const isOverview = activeTab === "overview";
  const displayName = deriveDisplayName(userEmail);
  const formattedSync = formatLastSync(lastSync);

  return (
    <header className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4 sm:py-5">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-lg sm:text-xl font-semibold text-gray-900 truncate">
            {isOverview ? `Welcome back, ${displayName}!` : activeLabel}
          </h1>
          {isOverview && formattedSync && (
            <p className="mt-1 text-xs text-gray-500">Last sync: {formattedSync}</p>
          )}
        </div>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <button
            type="button"
            className="hidden sm:inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 transition"
            title="Help"
          >
            <HelpCircle className="h-5 w-5" />
          </button>
          <button
            type="button"
            className="hidden sm:inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 transition"
            title="Notifications"
          >
            <Bell className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => onTabChange?.("profile")}
            className="inline-flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 transition"
            title={userEmail ?? "Profile"}
          >
            <User className="h-5 w-5" />
          </button>
        </div>
      </div>
    </header>
  );
}
