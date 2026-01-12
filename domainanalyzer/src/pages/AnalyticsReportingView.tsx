import { useState } from "react";
import {
  Calendar,
  FileText,
  Globe,
  Building2,
  Play
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

const AnalyticsReportingSetup = () => {
  const { toast } = useToast();

  const [form, setForm] = useState({
    name: "",
    reportMonth: "",
    proposalTemplateId: "",
    analyticsPropertyId: "",
    sheetsTemplateId: "",
    domain: "",
    orgName: "",
  });

  const handleChange = (key: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = () => {
    const required = Object.entries(form).filter(([, v]) => !v);
    if (required.length) {
      toast({
        title: "Missing information",
        description: "Please complete all fields to continue.",
        variant: "destructive",
      });
      return;
    }

    const payload = { ...form };

    console.log("n8n payload:", payload);

    toast({
      title: "Configuration ready",
      description: "Analytics reporting automation can now be triggered.",
    });
  };

  return (
    <div className="relative min-h-screen w-full">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-gray-100 rounded-full blur-3xl opacity-20" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-gray-100 rounded-full blur-3xl opacity-20" />
      </div>

      {/* Content */}
      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 py-20">
        {/* Hero */}
        <div className="text-center mb-20">
          <div
            className="text-xs font-light uppercase tracking-wider text-gray-500 mb-4"
            style={{ letterSpacing: "0.083em" }}
          >
            Automated Reporting
          </div>

          <h1
            className="text-5xl sm:text-6xl md:text-7xl font-extralight mb-6 text-gray-900"
            style={{ letterSpacing: "-0.003em", lineHeight: 1.05 }}
          >
            Analytics Reporting
          </h1>

          <p
            className="text-lg sm:text-xl font-light text-gray-500 max-w-2xl mx-auto"
            style={{ letterSpacing: "0.011em", lineHeight: 1.4 }}
          >
            Configure monthly analytics reports that automatically pull data,
            populate spreadsheets, and generate presentations.
          </p>
        </div>

        {/* Form Card */}
        <div
          className="bg-white/70 backdrop-blur-md rounded-3xl border border-gray-200 p-10 shadow-sm space-y-8"
          style={{ borderWidth: "0.5px" }}
        >
          <Field
            label="Report Name"
            icon={<FileText className="h-4 w-4" />}
            placeholder="FED OCT 2025"
            value={form.name}
            onChange={(v) => handleChange("name", v)}
          />

          <Field
            label="Report Month"
            icon={<Calendar className="h-4 w-4" />}
            type="date"
            helper="Use the first day of the month (YYYY-MM-01)"
            value={form.reportMonth}
            onChange={(v) => handleChange("reportMonth", v)}
          />

          <Field
            label="Proposal Template ID (Slides)"
            placeholder="1queNsZi99R15QaCalavH8TqqvaeGPp1wC8Tqwn7AkhI"
            value={form.proposalTemplateId}
            onChange={(v) => handleChange("proposalTemplateId", v)}
          />

          <Field
            label="Analytics Property ID (GSC)"
            placeholder="485147447"
            value={form.analyticsPropertyId}
            onChange={(v) => handleChange("analyticsPropertyId", v)}
          />

          <Field
            label="Sheets Template ID"
            placeholder="1qucJJTUMUCHN0k1yQDTBr6HKF7u0HPMC4NkVJy6kIT0"
            value={form.sheetsTemplateId}
            onChange={(v) => handleChange("sheetsTemplateId", v)}
          />

          <Field
            label="Domain"
            icon={<Globe className="h-4 w-4" />}
            placeholder="fedgirls.com"
            value={form.domain}
            onChange={(v) => handleChange("domain", v)}
          />

          <Field
            label="Organization Name"
            icon={<Building2 className="h-4 w-4" />}
            placeholder="Fed Girls"
            value={form.orgName}
            onChange={(v) => handleChange("orgName", v)}
          />

          {/* CTA */}
          <div className="pt-8 flex justify-center">
            <button
              onClick={handleSubmit}
              className={cn(
                "h-12 px-10 rounded-full text-white font-light flex items-center gap-2 transition-all duration-200",
                "bg-black hover:bg-gray-800 active:scale-95"
              )}
              style={{ letterSpacing: "-0.022em" }}
            >
              <Play className="h-4 w-4" />
              Prepare Automation
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsReportingSetup;

/* ------------------------------------ */
/* Field Component */

interface FieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  icon?: React.ReactNode;
  helper?: string;
}

const Field = ({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  icon,
  helper,
}: FieldProps) => (
  <div className="space-y-2">
    <label
      className="text-sm font-light text-gray-700"
      style={{ letterSpacing: "0.011em" }}
    >
      {label}
    </label>

    <div className="relative">
      {icon && (
        <span className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400">
          {icon}
        </span>
      )}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "h-12 w-full rounded-full border border-gray-200 bg-white/80",
          "focus:outline-none focus:ring-2 focus:ring-gray-900",
          "text-sm font-light tracking-tight",
          icon ? "pl-12 pr-6" : "px-6"
        )}
        style={{ borderWidth: "0.5px" }}
      />
    </div>

    {helper && (
      <p className="text-xs font-light text-gray-500">{helper}</p>
    )}
  </div>
);
