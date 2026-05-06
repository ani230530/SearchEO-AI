-- Worksheet generation job progress tracking.
-- Additive only: adds four columns + an index. No row deletes, no column drops.

ALTER TABLE "GenerationJob"
  ADD COLUMN "progress" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "phase"    TEXT,
  ADD COLUMN "error"    TEXT,
  ADD COLUMN "draftId"  INTEGER;

CREATE INDEX "GenerationJob_userId_status_idx" ON "GenerationJob" ("userId", "status");
