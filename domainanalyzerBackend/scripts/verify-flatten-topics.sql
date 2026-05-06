-- ============================================================================
-- Post-migration verification — flatten-topics worksheet model.
-- All queries should return 0 rows OR the asserted equalities below.
-- Run with: psql $DATABASE_URL -f scripts/verify-flatten-topics.sql
-- ============================================================================

\echo '== 1. Every legacy subpage has a corresponding split topic =='
-- Expect: 0 rows returned (every SUBPAGE has a topic with archivedFromPageId = page.id)
SELECT sp."id" AS subpage_id, sp."title"
FROM "CampaignPage" sp
LEFT JOIN "CampaignTopic" t ON t."archivedFromPageId" = sp."id"
WHERE sp."pageType" = 'SUBPAGE'
  AND t."id" IS NULL;

\echo '== 2. No keywords are orphaned (every keyword has a non-null topicId) =='
-- Expect: 0
SELECT COUNT(*) AS orphan_keyword_count
FROM "CampaignKeyword"
WHERE "topicId" IS NULL;

\echo '== 3. Every topic with a former pillar has its title rewritten =='
-- Expect: 0 rows (the topic title equals its pillar page title)
SELECT t."id", t."title" AS topic_title, p."title" AS pillar_title
FROM "CampaignTopic" t
JOIN "CampaignPage" p ON p."topicId" = t."id" AND p."pageType" = 'PILLAR'
WHERE t."archivedFromPageId" IS NULL  -- only original topics, not subpage-split ones
  AND t."title" <> p."title";

\echo '== 4. Drafts that were linked to a page are now linked to a topic =='
-- Expect: 0 (every WordpressPublishLog with generationPageId has generationTopicId)
SELECT COUNT(*) AS unlinked_draft_count
FROM "WordpressPublishLog"
WHERE "generationPageId" IS NOT NULL
  AND "generationTopicId" IS NULL;

\echo '== 5. No CampaignPage rows were deleted (sanity: count unchanged) =='
-- Compare this number against the pre-migration snapshot.
SELECT COUNT(*) AS campaign_page_count FROM "CampaignPage";

\echo '== 6. Topic count grew by exactly the number of legacy subpages =='
SELECT
  (SELECT COUNT(*) FROM "CampaignTopic") AS topic_count_now,
  (SELECT COUNT(*) FROM "CampaignPage" WHERE "pageType" = 'SUBPAGE') AS subpage_count;
-- Expect: topic_count_now = pre_migration_topic_count + subpage_count

\echo '== 7. Every keyword that has a pageId points at a real CampaignPage =='
-- (legacy invariant — should still hold because we never delete pages)
SELECT COUNT(*) AS dangling_keyword_pageid_count
FROM "CampaignKeyword" k
LEFT JOIN "CampaignPage" p ON p."id" = k."pageId"
WHERE k."pageId" IS NOT NULL AND p."id" IS NULL;
-- Expect: 0
