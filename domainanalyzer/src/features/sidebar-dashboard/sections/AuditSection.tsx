import { PDFDownloadLink } from "@react-pdf/renderer";
import { Loader2 } from "lucide-react";

import {
  AuditBarChart,
  AuditGaugeChart,
  AuditRadarChart,
  AuditScoreDistribution,
  OverallScoreGauge,
} from "@/components/audit/AuditCharts";
import { AuditPDF } from "@/components/audit/AuditPDF";
import {
  CATEGORY_DESCRIPTIONS,
  METRIC_DESCRIPTIONS,
} from "@/features/sidebar-dashboard/constants";
import type { AuditSectionProps } from "@/features/sidebar-dashboard/types";
import { cn } from "@/lib/utils";

function InfoTooltip({ text }: { text: string }) {
  return (
    <span className="relative inline-flex items-center ml-1">
      <span className="peer text-gray-400 hover:text-gray-600 transition-colorstext-xs">
        i
      </span>
      <span
        className="
        pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-2
        w-64 rounded-xl bg-gray-800 text-white text-sm leading-relaxed
        px-3 py-2 opacity-0 scale-95 translate-y-1
        peer-hover:opacity-100 peer-hover:scale-100 peer-hover:translate-y-0
        transition-all duration-200 ease-out z-50
      "
      >
        {text}
        <span className="absolute left-1/2 -translate-x-1/2 top-full w-2 h-2 bg-gray-900 rotate-45" />
      </span>
    </span>
  );
}

export function AuditSection({
  activeChartTab,
  auditLoading,
  auditResult,
  companyDomain,
  n8nResults,
  n8nStatus,
  overallScore,
  resultsRef,
  selectedMetric,
  onActiveChartTabChange,
  onRunAudit,
  onSelectedMetricChange,
}: AuditSectionProps) {
  const categories = auditResult
    ? [
        { label: "Performance", value: auditResult.performance },
        { label: "SEO", value: auditResult.seo },
        { label: "Accessibility", value: auditResult.accessibility },
        { label: "Best Practices", value: auditResult.bestPractices },
      ]
    : [];

  const scored = categories.map((category) => ({
    ...category,
    score: Math.round((category.value || 0) * 100),
  }));
  const best = scored.length > 0 ? scored.reduce((a, b) => (b.score > a.score ? b : a)) : null;
  const worst = scored.length > 0 ? scored.reduce((a, b) => (b.score < a.score ? b : a)) : null;

  return (
    <div className="relative min-h-screen w-full">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-gray-100 rounded-full blur-3xl opacity-20" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-gray-100 rounded-full blur-3xl opacity-20" />
      </div>

      <div className="relative z-10 w-full min-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-4">
        <div className="text-left mb-2">
          <h1 className="text-4xl font-thin text-black tracking-tight mb-4">Audit Your Domain</h1>
          <p className="text-gray-600 mb-3">
            Get comprehensive Lighthouse metrics, SEO insights, accessibility scores, and
            performance data.
          </p>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
            <div
              className="w-full sm:flex-1 bg-white/70 backdrop-blur-md border border-gray-200 px-4 sm:px-6 py-3 flex items-center justify-between shadow-sm rounded-md"
              style={{ borderWidth: "0.5px" }}
            >
              <span
                className="text-gray-700 font-light truncate "
                style={{ letterSpacing: "0.011em" }}
              >
                {companyDomain || "No domain available"}
              </span>
            </div>

            <div className="flex w-full sm:w-auto gap-3">
              <button
                onClick={onRunAudit}
                disabled={auditLoading || !companyDomain}
                className={cn(
                  "inline-flex w-full sm:w-auto justify-center items-center gap-2 px-6 py-3 text-white rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-60 transition",
                  auditLoading && "cursor-not-allowed"
                )}
                style={{
                  background: "linear-gradient(90deg, #2D4059 0%, #4E76C7 100%)",
                }}
              >
                Run Audit
              </button>
              <PDFDownloadLink
                document={<AuditPDF data={auditResult} domain={companyDomain} />}
                fileName={`audit-${companyDomain}-${new Date().toISOString().split("T")[0]}.pdf`}
                className="w-full sm:w-auto px-4 py-2 rounded-xl border border-gray-200 text-sm font-light bg-white hover:bg-gray-50 flex items-center justify-center"
              >
                {({ loading }) => (loading ? "Preparing..." : "Export PDF")}
              </PDFDownloadLink>
            </div>
          </div>

          {auditLoading && (
            <div className="w-full flex flex-col items-center justify-center mt-56">
              <svg
                className="animate-spin text-blue-600"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 120 120"
                width={120}
                height={120}
              >
                <circle
                  className="opacity-75"
                  cx="60"
                  cy="60"
                  r="50"
                  stroke="currentColor"
                  strokeWidth="20"
                  strokeLinecap="round"
                  fill="none"
                  strokeDasharray="250 320"
                  strokeDashoffset="18"
                />
              </svg>

              <span className="mt-4 mb-24 text-blue-600 font-medium text-lg text-center">
                Running Audit
              </span>
            </div>
          )}

          {(n8nStatus || n8nResults) && (
            <div
              className="mt-6 p-6 bg-white/70 backdrop-blur-md rounded-2xl border border-gray-200 shadow-sm"
              style={{ borderWidth: "0.5px" }}
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
                <h3
                  className="text-lg font-light text-gray-900"
                  style={{ letterSpacing: "-0.003em" }}
                >
                  N8n Processing
                </h3>
                <div
                  className={cn(
                    "px-3 py-1 rounded-full text-xs font-light",
                    n8nStatus === "processing" && "bg-blue-50 text-blue-700",
                    n8nStatus === "completed" && "bg-green-50 text-green-700",
                    n8nStatus === "failed" && "bg-red-50 text-red-700"
                  )}
                >
                  {n8nStatus === "processing" && "Processing..."}
                  {n8nStatus === "completed" && "Completed"}
                  {n8nStatus === "failed" && "Failed"}
                </div>
              </div>

              {n8nStatus === "processing" && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>N8n is generating your reports...</span>
                </div>
              )}

              {n8nResults && (
                <div className="space-y-3">
                  {n8nResults.sheetsUrl && (
                    <a
                      href={n8nResults.sheetsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 p-4 rounded-xl bg-green-50 hover:bg-green-100 transition-colors border border-green-200"
                      style={{ borderWidth: "0.5px" }}
                    >
                      <div>
                        <div className="text-sm font-medium text-green-900">Google Sheets Report</div>
                        <div className="text-xs text-green-600">Click to open</div>
                      </div>
                    </a>
                  )}
                  {n8nResults.slidesUrl && (
                    <a
                      href={n8nResults.slidesUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 p-4 rounded-xl bg-blue-50 hover:bg-blue-100 transition-colors border border-blue-200"
                      style={{ borderWidth: "0.5px" }}
                    >
                      <div>
                        <div className="text-sm font-medium text-blue-900">
                          Google Slides Presentation
                        </div>
                        <div className="text-xs text-blue-600">Click to open</div>
                      </div>
                    </a>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {auditResult && best && worst && (
          <div ref={resultsRef} className="grid grid-cols-1 lg:grid-cols-2 min-[1630px]:grid-cols-3 gap-8 items-start">
            <div
              className="bg-white/70 backdrop-blur-md py-6 px-4 sm:px-6 lg:px-8 rounded-2xl border border-gray-200 shadow-sm h-full flex flex-col overflow-hidden"
              style={{ borderWidth: "0.5px" }}
            >
              <h3
                className="text-2xl font-light text-gray-900 mb-4"
                style={{ letterSpacing: "-0.003em" }}
              >
                Domain Audit
              </h3>
              <div className="w-full flex-1 flex flex-col items-center justify-center gap-6">
                <div className="w-full max-w-[220px] sm:max-w-[250px] flex-shrink-0 flex items-center justify-center">
                  <OverallScoreGauge score={overallScore} size={180} />
                </div>
                <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-6 text-center">
                <div className="min-w-0">
                  <div
                    className="text-xs font-light uppercase tracking-wider text-green-700 mb-1"
                    style={{ letterSpacing: "0.083em" }}
                  >
                    Strongest
                  </div>
                  <div
                    className="text-lg sm:text-xl lg:text-xl font-light text-gray-900 break-words"
                    style={{ letterSpacing: "-0.003em" }}
                  >
                    {best.label}
                  </div>
                  <div
                    className="text-sm font-light text-gray-500 mt-1"
                    style={{ letterSpacing: "0.011em" }}
                  >
                    {best.score}%
                  </div>
                </div>

                <div className="min-w-0">
                  <div
                    className="text-xs font-light uppercase tracking-wider text-orange-700 mb-1"
                    style={{ letterSpacing: "0.083em" }}
                  >
                    Needs Work
                  </div>
                  <div
                    className="text-lg sm:text-xl lg:text-xl font-light text-gray-900 break-words"
                    style={{ letterSpacing: "-0.003em" }}
                  >
                    {worst.label}
                  </div>
                  <div
                    className="text-sm font-light text-gray-500 mt-1"
                    style={{ letterSpacing: "0.011em" }}
                  >
                    {worst.score}%
                  </div>
                </div>
                </div>
              </div>
            </div>

            <div
              className="bg-white/70 backdrop-blur-md rounded-2xl border border-gray-200 p-6 sm:p-8 shadow-sm h-full flex flex-col overflow-hidden"
              style={{ borderWidth: "0.5px" }}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
                <h3
                  className="text-2xl font-light text-gray-900"
                  style={{ letterSpacing: "-0.003em" }}
                >
                  Individual Metric
                </h3>

                <div className="relative w-full sm:w-[180px]">
                  <label htmlFor="metric-select" className="sr-only">
                    Select Metric
                  </label>
                  <select
                    id="metric-select"
                    value={selectedMetric || "Performance"}
                    onChange={(e) => onSelectedMetricChange(e.target.value)}
                    className="appearance-none w-full px-4 py-3 pr-10 rounded-xl border border-gray-200 bg-white text-sm font-light focus:outline-none focus:ring-1 focus:ring-gray-600"
                  >
                    {categories.map(({ label }) => (
                      <option key={label} value={label}>
                        {label}
                      </option>
                    ))}
                  </select>

                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3">
                    <svg
                      className="h-4 w-4 text-gray-400"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.06z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                </div>
              </div>

              {categories
                .filter((category) => category.label === (selectedMetric || "Performance"))
                .map(({ label, value }) => (
                  <div key={label} className="w-full flex-1 flex flex-col items-center justify-center gap-5 sm:gap-6">
                    <div className="w-full max-w-[220px] sm:max-w-[250px] flex-shrink-0">
                      <AuditGaugeChart label={null} score={value} size={180} />
                    </div>
                    {CATEGORY_DESCRIPTIONS[label] && (
                      <div className="w-full text-sm text-gray-500 text-center break-words max-w-prose">
                        {CATEGORY_DESCRIPTIONS[label]}
                      </div>
                    )}
                  </div>
                ))}
            </div>

            {(auditResult?.screenshot || auditResult?.screenshotUrl) && (
              <div
                className="bg-white/70 backdrop-blur-md rounded-2xl border border-gray-200 p-8 shadow-sm overflow-hidden h-full flex flex-col"
                style={{ borderWidth: "0.5px", minHeight: "367px" }}
              >
                <h3
                  className="text-2xl font-light text-gray-900 mb-3 text-left"
                  style={{ letterSpacing: "-0.003em" }}
                >
                  Website Preview
                </h3>
                <div
                  className="rounded-xl overflow-hidden border border-gray-200 flex-1"
                  style={{ borderWidth: "0.5px" }}
                >
                  <img
                    src={auditResult.screenshot || auditResult.screenshotUrl}
                    alt="Website Screenshot"
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
            )}

            <div className="col-span-1 min-[1630px]:col-span-2 bg-white/70">
              <div
                className="bg-white/70 backdrop-blur-md rounded-2xl border border-gray-200 p-8 shadow-sm animate-in fade-in duration-300"
                style={{ borderWidth: "0.5px", minHeight: "520px" }}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center mb-2">
                  <h3
                    className="text-2xl font-light text-gray-900"
                    style={{ letterSpacing: "-0.003em" }}
                  >
                    {activeChartTab === "overview" && "Performance Overview"}
                    {activeChartTab === "comparison" && "Metrics Comparison"}
                    {activeChartTab === "distribution" && "Score Distribution"}
                  </h3>

                  <div className="relative w-full sm:w-[190px]">
                    <select
                      value={activeChartTab}
                      onChange={(e) =>
                        onActiveChartTabChange(
                          e.target.value as "overview" | "comparison" | "distribution"
                        )
                      }
                      className="appearance-none w-full px-4 py-3 pr-10 rounded-xl border border-gray-300 bg-white text-sm font-light text-gray-900 shadow-sm hover:border-gray-400 focus:outline-none focus:border-gray-500 transition-colors duration-150"
                    >
                      <option value="overview">Overview</option>
                      <option value="comparison">Comparison</option>
                      <option value="distribution">Distribution</option>
                    </select>

                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3">
                      <svg
                        className="h-4 w-4 text-gray-400"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.06z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                  </div>
                </div>

                <div className={activeChartTab === "overview" ? "block" : "hidden"}>
                  <AuditRadarChart data={auditResult} />
                </div>
                <div className={`pt-12 ${activeChartTab === "comparison" ? "block" : "hidden"}`}>
                  <AuditBarChart data={auditResult} />
                </div>
                <div className={`pt-2 ${activeChartTab === "distribution" ? "block" : "hidden"}`}>
                  <AuditScoreDistribution data={auditResult} />
                </div>
              </div>
            </div>

            {auditResult.audits && (
              <div
                className="col-span-1 lg:col-span-1 bg-white/70 backdrop-blur-md rounded-2xl border border-gray-200 p-6 sm:p-8 shadow-sm overflow-hidden "
                style={{ borderWidth: "0.5px" }}
              >
                <h3
                  className="text-2xl font-light text-gray-900 mb-6 text-center"
                  style={{ letterSpacing: "-0.003em" }}
                >
                  Advanced Performance Metrics
                </h3>
                <div className="space-y-7">
                  {Object.entries(auditResult.audits).map(([key, value]) => {
                    const fullForms: { [key: string]: string } = {
                      fcp: "First Contentful Paint",
                      lcp: "Largest Contentful Paint",
                      cls: "Cumulative Layout Shift",
                      tbt: "Total Blocking Time",
                      speedIndex: "Speed Index",
                    };

                    return (
                      <div
                        key={key}
                        className="flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-center px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 hover:bg-gray-50 transition-all"
                        style={{ borderWidth: "0.5px" }}
                      >
                        <span
                          className="font-light text-gray-900 flex items-center gap-1"
                          style={{ letterSpacing: "0.011em" }}
                        >
                          {key.toUpperCase()}
                          <span className="text-gray-500">({fullForms[key] || key})</span>
                          {METRIC_DESCRIPTIONS[key] && (
                            <InfoTooltip text={METRIC_DESCRIPTIONS[key]} />
                          )}
                        </span>
                        <span
                          className="font-mono text-sm font-light text-gray-700 bg-white px-3 py-1 rounded-lg border border-gray-200"
                          style={{ borderWidth: "0.5px" }}
                        >
                          {String(value)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
