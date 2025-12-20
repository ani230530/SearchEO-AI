-- CreateTable
CREATE TABLE "AuditResult" (
    "id" SERIAL NOT NULL,
    "domainId" INTEGER NOT NULL,
    "performance" DOUBLE PRECISION NOT NULL,
    "seo" DOUBLE PRECISION NOT NULL,
    "accessibility" DOUBLE PRECISION NOT NULL,
    "bestPractices" DOUBLE PRECISION NOT NULL,
    "pwa" DOUBLE PRECISION NOT NULL,
    "audits" JSONB NOT NULL,
    "screenshotUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AuditResult_domainId_key" ON "AuditResult"("domainId");

-- CreateIndex
CREATE INDEX "AuditResult_domainId_idx" ON "AuditResult"("domainId");

-- AddForeignKey
ALTER TABLE "AuditResult" ADD CONSTRAINT "AuditResult_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain"("id") ON DELETE CASCADE ON UPDATE CASCADE;
