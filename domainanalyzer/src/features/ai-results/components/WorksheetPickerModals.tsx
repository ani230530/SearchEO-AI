// Shared worksheet picker + create dialogs.
//
// Used by both the AI Results dashboard (AIResultsReportPreview) and the
// Prompts page tracking table (PromptTrackingTable) so the "Add to Worksheet"
// / "Draft Blog" flow shows the same popup wherever it's triggered. Purely
// presentational — all orchestration (which rows, where to navigate) lives in
// the caller.

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { resolveDashboardPath } from "@/features/sidebar-dashboard/navigation";

// sessionStorage keys + path helper shared by every surface that hands a
// selection off to the worksheet/projects page.
export const WORKSHEET_IMPORT_KEY = "ai-results/pending-worksheet-import";
export const WORKSHEET_TARGET_KEY = "ai-results/pending-worksheet-target";
export const buildProjectsWorksheetPath = (campaignId: string | number) =>
  `${resolveDashboardPath("projects")}?campaign=${encodeURIComponent(String(campaignId))}`;

type WorksheetImportRow = {
  id: string;
  prompt: string;
  type: string | null;
  primaryKeyword: string | null;
  primaryIntent: string | null;
};

export type WorksheetImportPayload = {
  activeWorksheetId: string;
  selectedItemIds: string[];
  selectedRows: WorksheetImportRow[];
};

const writeStorageValue = (key: string, value: string) => {
  sessionStorage.setItem(key, value);
  localStorage.setItem(key, value);
};

const removeStorageValue = (key: string) => {
  sessionStorage.removeItem(key);
  localStorage.removeItem(key);
};

const readStorageValue = (key: string) => sessionStorage.getItem(key) ?? localStorage.getItem(key);

export const writeWorksheetHandoff = ({
  worksheetId,
  importPayload = null,
}: {
  worksheetId: string | number;
  importPayload?: WorksheetImportPayload | null;
}) => {
  writeStorageValue(WORKSHEET_TARGET_KEY, String(worksheetId));

  if (importPayload) {
    writeStorageValue(WORKSHEET_IMPORT_KEY, JSON.stringify(importPayload));
  } else {
    removeStorageValue(WORKSHEET_IMPORT_KEY);
  }
};

export const clearWorksheetHandoff = () => {
  removeStorageValue(WORKSHEET_TARGET_KEY);
  removeStorageValue(WORKSHEET_IMPORT_KEY);
};

export const clearWorksheetTarget = () => {
  removeStorageValue(WORKSHEET_TARGET_KEY);
};

export const readWorksheetTarget = () => readStorageValue(WORKSHEET_TARGET_KEY);

export const readWorksheetImportPayload = () => {
  const raw = readStorageValue(WORKSHEET_IMPORT_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as WorksheetImportPayload;
  } catch {
    clearWorksheetHandoff();
    return null;
  }
};

export const openWorksheetInNewTab = (
  worksheetId: string | number,
  importPayload: WorksheetImportPayload | null = null
) => {
  writeWorksheetHandoff({ worksheetId, importPayload });

  const openedTab = window.open(buildProjectsWorksheetPath(worksheetId), "_blank");
  if (!openedTab) {
    clearWorksheetHandoff();
  }

  return openedTab;
};

export const openWorksheetPlaceholderTab = () => window.open("about:blank", "_blank");

const DRAFT_OVERLAY_HANDOFF_KEY = "ai-results/pending-draft-overlay";

export type DraftOverlayHandoffPayload = {
  draftId: number;
};

export const writeDraftOverlayHandoff = ({ draftId }: DraftOverlayHandoffPayload) => {
  const payload = JSON.stringify({ draftId });
  writeStorageValue(DRAFT_OVERLAY_HANDOFF_KEY, payload);
};

export const clearDraftOverlayHandoff = () => {
  removeStorageValue(DRAFT_OVERLAY_HANDOFF_KEY);
};

export const readDraftOverlayHandoff = () => {
  const raw = readStorageValue(DRAFT_OVERLAY_HANDOFF_KEY);
  if (!raw) return null;

  try {
    const payload = JSON.parse(raw) as DraftOverlayHandoffPayload;
    if (typeof payload?.draftId !== "number" || Number.isNaN(payload.draftId)) {
      clearDraftOverlayHandoff();
      return null;
    }
    return payload;
  } catch {
    clearDraftOverlayHandoff();
    return null;
  }
};

export const openDraftOverlayInNewTab = (draftId: number) => {
  writeDraftOverlayHandoff({ draftId });
  const openedTab = window.open(window.location.href, "_blank");
  if (!openedTab) {
    clearDraftOverlayHandoff();
  }
  return openedTab;
};

export type WorksheetOption = {
  id: string;
  name: string;
  description: string | null;
};

type WorksheetPickerModalProps = {
  open: boolean;
  selectedCount: number;
  activeWorksheetId: string | null;
  worksheets: WorksheetOption[];
  loading?: boolean;
  onOpenChange: (open: boolean) => void;
  onWorksheetSelect: (id: string) => void;
  onAddToWorksheet: () => void;
  onCreateNewWorksheet: () => void;
};

type CreateWorksheetModalProps = {
  open: boolean;
  name: string;
  isSubmitting: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onNameChange: (value: string) => void;
  onSubmit: () => void;
};

export const WorksheetPickerModal = ({
  open,
  selectedCount,
  activeWorksheetId,
  worksheets,
  loading = false,
  onOpenChange,
  onWorksheetSelect,
  onAddToWorksheet,
  onCreateNewWorksheet,
}: WorksheetPickerModalProps) => {
  const addDisabled = !activeWorksheetId;
  const hasWorksheets = worksheets.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(920px,calc(100vw-1.5rem))] max-w-none overflow-hidden rounded-[28px] border border-[#E5E7EB] bg-white p-0 shadow-[0_20px_80px_rgba(15,23,42,0.22)]">
        <div className="flex max-h-[calc(100vh-2rem)] flex-col">
          <DialogHeader className="shrink-0 border-b border-[#E5E7EB] px-6 py-5 text-left">
            <DialogTitle className="text-[26px] font-semibold leading-[1.15] tracking-[-0.02em] text-[#1F2937]">
              Select worksheet
            </DialogTitle>
            <DialogDescription className="mt-2 text-sm leading-[150%] text-[#6B7280]">
              You are adding {selectedCount} item{selectedCount === 1 ? "" : "s"} to your worksheet.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            <div className="mb-4">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#2D4059]">
                Select a worksheet
              </p>
            </div>

            {hasWorksheets ? (
              <div className="flex flex-col gap-3">
                {worksheets.map((worksheet) => {
                  const isSelected = activeWorksheetId === worksheet.id;
                  return (
                    <button
                      key={worksheet.id}
                      type="button"
                      onClick={() => onWorksheetSelect(worksheet.id)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-2xl border px-4 py-4 text-left transition-all focus:outline-none focus:ring-2 focus:ring-[#2D4059] focus:ring-offset-2",
                        isSelected
                          ? "border-[#A8C4F6] bg-[#EEF4FF] shadow-[0_0_0_1px_rgba(94,129,230,0.18)]"
                          : "border-[#E5E7EB] bg-[#FAFAFA] hover:border-[#CBD5E1] hover:bg-white"
                      )}
                      aria-pressed={isSelected}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold leading-[150%] text-[#1F2937]">
                          {worksheet.name}
                        </p>
                        {worksheet.description ? (
                          <p className="mt-1 text-xs leading-[150%] text-[#6B7280]">
                            {worksheet.description}
                          </p>
                        ) : null}
                      </div>
                      <span
                        className={cn(
                          "ml-4 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px] leading-none",
                          isSelected
                            ? "border-[#2D4059] bg-[#2D4059] text-white"
                            : "border-[#CBD5E1] bg-white text-transparent"
                        )}
                        aria-hidden="true"
                      >
                        •
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : loading ? (
              <div className="rounded-2xl border border-dashed border-[#CBD5E1] bg-[#FAFAFA] p-6 text-sm text-[#6B7280]">
                Loading worksheets...
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-[#CBD5E1] bg-[#FAFAFA] p-6 text-sm text-[#6B7280]">
                No worksheets are available yet.
              </div>
            )}
          </div>

          <div className="shrink-0 border-t border-[#E5E7EB] bg-white px-6 py-4">
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={onCreateNewWorksheet}
                className="h-11 w-full rounded-xl border border-[#D5D7DA] bg-white px-5 text-sm font-medium text-[#344054] shadow-none hover:bg-[#F9FAFB] sm:w-[190px]"
              >
                Create New Worksheet
              </Button>
              <Button
                type="button"
                disabled={addDisabled}
                onClick={onAddToWorksheet}
                className={cn(
                  "h-11 w-full rounded-xl px-5 text-sm font-semibold shadow-none sm:w-[190px]",
                  addDisabled
                    ? "cursor-not-allowed border border-[#9CA0A7] bg-[#9CA0A7] text-white/80 hover:bg-[#9CA0A7]"
                    : "border border-[#2D4059] bg-[#2D4059] text-white hover:bg-[#24364d]"
                )}
              >
                Add to Worksheet
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export const CreateWorksheetModal = ({
  open,
  name,
  isSubmitting,
  error,
  onOpenChange,
  onNameChange,
  onSubmit,
}: CreateWorksheetModalProps) => {
  const disabled = isSubmitting || !name.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] rounded-2xl">
        <DialogHeader>
          <DialogTitle>Create New Worksheet</DialogTitle>
          <DialogDescription>
            Enter the project name.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Input
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="Worksheet name"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !disabled) onSubmit();
            }}
          />
          {error ? <p className="text-xs text-rose-600">{error}</p> : null}
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="button" onClick={onSubmit} disabled={disabled}>
            {isSubmitting ? "Creating..." : "Create Worksheet"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
