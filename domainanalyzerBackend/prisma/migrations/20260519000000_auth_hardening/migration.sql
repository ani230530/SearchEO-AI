-- =============================================================================
-- Auth hardening: rotating refresh tokens, Google identity, lockout, reset.
-- =============================================================================

-- ── User: new columns ───────────────────────────────────────────────────────
ALTER TABLE "User"
  ADD COLUMN "googleId" TEXT,
  ADD COLUMN "passwordResetTokenHash" TEXT,
  ADD COLUMN "passwordResetTokenExpiry" TIMESTAMP(3),
  ADD COLUMN "loginFailureCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lockedUntil" TIMESTAMP(3),
  ADD COLUMN "lastLoginAt" TIMESTAMP(3),
  ADD COLUMN "passwordChangedAt" TIMESTAMP(3),
  ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;

-- Allow Google-only accounts (no local password).
ALTER TABLE "User" ALTER COLUMN "password" DROP NOT NULL;

-- Drop legacy single-token columns — replaced by RefreshToken table.
ALTER TABLE "User" DROP COLUMN IF EXISTS "refreshToken";
ALTER TABLE "User" DROP COLUMN IF EXISTS "refreshTokenExpiry";

-- Unique index on googleId so the OAuth lookup is O(1).
CREATE UNIQUE INDEX IF NOT EXISTS "User_googleId_key" ON "User"("googleId");

-- ── RefreshToken table ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "RefreshToken" (
  "id"         SERIAL PRIMARY KEY,
  "userId"     INTEGER NOT NULL,
  "tokenHash"  TEXT NOT NULL,
  "familyId"   TEXT NOT NULL,
  "parentId"   INTEGER,
  "userAgent"  TEXT,
  "ip"         TEXT,
  "expiresAt"  TIMESTAMP(3) NOT NULL,
  "revokedAt"  TIMESTAMP(3),
  "reusedAt"   TIMESTAMP(3),
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RefreshToken_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");
CREATE INDEX IF NOT EXISTS "RefreshToken_userId_idx" ON "RefreshToken"("userId");
CREATE INDEX IF NOT EXISTS "RefreshToken_familyId_idx" ON "RefreshToken"("familyId");
