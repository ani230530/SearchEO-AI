import { useEffect, useState } from "react";
import { Check, Loader2, Plus } from "lucide-react";

import { apiPost } from "@/services/apiClient";
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

interface CompetitorRow extends WizardCompetitor {
  selected: boolean;
}

export function Step3Competitors({ domainId, initialSelected = [], onContinue }: Step3Props) {
  const [competitors, setCompetitors] = useState<CompetitorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newCompetitor, setNewCompetitor] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadCompetitors = async () => {
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
    loadCompetitors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domainId]);

  const toggle = (url: string) => {
    setCompetitors((prev) =>
      prev.map((c) => (c.url === url ? { ...c, selected: !c.selected } : c))
    );
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
          logoUrl: `https://img.logo.dev/${host}?token=pk_DTdFFG1JT9WOCjATvZEzIA&size=64`,
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
        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="space-y-4">
            {loading && (
              <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-4 text-slate-700">
                  <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                  <p className="text-sm font-medium">Finding peer competitors…</p>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-blue-600 transition-all w-1/2 animate-pulse" />
                </div>
                <p className="mt-3 text-xs text-slate-500">
                  Same-tier match by industry, location and company size — usually ~30 seconds.
                </p>
              </div>
            )}
            {!loading && competitors.length === 0 && (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-600">
                No backend competitors found yet. Add competitor domains manually to continue.
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
                  <div className="flex items-center gap-4">
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-sm border ${
                        competitor.selected
                          ? "border-blue-500 bg-blue-500 text-white"
                          : "border-slate-300 bg-white text-transparent"
                      }`}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </span>
                    <span className="grid h-7 w-7 flex-shrink-0 place-items-center overflow-hidden rounded-md bg-slate-50">
                      <img
                        src={competitor.logoUrl}
                        alt=""
                        className="h-6 w-6 object-contain"
                        onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
                      />
                    </span>
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">{competitor.name}</p>
                      <p className="truncate text-sm text-slate-500">{competitor.url}</p>
                    </div>
                  </div>
                  <a
                    href={competitor.url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-sm font-medium text-blue-600 truncate"
                  >
                    {competitor.url}
                  </a>
                </button>
              ))}
          </div>

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
                placeholder="Add Competitor"
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
          disabled={submitting || loading}
          className="w-full rounded-[10px] bg-slate-400 px-4 py-4 text-sm font-semibold text-white hover:bg-slate-500 transition-colors flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {submitting ? "Loading backend data..." : "Continue"}
          <span>→</span>
        </button>
      </div>
    </>
  );
}
