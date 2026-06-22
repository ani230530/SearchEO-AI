ALTER TABLE "AiQueryResult"
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'success',
  ADD COLUMN "errorMessage" TEXT;

CREATE INDEX "AiQueryResult_runId_status_idx" ON "AiQueryResult"("runId", "status");
