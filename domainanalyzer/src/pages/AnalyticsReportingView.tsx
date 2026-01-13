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
  CheckCircle2,
  Layers,
  Zap,
  Database,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";




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
            "h-12 w-full rounded-full border border-neutral-200 bg-white/70 backdrop-blur",
            "focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent",
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
    reportMonth: "",
    analyticsPropertyId: "",
    orgName: "",
  });

  const [reportId, setReportId] = useState<string | null>(null);
  const [reportStatus, setReportStatus] = useState<"processing" | "completed" | "failed" | null>(null);
  const [reportResults, setReportResults] = useState<{sheetsUrl?: string; slidesUrl?: string} | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  
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

      // Connect to SSE for real-time updates
      connectSSE(token, data.requestId);
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
          } else if (data.data.status === "failed") {
            toast({
              title: "Report failed",
              description: data.data.error || "Failed to generate report",
              variant: "destructive",
            });
            eventSource.close();
            setIsGenerating(false);
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

  useEffect(() => {
    return () => {
      // Cleanup would go here if we stored eventSource ref
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

      <div className="max-w-7xl mx-auto px-6 py-24 space-y-20">
        {/* Header */}
        <header className="text-center space-y-6">
          <div className="inline-flex items-center gap-2 px-4 py-1 rounded-full bg-black text-white text-xs font-light">
            <Sparkles className="h-3 w-3" />
            Fully Automated Reporting
          </div>

          <h1 className="text-6xl font-extralight tracking-tight">
            Analytics Reporting Engine
          </h1>

          <p className="text-xl font-light text-neutral-500 max-w-3xl mx-auto">
            Generate comprehensive analytics reports automatically from your audit data.
            Select your report parameters below.
          </p>
        </header>

        {/* Context Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto mb-16">
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
        </div>

        {/* Main Action */}
        <section className="max-w-4xl mx-auto bg-white/80 backdrop-blur-xl rounded-[32px] border border-neutral-200 p-12 space-y-8 shadow-xl">
          <div className="space-y-4">
            <h2 className="text-2xl font-light tracking-tight">Report Configuration</h2>
            <p className="text-sm font-light text-neutral-500">
              Customize your report parameters. Other details will be automatically pulled from your company domain audit data.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Field
              label="Organization Name (Optional)"
              helper="Leave blank to use your domain URL"
              icon={<Building2 className="h-4 w-4" />}
              placeholder="e.g. My Company Name"
              value={form.orgName}
              onChange={(v) => handleChange("orgName", v)}
            />

            <Field
              label="Report Month"
              icon={<Calendar className="h-4 w-4" />}
              type="date"
              value={form.reportMonth}
              onChange={(v) => handleChange("reportMonth", v)}
              required
            />

            <div className="md:col-span-2">
              <Field
                label="GSC Property ID (Optional)"
                helper="Leave blank to use your domain URL"
                icon={<BarChart3 className="h-4 w-4" />}
                placeholder="e.g. 485147447"
                value={form.analyticsPropertyId}
                onChange={(v) => handleChange("analyticsPropertyId", v)}
              />
            </div>
          </div>


          {/* CTA */}
          <div className="pt-6 flex justify-center">
            <button
              onClick={handleSubmit}
              disabled={isGenerating}
              className={cn(
                "h-14 px-12 rounded-full text-white font-light flex items-center gap-4 transition-all",
                !isGenerating
                  ? "bg-black hover:bg-neutral-800 active:scale-95"
                  : "bg-neutral-400 cursor-not-allowed"
              )}
            >
              {isGenerating ? (
                <>
                  <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Generate Analytics Report
                  <ChevronRight className="h-4 w-4 opacity-70" />
                </>
              )}
            </button>
          </div>

          {/* Status Display */}
          {reportStatus && (
            <div className="mt-8 p-6 bg-neutral-50 rounded-2xl border border-neutral-200">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-light text-neutral-900">Report Status</h3>
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
                  <span>N8n is generating your reports...</span>
                </div>
              )}

              {reportResults && (
                <div className="space-y-3">
                  {reportResults.sheetsUrl && (
                    <a
                      href={reportResults.sheetsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 p-4 rounded-xl bg-green-50 hover:bg-green-100 transition-colors border border-green-200"
                    >
                      <FileText className="h-5 w-5 text-green-700" />
                      <div>
                        <div className="text-sm font-medium text-green-900">Google Sheets Report</div>
                        <div className="text-xs text-green-600">Click to open</div>
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
                        <div className="text-sm font-medium text-blue-900">Google Slides Presentation</div>
                        <div className="text-xs text-blue-600">Click to open</div>
                      </div>
                    </a>
                  )}
                </div>
              )}
            </div>
          )}
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

