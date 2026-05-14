import { ArrowRight, Globe } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { DomainInfoEmptyProps } from "@/features/sidebar-dashboard/types";

/**
 * Domain Info empty state — shown when the user has no company domain
 * configured yet. Points them at the Website Audit tab where the inline
 * setup flow lives.
 *
 * Centered vertically in the available content area; uses the shadcn
 * Button + the dashed slate-50 card pattern shared with other empty
 * states (see DomainInfoContent's KeywordsEmpty) for design consistency.
 */
export function DomainInfoEmpty({ onGoToAudit }: DomainInfoEmptyProps) {
  return (
    <div className="flex min-h-[calc(100vh-160px)] w-full items-center justify-center px-4 py-8 sm:px-6">
      <div className="w-full max-w-md rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 px-8 py-12 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-slate-100">
          <Globe className="h-5 w-5 text-slate-500" />
        </div>
        <h2 className="mt-5 text-base font-semibold text-slate-900">No domain yet</h2>
        <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-slate-500">
          Audit your domain in{" "}
          <span className="font-medium text-slate-700">Website Audit</span> to
          populate the full domain info — context, competitors, and tracked
          keywords.
        </p>
        <Button size="sm" onClick={onGoToAudit} className="mt-6 gap-1.5">
          Go to Website Audit
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
