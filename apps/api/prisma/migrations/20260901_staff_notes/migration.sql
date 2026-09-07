CREATE TABLE IF NOT EXISTS "StaffNote" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "targetScope" TEXT NOT NULL,
    "targetValue" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'NOTE',
    "priority" INTEGER NOT NULL DEFAULT 3,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3),
    "requiresAck" BOOLEAN NOT NULL DEFAULT true,
    "acknowledgedBy" JSONB NOT NULL DEFAULT '[]',
    "responses" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StaffNote_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "StaffNote_venueId_status_idx" ON "StaffNote"("venueId", "status");
CREATE INDEX IF NOT EXISTS "StaffNote_venueId_targetScope_targetValue_idx" ON "StaffNote"("venueId", "targetScope", "targetValue");
CREATE INDEX IF NOT EXISTS "StaffNote_venueId_type_idx" ON "StaffNote"("venueId", "type");
ALTER TABLE "StaffNote" ADD CONSTRAINT "StaffNote_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
