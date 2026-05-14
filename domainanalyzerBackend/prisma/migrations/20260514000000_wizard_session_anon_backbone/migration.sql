-- =============================================================================
-- 20260514000000_wizard_session_anon_backbone
-- -----------------------------------------------------------------------------
-- Foundational schema for the pre-signup AI Visibility audit flow + cost-
-- abuse defenses. PURELY ADDITIVE — no existing column type/null/default
-- changes, no existing index or FK touched. Safe to run against prod with
-- zero downtime, no backfill needed.
--
-- Adds:
--   * User: 5 columns for anti-abuse signals + soft quota (all defaults).
--   * WizardSession: anon wizard work stored as JSON snapshots.
--   * WizardRunCache: per-domain step cache to neutralize re-run cost.
--   * ApiSpendLog: per-call cost tracking for the daily budget breaker.
-- =============================================================================

-- AlterTable: User — anon-funnel signals + soft quota.
-- Defaults make this safe for the existing row backfill (no app downtime).
ALTER TABLE "User"
  ADD COLUMN "signupIp" TEXT,
  ADD COLUMN "signupFingerprint" TEXT,
  ADD COLUMN "wizardRunsAllowed" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "lastWizardRunAt" TIMESTAMP(3),
  ADD COLUMN "suspicious" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable: WizardSession
CREATE TABLE "WizardSession" (
  "id" SERIAL NOT NULL,
  "cookieTokenHash" TEXT NOT NULL,
  "ip" TEXT,
  "fingerprintHash" TEXT,
  "userAgent" TEXT,
  "domainUrl" TEXT,
  "domainHost" TEXT,
  "profileData" JSONB,
  "crawlData" JSONB,
  "competitorsData" JSONB,
  "topicsData" JSONB,
  "step" TEXT NOT NULL DEFAULT 'idle',
  "linkedUserId" INTEGER,
  "linkedDomainId" INTEGER,
  "linkedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WizardSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WizardSession_cookieTokenHash_key" ON "WizardSession"("cookieTokenHash");
CREATE INDEX "WizardSession_linkedUserId_idx" ON "WizardSession"("linkedUserId");
CREATE INDEX "WizardSession_fingerprintHash_idx" ON "WizardSession"("fingerprintHash");
CREATE INDEX "WizardSession_ip_idx" ON "WizardSession"("ip");
CREATE INDEX "WizardSession_expiresAt_idx" ON "WizardSession"("expiresAt");
CREATE INDEX "WizardSession_domainHost_idx" ON "WizardSession"("domainHost");

ALTER TABLE "WizardSession"
  ADD CONSTRAINT "WizardSession_linkedUserId_fkey"
  FOREIGN KEY ("linkedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: WizardRunCache
CREATE TABLE "WizardRunCache" (
  "id" SERIAL NOT NULL,
  "normalizedHost" TEXT NOT NULL,
  "step" TEXT NOT NULL,
  "cacheKey" TEXT NOT NULL DEFAULT 'default',
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WizardRunCache_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WizardRunCache_normalizedHost_step_cacheKey_key"
  ON "WizardRunCache"("normalizedHost", "step", "cacheKey");
CREATE INDEX "WizardRunCache_expiresAt_idx" ON "WizardRunCache"("expiresAt");
CREATE INDEX "WizardRunCache_normalizedHost_idx" ON "WizardRunCache"("normalizedHost");

-- CreateTable: ApiSpendLog
CREATE TABLE "ApiSpendLog" (
  "id" SERIAL NOT NULL,
  "service" TEXT NOT NULL,
  "userId" INTEGER,
  "sessionId" INTEGER,
  "domainHost" TEXT,
  "costEstimateUsd" DOUBLE PRECISION NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApiSpendLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ApiSpendLog_service_createdAt_idx" ON "ApiSpendLog"("service", "createdAt");
CREATE INDEX "ApiSpendLog_userId_createdAt_idx" ON "ApiSpendLog"("userId", "createdAt");
CREATE INDEX "ApiSpendLog_sessionId_createdAt_idx" ON "ApiSpendLog"("sessionId", "createdAt");
CREATE INDEX "ApiSpendLog_createdAt_idx" ON "ApiSpendLog"("createdAt");
