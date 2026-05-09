-- Track citations + per-competitor mentions on each AiQueryResult so the
-- results UI can surface real numbers per prompt × model row.
ALTER TABLE "AiQueryResult"
  ADD COLUMN IF NOT EXISTS "citations" JSONB,
  ADD COLUMN IF NOT EXISTS "competitorMentions" JSONB;
