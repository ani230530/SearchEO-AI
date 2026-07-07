CREATE TABLE "PromptCatalogNiche" (
    "id" UUID NOT NULL,
    "canonicalName" TEXT NOT NULL,
    "aliases" JSONB NOT NULL DEFAULT '[]',
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromptCatalogNiche_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PromptCatalogPrompt" (
    "id" UUID NOT NULL,
    "nicheId" UUID NOT NULL,
    "prompt" TEXT NOT NULL,
    "intent" TEXT NOT NULL,
    "source" TEXT,
    "qualityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3),

    CONSTRAINT "PromptCatalogPrompt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PromptCatalogNiche_canonicalName_key" ON "PromptCatalogNiche"("canonicalName");
CREATE INDEX "PromptCatalogNiche_canonicalName_idx" ON "PromptCatalogNiche"("canonicalName");

CREATE UNIQUE INDEX "PromptCatalogPrompt_nicheId_prompt_key" ON "PromptCatalogPrompt"("nicheId", "prompt");
CREATE INDEX "PromptCatalogPrompt_nicheId_idx" ON "PromptCatalogPrompt"("nicheId");
CREATE INDEX "PromptCatalogPrompt_intent_idx" ON "PromptCatalogPrompt"("intent");

ALTER TABLE "PromptCatalogPrompt"
ADD CONSTRAINT "PromptCatalogPrompt_nicheId_fkey"
FOREIGN KEY ("nicheId") REFERENCES "PromptCatalogNiche"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
