import type { SettingsSubTab } from "@/features/sidebar-dashboard/sections/settings/types";
import type { TabId } from "@/features/sidebar-dashboard/types";

export type SidebarNavigationTarget = TabId | "pricing";

export type SidebarNavigationResolution = {
  path: string;
  activeTab: TabId;
  activeSettingsSubTab?: SettingsSubTab;
};

const DASHBOARD_SECTION_PATHS: Record<TabId, string> = {
  overview: "/dashboard/overview",
  analytics: "/dashboard/company",
  integration: "/dashboard/integration",
  "domain-history": "/dashboard/domain-history",
  projects: "/dashboard/campaigns",
  settings: "/dashboard/settings/profile",
  "ai-visibility": "/dashboard/ai-visibility",
  "gsc-analytics": "/dashboard/gsc-analytics",
  attribution: "/dashboard/attribution",
  audit: "/dashboard/website-audit",
  "analytics-report": "/dashboard/performance-reports",
  "competitor-intelligence": "/dashboard/competitor-intelligence",
  "knowledge-base": "/dashboard/knowledge-base",
};

const SETTINGS_SUBTAB_PATHS: Record<SettingsSubTab, string> = {
  profile: "profile",
  "knowledge-base": "knowledge-base",
  "privacy-security": "privacy-security",
  notifications: "notifications",
  subscription: "subscription",
  integrations: "integrations",
};

const PATH_TO_TAB: Record<string, TabId> = Object.entries(DASHBOARD_SECTION_PATHS).reduce(
  (acc, [tabId, path]) => {
    acc[path] = tabId as TabId;
    return acc;
  },
  {} as Record<string, TabId>,
);

const stripTrailingSlash = (value: string) => value.replace(/\/+$/, "") || "/";

export function resolveDashboardPath(
  target: TabId,
  options?: { settingsSubTab?: SettingsSubTab }
): string {
  if (target === "settings") {
    const subTab = options?.settingsSubTab ?? "profile";
    return `/dashboard/settings/${SETTINGS_SUBTAB_PATHS[subTab]}`;
  }

  return DASHBOARD_SECTION_PATHS[target];
}

export function resolveSidebarNavigation(
  target: SidebarNavigationTarget,
  options?: { settingsSubTab?: SettingsSubTab }
): SidebarNavigationResolution {
  switch (target) {
    case "overview":
      return { path: resolveDashboardPath("overview"), activeTab: "overview" };
    case "ai-visibility":
      return { path: resolveDashboardPath("ai-visibility"), activeTab: "ai-visibility" };
    case "pricing":
      return {
        path: resolveDashboardPath("settings", { settingsSubTab: "subscription" }),
        activeTab: "settings",
        activeSettingsSubTab: "subscription",
      };
    case "settings":
      return {
        path: resolveDashboardPath("settings", { settingsSubTab: options?.settingsSubTab }),
        activeTab: "settings",
        activeSettingsSubTab: options?.settingsSubTab ?? "profile",
      };
    default:
      return {
        path: resolveDashboardPath(target),
        activeTab: target,
      };
  }
}

export function resolveDashboardTabFromPathname(pathname: string): {
  activeTab: TabId | undefined;
  activeSettingsSubTab?: SettingsSubTab;
  canonicalPath?: string;
} {
  const normalizedPath = stripTrailingSlash(pathname);
  const legacyRoot = normalizedPath === "/dashboard" || normalizedPath === "/newdashboard";

  if (legacyRoot) {
    return {
      activeTab: "overview",
      canonicalPath: resolveDashboardPath("overview"),
    };
  }

  const campaignMatch = normalizedPath.match(/^\/dashboard\/campaigns(?:\/([^/]+))?$/);
  if (campaignMatch) {
    return {
      activeTab: "projects",
      canonicalPath: normalizedPath,
    };
  }

  const settingsMatch = normalizedPath.match(/^\/dashboard\/settings\/([^/]+)$/);
  if (settingsMatch) {
    const subTab = settingsMatch[1] as SettingsSubTab;
    if (subTab in SETTINGS_SUBTAB_PATHS) {
      return {
        activeTab: "settings",
        activeSettingsSubTab: subTab,
        canonicalPath: `/dashboard/settings/${SETTINGS_SUBTAB_PATHS[subTab]}`,
      };
    }
  }

  const dashboardMatch = normalizedPath.match(/^\/dashboard\/([^/]+)$/);
  if (dashboardMatch) {
    const sectionSlug = dashboardMatch[1];
    const tab = PATH_TO_TAB[`/dashboard/${sectionSlug}`];

    if (tab === "settings") {
      return {
        activeTab: "settings",
        activeSettingsSubTab: "profile",
        canonicalPath: resolveDashboardPath("settings"),
      };
    }

    if (tab) {
      return {
        activeTab: tab,
        canonicalPath: resolveDashboardPath(tab),
      };
    }
  }

  if (normalizedPath === "/dashboard") {
    return {
      activeTab: "overview",
      canonicalPath: resolveDashboardPath("overview"),
    };
  }

  return { activeTab: undefined };
}

export function resolveAIResultsNavigation(
  itemId: "ai-results" | "competitors" | "prompts",
  maskedDomainId: string,
  _subTab?: string
): string {
  switch (itemId) {
    case "ai-results":
      return `/ai-results/${maskedDomainId}`;
    case "prompts":
      return `/ai-results/${maskedDomainId}/prompts`;
    case "competitors":
      // Competitors page expects domain in query string when navigating from shell
      return `/airesults-competitors-preview?domain=${maskedDomainId}`;
    default:
      return "/dashboard";
  }
}
