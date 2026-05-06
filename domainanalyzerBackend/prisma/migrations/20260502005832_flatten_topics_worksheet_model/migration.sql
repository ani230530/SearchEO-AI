-- ============================================================================
-- Worksheet flat topic model
-- ============================================================================
-- Refactor from {Topic -> (Pillar Page + N Subpages)} to {Topic-as-content-unit}.
-- Each former subpage becomes its own sibling topic. Each topic's title is
-- rewritten to its corresponding page's title (the pre-existing topic-level
-- title is discarded).
--
-- DATA-PRESERVING: this migration adds columns and copies data. It does not
-- DROP any tables, columns, or rows. CampaignPage / GenerationJobPage rows
-- remain in place as a frozen archive; application code stops reading them.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Add new columns
-- ----------------------------------------------------------------------------

ALTER TABLE "CampaignTopic"
  ADD COLUMN     "summary"            TEXT,
  ADD COLUMN     "aiSummary"          TEXT,
  ADD COLUMN     "latestDraftId"      INTEGER,
  ADD COLUMN     "archivedFromPageId" INTEGER;

ALTER TABLE "WordpressPublishLog"
  ADD COLUMN     "generationTopicId"  INTEGER;

-- ----------------------------------------------------------------------------
-- 2. Backfill the existing topic from its pillar page (data is COPIED,
--    not moved — the CampaignPage row stays untouched).
--    Title rewrite: topic.title <- pillar.title.
-- ----------------------------------------------------------------------------

UPDATE "CampaignTopic" t SET
  "title"         = COALESCE(p."title",     t."title"),
  "summary"       = COALESCE(t."summary",   p."summary"),
  "aiSummary"     = COALESCE(t."aiSummary", p."aiSummary"),
  "latestDraftId" = p."latestDraftId"
FROM "CampaignPage" p
WHERE p."topicId" = t."id"
  AND p."pageType" = 'PILLAR';

-- ----------------------------------------------------------------------------
-- 3. For every legacy subpage, create a new sibling topic carrying its data.
--    Order is appended at the end of the campaign's existing topic list.
-- ----------------------------------------------------------------------------

WITH max_orders AS (
  SELECT "campaignId", COALESCE(MAX("order"), 0) AS max_order
  FROM "CampaignTopic"
  GROUP BY "campaignId"
),
ranked_subpages AS (
  SELECT
    sp.*,
    parent."campaignId"           AS parent_campaign_id,
    ROW_NUMBER() OVER (
      PARTITION BY parent."campaignId"
      ORDER BY parent."order", sp."order", sp."id"
    ) AS sub_rank
  FROM "CampaignPage" sp
  JOIN "CampaignTopic" parent ON parent."id" = sp."topicId"
  WHERE sp."pageType" = 'SUBPAGE'
)
INSERT INTO "CampaignTopic" (
  "campaignId",
  "title",
  "description",
  "summary",
  "aiSummary",
  "status",
  "source",
  "order",
  "aiMetadata",
  "createdAt",
  "updatedAt",
  "latestDraftId",
  "archivedFromPageId"
)
SELECT
  rs.parent_campaign_id,
  rs."title",
  rs."description",
  rs."summary",
  rs."aiSummary",
  rs."status",
  rs."source",
  COALESCE(mo.max_order, 0) + rs.sub_rank,
  rs."aiMetadata",
  rs."createdAt",
  rs."updatedAt",
  rs."latestDraftId",
  rs."id"
FROM ranked_subpages rs
LEFT JOIN max_orders mo ON mo."campaignId" = rs.parent_campaign_id;

-- ----------------------------------------------------------------------------
-- 4. Reattach keywords to their owning topic in the flat model.
--    a) Keywords from former subpages -> the new sibling topic we just created.
--    b) Keywords from former pillars -> the existing parent topic (if topicId
--       was null on legacy rows).
--    Existing pageId column is left intact for forensics.
-- ----------------------------------------------------------------------------

-- (a) keywords whose page was a subpage
UPDATE "CampaignKeyword" k SET
  "topicId" = newTopic."id"
FROM "CampaignTopic" newTopic
WHERE newTopic."archivedFromPageId" = k."pageId"
  AND k."pageId" IS NOT NULL;

-- (b) any keyword still missing topicId, fall back to the page's topicId
UPDATE "CampaignKeyword" k SET
  "topicId" = p."topicId"
FROM "CampaignPage" p
WHERE k."pageId" = p."id"
  AND k."topicId" IS NULL;

-- ----------------------------------------------------------------------------
-- 5. Backfill WordpressPublishLog.generationTopicId.
--    a) From subpages -> the new sibling topic.
--    b) From pillars -> the parent topic.
-- ----------------------------------------------------------------------------

-- (a) drafts attached to a former subpage
UPDATE "WordpressPublishLog" w SET
  "generationTopicId" = newTopic."id"
FROM "CampaignTopic" newTopic
JOIN "CampaignPage" sp ON sp."id" = newTopic."archivedFromPageId"
WHERE w."generationPageId" = sp."id"
  AND w."generationTopicId" IS NULL;

-- (b) drafts attached to a former pillar
UPDATE "WordpressPublishLog" w SET
  "generationTopicId" = p."topicId"
FROM "CampaignPage" p
WHERE w."generationPageId" = p."id"
  AND p."pageType" = 'PILLAR'
  AND w."generationTopicId" IS NULL;

-- ----------------------------------------------------------------------------
-- 6. Foreign keys + indexes for the new columns
-- ----------------------------------------------------------------------------

ALTER TABLE "CampaignTopic"
  ADD CONSTRAINT "CampaignTopic_latestDraftId_fkey"
  FOREIGN KEY ("latestDraftId")
  REFERENCES "WordpressPublishLog"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE "WordpressPublishLog"
  ADD CONSTRAINT "WordpressPublishLog_generationTopicId_fkey"
  FOREIGN KEY ("generationTopicId")
  REFERENCES "CampaignTopic"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

CREATE INDEX "CampaignTopic_latestDraftId_idx"
  ON "CampaignTopic"("latestDraftId");

CREATE INDEX "WordpressPublishLog_generationTopicId_idx"
  ON "WordpressPublishLog"("generationTopicId");
