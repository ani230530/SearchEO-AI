import { useEffect, useState } from "react";
import { ArrowUpRight, Check, Loader2, Plus } from "lucide-react";

import { apiGet, apiPost } from "@/services/apiClient";
import { logoUrl as logoUrlHelper } from "@/lib/logoUrl";
import { WizardStatusRow } from "./WizardShell";
import type { WizardCompetitor } from "./types";

interface Step3Props {
  domainId: number;
  initialSelected?: string[];
  onContinue: () => void;
  /**
   * When true, skip the cached-read short circuit and re-fire the pipeline.
   * Wizard host sets this to true on Retry so the user can deliberately
   * regenerate the competitor list. Default false: prefer cached data
   * for the fast resume path.
   */
  forceRefresh?: boolean;
}

interface CompetitorsResponse {
  domainId: number;
  competitors: WizardCompetitor[];
}

interface CompetitorRow extends WizardCompetitor {
  selected: boolean;
}

export function Step3Competitors({ domainId, initialSelected = [], onContinue, forceRefresh = false }: Step3Props) {
  const [competitors, setCompetitors] = useState<CompetitorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newCompetitor, setNewCompetitor] = useState("");
  const [submitting, setSubmitting] = useState(false);

  /**
   * Map a backend competitor row (from /wizard/domain/:id) into the
   * WizardCompetitor shape the UI renders.
   */
  const adaptStoredCompetitor = (
    c: { competitorHost: string; reasoning?: string | null; threatLevel?: string | null; isSelected?: boolean }
  ): CompetitorRow => {
    const host = c.competitorHost;
    return {
      name: host,
      domain: host,
      url: `https://${host}`,
      logoUrl: logoUrlHelper(host, 64) ?? "",
      reasoning: c.reasoning ?? undefined,
      threatLevel: (c.threatLevel as WizardCompetitor["threatLevel"]) ?? undefined,
      selected: !!c.isSelected,
    };
  };

  /**
   * Run the competitor pipeline (LLM proposes → verify → score → rank).
   * Used on first arrival when there's nothing stored, and when the user
   * hits Retry from the wizard chrome.
   */
  const runPipeline = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiPost<CompetitorsResponse>(`/wizard/domain/${domainId}/competitors`);
      const initialSet = new Set(initialSelected);
      const seedSelectAll = initialSet.size === 0;
      setCompetitors(
        res.competitors.map((c) => ({
          ...c,
          selected: seedSelectAll ? true : initialSet.has(c.url),
        }))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load competitors");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let alive = true;
    // Resume-friendly load:
    //   1. Try to read whatever's already saved for this domain. If we find
    //      ranked competitors there, render them immediately — no LLM call,
    //      no waiting screen, picks up the user's prior selections.
    //   2. Only run the full pipeline when there's literally nothing stored
    //      (first time the user lands on Step 3 for this domain).
    //   3. The "Retry" button in the wizard header bypasses this path by
    //      remounting the component — see AICheckerV2's retry nonce.
    const loadOrRun = async () => {
      // Retry path — caller asked for a fresh pipeline run, skip the cache.
      if (forceRefresh) {
        await runPipeline();
        return;
      }
      try {
        const data = await apiGet<{ competitors?: any[] }>(`/wizard/domain/${domainId}`);
        if (!alive) return;
        const stored = Array.isArray(data?.competitors) ? data!.competitors : [];
        const ranked = stored.filter((c: any) => typeof c?.rank === "number");
        if (ranked.length > 0) {
          setCompetitors(ranked.map(adaptStoredCompetitor));
          setLoading(false);
          return;
        }
      } catch {
        /* fall through to running the pipeline */
      }
      if (!alive) return;
      await runPipeline();
    };
    loadOrRun();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domainId]);

  const toggle = (url: string) => {
    setCompetitors((prev) =>
      prev.map((c) => (c.url === url ? { ...c, selected: !c.selected } : c))
    );
  };

  const selectedCount = competitors.filter((c) => c.selected).length;
  const allSelected = competitors.length > 0 && selectedCount === competitors.length;

  const toggleSelectAll = () => {
    setCompetitors((prev) => prev.map((c) => ({ ...c, selected: !allSelected })));
  };

  const handleAddCompetitor = () => {
    const trimmed = newCompetitor.trim();
    if (!trimmed) return;
    const url = trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
    const host = trimmed.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
    setCompetitors((prev) => {
      if (prev.some((c) => c.url === url)) {
        return prev.map((c) => (c.url === url ? { ...c, selected: true } : c));
      }
      return [
        ...prev,
        {
          name: host,
          domain: host,
          url,
          logoUrl: logoUrlHelper(host, 64) ?? "",
          selected: true,
        },
      ];
    });
    setNewCompetitor("");
  };

  const handleContinue = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await apiPost(`/wizard/domain/${domainId}/competitors/select`, {
        urls: competitors.filter((c) => c.selected).map((c) => c.url),
      });
      onContinue();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save selection");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="space-y-6">
        <div>
          <div className="space-y-3">
            {loading && (
              <WizardStatusRow
                message="Looking around for the brands you go up against…"
                subtle="Thinking about who'd show up alongside you when someone asks an AI for options like yours. Takes about half a minute."
              />
            )}
            {!loading && competitors.length === 0 && (
              <p className="text-sm text-slate-500">
                We couldn't surface any competitors automatically. Add a domain manually below to continue.
              </p>
            )}
            {!loading && competitors.length > 0 && (
              <div className="flex items-center justify-between px-1 pb-1">
                <span className="text-xs text-slate-500">
                  {selectedCount} of {competitors.length} selected
                </span>
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline"
                >
                  {allSelected ? "Deselect all" : "Select all"}
                </button>
              </div>
            )}
            {!loading &&
              competitors.map((competitor) => (
                <button
                  key={competitor.url}
                  type="button"
                  onClick={() => toggle(competitor.url)}
                  className={`w-full flex items-center justify-between gap-4 rounded-3xl border px-4 py-4 text-left transition ${
                    competitor.selected
                      ? "border-blue-500 bg-blue-50"
                      : "border-slate-200 bg-white hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border ${
                        competitor.selected
                          ? "border-blue-500 bg-blue-500 text-white"
                          : "border-slate-300 bg-white text-transparent"
                      }`}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </span>
                    <span className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-md bg-slate-50">
                      <img
                        src={competitor.logoUrl}
                        alt=""
                        loading="lazy"
                        className="h-6 w-6 object-contain"
                        onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
                      />
                    </span>
                    <p className="font-semibold text-slate-900 truncate">{competitor.name}</p>
                  </div>
                  {/* Tiny "open in new tab" affordance — icon only, sits on
                      the right edge of the row. stopPropagation so clicking
                      the icon doesn't toggle the row's selection. */}
                  <a
                    href={competitor.url}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Visit ${competitor.name}`}
                    onClick={(e) => e.stopPropagation()}
                    className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:text-blue-600 hover:bg-white/70 transition-colors"
                    title={competitor.url}
                  >
                    <ArrowUpRight className="h-4 w-4" />
                  </a>
                </button>
              ))}
          </div>

          {/* Manual add row — only show once the pipeline has finished
              looking for competitors. Showing this while we're still
              searching just confuses the user. */}
          {!loading && (
            <div className="mt-5 rounded-[10px] border border-dashed border-slate-300 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <input
                  type="text"
                  value={newCompetitor}
                  onChange={(e) => setNewCompetitor(e.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleAddCompetitor();
                    }
                  }}
                  placeholder="Add a competitor"
                  className="flex-1 bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleAddCompetitor}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200"
                >
                  <Plus className="h-5 w-5" />
                </button>
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

      {/* Continue is meaningless while we're still discovering — there's
          nothing to save yet. Hide it entirely instead of disabling so the
          UI stays calm while the loading row is on screen. */}
      {!loading && (
        <div className="mt-6 flex flex-col gap-3">
          <button
            onClick={handleContinue}
            disabled={submitting}
            className="w-full rounded-[10px] bg-slate-700 px-4 py-3.5 text-sm font-semibold text-white hover:bg-slate-800 transition-colors flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {submitting ? "Saving your picks…" : "Continue"}
            <span>→</span>
          </button>
        </div>
      )}
    </>
  );
}
