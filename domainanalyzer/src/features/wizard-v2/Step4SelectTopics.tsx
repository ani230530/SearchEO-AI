import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { apiPatch, apiPost } from "@/services/apiClient";
import { cn } from "@/lib/utils";
import type { WizardItem } from "./types";

interface Step4Props {
  domainId: number;
  initialDraft?: { keywordIds?: number[]; promptIds?: number[] } | null;
  onContinue: () => void;
}

interface TopicsResponse {
  domainId: number;
  items: WizardItem[];
}

type Tab = "all" | "prompts" | "keywords";

export function Step4SelectTopics({ domainId, initialDraft, onContinue }: Step4Props) {
  const [items, setItems] = useState<WizardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [tab, setTab] = useState<Tab>("all");

  const initialKw = useMemo(() => new Set(initialDraft?.keywordIds ?? []), [initialDraft]);
  const initialPr = useMemo(() => new Set(initialDraft?.promptIds ?? []), [initialDraft]);
  const [selectedKw, setSelectedKw] = useState<Set<number>>(initialKw);
  const [selectedPr, setSelectedPr] = useState<Set<number>>(initialPr);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiPost<TopicsResponse>(`/wizard/domain/${domainId}/topics`);
      setItems(res.items);
      // First-load defaults: select everything if no draft existed
      if (initialKw.size === 0 && initialPr.size === 0) {
        setSelectedKw(new Set(res.items.filter((i) => i.type === "keyword").map((i) => i.id)));
        setSelectedPr(new Set(res.items.filter((i) => i.type === "prompt").map((i) => i.id)));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate topics");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domainId]);

  // Debounced selection-draft auto-save
  useEffect(() => {
    if (loading) return;
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => {
      apiPatch(`/wizard/domain/${domainId}/selection-draft`, {
        keywordIds: Array.from(selectedKw),
        promptIds: Array.from(selectedPr),
      }).catch(() => {
        /* draft save is best-effort */
      });
    }, 600);
    return () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    };
  }, [domainId, selectedKw, selectedPr, loading]);

  const toggle = (item: WizardItem) => {
    if (item.type === "keyword") {
      setSelectedKw((prev) => {
        const next = new Set(prev);
        next.has(item.id) ? next.delete(item.id) : next.add(item.id);
        return next;
      });
    } else {
      setSelectedPr((prev) => {
        const next = new Set(prev);
        next.has(item.id) ? next.delete(item.id) : next.add(item.id);
        return next;
      });
    }
  };

  const autoSelectAll = () => {
    setSelectedKw(new Set(items.filter((i) => i.type === "keyword").map((i) => i.id)));
    setSelectedPr(new Set(items.filter((i) => i.type === "prompt").map((i) => i.id)));
  };

  const visible = useMemo(() => {
    if (tab === "prompts") return items.filter((i) => i.type === "prompt");
    if (tab === "keywords") return items.filter((i) => i.type === "keyword");
    return items;
  }, [items, tab]);

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await apiPost(`/wizard/domain/${domainId}/select`, {
        keywordIds: Array.from(selectedKw),
        promptIds: Array.from(selectedPr),
      });
      onContinue();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save selection");
    } finally {
      setSubmitting(false);
    }
  };

  const totalSelected = selectedKw.size + selectedPr.size;
  const canContinue = totalSelected > 0 && !submitting && !loading;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-full bg-[#EEF4FF] p-1 text-[12px] font-medium">
          {(["all", "prompts", "keywords"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                "rounded-full px-3 py-1 capitalize transition",
                tab === t ? "bg-white text-[#2D4059] shadow-sm" : "text-[#717680]"
              )}
            >
              {t}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={generate}
          disabled={loading}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[#d5d7da] bg-white text-[#717680] hover:bg-[#f9f9f9]"
          aria-label="Regenerate"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </button>
        <Button
          type="button"
          onClick={autoSelectAll}
          disabled={loading}
          className="ml-auto h-9 gap-2 rounded-md bg-[#2D4059] text-white hover:bg-[#24364d]"
        >
          <Sparkles className="h-4 w-4" />
          Auto-select (all)
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-3 rounded-lg border border-[#d5d7da] bg-white px-4 py-8 text-[#717680]">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Generating prompts and keywords for your niche…</span>
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-lg border border-[#d5d7da] bg-white p-6 text-center text-sm text-[#717680]">
          Nothing here yet — try regenerating.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {visible.map((item) => {
            const isOn =
              item.type === "keyword" ? selectedKw.has(item.id) : selectedPr.has(item.id);
            return (
              <button
                key={`${item.type}-${item.id}`}
                type="button"
                onClick={() => toggle(item)}
                className={cn(
                  "flex items-center justify-between gap-3 rounded-lg border p-3 text-left transition",
                  isOn
                    ? "border-[#2D4059] bg-[#EEF4FF]/40"
                    : "border-[#d5d7da] bg-white hover:border-[#cbd5e1]"
                )}
              >
                <div className="flex items-center gap-3">
                  <Checkbox
                    checked={isOn}
                    onCheckedChange={() => toggle(item)}
                    className="data-[state=checked]:border-[#2D4059] data-[state=checked]:bg-[#2D4059]"
                  />
                  <span
                    className={cn(
                      "text-[13px] text-[#414651]",
                      item.type === "prompt" && "italic"
                    )}
                  >
                    {item.text}
                  </span>
                  {item.source === "custom" && (
                    <span className="rounded-full bg-[#fff7e5] px-2 py-0.5 text-[10px] text-[#d59a00]">
                      Custom
                    </span>
                  )}
                </div>
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[10px]",
                    item.type === "prompt"
                      ? "border-[#7e9bd7] text-[#2D4059]"
                      : "border-emerald-300 text-emerald-700"
                  )}
                >
                  {item.type === "prompt" ? "Prompt" : "Keyword"}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <Button
        type="button"
        onClick={handleSubmit}
        disabled={!canContinue}
        className={cn(
          "h-[44px] w-full rounded-lg text-white",
          canContinue
            ? "bg-gradient-to-r from-[#2D4059] to-[#4C74C2] hover:opacity-95"
            : "cursor-not-allowed bg-[#b8bbc0]"
        )}
      >
        {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Generate Report
        {!submitting && <ChevronRight className="ml-1 h-4 w-4" />}
      </Button>
      <p className="text-center text-[12px] text-[#717680]">
        {totalSelected} selected · {selectedKw.size} keywords + {selectedPr.size} prompts
      </p>
    </div>
  );
}
