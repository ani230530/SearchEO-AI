import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { WizardStep } from "./types";

interface WizardShellProps {
  step: WizardStep;
  totalSteps?: number;
  eyebrow?: string;
  heading: string;
  description?: string;
  children: ReactNode;
}

export function WizardShell({
  step,
  totalSteps = 5,
  eyebrow = "Get to know us",
  heading,
  description,
  children,
}: WizardShellProps) {
  const dots = Array.from({ length: totalSteps }).map((_, i) => i + 1);
  return (
    <div className="flex min-h-screen w-full flex-col bg-[#f5f5f7] text-slate-900 lg:flex-row lg:items-stretch">
      <aside className="flex w-full flex-col bg-[#f9f9f9] px-6 py-12 lg:w-[44%] lg:px-[107px] lg:py-32">
        <div className="flex max-w-[568px] flex-col gap-12 self-center lg:self-start">
          <div className="flex h-2 items-center gap-[3px]">
            {dots.map((n) => (
              <div
                key={n}
                className={cn(
                  "h-full flex-1 rounded-full",
                  n <= step ? "bg-[#7e9bd7]" : "bg-[#71768042]"
                )}
              />
            ))}
          </div>

          <div className="flex flex-col gap-3">
            <p className="text-[16px] font-semibold leading-6 text-[#618eed]">{eyebrow}</p>
            <h1 className="text-[36px] font-semibold leading-[44px] tracking-[-0.022em] text-[#414651]">
              {heading}
            </h1>
            {description ? (
              <p className="text-[16px] leading-6 text-[#717680]">{description}</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-8">{children}</div>
        </div>
      </aside>

      <main className="hidden lg:block lg:flex-1 lg:bg-white" aria-hidden>
        <div className="flex h-full items-center justify-center px-12">
          <div className="max-w-[640px] rounded-2xl border border-black/5 bg-white p-10 shadow-[0_12px_40px_rgba(10,13,18,0.06)]">
            <p className="text-sm font-semibold text-[#618eed]">searcheo.ai</p>
            <p className="mt-3 text-[28px] font-semibold leading-[36px] tracking-[-0.022em] text-[#181d27]">
              Audit how AI search engines see your brand.
            </p>
            <p className="mt-4 text-sm leading-6 text-[#717680]">
              We crawl your site, find the right peer competitors, generate the questions real
              users ask AI, then test how each model responds.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
