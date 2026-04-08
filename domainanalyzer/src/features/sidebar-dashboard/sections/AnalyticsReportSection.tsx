import AnalyticsReportingView from "@/pages/AnalyticsReportingView";

import type { AnalyticsReportSectionProps } from "@/features/sidebar-dashboard/types";
import { extractOrgName } from "@/features/sidebar-dashboard/utils";

export function AnalyticsReportSection({
  domainContext,
  googleAnalyticsId,
}: AnalyticsReportSectionProps) {
  return (
    <AnalyticsReportingView
      initialGaId={googleAnalyticsId}
      initialOrgName={extractOrgName(domainContext)}
    />
  );
}
