-- =============================================================================
-- 20260515000000_wizard_session_anon_user
-- -----------------------------------------------------------------------------
-- Adds the shadow-user-per-anon-session model. Each WizardSession now points
-- to a User row that represents the anonymous browser ("shadow user"). The
-- wizard creates Domain / CrawlSnapshot / Competitor / Prompt rows owned by
-- this shadow user during Steps 1-4, so the existing wizard schema works
-- unchanged. On signup the linkage handler reassigns Domain.userId from the
-- shadow user to the new real user.
--
-- Purely additive: one nullable column + one FK + one index. No existing
-- column / FK / constraint is touched.
-- =============================================================================

ALTER TABLE "WizardSession"
  ADD COLUMN "anonUserId" INTEGER;

ALTER TABLE "WizardSession"
  ADD CONSTRAINT "WizardSession_anonUserId_fkey"
  FOREIGN KEY ("anonUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "WizardSession_anonUserId_idx" ON "WizardSession"("anonUserId");
