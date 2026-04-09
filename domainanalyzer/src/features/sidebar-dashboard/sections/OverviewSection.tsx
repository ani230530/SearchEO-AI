import { PDFDownloadLink } from "@react-pdf/renderer";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogOverlay,
  AlertDialogTitle,
} from "@radix-ui/react-alert-dialog";
import {
  ArrowRight,
  ChartNoAxesCombined,
  ChevronRight,
} from "lucide-react";

import GSCAnalyticsView from "@/components/gsc/GSCAnalyticsView";
import { AlertDialogHeader } from "@/components/ui/alert-dialog";
import { OverallScoreGauge } from "@/components/audit/AuditCharts";
import { AuditPDF } from "@/components/audit/AuditPDF";
import { cn } from "@/lib/utils";
import type { OverviewSectionProps } from "@/features/sidebar-dashboard/types";

export function OverviewSection({
  auditComplete,
  auditLoading,
  auditResult,
  campaignsCount,
  companyDomain,
  hasWordpressIntegration,
  keywordsTableData,
  normalizedDomain,
  onAuditModalOpenChange,
  onOpenAnalytics,
  onOpenAuditDetails,
  onRunAudit,
  onViewReport,
  onVisitSite,
  overallScore,
  showAuditModal,
}: OverviewSectionProps) {
  return (
    <div className="min-w-7xl mx-auto px-4 sm:px-6 py-4 space-y-12">
      <div className="relative overflow-hidden rounded-xl border border-gray-200 bg-gradient-to-br from-white via-slate-50 to-white">
        <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full blur-3xl" />
        <p className="pl-4 pt-4 text-base text-[#717680]">Free website audit</p>
        <div className="relative p-4 sm:p-4 gap-10 justify-between">
          <div className="min-w-4xl">
            <h1 className="text-3xl sm:text-2xl font-bold text-gray-900 leading-tight">
              Analyze Your Site&apos;s SEO, Performance, and Visibility in Seconds
            </h1>
            <p className="pt-4 text-base text-[#717680]">
              Get a clear view of how your website is performing across key metrics. Identify
              technical issues, uncover optimization opportunities, and understand what&apos;s
              holding your rankings back. We&apos;ll scan your site and deliver actionable insights to
              improve search visibility, speed, and overall performance.
            </p>
          </div>

          <div className="hidden lg:block w-px h-54 bg-gray-200" />

          <div className="items-start gap-6">
            <div className="mt-6 flex flex-wrap items-center gap-3">
              {companyDomain && (
                <div className="flex items-center gap-3 border border-gray-200 text-blue-700 px-5 py-3 rounded-xl flex-1 min-w-[300px]">
                  <img
                    src={`https://img.logo.dev/${normalizedDomain}?token=pk_DTdFFG1JT9WOCjATvZEzIA&size=128`}
                    alt="Company logo"
                    width={32}
                    height={32}
                    className="w-8 h-8 rounded-md"
                    loading="lazy"
                  />
                  <span className="font-medium text-lg tracking-tight">
                    <a
                      href={companyDomain.startsWith("http") ? companyDomain : `https://${companyDomain}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      {companyDomain.replace(/^https?:\/\//, "").replace(/^www\./, "")}
                    </a>
                  </span>
                </div>
              )}

              <button
                onClick={onRunAudit}
                disabled={auditLoading || !companyDomain}
                className={cn(
                  "inline-flex items-center justify-center gap-2 px-6 py-3 text-white rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-60 transition min-h-[52px] min-w-[180px]",
                  auditLoading && "cursor-not-allowed"
                )}
                style={{
                  background: "linear-gradient(90deg, #2D4059 0%, #4E76C7 100%)",
                }}
              >
                <img
                  src="https://res.cloudinary.com/dgfzjdi68/image/upload/v1775200251/file-check-02_zg8eno.png"
                  alt="Check icon"
                  className="w-5 h-5"
                />
                {auditLoading ? "Running audit..." : "Run Audit"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="w-full flex items-center justify-between px-4">
        <div className="text-xl font-bold text-gray-900">Overview</div>

        <div className="flex items-center gap-3">
          <button
            onClick={onVisitSite}
            className="inline-flex items-center gap-1 px-2 py-2 text-sm font-medium text-[#4E76C7] rounded-lg hover:underline transition"
          >
            <img
              src="https://res.cloudinary.com/dgfzjdi68/image/upload/v1775205399/gridicons_external_y0240k.png"
              alt="Visit Site"
              className="w-4 h-4"
            />
            <span className="font-medium">Visit Site</span>
          </button>

          <button
            onClick={onOpenAnalytics}
            className="inline-flex items-center gap-1 px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100 transition"
          >
            <img
              src="https://res.cloudinary.com/dgfzjdi68/image/upload/v1775224313/uil_chart-growth_v4botd.png"
              alt="Analytics"
              className="w-4 h-4"
            />
            Analytics
          </button>

          <button className="inline-flex items-center gap-1 px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100 transition">
            <img
              src="https://res.cloudinary.com/dgfzjdi68/image/upload/v1775224439/calendar_jb8btr.png"
              alt="Select Duration"
              className="w-4 h-4"
            />
            Select Duration
          </button>

          <button className="inline-flex items-center gap-1 px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100 transition">
            <img
              src="https://res.cloudinary.com/dgfzjdi68/image/upload/v1775224313/uil_chart-growth_v4botd.png"
              alt="Sort"
              className="w-4 h-4"
            />
            Sort
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl bg-white border border-gray-100 p-6 transition">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[28px] font-medium text-gray-900">Top Opportunities</h3>
            <div className="text-base font-medium text-gray-900">Volume</div>
          </div>

          <div className="space-y-4">
            {keywordsTableData
              .slice()
              .sort((a, b) => (b.volume || 0) - (a.volume || 0))
              .slice(0, 5)
              .map((item, idx) => (
                <div key={idx} className="flex items-center justify-between">
                  <div>
                    <div className="text-lg font-medium text-gray-700">
                      {item?.keyword.charAt(0).toUpperCase() + item?.keyword.slice(1) || "No keywords yet"}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">High potential growth keyword</div>
                  </div>

                  <div className="px-3 py-2 rounded-2xl bg-blue-50 flex items-center justify-center min-w-[50px]">
                    <span className="text-sm font-medium text-blue-700">
                      {item?.volume
                        ? item.volume >= 1000
                          ? `${(item.volume / 1000).toFixed(1)}K`
                          : item.volume.toLocaleString()
                        : "-"}
                    </span>
                  </div>
                </div>
              ))}
          </div>
        </div>

        {showAuditModal && (
          <div className="absolute inset-0 z-50 flex items-center justify-center">
            <div className="max-w-md w-full rounded-2xl bg-white shadow-2xl">
              <AlertDialog open={showAuditModal} onOpenChange={onAuditModalOpenChange}>
                <AlertDialogOverlay className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40" />
                <AlertDialogContent
                  className=" fixed left-1/2 top-1/2 z-50
    -translate-x-1/2 -translate-y-1/2
    max-w-md w-full
    rounded-2xl
    bg-white
    border border-gray-100
    shadow-2xl
    animate-in fade-in zoom-in-95"
                >
                  <div className="p-4 rounded-lg bg-gradient-to-r from-white/80 to-gray-50 border border-gray-100">
                    <AlertDialogHeader>
                      <AlertDialogTitle className="text-2xl font-medium">Audit Completed</AlertDialogTitle>
                      <AlertDialogDescription className="text-sm text-muted-foreground">
                        Your domain audit has finished. Here&apos;s a quick summary, you can view the full
                        report or download it.
                      </AlertDialogDescription>
                    </AlertDialogHeader>

                    <div className="mt-4 flex items-center gap-4">
                      <div className="flex-shrink-0">
                        <OverallScoreGauge
                          score={
                            Math.round(
                              ((auditResult?.performance || 0) +
                                (auditResult?.seo || 0) +
                                (auditResult?.accessibility || 0) +
                                (auditResult?.bestPractices || 0)) /
                                4 *
                                100
                            ) / 100 || 0
                          }
                        />
                      </div>
                      <div className="flex-1">
                        <div className="text-sm text-gray-600 mb-2">Top category</div>
                        <div className="text-base font-medium text-gray-900">
                          {auditResult ? (
                            (() => {
                              const cats = [
                                { k: "Performance", v: auditResult.performance },
                                { k: "SEO", v: auditResult.seo },
                                { k: "Accessibility", v: auditResult.accessibility },
                                { k: "Best Practices", v: auditResult.bestPractices },
                              ];
                              const scored = cats.map((category) => ({
                                ...category,
                                s: Math.round((category.v || 0) * 100),
                              }));
                              const best = scored.reduce((a, b) => (b.s > a.s ? b : a), scored[0]);
                              return `${best.k} - ${best.s}%`;
                            })()
                          ) : (
                            "-"
                          )}
                        </div>
                        <div className="text-xs text-gray-500 mt-2">
                          Click below to view the full interactive report.
                        </div>
                      </div>
                    </div>

                    <div className="mt-6 flex items-center justify-end gap-2">
                      {auditResult && companyDomain && (
                        <PDFDownloadLink
                          document={<AuditPDF data={auditResult} domain={companyDomain} />}
                          fileName={`audit-${companyDomain}-${new Date().toISOString().split("T")[0]}.pdf`}
                          className="px-4 py-2 rounded-full border border-gray-200 text-sm font-light bg-white hover:bg-gray-50 flex items-center justify-center"
                        >
                          {({ loading }) => (loading ? "Preparing..." : "Export PDF")}
                        </PDFDownloadLink>
                      )}
                      <AlertDialogAction
                        onClick={onViewReport}
                        className="px-4 py-2 rounded-full bg-black text-white text-sm"
                      >
                        View Full Report
                      </AlertDialogAction>
                      <AlertDialogCancel className="px-4 py-2 rounded-full border border-gray-200 text-sm">
                        Close
                      </AlertDialogCancel>
                    </div>
                  </div>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        )}

        <div className="lg:col-span-1 rounded-xl bg-white border border-gray-100 p-6 shadow-sm transition-shadow duration-300">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-[28px] font-medium text-gray-900">Audit Summary</h3>
              <p className="text-xs text-gray-400">Lighthouse performance breakdown</p>
            </div>

            <button
              onClick={onOpenAuditDetails}
              className="group text-sm font-medium text-black transition-colors duration-200 flex items-center gap-1"
            >
              View Details
              <span className="relative flex items-center w-4 h-4">
                <ChevronRight className="absolute inset-0 w-4 h-4 transition-all duration-200 ease-in-out group-hover:opacity-0 group-hover:translate-x-1" />
                <ArrowRight className="absolute inset-0 w-4 h-4 opacity-0 transition-all duration-200 ease-in-out group-hover:opacity-100 group-hover:translate-x-0" />
              </span>
            </button>
          </div>

          {!auditResult ? (
            <p className="text-sm text-gray-500">Run an audit to view performance metrics.</p>
          ) : (
            <div className="flex gap-6">
              <div className="flex flex-col gap-6 flex-1">
                {[
                  ["Performance", auditResult.performance],
                  ["SEO", auditResult.seo],
                  ["Accessibility", auditResult.accessibility],
                  ["Best Practices", auditResult.bestPractices],
                ].map(([label, value]) => {
                  const pct = Math.round((value || 0) * 100);
                  let bgColor = "bg-gray-50";
                  let textColor = "text-gray-900";

                  if (pct >= 80) {
                    bgColor = "bg-green-50";
                    textColor = "text-green-700";
                  } else if (pct >= 60) {
                    bgColor = "bg-yellow-50";
                    textColor = "text-yellow-700";
                  } else if (pct >= 40) {
                    bgColor = "bg-orange-50";
                    textColor = "text-orange-700";
                  } else {
                    bgColor = "bg-red-50";
                    textColor = "text-red-700";
                  }

                  return (
                    <div
                      key={label}
                      className={`flex items-center justify-between rounded-xl px-3 py-4 ${bgColor}`}
                    >
                      <div className="flex items-center gap-2">
                        <ChartNoAxesCombined />
                        <span className="text-medium text-gray-600">{label}</span>
                      </div>
                      <span className={`font-semibold ${textColor}`}>{pct}%</span>
                    </div>
                  );
                })}
              </div>

              {auditResult && auditComplete && (
                <div className="flex items-center justify-center">
                  <OverallScoreGauge
                    size={150}
                    score={
                      (auditResult.performance +
                        auditResult.seo +
                        auditResult.accessibility +
                        auditResult.bestPractices) /
                      4
                    }
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-1 gap-6">
        <div className="rounded-3xl bg-white border border-gray-100 p-6 transition">
          <div className="mb-6">
            <h3 className="text-[28px] font-medium text-gray-900">Snapshot</h3>
            <p className="text-xs text-gray-400 mt-1">Quick overview of your setup</p>
          </div>

          <div className="grid grid-cols-4 gap-4">
            {[
              ["Keywords", keywordsTableData.length],
              ["Campaigns", campaignsCount],
              ["WordPress", hasWordpressIntegration ? "Connected" : "Not connected"],
              ["Integrations", hasWordpressIntegration ? "WordPress" : "-"],
            ].map(([label, value]) => {
              const isConnected = value === "Connected" || value === "Disconnected";

              return (
                <div
                  key={label}
                  className="group rounded-2xl border border-gray-100 bg-gray-50/60 p-4 text-left hover:shadow-sm transition"
                >
                  <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>

                  <div className="mt-2 flex items-center justify-between">
                    <div
                      className={cn(
                        "text-2xl font-semibold",
                        isConnected ? "text-green-600" : "text-gray-900"
                      )}
                    >
                      {value}
                    </div>

                    {isConnected && (
                      <span className="flex items-center gap-1 text-xs font-medium text-green-600">
                        <span className="h-2 w-2 rounded-full bg-green-500" />
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="px-4 py-6 grid-cols-1 lg:grid-cols-1 rounded-3xl bg-white border border-gray-100 p-6 transition">
          <GSCAnalyticsView />
        </div>
      </div>
    </div>
  );
}
