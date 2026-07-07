/**
 * Step5RunQueries — live per-prompt × per-model progress.
 *
 * Streams from POST /api/wizard/domain/:id/run (SSE). For each `result` event
 * we mark the matching (promptId × model) cell as done; pending cells show a
 * spinner. When the `complete` event arrives, redirect to /ai-results/:slug.
 *
 * The pages renders nothing the user has to click — the whole step is driven
 * by the SSE stream and exits automatically when every cell is filled.
 */

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { fetchEventSource } from '@microsoft/fetch-event-source';
import { Check, Loader2, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { apiGet } from '@/services/apiClient';
import { buildDomainSlug, maskDomainId } from '@/lib/domainUtils';
import { aiResultsKeys } from '@/features/ai-results/queries';
import { WizardStatusRow } from './WizardShell';

interface Props {
  domainId: number;
  /** Receives the raw caught error so the host page runs it through the shared classifier. */
  onError: (err: unknown) => void;
}

// If the SSE stream goes silent past this window, we surface a "taking longer
// than usual" hint so the user knows it's not just frozen.
const STALL_WATCHDOG_MS = 45_000;

const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3002';

const getReadableDomainSlug = async (domainId: number) => {
  try {
    const data = await apiGet<{ domains?: Array<{ id: number; url?: string; host?: string }> }>('/wizard/domains');
    const domain = data.domains?.find((item) => item.id === domainId);
    return domain ? buildDomainSlug(domain) : maskDomainId(domainId);
  } catch {
    return maskDomainId(domainId);
  }
};

interface PromptRow {
  id: number;
  text: string;
}

type CellStatus = 'pending' | 'done';

interface ResultEvent {
  promptId: number;
  model: string;
  presence: number;
  overall: number;
  citationCount?: number;
  competitorMentionCount?: number;
}

const MODEL_LABELS: Record<string, string> = {
  'gpt-4o-mini': 'ChatGPT',
  'claude-sonnet-4-5': 'Claude',
  'gemini-2.0-flash': 'Gemini',
  'google-gre': 'Google AI',
};
const MODEL_ORDER = ['gpt-4o-mini', 'claude-sonnet-4-5', 'gemini-2.0-flash', 'google-gre'];

/**
 * Memoized cell so we don't re-render the entire 90-cell grid on every SSE
 * result event. Each cell re-renders only when its own (status, presence)
 * actually changes — cuts render work from O(prompts × models × events) to
 * O(events).
 */
type CellPresence = 0 | 1 | null; // null = pending / not yet known
const StatusCell = memo(function StatusCell({
  status,
  presence,
}: {
  status: CellStatus;
  presence: CellPresence;
}) {
  return (
    <td className="px-2 py-2.5 align-top">
      <div className="flex flex-col items-center gap-0.5">
        {status === 'done' ? (
          (presence ?? 0) > 0 ? (
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <Check className="h-3 w-3" />
            </span>
          ) : (
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-rose-100 text-rose-600">
              <X className="h-3 w-3" />
            </span>
          )
        ) : (
          <span className="inline-flex h-5 w-5 items-center justify-center">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-300" />
          </span>
        )}
      </div>
    </td>
  );
});

export function Step5RunQueries({ domainId, onError }: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [prompts, setPrompts] = useState<PromptRow[]>([]);
  const [statusMatrix, setStatusMatrix] = useState<Record<number, Record<string, CellStatus>>>({});
  const [resultMap, setResultMap] = useState<Record<number, Record<string, ResultEvent>>>({});
  const [statusMsg, setStatusMsg] = useState('Pulling up your prompts…');
  const [overallPct, setOverallPct] = useState(0);
  const [done, setDone] = useState(false);
  const startedRef = useRef(false);

  // 1. Load the user's selected prompts so we can render rows immediately.
  useEffect(() => {
    let alive = true;
    apiGet<{ prompts: PromptRow[] }>(`/wizard/domain/${domainId}`)
      .then((data) => {
        if (!alive) return;
        const selected = (data as any).prompts?.filter((p: any) => p.isSelected) ?? [];
        setPrompts(selected);
        // Seed the matrix with all cells = pending.
        const seeded: Record<number, Record<string, CellStatus>> = {};
        for (const p of selected) {
          seeded[p.id] = {};
          for (const m of MODEL_ORDER) seeded[p.id][m] = 'pending';
        }
        setStatusMatrix(seeded);
        setStatusMsg(
          selected.length === 1
            ? `Asking each AI assistant your prompt…`
            : `Asking each AI assistant all ${selected.length} of your prompts…`
        );
      })
      .catch((err) => onError(err));
    return () => { alive = false; };
  }, [domainId, onError]);

  // SSE stall watchdog — flips this state when the stream goes silent.
  const [stalled, setStalled] = useState(false);
  const lastEventAtRef = useRef<number>(Date.now());

  // 2. Open the SSE stream once.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    const ctrl = new AbortController();

    const noteEvent = () => {
      lastEventAtRef.current = Date.now();
      if (stalled) setStalled(false);
    };

    const watchdog = window.setInterval(() => {
      if (Date.now() - lastEventAtRef.current > STALL_WATCHDOG_MS) {
        setStalled(true);
      }
    }, 5000);

    fetchEventSource(`${API_BASE_URL}/api/wizard/domain/${domainId}/run`, {
      method: 'POST',
      // credentials:'include' so the wizard cookie round-trips in
      // cross-site deploys. /run currently requires JWT (anon callers
      // are rejected with 402 SIGNUP_REQUIRED at the route level), so
      // the cookie isn't strictly needed here for identity — but we
      // include it for consistency with the other wizard fetches and
      // to keep the post-signup behavior working in environments where
      // the JWT hand-off briefly leaves us cookie-identified.
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('authToken')}`,
      },
      body: JSON.stringify({}),
      signal: ctrl.signal,
      openWhenHidden: true,
      async onopen(response) {
        noteEvent();
        if (response.ok) return;
        const text = await response.text().catch(() => '');
        throw new Error(text || `HTTP ${response.status}`);
      },
      onmessage(ev) {
        noteEvent();
        if (!ev.data) return;
        let data: any = null;
        try { data = JSON.parse(ev.data); } catch { return; }
        switch (ev.event) {
          case 'progress':
            // Backend may send technical strings — we keep our own copy.
            if (typeof data.totalQueries === 'number' && data.totalQueries > 0) {
              setStatusMsg(
                `Asking each AI assistant your prompts. We'll watch how each one answers…`
              );
            }
            break;
          case 'result': {
            const r = data.currentResult as ResultEvent | undefined;
            if (!r) break;
            setStatusMatrix((prev) => ({
              ...prev,
              [r.promptId]: { ...(prev[r.promptId] ?? {}), [r.model]: 'done' },
            }));
            setResultMap((prev) => ({
              ...prev,
              [r.promptId]: { ...(prev[r.promptId] ?? {}), [r.model]: r },
            }));
            if (typeof data.completedQueries === 'number' && typeof data.totalQueries === 'number') {
              setOverallPct(Math.round((data.completedQueries / data.totalQueries) * 100));
            }
            break;
          }
          case 'complete':
            setOverallPct(100);
            setDone(true);
            ctrl.abort();
            // A fresh run just landed in the DB. Every AI Results query
            // (report / trends / runs / competitor-analysis / competitors) is
            // run-derived and cached for 5 min globally with no refetch on
            // window focus — so without this the dashboard the user lands on
            // would keep serving the PRE-audit copy, making a re-audit look
            // like it did nothing and leaving the trend charts on stale data.
            // Invalidate the whole `ai-results` tree so each page refetches on
            // mount with the new run's numbers.
            void queryClient.invalidateQueries({ queryKey: ['ai-results'] });
            // Brief pause so the user sees the final tick before navigating.
            setTimeout(() => {
              void apiGet<{ domains?: Array<{ id: number; url?: string; host?: string }> }>('/wizard/domains')
                .then((data) => {
                  queryClient.setQueryData(aiResultsKeys.domains(), data);
                  const domain = data.domains?.find((item) => item.id === domainId);
                  const slug = domain ? buildDomainSlug(domain) : maskDomainId(domainId);
                  localStorage.setItem('ai-visibility:lastDomainSlug', slug);
                  navigate(`/ai-results/${slug}`);
                })
                .catch(() => {
                  void getReadableDomainSlug(domainId).then((slug) => {
                    localStorage.setItem('ai-visibility:lastDomainSlug', slug);
                    navigate(`/ai-results/${slug}`);
                  });
                });
            }, 800);
            break;
          case 'error':
            ctrl.abort();
            onError(new Error(data.error ?? 'AI queries failed'));
            break;
        }
      },
      onerror(err) {
        ctrl.abort();
        onError(err);
        throw err; // stop fetch-event-source's auto-retry
      },
    }).catch(() => undefined);

    return () => {
      window.clearInterval(watchdog);
      ctrl.abort();
    };
  }, [domainId, navigate, onError, stalled, queryClient]);

  const totalCells = prompts.length * MODEL_ORDER.length;
  const completedCells = useMemo(() => {
    let n = 0;
    for (const promptId in statusMatrix) {
      for (const model in statusMatrix[promptId]) {
        if (statusMatrix[promptId][model] === 'done') n++;
      }
    }
    return n;
  }, [statusMatrix]);

  return (
    <div className="space-y-4">
      <WizardStatusRow
        message={
          done
            ? 'All responses collected — taking you to your dashboard…'
            : stalled
              ? 'Still working — some models take longer to answer than others.'
              : statusMsg
        }
        done={done}
        subtle={
          totalCells
            ? `${completedCells} of ${totalCells} model responses collected. Deep scoring continues in the background if needed.`
            : undefined
        }
      />

      <div className="overflow-hidden">
        <table className="w-full text-left text-sm border-separate border-spacing-y-1">
          <thead className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
            <tr>
              <th className="px-2 pb-2 w-1/2 font-medium text-left">Prompt</th>
              {MODEL_ORDER.map((m) => (
                <th key={m} className="px-2 pb-2 text-center font-medium">{MODEL_LABELS[m] ?? m}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {prompts.length === 0 ? (
              <tr>
                <td colSpan={1 + MODEL_ORDER.length} className="px-2 py-4 text-slate-500">
                  Pulling your selected prompts…
                </td>
              </tr>
            ) : (
              prompts.map((p) => (
                <tr key={p.id} className="group">
                  <td className="px-2 py-2.5 text-[13px] text-slate-700 align-top leading-snug">
                    {p.text}
                  </td>
                  {MODEL_ORDER.map((m) => {
                    const status = statusMatrix[p.id]?.[m] ?? 'pending';
                    const presence: CellPresence =
                      status === 'done' ? ((resultMap[p.id]?.[m]?.presence ?? 0) > 0 ? 1 : 0) : null;
                    return <StatusCell key={m} status={status} presence={presence} />;
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
