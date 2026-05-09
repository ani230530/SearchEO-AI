-- Add archivedAt to Prompt and Keyword so re-audits can preserve audit
-- history (AiQueryResult cascade-delete previously destroyed it).
-- The wizard picker filters archivedAt IS NULL; the Track pages' /history
-- endpoint ignores archivedAt so trend charts can roll up across runs.

ALTER TABLE "Prompt"  ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);
ALTER TABLE "Keyword" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Prompt_domainId_archivedAt_idx"  ON "Prompt"  ("domainId", "archivedAt");
CREATE INDEX IF NOT EXISTS "Keyword_domainId_archivedAt_idx" ON "Keyword" ("domainId", "archivedAt");
