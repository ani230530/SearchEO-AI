-- Reconcile schema drift caused by manual DB changes that were not captured in migration history.
-- This migration is intentionally idempotent so it is safe on databases where these changes already exist.

-- Domain.googleAnalyticsId
ALTER TABLE "Domain"
ADD COLUMN IF NOT EXISTS "googleAnalyticsId" TEXT;

-- WordpressPublishLog correlation fields from 20260302000100 (manually present in DB)
ALTER TABLE "WordpressPublishLog"
ADD COLUMN IF NOT EXISTS "generationJobId" TEXT,
ADD COLUMN IF NOT EXISTS "generationPageId" INTEGER,
ADD COLUMN IF NOT EXISTS "normalizedPrimaryKeyword" TEXT;

CREATE INDEX IF NOT EXISTS "WordpressPublishLog_generationJobId_idx"
ON "WordpressPublishLog"("generationJobId");

CREATE INDEX IF NOT EXISTS "WordpressPublishLog_generationJobId_normalizedPrimaryKeyword_idx"
ON "WordpressPublishLog"("generationJobId", "normalizedPrimaryKeyword");

CREATE INDEX IF NOT EXISTS "WordpressPublishLog_generationPageId_idx"
ON "WordpressPublishLog"("generationPageId");

-- WordpressPublishLog.updatedAt
ALTER TABLE "WordpressPublishLog"
ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CampaignPage.latestDraftId
ALTER TABLE "CampaignPage"
ADD COLUMN IF NOT EXISTS "latestDraftId" INTEGER;

-- CampaignPage.latestDraftId -> WordpressPublishLog.id (optional relation)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'CampaignPage_latestDraftId_fkey'
  ) THEN
    ALTER TABLE "CampaignPage"
    ADD CONSTRAINT "CampaignPage_latestDraftId_fkey"
    FOREIGN KEY ("latestDraftId")
    REFERENCES "WordpressPublishLog"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
  END IF;
END $$;
