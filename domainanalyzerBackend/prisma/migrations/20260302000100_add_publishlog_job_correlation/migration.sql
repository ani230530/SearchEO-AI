-- AlterTable
ALTER TABLE "WordpressPublishLog"
ADD COLUMN "generationJobId" TEXT,
ADD COLUMN "generationPageId" INTEGER,
ADD COLUMN "normalizedPrimaryKeyword" TEXT;

-- CreateIndex
CREATE INDEX "WordpressPublishLog_generationJobId_idx" ON "WordpressPublishLog"("generationJobId");

-- CreateIndex
CREATE INDEX "WordpressPublishLog_generationJobId_normalizedPrimaryKeyword_idx" ON "WordpressPublishLog"("generationJobId", "normalizedPrimaryKeyword");

-- CreateIndex
CREATE INDEX "WordpressPublishLog_generationPageId_idx" ON "WordpressPublishLog"("generationPageId");
