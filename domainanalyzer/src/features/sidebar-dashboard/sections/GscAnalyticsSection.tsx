import GSCAnalyticsView from "@/components/gsc/GSCAnalyticsView";
import GSCBlogAnalytics from "@/features/analytics/GSCBlogAnalytics";
import type { GscAnalyticsSectionProps } from "@/features/sidebar-dashboard/types";

export function GscAnalyticsSection({ activeGscSubTab }: GscAnalyticsSectionProps) {
  return (
    <div className="min-w-8xl mx-auto px-4 sm:px-6 py-8">
      {activeGscSubTab === "whole-analytics" ? <GSCAnalyticsView /> : <GSCBlogAnalytics />}
    </div>
  );
}
