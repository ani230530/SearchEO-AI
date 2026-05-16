-- Hot-path indexes identified in the production-grade perf audit.
--
-- 1. AiRun(domainId, status, startedAt) — every /report and
--    /competitor-analysis call resolves the latest completed run via
--    `where { domainId, status: 'completed' } orderBy startedAt desc`.
--    The existing (domainId, startedAt) index narrows by domain but the
--    planner still has to scan rows to filter on status. Adding status as
--    the middle column lets the planner skip straight to the matching
--    rows in startedAt order.
CREATE INDEX "AiRun_domainId_status_startedAt_idx" ON "AiRun"("domainId", "status", "startedAt");

-- 2. Keyword(domainId, source) — soft-reset deletes AI-generated keywords
--    via `where { domainId, source: 'ai' }`. The existing (domainId,
--    isSelected) index doesn't help; without this index the soft-reset
--    walked every keyword for the domain.
CREATE INDEX "Keyword_domainId_source_idx" ON "Keyword"("domainId", "source");

-- 3. Prompt(domainId, source) — same shape as Keyword above; soft-reset
--    deletes by (domainId, source='ai').
CREATE INDEX "Prompt_domainId_source_idx" ON "Prompt"("domainId", "source");
