-- CreateTable
CREATE TABLE "N8nRequest" (
    "id" SERIAL NOT NULL,
    "requestId" TEXT NOT NULL,
    "auditResultId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "requestPayload" JSONB NOT NULL,
    "responseData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "N8nRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "N8nRequest_requestId_key" ON "N8nRequest"("requestId");

-- CreateIndex
CREATE INDEX "N8nRequest_auditResultId_idx" ON "N8nRequest"("auditResultId");

-- CreateIndex
CREATE INDEX "N8nRequest_requestId_idx" ON "N8nRequest"("requestId");

-- AddForeignKey
ALTER TABLE "N8nRequest" ADD CONSTRAINT "N8nRequest_auditResultId_fkey" FOREIGN KEY ("auditResultId") REFERENCES "AuditResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;
