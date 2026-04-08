ALTER TABLE "WordpressPublishLog"
ADD COLUMN IF NOT EXISTS "wordpressPostId" INTEGER;
