import { ReactNode, useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, LineChart, ListFilter, MoreVertical, RefreshCw } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
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
  eyebrow = "Get Started!",
  heading,
  description,
  onRetry,
  retryDisabled,
  onBack,
  backLabel = "Back",
  children,
}: WizardShellProps) {
  // Anonymous wizard runs (signup-after-audit funnel) have no Domain History
  // to go back to. Send those users to /auth instead; authenticated users
  // continue to fall back to their dashboard's Domain History tab.
  const { user } = useAuth();
  const fallbackBackTo = user ? "/dashboard?tab=domain-history" : "/auth";
  const fallbackBackLabel = user ? "Domain history" : "Sign in";

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
      <header className="relative z-10 mx-auto flex max-w-[96rem] items-center justify-between px-4 pt-5 sm:px-6 lg:px-10">
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
            to={fallbackBackTo}
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            {fallbackBackLabel}
          </Link>
        )}
        <StepPills current={step} total={totalSteps} />
      </header>

      <div className="relative z-10 mx-auto grid w-full max-w-[98rem] grid-cols-1 items-start gap-6 px-4 pb-10 pt-6 sm:px-6 md:grid-cols-2 md:gap-12 lg:gap-16 lg:px-10 lg:pb-14 lg:pt-8">
        {/* Left: form column. */}
        <div className="min-w-0">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="mb-1.5 text-[12px] font-medium tracking-tight text-blue-600/90">
                {eyebrow}
              </p>
              <h1 className="mb-2 text-[26px] font-semibold leading-[1.12] tracking-[-0.01em] text-slate-900 lg:text-[30px]">
                {heading}
              </h1>
              {description ? (
                <p className="max-w-md text-[12px] leading-relaxed text-slate-500">{description}</p>
              ) : null}
            </div>
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                disabled={retryDisabled}
                className="mt-1 inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                title="Retry this step"
              >
                <RefreshCw className={`h-3 w-3 ${retryDisabled ? "animate-spin" : ""}`} />
                Retry
              </button>
            ) : null}
          </div>

          {children}
        </div>

        {/* Right: hero image, blended into the white half via mix-blend.
            Sticky so it doesn't drift when long lists scroll on the left. */}
        <aside className="hidden md:block sticky top-20 self-start pointer-events-none">
          <WizardHeroVisual />
        </aside>
      </div>
    </div>
  );
}

function WizardHeroVisual() {
  return (
    <div
      className="relative mx-auto aspect-[1.03/1] w-full max-w-[47rem] select-none overflow-visible [container-type:inline-size]"
      aria-hidden
    >
      <div className="absolute inset-[4%] opacity-70">
        <div className="absolute left-1/2 top-0 h-full border-l border-dashed border-slate-200" />
        <div className="absolute left-0 top-1/2 w-full border-t border-dashed border-slate-200" />
        <div className="absolute left-[10%] top-[30%] h-px w-[78%] bg-slate-100" />
        <div className="absolute left-[10%] top-[42%] h-px w-[80%] bg-slate-100" />
        <div className="absolute left-[8%] top-[18%] h-[62%] w-px bg-slate-100" />
        <div className="absolute right-[8%] top-[20%] h-[56%] w-px bg-slate-100" />
        {[
          "left-[7%] top-[26%]",
          "left-[7%] top-[48%]",
          "left-[18%] top-[76%]",
          "left-[47%] top-[26%]",
          "right-[6%] top-[37%]",
          "right-[6%] top-[76%]",
          "left-[42%] top-[6%]",
        ].map((position) => (
          <span
            key={position}
            className={`absolute h-4 w-4 rounded-full border border-slate-200 bg-white ${position}`}
          />
        ))}
      </div>

      <div className="absolute left-[18%] top-[42%] aspect-[1.58/1] w-[80%] overflow-hidden rounded-[6px] border border-slate-200 bg-white shadow-[0_18px_44px_rgba(15,23,42,0.08)]">
        <img
          src="/ai-checker.png"
          alt=""
          className="h-full w-full scale-[1.72] object-cover object-[58%_61%] opacity-90"
          style={{ mixBlendMode: "multiply" }}
        />
      </div>

      <MetricCard
        className="right-[1%] top-[12%] w-[43%]"
        icon="list"
        title="Keywords Ranking"
        value="52"
        delta="+2"
      />
      <VisitorsCard />
      <MetricCard
        className="left-[38%] top-[92%] w-[45%]"
        icon="line"
        title="Organic Traffic"
        value="2,847"
        delta="+12.5%"
      />

      <CursorLabel className="left-[56%] top-[33%]" name="John Doe" color="blue" />
      <CursorLabel className="left-[2%] top-[69%]" name="Olivia Rhye" color="amber" />
    </div>
  );
}

function MetricCard({
  className,
  icon,
  title,
  value,
  delta,
}: {
  className: string;
  icon: "list" | "line";
  title: string;
  value: string;
  delta: string;
}) {
  const Icon = icon === "line" ? LineChart : ListFilter;
  const tone = icon === "line" ? "bg-emerald-100 text-emerald-700" : "bg-blue-50 text-slate-600";

  return (
    <div
      className={`absolute flex min-h-[clamp(4rem,11cqw,5rem)] min-w-0 items-center gap-[clamp(0.6rem,1.8cqw,1rem)] rounded-[6px] border border-slate-200 bg-white px-[clamp(0.8rem,2.5cqw,1.25rem)] py-[clamp(0.75rem,2.2cqw,1rem)] shadow-[0_14px_34px_rgba(15,23,42,0.08)] ${className}`}
    >
      <span className={`grid h-[clamp(2.25rem,6.5cqw,3rem)] w-[clamp(2.25rem,6.5cqw,3rem)] shrink-0 place-items-center rounded-full ${tone}`}>
        <Icon className="h-[clamp(1rem,2.8cqw,1.25rem)] w-[clamp(1rem,2.8cqw,1.25rem)] stroke-[2.2]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[clamp(0.55rem,1.55cqw,0.75rem)] leading-none text-slate-500">{title}</p>
        <p className="mt-[clamp(0.25rem,0.8cqw,0.375rem)] text-[clamp(1.15rem,3.4cqw,1.5rem)] font-semibold leading-none text-slate-900">{value}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[clamp(1rem,3.1cqw,1.375rem)] font-semibold leading-none text-green-600">{delta}</p>
        <p className="mt-[clamp(0.35rem,1.1cqw,0.5rem)] whitespace-nowrap text-[clamp(0.5rem,1.35cqw,0.6875rem)] leading-none text-slate-400">from last month</p>
      </div>
    </div>
  );
}

function VisitorsCard() {
  return (
    <div className="absolute left-[5%] top-[36%] w-[49%] min-w-0 rounded-[6px] border border-slate-200 bg-white px-[clamp(0.8rem,2.5cqw,1.25rem)] py-[clamp(0.75rem,2.2cqw,1rem)] shadow-[0_16px_42px_rgba(15,23,42,0.12)]">
      <div className="mb-[clamp(0.8rem,2.6cqw,1.25rem)] flex items-start justify-between">
        <p className="text-[clamp(0.65rem,1.7cqw,0.8125rem)] font-semibold text-slate-800">Total visitors</p>
        <MoreVertical className="h-[clamp(0.9rem,2.6cqw,1.25rem)] w-[clamp(0.9rem,2.6cqw,1.25rem)] text-slate-400" />
      </div>
      <div className="flex items-end justify-between gap-[clamp(0.6rem,2cqw,1rem)]">
        <div className="min-w-0">
          <p className="text-[clamp(1.65rem,5.1cqw,2.25rem)] font-semibold leading-none tracking-tight text-slate-900">2,420</p>
          <p className="mt-[clamp(0.45rem,1.6cqw,0.75rem)] flex items-center gap-[clamp(0.25rem,0.9cqw,0.375rem)] whitespace-nowrap text-[clamp(0.65rem,1.85cqw,0.875rem)] text-slate-500">
            <span className="font-semibold text-emerald-600">+ 40%</span>
            vs last month
          </p>
        </div>
        <svg viewBox="0 0 120 58" className="h-[clamp(2.5rem,8.5cqw,4rem)] w-[42%] shrink-0 overflow-visible">
          <path
            d="M2 55 C18 26 28 44 38 24 S56 35 63 18 S78 27 86 10 S101 20 118 14"
            fill="none"
            stroke="#10b981"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="3"
          />
          <circle cx="63" cy="18" r="4" fill="#fff" stroke="#10b981" strokeWidth="2" />
        </svg>
      </div>
    </div>
  );
}

function CursorLabel({
  className,
  name,
  color,
}: {
  className: string;
  name: string;
  color: "blue" | "amber";
}) {
  const swatch = color === "blue" ? "bg-sky-500" : "bg-amber-500";

  return (
    <div className={`absolute ${className}`}>
      <div
        className={`h-0 w-0 rotate-[-42deg] border-b-[16px] border-l-[9px] border-r-[9px] border-l-transparent border-r-transparent ${
          color === "blue" ? "border-b-sky-500" : "border-b-amber-500"
        } drop-shadow-[0_1px_2px_rgba(15,23,42,0.35)]`}
      />
      <span className={`mt-2 inline-block px-1.5 py-0.5 text-[13px] leading-tight text-white ${swatch}`}>
        {name}
      </span>
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
