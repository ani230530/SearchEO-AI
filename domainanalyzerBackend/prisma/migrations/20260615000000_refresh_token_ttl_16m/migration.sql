-- Cap all currently-active refresh tokens to the new 1-day session window.
-- Tokens already revoked or already expired are left untouched.
UPDATE "RefreshToken"
SET "expiresAt" = LEAST("expiresAt", NOW() + INTERVAL '1 day')
WHERE "revokedAt" IS NULL
  AND "expiresAt" > NOW();
