import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, RefreshCcw, Sparkles } from "lucide-react";
import { apiPatch, apiPost } from "@/services/apiClient";
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
  keyword: WizardItem;
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

  // Debounced auto-save selection draft
  useEffect(() => {
    if (loading) return;
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => {
      apiPatch(`/wizard/domain/${domainId}/selection-draft`, {
        keywordIds: [],
        promptIds: Array.from(selectedPr),
      }).catch(() => {});
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

  const { groups, standalonePrompts } = useMemo(() => {
    const keywordsById = new Map<number, WizardItem>();
    items.forEach((it) => {
      if (it.type === "keyword") keywordsById.set(it.id, it);
    });

    const groupMap = new Map<number, KeywordGroup>();
    const standalone: WizardItem[] = [];

    items.forEach((it) => {
      if (it.type !== "prompt") return;
      const parent = it.parentKeywordId ? keywordsById.get(it.parentKeywordId) : undefined;
      if (parent) {
        if (!groupMap.has(parent.id)) groupMap.set(parent.id, { keyword: parent, prompts: [] });
        groupMap.get(parent.id)!.prompts.push(it);
      } else {
        standalone.push(it);
      }
    });

    const ordered: KeywordGroup[] = [];
    items.forEach((it) => {
      if (it.type === "keyword" && groupMap.has(it.id)) ordered.push(groupMap.get(it.id)!);
    });
    return { groups: ordered, standalonePrompts: standalone };
  }, [items]);

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
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
    <>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={generate}
          disabled={loading}
          className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
        <button
          type="button"
          onClick={autoSelectAll}
          disabled={loading || items.length === 0}
          className="inline-flex items-center gap-2 rounded-[12px] px-5 py-3 text-sm font-semibold text-white shadow-md transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          style={{ background: "linear-gradient(90deg, rgb(45, 64, 89) 0%, rgb(78, 118, 199) 100%)" }}
        >
          <Sparkles className="h-4 w-4" /> Auto-select (all)
        </button>
        <span className="ml-auto text-xs text-slate-500">
          {loading ? "Generating…" : `${selectedPr.size} of ${totalPrompts} prompts selected`}
        </span>
      </div>

      <div className="space-y-6">
        {loading && (
          <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-4 text-slate-700">
              <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
              <p className="text-sm font-medium">Generating keywords and prompts for your niche…</p>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-blue-600 transition-all w-1/2 animate-pulse" />
            </div>
            <p className="mt-3 text-xs text-slate-500">
              One LLM call produces both keywords and their child prompts — usually ~20 seconds.
            </p>
          </div>
        )}

        {!loading && groups.length === 0 && standalonePrompts.length === 0 && (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-600">
            No backend prompts or keywords are available yet. Use refresh to generate prompts or
            add custom inputs in Advanced Options.
          </div>
        )}

        {!loading &&
          groups.map((group) => (
            <section key={`kw-${group.keyword.id}`} className="space-y-2">
              <header className="flex items-center justify-between border-b border-slate-200 pb-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
                  Keyword
                </span>
                <span className="text-sm font-semibold text-slate-700">{group.keyword.text}</span>
              </header>
              {group.prompts.map((prompt) => {
                const isOn = selectedPr.has(prompt.id);
                return (
                  <button
                    key={`pr-${prompt.id}`}
                    type="button"
                    onClick={() => togglePrompt(prompt.id)}
                    className={`w-full flex items-center justify-between gap-4 rounded-[8px] border px-4 py-4 text-left transition ${
                      isOn
                        ? "border-blue-500 bg-blue-50"
                        : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <span
                        className={`flex h-5 w-5 items-center justify-center rounded-lg border ${
                          isOn
                            ? "border-blue-500 bg-blue-500 text-white"
                            : "border-slate-300 bg-white text-transparent"
                        }`}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </span>
                      <p className="text-sm text-slate-900">{prompt.text}</p>
                    </div>
                    <span className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
                      Prompt
                    </span>
                  </button>
                );
              })}
            </section>
          ))}

        {!loading && standalonePrompts.length > 0 && (
          <section className="space-y-2">
            <header className="flex items-center justify-between border-b border-slate-200 pb-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
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
                  className={`w-full flex items-center justify-between gap-4 rounded-[8px] border px-4 py-4 text-left transition ${
                    isOn
                      ? "border-blue-500 bg-blue-50"
                      : "border-slate-200 bg-white hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-lg border ${
                        isOn
                          ? "border-blue-500 bg-blue-500 text-white"
                          : "border-slate-300 bg-white text-transparent"
                      }`}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </span>
                    <p className="text-sm text-slate-900">{prompt.text}</p>
                  </div>
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.1em] text-amber-700">
                    Custom
                  </span>
                </button>
              );
            })}
          </section>
        )}
      </div>

      {error && (
        <div className="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="mt-6 flex flex-col gap-3">
        <button
          onClick={handleSubmit}
          disabled={!canContinue}
          className="w-full rounded-[10px] bg-slate-400 px-4 py-4 text-sm font-semibold text-white hover:bg-slate-500 transition-colors flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {submitting ? "Generating report..." : "Generate report"}
          <span>→</span>
        </button>
        <p className="text-center text-xs text-slate-500">{selectedPr.size} prompts selected</p>
      </div>
    </>
  );
}
