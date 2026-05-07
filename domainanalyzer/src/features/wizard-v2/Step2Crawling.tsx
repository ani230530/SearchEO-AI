import { useEffect, useRef, useState } from "react";
import { fetchEventSource } from "@microsoft/fetch-event-source";
import { Loader2 } from "lucide-react";
import type { WizardProfile } from "./types";

interface Step2Props {
  url: string;
  profile: WizardProfile;
  onComplete: (domainId: number) => void;
  onError: (msg: string) => void;
}

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3002";

export function Step2Crawling({ url, profile, onComplete, onError }: Step2Props) {
  const [progress, setProgress] = useState(0);
  const [step, setStep] = useState("Starting analysis…");
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const ctrl = new AbortController();
    const customSeeds = {
      keywords: profile.customKeywords.split(",").map((s) => s.trim()).filter(Boolean),
      prompts: profile.customPrompts.split(",").map((s) => s.trim()).filter(Boolean),
    };

    fetchEventSource(`${API_BASE_URL}/api/domain`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("authToken")}`,
      },
      body: JSON.stringify({
        url,
        wizardV2: true,
        country: profile.country,
        state: profile.state,
        industry: profile.industry,
        customSeeds,
      }),
      signal: ctrl.signal,
      openWhenHidden: true,
      async onopen(response) {
        if (response.ok) return;
        const text = await response.text().catch(() => "");
        throw new Error(text || `Failed (${response.status})`);
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
              setStep("Crawling site…");
              break;
            case "profile_ready":
              setStep("Analyzing context…");
              break;
            case "complete":
              setProgress(100);
              if (data.result?.domain?.id) {
                ctrl.abort();
                onComplete(data.result.domain.id);
              }
              break;
            case "error":
              ctrl.abort();
              onError(data.error || data.details || "Crawl failed");
              break;
          }
        } catch {
          /* non-JSON ping */
        }
      },
      onerror(err) {
        ctrl.abort();
        onError(err instanceof Error ? err.message : "Connection error");
        throw err;
      },
    }).catch(() => {});

    return () => {
      ctrl.abort();
    };
  }, [url, profile, onComplete, onError]);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-3 mb-4 text-slate-700">
        <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
        <p className="text-sm font-medium">{step}</p>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-blue-600 transition-all"
          style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
        />
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Crawling {url} and pulling structured context — usually 20–60 seconds.
      </p>
    </div>
  );
}
