-- ============================================================
--  La Piazzetta — TUTTO IN UNO (schema + menu) per Supabase SQL Editor.
--  Incolla ed esegui. Idempotente/rieseguibile.
-- ============================================================

-- ============================================================
--  La Piazzetta — Schema completo per Supabase (SQL Editor)
--  Corrisponde a apps/api/prisma/schema.prisma.
--  Idempotente: CREATE TABLE IF NOT EXISTS + vincoli guardati.
--  Dopo averlo eseguito, importa il menu con menu_prices.sql.
-- ============================================================
BEGIN;

-- ---------- Anagrafiche base ----------
CREATE TABLE IF NOT EXISTS "Venue" (
  "id"        text PRIMARY KEY,
  "name"      text NOT NULL,
  "plan"      text NOT NULL DEFAULT 'PRO',
  "createdAt" timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt" timestamp(3) NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "User" (
  "id"           text PRIMARY KEY,
  "venueId"      text NOT NULL,
  "email"        text NOT NULL,
  "name"         text NOT NULL,
  "roles"        text[] NOT NULL DEFAULT ARRAY['WAITER']::text[],
  "pin"          text,
  "passwordHash" text,
  "createdAt"    timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"    timestamp(3) NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "User_venueId_email_key" ON "User"("venueId","email");

CREATE TABLE IF NOT EXISTS "RefreshToken" (
  "id"        text PRIMARY KEY,
  "userId"    text NOT NULL,
  "tokenHash" text NOT NULL,
  "expiresAt" timestamp(3) NOT NULL,
  "revokedAt" timestamp(3),
  "createdAt" timestamp(3) NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");
CREATE INDEX IF NOT EXISTS "RefreshToken_userId_idx"    ON "RefreshToken"("userId");
CREATE INDEX IF NOT EXISTS "RefreshToken_tokenHash_idx" ON "RefreshToken"("tokenHash");

CREATE TABLE IF NOT EXISTS "VenueAddon" (
  "id"        text PRIMARY KEY,
  "venueId"   text NOT NULL,
  "addonId"   text NOT NULL,
  "active"    boolean NOT NULL DEFAULT true,
  "createdAt" timestamp(3) NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "VenueAddon_venueId_addonId_key" ON "VenueAddon"("venueId","addonId");
CREATE INDEX IF NOT EXISTS "VenueAddon_venueId_idx" ON "VenueAddon"("venueId");

-- ---------- Catalogo & magazzino ----------
CREATE TABLE IF NOT EXISTS "Product" (
  "id"         text PRIMARY KEY,
  "venueId"    text NOT NULL,
  "code"       text NOT NULL,
  "name"       text NOT NULL,
  "category"   text NOT NULL DEFAULT 'generic',
  "priceCents" integer NOT NULL,
  "unit"       text NOT NULL DEFAULT 'pz',
  "createdAt"  timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"  timestamp(3) NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "Product_venueId_code_key" ON "Product"("venueId","code");

CREATE TABLE IF NOT EXISTS "StockItem" (
  "id"           text PRIMARY KEY,
  "productId"    text NOT NULL,
  "quantity"     integer NOT NULL DEFAULT 0,
  "reorderLevel" integer NOT NULL DEFAULT 0,
  "parLevel"     integer NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS "StockItem_productId_key" ON "StockItem"("productId");

CREATE TABLE IF NOT EXISTS "StockMovement" (
  "id"        text PRIMARY KEY,
  "productId" text NOT NULL,
  "type"      text NOT NULL,
  "qtyDelta"  integer NOT NULL,
  "qtyAfter"  integer NOT NULL,
  "reason"    text,
  "orderId"   text,
  "createdBy" text,
  "createdAt" timestamp(3) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "StockMovement_productId_idx" ON "StockMovement"("productId");
CREATE INDEX IF NOT EXISTS "StockMovement_type_idx"      ON "StockMovement"("type");
CREATE INDEX IF NOT EXISTS "StockMovement_createdAt_idx" ON "StockMovement"("createdAt");

CREATE TABLE IF NOT EXISTS "RecipeItem" (
  "id"           text PRIMARY KEY,
  "productId"    text NOT NULL,
  "ingredientId" text NOT NULL,
  "amount"       integer NOT NULL
);

-- ---------- Tavoli, sessioni, ordini ----------
CREATE TABLE IF NOT EXISTS "Table" (
  "id"        text PRIMARY KEY,
  "venueId"   text NOT NULL,
  "code"      text NOT NULL,
  "name"      text NOT NULL,
  "area"      text NOT NULL DEFAULT 'indoor',
  "seats"     integer NOT NULL DEFAULT 4,
  "state"     text NOT NULL DEFAULT 'FREE',
  "createdAt" timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt" timestamp(3) NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "Table_venueId_code_key" ON "Table"("venueId","code");

CREATE TABLE IF NOT EXISTS "TableSession" (
  "id"        text PRIMARY KEY,
  "tableId"   text NOT NULL,
  "guests"    integer NOT NULL DEFAULT 1,
  "state"     text NOT NULL DEFAULT 'OPEN',
  "createdAt" timestamp(3) NOT NULL DEFAULT now(),
  "closedAt"  timestamp(3)
);

CREATE TABLE IF NOT EXISTS "Order" (
  "id"            text PRIMARY KEY,
  "sessionId"     text NOT NULL,
  "clientOrderId" text,
  "status"        text NOT NULL DEFAULT 'DRAFT',
  "totalCents"    integer NOT NULL DEFAULT 0,
  "placedAt"      timestamp(3) NOT NULL DEFAULT now(),
  "sentAt"        timestamp(3),
  "servedAt"      timestamp(3),
  "paidAt"        timestamp(3),
  "createdAt"     timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"     timestamp(3) NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "Order_clientOrderId_key" ON "Order"("clientOrderId");
CREATE INDEX IF NOT EXISTS "Order_sessionId_idx" ON "Order"("sessionId");
CREATE INDEX IF NOT EXISTS "Order_status_idx"    ON "Order"("status");
CREATE INDEX IF NOT EXISTS "Order_placedAt_idx"  ON "Order"("placedAt");

CREATE TABLE IF NOT EXISTS "OrderItem" (
  "id"        text PRIMARY KEY,
  "orderId"   text NOT NULL,
  "productId" text NOT NULL,
  "quantity"  integer NOT NULL,
  "unitCents" integer NOT NULL,
  "status"    text NOT NULL DEFAULT 'PENDING',
  "station"   text NOT NULL DEFAULT 'BAR',
  "sentAt"    timestamp(3),
  "startedAt" timestamp(3),
  "readyAt"   timestamp(3),
  "servedAt"  timestamp(3)
);
CREATE INDEX IF NOT EXISTS "OrderItem_orderId_idx" ON "OrderItem"("orderId");
CREATE INDEX IF NOT EXISTS "OrderItem_station_idx" ON "OrderItem"("station");
CREATE INDEX IF NOT EXISTS "OrderItem_status_idx"  ON "OrderItem"("status");

-- ---------- Fornitori & acquisti ----------
CREATE TABLE IF NOT EXISTS "Supplier" (
  "id"        text PRIMARY KEY,
  "venueId"   text NOT NULL,
  "name"      text NOT NULL,
  "email"     text,
  "phone"     text,
  "notes"     text,
  "active"    boolean NOT NULL DEFAULT true,
  "createdAt" timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt" timestamp(3) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "Supplier_venueId_idx" ON "Supplier"("venueId");

CREATE TABLE IF NOT EXISTS "PurchaseOrder" (
  "id"         text PRIMARY KEY,
  "venueId"    text NOT NULL,
  "supplierId" text NOT NULL,
  "status"     text NOT NULL DEFAULT 'DRAFT',
  "totalCents" integer NOT NULL DEFAULT 0,
  "note"       text,
  "createdBy"  text,
  "sentAt"     timestamp(3),
  "receivedAt" timestamp(3),
  "createdAt"  timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"  timestamp(3) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "PurchaseOrder_venueId_idx"    ON "PurchaseOrder"("venueId");
CREATE INDEX IF NOT EXISTS "PurchaseOrder_supplierId_idx" ON "PurchaseOrder"("supplierId");
CREATE INDEX IF NOT EXISTS "PurchaseOrder_status_idx"     ON "PurchaseOrder"("status");

CREATE TABLE IF NOT EXISTS "PurchaseOrderItem" (
  "id"              text PRIMARY KEY,
  "purchaseOrderId" text NOT NULL,
  "productId"       text NOT NULL,
  "packSize"        integer NOT NULL DEFAULT 1,
  "packsOrdered"    integer NOT NULL,
  "packsReceived"   integer NOT NULL DEFAULT 0,
  "packPriceCents"  integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS "PurchaseOrderItem_purchaseOrderId_idx" ON "PurchaseOrderItem"("purchaseOrderId");
CREATE INDEX IF NOT EXISTS "PurchaseOrderItem_productId_idx"       ON "PurchaseOrderItem"("productId");

CREATE TABLE IF NOT EXISTS "SupplierProduct" (
  "id"             text PRIMARY KEY,
  "supplierId"     text NOT NULL,
  "productId"      text NOT NULL,
  "supplierSku"    text,
  "packSize"       integer NOT NULL DEFAULT 1,
  "packPriceCents" integer NOT NULL DEFAULT 0,
  "leadTimeDays"   integer NOT NULL DEFAULT 2,
  "preferred"      boolean NOT NULL DEFAULT false,
  "createdAt"      timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"      timestamp(3) NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "SupplierProduct_supplierId_productId_key" ON "SupplierProduct"("supplierId","productId");
CREATE INDEX IF NOT EXISTS "SupplierProduct_productId_idx" ON "SupplierProduct"("productId");

-- ---------- Clienti & crediti ----------
CREATE TABLE IF NOT EXISTS "Customer" (
  "id"           text PRIMARY KEY,
  "venueId"      text NOT NULL,
  "name"         text NOT NULL,
  "phone"        text,
  "email"        text,
  "notes"        text,
  "balanceCents" integer NOT NULL DEFAULT 0,
  "limitCents"   integer NOT NULL DEFAULT 0,
  "active"       boolean NOT NULL DEFAULT true,
  "createdAt"    timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"    timestamp(3) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "Customer_venueId_idx"       ON "Customer"("venueId");
CREATE INDEX IF NOT EXISTS "Customer_venueId_name_idx"  ON "Customer"("venueId","name");

CREATE TABLE IF NOT EXISTS "CreditTransaction" (
  "id"                text PRIMARY KEY,
  "customerId"        text NOT NULL,
  "type"              text NOT NULL,
  "amountCents"       integer NOT NULL,
  "balanceAfterCents" integer NOT NULL,
  "orderId"           text,
  "method"            text,
  "note"              text,
  "createdBy"         text,
  "createdAt"         timestamp(3) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "CreditTransaction_customerId_idx" ON "CreditTransaction"("customerId");
CREATE INDEX IF NOT EXISTS "CreditTransaction_createdAt_idx"  ON "CreditTransaction"("createdAt");

-- ---------- Foreign key (guardate: rieseguibili) ----------
DO $$ BEGIN
  ALTER TABLE "User"              ADD CONSTRAINT "User_venueId_fkey"                FOREIGN KEY ("venueId")         REFERENCES "Venue"("id")         ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "RefreshToken"      ADD CONSTRAINT "RefreshToken_userId_fkey"         FOREIGN KEY ("userId")          REFERENCES "User"("id")          ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "VenueAddon"        ADD CONSTRAINT "VenueAddon_venueId_fkey"          FOREIGN KEY ("venueId")         REFERENCES "Venue"("id")         ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Product"           ADD CONSTRAINT "Product_venueId_fkey"             FOREIGN KEY ("venueId")         REFERENCES "Venue"("id")         ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "StockItem"         ADD CONSTRAINT "StockItem_productId_fkey"         FOREIGN KEY ("productId")       REFERENCES "Product"("id")       ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "StockMovement"     ADD CONSTRAINT "StockMovement_productId_fkey"     FOREIGN KEY ("productId")       REFERENCES "Product"("id")       ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "RecipeItem"        ADD CONSTRAINT "RecipeItem_productId_fkey"        FOREIGN KEY ("productId")       REFERENCES "Product"("id")       ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "RecipeItem"        ADD CONSTRAINT "RecipeItem_ingredientId_fkey"     FOREIGN KEY ("ingredientId")    REFERENCES "Product"("id")       ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Table"             ADD CONSTRAINT "Table_venueId_fkey"               FOREIGN KEY ("venueId")         REFERENCES "Venue"("id")         ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "TableSession"      ADD CONSTRAINT "TableSession_tableId_fkey"        FOREIGN KEY ("tableId")         REFERENCES "Table"("id")         ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Order"             ADD CONSTRAINT "Order_sessionId_fkey"             FOREIGN KEY ("sessionId")       REFERENCES "TableSession"("id")  ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "OrderItem"         ADD CONSTRAINT "OrderItem_orderId_fkey"           FOREIGN KEY ("orderId")         REFERENCES "Order"("id")         ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "OrderItem"         ADD CONSTRAINT "OrderItem_productId_fkey"         FOREIGN KEY ("productId")       REFERENCES "Product"("id")       ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Supplier"          ADD CONSTRAINT "Supplier_venueId_fkey"            FOREIGN KEY ("venueId")         REFERENCES "Venue"("id")         ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "PurchaseOrder"     ADD CONSTRAINT "PurchaseOrder_supplierId_fkey"    FOREIGN KEY ("supplierId")      REFERENCES "Supplier"("id")      ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "SupplierProduct"   ADD CONSTRAINT "SupplierProduct_supplierId_fkey"  FOREIGN KEY ("supplierId")      REFERENCES "Supplier"("id")      ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "SupplierProduct"   ADD CONSTRAINT "SupplierProduct_productId_fkey"   FOREIGN KEY ("productId")       REFERENCES "Product"("id")       ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Customer"          ADD CONSTRAINT "Customer_venueId_fkey"            FOREIGN KEY ("venueId")         REFERENCES "Venue"("id")         ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "CreditTransaction" ADD CONSTRAINT "CreditTransaction_customerId_fkey" FOREIGN KEY ("customerId")     REFERENCES "Customer"("id")      ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;

-- Fine schema. Passo successivo: eseguire menu_prices.sql per importare i 161 prodotti.

-- Import menu La Piazzetta — generato da menu.data.ts. Idempotente (ON CONFLICT).
BEGIN;

-- Venue
INSERT INTO "Venue" ("id","name","plan","createdAt","updatedAt") VALUES ('venue_piazzetta', 'La Piazzetta', 'PRO', now(), now())
ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name", "updatedAt" = now();

-- Prodotti
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_col_001', 'venue_piazzetta', 'COL-001', 'Caffè', 'colazione', 150, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_col_002', 'venue_piazzetta', 'COL-002', 'Caffè deca', 'colazione', 170, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_col_003', 'venue_piazzetta', 'COL-003', 'Caffè corretto', 'colazione', 300, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_col_004', 'venue_piazzetta', 'COL-004', 'Marocchino', 'colazione', 180, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_col_005', 'venue_piazzetta', 'COL-005', 'Orzo piccolo', 'colazione', 180, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_col_006', 'venue_piazzetta', 'COL-006', 'Orzo grande', 'colazione', 190, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_col_007', 'venue_piazzetta', 'COL-007', 'Ginseng piccolo', 'colazione', 180, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_col_008', 'venue_piazzetta', 'COL-008', 'Ginseng grande', 'colazione', 190, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_col_009', 'venue_piazzetta', 'COL-009', 'Caffè shakerato', 'colazione', 400, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now(); -- range 4/5,00
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_col_010', 'venue_piazzetta', 'COL-010', 'Macchiatone', 'colazione', 170, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_col_011', 'venue_piazzetta', 'COL-011', 'Macchiatone soia/avena', 'colazione', 200, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_col_012', 'venue_piazzetta', 'COL-012', 'Cappuccino', 'colazione', 200, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_col_013', 'venue_piazzetta', 'COL-013', 'Cappuccino deca', 'colazione', 220, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_col_014', 'venue_piazzetta', 'COL-014', 'Cappuccino latte di soia', 'colazione', 220, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_col_015', 'venue_piazzetta', 'COL-015', 'Cappuccino latte d''avena', 'colazione', 250, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_col_016', 'venue_piazzetta', 'COL-016', 'Cappuccino orzo/ginseng', 'colazione', 220, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_col_017', 'venue_piazzetta', 'COL-017', 'Latte bianco', 'colazione', 160, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_col_018', 'venue_piazzetta', 'COL-018', 'Latte macchiato', 'colazione', 220, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_col_019', 'venue_piazzetta', 'COL-019', 'Latte di soia', 'colazione', 250, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_col_020', 'venue_piazzetta', 'COL-020', 'Latte d''avena', 'colazione', 270, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_col_021', 'venue_piazzetta', 'COL-021', 'Latte e menta', 'colazione', 350, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_col_022', 'venue_piazzetta', 'COL-022', 'Cioccolata', 'colazione', 400, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_col_023', 'venue_piazzetta', 'COL-023', 'Cioccolata con panna', 'colazione', 450, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_col_024', 'venue_piazzetta', 'COL-024', 'The / Infusi / Tisane', 'colazione', 450, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_col_025', 'venue_piazzetta', 'COL-025', 'Camomilla', 'colazione', 300, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_col_026', 'venue_piazzetta', 'COL-026', 'Acqua e menta', 'colazione', 300, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_col_027', 'venue_piazzetta', 'COL-027', '1/2 acqua', 'colazione', 150, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_col_028', 'venue_piazzetta', 'COL-028', 'Bicchiere acqua', 'colazione', 50, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_col_029', 'venue_piazzetta', 'COL-029', 'Spremute', 'colazione', 400, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_col_030', 'venue_piazzetta', 'COL-030', 'Centrifughe', 'colazione', 500, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now(); -- range 5/7,00
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_col_031', 'venue_piazzetta', 'COL-031', 'Brioches vuota', 'colazione', 130, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_col_032', 'venue_piazzetta', 'COL-032', 'Brioches farcite', 'colazione', 150, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_col_033', 'venue_piazzetta', 'COL-033', 'Brioches di pasticceria', 'colazione', 160, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_col_034', 'venue_piazzetta', 'COL-034', 'Tortino', 'colazione', 400, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now(); -- range 4/5,00
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_col_035', 'venue_piazzetta', 'COL-035', 'Crema al caffè', 'colazione', 350, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_col_036', 'venue_piazzetta', 'COL-036', 'Focaccia', 'colazione', 120, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_tav_001', 'venue_piazzetta', 'TAV-001', 'Focaccine farcite', 'tavola_calda', 350, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_tav_002', 'venue_piazzetta', 'TAV-002', 'Toast', 'tavola_calda', 400, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_tav_003', 'venue_piazzetta', 'TAV-003', 'Tramezzini', 'tavola_calda', 350, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_tav_004', 'venue_piazzetta', 'TAV-004', 'Panini', 'tavola_calda', 500, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_tav_005', 'venue_piazzetta', 'TAV-005', 'Panino Hamburger', 'tavola_calda', 800, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_tav_006', 'venue_piazzetta', 'TAV-006', 'Patatine fritte', 'tavola_calda', 500, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_bib_001', 'venue_piazzetta', 'BIB-001', 'Bicchiere H2O', 'bibite', 50, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_bib_002', 'venue_piazzetta', 'BIB-002', 'H2O minerale 50 cl', 'bibite', 150, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_bib_003', 'venue_piazzetta', 'BIB-003', 'Bibite in lattina', 'bibite', 350, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now(); -- range 3,5/5,50
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_bib_004', 'venue_piazzetta', 'BIB-004', 'Succhi di frutta', 'bibite', 350, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now(); -- range 3,5/5,50
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_bib_005', 'venue_piazzetta', 'BIB-005', 'Frullati di frutta fresca', 'bibite', 500, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now(); -- range 5/5,50
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_bib_006', 'venue_piazzetta', 'BIB-006', 'Amari', 'bibite', 400, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_bib_007', 'venue_piazzetta', 'BIB-007', 'Vermouth', 'bibite', 600, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_bib_008', 'venue_piazzetta', 'BIB-008', 'Aperitivi (Martini/Aperol/Bitter/Crodino/Sanbitter/Campari soda)', 'bibite', 500, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_bib_009', 'venue_piazzetta', 'BIB-009', 'Pastis', 'bibite', 600, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_bib_010', 'venue_piazzetta', 'BIB-010', 'Limoncello', 'bibite', 400, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_bib_011', 'venue_piazzetta', 'BIB-011', 'Mirto', 'bibite', 400, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_bib_012', 'venue_piazzetta', 'BIB-012', 'Liquore alla liquirizia', 'bibite', 400, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_bir_001', 'venue_piazzetta', 'BIR-001', 'Birre in bottiglia', 'birra', 650, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_bir_002', 'venue_piazzetta', 'BIR-002', 'San Gabriel Ambra Rossa', 'birra', 650, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_bir_003', 'venue_piazzetta', 'BIR-003', 'San Gabriel Bionda', 'birra', 650, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_bir_004', 'venue_piazzetta', 'BIR-004', 'San Gabriel Buschina', 'birra', 650, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_bir_005', 'venue_piazzetta', 'BIR-005', 'San Gabriel Esportazione (IPA)', 'birra', 650, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_bir_006', 'venue_piazzetta', 'BIR-006', 'Poretti Bionda alla spina (piccola)', 'birra', 500, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_bir_007', 'venue_piazzetta', 'BIR-007', 'Poretti Bionda alla spina (media)', 'birra', 600, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_bir_008', 'venue_piazzetta', 'BIR-008', 'Poretti Rossa alla spina (piccola)', 'birra', 500, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_bir_009', 'venue_piazzetta', 'BIR-009', 'Poretti Rossa alla spina (media)', 'birra', 600, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_bir_010', 'venue_piazzetta', 'BIR-010', 'Poretti IPA alla spina (piccola)', 'birra', 500, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_bir_011', 'venue_piazzetta', 'BIR-011', 'Poretti IPA alla spina (media)', 'birra', 600, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_bir_012', 'venue_piazzetta', 'BIR-012', 'Tennent''s', 'birra', 500, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_bir_013', 'venue_piazzetta', 'BIR-013', 'Corona', 'birra', 500, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_bir_014', 'venue_piazzetta', 'BIR-014', 'Beck''s', 'birra', 500, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_bir_015', 'venue_piazzetta', 'BIR-015', 'Ceres', 'birra', 500, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_bol_001', 'venue_piazzetta', 'BOL-001', 'Prosecco Mionetto Valdobbiadene (calice)', 'bollicine', 600, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_bol_002', 'venue_piazzetta', 'BOL-002', 'Prosecco Mionetto Valdobbiadene (bottiglia)', 'bollicine', 3000, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_bol_003', 'venue_piazzetta', 'BOL-003', 'Prosecco Mionetto Valdobbiadene Sergio (calice)', 'bollicine', 600, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_bol_004', 'venue_piazzetta', 'BOL-004', 'Prosecco Mionetto Valdobbiadene Sergio (bottiglia)', 'bollicine', 3500, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_bol_005', 'venue_piazzetta', 'BOL-005', 'Prosecco Mionetto Valdobbiadene Rosè (calice)', 'bollicine', 600, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_bol_006', 'venue_piazzetta', 'BOL-006', 'Prosecco Mionetto Valdobbiadene Rosè (bottiglia)', 'bollicine', 3500, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_bol_007', 'venue_piazzetta', 'BOL-007', 'Franciacorta Martinelli (calice)', 'bollicine', 700, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_bol_008', 'venue_piazzetta', 'BOL-008', 'Franciacorta Martinelli (bottiglia)', 'bollicine', 4000, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_bol_009', 'venue_piazzetta', 'BOL-009', 'Franciacorta Barone Pizzini (calice)', 'bollicine', 700, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_bol_010', 'venue_piazzetta', 'BOL-010', 'Franciacorta Barone Pizzini (bottiglia)', 'bollicine', 4500, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_bol_011', 'venue_piazzetta', 'BOL-011', 'Franciacorta Ca'' Del Bosco (bottiglia)', 'bollicine', 6000, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_bol_012', 'venue_piazzetta', 'BOL-012', 'Franciacorta Bellavista (bottiglia)', 'bollicine', 6000, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_bol_013', 'venue_piazzetta', 'BOL-013', 'Champagne Moet Chandon (bottiglia)', 'bollicine', 7000, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_bol_014', 'venue_piazzetta', 'BOL-014', 'Champagne Deutz (bottiglia)', 'bollicine', 7000, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_bol_015', 'venue_piazzetta', 'BOL-015', 'Champagne Deutz Rosè (bottiglia)', 'bollicine', 8000, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_ckt_001', 'venue_piazzetta', 'CKT-001', 'Americano', 'cocktail', 800, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_ckt_002', 'venue_piazzetta', 'CKT-002', 'Bacardi Cocktail', 'cocktail', 800, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_ckt_003', 'venue_piazzetta', 'CKT-003', 'Between The Streets', 'cocktail', 800, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_ckt_004', 'venue_piazzetta', 'CKT-004', 'Black Russian', 'cocktail', 800, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_ckt_005', 'venue_piazzetta', 'CKT-005', 'Bloody Mary', 'cocktail', 800, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_ckt_006', 'venue_piazzetta', 'CKT-006', 'Caipiriña', 'cocktail', 800, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_ckt_007', 'venue_piazzetta', 'CKT-007', 'Caipiraia', 'cocktail', 800, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_ckt_008', 'venue_piazzetta', 'CKT-008', 'Caipirissima', 'cocktail', 800, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_ckt_009', 'venue_piazzetta', 'CKT-009', 'Caipiroska', 'cocktail', 800, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_ckt_010', 'venue_piazzetta', 'CKT-010', 'Campari Orange', 'cocktail', 800, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_ckt_011', 'venue_piazzetta', 'CKT-011', 'Daiquiri', 'cocktail', 800, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_ckt_012', 'venue_piazzetta', 'CKT-012', 'Gin Fizz', 'cocktail', 800, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_ckt_013', 'venue_piazzetta', 'CKT-013', 'Long Island Ice Tea', 'cocktail', 800, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_ckt_014', 'venue_piazzetta', 'CKT-014', 'Mai-Tai', 'cocktail', 800, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_ckt_015', 'venue_piazzetta', 'CKT-015', 'Manhattan', 'cocktail', 800, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_ckt_016', 'venue_piazzetta', 'CKT-016', 'Margarita', 'cocktail', 800, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_ckt_017', 'venue_piazzetta', 'CKT-017', 'Mary Pickford', 'cocktail', 800, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_ckt_018', 'venue_piazzetta', 'CKT-018', 'Negroni', 'cocktail', 800, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_ckt_019', 'venue_piazzetta', 'CKT-019', 'Negroni Sbagliato', 'cocktail', 800, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_ckt_020', 'venue_piazzetta', 'CKT-020', 'Negrosky', 'cocktail', 800, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_ckt_021', 'venue_piazzetta', 'CKT-021', 'Old Fashioned', 'cocktail', 800, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_ckt_022', 'venue_piazzetta', 'CKT-022', 'Piña Colada', 'cocktail', 800, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_ckt_023', 'venue_piazzetta', 'CKT-023', 'Piglione Defaticante', 'cocktail', 800, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_ckt_024', 'venue_piazzetta', 'CKT-024', 'Screw Driver', 'cocktail', 800, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_ckt_025', 'venue_piazzetta', 'CKT-025', 'Sidecar', 'cocktail', 800, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_ckt_026', 'venue_piazzetta', 'CKT-026', 'Stinger', 'cocktail', 800, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_ckt_027', 'venue_piazzetta', 'CKT-027', 'Strawberry Daiquiry', 'cocktail', 800, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_ckt_028', 'venue_piazzetta', 'CKT-028', 'Tequila Sunrise', 'cocktail', 800, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_ckt_029', 'venue_piazzetta', 'CKT-029', 'Vodka Stinger', 'cocktail', 800, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_ckt_030', 'venue_piazzetta', 'CKT-030', 'Vodka Martini', 'cocktail', 800, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_ckt_031', 'venue_piazzetta', 'CKT-031', 'Martini Cocktail', 'cocktail', 800, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_ckt_032', 'venue_piazzetta', 'CKT-032', 'White Lady', 'cocktail', 800, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_ckt_033', 'venue_piazzetta', 'CKT-033', 'Mojito', 'cocktail', 800, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_ckt_034', 'venue_piazzetta', 'CKT-034', 'Mojito Zenzero Lamponi', 'cocktail', 800, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_ckt_035', 'venue_piazzetta', 'CKT-035', 'Mojito Mule', 'cocktail', 800, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_ckt_036', 'venue_piazzetta', 'CKT-036', 'Moscow Mule', 'cocktail', 800, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_cks_001', 'venue_piazzetta', 'CKS-001', 'Bellini', 'cocktail', 1000, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_cks_002', 'venue_piazzetta', 'CKS-002', 'Rossini', 'cocktail', 1000, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_cks_003', 'venue_piazzetta', 'CKS-003', 'Mimosa', 'cocktail', 1000, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_cks_004', 'venue_piazzetta', 'CKS-004', 'Kir Royal', 'cocktail', 800, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_cks_005', 'venue_piazzetta', 'CKS-005', 'Aperol Spritz', 'cocktail', 800, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_cks_006', 'venue_piazzetta', 'CKS-006', 'B4 Hugo Spritz', 'cocktail', 800, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_cka_001', 'venue_piazzetta', 'CKA-001', 'Coconut', 'cocktail_analcolico', 750, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_cka_002', 'venue_piazzetta', 'CKA-002', 'Golden Sunset Arancia', 'cocktail_analcolico', 750, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_cka_003', 'venue_piazzetta', 'CKA-003', 'Luisita', 'cocktail_analcolico', 750, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_cka_004', 'venue_piazzetta', 'CKA-004', 'Pellicano', 'cocktail_analcolico', 750, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_cka_005', 'venue_piazzetta', 'CKA-005', 'Piazzetta', 'cocktail_analcolico', 750, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_cka_006', 'venue_piazzetta', 'CKA-006', 'Sherley Temple', 'cocktail_analcolico', 750, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_gin_001', 'venue_piazzetta', 'GIN-001', 'Ginuensis', 'gin', 900, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_gin_002', 'venue_piazzetta', 'GIN-002', 'Bombay', 'gin', 900, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_gin_003', 'venue_piazzetta', 'GIN-003', 'Tanqueray', 'gin', 900, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_gin_004', 'venue_piazzetta', 'GIN-004', 'Beefeater 24', 'gin', 1200, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_gin_005', 'venue_piazzetta', 'GIN-005', 'Gin Mare', 'gin', 1200, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_gin_006', 'venue_piazzetta', 'GIN-006', 'Hendricks', 'gin', 1200, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_gin_007', 'venue_piazzetta', 'GIN-007', 'Elephant', 'gin', 1200, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_gin_008', 'venue_piazzetta', 'GIN-008', 'Gin Arte', 'gin', 1200, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_gin_009', 'venue_piazzetta', 'GIN-009', 'The Barmaster', 'gin', 1200, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_gin_010', 'venue_piazzetta', 'GIN-010', 'Major', 'gin', 1200, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_gin_011', 'venue_piazzetta', 'GIN-011', 'Salent Pool', 'gin', 1200, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_gin_012', 'venue_piazzetta', 'GIN-012', 'Acquaverdi', 'gin', 1200, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_gin_013', 'venue_piazzetta', 'GIN-013', 'Malfi Pompelmo', 'gin', 1200, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_gin_014', 'venue_piazzetta', 'GIN-014', 'Brookmans', 'gin', 1200, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_whi_001', 'venue_piazzetta', 'WHI-001', 'Lagavulin', 'whisky', 900, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_whi_002', 'venue_piazzetta', 'WHI-002', 'Oban', 'whisky', 900, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_whi_003', 'venue_piazzetta', 'WHI-003', 'Talisker', 'whisky', 900, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_whi_004', 'venue_piazzetta', 'WHI-004', 'Laphroaig', 'whisky', 900, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_whi_005', 'venue_piazzetta', 'WHI-005', 'Glen Grant', 'whisky', 800, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_whi_006', 'venue_piazzetta', 'WHI-006', 'Glen Morange', 'whisky', 900, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_whi_007', 'venue_piazzetta', 'WHI-007', 'Jack Daniels', 'whisky', 800, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_whi_008', 'venue_piazzetta', 'WHI-008', 'Wild Turkey', 'whisky', 800, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_whi_009', 'venue_piazzetta', 'WHI-009', 'Four Roses', 'whisky', 800, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_rum_001', 'venue_piazzetta', 'RUM-001', 'Zacapa', 'rum', 800, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_rum_002', 'venue_piazzetta', 'RUM-002', 'Diplomatico Mantuano', 'rum', 800, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_rum_003', 'venue_piazzetta', 'RUM-003', 'Diplomatico Anniversario', 'rum', 900, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_rum_004', 'venue_piazzetta', 'RUM-004', 'Santa Teresa', 'rum', 800, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_rum_005', 'venue_piazzetta', 'RUM-005', 'Havana 7 anni', 'rum', 700, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();
INSERT INTO "Product" ("id","venueId","code","name","category","priceCents","unit","createdAt","updatedAt") VALUES ('prod_rum_006', 'venue_piazzetta', 'RUM-006', 'Pampero Anniversario', 'rum', 800, 'pz', now(), now()) ON CONFLICT ("venueId","code") DO UPDATE SET "name" = EXCLUDED."name", "category" = EXCLUDED."category", "priceCents" = EXCLUDED."priceCents", "unit" = EXCLUDED."unit", "updatedAt" = now();

COMMIT;
