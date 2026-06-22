UPDATE "AiQueryResult"
SET
  "status" = 'failed',
  "errorMessage" = COALESCE("errorMessage", 'Empty response from provider')
WHERE
  btrim("response") = ''
  AND "presence" = 0
  AND "overall" = 0
  AND "relevance" <= 1
  AND ("scorerSummary" IS NULL OR btrim("scorerSummary") = '')
  AND ("citations" IS NULL OR "citations"::jsonb = '[]'::jsonb)
  AND ("competitorHosts" IS NULL OR "competitorHosts"::jsonb = '[]'::jsonb)
  AND ("competitorMentions" IS NULL OR "competitorMentions"::jsonb = '[]'::jsonb);
