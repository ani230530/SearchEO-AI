ALTER TABLE "WordpressPublishLog"
  ADD COLUMN "scheduledAt" TIMESTAMP(3),
  ADD COLUMN "publishedAt" TIMESTAMP(3);

CREATE INDEX "WordpressPublishLog_status_scheduledAt_idx"
  ON "WordpressPublishLog"("status", "scheduledAt");
