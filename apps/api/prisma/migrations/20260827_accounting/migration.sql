-- Modulo Contabilità secondo regole italiane (codice civile, art. 2217-2219)
-- Piano dei conti, fatture fornitori, registrazioni, IVA, conto economico, bilancio patrimoniale

-- Piano dei conti (chart of accounts) strutturato per categorie civilistiche
CREATE TABLE "ChartOfAccount" (
    "id"          TEXT NOT NULL,
    "venueId"     TEXT NOT NULL,
    "code"        TEXT NOT NULL, -- es. "1.01", "4.01.01"
    "name"        TEXT NOT NULL,
    "category"    TEXT NOT NULL, -- ATTIVO | PASSIVO | COSTO | RICAVO | CONTRO
    "subcategory" TEXT, -- es. "Immobilizzazioni", "Liquidità", "Acquisti", "Ricavi"
    "type"        TEXT NOT NULL DEFAULT 'DETTAGLIO', -- MAESTRO | DETTAGLIO
    "parentId"    TEXT,
    "vatRate"     DOUBLE PRECISION, -- aliquota IVA default per conti di costo/ricavo
    "deductible"  BOOLEAN NOT NULL DEFAULT true, -- se l'IVA è detraibile
    "active"      BOOLEAN NOT NULL DEFAULT true,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChartOfAccount_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ChartOfAccount_venueId_code_key" UNIQUE ("venueId", "code")
);
CREATE INDEX "ChartOfAccount_venueId_category_idx" ON "ChartOfAccount"("venueId", "category");

-- Fattura fornitore (con upload file)
CREATE TABLE "SupplierInvoice" (
    "id"            TEXT NOT NULL,
    "venueId"       TEXT NOT NULL,
    "supplierId"    TEXT,
    "supplierName"  TEXT NOT NULL,
    "supplierVat"   TEXT, -- partita IVA fornitore
    "invoiceNumber" TEXT NOT NULL,
    "invoiceDate"   DATE NOT NULL,
    "dueDate"       DATE,
    "description"   TEXT,
    "netAmountCents" INTEGER NOT NULL DEFAULT 0, -- imponibile
    "vatRate"       DOUBLE PRECISION NOT NULL DEFAULT 22,
    "vatAmountCents" INTEGER NOT NULL DEFAULT 0, -- IVA
    "totalAmountCents" INTEGER NOT NULL DEFAULT 0, -- totale fattura
    "withholdingRate" DOUBLE PRECISION DEFAULT 0, -- ritenuta d'acconto %
    "withholdingCents" INTEGER NOT NULL DEFAULT 0,
    "status"        TEXT NOT NULL DEFAULT 'RECEIVED', -- RECEIVED | RECORDED | PAID | ARCHIVED
    "filePath"      TEXT, -- path file caricato (PDF/immagine)
    "fileMimeType"  TEXT,
    "ocrData"       JSONB, -- dati estratti da OCR
    "recordedAt"    TIMESTAMP(3),
    "paidAt"        TIMESTAMP(3),
    "paymentMethod" TEXT, -- BONIFICO | CONTANTI | POS | ASSEGNO
    "note"          TEXT,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierInvoice_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SupplierInvoice_venueId_status_idx" ON "SupplierInvoice"("venueId", "status");
CREATE INDEX "SupplierInvoice_venueId_invoiceDate_idx" ON "SupplierInvoice"("venueId", "invoiceDate");

-- Registrazione contabile (journal entry) - partita doppia
CREATE TABLE "JournalEntry" (
    "id"          TEXT NOT NULL,
    "venueId"     TEXT NOT NULL,
    "date"        DATE NOT NULL,
    "description" TEXT NOT NULL,
    "reference"   TEXT, -- numero fattura/riferimento
    "sourceType"  TEXT NOT NULL DEFAULT 'MANUAL', -- MANUAL | SUPPLIER_INVOICE | SALE | PAYMENT | VAT | CLOSURE
    "sourceId"    TEXT, -- ID collegato (es. SupplierInvoice.id)
    "status"      TEXT NOT NULL DEFAULT 'DRAFT', -- DRAFT | POSTED | REVERSED
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "JournalEntry_venueId_date_idx" ON "JournalEntry"("venueId", "date");
CREATE INDEX "JournalEntry_venueId_status_idx" ON "JournalEntry"("venueId", "status");

-- Riga registrazione (debito/credito per ogni conto)
CREATE TABLE "JournalLine" (
    "id"            TEXT NOT NULL,
    "journalEntryId" TEXT NOT NULL,
    "venueId"       TEXT NOT NULL,
    "accountId"     TEXT NOT NULL,
    "debitCents"    INTEGER NOT NULL DEFAULT 0,
    "creditCents"   INTEGER NOT NULL DEFAULT 0,
    "description"   TEXT,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JournalLine_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "JournalLine_journalEntryId_idx" ON "JournalLine"("journalEntryId");
CREATE INDEX "JournalLine_venueId_accountId_idx" ON "JournalLine"("venueId", "accountId");

-- Liquidazione IVA periodica
CREATE TABLE "VatReturn" (
    "id"            TEXT NOT NULL,
    "venueId"       TEXT NOT NULL,
    "period"        TEXT NOT NULL, -- "2026-08" (mensile) o "2026-T3" (trimestrale)
    "periodType"    TEXT NOT NULL DEFAULT 'MONTHLY', -- MONTHLY | QUARTERLY
    "vatCollectedCents" INTEGER NOT NULL DEFAULT 0, -- IVA a debito (vendite)
    "vatPaidCents"  INTEGER NOT NULL DEFAULT 0, -- IVA a credito (acquisti)
    "vatDueCents"   INTEGER NOT NULL DEFAULT 0, -- IVA da versare (collected - paid)
    "status"        TEXT NOT NULL DEFAULT 'DRAFT', -- DRAFT | FILED | PAID
    "filedAt"       TIMESTAMP(3),
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VatReturn_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "VatReturn_venueId_period_key" UNIQUE ("venueId", "period")
);
CREATE INDEX "VatReturn_venueId_idx" ON "VatReturn"("venueId");

-- Centro di costo (per analisi marginale)
CREATE TABLE "CostCenter" (
    "id"        TEXT NOT NULL,
    "venueId"   TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "code"      TEXT,
    "active"    BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CostCenter_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CostCenter_venueId_idx" ON "CostCenter"("venueId");

-- Foreign keys
ALTER TABLE "ChartOfAccount" ADD CONSTRAINT "ChartOfAccount_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE;
ALTER TABLE "ChartOfAccount" ADD CONSTRAINT "ChartOfAccount_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ChartOfAccount"("id") ON DELETE SET NULL;
ALTER TABLE "SupplierInvoice" ADD CONSTRAINT "SupplierInvoice_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE;
ALTER TABLE "SupplierInvoice" ADD CONSTRAINT "SupplierInvoice_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL;
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE;
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE CASCADE;
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE;
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ChartOfAccount"("id") ON DELETE RESTRICT;
ALTER TABLE "VatReturn" ADD CONSTRAINT "VatReturn_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE;
ALTER TABLE "CostCenter" ADD CONSTRAINT "CostCenter_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE;
