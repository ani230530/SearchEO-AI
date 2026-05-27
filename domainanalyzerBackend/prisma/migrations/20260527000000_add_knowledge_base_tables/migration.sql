-- Knowledge Base tables
-- Idempotent on databases where this schema was already created outside the
-- migration ledger.

CREATE TABLE IF NOT EXISTS "Folder" (
  "id" SERIAL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "userId" INTEGER NOT NULL,
  "parentId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "File" (
  "id" SERIAL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "cloudinaryId" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "format" TEXT NOT NULL,
  "userId" INTEGER NOT NULL,
  "folderId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "Folder_userId_idx" ON "Folder"("userId");
CREATE INDEX IF NOT EXISTS "Folder_parentId_idx" ON "Folder"("parentId");
CREATE INDEX IF NOT EXISTS "File_userId_idx" ON "File"("userId");
CREATE INDEX IF NOT EXISTS "File_folderId_idx" ON "File"("folderId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Folder_userId_fkey'
  ) THEN
    ALTER TABLE "Folder"
    ADD CONSTRAINT "Folder_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Folder_parentId_fkey'
  ) THEN
    ALTER TABLE "Folder"
    ADD CONSTRAINT "Folder_parentId_fkey"
    FOREIGN KEY ("parentId") REFERENCES "Folder"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'File_userId_fkey'
  ) THEN
    ALTER TABLE "File"
    ADD CONSTRAINT "File_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'File_folderId_fkey'
  ) THEN
    ALTER TABLE "File"
    ADD CONSTRAINT "File_folderId_fkey"
    FOREIGN KEY ("folderId") REFERENCES "Folder"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;
  END IF;
END $$;
