-- 20260909_cashier_pos
-- Cassa, pagamenti, cassetto portasoldi, coperto, canale di vendita.
--
-- Introduce i modelli Payment, CashDrawer, CoverChargeRule e rilassa il
-- vincolo NOT NULL su Order.sessionId per consentire le vendite al banco
-- (canale COUNTER) e l'asporto (TAKEAWAY) senza tavolo associato.
--
-- Additiva e idempotente: sicura su DB vuoto e su DB popolato. Le FK sono
-- guardate con DO $$ ... $$ per non fallire se già presenti.

-- ─── Order: sessionId opzionale + channel + coperto + sconto ──────────────
-- Rilassa la FK NOT NULL: una vendita al banco non ha sessione.
ALTER TABLE "Order" ALTER COLUMN "sessionId" DROP NOT NULL;

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "channel" TEXT NOT NULL DEFAULT 'TABLE';
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "discountCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "coverChargeCents" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "Order_channel_idx" ON "Order" ("channel");

-- ─── TableSession: chiusura, totale, coperto congelato, stato ────────────
ALTER TABLE "TableSession" ADD COLUMN IF NOT EXISTS "closedBy" TEXT;
ALTER TABLE "TableSession" ADD COLUMN IF NOT EXISTS "totalCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "TableSession" ADD COLUMN IF NOT EXISTS "coverChargeCentsPerGuest" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "TableSession" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'OPEN';

-- ─── Payment ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Payment" (
  "id"              TEXT NOT NULL,
  "venueId"         TEXT NOT NULL,
  "orderId"         TEXT,
  "sessionId"       TEXT,
  "method"          TEXT NOT NULL,
  "amountCents"     INTEGER NOT NULL,
  "tipCents"        INTEGER NOT NULL DEFAULT 0,
  "changeCents"     INTEGER NOT NULL DEFAULT 0,
  "cashDrawerId"    TEXT,
  "customerId"      TEXT,
  "posTerminalId"   TEXT,
  "posAuthCode"     TEXT,
  "posTxnId"        TEXT,
  "createdBy"       TEXT NOT NULL,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Payment_venueId_createdAt_idx" ON "Payment" ("venueId", "createdAt");
CREATE INDEX IF NOT EXISTS "Payment_orderId_idx" ON "Payment" ("orderId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'Payment_venueId_fkey'
  ) THEN
    ALTER TABLE "Payment"
      ADD CONSTRAINT "Payment_venueId_fkey"
      FOREIGN KEY ("venueId") REFERENCES "Venue"("id");
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'Payment_orderId_fkey'
  ) THEN
    ALTER TABLE "Payment"
      ADD CONSTRAINT "Payment_orderId_fkey"
      FOREIGN KEY ("orderId") REFERENCES "Order"("id");
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'Payment_sessionId_fkey'
  ) THEN
    ALTER TABLE "Payment"
      ADD CONSTRAINT "Payment_sessionId_fkey"
      FOREIGN KEY ("sessionId") REFERENCES "TableSession"("id");
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'Payment_customerId_fkey'
  ) THEN
    ALTER TABLE "Payment"
      ADD CONSTRAINT "Payment_customerId_fkey"
      FOREIGN KEY ("customerId") REFERENCES "Customer"("id");
  END IF;
END $$;

-- ─── CashDrawer ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "CashDrawer" (
  "id"              TEXT NOT NULL,
  "venueId"         TEXT NOT NULL,
  "shiftId"         TEXT,
  "openedBy"        TEXT NOT NULL,
  "openedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "openingCents"    INTEGER NOT NULL,
  "closedBy"        TEXT,
  "closedAt"        TIMESTAMP(3),
  "countedCents"    INTEGER,
  "expectedCents"   INTEGER,
  "differenceCents" INTEGER,
  "note"            TEXT,
  "status"          TEXT NOT NULL DEFAULT 'OPEN',

  CONSTRAINT "CashDrawer_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CashDrawer_venueId_openedAt_idx" ON "CashDrawer" ("venueId", "openedAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'CashDrawer_venueId_fkey'
  ) THEN
    ALTER TABLE "CashDrawer"
      ADD CONSTRAINT "CashDrawer_venueId_fkey"
      FOREIGN KEY ("venueId") REFERENCES "Venue"("id");
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'CashDrawer_shiftId_fkey'
  ) THEN
    ALTER TABLE "CashDrawer"
      ADD CONSTRAINT "CashDrawer_shiftId_fkey"
      FOREIGN KEY ("shiftId") REFERENCES "Shift"("id");
  END IF;
END $$;

-- ─── CoverChargeRule ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "CoverChargeRule" (
  "id"             TEXT NOT NULL,
  "venueId"        TEXT NOT NULL,
  "weekdayCents"   INTEGER NOT NULL DEFAULT 150,
  "weekendCents"   INTEGER NOT NULL DEFAULT 180,
  "weekendDays"    INTEGER[] NOT NULL DEFAULT ARRAY[6, 7]::INTEGER[],
  "appliesTo"      TEXT NOT NULL DEFAULT 'TABLE',

  CONSTRAINT "CoverChargeRule_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'CoverChargeRule_venueId_fkey'
  ) THEN
    ALTER TABLE "CoverChargeRule"
      ADD CONSTRAINT "CoverChargeRule_venueId_fkey"
      FOREIGN KEY ("venueId") REFERENCES "Venue"("id");
  END IF;
END $$;

-- Una regola per venue
CREATE UNIQUE INDEX IF NOT EXISTS "CoverChargeRule_venueId_key"
  ON "CoverChargeRule" ("venueId");
