import React from 'react';
import { Clock3, ChevronDown, Eye, FileText, Info, Loader2, Send } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
  onScheduleBlog: (draftId: number, title: string, existingScheduledAtIso?: string) => void;
  onCancelSchedule: (draftId: number) => void;
  onRetry: () => void;
}

export function RowAction({
  state,
  handlers,
  topicTitle = '',
  scheduledInfo = null,
  isOpeningDraft = false,
}: {
  state: RowState;
  handlers: RowActionHandlers;
  topicTitle?: string;
  scheduledInfo?: {
    scheduledAtIso: string;
    scheduledAtLabel: string;
  } | null;
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
      if (scheduledInfo) {
        return (
          <ScheduledPublishState
            scheduledAtLabel={scheduledInfo.scheduledAtLabel}
            onCancel={() => handlers.onCancelSchedule(state.draftId)}
            onReschedule={() =>
              handlers.onScheduleBlog(state.draftId, topicTitle, scheduledInfo.scheduledAtIso)
            }
          />
        );
      }

      return (
        <PublishDropdown
          disabled={draftSpinner}
          onPublishNow={() => handlers.onPublishDirectly(state.draftId)}
          onScheduleBlog={() => handlers.onScheduleBlog(state.draftId, topicTitle)}
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

function PublishDropdown({
  disabled,
  onPublishNow,
  onScheduleBlog,
}: {
  disabled?: boolean;
  onPublishNow: () => void;
  onScheduleBlog: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="inline-flex h-11 min-w-[150px] items-center justify-between gap-3 rounded-[20px] bg-[#2D4059] px-4 text-sm font-medium text-white shadow-sm transition hover:bg-[#243449] disabled:cursor-not-allowed disabled:bg-[#94a3b8] disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-[#4C74C2] focus:ring-offset-2"
        >
          <span className="inline-flex items-center gap-2">
            <Send className="h-4 w-4" />
            <span>Publish</span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="bottom"
        sideOffset={10}
        className="min-w-[252px] rounded-[20px] border border-[#c7d4e8] bg-[#d8e3f2] p-2 shadow-[0_18px_40px_rgba(45,64,89,0.18)]"
      >
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            onScheduleBlog();
          }}
          className="flex cursor-pointer items-center gap-3 rounded-[16px] px-4 py-3 text-[17px] font-medium text-[#2f4667] outline-none transition-colors focus:bg-[#c8d7ec] focus:text-[#243b5a] data-[highlighted]:bg-[#c8d7ec]"
        >
          <Clock3 className="h-5 w-5" />
          <span>Schedule Blog</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator className="my-1.5 bg-white/70" />
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            onPublishNow();
          }}
          className="flex cursor-pointer items-center gap-3 rounded-[16px] px-4 py-3 text-[17px] font-medium text-[#2f4667] outline-none transition-colors focus:bg-[#c8d7ec] focus:text-[#243b5a] data-[highlighted]:bg-[#c8d7ec]"
        >
          <Send className="h-5 w-5" />
          <span>Publish Now</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ScheduledPublishState({
  scheduledAtLabel,
  onCancel,
  onReschedule,
}: {
  scheduledAtLabel: string;
  onCancel: () => void;
  onReschedule: () => void;
}) {
  return (
    <div className="inline-flex w-full max-w-[280px] flex-col gap-3 rounded-[20px] border border-[#c7d4e8] bg-[#edf3fb] p-3 text-left shadow-sm">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-[#2D4059] shadow-sm">
          <Clock3 className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#5b6f8d]">
            Scheduled
          </p>
          <p className="mt-1 text-sm font-semibold leading-5 text-[#243b5a]">{scheduledAtLabel}</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex h-9 flex-1 items-center justify-center rounded-xl border border-[#c8d4e7] bg-white px-3 text-xs font-semibold text-[#415a7a] transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#4C74C2] focus:ring-offset-2"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onReschedule}
          className="inline-flex h-9 flex-1 items-center justify-center rounded-xl bg-[linear-gradient(90deg,#2D4059_0%,#4C74C2_100%)] px-3 text-xs font-semibold text-white transition hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-[#4C74C2] focus:ring-offset-2"
        >
          Reschedule
        </button>
      </div>
    </div>
  );
}
