import React from 'react';
import { FileText, Loader2, Send } from 'lucide-react';
import { RowState } from './api';

/* ----------------------------------------------------------------------------
 * Status column
 *
 * Renders the percentage label + colored progress bar shown in the worksheet
 * status column. Driven entirely by RowState — no branching in the parent.
 * --------------------------------------------------------------------------*/

export function RowStatus({ state }: { state: RowState }) {
  switch (state.kind) {
    case 'not-started':
      return <Plain label="Not Started" />;

    case 'in-progress':
      return <Plain label="In Progress" />;

    case 'ready':
      return <Plain label="Ready" />;

    case 'generating':
      return (
        <ProgressLine
          percent={state.percent}
          label={state.phase === 'queued' ? 'Queued…' : 'Generating…'}
          color="bg-amber-500"
        />
      );

    case 'completed':
      return <ProgressLine percent={100} label="Completed" color="bg-emerald-600" />;

    case 'failed':
      return (
        <ProgressLine
          percent={state.percent}
          label="Error, Try Again"
          color="bg-red-600"
          tooltip={state.error}
        />
      );

    case 'published':
      return <ProgressLine percent={100} label="Published" color="bg-emerald-600" />;
  }
}

function Plain({ label }: { label: string }) {
  return (
    <div className="inline-flex items-center text-xs text-[#636f83]">{label}</div>
  );
}

function ProgressLine({
  percent,
  label,
  color,
  tooltip,
}: {
  percent: number;
  label: string;
  color: string;
  tooltip?: string;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div className="flex w-full max-w-[180px] flex-col gap-1.5" title={tooltip}>
      <div className="flex items-baseline gap-2">
        <span className="text-[15px] font-semibold text-[#1f2a3a] leading-none">
          {clamped}%
        </span>
        <span className="text-[11px] text-[#636f83]">{label}</span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-[#e3e6ee]">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * Action column
 *
 * Mirrors the screenshots:
 *   not-started / in-progress  → "Generate" disabled
 *   ready                      → "Generate" enabled (opens drawer)
 *   generating                 → "Draft Blog" disabled, spinner
 *   completed                  → "Draft Blog" enabled
 *   failed                     → "Retry" enabled (re-opens drawer)
 *   published                  → "Publish" / "Live" — keeping "Publish" until
 *                                a publish-flow is wired (next phase)
 * --------------------------------------------------------------------------*/

export interface RowActionHandlers {
  onGenerate: () => void;
  onOpenDraft: (draftId: number) => void;
  onRetry: () => void;
}

export function RowAction({
  state,
  handlers,
  isOpeningDraft = false,
}: {
  state: RowState;
  handlers: RowActionHandlers;
  /** True briefly between an "open draft" click and the drawer mounting,
   *  so the action button can render its own loading state. */
  isOpeningDraft?: boolean;
}) {
  // Spinner override: while a draft is being opened from THIS row, swap the
  // action's icon for a spinner and freeze interactions to acknowledge the
  // click immediately.
  const draftSpinner = isOpeningDraft && (state.kind === 'completed' || state.kind === 'published');

  switch (state.kind) {
    case 'not-started':
    case 'in-progress':
      return <ActionPill label="Generate" disabled icon={<FileText className="h-4 w-4" />} />;

    case 'ready':
      return (
        <ActionPill
          label="Generate"
          onClick={handlers.onGenerate}
          icon={<FileText className="h-4 w-4" />}
        />
      );

    case 'generating':
      return (
        <ActionPill
          label="Draft Blog"
          disabled
          icon={<Loader2 className="h-4 w-4 animate-spin" />}
        />
      );

    case 'completed':
      return (
        <ActionPill
          label="Draft Blog"
          onClick={() => handlers.onOpenDraft(state.draftId)}
          disabled={draftSpinner}
          icon={
            draftSpinner ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileText className="h-4 w-4" />
            )
          }
        />
      );

    case 'failed':
      return (
        <ActionPill
          label="Retry"
          onClick={handlers.onRetry}
          icon={<FileText className="h-4 w-4" />}
        />
      );

    case 'published':
      return (
        <ActionPill
          label="Publish"
          onClick={() => handlers.onOpenDraft(state.draftId)}
          disabled={draftSpinner}
          icon={
            draftSpinner ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )
          }
        />
      );
  }
}

function ActionPill({
  label,
  onClick,
  disabled,
  icon,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || !onClick}
      className={`inline-flex items-center gap-2 rounded-xl border border-[#9db5e0] bg-[#f4f8ff] px-5 py-2 text-sm font-medium text-[#3c5e99] transition hover:bg-[#eaf1ff] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-[#f4f8ff]`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
