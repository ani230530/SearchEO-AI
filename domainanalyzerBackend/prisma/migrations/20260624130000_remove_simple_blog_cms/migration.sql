-- Remove the standalone simple blog CMS workflow.

DROP INDEX IF EXISTS "Post_status_publishedAt_idx";
DROP INDEX IF EXISTS "Post_slug_key";
DROP TABLE IF EXISTS "Post";
DROP TYPE IF EXISTS "PostStatus";
