-- Audit-research metadata on Prompt rows. Drives category-weighted scoring
-- on the dashboard (Soar / Profound / Ahrefs taxonomy).

ALTER TABLE "Prompt"
  ADD COLUMN IF NOT EXISTS "category" TEXT,
  ADD COLUMN IF NOT EXISTS "intentStage" TEXT,
  ADD COLUMN IF NOT EXISTS "persona" TEXT,
  ADD COLUMN IF NOT EXISTS "useCase" TEXT,
  ADD COLUMN IF NOT EXISTS "constraint" TEXT,
  ADD COLUMN IF NOT EXISTS "isBranded" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "competitorMentioned" TEXT;

CREATE INDEX IF NOT EXISTS "Prompt_domainId_category_idx" ON "Prompt"("domainId", "category");
