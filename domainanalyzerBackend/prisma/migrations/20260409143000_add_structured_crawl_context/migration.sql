ALTER TABLE "Domain"
ADD COLUMN "contextJson" JSONB;

ALTER TABLE "CrawlResult"
ADD COLUMN "pageSnapshots" JSONB,
ADD COLUMN "crawlPolicy" JSONB,
ADD COLUMN "quality" JSONB,
ADD COLUMN "contextJson" JSONB;
