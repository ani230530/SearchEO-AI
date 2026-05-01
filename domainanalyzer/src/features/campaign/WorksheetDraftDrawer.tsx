import React, { useEffect, useState } from 'react';
import { Loader2, X, AlertCircle, ExternalLink } from 'lucide-react';
import { getDraft, WorksheetDraft } from './api';

/**
 * Draft preview drawer.
 *
 * Lifecycle:
 *   - opens immediately when `draftId` is set (parent toggles state)
 *   - shows a skeleton while fetching
 *   - renders title / meta / featured image / HTML body once loaded
 *   - surfaces fetch errors inline with a retry button
 *
 * The drawer is intentionally a viewer for V1. Edit / Publish actions can
 * be wired in a follow-up; the close button + draft fetch are the
 * foundation everything else layers on top of.
 */
export interface WorksheetDraftDrawerProps {
  draftId: number | null;
  open: boolean;
  onClose: () => void;
}

type FetchState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; draft: WorksheetDraft }
  | { kind: 'error'; message: string };

export default function WorksheetDraftDrawer({
  draftId,
  open,
  onClose,
}: WorksheetDraftDrawerProps) {
  const [state, setState] = useState<FetchState>({ kind: 'idle' });

  useEffect(() => {
    if (!open || draftId === null) return;
    let alive = true;
    setState({ kind: 'loading' });

    (async () => {
      try {
        const draft = await getDraft(draftId);
        if (!alive) return;
        setState({ kind: 'ready', draft });
      } catch (err) {
        if (!alive) return;
        setState({
          kind: 'error',
          message: err instanceof Error ? err.message : 'Failed to load draft',
        });
      }
    })();

    return () => {
      alive = false;
    };
  }, [open, draftId]);

  // Reset to idle when the drawer closes so the next open shows a fresh
  // skeleton instead of stale content.
  useEffect(() => {
    if (!open) setState({ kind: 'idle' });
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="relative ml-auto flex h-full w-full max-w-3xl flex-col bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-gray-100 px-8 py-5">
          <div className="min-w-0 flex-1">
            <div className="inline-flex items-center gap-2 rounded-full border border-black/10 px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-gray-500">
              Draft preview
            </div>
            <h2 className="mt-3 truncate text-2xl font-light tracking-tight text-gray-900">
              {state.kind === 'ready' ? state.draft.title || 'Untitled draft' : 'Loading…'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-4 rounded-md p-2 text-gray-500 hover:bg-gray-100"
            aria-label="Close draft"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {state.kind === 'loading' && <DraftSkeleton />}
          {state.kind === 'error' && (
            <DraftError message={state.message} onRetry={() => {
              if (draftId === null) return;
              setState({ kind: 'loading' });
              getDraft(draftId)
                .then((draft) => setState({ kind: 'ready', draft }))
                .catch((err) =>
                  setState({
                    kind: 'error',
                    message: err instanceof Error ? err.message : 'Failed to load draft',
                  })
                );
            }} />
          )}
          {state.kind === 'ready' && <DraftBody draft={state.draft} />}
        </div>
      </div>
    </div>
  );
}

/* ---------- Subcomponents ---------- */

function DraftSkeleton() {
  return (
    <div className="space-y-4 px-8 py-8" role="status" aria-live="polite">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading draft…
      </div>
      <div className="h-7 w-3/4 animate-pulse rounded-md bg-gray-100" />
      <div className="h-4 w-1/2 animate-pulse rounded-md bg-gray-100" />
      <div className="h-48 w-full animate-pulse rounded-md bg-gray-100" />
      <div className="space-y-2">
        <div className="h-3 w-full animate-pulse rounded-md bg-gray-100" />
        <div className="h-3 w-[95%] animate-pulse rounded-md bg-gray-100" />
        <div className="h-3 w-[88%] animate-pulse rounded-md bg-gray-100" />
        <div className="h-3 w-[92%] animate-pulse rounded-md bg-gray-100" />
      </div>
    </div>
  );
}

function DraftError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="px-8 py-12 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
        <AlertCircle className="h-6 w-6" />
      </div>
      <p className="mt-4 text-sm font-medium text-gray-900">Couldn't load this draft.</p>
      <p className="mt-1 text-sm text-gray-500">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-6 inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
      >
        Try again
      </button>
    </div>
  );
}

function DraftBody({ draft }: { draft: WorksheetDraft }) {
  return (
    <div className="px-8 py-6 space-y-6">
      {/* Meta */}
      <div className="space-y-3">
        {draft.metaDescription && (
          <p className="text-sm text-gray-600">{draft.metaDescription}</p>
        )}
        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
          {draft.primaryKeyword && (
            <span className="inline-flex items-center gap-1">
              <span className="text-gray-400">Primary:</span>
              <span className="font-medium text-gray-700">{draft.primaryKeyword}</span>
            </span>
          )}
          {draft.slug && (
            <span className="inline-flex items-center gap-1">
              <span className="text-gray-400">Slug:</span>
              <span className="font-mono text-gray-700">{draft.slug}</span>
            </span>
          )}
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
              draft.status === 'published'
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-blue-50 text-blue-700'
            }`}
          >
            {draft.status}
          </span>
          {draft.wordpressUrl && draft.status === 'published' && (
            <a
              href={draft.wordpressUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-blue-600 hover:underline"
            >
              View live <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>

      {/* Featured image */}
      {draft.featuredImageEnabled && draft.featuredImageUrl && (
        <img
          src={draft.featuredImageUrl}
          alt={draft.title || 'Featured'}
          className="w-full max-h-[320px] rounded-xl border border-gray-100 object-cover"
        />
      )}

      {/* HTML body */}
      <article
        className="prose prose-sm max-w-none prose-headings:font-medium prose-p:leading-relaxed"
        // The HTML comes from our own n8n pipeline + persisted backend; not
        // user-controlled. Rendering directly is the intended behavior.
        dangerouslySetInnerHTML={{ __html: draft.htmlContent || '' }}
      />
    </div>
  );
}
