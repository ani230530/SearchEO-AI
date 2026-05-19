import React,{ useState , useEffect, useRef, useCallback} from "react";
import { createPortal } from "react-dom";
import {
  Calendar,
  FileText,
  Globe,
  Building2,
  BarChart3,
  Sparkles,
  Play,
  Presentation,
  CheckCircle2,
  Layers,
  Zap,
  FileSpreadsheet,
  Database,
  ChevronRight,
  Plus,
  X,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarUI } from "@/components/ui/calendar";
import { format } from "date-fns";




/* DESIGN TOKENS */

const gradients = {
  primary:
    "bg-gradient-to-br from-black via-neutral-900 to-neutral-800",
  soft:
    "bg-gradient-to-br from-neutral-50 via-white to-neutral-100",
  accent:
    "bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500",
};
  
/* FORM FIELD CORE */

interface FieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  icon?: React.ReactNode;
  helper?: string;
  required?: boolean;
}

const Field = ({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  icon,
  helper,
  required,
}: FieldProps) => {
  return (
    <div className="group space-y-2">
      <label className="flex items-center gap-2 text-sm font-light text-neutral-700">
        {label}
        {required && (
          <span className="text-xs text-neutral-400">(required)</span>
        )}
      </label>

      <div className="relative">
        {icon && (
          <span className="absolute left-5 top-1/2 -translate-y-1/2 text-neutral-400 group-focus-within:text-black transition">
            {icon}
          </span>
        )}

        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cn(
            "h-12 w-full rounded-full border border-neutral-200 bg-white/70 ",
            "transition-all duration-200",
            icon ? "pl-12 pr-6" : "px-6"
          )}
        />
      </div>

      {helper && (
        <p className="text-xs font-light text-neutral-500">
          {helper}
        </p>
      )}
    </div>
  );
};

/*STEP WRAPPER*/

const Step = ({
  index,
  title,
  description,
  children,
}: {
  index: number;
  title: string;
  description: string;
  children: React.ReactNode;
}) => (
  <div className="relative pl-10 space-y-6">
    <div className="absolute left-0 top-1">
      <div className="h-6 w-6 rounded-full bg-black text-white text-xs flex items-center justify-center">
        {index}
      </div>
    </div>

    <div className="space-y-1">
      <h3 className="text-lg font-light tracking-tight">
        {title}
      </h3>
      <p className="text-sm font-light text-neutral-500">
        {description}
      </p>
    </div>

    <div className="space-y-6">{children}</div>
  </div>
);


/*MAIN VIEW COMPONENT*/

interface AnalyticsReportingProps {
  initialGaId?: string;
  initialOrgName?: string;
}

const AnalyticsReportingSetup = ({ initialGaId = "", initialOrgName = "" }: AnalyticsReportingProps) => {
  const { toast } = useToast();
  
  const [form, setForm] = useState({
    name: "",
    reportMonth: "",
    analyticsPropertyId: initialGaId,
    orgName: initialOrgName,
  });

  const [reportId, setReportId] = useState<string | null>(null);
  const [reportStatus, setReportStatus] = useState<"processing" | "completed" | "failed" | null>(null);
  const [reportResults, setReportResults] = useState<{sheetsUrl?: string; slidesUrl?: string} | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [reportHistory, setReportHistory] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const sseRef = useRef<EventSource | null>(null);
  const pollingRef = useRef<number | null>(null);
  const finalToastShownRef = useRef<{ requestId: string; status: "completed" | "failed" } | null>(null);

  const readReportUrls = (row: any) => {
    const results = row?.results ?? {};
    const payload = row?.payload ?? {};
    const output = row?.output ?? {};
    return {
      sheetsUrl:
        results.googleSheetsUrl ||
        results.sheetsUrl ||
        results.google_sheets_url ||
        output.googleSheetsUrl ||
        output.sheetsUrl ||
        output.google_sheets_url ||
        output["Sheet URL"] ||
        payload.googleSheetsUrl ||
        payload.sheetsUrl ||
        payload.google_sheets_url ||
        payload["Sheet URL"] ||
        row?.googleSheetsUrl ||
        row?.sheetsUrl ||
        row?.google_sheets_url ||
        results["Sheet URL"] ||
        row?.["Sheet URL"],
      slidesUrl:
        results.googleSlidesUrl ||
        results.slidesUrl ||
        results.google_slides_url ||
        output.googleSlidesUrl ||
        output.slidesUrl ||
        output.google_slides_url ||
        output["Presentation URL"] ||
        payload.googleSlidesUrl ||
        payload.slidesUrl ||
        payload.google_slides_url ||
        payload["Presentation URL"] ||
        row?.googleSlidesUrl ||
        row?.slidesUrl ||
        row?.google_slides_url ||
        results["Presentation URL"] ||
        row?.["Presentation URL"],
    };
  };
  const resolveReportStatus = (row: any): "processing" | "completed" | "failed" => {
    const base = row?.status as "processing" | "completed" | "failed" | undefined;
    const urls = readReportUrls(row);
    if (base === "failed") return "failed";
    if (base === "completed") return "completed";
    if (urls.sheetsUrl || urls.slidesUrl) return "completed";
    return "processing";
  };

// Filtered reports
const filteredReports = reportHistory.filter((report) =>
  (report.payload?.name || report.name || "")
    .toLowerCase()
    .includes(searchQuery.toLowerCase())
);

  const handleChange = (key: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const fetchHistory = useCallback(async () => {
    const token = localStorage.getItem("authToken");
    if (!token) return;

    setIsLoadingHistory(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || "http://localhost:3002"}/api/audit/n8n/history`,
        {
          headers: {
            "Authorization": `Bearer ${token}`
          }
        }
      );
      if (response.ok) {
        const data = await response.json();
        const history = data.history || [];
        setReportHistory(history);

        // Keep the live status in sync even when this page didn't trigger the run.
        if (reportId) {
          const row = history.find((item: any) => {
            const candidateId = item.requestId ?? item.id ?? item.payload?.requestId ?? item.payload?.id;
            return String(candidateId) === String(reportId);
          });
          if (row) {
            const nextStatus = resolveReportStatus(row);
            setReportStatus(nextStatus);
            if (nextStatus === "completed") {
              setReportResults(readReportUrls(row));
              setIsGenerating(false);
              if (
                !finalToastShownRef.current ||
                finalToastShownRef.current.requestId !== String(reportId) ||
                finalToastShownRef.current.status !== "completed"
              ) {
                toast({
                  title: "Report ready",
                  description: "Your analytics report is ready to view.",
                });
                finalToastShownRef.current = { requestId: String(reportId), status: "completed" };
              }
            } else if (nextStatus === "failed") {
              setIsGenerating(false);
              if (
                !finalToastShownRef.current ||
                finalToastShownRef.current.requestId !== String(reportId) ||
                finalToastShownRef.current.status !== "failed"
              ) {
                toast({
                  title: "Report failed",
                  description: row?.error || row?.payload?.error || "Failed to generate report",
                  variant: "destructive",
                });
                finalToastShownRef.current = { requestId: String(reportId), status: "failed" };
              }
            }
          }
        }
      }
    } catch (error) {
      console.error("Error fetching history:", error);
    } finally {
      setIsLoadingHistory(false);
    }
  }, [reportId, toast]);

  const stopPolling = () => {
    if (pollingRef.current) {
      window.clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  const startPolling = useCallback((activeRequestId: string) => {
    stopPolling();
    pollingRef.current = window.setInterval(async () => {
      await fetchHistory();
      setReportHistory((prev) => {
        const row = prev.find((item: any) => {
          const candidateId = item.requestId ?? item.id ?? item.payload?.requestId ?? item.payload?.id;
          return String(candidateId) === String(activeRequestId);
        });
        if (!row) return prev;
        if (row.status === "completed" || row.status === "failed") {
          stopPolling();
        }
        return prev;
      });
    }, 3000);
  }, [fetchHistory]);

  const handleSubmit = async () => {
    const token = localStorage.getItem("authToken");
    if (!token) {
      toast({
        title: "Authentication required",
        description: "Please log in to generate reports.",
        variant: "destructive",
      });
      return;
    }

    if (!form.reportMonth) {
      toast({
        title: "Validation Error",
        description: "Please select a report month.",
        variant: "destructive",
      });
      return;
    }

    if (!form.analyticsPropertyId) {
      toast({
        title: "Validation Error",
        description: "Google Analytics ID is required.",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    setReportStatus("processing");
    setReportResults(null);
    setIsModalOpen(false);
    toast({
      title: "Report generation started",
      description: "Generating in background. You can continue using the page.",
    });

    try {
      const configuredApiBase = import.meta.env.VITE_API_URL;
      const runtimeApiBase =
        configuredApiBase && configuredApiBase.trim().length > 0
          ? configuredApiBase
          : window.location.origin;
      const callbackUrl = `${runtimeApiBase.replace(/\/+$/, "")}/api/audit/n8n/callback`;

      const response = await fetch(
        `${import.meta.env.VITE_API_URL || "http://localhost:3002"}/api/audit/n8n/send`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            name: form.name,
            reportMonth: form.reportMonth,
            analyticsProperty: form.analyticsPropertyId,
            orgName: form.orgName,
            // n8n field aliases (kept alongside canonical keys).
            "Report Month": form.reportMonth,
            "analytics property": form.analyticsPropertyId,
            "Org Name": form.orgName,
            callbackUrl,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to generate report");
      }

      const data = await response.json();
      setReportId(data.requestId);
      finalToastShownRef.current = null;

      connectSSE(token, data.requestId);
      startPolling(data.requestId);
      fetchHistory(); // Refresh history table
      setIsDrawerOpen(false); // Close drawer on success
    } catch (error) {
      toast({
        title: "Error",
        description: (error as Error).message,
        variant: "destructive",
      });
      setIsGenerating(false);
    }
  };

  // Connect to SSE for real-time n8n updates
  const connectSSE = (token: string, requestId: string) => {
    if (sseRef.current) {
      sseRef.current.close();
      sseRef.current = null;
    }
    const url = `${import.meta.env.VITE_API_URL || "http://localhost:3002"}/api/sse?token=${encodeURIComponent(token)}`;
    const eventSource = new EventSource(url);
    sseRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const payload = data?.data ?? data;
        const eventRequestId = payload?.requestId ?? payload?.id;
        const isN8nUpdate = data?.type === "n8n_update" || !!payload?.requestId || !!payload?.id;
        if (isN8nUpdate && String(eventRequestId) === String(requestId)) {
          const resolvedFromEvent = resolveReportStatus(payload);
          setReportStatus(resolvedFromEvent);
          // Pull latest persisted state quickly so the table updates sooner.
          fetchHistory();

          if (resolvedFromEvent === "completed") {
            setReportResults(readReportUrls(payload));
            if (
              !finalToastShownRef.current ||
              finalToastShownRef.current.requestId !== String(requestId) ||
              finalToastShownRef.current.status !== "completed"
            ) {
              toast({
                title: "Report ready",
                description: "Your analytics report is ready to view.",
              });
              finalToastShownRef.current = { requestId: String(requestId), status: "completed" };
            }
            eventSource.close();
            sseRef.current = null;
            stopPolling();
            setIsGenerating(false);
            fetchHistory(); // Refresh history table
          } else if (resolvedFromEvent === "failed") {
            if (
              !finalToastShownRef.current ||
              finalToastShownRef.current.requestId !== String(requestId) ||
              finalToastShownRef.current.status !== "failed"
            ) {
              toast({
                title: "Report failed",
                description: payload.error || "Failed to generate report",
                variant: "destructive",
              });
              finalToastShownRef.current = { requestId: String(requestId), status: "failed" };
            }
            eventSource.close();
            sseRef.current = null;
            stopPolling();
            setIsGenerating(false);
            fetchHistory(); // Refresh history table
          }
        }
      } catch (err) {
        console.error("Error parsing SSE:", err);
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
      sseRef.current = null;
      // SSE can be flaky on hosted infra; polling keeps status fresh.
      startPolling(requestId);
    };
  };

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  useEffect(() => {
    return () => {
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
      stopPolling();
    };
  }, []);

  useEffect(() => {
    if (initialGaId) {
      setForm(prev => ({ ...prev, analyticsPropertyId: initialGaId }));
    }
    if (initialOrgName) {
      setForm(prev => ({ ...prev, orgName: initialOrgName }));
    }
  }, [initialGaId, initialOrgName]);

  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-neutral-50" />
        <div className="absolute -top-40 left-1/4 w-[600px] h-[600px] bg-neutral-200 rounded-full blur-3xl opacity-40" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-neutral-300 rounded-full blur-3xl opacity-30" />
      </div>

      <div className="min-w-7xl mx-auto px-6 py-4 space-y-10">
 
          {/* Inline Active Status (if any) */}
          {reportStatus && (
            <div className="w-full max-w-2xl p-6 bg-white/50 backdrop-blur rounded-[24px] border border-neutral-200 animate-in fade-in slide-in-from-bottom-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-light text-neutral-900">Live Status</h3>
                <div className={cn(
                  "px-3 py-1 rounded-full text-xs font-light",
                  reportStatus === "processing" && "bg-blue-50 text-blue-700",
                  reportStatus === "completed" && "bg-green-50 text-green-700",
                  reportStatus === "failed" && "bg-red-50 text-red-700"
                )}>
                  {reportStatus === "processing" && "Processing..."}
                  {reportStatus === "completed" && "Completed"}
                  {reportStatus === "failed" && "Failed"}
                </div>
              </div>

              {reportStatus === "processing" && (
                <div className="flex items-center gap-2 text-sm text-neutral-600">
                  <div className="h-4 w-4 border-2 border-neutral-600 border-t-transparent rounded-full animate-spin" />
                  <span>The n8n engine is currently generating your files. You can follow the progress in the history table below.</span>
                </div>
              )}

              {reportResults && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                  {reportResults.sheetsUrl && (
                    <a
                      href={reportResults.sheetsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 p-4 rounded-xl bg-green-50 hover:bg-green-100 transition-colors border border-green-200"
                    >
                      <FileText className="h-5 w-5 text-green-700" />
                      <div>
                        <div className="text-sm font-medium text-green-900">Open Sheets</div>
                        <div className="text-xs text-green-600">Report Ready</div>
                      </div>
                    </a>
                  )}
                  {reportResults.slidesUrl && (
                    <a
                      href={reportResults.slidesUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 p-4 rounded-xl bg-blue-50 hover:bg-blue-100 transition-colors border border-blue-200"
                    >
                      <FileText className="h-5 w-5 text-blue-700" />
                      <div>
                        <div className="text-sm font-medium text-blue-900">Open Slides</div>
                        <div className="text-xs text-blue-600">Presentation Ready</div>
                      </div>
                    </a>
                  )}
                </div>
              )}
            </div>
          )}

        {/* History Table */}
          <div className="flex items-center justify-between ">
            <div className="space-y-1 ">
              <h2 className="mx-3 text-3xl font-light tracking-tight">Analytics Reports</h2>
              <p className="text-sm mx-3 font-light text-neutral-500">
                A history of your generated analytics reports and presentations.
              </p>
            </div>
            <div className="flex items-center gap-4">
                  {/* Search Bar */}
    <div className="flex-1">
  <input
    type="text"
    placeholder="Search report name"
    value={searchQuery}
    onChange={(e) => setSearchQuery(e.target.value)}
    className="w-full px-4 py-2 border border-neutral-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black transition"
  />
</div>

            <button
  onClick={fetchHistory}
  className="flex items-center gap-2 px-3 py-2 bg-gray-200 hover:bg-gray-300 rounded-xl transition-colors border border-neutral-200"
  title="Refresh history"
>
  <RefreshCw className={cn("h-5 w-5", isLoadingHistory && "animate-spin")} />
  <span className="text-sm font-light">Refresh</span>
</button>
            
  {/* Generate Report Modal Trigger */}
<button
  className={cn(
    "inline-flex items-center gap-2 px-6 py-2.5 text-white rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-60 transition"
  )}
  style={{ background: "linear-gradient(90deg, #2D4059 0%, #4E76C7 100%)" }}
  onClick={() => setIsModalOpen(true)}
>
  <Plus className="h-5 w-5" />
  <span className="whitespace-nowrap">Generate Report</span>
  <ChevronRight className="h-5 w-5 opacity-50 group-hover:translate-x-1 transition" />
</button>

{/* Modal */}
{isModalOpen &&
  createPortal(
    <>
      {/* Full-page backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-40 z-50"
        onClick={() => setIsModalOpen(false)}
      />

      {/* Centered modal */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        aria-modal="true"
        role="dialog"
        tabIndex={-1}
      >
        <div className="bg-white max-w-2xl w-full rounded-xl shadow-lg overflow-auto max-h-[90vh]">
          <div className="px-6 py-6 space-y-6">
           <div className="flex justify-between items-start">
  <div>
    <h2 className="text-xl font-semibold text-gray-900">Generate Report</h2>
    <p className="text-sm text-gray-500 mt-1">
      Customize your report parameters. Other details will be automatically pulled from your audit data.
    </p>
  </div>
  <button
    onClick={() => setIsModalOpen(false)}
    aria-label="Close"
    className="text-gray-400 hover:text-gray-600 ml-4"
  >
    <X size={20} />
  </button>
</div>
<hr />
            {/* Form Section */}
            <div className="rounded-md p-6 space-y-6">
              {!initialGaId ? (
                <div className="p-8 text-center space-y-4">
                  <div className="w-16 h-16 rounded-full bg-neutral-100 flex items-center justify-center mx-auto text-neutral-400">
                    <BarChart3 className="h-8 w-8" />
                  </div>
                  <div className="space-y-2">
                    <h4 className="text-xl font-light text-neutral-900">Analytics Connection Required</h4>
                    <p className="text-sm text-neutral-500 font-light max-w-xs mx-auto leading-relaxed">
                      Please go to the <strong>Integration</strong> tab, connect Google Search Console and Google Analytics access, then add your Google Analytics Property ID to enable report generation.
                    </p>
                  </div>
                </div>
              ) : (
               <div className="space-y-6">
  {/* Report Name */}
  <Field
    label={<span className="font-semibold text-base text-neutral-900">Report Name *</span>}
    icon={<FileText className="h-4 w-4" />}
    placeholder="e.g. October 2025 Review"
    value={form.name}
    onChange={(v) => handleChange("name", v)}
  />

  {/* Organization Name */}
  <Field
    label={<span className="font-semibold text-base text-neutral-900">Organization Name *</span>}
    icon={<Building2 className="h-4 w-4" />}
    placeholder="e.g. Blue Ocean Global Tech"
    value={form.orgName}
    onChange={(v) => handleChange("orgName", v)}
  />

  {/* Report Month */}
  <div className="space-y-2">
    <label className="flex items-center gap-2 text-base font-semibold text-neutral-900">
      Report Month
      <span className="font-semibold text-base text-neutral-900">*</span>
    </label>
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "h-12 w-full rounded-full border border-neutral-200 bg-white/70 px-6 text-left flex items-center justify-between hover:border-neutral-400 transition",
            !form.reportMonth && "text-neutral-400"
          )}
        >
          <span className="text-sm font-light">
            {form.reportMonth
              ? format(new Date(form.reportMonth), "MMMM yyyy")
              : "Select report month"}
          </span>
          <Calendar className="h-4 w-4 text-neutral-400" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <CalendarUI
          mode="single"
          selected={
            form.reportMonth
              ? (() => {
                  const [y, m, d] = form.reportMonth.split("-").map(Number);
                  return new Date(y, m - 1, d);
                })()
              : undefined
          }
          onSelect={(date) => {
            if (!date) return;
            const localDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
            handleChange("reportMonth", localDate.toLocaleDateString("en-CA"));
          }}
          initialFocus
          captionLayout="dropdown"
          fromYear={2000}
          toYear={new Date().getFullYear() + 1}
          showOutsideDays
          fixedWeeks
          className="rounded-3xl border-none shadow-2xl"
        />
      </PopoverContent>
    </Popover>
  </div>
</div>
              )}
            </div>
<hr />
            {/* Footer Buttons */}
           <div className="flex flex-col sm:flex-row items-center gap-4 justify-start px-0">
  <button
    onClick={handleSubmit}
    disabled={isGenerating || !initialGaId}
    className={cn(
      "h-10 rounded-md text-white font-semibold text-sm flex items-center justify-center gap-3 transition-colors",
      !isGenerating && initialGaId
        ? "bg-blue-900 hover:bg-blue-800"
        : "bg-gray-300 text-gray-500 cursor-not-allowed"
    )}
  >
    {isGenerating ? (
      <div className="flex items-center gap-3 p-4">
        <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        <span>Generating...</span>
      </div>
    ) : (
      <div className="flex items-center p-4">
        <span>Generate</span>
      </div>
    )}
  </button>
</div>
          </div>
        </div>
      </div>
    </>,
    document.body
  )
}
          </div>
</div>
          <div className="bg-white/80 backdrop-blur-xl rounded-xl border border-neutral-200 overflow-hidden hover:shadow-lg ">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-neutral-100 text-sm font-light text-gray-900 bg-[#E9EAEB]">
                    <th className="px-8 py-5 font-light">Report Name</th>
                    <th className="px-8 py-5 font-light">Month</th>
                    <th className="px-8 py-5 font-light">Status</th>
                    <th className="px-8 py-5 font-light">Date Generated</th>
                    <th className="px-8 py-5 font-light text-right">Actions</th>
                  </tr>
                </thead>
               <tbody className="divide-y divide-neutral-50">
  {isLoadingHistory ? (
    <tr>
      <td colSpan={6} className="px-8 py-16 text-center">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-gray-400" />
          <p className="text-sm font-light text-gray-600">Loading Reports...</p>
        </div>
      </td>
    </tr>
  ) : filteredReports.length > 0 ? (
    filteredReports.map((report) => (
      <tr key={report.id} className="group hover:bg-neutral-50/50 transition-colors">
        <td className="px-8 py-5">
          <div className="text-sm font-medium text-neutral-600">
            {report.payload?.name || report.name || "Unnamed Report"}
          </div>
        </td>
        <td className="px-8 py-5">
          <div className="text-sm font-light text-neutral-500">
            {report.payload?.['Report Month'] || report.payload?.reportMonth || report.reportMonth || "N/A"}
          </div>
        </td>
        <td className="px-8 py-5">
          <div
            className={cn(
              "inline-flex px-3 py-1 rounded-full text-[10px] uppercase tracking-wider font-light",
              resolveReportStatus(report) === "completed" && "bg-green-50 text-green-700 border border-green-400",
              resolveReportStatus(report) === "processing" && "bg-blue-50 text-blue-700 border border-blue-400",
              resolveReportStatus(report) === "failed" && "bg-red-50 text-red-700 border border-red-400"
            )}
          >
            {resolveReportStatus(report)}
          </div>
        </td>
        <td className="px-8 py-5 text-sm font-light text-neutral-400">
          {new Date(report.createdAt).toLocaleDateString()}
        </td>
        <td className="px-8 py-3 text-right">
          <div className="flex items-center justify-end gap-3 transition-opacity">
            {readReportUrls(report).sheetsUrl && (
              <a
                href={readReportUrls(report).sheetsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-100 text-gray-600 bg-[#F9F9F9] text-sm font-light transition shadow-sm hover:shadow-md"
              >
                <img
                  src="https://res.cloudinary.com/dgfzjdi68/image/upload/v1772280291/mdi_google-spreadsheet_hzqebn.svg"
                  alt="Sheets"
                />
                Sheets
              </a>
            )}
            {readReportUrls(report).slidesUrl && (
              <a
                href={readReportUrls(report).slidesUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-100 text-gray-600 bg-[#F9F9F9] text-sm font-light transition shadow-sm hover:shadow-md"
              >
                <img
                  src="https://res.cloudinary.com/dgfzjdi68/image/upload/v1772280290/icon-park-outline_slide_mkpvc4.svg"
                  alt="Slides"
                />
                Slides
              </a>
            )}
          </div>
        </td>
      </tr>
    ))
  ) : (
    <tr>
      <td colSpan={6} className="px-8 py-16 text-center">
        <div className="flex flex-col items-center gap-3 text-neutral-400">
          <Database className="h-10 w-10 opacity-20" />
          <p className="text-sm font-light">No reports generated yet.</p>
        </div>
      </td>
    </tr>
  )}
</tbody>
              </table>
            </div>
          </div>
      </div>
    </div>
  );
};

export default AnalyticsReportingSetup;

/* SUPPORTING UI */

const NarrativeCard = ({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) => (
  <div className="bg-white/70 border border-neutral-200 rounded-2xl p-6 backdrop-blur">
    <div className="flex items-center gap-3 mb-3">
      <div className="h-9 w-9 rounded-full bg-black text-white flex items-center justify-center">
        {icon}
      </div>
      <h4 className="font-light text-neutral-900">
        {title}
      </h4>
    </div>
    <p className="text-sm font-light text-neutral-500">
      {description}
    </p>
  </div>
);
