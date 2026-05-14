import { useEffect, useRef, useState } from "react";
import { ArrowLeft, RefreshCw } from "lucide-react";

import { Step1AddDomain } from "@/features/wizard-v2/Step1AddDomain";
import { Step2Crawling } from "@/features/wizard-v2/Step2Crawling";
import { Step3Competitors } from "@/features/wizard-v2/Step3Competitors";
import { WizardStatusRow } from "@/features/wizard-v2/WizardShell";
import { classifyError, isSilentError } from "@/features/wizard-v2/wizardErrors";
import type { WizardProfile } from "@/features/wizard-v2/types";
import { apiPost } from "@/services/apiClient";

type Stage = "form" | "crawl" | "competitors" | "finalizing";

const STAGES: Array<{ key: Stage; label: string }> = [
  { key: "form", label: "Your domain" },
  { key: "crawl", label: "Extract context" },
  { key: "competitors", label: "Pick competitors" },
  { key: "finalizing", label: "Run audit" },
];

const STAGE_COPY: Record<Stage, { heading: string; description: string }> = {
  form: {
    heading: "Set up your audit",
    description:
      "Tell us about your business. We'll read your site, find competitors, and surface the keywords to track — then run the audit.",
  },
  crawl: {
    heading: "Reading your site",
    description:
      "Hang tight — we're getting to know your domain so everything downstream is grounded in your story.",
  },
  competitors: {
    heading: "Pick your competitors",
    description:
      "The brands you actually compete with. We'll measure share of voice against these.",
  },
  finalizing: {
    heading: "Almost there",
    description:
      "Picking the keywords worth tracking, then handing you off to the audit.",
  },
};

const emptyProfile: WizardProfile = {
  country: "",
  state: "",
  industry: "",
  customKeywords: "",
  customPrompts: "",
};

interface AuditSetupFlowProps {
  /**
   * Called after the keywords land and the domain is promoted to
   * companyDomain. Receives the freshly created domain id and normalized
   * URL so the parent can refresh state and kick off Lighthouse without
   * waiting for the GET round-trip.
   */
  onComplete: (args: { domainId: number; normalizedUrl: string }) => void;
}

/**
 * Inline setup flow embedded in the Website Audit tab. Reuses Step1–Step3
 * from the standalone wizard; the keyword step is silent (no picker) and
 * runs a single LLM-backed `POST /wizard/domain/:id/keywords`.
 *
 * Stages:
 *   form         → user URL + profile (Step 1)
 *   crawl        → SSE crawl + context synthesis (Step 2)
 *   competitors  → LLM-ranked competitor picker (Step 3, auto-selected)
 *   finalizing   → generate keywords + promote company-domain (no UI choice)
 *
 * After `finalizing` resolves, control returns to AuditSection which auto-
 * runs Lighthouse against the newly promoted domain.
 *
 * Error model: each step has its own inline error banner. Retry is exposed
 * via a key-remount nonce that also flips `forceRefresh` on Step 3, the
 * same pattern the standalone wizard uses.
 */
export function AuditSetupFlow({ onComplete }: AuditSetupFlowProps) {
  const [stage, setStage] = useState<Stage>("form");
  const [profile, setProfile] = useState<WizardProfile>(emptyProfile);
  const [normalizedUrl, setNormalizedUrl] = useState("");
  const [domainId, setDomainId] = useState<number | null>(null);
  const [crawlError, setCrawlError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  // Retry just remounts the current step. Each step's initial effect
  // re-fires on mount; Step 3 picks up `forceRefresh` to skip its cache.
  const handleRetry = () => {
    setCrawlError(null);
    setRetryNonce((n) => n + 1);
  };

  // User-friendly back navigation between stages. Keeps form data so a
  // mistake at "Pick competitors" doesn't wipe the user's profile entry.
  // No "Back" out of `finalizing` — by that point the wizard has already
  // committed crawl + competitors server-side; the only safe exit is to
  // retry or let it complete.
  const handleBack = () => {
    setCrawlError(null);
    if (stage === "crawl") setStage("form");
    else if (stage === "competitors") setStage("form");
  };

  const handleCrawlError = (err: unknown) => {
    const e = classifyError(err);
    if (isSilentError(e)) return;
    if (e.kind === "unauthorized") return; // apiClient handles redirect
    setCrawlError(e.message);
  };

  const stageIndex = STAGES.findIndex((s) => s.key === stage);
  const copy = STAGE_COPY[stage];
  const showRetry = stage !== "form";
  const showBack = stage === "crawl" || stage === "competitors";

  return (
    <div className="relative z-10 w-full max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <header className="mb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[12px] font-medium uppercase tracking-[0.1em] text-blue-600/80 mb-2">
              Website audit · setup
            </p>
            <h1
              className="text-3xl font-light text-slate-900 tracking-tight"
              style={{ letterSpacing: "-0.01em" }}
            >
              {copy.heading}
            </h1>
            <p className="mt-2 text-sm text-slate-500 leading-relaxed max-w-lg">
              {copy.description}
            </p>
          </div>
          {showRetry ? (
            <button
              type="button"
              onClick={handleRetry}
              className="mt-1 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors shrink-0"
              title="Retry this step"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Retry
            </button>
          ) : null}
        </div>

        <Stepper currentIndex={stageIndex} />

        {showBack ? (
          <button
            type="button"
            onClick={handleBack}
            className="mt-4 inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </button>
        ) : null}
      </header>

      {crawlError && stage === "crawl" ? (
        <div className="mb-6 flex items-start justify-between gap-3 rounded-md border border-rose-100 bg-rose-50/60 px-3 py-2.5 text-sm text-rose-700">
          <span>{crawlError}</span>
          <button
            type="button"
            onClick={() => setCrawlError(null)}
            className="text-rose-400 hover:text-rose-600 transition-colors"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-white/70 backdrop-blur-md p-6 sm:p-8 shadow-sm">
        {stage === "form" ? (
          <Step1AddDomain
            initialUrl={normalizedUrl}
            initialProfile={profile}
            onContinue={({ normalizedUrl: u, profile: p }) => {
              setNormalizedUrl(u);
              setProfile(p);
              setStage("crawl");
            }}
            // No `onExistingDomain` — inside the inline audit setup we
            // don't want the "View existing report" button at all (it
            // would navigate the user to /ai-results, away from the
            // setup flow). Step 1 hides that button when the callback
            // isn't wired and adapts its prompt copy accordingly.
          />
        ) : stage === "crawl" ? (
          <Step2Crawling
            key={`crawl-${retryNonce}`}
            url={normalizedUrl}
            profile={profile}
            onComplete={(id) => {
              setDomainId(id);
              setStage("competitors");
            }}
            onError={handleCrawlError}
          />
        ) : stage === "competitors" && domainId ? (
          <Step3Competitors
            key={`competitors-${retryNonce}`}
            domainId={domainId}
            forceRefresh={retryNonce > 0}
            onContinue={() => setStage("finalizing")}
          />
        ) : stage === "finalizing" && domainId ? (
          <KeywordsAutoGen
            key={`finalize-${retryNonce}`}
            domainId={domainId}
            normalizedUrl={normalizedUrl}
            onDone={() => onComplete({ domainId, normalizedUrl })}
            onRetry={handleRetry}
          />
        ) : null}
      </div>

      {/* Subtle hint that the user could resume the prior URL — useful when
          someone half-finishes a setup, leaves, and comes back later. */}
      {stage === "form" && normalizedUrl ? (
        <p className="mt-4 text-center text-xs text-slate-400">
          Picked up from your last attempt at{" "}
          <span className="font-medium text-slate-500">{normalizedUrl}</span>.
        </p>
      ) : null}
    </div>
  );
}

function Stepper({ currentIndex }: { currentIndex: number }) {
  return (
    <ol
      className="mt-5 flex items-center gap-2"
      aria-label={`Step ${currentIndex + 1} of ${STAGES.length}`}
    >
      {STAGES.map((s, idx) => {
        const state = idx < currentIndex ? "done" : idx === currentIndex ? "active" : "todo";
        return (
          <li key={s.key} className="flex items-center gap-2">
            <span
              className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold ${
                state === "active"
                  ? "bg-blue-500 text-white"
                  : state === "done"
                    ? "bg-slate-400 text-white"
                    : "bg-slate-100 text-slate-400"
              }`}
            >
              {idx + 1}
            </span>
            <span
              className={`text-[12px] font-medium ${
                state === "active"
                  ? "text-slate-900"
                  : state === "done"
                    ? "text-slate-500"
                    : "text-slate-400"
              }`}
            >
              {s.label}
            </span>
            {idx < STAGES.length - 1 ? (
              <span className="h-px w-6 bg-slate-200" aria-hidden />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

interface KeywordsAutoGenProps {
  domainId: number;
  normalizedUrl: string;
  onDone: () => void;
  onRetry: () => void;
}

/**
 * Final silent stage of the audit setup flow.
 *
 *   1. POST /wizard/domain/:id/keywords  → LLM-generates 8–12 commercial-
 *      intent keywords, persists them as `isSelected: true`.
 *   2. POST /user/company-domain         → flips `isCompanyDomain: true`
 *      so the rest of the dashboard keys off this domain.
 *   3. onDone()                          → parent kicks Lighthouse audit.
 *
 * Both POSTs are idempotent server-side, so retry just re-fires them.
 * Uses an effect-scoped `cancelled` flag so a re-mount mid-flight doesn't
 * double-call `onDone`.
 */
function KeywordsAutoGen({ domainId, normalizedUrl, onDone, onRetry }: KeywordsAutoGenProps) {
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"keywords" | "promote">("keywords");
  // Guards against double-fire under React StrictMode (which mounts every
  // component twice in dev). Without this, both effects race the same
  // backend writes — harmless thanks to upsert, but wastes an LLM call.
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    let cancelled = false;
    const run = async () => {
      try {
        setPhase("keywords");
        await apiPost(`/wizard/domain/${domainId}/keywords`);
        if (cancelled) return;
        setPhase("promote");
        await apiPost("/user/company-domain", { url: normalizedUrl });
        if (cancelled) return;
        onDone();
      } catch (err) {
        if (cancelled) return;
        const e = classifyError(err);
        if (isSilentError(e)) return;
        if (e.kind === "unauthorized") return; // apiClient redirects
        setError(e.message);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [domainId, normalizedUrl, onDone]);

  if (error) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3 rounded-md border border-rose-100 bg-rose-50/60 px-3 py-2.5 text-sm text-rose-700">
          <span>{error}</span>
        </div>
        <button
          type="button"
          onClick={() => {
            firedRef.current = false;
            setError(null);
            onRetry();
          }}
          className="inline-flex items-center gap-1.5 self-start rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Try again
        </button>
      </div>
    );
  }

  return (
    <WizardStatusRow
      message={
        phase === "keywords"
          ? "Picking the keywords worth tracking…"
          : "Saving your domain and queuing the audit…"
      }
      subtle={
        phase === "keywords"
          ? "Reading the crawl context and your competitor picks to surface 8–12 commercially relevant terms."
          : "Promoting this domain to your company profile so Domain Info and downstream reports key off it."
      }
    />
  );
}
