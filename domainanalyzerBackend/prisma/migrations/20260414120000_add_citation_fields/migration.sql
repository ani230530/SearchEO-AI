-- AlterTable
ALTER TABLE "AIQueryResult" ADD COLUMN "citations" JSONB;
ALTER TABLE "AIQueryResult" ADD COLUMN "searchQueries" JSONB;
ALTER TABLE "AIQueryResult" ADD COLUMN "citationStrength" DOUBLE PRECISION;
