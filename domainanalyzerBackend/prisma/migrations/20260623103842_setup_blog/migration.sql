/*
  Warnings:

  - A unique constraint covering the columns `[term,topicId]` on the table `CampaignKeyword` will be added. If there are existing duplicate values, this will fail.
  - Made the column `topicId` on table `CampaignKeyword` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "AiQueryResult" DROP CONSTRAINT "AiQueryResult_promptId_fkey";

-- DropForeignKey
ALTER TABLE "AiQueryResult" DROP CONSTRAINT "AiQueryResult_runId_fkey";

-- DropForeignKey
ALTER TABLE "AiRun" DROP CONSTRAINT "AiRun_domainId_fkey";

-- DropForeignKey
ALTER TABLE "Competitor" DROP CONSTRAINT "Competitor_domainId_fkey";

-- DropForeignKey
ALTER TABLE "CrawlSnapshot" DROP CONSTRAINT "CrawlSnapshot_domainId_fkey";

-- DropForeignKey
ALTER TABLE "Domain" DROP CONSTRAINT "Domain_userId_fkey";

-- DropForeignKey
ALTER TABLE "DomainInferred" DROP CONSTRAINT "DomainInferred_domainId_fkey";

-- DropForeignKey
ALTER TABLE "DomainProfile" DROP CONSTRAINT "DomainProfile_domainId_fkey";

-- DropForeignKey
ALTER TABLE "GenerationJob" DROP CONSTRAINT "GenerationJob_userId_fkey";

-- DropForeignKey
ALTER TABLE "Keyword" DROP CONSTRAINT "Keyword_domainId_fkey";

-- DropForeignKey
ALTER TABLE "Prompt" DROP CONSTRAINT "Prompt_domainId_fkey";

-- DropForeignKey
ALTER TABLE "Prompt" DROP CONSTRAINT "Prompt_keywordId_fkey";

-- DropForeignKey
ALTER TABLE "WizardState" DROP CONSTRAINT "WizardState_domainId_fkey";

-- DropForeignKey
ALTER TABLE "WordpressIntegration" DROP CONSTRAINT "WordpressIntegration_userId_fkey";

-- DropForeignKey
ALTER TABLE "WordpressPublishLog" DROP CONSTRAINT "WordpressPublishLog_generationTopicId_fkey";

-- DropForeignKey
ALTER TABLE "WordpressPublishLog" DROP CONSTRAINT "WordpressPublishLog_userId_fkey";

-- DropIndex
DROP INDEX "Domain_url_userId_key";

-- AlterTable
ALTER TABLE "CampaignKeyword" ALTER COLUMN "topicId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Competitor" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "DomainProfile" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Folder" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Keyword" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "WizardState" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateIndex
CREATE UNIQUE INDEX "CampaignKeyword_term_topicId_key" ON "CampaignKeyword"("term", "topicId");

-- AddForeignKey
ALTER TABLE "Domain" ADD CONSTRAINT "Domain_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainProfile" ADD CONSTRAINT "DomainProfile_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainInferred" ADD CONSTRAINT "DomainInferred_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WizardState" ADD CONSTRAINT "WizardState_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrawlSnapshot" ADD CONSTRAINT "CrawlSnapshot_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Competitor" ADD CONSTRAINT "Competitor_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Keyword" ADD CONSTRAINT "Keyword_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prompt" ADD CONSTRAINT "Prompt_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prompt" ADD CONSTRAINT "Prompt_keywordId_fkey" FOREIGN KEY ("keywordId") REFERENCES "Keyword"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiRun" ADD CONSTRAINT "AiRun_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiQueryResult" ADD CONSTRAINT "AiQueryResult_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AiRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiQueryResult" ADD CONSTRAINT "AiQueryResult_promptId_fkey" FOREIGN KEY ("promptId") REFERENCES "Prompt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WordpressIntegration" ADD CONSTRAINT "WordpressIntegration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WordpressPublishLog" ADD CONSTRAINT "WordpressPublishLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationJob" ADD CONSTRAINT "GenerationJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "WordpressPublishLog_generationJobId_normalizedPrimaryKeyword_id" RENAME TO "WordpressPublishLog_generationJobId_normalizedPrimaryKeywor_idx";
