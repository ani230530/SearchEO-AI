import PublishExperience from "@/features/publish/PublishExperience";
import type { PublishSectionProps } from "@/features/sidebar-dashboard/types";
import { CompanyInfoSkeleton } from "@/components/dashboard/CompanyInfoSkeleton";

export function PublishSection({
  companyDomain,
  companyDomainLoading,
  domainContext,
  draftStatuses,
  draftToPageMap,
  hasWordpressIntegration,
  isActive,
  keywordsTableData,
  pageId,
  publishingPageIds,
  setDraftStatuses,
  setDraftToPageMap,
  setPublishingPageIds,
  sharedPublishStatuses,
  wpIntegration,
  onConfigureWordpress,
  onRefreshWordpressIntegration,
}: PublishSectionProps) {
  if (companyDomainLoading) {
    return <CompanyInfoSkeleton />;
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
      <PublishExperience
        companyDomain={companyDomain}
        domainContext={domainContext}
        keywordsTableData={keywordsTableData}
        hasWordpressIntegration={hasWordpressIntegration}
        wpIntegration={wpIntegration}
        onConfigureWordpress={onConfigureWordpress}
        onRefreshWordpressIntegration={onRefreshWordpressIntegration}
        isActive={isActive}
        pageId={pageId}
        publishingPageIds={publishingPageIds}
        setPublishingPageIds={setPublishingPageIds}
        draftToPageMap={draftToPageMap}
        setDraftToPageMap={setDraftToPageMap}
        draftStatuses={draftStatuses}
        setDraftStatuses={setDraftStatuses}
        sharedPublishStatuses={sharedPublishStatuses}
      />
    </div>
  );
}
