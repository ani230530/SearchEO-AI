import React from 'react';
import { X } from 'lucide-react';
import PublishExperience from '@/features/publish/PublishExperience';
import type { WordpressIntegration } from '@/types/publish';
import type { KeywordTableItem } from '@/types';

/**
 * Content-area overlay that hosts the legacy PublishExperience in its
 * `disablePreviewOverlay` (embedded) mode. Rendering it as an overlay —
 * rather than navigating to the Publish tab — keeps the user in the
 * worksheet context and preserves every preview/edit/publish feature
 * that already exists on the page.
 *
 * Positioning is `absolute inset-0`, so it covers the *content area* it
 * is mounted inside. The dashboard's sidebar stays visible because the
 * overlay sits inside `<main>` (which is offset by the sidebar width).
 * The parent must be `position: relative` for this to work.
 */
export interface WorksheetDraftOverlayProps {
  draftId: number | null;
  open: boolean;
  onClose: () => void;

  // Pass-through props PublishExperience needs to render correctly. These
  // mirror what the Publish tab already supplies; we just forward them.
  companyDomain?: string;
  domainContext?: string;
  keywordsTableData?: KeywordTableItem[];
  hasWordpressIntegration?: boolean;
  wpIntegration?: WordpressIntegration | null;
  onConfigureWordpress?: () => void;
  onRefreshWordpressIntegration?: () => Promise<void>;
  publishingPageIds?: Set<number>;
  setPublishingPageIds?: React.Dispatch<React.SetStateAction<Set<number>>>;
  draftToPageMap?: Map<number, number>;
  setDraftToPageMap?: React.Dispatch<React.SetStateAction<Map<number, number>>>;
  draftStatuses?: Map<
    number,
    { isPublished: boolean; isFailed?: boolean; publishedUrl?: string; draftId?: number; error?: string }
  >;
  setDraftStatuses?: React.Dispatch<
    React.SetStateAction<
      Map<
        number,
        { isPublished: boolean; isFailed?: boolean; publishedUrl?: string; draftId?: number; error?: string }
      >
    >
  >;
  sharedPublishStatuses?: Map<
    number,
    {
      status: 'generating' | 'published' | 'failed';
      publishedUrl?: string;
      wordpressPostId?: number | null;
      error?: string;
      updatedAt?: string;
    }
  >;
}

export default function WorksheetDraftOverlay({
  draftId,
  open,
  onClose,
  ...publishProps
}: WorksheetDraftOverlayProps) {
  if (!open || draftId === null) return null;

  return (
    <div className="absolute inset-0 z-40 overflow-y-auto bg-white">
      {/* Floating close button — PublishExperience's embedded header has its
          own back chevron, but we mount this here too so the overlay always
          has a visible close affordance regardless of inner state. */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close draft preview"
        className="absolute top-4 right-4 z-[1] inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 shadow-sm hover:bg-gray-50 hover:text-gray-700"
      >
        <X className="h-5 w-5" />
      </button>

      <PublishExperience
        {...publishProps}
        // Always treat the overlay as the active surface so the embedded
        // preview renders even though the Publish tab is not selected.
        isActive
        initialDraftId={draftId}
        disablePreviewOverlay
        onBack={onClose}
      />
    </div>
  );
}
