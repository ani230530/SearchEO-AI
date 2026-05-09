-- ============================================================================
-- Foundational rewrite: drop dead wizard/phrase/intent/competitor tables,
-- simplify Domain, add new wizard tables.
-- ----------------------------------------------------------------------------
-- Pre-condition: scripts/backup-blogs.ts has been run; the JSON backup file
-- contains everything we want to retain. After this migration, run
-- scripts/restore-blogs.ts <backup.json> to re-insert the retained rows.
-- ============================================================================

-- 1. DROP dead tables (CASCADE drops their FKs implicitly)

DROP TABLE IF EXISTS "PhraseScore" CASCADE;
DROP TABLE IF EXISTS "PhraseIntentClassification" CASCADE;
DROP TABLE IF EXISTS "Phrase" CASCADE;
DROP TABLE IF EXISTS "IntentClassificationResult" CASCADE;
DROP TABLE IF EXISTS "IntentClassification" CASCADE;
DROP TABLE IF EXISTS "IntentPhraseGeneration" CASCADE;
DROP TABLE IF EXISTS "SearchPatternResult" CASCADE;
DROP TABLE IF EXISTS "SearchPattern" CASCADE;
DROP TABLE IF EXISTS "SearchVolumeClassification" CASCADE;
DROP TABLE IF EXISTS "SemanticAnalysis" CASCADE;
DROP TABLE IF EXISTS "CommunityInsight" CASCADE;
DROP TABLE IF EXISTS "CommunityMiningResult" CASCADE;
DROP TABLE IF EXISTS "RedditPattern" CASCADE;
DROP TABLE IF EXISTS "NichePromptPattern" CASCADE;
DROP TABLE IF EXISTS "SuggestedCompetitor" CASCADE;
DROP TABLE IF EXISTS "CompetitorAnalysis" CASCADE;
DROP TABLE IF EXISTS "CompetitorTracking" CASCADE;
DROP TABLE IF EXISTS "ModelPerformance" CASCADE;
DROP TABLE IF EXISTS "PerformanceInsight" CASCADE;
DROP TABLE IF EXISTS "RelevanceScoreResult" CASCADE;
DROP TABLE IF EXISTS "KeywordAnalysis" CASCADE;
DROP TABLE IF EXISTS "DashboardAnalysis" CASCADE;
DROP TABLE IF EXISTS "AnalysisReport" CASCADE;
DROP TABLE IF EXISTS "AnalysisPhase" CASCADE;
DROP TABLE IF EXISTS "AIQueryResult" CASCADE;
DROP TABLE IF EXISTS "GeneratedIntentPhrase" CASCADE;
DROP TABLE IF EXISTS "Keyword" CASCADE;
DROP TABLE IF EXISTS "CrawlResult" CASCADE;
DROP TABLE IF EXISTS "GenerationJobPage" CASCADE;
DROP TABLE IF EXISTS "CampaignPage" CASCADE;
DROP TYPE IF EXISTS "CampaignPageType";

-- 2. Reshape Domain — drop dead columns, add `host`, ensure (userId, host) unique.
-- Existing rows: backup-blogs.ts captured everything; the schema migration is
-- handled by Prisma's own column ops below. Restoration script populates `host`.

ALTER TABLE "Domain"
  DROP COLUMN IF EXISTS "context",
  DROP COLUMN IF EXISTS "contextJson",
  DROP COLUMN IF EXISTS "chatModel",
  DROP COLUMN IF EXISTS "customKeywords",
  DROP COLUMN IF EXISTS "intentPhrases",
  DROP COLUMN IF EXISTS "runAllModels",
  DROP COLUMN IF EXISTS "locationContext",
  DROP COLUMN IF EXISTS "currentStep",
  DROP COLUMN IF EXISTS "country",
  DROP COLUMN IF EXISTS "state",
  DROP COLUMN IF EXISTS "industry",
  DROP COLUMN IF EXISTS "companySize",
  DROP COLUMN IF EXISTS "customSeeds",
  DROP COLUMN IF EXISTS "selectedCompetitors",
  DROP COLUMN IF EXISTS "selectionDraft",
  DROP COLUMN IF EXISTS "location";

ALTER TABLE "Domain" ADD COLUMN IF NOT EXISTS "host" TEXT;
UPDATE "Domain" SET "host" = lower(regexp_replace(regexp_replace("url", '^https?://', ''), '^www\.', '')) WHERE "host" IS NULL;
UPDATE "Domain" SET "host" = split_part("host", '/', 1);
ALTER TABLE "Domain" ALTER COLUMN "host" SET NOT NULL;
ALTER TABLE "Domain" ALTER COLUMN "userId" SET NOT NULL;

-- Before deduping Domain rows we must ensure the cascade can flow through
-- Campaign → CampaignTopic → GenerationJob without hitting a RESTRICT FK.
-- The legacy GenerationJob.topicId was NO ACTION; redefine it as CASCADE
-- so deleting a duplicate Domain takes its orphaned generation jobs with it.
ALTER TABLE "GenerationJob" DROP CONSTRAINT IF EXISTS "GenerationJob_topicId_fkey";
ALTER TABLE "GenerationJob" ADD CONSTRAINT "GenerationJob_topicId_fkey"
  FOREIGN KEY ("topicId") REFERENCES "CampaignTopic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Dedupe (userId, host) — historical rows came from the legacy (url, userId)
-- unique key, so http+https / trailing-slash variants of the same host can
-- coexist. Keep the most-recently-updated row, delete the rest. Existing
-- ON DELETE CASCADE FKs (Campaign, AuditResult) carry their dependents along.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY "userId", "host"
           ORDER BY "updatedAt" DESC, id DESC
         ) AS rn
  FROM "Domain"
)
DELETE FROM "Domain"
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Drop the legacy unique on (url, userId) and any leftover unique on url alone.
ALTER TABLE "Domain" DROP CONSTRAINT IF EXISTS "Domain_url_userId_key";
ALTER TABLE "Domain" DROP CONSTRAINT IF EXISTS "Domain_url_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Domain_userId_host_key" ON "Domain"("userId", "host");

-- 3. Drop deprecated columns from retained tables.

ALTER TABLE "WordpressPublishLog" DROP COLUMN IF EXISTS "generationPageId";
ALTER TABLE "CampaignKeyword" DROP COLUMN IF EXISTS "pageId";
-- CampaignTopic.archivedFromPageId existed only as a bridge for the flatten migration.
ALTER TABLE "CampaignTopic" DROP COLUMN IF EXISTS "archivedFromPageId";

-- 4. Create new wizard tables.

CREATE TABLE "DomainProfile" (
  "domainId" INTEGER PRIMARY KEY REFERENCES "Domain"("id") ON DELETE CASCADE,
  "country" TEXT,
  "state" TEXT,
  "industry" TEXT,
  "targetLocation" TEXT,
  "customSeeds" JSONB,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "DomainInferred" (
  "domainId" INTEGER PRIMARY KEY REFERENCES "Domain"("id") ON DELETE CASCADE,
  "companyName" TEXT,
  "companySize" TEXT,
  "brandVoice" JSONB,
  "targetAudience" JSONB,
  "productsJson" JSONB,
  "schemaOrgJson" JSONB,
  "embedding" JSONB,
  "summary" TEXT,
  "inferredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "WizardState" (
  "domainId" INTEGER PRIMARY KEY REFERENCES "Domain"("id") ON DELETE CASCADE,
  "phases" JSONB NOT NULL DEFAULT '{}',
  "selectionDraft" JSONB,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "CrawlSnapshot" (
  "id" SERIAL PRIMARY KEY,
  "domainId" INTEGER NOT NULL REFERENCES "Domain"("id") ON DELETE CASCADE,
  "pagesScanned" INTEGER NOT NULL,
  "pages" JSONB NOT NULL,
  "rawText" TEXT NOT NULL,
  "contextJson" JSONB,
  "quality" JSONB,
  "policy" JSONB,
  "tokenUsage" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "CrawlSnapshot_domainId_createdAt_idx" ON "CrawlSnapshot"("domainId", "createdAt");

CREATE TABLE "Competitor" (
  "id" SERIAL PRIMARY KEY,
  "domainId" INTEGER NOT NULL REFERENCES "Domain"("id") ON DELETE CASCADE,
  "competitorHost" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "rawSignals" JSONB NOT NULL,
  "verified" BOOLEAN NOT NULL DEFAULT FALSE,
  "industry" TEXT,
  "location" TEXT,
  "companySize" TEXT,
  "similarityScore" DOUBLE PRECISION,
  "threatLevel" TEXT,
  "rank" INTEGER,
  "reasoning" TEXT,
  "isSelected" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "Competitor_domainId_competitorHost_key" ON "Competitor"("domainId", "competitorHost");
CREATE INDEX "Competitor_domainId_isSelected_idx" ON "Competitor"("domainId", "isSelected");
CREATE INDEX "Competitor_domainId_rank_idx" ON "Competitor"("domainId", "rank");

CREATE TABLE "Keyword" (
  "id" SERIAL PRIMARY KEY,
  "domainId" INTEGER NOT NULL REFERENCES "Domain"("id") ON DELETE CASCADE,
  "term" TEXT NOT NULL,
  "intent" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "volume" INTEGER,
  "difficulty" TEXT,
  "cpc" DOUBLE PRECISION,
  "isSelected" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "Keyword_domainId_term_key" ON "Keyword"("domainId", "term");
CREATE INDEX "Keyword_domainId_isSelected_idx" ON "Keyword"("domainId", "isSelected");

CREATE TABLE "Prompt" (
  "id" SERIAL PRIMARY KEY,
  "domainId" INTEGER NOT NULL REFERENCES "Domain"("id") ON DELETE CASCADE,
  "keywordId" INTEGER REFERENCES "Keyword"("id") ON DELETE SET NULL,
  "text" TEXT NOT NULL,
  "intent" TEXT,
  "source" TEXT NOT NULL,
  "isSelected" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "Prompt_domainId_isSelected_idx" ON "Prompt"("domainId", "isSelected");
CREATE INDEX "Prompt_keywordId_idx" ON "Prompt"("keywordId");

CREATE TABLE "AiRun" (
  "id" SERIAL PRIMARY KEY,
  "domainId" INTEGER NOT NULL REFERENCES "Domain"("id") ON DELETE CASCADE,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'running',
  "summary" JSONB
);
CREATE INDEX "AiRun_domainId_startedAt_idx" ON "AiRun"("domainId", "startedAt");

CREATE TABLE "AiQueryResult" (
  "id" SERIAL PRIMARY KEY,
  "runId" INTEGER NOT NULL REFERENCES "AiRun"("id") ON DELETE CASCADE,
  "promptId" INTEGER NOT NULL REFERENCES "Prompt"("id") ON DELETE CASCADE,
  "model" TEXT NOT NULL,
  "response" TEXT NOT NULL,
  "presence" INTEGER NOT NULL DEFAULT 0,
  "relevance" INTEGER NOT NULL DEFAULT 0,
  "sentiment" INTEGER NOT NULL DEFAULT 0,
  "overall" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "competitorHosts" JSONB,
  "latencyMs" INTEGER,
  "costUsd" DOUBLE PRECISION,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AiQueryResult_runId_idx" ON "AiQueryResult"("runId");
CREATE INDEX "AiQueryResult_promptId_idx" ON "AiQueryResult"("promptId");

-- 5. Hygiene: ensure existing FKs we kept still cascade as the new schema declares.
-- (Prisma's own diff would emit these; we make them idempotent.)

ALTER TABLE "Domain" DROP CONSTRAINT IF EXISTS "Domain_userId_fkey";
ALTER TABLE "Domain" ADD CONSTRAINT "Domain_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;
