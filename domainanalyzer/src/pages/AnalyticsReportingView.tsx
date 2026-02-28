import { useState , useEffect} from "react";
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
  
  const handleChange = (key: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

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
    setReportStatus(null);
    setReportResults(null);

    try {
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
            orgName: form.orgName
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to generate report");
      }

      const data = await response.json();
      setReportId(data.requestId);
      setReportStatus("processing");

      toast({
        title: "Processing",
        description: "Analytics report generation has been triggered. You'll be notified when it's ready.",
      });

      connectSSE(token, data.requestId);
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
    const url = `${import.meta.env.VITE_API_URL || "http://localhost:3002"}/api/sse?token=${encodeURIComponent(token)}`;
    const eventSource = new EventSource(url);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "n8n_update" && data.data?.requestId === requestId) {
          setReportStatus(data.data.status);

          if (data.data.status === "completed") {
            setReportResults({
              sheetsUrl: data.data.googleSheetsUrl,
              slidesUrl: data.data.googleSlidesUrl,
            });
            toast({
              title: "Report ready",
              description: "Your analytics report is ready to view.",
            });
            eventSource.close();
            setIsGenerating(false);
            fetchHistory(); // Refresh history table
          } else if (data.data.status === "failed") {
            toast({
              title: "Report failed",
              description: data.data.error || "Failed to generate report",
              variant: "destructive",
            });
            eventSource.close();
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
    };
  };

  const fetchHistory = async () => {
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
        setReportHistory(data.history || []);
      }
    } catch (error) {
      console.error("Error fetching history:", error);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchHistory();
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
        {/* Header */}
        <header className="text-center space-y-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gray-200 text-black text-xs font-light">
            <Sparkles className="h-3 w-3" />
            Fully Automated Reports
          </div>

          <h1 className="text-6xl font-extralight tracking-tight">
            Analytics Reports
          </h1>

        </header>

        {/* Main Action Trigger */}
        <section className="flex flex-col items-center gap-6 py-10">
          <Drawer open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
            <DrawerTrigger asChild>
              <button
                className={cn(
                  "group relative px-8 py-4 rounded-full",
                  "text-white font-medium text-base",
                  "flex items-center gap-2",
                  "shadow-xl transition-all",
                  "hover:scale-105 active:scale-95",
                  "focus:outline-none focus:ring-4 focus:ring-black/10",
                  gradients.primary
                )}
              >
                <Plus className="h-5 w-5" />
                <span className="whitespace-nowrap">Generate New Report</span>
                <ChevronRight className="h-5 w-5 opacity-50 group-hover:translate-x-1 transition" />
              </button>
            </DrawerTrigger>

            <DrawerContent className="max-w-4xl mx-auto rounded-t-[32px] shadow-2xl">
              <div className="mx-auto w-full max-w-2xl px-6 py-10 space-y-8">
                <DrawerHeader className="px-0">
                  <DrawerTitle className="text-3xl font-light tracking-tight">Report Configuration</DrawerTitle>
                  <DrawerDescription className="text-base font-light text-neutral-500">
                    Customize your report parameters. Other details will be automatically pulled from your audit data.
                  </DrawerDescription>
                </DrawerHeader>

                <div className="bg-white/60 rounded-3xl p-8 border border-neutral-100 space-y-8">
                  {!initialGaId ? (
                    <div className="p-8 text-center space-y-4">
                      <div className="w-16 h-16 rounded-full bg-neutral-100 flex items-center justify-center mx-auto text-neutral-400">
                        <BarChart3 className="h-8 w-8" />
                      </div>
                      <div className="space-y-2">
                        <h4 className="text-xl font-light text-neutral-900">Analytics Connection Required</h4>
                        <p className="text-sm text-neutral-500 font-light max-w-xs mx-auto leading-relaxed">
                          Please go to the <strong>Integration</strong> tab and add your Google Analytics Property ID to enable report generation.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <Field
                        label="Report Name"
                        icon={<FileText className="h-4 w-4" />}
                        placeholder="e.g. October 2025 Review"
                        value={form.name}
                        onChange={(v) => handleChange("name", v)}
                        required
                      />

                      <Field
                        label="Organization Name"
                        icon={<Building2 className="h-4 w-4" />}
                        placeholder="e.g. Blue Ocean Global Tech"
                        value={form.orgName}
                        onChange={(v) => handleChange("orgName", v)}
                        required
                      />

                      <div className="space-y-2">
                        <label className="flex items-center gap-2 text-sm font-light text-neutral-700">
                          Report Month
                          <span className="text-xs text-neutral-400">(required)</span>
                        </label>

                        <Popover>
                          <PopoverTrigger asChild>
                            <button
                              className={cn(
                                "h-12 w-full rounded-full border border-neutral-200",
                                "bg-white/70 px-6 text-left",
                                "flex items-center justify-between",
                                "hover:border-neutral-400 transition",
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

                <DrawerFooter className="px-0 pt-10 flex flex-col sm:flex-row items-center gap-4 justify-end">
                  <button
                    onClick={handleSubmit}
                    disabled={isGenerating || !initialGaId}
                    className={cn(
                      "h-14 w-full rounded-full text-white font-medium text-lg flex items-center justify-center gap-4 transition-all shadow-xl",
                      !isGenerating && initialGaId
                        ? "bg-black hover:bg-black/90 active:scale-[0.98] shadow-black/10"
                        : "bg-neutral-200 text-neutral-400 cursor-not-allowed shadow-none"
                    )}
                  >
                    {isGenerating ? (
                      <div className="flex items-center gap-3">
                        <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Generating...</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <Play className="h-5 w-5" />
                        <span>Start Generation</span>
                      </div>
                    )}
                  </button>
                  <DrawerClose asChild>
                    <button className="h-14  w-full text-sm font-light text-neutral-500 hover:text-black transition-colors border border-neutral-200 rounded-full   ">
                      Cancel
                    </button>
                  </DrawerClose>
                </DrawerFooter>
              </div>
            </DrawerContent>
          </Drawer>

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
        </section>

        {/* History Table */}
        <section className="min-w-6xl mx-auto space-y-8 ">
          <div className="flex items-center justify-between ">
            <div className="space-y-1 ">
              <h2 className="mx-3 text-3xl font-light tracking-tight">Recent Reports</h2>
              <p className="text-sm mx-3 font-light text-neutral-500">
                A history of your generated analytics reports and presentations.
              </p>
            </div>
              
            <button
              onClick={fetchHistory}
              className="p-2 hover:bg-neutral-100 rounded-full transition-colors"
              title="Refresh history"
            >
              <RefreshCw className={cn("h-5 w-5", isLoadingHistory && "animate-spin")} />
            </button>
          </div>

          <div className="bg-white/80 backdrop-blur-xl rounded-xl border border-neutral-200 overflow-hidden hover:shadow-lg ">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-neutral-100 text-sm font-light text-neutral-500 bg-gray-200">
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
  ) : reportHistory.length > 0 ? (
    reportHistory.map((report) => (
      <tr key={report.id} className="group hover:bg-neutral-50/50 transition-colors">
        <td className="px-8 py-5">
          <div className="text-sm font-medium text-neutral-900">
            {report.payload?.name || "Unnamed Report"}
          </div>
        </td>
        <td className="px-8 py-5">
          <div className="text-sm font-light text-neutral-500">
            {report.payload?.['Report Month'] || "N/A"}
          </div>
        </td>
        <td className="px-8 py-5">
          <div
            className={cn(
              "inline-flex px-3 py-1 rounded-full text-[10px] uppercase tracking-wider font-light",
              report.status === "completed" && "bg-green-50 text-green-700 border border-green-400",
              report.status === "processing" && "bg-blue-50 text-blue-700 border border-blue-400",
              report.status === "failed" && "bg-red-50 text-red-700 border border-red-400"
            )}
          >
            {report.status}
          </div>
        </td>
        <td className="px-8 py-5 text-sm font-light text-neutral-400">
          {new Date(report.createdAt).toLocaleDateString()}
        </td>
        <td className="px-8 py-5 text-right">
          <div className="flex items-center justify-end gap-3 transition-opacity">
            {report.results?.googleSheetsUrl && (
              <a
                href={report.results.googleSheetsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-gray-300 text-gray-600 hover:bg-gray-200 text-sm font-light transition shadow-sm hover:shadow-md"
              >
                <img
                  src="https://res.cloudinary.com/dgfzjdi68/image/upload/v1772280291/mdi_google-spreadsheet_hzqebn.svg"
                  alt="Sheets"
                />
                Sheets
              </a>
            )}
            {report.results?.googleSlidesUrl && (
              <a
                href={report.results.googleSlidesUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-gray-300 text-gray-600 hover:bg-gray-200 text-sm font-light transition shadow-sm hover:shadow-md"
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
        </section>
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
