import { useState } from "react";
import { ChevronDown, Globe, Loader2, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiPost } from "@/services/apiClient";
import { cn } from "@/lib/utils";
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
  onContinue: (args: { normalizedUrl: string; profile: WizardProfile; existingDomainId: number | null }) => void;
}

export function Step1AddDomain({ initialUrl = "", onContinue }: Step1Props) {
  const [url, setUrl] = useState(initialUrl);
  const [profile, setProfile] = useState<WizardProfile>({
    country: "",
    state: "",
    industry: "",
    customKeywords: "",
    customPrompts: "",
  });
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canContinue = url.trim().length > 0 && profile.country.trim() && profile.industry.trim() && !validating;

  const handleContinue = async () => {
    setError(null);
    setValidating(true);
    try {
      const res = await apiPost<ValidateResponse>("/wizard/validate", { url: url.trim() });
      if (!res.ok) {
        setError(res.reason ?? "Site cannot be audited.");
        return;
      }
      onContinue({
        normalizedUrl: res.normalizedUrl,
        profile,
        existingDomainId: res.existingDomainId ?? null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Validation failed");
    } finally {
      setValidating(false);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <Label htmlFor="wv2-url" className="text-[16px] font-semibold text-[#414651]">
            Enter Url
          </Label>
          <div className="relative">
            <Globe className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[#717680]" />
            <Input
              id="wv2-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="domain.com"
              className="h-[52px] rounded-lg border-[#d5d7da] pl-10"
              disabled={validating}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-3">
            <Label className="text-[16px] font-semibold text-[#414651]">Country</Label>
            <Input
              value={profile.country}
              onChange={(e) => setProfile({ ...profile, country: e.target.value })}
              placeholder="Select Country"
              className="h-[52px] rounded-lg border-[#d5d7da]"
            />
          </div>
          <div className="flex flex-col gap-3">
            <Label className="text-[16px] font-semibold text-[#414651]">State</Label>
            <Input
              value={profile.state}
              onChange={(e) => setProfile({ ...profile, state: e.target.value })}
              placeholder="Select State"
              className="h-[52px] rounded-lg border-[#d5d7da]"
            />
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <Label className="text-[16px] font-semibold text-[#414651]">Industry</Label>
          <Input
            value={profile.industry}
            onChange={(e) => setProfile({ ...profile, industry: e.target.value })}
            placeholder="Select Industry"
            className="h-[52px] rounded-lg border-[#d5d7da]"
          />
        </div>

        <button
          type="button"
          onClick={() => setAdvancedOpen((v) => !v)}
          className="flex items-center gap-2 self-start text-[16px] font-semibold text-[#717680]"
        >
          Advanced Options
          <ChevronDown className={cn("h-5 w-5 transition", advancedOpen && "rotate-180")} />
        </button>

        {advancedOpen && (
          <div className="flex flex-col gap-4 rounded-lg border border-[#d5d7da] bg-white p-4">
            <div className="flex flex-col gap-2">
              <Label className="text-[14px] font-semibold text-[#414651]">
                Custom Keywords
              </Label>
              <Input
                value={profile.customKeywords}
                onChange={(e) => setProfile({ ...profile, customKeywords: e.target.value })}
                placeholder="seo, ai content optimization"
                className="h-[44px] rounded-lg border-[#d5d7da]"
              />
              <p className="text-[10px] text-[#717680]">
                Comma-separated. Will be included as keyword candidates in step 4.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Label className="text-[14px] font-semibold text-[#414651]">
                Custom Prompts
              </Label>
              <Input
                value={profile.customPrompts}
                onChange={(e) => setProfile({ ...profile, customPrompts: e.target.value })}
                placeholder="Best AI search visibility tool, …"
                className="h-[44px] rounded-lg border-[#d5d7da]"
              />
              <p className="text-[10px] text-[#717680]">
                Comma-separated. Will be added verbatim to the prompt list in step 4.
              </p>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <Button
        type="button"
        onClick={handleContinue}
        disabled={!canContinue}
        className={cn(
          "h-[44px] w-full rounded-lg text-white",
          canContinue
            ? "bg-gradient-to-r from-[#2D4059] to-[#4C74C2] hover:opacity-95"
            : "cursor-not-allowed bg-[#b8bbc0]"
        )}
      >
        {validating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Continue
        {!validating && <ChevronRight className="ml-1 h-4 w-4" />}
      </Button>
    </div>
  );
}
