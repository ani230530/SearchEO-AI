import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, Loader2, Pencil, Plus, RefreshCw, Sparkles } from "lucide-react";
import { apiGet, apiPatch, apiPost } from "@/services/apiClient";
import { WizardStatusRow } from "./WizardShell";
import type { WizardItem } from "./types";

interface Step4Props {
  domainId: number;
  initialDraft?: { keywordIds?: number[]; promptIds?: number[] } | null;
  onContinue: () => void;
  /**
   * When true, skip the cached-read short-circuit and re-fire the topics
   * generator. The wizard host sets this on Retry so the user can
   * deliberately regenerate prompts. Default false: prefer cached data
   * for fast resumes.
   */
  forceRefresh?: boolean;
}

const HEAVY_RUN_THRESHOLD = 20;
const VISIBLE_PROMPT_LIMIT = 10;
const AUTO_SELECT_LIMIT = 10;
const MAX_VISIBLE_PROMPT_LIMIT = 14;

interface TopicsResponse {
  domainId: number;
  items: WizardItem[];
}

interface PromptCard {
  prompt: WizardItem;
}

export function Step4SelectTopics({ domainId, initialDraft, onContinue, forceRefresh = false }: Step4Props) {
  const [items, setItems] = useState<WizardItem[]>([]);
  const [visiblePromptLimit, setVisiblePromptLimit] = useState(VISIBLE_PROMPT_LIMIT);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const initialPr = useMemo(() => new Set(initialDraft?.promptIds ?? []), [initialDraft]);
  const [selectedPr, setSelectedPr] = useState<Set<number>>(initialPr);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [customText, setCustomText] = useState("");
  const [addingCustom, setAddingCustom] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [savingEditId, setSavingEditId] = useState<number | null>(null);

  const [confirmKind, setConfirmKind] = useState<"heavy" | null>(null);

  const promptCards = useMemo(() => {
    return items
      .filter((it): it is WizardItem & { type: "prompt" } => it.type === "prompt")
      .map((prompt) => ({ prompt }));
  }, [items]);

  const visiblePromptCards = useMemo(
    () => promptCards.slice(0, visiblePromptLimit),
    [promptCards, visiblePromptLimit]
  );

  const generate = async (mode: "fresh" | "append") => {
    if (mode === "fresh") setLoading(true);
    else setLoadingMore(true);
    setError(null);
    try {
      const path =
        mode === "append"
          ? `/wizard/domain/${domainId}/topics?append=true`
          : `/wizard/domain/${domainId}/topics`;
      const res = await apiPost<TopicsResponse>(path);
      setItems(res.items);
      return res.items;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate prompts");
      return null;
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    let alive = true;
    const loadOrGenerate = async () => {
      if (forceRefresh) {
        await generate("fresh");
        return;
      }
      try {
        const data = await apiGet<{ keywords?: unknown[]; prompts?: unknown[] }>(`/wizard/domain/${domainId}`);
        if (!alive) return;
        const storedKeywords = Array.isArray(data?.keywords) ? data.keywords : [];
        const storedPrompts = Array.isArray(data?.prompts) ? data.prompts : [];
        if (storedKeywords.length > 0 || storedPrompts.length > 0) {
          const next: WizardItem[] = [];
          for (const keyword of storedKeywords as Array<{ id: number; term: string; intent: string | null; source: string }>) {
            next.push({
              id: keyword.id,
              type: "keyword",
              text: keyword.term,
              intent: keyword.intent,
              source: (keyword.source as "ai" | "custom") ?? "ai",
            });
          }
          for (const prompt of storedPrompts as Array<{
            id: number;
            text: string;
            intent: string | null;
            source: string;
            keywordId: number | null;
            category?: string | null;
            intentStage?: string | null;
            persona?: string | null;
            useCase?: string | null;
            constraint?: string | null;
            isBranded?: boolean | null;
            competitorMentioned?: string | null;
          }>) {
            next.push({
              id: prompt.id,
              type: "prompt",
              text: prompt.text,
              intent: prompt.intent,
              source: (prompt.source as "ai" | "custom") ?? "ai",
              parentKeywordId: prompt.keywordId ?? undefined,
              category: (prompt.category as PromptCategory | null | undefined) ?? null,
              intentStage: (prompt.intentStage as WizardItem["intentStage"]) ?? null,
              persona: prompt.persona ?? null,
              useCase: prompt.useCase ?? null,
              constraint: prompt.constraint ?? null,
              isBranded: !!prompt.isBranded,
              competitorMentioned: prompt.competitorMentioned ?? null,
            });
          }
          setItems(next);
          setLoading(false);
          return;
        }
      } catch {
        // Fall through to generation.
      }
      if (!alive) return;
      await generate("fresh");
    };
    loadOrGenerate();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domainId]);

  useEffect(() => {
    if (loading) return;
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => {
      apiPatch(`/wizard/domain/${domainId}/draft`, {
        keywordIds: [],
        promptIds: Array.from(selectedPr),
      }).catch(() => {});
    }, 600);
    return () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    };
  }, [domainId, loading, selectedPr]);

  const togglePrompt = (id: number) => {
    setSelectedPr((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const startEdit = (id: number, currentText: string) => {
    setEditingId(id);
    setEditDraft(currentText);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft("");
  };

  const saveEdit = async (id: number) => {
    const next = editDraft.trim();
    if (!next) return;
    setSavingEditId(id);
    try {
      const res = await apiPatch<{ prompt: { id: number; text: string } }>(
        `/wizard/domain/${domainId}/prompts/${id}`,
        { text: next }
      );
      setItems((prev) =>
        prev.map((item) =>
          item.type === "prompt" && item.id === id ? { ...item, text: res.prompt.text } : item
        )
      );
      setEditingId(null);
      setEditDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update prompt");
    } finally {
      setSavingEditId(null);
    }
  };

  const selectAll = () => {
    setSelectedPr(new Set(visiblePromptCards.slice(0, AUTO_SELECT_LIMIT).map((card) => card.prompt.id)));
  };

  const deselectAll = () => setSelectedPr(new Set());

  const handleLoadMore = async () => {
    const nextItems = await generate("append");
    if (!nextItems) return;
    const nextPromptCount = nextItems.filter((item) => item.type === "prompt").length;
    setVisiblePromptLimit((prev) => Math.min(MAX_VISIBLE_PROMPT_LIMIT, Math.min(prev + 4, nextPromptCount)));
  };

  const handleAddCustom = async () => {
    const text = customText.trim();
    if (!text) return;
    setAddingCustom(true);
    setError(null);
    try {
      const res = await apiPost<{ items: WizardItem[]; prompt: { id: number } }>(
        `/wizard/domain/${domainId}/prompts/custom`,
        { text }
      );
      setItems(res.items);
      const nextPromptCount = res.items.filter((item) => item.type === "prompt").length;
      setVisiblePromptLimit((prev) => Math.min(MAX_VISIBLE_PROMPT_LIMIT, Math.min(prev + 1, nextPromptCount)));
      setCustomText("");
      if (res.prompt?.id) {
        setSelectedPr((prev) => new Set(prev).add(res.prompt.id));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add custom prompt");
    } finally {
      setAddingCustom(false);
    }
  };

  const runQueriesNow = async () => {
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

  const handleSubmit = async () => {
    if (selectedPr.size >= HEAVY_RUN_THRESHOLD && confirmKind !== "heavy") {
      setConfirmKind("heavy");
      return;
    }
    await runQueriesNow();
  };

  const totalPrompts = visiblePromptCards.length;
  const allSelected = totalPrompts > 0 && selectedPr.size === totalPrompts;
  const noneSelected = selectedPr.size === 0;
  const canContinue = selectedPr.size > 0 && !submitting && !loading;

  return (
    <div className="mx-auto w-full max-w-[760px]">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-[12px] text-slate-500">
          <span className="font-medium text-slate-700">Prompts only:</span>{" "}
          <button
            type="button"
            onClick={selectAll}
            disabled={loading || totalPrompts === 0}
            className="font-medium text-blue-600 underline decoration-blue-300 underline-offset-2 transition-colors hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
            title="Auto-select the available prompts"
          >
            {AUTO_SELECT_LIMIT} prompts
          </button>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {allSelected ? (
            <button
              type="button"
              onClick={deselectAll}
              disabled={loading || noneSelected}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-[12px] text-slate-500 shadow-sm transition hover:border-slate-300 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Deselect all prompts"
              title="Deselect all"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Deselect all
            </button>
          ) : (
            <button
              type="button"
              onClick={deselectAll}
              disabled={loading || noneSelected}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-slate-300 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Clear selected prompts"
              title="Clear selection"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={allSelected ? deselectAll : selectAll}
            disabled={loading || totalPrompts === 0}
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-700 px-3.5 py-2 text-[12px] font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {allSelected ? "Deselect all" : "Auto-select (10)"}
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {loading && (
          <WizardStatusRow
            message="Sketching the questions a real customer would ask about you..."
            subtle="Pulling together a handful of topics and the natural questions people would actually type."
          />
        )}

        {!loading && visiblePromptCards.length === 0 && (
          <p className="text-[12px] text-slate-500">
            No prompts came back. Use Retry above, or add a custom prompt below.
          </p>
        )}

        {!loading && (
          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
            {visiblePromptCards.map(({ prompt }) => {
              const isOn = selectedPr.has(prompt.id);
              const isEditing = editingId === prompt.id;

              return (
                <div
                  key={`pr-${prompt.id}`}
                  role="button"
                  tabIndex={isEditing ? -1 : 0}
                  onClick={() => {
                    if (isEditing) return;
                    togglePrompt(prompt.id);
                  }}
                  onKeyDown={(event) => {
                    if (isEditing) return;
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      togglePrompt(prompt.id);
                    }
                  }}
                  className={`group/prompt relative w-full cursor-pointer rounded-[10px] border bg-white px-3 py-2.5 text-left shadow-[0_1px_0_rgba(15,23,42,0.02)] transition ${
                    isOn
                      ? "border-blue-500 bg-blue-50/50"
                      : "border-slate-200 hover:border-slate-300 hover:bg-slate-50/70"
                  } ${isEditing ? "cursor-default ring-2 ring-blue-500/20" : ""}`}
                >
                  <div className="flex items-start gap-2.5">
                    <span
                      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border ${
                        isOn
                          ? "border-blue-500 bg-blue-500 text-white"
                          : "border-slate-300 bg-white text-transparent"
                      }`}
                    >
                      <Check className="h-3 w-3" />
                    </span>

                    <div className="min-w-0 flex-1">
                      {isEditing ? (
                        <div className="flex flex-col gap-2" onClick={(event) => event.stopPropagation()}>
                          <textarea
                            autoFocus
                            value={editDraft}
                            onChange={(event) => setEditDraft(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                                event.preventDefault();
                                void saveEdit(prompt.id);
                              }
                              if (event.key === "Escape") {
                                event.preventDefault();
                                cancelEdit();
                              }
                            }}
                            rows={Math.min(4, Math.max(2, Math.ceil(editDraft.length / 80)))}
                            maxLength={800}
                            disabled={savingEditId === prompt.id}
                            className="w-full resize-y rounded-md border border-slate-200 bg-white px-2.5 py-2 text-[12px] leading-snug text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 disabled:opacity-60"
                          />
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                cancelEdit();
                              }}
                              disabled={savingEditId === prompt.id}
                              className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-60"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                void saveEdit(prompt.id);
                              }}
                              disabled={!editDraft.trim() || savingEditId === prompt.id}
                              className="inline-flex items-center gap-1.5 rounded-md bg-[#2D4059] px-2.5 py-1.5 text-[11px] font-medium text-white transition-all hover:bg-[#243349] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {savingEditId === prompt.id ? (
                                <>
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                  Saving...
                                </>
                              ) : (
                                "Save"
                              )}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start gap-2">
                          <p className="flex-1 break-words text-[12px] font-medium italic leading-[150%] text-slate-900 align-middle">
                            {prompt.text}
                          </p>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              startEdit(prompt.id, prompt.text);
                            }}
                            aria-label="Edit prompt"
                            className="shrink-0 rounded-md p-1 text-slate-400 opacity-0 transition-opacity hover:bg-slate-100 hover:text-slate-700 focus:opacity-100 group-hover/prompt:opacity-100"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {!loading && items.length > VISIBLE_PROMPT_LIMIT && (
        <button
          type="button"
          onClick={() => void handleLoadMore()}
          disabled={loadingMore}
          className="mt-4 flex w-full items-center justify-center gap-2 py-2.5 text-[12px] font-medium text-slate-500 transition-colors hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loadingMore ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          {loadingMore ? "Generating more prompts..." : "Load more prompts"}
        </button>
      )}

      {!loading && (
        <div className="mt-3">
          <div className="rounded-[12px] border border-dashed border-slate-300 bg-white px-3 py-2">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={customText}
                onChange={(event) => setCustomText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void handleAddCustom();
                  }
                }}
                placeholder="Add Custom prompt"
                disabled={addingCustom}
                className="min-w-0 flex-1 bg-transparent text-[12px] text-slate-700 placeholder:text-slate-400 focus:outline-none disabled:opacity-60"
              />
              <button
                type="button"
                onClick={handleAddCustom}
                disabled={addingCustom || !customText.trim()}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Add custom prompt"
              >
                {addingCustom ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <p className="mt-1 text-[10px] text-slate-400">
            We&apos;ll slot it under whichever keyword fits best.
          </p>
        </div>
      )}

      {error && <p className="mt-4 text-sm text-rose-600">{error}</p>}

      {confirmKind === "heavy" && (
        <div className="mt-5 rounded-[10px] border border-amber-100 bg-amber-50/50 px-3 py-3 text-[12px] text-slate-700">
          <p className="font-medium text-slate-900">That's a lot of prompts.</p>
          <p className="mt-1 text-slate-600">
            {selectedPr.size} prompts × 3 AI assistants ≈ {selectedPr.size * 3} answers.
            This will take a few minutes and uses more of your AI quota. Sure you want to run all of them?
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={async () => {
                setConfirmKind(null);
                await runQueriesNow();
              }}
              className="rounded-md bg-slate-700 px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-slate-800"
            >
              Yes, run all {selectedPr.size}
            </button>
            <button
              type="button"
              onClick={() => setConfirmKind(null)}
              className="rounded-md px-3 py-1.5 text-[11px] text-slate-500 transition-colors hover:text-slate-700"
            >
              Let me trim it down
            </button>
          </div>
        </div>
      )}

      {!loading && (
        <div className="mt-5 flex flex-col gap-3">
          <button
            onClick={handleSubmit}
            disabled={!canContinue || confirmKind !== null}
            className="flex w-full items-center justify-center gap-2 rounded-[10px] bg-slate-700 px-4 py-3 text-[12px] font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-white/90 disabled:opacity-100"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {submitting ? "Saving your picks..." : "Generate Report"}
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
