/**
 * Step 4 — Pick the prompts to test.
 *
 * Behaviour:
 *  - All prompts default DESELECTED. The user has to opt in to what they
 *    actually want to spend AI calls on.
 *  - Selection draft auto-saves (debounced) so refresh / back-button doesn't
 *    lose progress.
 *  - "Select all / Deselect all" inline links replace the old chunky
 *    "Auto-select" pill — they blend with the canvas.
 *  - "Load more" hits POST /topics?append=true to grow the list without
 *    wiping existing rows.
 *  - "Add custom prompt" types straight into the bottom of the list; the
 *    backend LLM auto-tags it with the most relevant keyword group.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, Plus } from "lucide-react";
import { apiGet, apiPatch, apiPost } from "@/services/apiClient";
import { WizardStatusRow } from "./WizardShell";
import type { PromptCategory, WizardItem } from "./types";
import { CATEGORY_BADGE_CLASS, CATEGORY_LABELS } from "./types";

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

// Threshold above which we ask the user to confirm before kicking off a long
// (and more expensive) AI-query run. Picked so a small audit of 6 prompts
// stays one-click but a sprawling 25+ run is intentional.
const HEAVY_RUN_THRESHOLD = 20;

interface TopicsResponse {
  domainId: number;
  items: WizardItem[];
}

interface KeywordGroup {
  keyword: WizardItem;
  prompts: WizardItem[];
}

export function Step4SelectTopics({ domainId, initialDraft, onContinue, forceRefresh = false }: Step4Props) {
  const [items, setItems] = useState<WizardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Default DESELECTED — the user opts in to whatever they actually want
  // tested. Only restore from a previous draft if one exists.
  const initialPr = useMemo(() => new Set(initialDraft?.promptIds ?? []), [initialDraft]);
  const [selectedPr, setSelectedPr] = useState<Set<number>>(initialPr);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Custom-prompt input
  const [customText, setCustomText] = useState("");
  const [addingCustom, setAddingCustom] = useState(false);

  // Per-keyword "Load more" tracking — keyword id currently fetching more.
  const [expandingKeywordId, setExpandingKeywordId] = useState<number | null>(null);
  const handleLoadMoreForKeyword = async (kwId: number) => {
    setExpandingKeywordId(kwId);
    setError(null);
    try {
      const res = await apiPost<TopicsResponse>(`/wizard/domain/${domainId}/keywords/${kwId}/prompts`);
      setItems(res.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load more prompts");
    } finally {
      setExpandingKeywordId(null);
    }
  };

  // Initial fetch — generate or read existing topics for this domain.
  const generate = async (mode: 'fresh' | 'append') => {
    if (mode === 'fresh') setLoading(true);
    else setLoadingMore(true);
    setError(null);
    try {
      const path = mode === 'append'
        ? `/wizard/domain/${domainId}/topics?append=true`
        : `/wizard/domain/${domainId}/topics`;
      const res = await apiPost<TopicsResponse>(path);
      setItems(res.items);
      // Note: never auto-select on regen. The user's existing selection
      // (a Set<number>) survives because new prompts get new ids.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate prompts");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    let alive = true;
    // Resume-friendly load:
    //   1. If forceRefresh (user hit Retry from the wizard header), skip the
    //      cache and run the generator straight away.
    //   2. Otherwise, GET /wizard/domain/:id first and check whether topics
    //      already exist for this domain. If they do, render them — no
    //      LLM call, instant resume, prior selection draft survives.
    //   3. Only fire the generator when there's literally nothing stored
    //      (first time the user lands on Step 4 for this domain).
    const loadOrGenerate = async () => {
      if (forceRefresh) {
        await generate('fresh');
        return;
      }
      try {
        const data = await apiGet<{ keywords?: unknown[]; prompts?: unknown[] }>(
          `/wizard/domain/${domainId}`
        );
        if (!alive) return;
        const storedKeywords = Array.isArray(data?.keywords) ? data!.keywords : [];
        const storedPrompts = Array.isArray(data?.prompts) ? data!.prompts : [];
        if (storedKeywords.length > 0 || storedPrompts.length > 0) {
          // Adapt the DB shape (Keyword / Prompt rows) into the WizardItem
          // shape this component renders. Mirrors listAllTopicItems on the
          // backend so refresh and regen stay in sync.
          const items: WizardItem[] = [];
          for (const k of storedKeywords as Array<{ id: number; term: string; intent: string | null; source: string }>) {
            items.push({
              id: k.id,
              type: 'keyword',
              text: k.term,
              intent: k.intent,
              source: (k.source as 'ai' | 'custom') ?? 'ai',
            });
          }
          for (const p of storedPrompts as Array<{
            id: number;
            text: string;
            intent: string | null;
            source: string;
            keywordId: number | null;
            // Audit-research metadata persisted on Prompt (see schema.prisma).
            // Carry them all through here so badges + filters render correctly
            // when the user comes back to a cached step instead of regenning.
            category?: string | null;
            intentStage?: string | null;
            persona?: string | null;
            useCase?: string | null;
            constraint?: string | null;
            isBranded?: boolean | null;
            competitorMentioned?: string | null;
          }>) {
            items.push({
              id: p.id,
              type: 'prompt',
              text: p.text,
              intent: p.intent,
              source: (p.source as 'ai' | 'custom') ?? 'ai',
              parentKeywordId: p.keywordId ?? undefined,
              category: (p.category as PromptCategory | null | undefined) ?? null,
              intentStage: (p.intentStage as WizardItem['intentStage']) ?? null,
              persona: p.persona ?? null,
              useCase: p.useCase ?? null,
              constraint: p.constraint ?? null,
              isBranded: !!p.isBranded,
              competitorMentioned: p.competitorMentioned ?? null,
            });
          }
          setItems(items);
          setLoading(false);
          return;
        }
      } catch {
        /* fall through to running the generator */
      }
      if (!alive) return;
      await generate('fresh');
    };
    loadOrGenerate();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domainId]);

  // Debounced auto-save selection draft so refreshing doesn't lose progress.
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
  }, [domainId, selectedPr, loading]);

  const togglePrompt = (id: number) => {
    setSelectedPr((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedPr(new Set(items.filter((i) => i.type === "prompt").map((i) => i.id)));
  };
  const deselectAll = () => setSelectedPr(new Set());

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
      setCustomText("");
      // Auto-select the just-added prompt — that's why the user typed it.
      if (res.prompt?.id) {
        setSelectedPr((prev) => new Set(prev).add(res.prompt.id));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add custom prompt");
    } finally {
      setAddingCustom(false);
    }
  };

  // Inline confirmation state. Two flavours: heavy-run (large prompt count)
  // and missing-competitors (zero competitors selected → no share-of-voice
  // signal in the report). We show a single confirm row above the CTA so
  // the user reads the warning and either presses Continue or adjusts.
  const [confirmKind, setConfirmKind] = useState<'heavy' | 'no-competitors' | null>(null);

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
    // Heavy run check — each prompt fans to 3 models + a scorer pass, so 20
    // prompts ≈ 60 calls. Make sure the user's intentional before firing.
    if (selectedPr.size >= HEAVY_RUN_THRESHOLD && confirmKind !== 'heavy') {
      setConfirmKind('heavy');
      return;
    }
    await runQueriesNow();
  };

  const totalPrompts = items.filter((i) => i.type === "prompt").length;
  const allSelected = totalPrompts > 0 && selectedPr.size === totalPrompts;
  const noneSelected = selectedPr.size === 0;
  const canContinue = selectedPr.size > 0 && !submitting && !loading;

  return (
    <>
      {/* Inline meta row — count + select-all/deselect-all links. No buttons,
          no card, just text controls so the UI feels continuous. */}
      <div className="mb-5 flex items-center justify-between text-[13px] text-slate-500">
        <span>
          {loading ? "Generating…" : `${selectedPr.size} of ${totalPrompts} prompts selected`}
        </span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={selectAll}
            disabled={loading || allSelected || totalPrompts === 0}
            className="text-blue-600 hover:text-blue-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Select all
          </button>
          <span className="text-slate-300">·</span>
          <button
            type="button"
            onClick={deselectAll}
            disabled={loading || noneSelected}
            className="text-slate-600 hover:text-slate-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Deselect all
          </button>
        </div>
      </div>

      <div className="space-y-6">
        {loading && (
          <WizardStatusRow
            message="Sketching the questions a real customer would ask about you…"
            subtle="Pulling together a handful of topics and the natural questions people would actually type. Give us about twenty seconds."
          />
        )}

        {!loading && groups.length === 0 && standalonePrompts.length === 0 && (
          <p className="text-sm text-slate-500">
            No prompts came back. Use Retry above, or add a custom prompt below.
          </p>
        )}

        {!loading &&
          groups.map((group) => (
            <section key={`kw-${group.keyword.id}`} className="space-y-2">
              <header className="flex items-center justify-between border-b border-slate-200 pb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
                    Keyword
                  </span>
                  <span className="text-sm font-semibold text-slate-700">{group.keyword.text}</span>
                  {group.keyword.source === 'custom' ? (
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0 text-[9px] font-semibold uppercase tracking-[0.1em] text-amber-700">
                      Custom
                    </span>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => handleLoadMoreForKeyword(group.keyword.id)}
                  disabled={expandingKeywordId === group.keyword.id}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title={`Generate more prompts for "${group.keyword.text}"`}
                >
                  {expandingKeywordId === group.keyword.id
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : <Plus className="h-3 w-3" />}
                  {expandingKeywordId === group.keyword.id ? 'Loading…' : 'Load more'}
                </button>
              </header>
              {group.prompts.map((prompt) => {
                const isOn = selectedPr.has(prompt.id);
                return (
                  <button
                    key={`pr-${prompt.id}`}
                    type="button"
                    onClick={() => togglePrompt(prompt.id)}
                    className={`group/prompt w-full rounded-[10px] border px-3.5 py-3 text-left transition ${
                      isOn
                        ? "border-blue-500 bg-blue-50/60"
                        : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60"
                    }`}
                  >
                    {/* Vertical card layout — badges sit ABOVE the prompt
                        text, both inside the card. Long prompts wrap freely;
                        nothing ever overflows the form column edge into the
                        right-hand hero image. */}
                    <div className="flex items-start gap-3">
                      <span
                        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                          isOn
                            ? "border-blue-500 bg-blue-500 text-white"
                            : "border-slate-300 bg-white text-transparent"
                        }`}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        {(prompt.category || prompt.source === 'custom') ? (
                          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                            {prompt.category ? (
                              <span
                                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] ${
                                  CATEGORY_BADGE_CLASS[prompt.category as PromptCategory] ??
                                  'border-slate-200 bg-slate-50 text-slate-500'
                                }`}
                                title={CATEGORY_LABELS[prompt.category as PromptCategory] ?? prompt.category}
                              >
                                {CATEGORY_LABELS[prompt.category as PromptCategory] ?? prompt.category}
                              </span>
                            ) : null}
                            {prompt.source === 'custom' ? (
                              <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-amber-700">
                                Custom
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                        <p className="text-[13.5px] leading-snug text-slate-900 break-words">
                          {prompt.text}
                        </p>
                        {prompt.persona || prompt.useCase || prompt.constraint ? (
                          <p className="mt-1.5 text-[11px] text-slate-400 leading-relaxed break-words">
                            {[prompt.persona, prompt.useCase, prompt.constraint]
                              .filter(Boolean)
                              .join(' · ')}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </button>
                );
              })}
            </section>
          ))}

        {!loading && standalonePrompts.length > 0 && (
          <section className="space-y-2">
            <header className="flex items-center justify-between border-b border-slate-200 pb-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
                Other prompts
              </span>
            </header>
            {standalonePrompts.map((prompt) => {
              const isOn = selectedPr.has(prompt.id);
              return (
                <button
                  key={`pr-${prompt.id}`}
                  type="button"
                  onClick={() => togglePrompt(prompt.id)}
                  className={`w-full flex items-center justify-between gap-4 rounded-[8px] border px-4 py-3.5 text-left transition ${
                    isOn
                      ? "border-blue-500 bg-blue-50"
                      : "border-slate-200 bg-white hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-md border ${
                        isOn
                          ? "border-blue-500 bg-blue-500 text-white"
                          : "border-slate-300 bg-white text-transparent"
                      }`}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </span>
                    <p className="text-sm text-slate-900">{prompt.text}</p>
                  </div>
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-amber-700">
                    Custom
                  </span>
                </button>
              );
            })}
          </section>
        )}
      </div>

      {/* Load more — subtle full-width text button blending with canvas. */}
      {!loading && items.length > 0 && (
        <button
          type="button"
          onClick={() => generate('append')}
          disabled={loadingMore}
          className="mt-5 w-full flex items-center justify-center gap-2 py-3 text-[13px] font-medium text-slate-500 hover:text-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loadingMore ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          {loadingMore ? "Generating more prompts…" : "Load more prompts"}
        </button>
      )}

      {/* Add custom prompt — inline input, no card, blends with the rest. */}
      {!loading && (
        <div className="mt-4">
          <label className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500 mb-1.5 block">
            Add your own prompt
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddCustom(); } }}
              placeholder="What's the best AI visibility tool for SaaS startups?"
              disabled={addingCustom}
              className="flex-1 rounded-[8px] border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:opacity-60"
            />
            <button
              type="button"
              onClick={handleAddCustom}
              disabled={addingCustom || !customText.trim()}
              className="rounded-[8px] bg-slate-700 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {addingCustom ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add'}
            </button>
          </div>
          <p className="mt-1.5 text-[11px] text-slate-400">
            We'll slot it under whichever keyword fits best.
          </p>
        </div>
      )}

      {error && (
        <p className="mt-4 text-sm text-rose-600">{error}</p>
      )}

      {/* Heavy-run confirmation. Inline so it doesn't break the canvas; the
          user can read both the warning and the count without leaving the
          page or hitting a modal. */}
      {confirmKind === 'heavy' && (
        <div className="mt-6 rounded-[10px] border border-amber-100 bg-amber-50/50 px-4 py-3.5 text-sm text-slate-700">
          <p className="font-medium text-slate-900">That's a lot of prompts.</p>
          <p className="mt-1 text-slate-600">
            {selectedPr.size} prompts × 3 AI assistants ≈ {selectedPr.size * 3} answers.
            This will take a few minutes and uses more of your AI quota. Sure you want to run all of them?
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={async () => { setConfirmKind(null); await runQueriesNow(); }}
              className="rounded-md bg-slate-700 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition-colors"
            >
              Yes, run all {selectedPr.size}
            </button>
            <button
              type="button"
              onClick={() => setConfirmKind(null)}
              className="rounded-md px-3 py-2 text-xs text-slate-500 hover:text-slate-700 transition-colors"
            >
              Let me trim it down
            </button>
          </div>
        </div>
      )}

      {/* Hide the CTA entirely while we're still drafting the prompts —
          there's nothing to run yet, and a disabled button below the
          loading row just adds noise. */}
      {!loading && (
        <div className="mt-8 flex flex-col gap-3">
          <button
            onClick={handleSubmit}
            disabled={!canContinue || confirmKind !== null}
            className="w-full rounded-[10px] bg-slate-700 px-4 py-4 text-sm font-semibold text-white hover:bg-slate-800 transition-colors flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {submitting ? "Saving your picks…" : "Run AI Analysis"}
            <span>→</span>
          </button>
        </div>
      )}
    </>
  );
}
