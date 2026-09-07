-- Migrazione: auth (password + refresh token) ed entitlements (add-on per venue).
-- Generata a mano per allinearsi allo schema aggiornato. Idempotente dove possibile.

-- === User: hash password per il login email ===
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordHash" TEXT;

-- === RefreshToken ===
CREATE TABLE IF NOT EXISTS "RefreshToken" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");
CREATE INDEX IF NOT EXISTS "RefreshToken_userId_idx"    ON "RefreshToken"("userId");
CREATE INDEX IF NOT EXISTS "RefreshToken_tokenHash_idx" ON "RefreshToken"("tokenHash");

DO $$ BEGIN
  ALTER TABLE "RefreshToken"
    ADD CONSTRAINT "RefreshToken_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- === VenueAddon ===
CREATE TABLE IF NOT EXISTS "VenueAddon" (
  "id"        TEXT NOT NULL,
  "venueId"   TEXT NOT NULL,
  "addonId"   TEXT NOT NULL,
  "active"    BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VenueAddon_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "VenueAddon_venueId_addonId_key" ON "VenueAddon"("venueId", "addonId");
CREATE INDEX IF NOT EXISTS "VenueAddon_venueId_idx" ON "VenueAddon"("venueId");

DO $$ BEGIN
  ALTER TABLE "VenueAddon"
    ADD CONSTRAINT "VenueAddon_venueId_fkey"
    FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
