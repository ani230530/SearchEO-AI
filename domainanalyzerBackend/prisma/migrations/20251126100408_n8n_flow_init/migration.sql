-- CreateTable
CREATE TABLE "WordpressIntegration" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "siteUrl" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "lastPublishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WordpressIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WordpressPublishLog" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "wordpressUrl" TEXT NOT NULL,
    "primaryKeyword" TEXT,
    "title" TEXT,
    "slug" TEXT,
    "status" TEXT,
    "response" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "integrationId" INTEGER,

    CONSTRAINT "WordpressPublishLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WordpressIntegration_userId_key" ON "WordpressIntegration"("userId");

-- CreateIndex
CREATE INDEX "WordpressPublishLog_userId_idx" ON "WordpressPublishLog"("userId");

-- AddForeignKey
ALTER TABLE "WordpressIntegration" ADD CONSTRAINT "WordpressIntegration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WordpressPublishLog" ADD CONSTRAINT "WordpressPublishLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WordpressPublishLog" ADD CONSTRAINT "WordpressPublishLog_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "WordpressIntegration"("id") ON DELETE SET NULL ON UPDATE CASCADE;
