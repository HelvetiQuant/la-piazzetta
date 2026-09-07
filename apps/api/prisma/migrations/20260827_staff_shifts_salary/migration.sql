-- Modulo stipendi e turni staff
-- Shift: turno di lavoro di un dipendente (clock-in/clock-out)
-- PayrollEntry: voce stipendio calcolata da turni + hourly rate + bonus/deduzioni

CREATE TABLE "Shift" (
    "id"          TEXT NOT NULL,
    "userId"      TEXT NOT NULL,
    "venueId"     TEXT NOT NULL,
    "startedAt"   TIMESTAMP(3) NOT NULL,
    "endedAt"     TIMESTAMP(3),
    "breakMinutes" INTEGER NOT NULL DEFAULT 0,
    "note"        TEXT,
    "status"      TEXT NOT NULL DEFAULT 'OPEN', -- OPEN | CLOSED
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Shift_userId_idx" ON "Shift"("userId");
CREATE INDEX "Shift_venueId_startedAt_idx" ON "Shift"("venueId", "startedAt");

CREATE TABLE "PayrollEntry" (
    "id"             TEXT NOT NULL,
    "userId"         TEXT NOT NULL,
    "venueId"        TEXT NOT NULL,
    "periodStart"    TIMESTAMP(3) NOT NULL,
    "periodEnd"      TIMESTAMP(3) NOT NULL,
    "totalHours"     DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hourlyRateCents" INTEGER NOT NULL DEFAULT 0,
    "basePayCents"   INTEGER NOT NULL DEFAULT 0,
    "bonusCents"     INTEGER NOT NULL DEFAULT 0,
    "deductionCents" INTEGER NOT NULL DEFAULT 0,
    "netPayCents"    INTEGER NOT NULL DEFAULT 0,
    "status"         TEXT NOT NULL DEFAULT 'DRAFT', -- DRAFT | APPROVED | PAID
    "note"           TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PayrollEntry_userId_period_idx" ON "PayrollEntry"("userId", "periodStart");
CREATE INDEX "PayrollEntry_venueId_status_idx" ON "PayrollEntry"("venueId", "status");

-- Aggiungi hourlyRateCents allo User (stipendio orario)
ALTER TABLE "User" ADD COLUMN "hourlyRateCents" INTEGER NOT NULL DEFAULT 0;

-- Foreign keys
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE;
ALTER TABLE "PayrollEntry" ADD CONSTRAINT "PayrollEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;
ALTER TABLE "PayrollEntry" ADD CONSTRAINT "PayrollEntry_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE;
