# Flatten topics — worksheet model

Migration: `20260502005832_flatten_topics_worksheet_model`

## What it does

Refactors the campaign data model from `Topic -> (Pillar Page + N Subpages)`
to a flat `Topic-as-content-unit` model. Each former subpage becomes its
own sibling topic. Each existing topic's title is rewritten to its
corresponding pillar page's title.

## Data preservation guarantee

This migration is **strictly additive at the row level**. It never:

- Drops a table
- Drops a column
- Deletes a row
- Renames an existing column

It adds four columns and copies data into them. Original `CampaignPage`
and `GenerationJobPage` rows remain untouched in the database as a frozen
forensic archive.

## Pre-flight (one-time before running on prod)

1. Snapshot the affected tables. Adjust paths to your environment:

   ```bash
   pg_dump "$DATABASE_URL" \
     --table='public."Campaign"' \
     --table='public."CampaignTopic"' \
     --table='public."CampaignPage"' \
     --table='public."CampaignKeyword"' \
     --table='public."WordpressPublishLog"' \
     --table='public."GenerationJob"' \
     --table='public."GenerationJobPage"' \
     --data-only \
     -f "flatten-topics-snapshot-$(date +%Y%m%d%H%M%S).sql"
   ```

2. Capture pre-migration counts:

   ```bash
   psql "$DATABASE_URL" <<'SQL'
   SELECT 'CampaignTopic' AS t,  COUNT(*) FROM "CampaignTopic"
   UNION ALL SELECT 'CampaignPage',         COUNT(*) FROM "CampaignPage"
   UNION ALL SELECT 'CampaignPage(PILLAR)', COUNT(*) FROM "CampaignPage" WHERE "pageType" = 'PILLAR'
   UNION ALL SELECT 'CampaignPage(SUBPAGE)',COUNT(*) FROM "CampaignPage" WHERE "pageType" = 'SUBPAGE'
   UNION ALL SELECT 'CampaignKeyword',      COUNT(*) FROM "CampaignKeyword"
   UNION ALL SELECT 'WordpressPublishLog',  COUNT(*) FROM "WordpressPublishLog";
   SQL
   ```

   Save the output. You will compare against post-migration counts.

3. Restore the snapshot into a scratch DB and rehearse the migration there
   first. Run `scripts/verify-flatten-topics.sql` against the rehearsal DB.

## Apply

```bash
cd domainanalyzerBackend
pnpm prisma migrate deploy
```

The migration runs inside Prisma's default transaction wrapper. If any
step fails the entire change rolls back.

## Verify

```bash
psql "$DATABASE_URL" -f scripts/verify-flatten-topics.sql
```

Expected:

- Section 1: 0 rows (every legacy subpage spawned a topic)
- Section 2: `orphan_keyword_count = 0`
- Section 3: 0 rows (titles were rewritten correctly)
- Section 4: `unlinked_draft_count = 0`
- Section 5: `campaign_page_count` matches the pre-migration snapshot
- Section 6: `topic_count_now = pre.CampaignTopic + pre.CampaignPage(SUBPAGE)`
- Section 7: 0

If any check fails, the rollback is `pg_restore` from the snapshot taken
in step 1 plus `pnpm prisma migrate resolve --rolled-back` to mark the
Prisma migration as failed.

## After this migration ships

Application code stops referencing `CampaignPage`, `GenerationJobPage`,
`CampaignKeyword.pageId`, and `WordpressPublishLog.generationPageId`. The
DB columns and tables are intentionally retained — a future cleanup
migration may drop them once you are certain nothing in observability,
analytics, or partner tooling reads them.
