import { AnalyticsReportSection } from "@/features/sidebar-dashboard/sections/AnalyticsReportSection";
import { AuditSection } from "@/features/sidebar-dashboard/sections/AuditSection";
import { CompanySection } from "@/features/sidebar-dashboard/sections/CompanySection";
import { GscAnalyticsSection } from "@/features/sidebar-dashboard/sections/GscAnalyticsSection";
import AttributionSection from "@/features/sidebar-dashboard/sections/AttributionSection";
import KnowledgeBaseSection from "@/features/sidebar-dashboard/sections/KnowledgeBaseSection";
import { DomainHistorySection } from "@/features/sidebar-dashboard/sections/DomainHistorySection";
import CompetitorPage from "@/features/sidebar-dashboard/sections/CompetitorPage";
import { OverviewSection } from "@/features/sidebar-dashboard/sections/OverviewSection";
import { SettingsSection } from "@/features/sidebar-dashboard/sections/SettingsSection";
import AIVisibilityDashboard from "@/pages/AIVisibilityDashboard";
import type { DashboardContentRouterProps } from "@/features/sidebar-dashboard/types";
// CompetitorPage was deleted in the foundational rewrite — competitor data
// now lives on the wizard pipeline. Tab is hidden until rebuilt against the
// new Competitor schema.
export function DashboardContentRouter({
  activeTab,
  tabs,
  audit,
  company,
  analyticsReport,
  gscAnalytics,
  overview,
  settings,
  competitorIntelligence,
  onMenuItemClick,
}: DashboardContentRouterProps) {
  switch (activeTab) {
    case "ai-visibility":
      return <AIVisibilityDashboard />;
    case "overview":
      return <OverviewSection {...overview} />;
    case "analytics":
      return <CompanySection {...company} />;
    case "audit":
      return <AuditSection {...audit} />;
    case "analytics-report":
      return <AnalyticsReportSection {...analyticsReport} />;
    case "gsc-analytics":
      return <GscAnalyticsSection {...gscAnalytics} />;
    case "attribution":
      return <AttributionSection />;
    case "competitor-intelligence":
      return <CompetitorPage {...competitorIntelligence} />;
    case "knowledge-base":
      return <KnowledgeBaseSection />;
    case "domain-history":
      return <DomainHistorySection onMenuItemClick={onMenuItemClick} />;
    case "settings":
      return <SettingsSection {...settings} />;
    default:
      return (
        <div
          style={{
            background: "rgba(255, 255, 255, 0.8)",
            backdropFilter: "saturate(180%) blur(20px)",
            WebkitBackdropFilter: "saturate(180%) blur(20px)",
            border: "0.5px solid rgba(0, 0, 0, 0.1)",
            borderRadius: "16px",
            padding: "48px",
            textAlign: "center",
          }}
        >
          <p
            style={{
              fontSize: "17px",
              fontWeight: "300",
              letterSpacing: "0.011em",
              color: "#86868b",
              margin: "0",
            }}
          >
            Content for {tabs.find((tab) => tab.id === activeTab)?.label || "Dashboard"} will appear
            here
          </p>
        </div>
      );
  }
}
