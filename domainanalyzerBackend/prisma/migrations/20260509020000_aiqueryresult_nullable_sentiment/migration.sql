-- Honest scoring: sentiment/accuracy/rankPosition are null when the brand
-- wasn't mentioned. Add a few new columns that the LLM scorer fills in.

ALTER TABLE "AiQueryResult"
  ALTER COLUMN "sentiment" DROP NOT NULL,
  ALTER COLUMN "sentiment" DROP DEFAULT;

ALTER TABLE "AiQueryResult"
  ADD COLUMN IF NOT EXISTS "accuracy" INTEGER,
  ADD COLUMN IF NOT EXISTS "rankPosition" INTEGER,
  ADD COLUMN IF NOT EXISTS "scorerSummary" TEXT,
  ADD COLUMN IF NOT EXISTS "factualClaims" JSONB;

-- Backfill: any existing row with presence=0 had a fake sentiment of 0 — clear it.
UPDATE "AiQueryResult" SET "sentiment" = NULL WHERE "presence" = 0;
