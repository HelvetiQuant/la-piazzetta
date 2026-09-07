-- AiPreference: preferenze AI che si adattano all'owner
CREATE TABLE IF NOT EXISTS "AiPreference" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "sectionWeights" JSONB NOT NULL DEFAULT '{}',
    "tonePreference" TEXT NOT NULL DEFAULT 'friendly',
    "language" TEXT NOT NULL DEFAULT 'it',
    "suggestionFrequency" TEXT NOT NULL DEFAULT 'medium',
    "lastSuggestionAt" TIMESTAMP(3),
    "interactionCount" INTEGER NOT NULL DEFAULT 0,
    "positiveFeedback" INTEGER NOT NULL DEFAULT 0,
    "negativeFeedback" INTEGER NOT NULL DEFAULT 0,
    "preferredTopics" JSONB NOT NULL DEFAULT '[]',
    "avoidedTopics" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AiPreference_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AiPreference_venueId_key" ON "AiPreference"("venueId");
ALTER TABLE "AiPreference" ADD CONSTRAINT "AiPreference_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AiInteraction: log interazioni per imparare
CREATE TABLE IF NOT EXISTS "AiInteraction" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "response" TEXT,
    "feedback" INTEGER,
    "modelUsed" TEXT NOT NULL,
    "tokensUsed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiInteraction_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AiInteraction_venueId_createdAt_idx" ON "AiInteraction"("venueId", "createdAt");
CREATE INDEX IF NOT EXISTS "AiInteraction_venueId_section_idx" ON "AiInteraction"("venueId", "section");
ALTER TABLE "AiInteraction" ADD CONSTRAINT "AiInteraction_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- MenuAddOn: consigli dell'owner da promuovere tramite staff
CREATE TABLE IF NOT EXISTS "MenuAddOn" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "staffScript" TEXT NOT NULL,
    "targetRoles" JSONB NOT NULL DEFAULT '["WAITER","BARMAN"]',
    "activeFrom" TIMESTAMP(3),
    "activeTo" TIMESTAMP(3),
    "timeWindow" TEXT,
    "weekDays" JSONB NOT NULL DEFAULT '[1,2,3,4,5,6,7]',
    "priority" INTEGER NOT NULL DEFAULT 3,
    "discountPct" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "timesProposed" INTEGER NOT NULL DEFAULT 0,
    "timesAccepted" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MenuAddOn_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "MenuAddOn_venueId_status_idx" ON "MenuAddOn"("venueId", "status");
CREATE INDEX IF NOT EXISTS "MenuAddOn_venueId_productId_idx" ON "MenuAddOn"("venueId", "productId");
ALTER TABLE "MenuAddOn" ADD CONSTRAINT "MenuAddOn_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MenuAddOn" ADD CONSTRAINT "MenuAddOn_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
