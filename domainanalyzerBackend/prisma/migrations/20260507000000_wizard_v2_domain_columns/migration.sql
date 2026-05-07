-- Wizard v2 — additive columns on Domain
-- Step 1 user-supplied profile + crawl-inferred size + per-step state.
-- All nullable; existing rows untouched.

ALTER TABLE "Domain"
  ADD COLUMN IF NOT EXISTS "country"             TEXT,
  ADD COLUMN IF NOT EXISTS "state"               TEXT,
  ADD COLUMN IF NOT EXISTS "industry"            TEXT,
  ADD COLUMN IF NOT EXISTS "companySize"         TEXT,
  ADD COLUMN IF NOT EXISTS "customSeeds"         JSONB,
  ADD COLUMN IF NOT EXISTS "selectedCompetitors" JSONB,
  ADD COLUMN IF NOT EXISTS "selectionDraft"      JSONB;
