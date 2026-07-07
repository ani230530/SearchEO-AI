ALTER TABLE "Prompt"
ADD COLUMN "catalogPromptId" UUID;

CREATE TABLE "DomainPromptCatalogNiche" (
    "domainId" INTEGER NOT NULL,
    "nicheId" UUID NOT NULL,
    "matchReason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DomainPromptCatalogNiche_pkey" PRIMARY KEY ("domainId", "nicheId")
);

CREATE UNIQUE INDEX "Prompt_domainId_catalogPromptId_key" ON "Prompt"("domainId", "catalogPromptId");
CREATE INDEX "Prompt_catalogPromptId_idx" ON "Prompt"("catalogPromptId");
CREATE INDEX "DomainPromptCatalogNiche_nicheId_idx" ON "DomainPromptCatalogNiche"("nicheId");

ALTER TABLE "Prompt"
ADD CONSTRAINT "Prompt_catalogPromptId_fkey"
FOREIGN KEY ("catalogPromptId") REFERENCES "PromptCatalogPrompt"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DomainPromptCatalogNiche"
ADD CONSTRAINT "DomainPromptCatalogNiche_domainId_fkey"
FOREIGN KEY ("domainId") REFERENCES "Domain"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DomainPromptCatalogNiche"
ADD CONSTRAINT "DomainPromptCatalogNiche_nicheId_fkey"
FOREIGN KEY ("nicheId") REFERENCES "PromptCatalogNiche"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
