import React from 'react';
import { Eye, FileText, Info, Loader2, Send } from 'lucide-react';
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
      return (
        <InfoHint message="The status of your article will show here once generation starts." />
      );

    case 'in-progress':
      return (
        <InfoHint message="The status of your article will show here once generation starts." />
      );

    case 'ready':
      return (
        <InfoHint message="The status of your article will show here once generation starts." />
      );

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

    case 'publishing':
      return <ProgressLine percent={100} label="Publishing…" color="bg-amber-500" />;

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

function InfoHint({ message }: { message: string }) {
  return (
    <div className="flex w-full justify-center">
      <span
        className="inline-flex items-center justify-center p-1"
        title={message}
        aria-label={message}
      >
        <Info className="h-4 w-4" />
      </span>
    </div>
  );
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
 *   generating                 → generation spinner
 *   completed                  → "Publish" enabled
 *   failed                     → "Retry" enabled (re-opens drawer)
 *   published                  → "Publish" / "Live" — keeping "Publish" until
 *                                a publish-flow is wired (next phase)
 * --------------------------------------------------------------------------*/

export interface RowActionHandlers {
  onGenerate: () => void;
  /** View / edit the draft. Opens the preview overlay in default mode. */
  onOpenDraft: (draftId: number) => void;
  /** One-click publish from the row. Opens the same overlay but with
   *  intent: 'publish' so the publish action auto-fires once the draft
   *  loads. The user can still cancel from inside the overlay. */
  onPublishDirectly: (draftId: number) => void;
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
          label="Generating…"
          disabled
          icon={<Loader2 className="h-4 w-4 animate-spin" />}
        />
      );

    case 'completed':
      return (
        <ActionPill
          label="Publish"
          onClick={() => handlers.onPublishDirectly(state.draftId)}
          disabled={draftSpinner}
          variant="primary"
          icon={<Send className="h-4 w-4" />}
        />
      );

    case 'publishing':
      return (
        <ActionPill
          label="Publishing…"
          disabled
          variant="primary"
          icon={<Loader2 className="h-4 w-4 animate-spin" />}
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
        <div className="inline-flex flex-col items-stretch gap-2">
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
          {state.liveUrl ? (
            <a
              href={state.liveUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-700 bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-800"
            >
              <Eye className="h-4 w-4" />
              <span>View Live</span>
            </a>
          ) : (
            <ActionPill
              label="View Live"
              disabled
              variant="primary"
              icon={<Eye className="h-4 w-4" />}
            />
          )}
        </div>
      );
  }
}

function ActionPill({
  label,
  onClick,
  disabled,
  icon,
  variant = 'secondary',
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  icon?: React.ReactNode;
  variant?: 'secondary' | 'primary';
}) {
  const styles =
    variant === 'primary'
      ? 'border-[#2D4059] bg-[#2D4059] text-white hover:bg-[#3a4f6f] disabled:hover:bg-[#2D4059]'
      : 'border-[#9db5e0] bg-[#f4f8ff] text-[#3c5e99] hover:bg-[#eaf1ff] disabled:hover:bg-[#f4f8ff]';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || !onClick}
      className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${styles}`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
