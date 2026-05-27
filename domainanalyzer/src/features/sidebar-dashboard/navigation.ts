import type { SettingsSubTab } from "@/features/sidebar-dashboard/sections/settings/types";
import type { TabId } from "@/features/sidebar-dashboard/types";

export type SidebarNavigationTarget = TabId | "pricing";

export type SidebarNavigationResolution = {
  path: string;
  activeTab: TabId;
  activeSettingsSubTab?: SettingsSubTab;
};

export const DASHBOARD_QUERY_TABS: readonly TabId[] = [
  "overview",
  "analytics",
  "integration",
  "projects",
  "settings",
  "profile",
  "gsc-analytics",
  "attribution",
  "knowledge-base",
  "domain-history",
  "competitor-intelligence",
  "audit",
  "analytics-report",
];

export function resolveSidebarNavigation(
  target: SidebarNavigationTarget
): SidebarNavigationResolution {
  switch (target) {
    case "overview":
      return { path: "/dashboard?tab=overview", activeTab: "overview" };
    case "ai-visibility":
      return { path: "/ai-visibility", activeTab: "ai-visibility" };
    case "pricing":
      return {
        path: "/dashboard?tab=settings&subtab=subscription",
        activeTab: "settings",
        activeSettingsSubTab: "subscription",
      };
    default:
      return {
        path: `/dashboard?tab=${target}`,
        activeTab: target,
      };
  }
}
