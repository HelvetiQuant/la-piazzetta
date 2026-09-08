-- 20260908_venue_denorm
-- Denormalizzazione venueId su TableSession e Order.
--
-- Oggi l'isolamento multi-tenant passa da session -> table -> venueId (3 hop).
-- È fragile (la rotta /sessions/:id/orders lo dimenticava), lento e blocca
-- la futura RLS su Supabase. Aggiungiamo venueId direttamente sui due modelli
-- e facciamo backfill dai dati esistenti.
--
-- Additiva e idempotente: sicura su DB vuoto e su DB popolato.

-- ─── TableSession ──────────────────────────────────────────────────────────
ALTER TABLE "TableSession" ADD COLUMN IF NOT EXISTS "venueId" TEXT;

-- Backfill: risale la catena session -> table -> venue
UPDATE "TableSession" ts
SET "venueId" = t."venueId"
FROM "Table" t
WHERE ts."tableId" = t."id" AND ts."venueId" IS NULL;

-- FK verso Venue (guarded: non aggiunge se esiste già)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'TableSession_venueId_fkey'
  ) THEN
    ALTER TABLE "TableSession"
      ADD CONSTRAINT "TableSession_venueId_fkey"
      FOREIGN KEY ("venueId") REFERENCES "Venue"("id");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "TableSession_venueId_createdAt_idx"
  ON "TableSession" ("venueId", "createdAt");

-- ─── Order ──────────────────────────────────────────────────────────────────
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "venueId" TEXT;

-- Backfill: risale la catena order -> session -> table -> venue
UPDATE "Order" o
SET "venueId" = t."venueId"
FROM "TableSession" ts
JOIN "Table" t ON ts."tableId" = t."id"
WHERE o."sessionId" = ts."id" AND o."venueId" IS NULL;

-- FK verso Venue (guarded)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'Order_venueId_fkey'
  ) THEN
    ALTER TABLE "Order"
      ADD CONSTRAINT "Order_venueId_fkey"
      FOREIGN KEY ("venueId") REFERENCES "Venue"("id");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Order_venueId_createdAt_idx"
  ON "Order" ("venueId", "createdAt");
