-- CreateTable
CREATE TABLE "NichePromptPattern" (
    "id" SERIAL NOT NULL,
    "niche" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "retrievalFrame" TEXT NOT NULL,
    "buyerStage" TEXT NOT NULL,
    "source" TEXT,
    "realExample" TEXT,
    "variables" JSONB,
    "humannessScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "mentionRate" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NichePromptPattern_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RedditPattern" (
    "id" SERIAL NOT NULL,
    "subreddit" TEXT NOT NULL,
    "postTitle" TEXT NOT NULL,
    "postUrl" TEXT,
    "postScore" INTEGER NOT NULL DEFAULT 0,
    "commentCount" INTEGER NOT NULL DEFAULT 0,
    "patternType" TEXT NOT NULL,
    "extractedPattern" TEXT,
    "niche" TEXT NOT NULL,
    "keywords" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RedditPattern_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NichePromptPattern_niche_idx" ON "NichePromptPattern"("niche");
CREATE INDEX "NichePromptPattern_retrievalFrame_idx" ON "NichePromptPattern"("retrievalFrame");
CREATE INDEX "NichePromptPattern_niche_retrievalFrame_idx" ON "NichePromptPattern"("niche", "retrievalFrame");

-- CreateIndex
CREATE INDEX "RedditPattern_niche_idx" ON "RedditPattern"("niche");
CREATE INDEX "RedditPattern_subreddit_idx" ON "RedditPattern"("subreddit");
CREATE INDEX "RedditPattern_patternType_idx" ON "RedditPattern"("patternType");
