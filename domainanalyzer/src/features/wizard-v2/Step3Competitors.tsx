import { useEffect, useState } from "react";
import { ChevronRight, Globe2, Loader2, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { apiPost } from "@/services/apiClient";
import { cn } from "@/lib/utils";
import type { WizardCompetitor } from "./types";

interface Step3Props {
  domainId: number;
  initialSelected?: string[];
  onContinue: () => void;
}

interface CompetitorsResponse {
  domainId: number;
  competitors: WizardCompetitor[];
}

export function Step3Competitors({ domainId, initialSelected = [], onContinue }: Step3Props) {
  const [competitors, setCompetitors] = useState<WizardCompetitor[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelected));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [customInput, setCustomInput] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadCompetitors = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiPost<CompetitorsResponse>(`/wizard/domain/${domainId}/competitors`);
      setCompetitors(res.competitors);
      // Default-select all on first load
      if (selected.size === 0) {
        setSelected(new Set(res.competitors.map((c) => c.url)));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load competitors");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCompetitors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domainId]);

  const toggle = (url: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  };

  const addCustom = () => {
    const trimmed = customInput.trim();
    if (!trimmed) return;
    const url = trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
    const host = trimmed.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
    if (competitors.some((c) => c.url === url)) {
      setSelected((prev) => new Set(prev).add(url));
    } else {
      const fresh: WizardCompetitor = {
        name: host,
        domain: host,
        url,
        logoUrl: `https://img.logo.dev/${host}?token=pk_DTdFFG1JT9WOCjATvZEzIA&size=64`,
      };
      setCompetitors((prev) => [...prev, fresh]);
      setSelected((prev) => new Set(prev).add(url));
    }
    setCustomInput("");
  };

  const handleContinue = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await apiPost(`/wizard/domain/${domainId}/competitors/select`, {
        urls: Array.from(selected),
      });
      onContinue();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save selection");
    } finally {
      setSubmitting(false);
    }
  };

  const canContinue = selected.size > 0 && !submitting && !loading;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={loadCompetitors}
          disabled={loading}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[#d5d7da] bg-white text-[#717680] hover:bg-[#f9f9f9]"
          aria-label="Regenerate competitors"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-3 rounded-lg border border-[#d5d7da] bg-white px-4 py-6 text-[#717680]">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Finding peer competitors…</span>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {competitors.map((c) => {
            const isOn = selected.has(c.url);
            return (
              <button
                key={c.url}
                type="button"
                onClick={() => toggle(c.url)}
                className={cn(
                  "flex items-center gap-3 rounded-lg border p-4 text-left transition",
                  isOn
                    ? "border-[#2D4059] bg-[#EEF4FF]/40"
                    : "border-[#d5d7da] bg-white hover:border-[#cbd5e1]"
                )}
              >
                <Checkbox checked={isOn} onCheckedChange={() => toggle(c.url)} className="data-[state=checked]:border-[#2D4059] data-[state=checked]:bg-[#2D4059]" />
                <span className="grid h-6 w-6 flex-shrink-0 place-items-center overflow-hidden rounded-md bg-gray-50">
                  <img
                    src={c.logoUrl}
                    alt=""
                    className="h-5 w-5 object-contain"
                    onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
                  />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[18px] font-medium text-[#414651]">{c.name}</p>
                  {c.reasoning ? (
                    <p className="truncate text-[11px] text-[#717680]">{c.reasoning}</p>
                  ) : null}
                </div>
                <p className="hidden text-[14px] text-[#4ca6ff] sm:block">{c.url}</p>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Globe2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#717680]" />
          <Input
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addCustom()}
            placeholder="Add Competitor"
            className="h-[44px] rounded-lg border-dashed border-[#717680] bg-[#f9f9f9] pl-10"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={addCustom}
          disabled={!customInput.trim()}
          className="h-[44px] rounded-lg"
        >
          <Plus className="h-4 w-4" />
        </Button>
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
        {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Continue
        {!submitting && <ChevronRight className="ml-1 h-4 w-4" />}
      </Button>
      <p className="text-center text-[12px] text-[#717680]">{selected.size} selected</p>
    </div>
  );
}
