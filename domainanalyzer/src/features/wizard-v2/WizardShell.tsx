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
 * Two-column layout matching the previous wizard exactly:
 *   - slate gradient background
 *   - left half: form column (passed in via children)
 *   - right half: /ai-checker.png hero image
 *   - no top progress bar (each step's SSE loader lives inline)
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
        <div className="w-1/2 max-w-none">
          <div className="mb-8">
            <p className="text-sm font-medium text-blue-600 mb-2">{eyebrow}</p>
            <h1 className="text-4xl font-bold text-slate-900 mb-3">{heading}</h1>
            {description ? (
              <p className="text-slate-600 text-sm leading-relaxed">{description}</p>
            ) : null}
          </div>

          {children}
        </div>

        <div className="w-1/2 space-y-6">
          <div className="mb-6">
            <img
              src="/ai-checker.png"
              alt="AI Checker"
              className="w-full h-auto rounded-lg shadow-sm"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
