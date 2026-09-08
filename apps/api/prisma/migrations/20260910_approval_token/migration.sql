-- CreateTable: ApprovalToken (token monouso per approvazione one-tap)
CREATE TABLE "ApprovalToken" (
    "id"        TEXT NOT NULL,
    "venueId"   TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "targetId"  TEXT NOT NULL,
    "token"     TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "status"    TEXT NOT NULL DEFAULT 'PENDING',
    "usedAt"    TIMESTAMP(3),
    "usedBy"    TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalToken_token_key" ON "ApprovalToken"("token");

-- CreateIndex
CREATE INDEX "ApprovalToken_venueId_status_idx" ON "ApprovalToken"("venueId", "status");

-- CreateIndex
CREATE INDEX "ApprovalToken_token_idx" ON "ApprovalToken"("token");

-- AddForeignKey
ALTER TABLE "ApprovalToken" ADD CONSTRAINT "ApprovalToken_venueId_fkey"
  FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE;
