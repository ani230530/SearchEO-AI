/* eslint-disable react/jsx-no-undef */
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

const AnalyticsReportingSetup = () => {
  const { toast } = useToast();
  
  const [form, setForm] = useState({
    name: "",
    reportMonth: "",
    analyticsPropertyId: "",
    orgName: "",
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
    return () => {
    };
  }, []);

  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-neutral-50" />
        <div className="absolute -top-40 left-1/4 w-[600px] h-[600px] bg-neutral-200 rounded-full blur-3xl opacity-40" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-neutral-300 rounded-full blur-3xl opacity-30" />
      </div>

      <div className="max-w-7xl mx-auto px-6 py-4 space-y-10">
        {/* Header */}
        <header className="text-center space-y-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gray-200 text-black text-xs font-light">
            <Sparkles className="h-3 w-3" />
            Fully Automated Reports
          </div>

          <h1 className="text-6xl font-extralight tracking-tight">
            Analytics Reports
          </h1>

          <p className="text-xl font-light text-neutral-500 max-w-3xl mx-auto">
            Generate complete monthly analytics reports with trends and comparisons. <br />
            Quickly review key metrics and track performance across all channels.
          </p>
        </header>
 {/* Main Action Trigger */}
        <section className="flex flex-col items-center gap-6 py6">
          <Drawer open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
           <DrawerTrigger asChild>
  <button
    className={cn(
      "group relative h-5 px-4 py-6 rounded-full",
      "text-white font-light text-sm",
      "flex items-center gap-1",
      "shadow-2xl transition-all",
      "hover:scale-105 active:scale-95",
      "focus:outline-none focus:ring-4 focus:ring-black/20",
      gradients.primary
    )}
  >
    

    <div className="h-7 w-7 rounded-full  flex items-center justify-center group-hover:bg-white/10 transition">
      <Plus className="h-6 w-6" />
    </div>

    <span className="whitespace-nowrap">
      Generate Report
    </span>

    <ChevronRight className="h-6 w-6 opacity-50 group-hover:translate-x-1 transition" />
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

                <div className="bg-white/60  rounded-2xl p-6 border border-neutral-200">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Field
                    label="Report Name"
                    icon={<FileText className="h-4 w-4" />}
                    placeholder="e.g. BOGT OCT 2025"
                    value={form.name}
                    onChange={(v) => handleChange("name", v)}
                    required
                  />

                  <Field
                    label="Organization Name"
                    helper="Leave blank to use your domain"
                    icon={<Building2 className="h-4 w-4" />}
                    placeholder="e.g. Blue Ocean Global Tech"
                    value={form.orgName}
                    onChange={(v) => handleChange("orgName", v)}
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
        <span>
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

  const localDate = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );

  handleChange(
    "reportMonth",
    localDate.toLocaleDateString("en-CA")
  );
}}

  initialFocus
  captionLayout="dropdown"
  fromYear={2000}
  toYear={new Date().getFullYear() + 1}
  showOutsideDays
  fixedWeeks
  classNames={{
    /* Header */
    caption: "flex flex-col gap-2 px-3 pt-3",
    caption_label: "hidden",
    caption_dropdowns:
      "flex justify-center gap-3 border-b pb-3",

    /* Dropdowns */
    dropdown_month:
      "w-[130px] rounded-md border border-neutral-200 px-2 py-1 text-sm",
    dropdown_year:
      "w-[90px] rounded-md border border-neutral-200 px-2 py-1 text-sm",

    /* Grid */
    months: "px-3 pb-3",
    table: "w-full border-collapse",

    head_row: "flex justify-between",
    head_cell:
      "w-9 text-xs font-medium text-neutral-500 text-center",

    row: "flex justify-between mt-1",

    cell:
      "relative w-9 h-9 text-center",

    /* Day buttons */
    day:
      "h-9 w-9 rounded-full flex items-center justify-center text-sm transition",
    day_today:
      "border border-neutral-300 font-medium",
    day_selected:
      "bg-black text-white hover:bg-black focus:bg-black",
    day_outside:
      "text-neutral-300 opacity-50",
    day_disabled:
      "text-neutral-300 opacity-30",
  }}
/>


    </PopoverContent>
  </Popover>

  <p className="text-xs font-light text-neutral-500">
    Used to calculate month-over-month analytics performance
  </p>
</div>


                  <Field
                    label="GSC Property ID (Optional)"
                    // helper="Leave blank to use your domain"
                    icon={<BarChart3 className="h-4 w-4" />}
                    placeholder="e.g. 485147447"
                    value={form.analyticsPropertyId}
                    onChange={(v) => handleChange("analyticsPropertyId", v)}
                  />
                </div>

                <DrawerFooter className="px-0 pt-10">
                  <button
                    onClick={handleSubmit}
                    disabled={isGenerating}
                    className={cn(
                      "h-16 w-full rounded-full text-white font-light text-lg flex items-center justify-center gap-4 transition-all",
                      !isGenerating
                        ? "bg-black hover:bg-neutral-800 active:scale-[0.98]"
                        : "bg-neutral-400 cursor-not-allowed"
                    )}
                  >
                    {isGenerating ? (
                      <>
                        <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Generating Your Report...
                      </>
                    ) : (
                      <>
                        <Play className="h-5 w-5" />
                        Start Generation Process
                      </>
                    )}
                  </button>
                  <DrawerClose asChild>
                    <button className="h-12 w-full text-sm font-light text-neutral-500 hover:text-black transition-colors">
                      Cancel and Return
                    </button>
                  </DrawerClose>
                </DrawerFooter>
                </div>
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
        {/* Context Cards */}
        {/* <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto mb-16">
          <NarrativeCard
            icon={<Zap />}
            title="Zero manual work"
            description="Reports are generated automatically from your latest audit data."
          />
          <NarrativeCard
            icon={<Database />}
            title="Uses your audit data"
            description="Pulls performance metrics from your company domain audit results."
          />
          <NarrativeCard
            icon={<CheckCircle2 />}
            title="Real-time updates"
            description="Get notified instantly when your report is ready via live updates."
          />
        </div> */}

     

        {/* History Table */}
        <section className="max-w-6xl mx-auto space-y-8 ">
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

          <div className="bg-white/80 backdrop-blur-xl rounded-[32px] border border-neutral-200 overflow-hidden hover:shadow-lg ">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-neutral-100 text-sm font-light text-neutral-500 bg-neutral-50/50">
                    <th className="px-8 py-5 font-light">Report Name</th>
                    <th className="px-8 py-5 font-light">Month</th>
                    <th className="px-8 py-5 font-light">Status</th>
                    <th className="px-8 py-5 font-light">Date Generated</th>
                    <th className="px-8 py-5 font-light text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-50">
                  {reportHistory.length > 0 ? (
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
                          <div className={cn(
                            "inline-flex px-3 py-1 rounded-full text-[10px] uppercase tracking-wider font-light",
                            report.status === "completed" && "bg-green-50 text-green-700 border border-green-100",
                            report.status === "processing" && "bg-blue-50 text-blue-700 border border-blue-100",
                            report.status === "failed" && "bg-red-50 text-red-700 border border-red-100"
                          )}>
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
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-600 hover:bg-green-700 text-white text-xs font-light transition shadow-sm hover:shadow-md"
                              >
                                <FileSpreadsheet className="h-3 w-3" />
                                Sheets
                              </a>
                            )}
                            {report.results?.googleSlidesUrl && (
                              <a
                                href={report.results.googleSlidesUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-light transition shadow-sm hover:shadow-md"
                              >
                                <Presentation className="h-3 w-3" />
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

