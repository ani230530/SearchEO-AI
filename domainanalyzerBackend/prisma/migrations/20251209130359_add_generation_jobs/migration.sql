-- CreateTable
CREATE TABLE "GenerationJob" (
    "id" SERIAL NOT NULL,
    "jobId" TEXT NOT NULL,
    "topicId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GenerationJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GenerationJobPage" (
    "id" SERIAL NOT NULL,
    "jobId" TEXT NOT NULL,
    "pageId" INTEGER NOT NULL,
    "pageType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "draftId" INTEGER,
    "primaryKeyword" TEXT,
    "progress" INTEGER DEFAULT 0,
    "error" TEXT,
    "hasHtml" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GenerationJobPage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GenerationJob_jobId_key" ON "GenerationJob"("jobId");

-- CreateIndex
CREATE INDEX "GenerationJob_topicId_idx" ON "GenerationJob"("topicId");

-- CreateIndex
CREATE INDEX "GenerationJob_userId_idx" ON "GenerationJob"("userId");

-- CreateIndex
CREATE INDEX "GenerationJobPage_jobId_idx" ON "GenerationJobPage"("jobId");

-- CreateIndex
CREATE INDEX "GenerationJobPage_pageId_idx" ON "GenerationJobPage"("pageId");

-- AddForeignKey
ALTER TABLE "GenerationJob" ADD CONSTRAINT "GenerationJob_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "CampaignTopic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationJob" ADD CONSTRAINT "GenerationJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationJobPage" ADD CONSTRAINT "GenerationJobPage_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "GenerationJob"("jobId") ON DELETE CASCADE ON UPDATE CASCADE;
