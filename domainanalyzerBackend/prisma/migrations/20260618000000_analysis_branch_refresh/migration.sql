-- Branch-aware analysis refreshes.

ALTER TABLE "Domain"
ADD COLUMN IF NOT EXISTS "currentAnalysisFingerprint" TEXT,
ADD COLUMN IF NOT EXISTS "analysisRefreshLockedUntil" TIMESTAMP(3);

ALTER TABLE "AiRun"
ADD COLUMN IF NOT EXISTS "analysisFingerprint" TEXT,
ADD COLUMN IF NOT EXISTS "analysisSnapshot" JSONB;

CREATE INDEX IF NOT EXISTS "AiRun_domainId_analysisFingerprint_status_startedAt_idx"
ON "AiRun"("domainId", "analysisFingerprint", "status", "startedAt");
