-- CreateTable: SetupToken (token monouso per il provisioning iniziale del locale)
CREATE TABLE "SetupToken" (
    "id"        TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "note"      TEXT,
    "status"    TEXT NOT NULL DEFAULT 'PENDING',
    "usedAt"    TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SetupToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SetupToken_tokenHash_key" ON "SetupToken"("tokenHash");

-- CreateIndex
CREATE INDEX "SetupToken_status_idx" ON "SetupToken"("status");
