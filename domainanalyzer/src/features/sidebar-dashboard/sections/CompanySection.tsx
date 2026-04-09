import { CompanyInfoSkeleton } from "@/components/dashboard/CompanyInfoSkeleton";
import type { CompanySectionProps } from "@/features/sidebar-dashboard/types";

export function CompanySection({
  companyDomainLoading,
  isLoading,
  loadingContent,
  resultsContent,
  setupContent,
  showResults,
}: CompanySectionProps) {
  if (companyDomainLoading) {
    return <CompanyInfoSkeleton />;
  }

  if (showResults) {
    return <>{resultsContent}</>;
  }

  if (isLoading) {
    return <>{loadingContent}</>;
  }

  return <>{setupContent}</>;
}
