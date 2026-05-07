import { useMemo, useState } from "react";
import { Country, State } from "country-state-city";
import { ChevronDown, Loader2 } from "lucide-react";
import { apiPost } from "@/services/apiClient";
import type { WizardProfile } from "./types";

interface ValidateResponse {
  ok: boolean;
  normalizedUrl: string;
  reachable: boolean;
  robotsAllowed: boolean;
  finalUrl?: string;
  dbExistsForUser: boolean;
  existingDomainId?: number;
  reason?: string;
}

interface Step1Props {
  initialUrl?: string;
  initialProfile?: Partial<WizardProfile>;
  onContinue: (args: {
    normalizedUrl: string;
    profile: WizardProfile;
    existingDomainId: number | null;
  }) => void;
}

const industryOptions = [
  "Agriculture",
  "Mining & Quarrying",
  "Manufacturing",
  "Construction",
  "Technology & IT",
  "Healthcare & Pharmaceuticals",
  "Financial Services & Insurance",
  "Energy & Utilities",
  "Transportation & Logistics",
  "Telecommunications",
  "Education & Training",
  "Hospitality & Tourism",
  "Media & Entertainment",
  "Retail & Consumer Goods",
  "Aerospace & Defense",
];

const modelOptions = [
  { id: "GPT-4o", name: "GPT-4o", icon: "/chatgpt.png" },
  { id: "Claude 3", name: "Claude 3", icon: "/claude.png" },
  { id: "Gemini 1.5", name: "Gemini 1.5", icon: "/gemini.png" },
];

export function Step1AddDomain({ initialUrl = "", initialProfile, onContinue }: Step1Props) {
  const [domain, setDomain] = useState(initialUrl);
  const [country, setCountry] = useState(""); // ISO code
  const [state, setState] = useState(""); // ISO code
  const [industry, setIndustry] = useState(initialProfile?.industry ?? "");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [keywordTags, setKeywordTags] = useState<string[]>(
    initialProfile?.customKeywords ? initialProfile.customKeywords.split(",").map((s) => s.trim()).filter(Boolean) : []
  );
  const [promptTags, setPromptTags] = useState<string[]>(
    initialProfile?.customPrompts ? initialProfile.customPrompts.split(",").map((s) => s.trim()).filter(Boolean) : []
  );
  const [customKeywords, setCustomKeywords] = useState("");
  const [customPrompts, setCustomPrompts] = useState("");
  const [selectedModels, setSelectedModels] = useState<string[]>(["GPT-4o", "Claude 3", "Gemini 1.5"]);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const countryOptions = useMemo(
    () => Country.getAllCountries().map((item) => ({ code: item.isoCode, name: item.name })),
    []
  );
  const stateOptions = useMemo(
    () => (country ? State.getStatesOfCountry(country).map((item) => ({ code: item.isoCode, name: item.name })) : []),
    [country]
  );

  const addTags = (
    raw: string,
    existing: string[],
    setter: (next: string[]) => void,
    clearInput: () => void
  ) => {
    const next = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((s) => !existing.includes(s));
    if (next.length === 0) {
      clearInput();
      return;
    }
    setter([...existing, ...next]);
    clearInput();
  };

  const handleKeywordKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTags(customKeywords, keywordTags, setKeywordTags, () => setCustomKeywords(""));
    }
  };
  const handlePromptKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTags(customPrompts, promptTags, setPromptTags, () => setCustomPrompts(""));
    }
  };

  const toggleModel = (id: string) => {
    setSelectedModels((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]));
  };

  const handleContinue = async () => {
    setError(null);
    if (!domain.trim() || !country || !industry) {
      setError("Please fill URL, country, and industry.");
      return;
    }
    setValidating(true);
    try {
      const res = await apiPost<ValidateResponse>("/wizard/validate", { url: domain.trim() });
      if (!res.ok) {
        setError(res.reason ?? "Site cannot be audited.");
        return;
      }
      const countryLabel = countryOptions.find((i) => i.code === country)?.name || country;
      const stateLabel = stateOptions.find((i) => i.code === state)?.name || "";
      onContinue({
        normalizedUrl: res.normalizedUrl,
        profile: {
          country: countryLabel,
          state: stateLabel,
          industry,
          customKeywords: keywordTags.join(", "),
          customPrompts: promptTags.join(", "),
        },
        existingDomainId: res.existingDomainId ?? null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Validation failed");
    } finally {
      setValidating(false);
    }
  };

  return (
    <>
      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Enter URL</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400">
              <img src="/domain-icon.png" alt="" />
            </span>
            <input
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="domain.com"
              disabled={validating}
              className="w-full pl-10 pr-4 py-3 rounded-lg border border-slate-200 bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Country</label>
            <div className="relative">
              <select
                value={country}
                onChange={(e) => {
                  setCountry(e.target.value);
                  setState("");
                }}
                className="w-full px-4 py-3 rounded-lg border border-slate-200 bg-white text-slate-900 appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Select Country</option>
                {countryOptions.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-4 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">State/Region</label>
            <div className="relative">
              <select
                value={state}
                onChange={(e) => setState(e.target.value)}
                disabled={!country}
                className="w-full px-4 py-3 rounded-lg border border-slate-200 bg-white text-slate-900 appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-slate-50 disabled:text-slate-400"
              >
                <option value="">Select State/Region</option>
                {stateOptions.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-4 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Industry</label>
          <div className="relative">
            <select
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-slate-200 bg-white text-slate-900 appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Select Industry</option>
              {industryOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-4 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          </div>
        </div>

        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full flex items-center gap-2 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Advanced Options
            <ChevronDown className={`h-4 w-4 transform transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
          </button>

          {showAdvanced && (
            <div className="border-t border-slate-200 p-4 bg-slate-50 space-y-6">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 mb-3">Add custom keywords</h3>
                <div className="flex flex-wrap gap-2 mb-3">
                  {keywordTags.map((tag) => (
                    <div
                      key={tag}
                      className="flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-sm font-medium"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => setKeywordTags((prev) => prev.filter((t) => t !== tag))}
                        className="text-blue-700 hover:text-blue-900"
                      >
                        x
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customKeywords}
                    onChange={(e) => setCustomKeywords(e.target.value)}
                    onKeyDown={handleKeywordKeyDown}
                    placeholder="Enter keywords separated by commas"
                    className="flex-1 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => addTags(customKeywords, keywordTags, setKeywordTags, () => setCustomKeywords(""))}
                    className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
                  >
                    Add
                  </button>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-900 mb-3">Add custom prompts</h3>
                <div className="flex flex-wrap gap-2 mb-3">
                  {promptTags.map((tag) => (
                    <div
                      key={tag}
                      className="flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-100 text-indigo-700 text-sm font-medium"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => setPromptTags((prev) => prev.filter((t) => t !== tag))}
                        className="text-indigo-700 hover:text-indigo-900"
                      >
                        x
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customPrompts}
                    onChange={(e) => setCustomPrompts(e.target.value)}
                    onKeyDown={handlePromptKeyDown}
                    placeholder="Enter prompts separated by commas"
                    className="flex-1 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => addTags(customPrompts, promptTags, setPromptTags, () => setCustomPrompts(""))}
                    className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
                  >
                    Add
                  </button>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-900 mb-3">Select Model preferences</h3>
                <p className="mb-3 text-xs text-slate-500">
                  The backend currently runs its fixed supported model set.
                </p>
                <div className="grid grid-cols-3 gap-5 justify-items-center">
                  {modelOptions.map((model) => (
                    <button
                      key={model.id}
                      type="button"
                      onClick={() => toggleModel(model.id)}
                      aria-label={model.name}
                      className={`w-16 h-16 flex items-center justify-center rounded-xl border ${
                        selectedModels.includes(model.id) ? "border-blue-500 bg-blue-50" : "border-transparent"
                      }`}
                    >
                      <img src={model.icon} alt={model.name} className="w-10 h-10 object-contain" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="mt-6 flex flex-col gap-3">
        <button
          onClick={handleContinue}
          disabled={validating}
          className="w-full rounded-[10px] bg-slate-400 px-4 py-4 text-sm font-semibold text-white hover:bg-slate-500 transition-colors flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {validating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {validating ? "Preparing domain..." : "Continue"}
          <span>→</span>
        </button>
      </div>
    </>
  );
}
