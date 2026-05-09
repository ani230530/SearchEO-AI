import { ReactNode, useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, RefreshCw } from "lucide-react";
import type { WizardStep } from "./types";

interface WizardShellProps {
  step: WizardStep;
  totalSteps?: number;
  eyebrow?: string;
  heading: string;
  description?: string;
  /** Optional retry handler for the current step. Renders a subtle ghost button next to the heading. */
  onRetry?: () => void;
  /** Disable retry while the step is mid-stream. */
  retryDisabled?: boolean;
  /**
   * Step-level back handler. When provided, the top-bar link uses this and
   * shows `backLabel`; otherwise it falls back to the dashboard exit link.
   */
  onBack?: () => void;
  backLabel?: string;
  children: ReactNode;
}

/**
 * Wizard chrome.
 *
 *   ┌──────────────────────────────────────────────────────────────────┐
 *   │ [back] · · · · ·                                                  │  ← top bar (fixed)
 *   ├─────────────────────────────────┬────────────────────────────────┤
 *   │                                 │                                │
 *   │  blue-tinted soft gradient      │   white half — hero image      │
 *   │  ↳ form column                  │   blended into the canvas      │
 *   │                                 │                                │
 *   └─────────────────────────────────┴────────────────────────────────┘
 *
 * Two halves of the page have different background washes (left = soft
 * slate/blue gradient, right = white) so the form column reads as the
 * "active" side and the hero on the right reads as decorative context.
 *
 * The step indicator is a row of small pills (filled = completed/current,
 * empty = upcoming) — replaces the "Step N of N" label which felt clinical.
 */
export function WizardShell({
  step,
  totalSteps = 5,
  eyebrow = "Get to know us",
  heading,
  description,
  onRetry,
  retryDisabled,
  onBack,
  backLabel = "Back",
  children,
}: WizardShellProps) {
  // Hide the document scrollbar while the wizard is mounted so the canvas
  // stays uninterrupted; restored on unmount for the rest of the app.
  useEffect(() => {
    document.documentElement.classList.add("no-scrollbar");
    document.body.classList.add("no-scrollbar");
    return () => {
      document.documentElement.classList.remove("no-scrollbar");
      document.body.classList.remove("no-scrollbar");
    };
  }, []);

  return (
    <div className="relative min-h-screen w-full bg-white">
      {/* Two-tone canvas — much softer than before. The left half just gets
          a faint slate wash with a barely-there blue tint at the corner;
          the right half stays clean white. Goal: feels premium, not
          decorated. */}
      <div
        className="pointer-events-none absolute inset-0 hidden lg:block"
        aria-hidden
        style={{
          background:
            "linear-gradient(90deg, rgba(248, 250, 252, 0.9) 0%, rgba(248, 250, 252, 0.6) 35%, rgba(255, 255, 255, 1) 50%, rgba(255, 255, 255, 1) 100%)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-y-0 left-0 hidden w-1/2 lg:block"
        aria-hidden
        style={{
          background:
            "radial-gradient(ellipse 600px 400px at 15% -10%, rgba(191, 219, 254, 0.18) 0%, rgba(241, 245, 249, 0) 70%)",
        }}
      />

      {/* Top bar — back control on the left, segmented step pills on the
          right. Sits above the two columns so it survives any column
          scrolling without drifting. */}
      <header className="relative z-10 px-6 pt-6 max-w-7xl mx-auto flex items-center justify-between">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            {backLabel}
          </button>
        ) : (
          <Link
            to="/dashboard?tab=domain-history"
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Domain history
          </Link>
        )}
        <StepPills current={step} total={totalSteps} />
      </header>

      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-2 px-6 pt-10 pb-16 max-w-7xl mx-auto items-start gap-10 lg:gap-16">
        {/* Left: form column. */}
        <div className="min-w-0">
          <div className="mb-8 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-blue-600/90 mb-2 tracking-tight">
                {eyebrow}
              </p>
              <h1 className="text-[32px] leading-[1.15] font-semibold text-slate-900 mb-3 tracking-[-0.01em] lg:text-[36px]">
                {heading}
              </h1>
              {description ? (
                <p className="text-[14px] text-slate-500 leading-relaxed max-w-md">{description}</p>
              ) : null}
            </div>
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                disabled={retryDisabled}
                className="mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                title="Retry this step"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${retryDisabled ? "animate-spin" : ""}`} />
                Retry
              </button>
            ) : null}
          </div>

          {children}
        </div>

        {/* Right: hero image, blended into the white half via mix-blend.
            Sticky so it doesn't drift when long lists scroll on the left. */}
        <aside className="hidden lg:block sticky top-24 self-start">
          <img
            src="/ai-checker.png"
            alt=""
            aria-hidden
            className="w-full h-auto select-none pointer-events-none"
            style={{ mixBlendMode: "multiply" }}
          />
        </aside>
      </div>
    </div>
  );
}

/**
 * Tiny segmented progress indicator. One pill per step:
 *   - filled blue for the current step
 *   - filled slate for steps already completed
 *   - empty grey for steps still to come
 * Shorter than a literal "Step 1 of 5" label, blends with the canvas.
 */
function StepPills({ current, total }: { current: number; total: number }) {
  const pills = Array.from({ length: total }, (_, i) => i + 1);
  return (
    <div className="flex items-center gap-1.5" aria-label={`Step ${current} of ${total}`}>
      {pills.map((n) => {
        const state = n < current ? "done" : n === current ? "active" : "todo";
        return (
          <span
            key={n}
            className={`h-1.5 w-7 rounded-full transition-colors ${
              state === "active"
                ? "bg-blue-500"
                : state === "done"
                  ? "bg-slate-400"
                  : "bg-slate-200"
            }`}
          />
        );
      })}
    </div>
  );
}

/**
 * Inline status row for long-running steps — pulsing dot + plain message,
 * lives flat on the canvas (no card, no border, no progress bar) so each
 * step's loading state blends with the wizard chrome.
 */
export function WizardStatusRow({
  message,
  done,
  subtle,
}: {
  message: string;
  done?: boolean;
  /** Secondary muted line below the main message. */
  subtle?: string;
}) {
  return (
    <div className="flex flex-col gap-2 py-4">
      <div className="flex items-center gap-3">
        {done ? (
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
        ) : (
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75 animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
          </span>
        )}
        <p className="text-[15px] font-medium text-slate-700">{message}</p>
      </div>
      {subtle ? (
        <p className="text-[13px] text-slate-500 leading-relaxed pl-5">{subtle}</p>
      ) : null}
    </div>
  );
}
