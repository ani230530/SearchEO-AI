import GSCAnalyticsView from "@/components/gsc/GSCAnalyticsView";
import type { GscAnalyticsSectionProps } from "@/features/sidebar-dashboard/types";

export function GscAnalyticsSection({ activeGscSubTab, onConnectGsc }: GscAnalyticsSectionProps) {
  // GSCBlogAnalytics was deleted in the foundational rewrite. Blog-specific
  // analytics will be rebuilt against the new schema in a follow-up.
  void activeGscSubTab;
  return (
    <div className="min-w-8xl mx-auto px-4 sm:px-6 py-8">
      <GSCAnalyticsView onConnectGsc={onConnectGsc} />
    </div>
  );
}
