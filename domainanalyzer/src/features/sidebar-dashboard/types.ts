import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export type TabId =
  | "overview"
  | "analytics"
  | "projects"
  | "publish"
  | "settings"
  | "profile"
  | "ai-checker"
  | "gsc-analytics"
  | "audit"
  | "analytics-report";

export type CompanySubTabId = "company-info" | "integration";

export type GscSubTabId = "whole-analytics" | "blog-performance";

export interface DashboardTabConfig {
  id: TabId;
  label: string;
  icon: LucideIcon;
}

export interface DashboardSidebarTab {
  id: TabId;
  label: string;
  icon: ReactNode;
}

export type DashboardCampaignViewMode = "split" | "graph" | "table";

export interface DomainCheckResult {
  exists: boolean;
  domainId?: number;
  url?: string;
  hasCurrentAnalysis?: boolean;
  lastAnalyzed?: string;
}

export interface DashboardSearchState {
  redirectToAiChecker: boolean;
  activeTab?: TabId;
  activeCompanySubTab?: CompanySubTabId;
}

export interface DashboardHeaderProps {
  activeTab: TabId;
  campaignViewMode: DashboardCampaignViewMode;
  selectedCampaignId: number | null;
  tabs: DashboardSidebarTab[];
  userEmail?: string | null;
  onCampaignViewModeChange: (mode: DashboardCampaignViewMode) => void;
}

export interface AnalyticsReportSectionProps {
  domainContext: string;
  googleAnalyticsId: string;
}

export interface GscAnalyticsSectionProps {
  activeGscSubTab: GscSubTabId;
}

export interface SettingsSectionProps {
  confirmUpdateOpen: boolean;
  updateLoading: boolean;
  onCloseConfirm: () => void;
  onConfirmUpdate: () => void | Promise<void>;
  onOpenConfirm: () => void;
}

export interface DashboardContentRouterProps {
  activeTab: TabId;
  analyticsContent: ReactNode;
  auditContent: ReactNode;
  overviewContent: ReactNode;
  projectsContent: ReactNode;
  publishContent: ReactNode;
  tabs: DashboardSidebarTab[];
  analyticsReport: AnalyticsReportSectionProps;
  gscAnalytics: GscAnalyticsSectionProps;
  settings: SettingsSectionProps;
}
