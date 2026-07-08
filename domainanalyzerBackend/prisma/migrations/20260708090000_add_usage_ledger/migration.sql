-- Centralized usage ledger for paid AI/API calls.
-- ApiSpendLog is kept for one compatibility release, but backfilled here so
-- admin reporting can read a single source of truth.

CREATE TABLE "UsageLedgerEntry" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER,
  "sessionId" INTEGER,
  "domainId" INTEGER,
  "domainHost" TEXT,
  "runId" INTEGER,
  "promptId" INTEGER,
  "aiQueryResultId" INTEGER,
  "provider" TEXT NOT NULL,
  "feature" TEXT NOT NULL,
  "operation" TEXT NOT NULL,
  "callType" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "modelRequested" TEXT,
  "modelUsed" TEXT,
  "providerGenerationId" TEXT,
  "promptTokens" INTEGER,
  "completionTokens" INTEGER,
  "totalTokens" INTEGER,
  "cachedTokens" INTEGER,
  "reasoningTokens" INTEGER,
  "costUsd" DECIMAL(18,8) NOT NULL DEFAULT 0,
  "costSource" TEXT NOT NULL,
  "latencyMs" INTEGER,
  "httpStatus" INTEGER,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "UsageLedgerEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "UsageLedgerEntry_createdAt_idx" ON "UsageLedgerEntry"("createdAt");
CREATE INDEX "UsageLedgerEntry_userId_createdAt_idx" ON "UsageLedgerEntry"("userId", "createdAt");
CREATE INDEX "UsageLedgerEntry_domainId_createdAt_idx" ON "UsageLedgerEntry"("domainId", "createdAt");
CREATE INDEX "UsageLedgerEntry_promptId_createdAt_idx" ON "UsageLedgerEntry"("promptId", "createdAt");
CREATE INDEX "UsageLedgerEntry_provider_createdAt_idx" ON "UsageLedgerEntry"("provider", "createdAt");
CREATE INDEX "UsageLedgerEntry_feature_createdAt_idx" ON "UsageLedgerEntry"("feature", "createdAt");
CREATE INDEX "UsageLedgerEntry_modelUsed_createdAt_idx" ON "UsageLedgerEntry"("modelUsed", "createdAt");

INSERT INTO "UsageLedgerEntry" (
  "userId",
  "sessionId",
  "domainHost",
  "provider",
  "feature",
  "operation",
  "callType",
  "status",
  "costUsd",
  "costSource",
  "metadata",
  "createdAt"
)
SELECT
  "userId",
  "sessionId",
  "domainHost",
  "service",
  'legacy',
  'legacy_spend_log',
  'external',
  'success',
  "costEstimateUsd"::DECIMAL(18,8),
  'legacy_estimate',
  "metadata",
  "createdAt"
FROM "ApiSpendLog"
WHERE NOT EXISTS (
  SELECT 1
  FROM "UsageLedgerEntry"
  WHERE "feature" = 'legacy'
);
