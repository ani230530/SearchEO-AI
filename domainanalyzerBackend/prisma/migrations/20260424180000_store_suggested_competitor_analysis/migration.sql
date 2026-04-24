/*
  Warnings:

  - You are about to drop the columns `competitorDomain`, `name`, `reason`, and `type` on the `SuggestedCompetitor` table.
  - Existing SuggestedCompetitor rows are converted into a minimal `analysis` JSON payload before the old columns are removed.

*/

-- AlterTable
ALTER TABLE "SuggestedCompetitor"
ADD COLUMN "analysis" JSONB,
ADD COLUMN "tokenUsage" INTEGER,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill existing row-per-competitor data into the new analysis shape
UPDATE "SuggestedCompetitor"
SET "analysis" = jsonb_build_object(
  'competitors', jsonb_build_array(
    jsonb_build_object(
      'name', "name",
      'domain', "competitorDomain",
      'peerFitReason', "reason",
      'type', "type"
    )
  ),
  'marketInsights', jsonb_build_object(),
  'strategicRecommendations', jsonb_build_array(),
  'competitiveAnalysis', jsonb_build_object(
    'analysisType', 'standalone_peer'
  )
)
WHERE "analysis" IS NULL;

-- Ensure the new canonical payload is always present
ALTER TABLE "SuggestedCompetitor"
ALTER COLUMN "analysis" SET NOT NULL;

-- Remove old row-per-competitor fields
ALTER TABLE "SuggestedCompetitor"
DROP COLUMN "competitorDomain",
DROP COLUMN "name",
DROP COLUMN "reason",
DROP COLUMN "type";
