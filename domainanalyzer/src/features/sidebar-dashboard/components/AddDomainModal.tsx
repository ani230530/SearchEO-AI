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

type Phase = "idle" | "submitting" | "streaming" | "done" | "error";

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

export const AddDomainModal = ({
  open,
  onOpenChange,
  initialUrl,
  lockUrl,
  title = "Audit a new domain",
  description = "Enter a URL to start a fresh AI visibility audit. We'll crawl the site and generate keywords.",
  ctaLabel = "Start audit",
}: AddDomainModalProps) => {
  const navigate = useNavigate();
  const [url, setUrl] = useState(initialUrl ?? "");
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [step, setStep] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [domainId, setDomainId] = useState<number | null>(null);
  const ctrlRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (open) {
      setUrl(initialUrl ?? "");
      setPhase("idle");
      setProgress(0);
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
    if (!next) {
      ctrlRef.current?.abort();
    }
    onOpenChange(next);
  };

  const handleSubmit = () => {
    const trimmed = url.trim();
    if (!trimmed) return;

    setPhase("submitting");
    setErrorMsg("");
    setProgress(0);
    setStep("");

    const ctrl = new AbortController();
    ctrlRef.current = ctrl;

    fetchEventSource(`${API_BASE_URL}/api/domain`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("authToken")}`,
      },
      body: JSON.stringify({ url: trimmed }),
      signal: ctrl.signal,
      openWhenHidden: true,
      async onopen(response) {
        if (response.ok) {
          setPhase("streaming");
          return;
        }
        const text = await response.text().catch(() => "");
        throw new Error(text || `Failed to start (${response.status})`);
      },
      onmessage(ev) {
        if (!ev.data) return;
        try {
          const data = JSON.parse(ev.data);
          switch (data.type) {
            case "progress":
              if (typeof data.progress === "number") setProgress(data.progress);
              if (typeof data.step === "string") setStep(data.step);
              break;
            case "domain_created":
              if (typeof data.domainId === "number") setDomainId(data.domainId);
              break;
            case "complete":
              setProgress(100);
              if (data.result?.domain?.id) {
                setDomainId(data.result.domain.id);
              }
              setPhase("done");
              ctrl.abort();
              break;
            case "error":
              setPhase("error");
              setErrorMsg(data.error || data.details || "Audit failed");
              ctrl.abort();
              break;
          }
        } catch {
          // ignore non-JSON pings
        }
      },
      onerror(err) {
        setPhase("error");
        setErrorMsg(err instanceof Error ? err.message : "Connection error");
        throw err;
      },
    }).catch(() => {
      // surface state already set in onerror
    });
  };

  const isBusy = phase === "submitting" || phase === "streaming";
  const submitDisabled = isBusy || phase === "done" || !url.trim();

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
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

          {(phase === "streaming" || phase === "done") && (
            <div className="space-y-2 rounded-lg border border-[#e2e6ee] bg-[#f7f8fb] p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-[#374252]">{step || "Working…"}</span>
                <span className="font-semibold text-[#4f628a]">{progress}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#d6dbe5]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#2D4059] to-[#4E76C7] transition-[width] duration-300"
                  style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
                />
              </div>
              {phase === "done" && (
                <p className="text-xs text-[#4e9f2d]">
                  Audit complete — opening report…
                </p>
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
            disabled={phase === "submitting"}
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
