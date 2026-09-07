-- Modulo gestione orari dipendenti: disponibilità, scheduling, chat condivisa

-- Disponibilità settimanale dipendente (template ricorrente)
CREATE TABLE "StaffAvailability" (
    "id"          TEXT NOT NULL,
    "userId"      TEXT NOT NULL,
    "venueId"     TEXT NOT NULL,
    "dayOfWeek"   INTEGER NOT NULL, -- 0=Domenica, 1=Lunedì, ..., 6=Sabato
    "startHour"   INTEGER NOT NULL, -- 0-23
    "endHour"     INTEGER NOT NULL, -- 1-24
    "preference"  TEXT NOT NULL DEFAULT 'AVAILABLE', -- AVAILABLE | PREFERRED | UNAVAILABLE
    "note"        TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffAvailability_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "StaffAvailability_userId_idx" ON "StaffAvailability"("userId");
CREATE INDEX "StaffAvailability_venueId_dayOfWeek_idx" ON "StaffAvailability"("venueId", "dayOfWeek");

-- Turno programmato (schedulato, non ancora iniziato)
CREATE TABLE "ScheduledShift" (
    "id"          TEXT NOT NULL,
    "userId"      TEXT NOT NULL,
    "venueId"     TEXT NOT NULL,
    "date"        DATE NOT NULL,
    "startHour"   INTEGER NOT NULL, -- 0-23
    "endHour"     INTEGER NOT NULL, -- 1-24
    "role"        TEXT, -- ruolo assegnato per il turno
    "station"     TEXT, -- BAR | TAVOLA_CALDA | GENERALE
    "status"      TEXT NOT NULL DEFAULT 'SCHEDULED', -- SCHEDULED | CONFIRMED | STARTED | COMPLETED | CANCELLED
    "aiSuggested" BOOLEAN NOT NULL DEFAULT false,
    "aiConfidence" DOUBLE PRECISION,
    "shiftId"     TEXT, -- link al turno effettivo quando viene clock-in
    "note"        TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledShift_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ScheduledShift_venueId_date_idx" ON "ScheduledShift"("venueId", "date");
CREATE INDEX "ScheduledShift_userId_date_idx" ON "ScheduledShift"("userId", "date");

-- Chat room per venue (chat condivisa staff)
CREATE TABLE "StaffChatRoom" (
    "id"          TEXT NOT NULL,
    "venueId"     TEXT NOT NULL,
    "name"        TEXT NOT NULL DEFAULT 'Staff Generale',
    "type"        TEXT NOT NULL DEFAULT 'VENUE', -- VENUE (tutti) | TEAM (solo alcuni ruoli)
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffChatRoom_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "StaffChatRoom_venueId_idx" ON "StaffChatRoom"("venueId");

-- Messaggi chat
CREATE TABLE "StaffChatMessage" (
    "id"          TEXT NOT NULL,
    "roomId"      TEXT NOT NULL,
    "userId"      TEXT,
    "venueId"     TEXT NOT NULL,
    "text"        TEXT NOT NULL,
    "type"        TEXT NOT NULL DEFAULT 'TEXT', -- TEXT | AI_SUGGESTION | SYSTEM | IMAGE
    "aiGenerated" BOOLEAN NOT NULL DEFAULT false,
    "meta"        JSONB, -- allegati, riferimenti a turni, ecc.
    "readBy"      TEXT[] DEFAULT '{}',
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffChatMessage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "StaffChatMessage_roomId_createdAt_idx" ON "StaffChatMessage"("roomId", "createdAt");
CREATE INDEX "StaffChatMessage_venueId_idx" ON "StaffChatMessage"("venueId");

-- Foreign keys
ALTER TABLE "StaffAvailability" ADD CONSTRAINT "StaffAvailability_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;
ALTER TABLE "StaffAvailability" ADD CONSTRAINT "StaffAvailability_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE;
ALTER TABLE "ScheduledShift" ADD CONSTRAINT "ScheduledShift_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;
ALTER TABLE "ScheduledShift" ADD CONSTRAINT "ScheduledShift_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE;
ALTER TABLE "StaffChatRoom" ADD CONSTRAINT "StaffChatRoom_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE;
ALTER TABLE "StaffChatMessage" ADD CONSTRAINT "StaffChatMessage_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "StaffChatRoom"("id") ON DELETE CASCADE;
ALTER TABLE "StaffChatMessage" ADD CONSTRAINT "StaffChatMessage_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE;
