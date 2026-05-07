import { ReactNode } from "react";
import type { WizardStep } from "./types";

interface WizardShellProps {
  step: WizardStep;
  totalSteps?: number;
  eyebrow?: string;
  heading: string;
  description?: string;
  children: ReactNode;
}

/**
 * Lean layout — slate gradient background, full-width form column.
 * No top progress bar (per user direction). Each step's own
 * SSE-driven progress UI lives inside the step component itself.
 */
export function WizardShell({
  eyebrow = "Get to know us",
  heading,
  description,
  children,
}: WizardShellProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="flex gap-12 px-6 py-12 max-w-7xl mx-auto">
        <div className="w-full max-w-2xl">
          <div className="mb-8">
            <p className="text-sm font-medium text-blue-600 mb-2">{eyebrow}</p>
            <h1 className="text-4xl font-bold text-slate-900 mb-3">{heading}</h1>
            {description ? (
              <p className="text-slate-600 text-sm leading-relaxed">{description}</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-6">{children}</div>
        </div>
      </div>
    </div>
  );
}
