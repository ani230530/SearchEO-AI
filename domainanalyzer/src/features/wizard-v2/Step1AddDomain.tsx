import { useMemo, useState } from "react";
import { Country, State } from "country-state-city";
import { ChevronDown, Loader2 } from "lucide-react";
import { apiPost } from "@/services/apiClient";
import { classifyError } from "./wizardErrors";
import { maskDomainId } from "@/lib/domainUtils";
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
  /**
   * Called when the user confirms they want to view an existing report
   * instead of running a fresh audit on a domain they've already analysed.
   * Receives the masked id (the URL slug for /ai-results/:id).
   */
  onExistingDomain?: (maskedId: string) => void;
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

export function Step1AddDomain({ initialUrl = "", initialProfile, onContinue, onExistingDomain }: Step1Props) {
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
  // When /validate says we already have a record for this URL, surface a
  // small inline prompt instead of silently advancing or errorring out.
  const [existingChoice, setExistingChoice] = useState<{
    domainId: number;
    url: string;
  } | null>(null);

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

  // Strict per-field validation so the user knows exactly what's missing.
  const validateForm = (): string | null => {
    if (!domain.trim()) return "Add the URL of the site you want audited.";
    if (!country) return "Pick the country your business is based in.";
    if (!industry) return "Pick the industry that best describes your business.";
    return null;
  };

  const buildProfile = (): WizardProfile => {
    const countryLabel = countryOptions.find((i) => i.code === country)?.name || country;
    const stateLabel = stateOptions.find((i) => i.code === state)?.name || "";
    return {
      country: countryLabel,
      state: stateLabel,
      industry,
      customKeywords: keywordTags.join(", "),
      customPrompts: promptTags.join(", "),
    };
  };

  const handleContinue = async () => {
    setError(null);
    setExistingChoice(null);
    const formError = validateForm();
    if (formError) {
      setError(formError);
      return;
    }
    setValidating(true);
    try {
      const res = await apiPost<ValidateResponse>("/wizard/validate", { url: domain.trim() });
      if (!res.ok) {
        setError(res.reason ?? "We couldn't reach that site. Double-check the URL and try again.");
        return;
      }
      // User has audited this domain before. Don't silently advance — let
      // them choose between viewing the prior report and starting fresh.
      if (res.dbExistsForUser && typeof res.existingDomainId === "number") {
        setExistingChoice({ domainId: res.existingDomainId, url: res.normalizedUrl });
        return;
      }
      onContinue({
        normalizedUrl: res.normalizedUrl,
        profile: buildProfile(),
        existingDomainId: null,
      });
    } catch (err) {
      const e = classifyError(err);
      if (e.kind === "unauthorized") return; // apiClient redirects to /auth
      setError(e.message);
    } finally {
      setValidating(false);
    }
  };

  // User chose "Run a fresh audit" on the existing-domain prompt.
  //
  // Hard reset on the backend first — wipes competitors, keywords, prompts,
  // runs, and the wizard's phase ledger. Without this, leftover state from
  // the previous audit (Step 4 prompts that already exist, Step 5 runs that
  // already completed) would let the wizard skip ahead instead of walking
  // the user through every step again.
  //
  // Historical AiRuns are intentionally also wiped here: the user explicitly
  // asked for a fresh audit, so the dashboard should reflect just the new
  // run when it lands. If we ever want "keep history" semantics, the backend
  // restart endpoint already supports a soft mode (see /restart 'topics').
  const [restarting, setRestarting] = useState(false);
  const handleFreshAudit = async () => {
    if (!existingChoice || restarting) return;
    setRestarting(true);
    setError(null);
    try {
      await apiPost(`/wizard/domain/${existingChoice.domainId}/restart`, { from: "crawl" });
      onContinue({
        normalizedUrl: existingChoice.url,
        profile: buildProfile(),
        existingDomainId: existingChoice.domainId,
      });
    } catch (err) {
      const e = classifyError(err);
      if (e.kind === "unauthorized") return;
      setError(e.message);
    } finally {
      setRestarting(false);
    }
  };

  // User chose "View existing report".
  const handleViewExisting = () => {
    if (!existingChoice || !onExistingDomain) return;
    onExistingDomain(maskDomainId(existingChoice.domainId));
  };

  return (
    <>
      <div className="space-y-5">
        <div>
          <label className="block text-[13px] font-semibold text-slate-700 mb-1.5">Enter URL</label>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
              <img src="/domain-icon.png" alt="" className="h-4 w-4 opacity-60" />
            </span>
            <input
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="domain.com"
              disabled={validating}
              className="w-full pl-10 pr-4 h-11 rounded-[10px] border border-slate-200/80 bg-white/70 text-[14px] text-slate-900 placeholder:text-slate-400 transition-all focus:outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100 focus:bg-white"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[13px] font-semibold text-slate-700 mb-1.5">Country</label>
            <div className="relative">
              <select
                value={country}
                onChange={(e) => {
                  setCountry(e.target.value);
                  setState("");
                }}
                className="w-full px-3.5 h-11 rounded-[10px] border border-slate-200/80 bg-white/70 text-[14px] text-slate-900 appearance-none transition-all focus:outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100 focus:bg-white"
              >
                <option value="">Select Country</option>
                {countryOptions.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            </div>
          </div>

          <div>
            <label className="block text-[13px] font-semibold text-slate-700 mb-1.5">State</label>
            <div className="relative">
              <select
                value={state}
                onChange={(e) => setState(e.target.value)}
                disabled={!country}
                className="w-full px-3.5 h-11 rounded-[10px] border border-slate-200/80 bg-white/70 text-[14px] text-slate-900 appearance-none transition-all focus:outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100 focus:bg-white disabled:bg-slate-50/50 disabled:text-slate-400"
              >
                <option value="">Select State</option>
                {stateOptions.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            </div>
          </div>
        </div>

        <div>
          <label className="block text-[13px] font-semibold text-slate-700 mb-1.5">Industry</label>
          <div className="relative">
            <select
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              className="w-full px-3.5 h-11 rounded-[10px] border border-slate-200/80 bg-white/70 text-[14px] text-slate-900 appearance-none transition-all focus:outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100 focus:bg-white"
            >
              <option value="">Select Industry</option>
              {industryOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          </div>
        </div>

        {/* Advanced — text trigger that blends with the canvas (no card),
            content panel slides open below without a hard border. */}
        <div>
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="inline-flex items-center gap-1 text-[13px] font-medium text-slate-500 hover:text-slate-700 transition-colors"
          >
            Advanced Options
            <ChevronDown className={`h-3.5 w-3.5 transform transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
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
                <h3 className="text-sm font-semibold text-slate-900 mb-3">AI assistants we'll test</h3>
                <p className="mb-3 text-xs text-slate-500">
                  We'll ask each one of these the prompts you pick.
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
        <div className="mt-6 rounded-lg border border-rose-100 bg-rose-50/60 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {/* Existing-domain branch — surfaced inline instead of as a modal so
          the user can read both options without losing context. */}
      {existingChoice && !error && (
        <div className="mt-6 rounded-[10px] border border-blue-100 bg-blue-50/40 px-4 py-4 text-sm text-slate-700">
          <p className="font-medium text-slate-900">You've already audited {existingChoice.url}.</p>
          <p className="mt-1 text-slate-600">
            Want to look at the report you already have, or run a fresh audit and update it?
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {onExistingDomain ? (
              <button
                type="button"
                onClick={handleViewExisting}
                className="rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 transition-colors"
              >
                View existing report
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleFreshAudit}
              disabled={restarting}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {restarting ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              {restarting ? "Resetting…" : "Run a fresh audit"}
            </button>
            <button
              type="button"
              onClick={() => setExistingChoice(null)}
              className="rounded-md px-3 py-2 text-xs text-slate-500 hover:text-slate-700 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="mt-6 flex flex-col gap-3">
        <button
          onClick={handleContinue}
          disabled={validating || !!existingChoice}
          className="w-full rounded-[10px] bg-slate-700 px-4 py-4 text-sm font-semibold text-white hover:bg-slate-800 transition-colors flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {validating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {validating ? "Checking the URL…" : "Continue"}
          <span>→</span>
        </button>
      </div>
    </>
  );
}
