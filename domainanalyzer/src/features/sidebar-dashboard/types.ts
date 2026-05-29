import type { Dispatch, ReactNode, RefObject, SetStateAction } from "react";
import type { LucideIcon } from "lucide-react";
import type { KeywordTableItem } from "@/types";
import type { WordpressIntegration } from "@/types/publish";
import type { SettingsSubTab } from "@/features/sidebar-dashboard/sections/settings/types";

export type TabId =
  | "overview"
  | "analytics"
  | "integration"
  | "domain-history"
  | "projects"
  | "settings"
  | "profile"
  | "ai-visibility"
  | "gsc-analytics"
  | "attribution"
  | "audit"
  | "analytics-report"
  | "competitor-intelligence"
  | "knowledge-base";

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

export interface DomainCheckResult {
  exists: boolean;
  domainId?: number;
  url?: string;
  hasCurrentAnalysis?: boolean;
  lastAnalyzed?: string;
}

export interface DashboardSearchState {
  redirectToAiVisibility: boolean;
  activeTab?: TabId;
  activeCompanySubTab?: CompanySubTabId;
  activeSettingsSubTab?: SettingsSubTab;
  activeCampaignId?: number;
  openWordpressConnection?: boolean;
  action?: string;
}

export interface DashboardHeaderProps {
  activeTab: TabId;
  tabs: DashboardSidebarTab[];
  companyDomain?: string;
  userEmail?: string | null;
  userName?: string | null;
  lastSyncedAt?: Date | null;
  onAddDomain?: () => void;
  onTabChange?: (tab: TabId) => void;
}

export interface AnalyticsReportSectionProps {
  domainContext: string;
  googleAnalyticsId: string;
}

export interface OverviewSectionProps {
  auditComplete: boolean;
  auditLoading: boolean;
  auditResult: any;
  campaignsCount: number;
  companyDomain: string;
  hasWordpressIntegration: boolean;
  competitorOverview: CompetitorOverviewState;
  keywordsTableData: KeywordTableItem[];
  normalizedDomain: string;
  onAddDomain: () => void;
  onAuditModalOpenChange: (open: boolean) => void;
  onOpenAnalytics: () => void;
  onOpenAuditDetails: () => void;
  onOpenProjects: () => void;
  onOpenIntegration: () => void;
  onRunAudit: () => void;
  onViewReport: () => void;
  onVisitSite: () => void;
  overallScore: number;
  showAuditModal: boolean;
}

export interface CompetitorOverviewRow {
  domain: string;
  keywords: string;
  overlap: string;
  traffic: string;
}

export interface CompetitorOverviewState {
  loading: boolean;
  error?: string | null;
  rows: CompetitorOverviewRow[];
}

export interface CompanySectionProps {
  companyDomainLoading: boolean;
  isLoading: boolean;
  loadingContent: ReactNode;
  resultsContent: ReactNode;
  setupContent: ReactNode;
  showResults: boolean;
}

export interface DomainInfoEmptyProps {
  /** Switch the dashboard to the Website Audit tab. */
  onGoToAudit: () => void;
}

export interface GscAnalyticsSectionProps {
  activeGscSubTab: GscSubTabId;
  onConnectGsc?: () => void;
}

export interface AuditSectionProps {
  activeChartTab: "overview" | "comparison" | "distribution";
  auditLoading: boolean;
  auditResult: any;
  companyDomain: string;
  /** True while we're still resolving whether the user has a company
   *  domain set. Without this we'd briefly show the setup flow even for
   *  users who already have a domain. */
  companyDomainLoading: boolean;
  n8nResults: { sheetsUrl?: string; slidesUrl?: string } | null;
  n8nStatus: "processing" | "completed" | "failed" | null;
  overallScore: number;
  resultsRef: RefObject<HTMLDivElement | null>;
  selectedMetric?: string;
  onActiveChartTabChange: (tab: "overview" | "comparison" | "distribution") => void;
  onRunAudit: () => void;
  /** Called when the inline setup flow finishes — parent refreshes the
   *  company-domain state and kicks off the Lighthouse audit. */
  onSetupComplete: (args: { domainId: number; normalizedUrl: string }) => void;
  onSelectedMetricChange: (metric: string) => void;
}



export interface CompetitorIntelligenceProps {
  domainId: string;

  // State
  loading: boolean;
  progress: number;

  // Data
  competitors: string[];
  data: {
    domain: string;
    keywords: number;
    overlap: number;
    mentions?: number;
    marketShare?: number;
    estimatedTraffic?: number;
    traffic: number | string;
  }[];

  // Optional UI
  title?: string;
  subtitle?: string;

  // Ref (optional like audit)
  tableRef?: RefObject<HTMLDivElement | null>;

  // Actions
  onRunAnalysis: (competitorDomain: string) => void;
  onRefresh?: () => void;
  onExport?: () => void;
  onImport?: () => void;
}

export interface SettingsSectionProps {
  confirmUpdateOpen: boolean;
  updateLoading: boolean;
  onCloseConfirm: () => void;
  onConfirmUpdate: () => void | Promise<void>;
  onOpenConfirm: () => void;
  activeSubTab?: SettingsSubTab;
}

export interface DashboardContentRouterProps {
  activeTab: TabId;
  tabs: DashboardSidebarTab[];
  audit: AuditSectionProps;
  company: CompanySectionProps;
  analyticsReport: AnalyticsReportSectionProps;
  gscAnalytics: GscAnalyticsSectionProps;
  competitorIntelligence: CompetitorIntelligenceProps;
  overview: OverviewSectionProps;
  settings: SettingsSectionProps;
  onMenuItemClick?: (tabId: TabId, domainId?: string | number) => void;
}
