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

interface KeywordGroup {
  keyword: WizardItem; // type === 'keyword'
  prompts: WizardItem[];
}

export function Step4SelectTopics({ domainId, initialDraft, onContinue }: Step4Props) {
  const [items, setItems] = useState<WizardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const initialPr = useMemo(() => new Set(initialDraft?.promptIds ?? []), [initialDraft]);
  const [selectedPr, setSelectedPr] = useState<Set<number>>(initialPr);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiPost<TopicsResponse>(`/wizard/domain/${domainId}/topics`);
      setItems(res.items);
      // First-load default: select all prompts
      if (initialPr.size === 0) {
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

  // Debounced selection-draft auto-save (prompts only — keywords aren't selectable here)
  useEffect(() => {
    if (loading) return;
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => {
      apiPatch(`/wizard/domain/${domainId}/selection-draft`, {
        keywordIds: [],
        promptIds: Array.from(selectedPr),
      }).catch(() => {
        /* draft save is best-effort */
      });
    }, 600);
    return () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    };
  }, [domainId, selectedPr, loading]);

  const togglePrompt = (id: number) => {
    setSelectedPr((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const autoSelectAll = () => {
    setSelectedPr(new Set(items.filter((i) => i.type === "prompt").map((i) => i.id)));
  };

  // Group prompts under their parent keyword. Custom prompts with no parent
  // get pooled at the bottom under "Custom prompts".
  const { groups, standalonePrompts } = useMemo(() => {
    const keywordsById = new Map<number, WizardItem>();
    items.forEach((it) => {
      if (it.type === "keyword") keywordsById.set(it.id, it);
    });

    const groupMap = new Map<number, KeywordGroup>();
    const standalone: WizardItem[] = [];

    items.forEach((it) => {
      if (it.type !== "prompt") return;
      const parentId = it.parentKeywordId;
      const parent = parentId ? keywordsById.get(parentId) : undefined;
      if (parent) {
        if (!groupMap.has(parent.id)) groupMap.set(parent.id, { keyword: parent, prompts: [] });
        groupMap.get(parent.id)!.prompts.push(it);
      } else {
        standalone.push(it);
      }
    });

    // Preserve order of keywords as they appear in the items list.
    const orderedGroups: KeywordGroup[] = [];
    items.forEach((it) => {
      if (it.type === "keyword" && groupMap.has(it.id)) {
        orderedGroups.push(groupMap.get(it.id)!);
      }
    });

    return { groups: orderedGroups, standalonePrompts: standalone };
  }, [items]);

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      // Only prompts are selected. Keywords list stays empty so isSelected=false on all keywords.
      await apiPost(`/wizard/domain/${domainId}/select`, {
        keywordIds: [],
        promptIds: Array.from(selectedPr),
      });
      onContinue();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save selection");
    } finally {
      setSubmitting(false);
    }
  };

  const totalPrompts = items.filter((i) => i.type === "prompt").length;
  const canContinue = selectedPr.size > 0 && !submitting && !loading;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[12px] text-[#717680]">
          {loading ? "Generating…" : `${selectedPr.size} of ${totalPrompts} prompts selected`}
        </div>
        <div className="flex items-center gap-2">
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
            className="h-9 gap-2 rounded-md bg-[#2D4059] text-white hover:bg-[#24364d]"
          >
            <Sparkles className="h-4 w-4" />
            Auto-select all
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-3 rounded-lg border border-[#d5d7da] bg-white px-4 py-8 text-[#717680]">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Generating prompts and keywords for your niche…</span>
        </div>
      ) : groups.length === 0 && standalonePrompts.length === 0 ? (
        <div className="rounded-lg border border-[#d5d7da] bg-white p-6 text-center text-sm text-[#717680]">
          Nothing here yet — try regenerating.
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map((group) => (
            <section key={`kw-${group.keyword.id}`} className="flex flex-col gap-2">
              <header className="flex items-center justify-between border-b border-[#e2e6ee] pb-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#717680]">
                  Keyword
                </span>
                <span className="text-[14px] font-semibold text-[#2D4059]">
                  {group.keyword.text}
                </span>
              </header>
              {group.prompts.map((prompt) => {
                const isOn = selectedPr.has(prompt.id);
                return (
                  <button
                    key={`pr-${prompt.id}`}
                    type="button"
                    onClick={() => togglePrompt(prompt.id)}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border p-3 text-left transition",
                      isOn
                        ? "border-[#2D4059] bg-[#EEF4FF]/40"
                        : "border-[#d5d7da] bg-white hover:border-[#cbd5e1]"
                    )}
                  >
                    <Checkbox
                      checked={isOn}
                      onCheckedChange={() => togglePrompt(prompt.id)}
                      className="data-[state=checked]:border-[#2D4059] data-[state=checked]:bg-[#2D4059]"
                    />
                    <span className="flex-1 text-[13px] text-[#414651]">{prompt.text}</span>
                    {prompt.source === "custom" && (
                      <span className="rounded-full bg-[#fff7e5] px-2 py-0.5 text-[10px] text-[#d59a00]">
                        Custom
                      </span>
                    )}
                  </button>
                );
              })}
            </section>
          ))}

          {standalonePrompts.length > 0 && (
            <section className="flex flex-col gap-2">
              <header className="flex items-center justify-between border-b border-[#e2e6ee] pb-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#717680]">
                  Custom prompts
                </span>
              </header>
              {standalonePrompts.map((prompt) => {
                const isOn = selectedPr.has(prompt.id);
                return (
                  <button
                    key={`pr-${prompt.id}`}
                    type="button"
                    onClick={() => togglePrompt(prompt.id)}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border p-3 text-left transition",
                      isOn
                        ? "border-[#2D4059] bg-[#EEF4FF]/40"
                        : "border-[#d5d7da] bg-white hover:border-[#cbd5e1]"
                    )}
                  >
                    <Checkbox
                      checked={isOn}
                      onCheckedChange={() => togglePrompt(prompt.id)}
                      className="data-[state=checked]:border-[#2D4059] data-[state=checked]:bg-[#2D4059]"
                    />
                    <span className="flex-1 text-[13px] text-[#414651]">{prompt.text}</span>
                    <span className="rounded-full bg-[#fff7e5] px-2 py-0.5 text-[10px] text-[#d59a00]">
                      Custom
                    </span>
                  </button>
                );
              })}
            </section>
          )}
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
    </div>
  );
}
