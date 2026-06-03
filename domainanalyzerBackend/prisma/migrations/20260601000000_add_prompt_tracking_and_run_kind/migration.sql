-- Weekly prompt tracking: per-prompt opt-in flag + run-kind discriminator.

-- AlterTable: Prompt gains tracking fields.
ALTER TABLE "Prompt" ADD COLUMN "isTracked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Prompt" ADD COLUMN "lastTrackedRunAt" TIMESTAMP(3);

-- AlterTable: AiRun gains a trigger kind ('audit' | 'weekly').
ALTER TABLE "AiRun" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'audit';

-- CreateIndex: weekly sweeper enumerates tracked prompts per domain.
CREATE INDEX "Prompt_domainId_isTracked_idx" ON "Prompt"("domainId", "isTracked");

-- CreateIndex: latest completed weekly run per domain (tracked-prompts + in-flight dedupe).
CREATE INDEX "AiRun_domainId_kind_status_startedAt_idx" ON "AiRun"("domainId", "kind", "status", "startedAt");
