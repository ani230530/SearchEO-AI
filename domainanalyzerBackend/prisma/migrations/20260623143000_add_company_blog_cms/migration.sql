ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "role" TEXT NOT NULL DEFAULT 'user';

CREATE TYPE "BlogPostStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED');

CREATE TABLE "BlogCategory" (
  "id" SERIAL NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdById" INTEGER NOT NULL,
  "updatedById" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BlogCategory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BlogTag" (
  "id" SERIAL NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT,
  "createdById" INTEGER NOT NULL,
  "updatedById" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BlogTag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BlogPost" (
  "id" SERIAL NOT NULL,
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "excerpt" TEXT,
  "contentHtml" TEXT NOT NULL,
  "heroImageUrl" TEXT,
  "heroImageAlt" TEXT,
  "seoTitle" TEXT,
  "seoDescription" TEXT,
  "status" "BlogPostStatus" NOT NULL DEFAULT 'DRAFT',
  "publishedAt" TIMESTAMP(3),
  "scheduledAt" TIMESTAMP(3),
  "readTimeMinutes" INTEGER NOT NULL DEFAULT 0,
  "authorName" TEXT,
  "authorTitle" TEXT,
  "categoryId" INTEGER,
  "tagIds" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  "createdById" INTEGER NOT NULL,
  "updatedById" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BlogPost_pkey" PRIMARY KEY ("id")
);

-- Align updatedAt defaults after the blog tables exist.
ALTER TABLE "BlogCategory" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "BlogPost" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "BlogTag" ALTER COLUMN "updatedAt" DROP DEFAULT;

CREATE UNIQUE INDEX "BlogCategory_slug_key" ON "BlogCategory"("slug");
CREATE UNIQUE INDEX "BlogTag_slug_key" ON "BlogTag"("slug");
CREATE UNIQUE INDEX "BlogPost_slug_key" ON "BlogPost"("slug");
CREATE INDEX "BlogCategory_sortOrder_idx" ON "BlogCategory"("sortOrder");
CREATE INDEX "BlogCategory_createdById_idx" ON "BlogCategory"("createdById");
CREATE INDEX "BlogTag_createdById_idx" ON "BlogTag"("createdById");
CREATE INDEX "BlogPost_status_publishedAt_idx" ON "BlogPost"("status", "publishedAt");
CREATE INDEX "BlogPost_categoryId_status_publishedAt_idx" ON "BlogPost"("categoryId", "status", "publishedAt");
CREATE INDEX "BlogPost_createdById_idx" ON "BlogPost"("createdById");

ALTER TABLE "BlogCategory"
  ADD CONSTRAINT "BlogCategory_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BlogCategory"
  ADD CONSTRAINT "BlogCategory_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BlogTag"
  ADD CONSTRAINT "BlogTag_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BlogTag"
  ADD CONSTRAINT "BlogTag_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BlogPost"
  ADD CONSTRAINT "BlogPost_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "BlogCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BlogPost"
  ADD CONSTRAINT "BlogPost_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BlogPost"
  ADD CONSTRAINT "BlogPost_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
