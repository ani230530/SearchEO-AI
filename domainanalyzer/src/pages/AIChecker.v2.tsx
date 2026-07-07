/**
 * Wizard host page.
 *
 * Owns:
 *  - Current step (1..5) + the cross-step state (domainId, profile, drafts).
 *  - Resume-from-URL (?domain=:id reads /state and lands the user on the
 *    right step with prior selections rehydrated).
 *  - Form persistence for Step 1 (sessionStorage) so a tab crash doesn't
 *    eat the URL + country + industry the user just typed.
 *  - Back navigation between steps. Going back skips the auto-only crawl
 *    step (Step 2) since it has no user input — Step 3's "Back" sends the
 *    user to Step 1 to edit the profile that drove the crawl + competitors.
 *  - Retry-by-remount via a key nonce: each step that fires an effect on
 *    mount remounts when the user hits Retry, which re-fires the request
 *    without us having to plumb retry handlers through each component.
 *  - Global error banner that uses the wizardErrors classifier so the user
 *    never sees raw stack traces / status codes.
 */

import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/services/apiClient";
import { useAuth } from "@/contexts/AuthContext";
import { WizardShell } from "@/features/wizard-v2/WizardShell";
// Step 1 stays eager — it's the wizard entry point and always renders first.
import { Step1AddDomain } from "@/features/wizard-v2/Step1AddDomain";
// Steps 2–5 lazy-load so the cold wizard bundle stays small. Each step
// becomes its own chunk fetched only when the user advances to it.
const Step2Crawling = lazy(() =>
  import("@/features/wizard-v2/Step2Crawling").then((m) => ({ default: m.Step2Crawling })),
);
const Step3Competitors = lazy(() =>
  import("@/features/wizard-v2/Step3Competitors").then((m) => ({ default: m.Step3Competitors })),
);
const Step4SelectTopics = lazy(() =>
  import("@/features/wizard-v2/Step4SelectTopics").then((m) => ({ default: m.Step4SelectTopics })),
);
const Step5RunQueries = lazy(() =>
  import("@/features/wizard-v2/Step5RunQueries").then((m) => ({ default: m.Step5RunQueries })),
);
import { SignupWallModal } from "@/features/wizard-v2/SignupWallModal";
import { PHASE_TO_STEP, type WizardProfile, type WizardStateResponse, type WizardStep } from "@/features/wizard-v2/types";
import { classifyError, isSilentError } from "@/features/wizard-v2/wizardErrors";

// Per-step UI copy. Heading + subtitle + eyebrow shown by WizardShell.
const HEADINGS: Record<WizardStep, { eyebrow: string; heading: string; description?: string }> = {
  1: {
    eyebrow: "Get Started!",
    heading: "Add your domain",
    description: "We scan your public pages and build your AI visibility framework.",
  },
  2: {
    eyebrow: "Get Started!",
    heading: "Add your domain",
    description: "Hang tight — we're getting to know your site so the rest of this audit lands right.",
  },
  3: {
    eyebrow: "Competitor Intelligence",
    heading: "Who are you competing against in AI answers?",
    description: "We track how often competitors get cited by AI search engines, so you see exactly where to close the gap. List at least 3 competitors for a meaningful comparison.",
  },
  4: {
    eyebrow: "Topics",
    heading: "What does AI say about you?",
    description: "Choose the most relevant queries and prompts to help AI understand what you want to track and optimize.",
  },
  5: {
    eyebrow: "Almost there",
    heading: "Generating your report from your data",
    description: "Asking each AI assistant your prompts, watching how they answer.",
  },
};

// sessionStorage key for the Step 1 form so a refresh doesn't lose work.
const FORM_STORAGE_KEY = "wizard:step1:form";

interface PersistedStep1 {
  url: string;
  profile: WizardProfile;
}

function loadPersistedForm(): PersistedStep1 | null {
  try {
    const raw = sessionStorage.getItem(FORM_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.profile) return parsed as PersistedStep1;
  } catch {
    /* ignore — corrupted state, treat as fresh */
  }
  return null;
}

export default function AICheckerV2() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, exchangeGoogleCode } = useAuth();
  const initialStep: WizardStep = searchParams.get("restart") === "crawl" ? 2 : searchParams.get("restart") === "competitors" ? 3 : searchParams.get("restart") === "topics" ? 4 : 1;
  const [step, setStep] = useState<WizardStep>(initialStep);
  const [domainId, setDomainId] = useState<number | null>(null);
  // Anonymous callers hit a signup wall when they try to start Step 5.
  // The wall is opened by intercepting the Step 4 onContinue callback;
  // dismissing it keeps the user on Step 4 with their selections intact.
  const [signupWallOpen, setSignupWallOpen] = useState(false);
  const [normalizedUrl, setNormalizedUrl] = useState<string>("");
  const [profile, setProfile] = useState<WizardProfile>({
    country: "",
    state: "",
    industry: "",
    customKeywords: "",
    customPrompts: "",
  });
  const [restoredDraft, setRestoredDraft] = useState<{ keywordIds?: number[]; promptIds?: number[] } | null>(null);
  const [restoredCompetitors, setRestoredCompetitors] = useState<string[]>([]);
  const [loadingState, setLoadingState] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const handledGoogleCodeRef = useRef<string | null>(null);

  // Hydrate Step 1 form from sessionStorage on first mount. Resume from
  // ?domain=:id overrides this if it succeeds.
  //
  // ?prefillHost=<host> takes priority over the persisted form — it's the
  // fallback path from the anonymous audit funnel when registration
  // succeeded but the backend linkage didn't return a primaryDomainId
  // (e.g. the cookie expired between Step 1 and signup). Without this
  // the user would land on a blank Step 1 having just typed their URL.
  useEffect(() => {
    const prefillHost = searchParams.get("prefillHost");
    if (prefillHost) {
      // Treat the host as a https URL; the validate step will canonicalize.
      setNormalizedUrl(
        prefillHost.startsWith("http") ? prefillHost : `https://${prefillHost}`
      );
      return;
    }
    const persisted = loadPersistedForm();
    if (!persisted) return;
    setNormalizedUrl(persisted.url ?? "");
    setProfile(persisted.profile);
    // searchParams is stable across renders for our purposes; eslint
    // disable kept narrow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save Step 1 form whenever it changes — only meaningful when the user
  // is actually on Step 1 (later steps don't edit the profile in place).
  useEffect(() => {
    if (step !== 1) return;
    try {
      sessionStorage.setItem(
        FORM_STORAGE_KEY,
        JSON.stringify({ url: normalizedUrl, profile } as PersistedStep1)
      );
    } catch {
      /* sessionStorage can throw in private mode — silent */
    }
  }, [step, normalizedUrl, profile]);

  // Resume from URL ?domain=:id — fetches the wizard state, rehydrates the
  // profile / drafts / selected competitors, and lands the user on the
  // right step using the canResumeAt → step map.
  //
  // ?restart=crawl  → wipe everything downstream of the profile, kick Step 2
  // ?restart=topics → keep crawl + competitors + prompt inventory, kick Step 4
  useEffect(() => {
    const idParam = searchParams.get("domain");
    if (!idParam) return;
    const id = Number(idParam);
    if (!Number.isFinite(id)) return;
    const restart = searchParams.get("restart"); // 'crawl' | 'competitors' | 'topics' | null
    setDomainId(id);
    setLoadingState(true);

    const run = async () => {
      try {
        // If the dashboard sent us here with ?restart=…, hit the backend
        // restart endpoint first so the next state read reflects the wiped
        // phases. Without this we'd still see the old run's state and
        // canResumeAt would land us at the wrong step.
        if (restart === 'crawl' || restart === 'competitors' || restart === 'topics') {
          await apiPost(`/wizard/domain/${id}/restart`, { from: restart });
          // The restart changes the next audit selection state. Any AI
          // Results data still cached from before the restart is stale — drop
          // it so the dashboard can't flash old selection state if the user
          // backs out mid-wizard.
          void queryClient.invalidateQueries({ queryKey: ['ai-results'] });
          // Strip the param from the URL so a refresh doesn't re-restart.
          setSearchParams(
            (prev) => {
              const next = new URLSearchParams(prev);
              next.delete('restart');
              return next;
            },
            { replace: true }
          );
        }

        const res = await apiGet<WizardStateResponse>(`/wizard/domain/${id}/state`);
        setNormalizedUrl(res.url);
        // `profile` is null when the Domain row exists but no DomainProfile
        // row has been written yet — happens when we arrive from the
        // anonymous audit funnel, where signup materializes only the
        // Domain shell. Treat the field as nullable and default to a
        // blank profile so the user can fill it in on Step 1.
        const incomingProfile = res.profile ?? null;
        setProfile({
          country: incomingProfile?.country ?? "",
          state: incomingProfile?.state ?? "",
          industry: incomingProfile?.industry ?? "",
          customKeywords: (res.customSeeds?.keywords ?? []).join(", "),
          customPrompts: (res.customSeeds?.prompts ?? []).join(", "),
        });
        setRestoredCompetitors(res.selectedCompetitors ?? []);
        setRestoredDraft(res.selectionDraft ?? null);

        // Land at the explicit target if restart was used; else use canResumeAt.
        const target: WizardStep =
          restart === 'crawl' ? 2 :
            restart === 'competitors' ? 3 :
            restart === 'topics' ? 4 :
              (res.canResumeAt ? (PHASE_TO_STEP[res.canResumeAt] ?? 1) : 1);
        setStep(target);
      } catch (err) {
        const e = classifyError(err);
        if (e.kind === "unauthorized") return; // apiClient handles redirect.
        setGlobalError(
          e.kind === "user"
            ? "We couldn't pick up where you left off. Starting fresh."
            : e.message
        );
      } finally {
        setLoadingState(false);
      }
    };
    run();
  }, [searchParams, setSearchParams, queryClient]);

  // Advance to a target step, optionally pinning a fresh domainId into the URL
  // so a refresh restores the right resume point.
  //
  // Side effect: strips ?fromSignup and ?prefillHost from the URL when we
  // advance past Step 1, so a refresh after Step 1 doesn't re-show the
  // welcome banner and doesn't re-prefill (we have the domain id now).
  const advanceTo = (target: WizardStep, id?: number) => {
    if (id) {
      setDomainId(id);
    }
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (id) next.set("domain", String(id));
        next.delete("googleCode");
        next.delete("googleMode");
        next.delete("google");
        if (target > 1) {
          next.delete("fromSignup");
          next.delete("prefillHost");
        }
        return next;
      },
      { replace: true }
    );
    setGlobalError(null);
    setStep(target);
  };

  useEffect(() => {
    const code = searchParams.get("googleCode");
    const mode = searchParams.get("googleMode");
    const error = searchParams.get("google");
    if (error) {
      setGlobalError(
        error === "not_found"
          ? "No account exists for that Google email."
          : "Google sign up failed. Please try again."
      );
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete("google");
          return next;
        },
        { replace: true }
      );
      return;
    }
    if (!code || mode !== "signup") return;
    if (handledGoogleCodeRef.current === code) return;
    handledGoogleCodeRef.current = code;

    let cancelled = false;
    const run = async () => {
      try {
        const result = await exchangeGoogleCode(code);
        if (cancelled) return;
        const primaryDomainId = result.wizardLink?.primaryDomainId ?? domainId ?? undefined;
        setSignupWallOpen(false);
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            next.delete("googleCode");
            next.delete("googleMode");
            if (primaryDomainId) next.set("domain", String(primaryDomainId));
            return next;
          },
          { replace: true }
        );
        advanceTo(5, primaryDomainId);
      } catch {
        if (cancelled) return;
        setGlobalError("Google sign up failed. Please try again.");
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            next.delete("googleCode");
            next.delete("googleMode");
            return next;
          },
          { replace: true }
        );
      }
    };
    run();

    return () => {
      cancelled = true;
    };
  }, [advanceTo, domainId, exchangeGoogleCode, searchParams, setSearchParams]);

  // Step-internal back navigation. We skip Step 2 (auto-only crawl page —
  // there's nothing to "go back to" on it) and route Step 3's Back to
  // Step 1 so the user can edit profile fields that drove the crawl.
  const goBack = (target: WizardStep) => {
    setGlobalError(null);
    setStep(target);
  };

  // Top-level retry for steps that auto-fire on mount. Bumping the nonce
  // remounts the step component, which re-runs its initial effect.
  const [retryNonce, setRetryNonce] = useState(0);
  const handleRetry = () => {
    setGlobalError(null);
    setRetryNonce((n) => n + 1);
  };

  // Per-step error handler so each step routes through the same classifier.
  const handleStepError = (
    err: unknown,
    fallbackStep: WizardStep,
    onUserMsg?: (msg: string) => void
  ) => {
    const e = classifyError(err);
    if (isSilentError(e)) return; // user-aborted — never noise the screen
    if (e.kind === "unauthorized") return; // apiClient handles re-auth redirect
    setGlobalError(e.message);
    if (onUserMsg) onUserMsg(e.message);
    setStep(fallbackStep);
  };

  const heading = HEADINGS[step];

  // Wire onBack per step. Step 1 has no "back" inside the wizard — the top
  // bar falls through to "Domain history" (an exit, not a back).
  const onBack: (() => void) | undefined =
    step === 3
      ? () => goBack(1) // skip Step 2 (auto crawl); send user to profile form
      : step === 4
        ? () => goBack(3)
        : step === 5
          ? () => goBack(4)
          : undefined;
  const backLabel =
    step === 3 ? "Edit details" : step === 4 ? "Back to competitors" : step === 5 ? "Back to prompts" : "Back";

  const retryableStep = step === 2 || step === 3 || step === 4 || step === 5;

  return (
    <WizardShell
      step={step}
      eyebrow={heading.eyebrow}
      heading={heading.heading}
      description={heading.description}
      onRetry={retryableStep ? handleRetry : undefined}
      onBack={onBack}
      backLabel={backLabel}
    >
      {/*
        Welcome banner for users arriving from the anonymous audit funnel.
        Shows on Step 1 only — once they advance, ?fromSignup=1 is dropped
        from the URL (advanceTo via setSearchParams) and the banner is
        gone. Uses dashboard design tokens (rounded-md border bg-green-50
        text-green-700) so it reads as a friendly confirmation, not an
        error.
      */}
      {searchParams.get("fromSignup") === "1" && step === 1 && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-md border border-green-100 bg-green-50/60 px-3 py-2.5 text-sm font-light text-green-700">
          <span>
            <span className="font-medium">Welcome.</span> Your domain
            {normalizedUrl ? (
              <>
                {' '}<span className="font-medium">{normalizedUrl.replace(/^https?:\/\//, '')}</span>
              </>
            ) : null}{' '}
            is attached to your new account. Add a few more details to
            finish your audit.
          </span>
        </div>
      )}
      {globalError && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-md border border-rose-100 bg-rose-50/60 px-3 py-2.5 text-sm text-rose-700">
          <span>{globalError}</span>
          <button
            type="button"
            onClick={() => setGlobalError(null)}
            className="text-rose-400 hover:text-rose-600 transition-colors"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}
      {loadingState ? (
        <p className="text-sm text-slate-500">Picking up where you left off…</p>
      ) : step === 1 ? (
        <Step1AddDomain
          initialUrl={normalizedUrl}
          initialProfile={profile}
          onContinue={({ normalizedUrl: u, profile: p, existingDomainId }) => {
            setNormalizedUrl(u);
            setProfile(p);
            if (searchParams.get("fromSignup") === "1") {
              try {
                localStorage.setItem("pendingAutoAuditRun", "1");
              } catch {
                // ignore storage failures
              }
            }
            // Step 1 form is committed — clear the sessionStorage draft.
            sessionStorage.removeItem(FORM_STORAGE_KEY);
            if (existingDomainId) {
              advanceTo(2, existingDomainId);
            } else {
              advanceTo(2);
            }
          }}
          onExistingDomain={(id) => {
            // User picked "View existing report" on the existing-domain prompt.
            navigate(`/ai-results/${id}`);
          }}
        />
      ) : step >= 2 ? (
        // Suspense boundary for the lazy Step 2–5 chunks. The fallback
        // mirrors the small "picking up where you left off" copy so the
        // user sees motion, not a flash of nothing.
        <Suspense fallback={<p className="text-sm text-slate-500">Loading step…</p>}>
          {step === 2 ? (
            <Step2Crawling
              key={`s2-${retryNonce}`}
              url={normalizedUrl}
              profile={profile}
              onComplete={(id) => advanceTo(3, id)}
              onError={(err) => handleStepError(err, 1)}
            />
          ) : step === 3 && domainId ? (
            <Step3Competitors
              key={`s3-${retryNonce}`}
              domainId={domainId}
              initialSelected={restoredCompetitors}
              forceRefresh={retryNonce > 0}
              onContinue={() => advanceTo(4)}
            />
          ) : step === 4 && domainId ? (
            <Step4SelectTopics
              key={`s4-${retryNonce}`}
              domainId={domainId}
              initialDraft={restoredDraft}
              forceRefresh={retryNonce > 0}
              onContinue={() => {
                // Anonymous callers can browse Steps 1-4 freely but Step 5
                // (the paid AI run) requires signup. Pop the wall here so
                // the user never sees the server-side 402 SIGNUP_REQUIRED.
                if (!user) {
                  setSignupWallOpen(true);
                  return;
                }
                advanceTo(5);
              }}
            />
          ) : step === 5 && domainId ? (
            <Step5RunQueries
              key={`s5-${retryNonce}`}
              domainId={domainId}
              onError={(err) => handleStepError(err, 4)}
            />
          ) : null}
        </Suspense>
      ) : null}
      {signupWallOpen && (
        <SignupWallModal
          host={normalizedUrl.replace(/^https?:\/\//, '') || undefined}
          onClose={() => setSignupWallOpen(false)}
          onRegistered={() => {
            // Backend's maybeLinkWizardSession has already transferred
            // Domain ownership from shadow user → real user. The Bearer
            // token is now in AuthContext / tokenManager, so the next
            // Step 5 request will carry it and the /run gate will pass.
            setSignupWallOpen(false);
            // Pass the domainId so advanceTo pins ?domain=N into the URL.
            // Without this, the URL stays bare (/audit) and a refresh
            // loses the resume target. The user thinks the wizard "lost
            // where I left off". With the id pinned, the existing
            // resume effect picks them back up at the right step.
            if (domainId) {
              advanceTo(5, domainId);
            } else {
              advanceTo(5);
            }
          }}
        />
      )}
    </WizardShell>
  );
}


