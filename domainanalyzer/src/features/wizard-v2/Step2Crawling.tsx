import { useEffect, useRef, useState } from "react";
import { fetchEventSource } from "@microsoft/fetch-event-source";
import { WizardStatusRow } from "./WizardShell";
import type { WizardProfile } from "./types";

interface Step2Props {
  url: string;
  profile: WizardProfile;
  onComplete: (domainId: number) => void;
  /**
   * Receives the raw caught error so the host page can run it through the
   * shared classifier (offline / timeout / 4xx / 5xx). Step components
   * never display errors directly — they always bubble up.
   */
  onError: (err: unknown) => void;
}

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3002";

// If we go this many ms without any SSE event, the stream is probably stuck —
// surface a "taking longer than usual" state so the user knows.
const STALL_WATCHDOG_MS = 35_000;

export function Step2Crawling({ url, profile, onComplete, onError }: Step2Props) {
  // Friendly, conversational status copy. We never surface the raw backend
  // step string here — translation happens in onmessage so the UI stays
  // warm even if internal copy changes later.
  const [step, setStep] = useState("Visiting your site to get a feel for what you do…");
  const [stalled, setStalled] = useState(false);
  const startedRef = useRef(false);
  const lastEventAtRef = useRef<number>(Date.now());

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const ctrl = new AbortController();
    const customSeeds = {
      keywords: profile.customKeywords.split(",").map((s) => s.trim()).filter(Boolean),
      prompts: profile.customPrompts.split(",").map((s) => s.trim()).filter(Boolean),
    };

    // Watchdog — flips `stalled` true after STALL_WATCHDOG_MS of silence.
    // The host page surfaces a Retry button via the WizardShell header so
    // the user always has a way out of a hung stream.
    const watchdog = window.setInterval(() => {
      if (Date.now() - lastEventAtRef.current > STALL_WATCHDOG_MS) {
        setStalled(true);
      }
    }, 5000);

    const noteEvent = () => {
      lastEventAtRef.current = Date.now();
      if (stalled) setStalled(false);
    };

    fetchEventSource(`${API_BASE_URL}/api/wizard/domain`, {
      method: "POST",
      // credentials:'include' is load-bearing for the cross-site
      // (Vercel → Render) anon flow. fetchEventSource doesn't default
      // to 'include', so without this:
      //   1. The wizard cookie isn't sent on this request
      //   2. The browser treats the request as non-credentialed and
      //      IGNORES any Set-Cookie header on the SSE response (per
      //      the CORS spec)
      // The net result is the Domain we create here gets owned by a
      // throwaway shadow session whose cookie the browser refused to
      // store — so the very next apiClient call (state/competitors)
      // sends the OLD cookie from /validate, hits a different shadow
      // user, and 404s with "Domain not found".
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("authToken")}`,
      },
      body: JSON.stringify({
        url,
        country: profile.country,
        state: profile.state,
        industry: profile.industry,
        customSeeds,
      }),
      signal: ctrl.signal,
      openWhenHidden: true,
      async onopen(response) {
        noteEvent();
        if (response.ok) return;
        const text = await response.text().catch(() => "");
        throw new Error(text || `HTTP ${response.status}`);
      },
      onmessage(ev) {
        noteEvent();
        if (!ev.data) return;
        try {
          const data = JSON.parse(ev.data);
          switch (data.type) {
            case "progress":
              // Translate backend phase names into friendly copy.
              if (data.phase === "crawl") {
                setStep("Reading through your pages — this is how we'll know what makes you, you…");
              } else if (data.phase === "profile") {
                setStep("Picking out your voice and what you actually offer…");
              }
              break;
            case "domain_created":
              setStep("We've got your site — making sense of it now…");
              break;
            case "profile_ready":
              setStep("Almost there — sketching your brand profile…");
              break;
            case "complete":
              if (typeof data.domainId === "number") {
                ctrl.abort();
                onComplete(data.domainId);
              } else if (data.result?.domain?.id) {
                ctrl.abort();
                onComplete(data.result.domain.id);
              }
              break;
            case "error":
              ctrl.abort();
              onError(new Error(data.error || data.details || "Crawl failed"));
              break;
          }
        } catch {
          /* non-JSON ping */
        }
      },
      onerror(err) {
        ctrl.abort();
        onError(err);
        throw err; // stop fetch-event-source's internal retry
      },
    }).catch(() => {});

    return () => {
      window.clearInterval(watchdog);
      ctrl.abort();
    };
  }, [url, profile, onComplete, onError, stalled]);

  return (
    <WizardStatusRow
      message={stalled ? "This is taking a bit longer than usual — hang in there." : step}
      subtle={
        stalled
          ? `We're still working on ${url}. Some sites have stricter bot defenses that take us a moment to get past. If it stays stuck, hit Retry above.`
          : `We're getting to know ${url} the same way a curious customer would — checking out a few pages so the rest of this audit is grounded in your actual story. Usually under a minute.`
      }
    />
  );
}
