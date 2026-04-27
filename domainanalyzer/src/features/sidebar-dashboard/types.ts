import type { Dispatch, ReactNode, RefObject, SetStateAction } from "react";
import type { LucideIcon } from "lucide-react";
import type { KeywordTableItem } from "@/types";
import type { WordpressIntegration } from "@/types/publish";

export type TabId =
  | "overview"
  | "analytics"
  | "integration"
  | "create-project"
  | "projects"
  | "publish"
  | "settings"
  | "profile"
  | "ai-checker"
  | "gsc-analytics"
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
  openWordpressConnection?: boolean;
}

export interface DashboardHeaderProps {
  activeTab: TabId;
  campaignViewMode: DashboardCampaignViewMode;
  selectedCampaignId: number | null;
  tabs: DashboardSidebarTab[];
  userEmail?: string | null;
  onCampaignViewModeChange: (mode: DashboardCampaignViewMode) => void;
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
  keywordsTableData: KeywordTableItem[];
  normalizedDomain: string;
  onAuditModalOpenChange: (open: boolean) => void;
  onOpenAnalytics: () => void;
  onOpenAuditDetails: () => void;
  onRunAudit: () => void;
  onViewReport: () => void;
  onVisitSite: () => void;
  overallScore: number;
  showAuditModal: boolean;
}

export interface CompanySectionProps {
  companyDomainLoading: boolean;
  isLoading: boolean;
  loadingContent: ReactNode;
  resultsContent: ReactNode;
  setupContent: ReactNode;
  showResults: boolean;
}

export interface GscAnalyticsSectionProps {
  activeGscSubTab: GscSubTabId;
}

export interface PublishSectionProps {
  companyDomain: string;
  companyDomainLoading: boolean;
  domainContext: string;
  draftStatuses: Map<number, any>;
  draftToPageMap: Map<number, number>;
  hasWordpressIntegration: boolean;
  isActive: boolean;
  keywordsTableData: KeywordTableItem[];
  pageId?: number;
  publishingPageIds: Set<number>;
  setDraftStatuses: Dispatch<SetStateAction<Map<number, any>>>;
  setDraftToPageMap: Dispatch<SetStateAction<Map<number, number>>>;
  setPublishingPageIds: Dispatch<SetStateAction<Set<number>>>;
  sharedPublishStatuses: Map<number, any>;
  wpIntegration: WordpressIntegration | null;
  onConfigureWordpress: () => void;
  onRefreshWordpressIntegration: () => Promise<void>;
}

export interface AuditSectionProps {
  activeChartTab: "overview" | "comparison" | "distribution";
  auditLoading: boolean;
  auditResult: any;
  companyDomain: string;
  n8nResults: { sheetsUrl?: string; slidesUrl?: string } | null;
  n8nStatus: "processing" | "completed" | "failed" | null;
  overallScore: number;
  resultsRef: RefObject<HTMLDivElement | null>;
  selectedMetric?: string;
  onActiveChartTabChange: (tab: "overview" | "comparison" | "distribution") => void;
  onRunAudit: () => void;
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
  publish: PublishSectionProps;
  settings: SettingsSectionProps;
}
