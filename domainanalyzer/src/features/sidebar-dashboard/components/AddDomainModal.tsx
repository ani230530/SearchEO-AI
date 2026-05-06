import { fetchEventSource } from "@microsoft/fetch-event-source";
import { Globe, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { maskDomainId } from "@/lib/domainUtils";

type Phase = "idle" | "extract" | "phrases" | "queries" | "done" | "error";

type AddDomainModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialUrl?: string;
  lockUrl?: boolean;
  title?: string;
  description?: string;
  ctaLabel?: string;
};

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3002";

const PHASE_LABEL: Record<Exclude<Phase, "idle">, string> = {
  extract: "1 / 3 — Crawling site & generating keywords",
  phrases: "2 / 3 — Generating prompts",
  queries: "3 / 3 — Running AI queries & scoring",
  done: "Audit complete",
  error: "Audit failed",
};

const authHeaders = (): Record<string, string> => {
  const token = localStorage.getItem("authToken");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

/**
 * Phase 1+2 — POST /api/domain. Events come as `data: {...}` with a `type`
 * discriminator. Returns the new domainId on `complete`.
 */
const runExtractAndKeywords = (
  url: string,
  parentSignal: AbortSignal,
  onProgress: (pct: number, step: string) => void
): Promise<number> =>
  new Promise((resolve, reject) => {
    const ctrl = new AbortController();
    const onParentAbort = () => ctrl.abort();
    parentSignal.addEventListener("abort", onParentAbort);

    let capturedId: number | null = null;
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      parentSignal.removeEventListener("abort", onParentAbort);
      ctrl.abort();
      fn();
    };

    fetchEventSource(`${API_BASE_URL}/api/domain`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ url }),
      signal: ctrl.signal,
      openWhenHidden: true,
      async onopen(response) {
        if (response.ok) return;
        const text = await response.text().catch(() => "");
        throw new Error(text || `Failed to start extraction (${response.status})`);
      },
      onmessage(ev) {
        if (!ev.data) return;
        try {
          const data = JSON.parse(ev.data);
          switch (data.type) {
            case "progress":
              if (typeof data.progress === "number") {
                onProgress(data.progress, data.step ?? "");
              }
              break;
            case "domain_created":
              if (typeof data.domainId === "number") capturedId = data.domainId;
              break;
            case "complete":
              if (data.result?.domain?.id) capturedId = data.result.domain.id;
              if (capturedId) settle(() => resolve(capturedId!));
              else settle(() => reject(new Error("Phase 1 finished but no domain id returned")));
              break;
            case "error":
              settle(() =>
                reject(new Error(data.error || data.details || "Extraction failed"))
              );
              break;
          }
        } catch {
          // ignore non-JSON pings
        }
      },
      onerror(err) {
        settle(() => reject(err instanceof Error ? err : new Error("Connection error")));
        throw err;
      },
    }).catch(() => {
      // settle already invoked in onerror — swallow
    });
  });

/**
 * Phase 3 — POST /api/enhanced-phrases/:domainId/step3/generate.
 * Uses named SSE events: `progress`, `step-update`, `complete`, `error`.
 */
const runPhraseGeneration = (
  domainId: number,
  parentSignal: AbortSignal,
  onProgress: (pct: number, step: string) => void
): Promise<void> =>
  new Promise((resolve, reject) => {
    const ctrl = new AbortController();
    const onParentAbort = () => ctrl.abort();
    parentSignal.addEventListener("abort", onParentAbort);

    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      parentSignal.removeEventListener("abort", onParentAbort);
      ctrl.abort();
      fn();
    };

    fetchEventSource(
      `${API_BASE_URL}/api/enhanced-phrases/${domainId}/step3/generate`,
      {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({}),
        signal: ctrl.signal,
        openWhenHidden: true,
        async onopen(response) {
          if (response.ok) return;
          const text = await response.text().catch(() => "");
          throw new Error(text || `Failed to start phrase generation (${response.status})`);
        },
        onmessage(ev) {
          switch (ev.event) {
            case "progress":
              try {
                const data = JSON.parse(ev.data);
                if (typeof data.progress === "number") {
                  onProgress(data.progress, data.step ?? data.message ?? "");
                }
              } catch {}
              break;
            case "step-update":
              try {
                const data = JSON.parse(ev.data);
                if (typeof data.progress === "number") {
                  onProgress(data.progress, `Step ${(data.index ?? 0) + 1}: ${data.status ?? ""}`);
                }
              } catch {}
              break;
            case "complete":
              settle(() => resolve());
              break;
            case "error":
              try {
                const data = JSON.parse(ev.data);
                settle(() => reject(new Error(data.error ?? "Phrase generation failed")));
              } catch {
                settle(() => reject(new Error("Phrase generation failed")));
              }
              break;
            // ignore phrase-generated, debug, steps
          }
        },
        onerror(err) {
          settle(() => reject(err instanceof Error ? err : new Error("Connection error")));
          throw err;
        },
      }
    ).catch(() => {});
  });

/**
 * Phase 4+5 — POST /api/ai-queries/:domainId.
 * Uses named SSE events: `progress`, `result`, `stats`, `complete`, `error`.
 * Progress is reported as text only, so we count `result` events against an
 * optional total parsed from the first `progress` message.
 */
const runAIQueries = (
  domainId: number,
  parentSignal: AbortSignal,
  onProgress: (pct: number, step: string) => void
): Promise<void> =>
  new Promise((resolve, reject) => {
    const ctrl = new AbortController();
    const onParentAbort = () => ctrl.abort();
    parentSignal.addEventListener("abort", onParentAbort);

    let totalExpected = 0;
    let resultsCount = 0;
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      parentSignal.removeEventListener("abort", onParentAbort);
      ctrl.abort();
      fn();
    };

    fetchEventSource(`${API_BASE_URL}/api/ai-queries/${domainId}`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({}),
      signal: ctrl.signal,
      openWhenHidden: true,
      async onopen(response) {
        if (response.ok) return;
        const text = await response.text().catch(() => "");
        throw new Error(text || `Failed to start AI queries (${response.status})`);
      },
      onmessage(ev) {
        switch (ev.event) {
          case "progress":
            try {
              const data = JSON.parse(ev.data);
              const msg: string = data.message ?? "";
              const m = msg.match(/Processing (\d+) queries/);
              if (m) totalExpected = parseInt(m[1], 10);
              const pct = totalExpected > 0
                ? Math.min(99, Math.round((resultsCount / totalExpected) * 100))
                : 5;
              onProgress(pct, msg);
            } catch {}
            break;
          case "result":
            resultsCount += 1;
            if (totalExpected > 0) {
              const pct = Math.min(99, Math.round((resultsCount / totalExpected) * 100));
              onProgress(pct, `Scored ${resultsCount} of ${totalExpected} queries`);
            } else {
              onProgress(50, `Scored ${resultsCount} queries`);
            }
            break;
          case "complete":
            settle(() => resolve());
            break;
          case "error":
            try {
              const data = JSON.parse(ev.data);
              settle(() => reject(new Error(data.error ?? "AI queries failed")));
            } catch {
              settle(() => reject(new Error("AI queries failed")));
            }
            break;
          // ignore stats
        }
      },
      onerror(err) {
        settle(() => reject(err instanceof Error ? err : new Error("Connection error")));
        throw err;
      },
    }).catch(() => {});
  });

export const AddDomainModal = ({
  open,
  onOpenChange,
  initialUrl,
  lockUrl,
  title = "Audit a new domain",
  description = "Enter a URL — we'll crawl it, generate prompts, and run AI queries. You'll land on the report when it's done.",
  ctaLabel = "Start audit",
}: AddDomainModalProps) => {
  const navigate = useNavigate();
  const [url, setUrl] = useState(initialUrl ?? "");
  const [phase, setPhase] = useState<Phase>("idle");
  const [overall, setOverall] = useState(0);
  const [step, setStep] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [domainId, setDomainId] = useState<number | null>(null);
  const ctrlRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (open) {
      setUrl(initialUrl ?? "");
      setPhase("idle");
      setOverall(0);
      setStep("");
      setErrorMsg("");
      setDomainId(null);
    }
  }, [open, initialUrl]);

  useEffect(() => {
    if (phase !== "done" || !domainId) return;
    const slug = maskDomainId(domainId);
    const t = setTimeout(() => {
      onOpenChange(false);
      navigate(`/ai-results/${slug}`);
    }, 800);
    return () => clearTimeout(t);
  }, [phase, domainId, navigate, onOpenChange]);

  const handleOpenChange = (next: boolean) => {
    if (!next) ctrlRef.current?.abort();
    onOpenChange(next);
  };

  const handleSubmit = async () => {
    const trimmed = url.trim();
    if (!trimmed) return;

    setErrorMsg("");
    setStep("");
    setOverall(0);

    const ctrl = new AbortController();
    ctrlRef.current = ctrl;

    try {
      setPhase("extract");
      const id = await runExtractAndKeywords(trimmed, ctrl.signal, (pct, s) => {
        setOverall(Math.round(pct * 0.33));
        if (s) setStep(s);
      });
      setDomainId(id);

      setPhase("phrases");
      setOverall(33);
      setStep("");
      await runPhraseGeneration(id, ctrl.signal, (pct, s) => {
        setOverall(33 + Math.round(pct * 0.33));
        if (s) setStep(s);
      });

      setPhase("queries");
      setOverall(66);
      setStep("");
      await runAIQueries(id, ctrl.signal, (pct, s) => {
        setOverall(66 + Math.round(pct * 0.34));
        if (s) setStep(s);
      });

      setPhase("done");
      setOverall(100);
    } catch (err) {
      if (ctrl.signal.aborted) return; // user-initiated cancel
      setPhase("error");
      setErrorMsg(err instanceof Error ? err.message : "Audit failed");
    }
  };

  const isBusy = phase === "extract" || phase === "phrases" || phase === "queries";
  const submitDisabled = isBusy || phase === "done" || !url.trim();

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Globe className="h-5 w-5 text-[#4f628a]" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label htmlFor="domain-url" className="text-xs font-semibold text-[#4d5d78]">
              Domain URL
            </label>
            <Input
              id="domain-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              disabled={isBusy || phase === "done" || lockUrl}
              autoFocus={!lockUrl}
            />
          </div>

          {phase !== "idle" && phase !== "error" && (
            <div className="space-y-2 rounded-lg border border-[#e2e6ee] bg-[#f7f8fb] p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-[#374252]">{PHASE_LABEL[phase]}</span>
                <span className="font-semibold text-[#4f628a]">{overall}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#d6dbe5]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#2D4059] to-[#4E76C7] transition-[width] duration-300"
                  style={{ width: `${Math.max(0, Math.min(100, overall))}%` }}
                />
              </div>
              {step && phase !== "done" && (
                <p className="line-clamp-2 text-[11px] text-[#7f8795]">{step}</p>
              )}
              {phase === "done" && (
                <p className="text-xs text-[#4e9f2d]">Audit complete — opening report…</p>
              )}
            </div>
          )}

          {phase === "error" && (
            <div className="rounded-lg border border-[#fad4d4] bg-[#fff5f5] p-3 text-xs text-[#cf3d3d]">
              {errorMsg || "Audit failed. Try again."}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isBusy && phase !== "queries"}
          >
            {phase === "done" ? "Close" : "Cancel"}
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={submitDisabled}
            className="bg-[#2D4059] text-white hover:bg-[#24364d]"
          >
            {isBusy && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
            {phase === "error" ? "Retry" : ctaLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
