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
    name: "",
    reportMonth: "",
    analyticsPropertyId: "",
    domain: "",
    orgName: "",
  });

  const [reportId, setReportId] = useState<string | null>(null);


  const handleChange = (key: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };
  
  const isComplete = Object.values(form).every(Boolean);
  
  const handleSubmit = async () => {
  if (!isComplete) {
    toast({
      title: "Missing information",
      description: "Please complete all fields before generating the report.",
      variant: "destructive",
    });
    return;
  }

  // Add your template IDs here (from environment variables or constants)
  const payload = {
    ...form,
    proposalTemplateId: import.meta.env.VITE_PROPOSAL_TEMPLATE_ID || "your-proposal-template-id",
    sheetsTemplateId: import.meta.env.VITE_SHEETS_TEMPLATE_ID || "your-sheets-template-id",
  };

  try {
    const response = await fetch(
      "https://n8n.srv891599.hstgr.cloud/webhook/96e19249-8f7f-407e-b981-3d4e410cb2d7",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );

    if (!response.ok) {
      throw new Error("Failed to generate report");
    }

    const data = await response.json();
    setReportId(data.reportId);

    toast({
      title: "Automation started",
      description: "Analytics report generation has been triggered.",
    });
  } catch (error) {
    toast({
      title: "Error",
      description: (error as Error).message,
      variant: "destructive",
    });
  }
};


useEffect(() => {
  if (!reportId) return;

  const interval = setInterval(async () => {
    try {
      const res = await fetch(
        `http://localhost:3002/api/analytics-report/${reportId}`
      );
      const statusData = await res.json();

      if (statusData.status === "completed") {
        clearInterval(interval);

        console.log("Sheets:", statusData.googleSheetsUrl);
        console.log("Slides:", statusData.googleSlidesUrl);

        toast({
          title: "Report ready",
          description: "Your analytics report is ready to view.",
        });
      }
    } catch (err) {
      console.error("Polling failed", err);
    }
  }, 5000);

  return () => clearInterval(interval);
}, [reportId]);


  /* ------------------------------------------------------------------------ */

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
            Configure once. Generate insights forever.  
            This workflow pulls data, structures it, and delivers
            executive-ready reports automatically.
          </p>
        </header>

       {/* Context Cards */}
<div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto mb-16">
  <NarrativeCard
    icon={<Zap />}
    title="Zero manual work"
    description="All reports are generated automatically using predefined templates."
  />
  <NarrativeCard
    icon={<Layers />}
    title="Consistent structure"
    description="Standardized spreadsheets and decks every single month."
  />
  <NarrativeCard
    icon={<CheckCircle2 />}
    title="Production ready"
    description="Built for scale, reliability, and automation."
  />
</div>

{/* Main Form */}
<section className="max-w-4xl mx-auto bg-white/80 backdrop-blur-xl rounded-[32px] border border-neutral-200 p-12 space-y-14 shadow-xl">
  <Step
    index={1}
    title="Report Description"
  >
    <Field
      label="Report title"
      icon={<FileText className="h-4 w-4" />}
      placeholder="BOGT OCT 2025"
      value={form.name}
      onChange={(v) => handleChange("name", v)}
      required
    />

    <Field
      label="Report month"
      icon={<Calendar className="h-4 w-4" />}
      type="date"
      value={form.reportMonth}
      onChange={(v) => handleChange("reportMonth", v)}
      required
    />
  </Step>

  <Step
    index={2}
    title="Organization"
    description="Used for branding, naming, and data scoping."
  >
    <Field
      label="Domain"
      icon={<Globe className="h-4 w-4" />}
      placeholder="blueoceanglobaltech.com"
      value={form.domain}
      onChange={(v) => handleChange("domain", v)}
      required
    />

    <Field
      label="Organization name"
      icon={<Building2 className="h-4 w-4" />}
      placeholder="Blue Ocean Global Tech"
      value={form.orgName}
      onChange={(v) => handleChange("orgName", v)}
      required
    />
  </Step>

  <Step
    index={3}
    title="Analytics source"
    description="Where your performance data is fetched from."
  >
    <Field
      label="GSC property ID"
      icon={<BarChart3 className="h-4 w-4" />}
      placeholder="485147447"
      value={form.analyticsPropertyId}
      onChange={(v) =>
        handleChange("analyticsPropertyId", v)
      }
      required
    />
  </Step>

  {/* CTA */}
  <div className="pt-6 flex justify-end">
    <button
      onClick={handleSubmit}
      disabled={!isComplete}
      className={cn(
        "h-14 px-12 rounded-full text-white font-light flex items-center gap-4 transition-all",
        isComplete
          ? "bg-black hover:bg-neutral-800 active:scale-95"
          : "bg-neutral-400 cursor-not-allowed"
      )}
    >
      <Play className="h-4 w-4" />
      Generate analytics report
      <ChevronRight className="h-4 w-4 opacity-70" />
    </button>
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

