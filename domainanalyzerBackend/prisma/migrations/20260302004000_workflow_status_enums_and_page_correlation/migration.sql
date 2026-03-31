-- Add campaign page correlation for stable publish -> page mapping
ALTER TABLE "WordpressPublishLog"
ADD COLUMN IF NOT EXISTS "campaignPageId" INTEGER;

CREATE INDEX IF NOT EXISTS "WordpressPublishLog_campaignPageId_idx"
ON "WordpressPublishLog"("campaignPageId");

-- Create status enums if they do not exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'WordpressPublishStatus') THEN
    CREATE TYPE "WordpressPublishStatus" AS ENUM ('draft', 'generating', 'publishing', 'published', 'failed');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'GenerationJobStatus') THEN
    CREATE TYPE "GenerationJobStatus" AS ENUM ('pending', 'generating', 'completed', 'failed');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'GenerationJobPageStatus') THEN
    CREATE TYPE "GenerationJobPageStatus" AS ENUM ('pending', 'generating', 'completed', 'failed');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'N8nRequestStatus') THEN
    CREATE TYPE "N8nRequestStatus" AS ENUM ('pending', 'processing', 'completed', 'failed');
  END IF;
END $$;

-- Normalize legacy/null values before casting
UPDATE "WordpressPublishLog"
SET "status" = 'draft'
WHERE "status" IS NULL OR "status" NOT IN ('draft', 'generating', 'publishing', 'published', 'failed');

UPDATE "GenerationJob"
SET "status" = 'pending'
WHERE "status" IS NULL OR "status" NOT IN ('pending', 'generating', 'completed', 'failed');

UPDATE "GenerationJobPage"
SET "status" = 'pending'
WHERE "status" IS NULL OR "status" NOT IN ('pending', 'generating', 'completed', 'failed');

UPDATE "N8nRequest"
SET "status" = 'pending'
WHERE "status" IS NULL OR "status" NOT IN ('pending', 'processing', 'completed', 'failed');

-- Cast workflow status columns to enums
ALTER TABLE "WordpressPublishLog"
ALTER COLUMN "status" TYPE "WordpressPublishStatus" USING ("status"::"WordpressPublishStatus"),
ALTER COLUMN "status" SET DEFAULT 'draft',
ALTER COLUMN "status" SET NOT NULL;

ALTER TABLE "GenerationJob"
ALTER COLUMN "status" TYPE "GenerationJobStatus" USING ("status"::"GenerationJobStatus"),
ALTER COLUMN "status" SET DEFAULT 'pending',
ALTER COLUMN "status" SET NOT NULL;

ALTER TABLE "GenerationJobPage"
ALTER COLUMN "status" TYPE "GenerationJobPageStatus" USING ("status"::"GenerationJobPageStatus"),
ALTER COLUMN "status" SET DEFAULT 'pending',
ALTER COLUMN "status" SET NOT NULL;

ALTER TABLE "N8nRequest"
ALTER COLUMN "status" TYPE "N8nRequestStatus" USING ("status"::"N8nRequestStatus"),
ALTER COLUMN "status" SET DEFAULT 'pending',
ALTER COLUMN "status" SET NOT NULL;

-- Ensure deterministic one-row-per-page-per-job invariant
DELETE FROM "GenerationJobPage" AS a
USING "GenerationJobPage" AS b
WHERE a.id < b.id
  AND a."jobId" = b."jobId"
  AND a."pageId" = b."pageId";

CREATE UNIQUE INDEX IF NOT EXISTS "GenerationJobPage_jobId_pageId_key"
ON "GenerationJobPage"("jobId", "pageId");

