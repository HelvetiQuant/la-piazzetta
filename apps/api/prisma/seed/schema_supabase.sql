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
