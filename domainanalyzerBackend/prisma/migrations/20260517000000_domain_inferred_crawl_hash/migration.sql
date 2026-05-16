-- Add crawlHash to DomainInferred so the wizard can detect "the crawl text
-- didn't change since last time" and skip the OpenAI embedding call
-- (~$0.0001 + 1–2 s per wizard re-run).
ALTER TABLE "DomainInferred" ADD COLUMN "crawlHash" TEXT;
