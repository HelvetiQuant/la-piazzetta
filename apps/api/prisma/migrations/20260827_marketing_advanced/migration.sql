-- Modulo Marketing avanzato: social accounts, post, commenti, media, campagne, analytics

-- Asset media (foto/video caricati o generati da AI/Canva)
CREATE TABLE "MediaAsset" (
    "id"          TEXT NOT NULL,
    "venueId"     TEXT NOT NULL,
    "type"        TEXT NOT NULL DEFAULT 'IMAGE', -- IMAGE | VIDEO | DESIGN
    "source"      TEXT NOT NULL DEFAULT 'UPLOAD', -- UPLOAD | AI_GENERATED | CANVA | GAMMA
    "url"         TEXT NOT NULL, -- path locale o URL remoto
    "thumbnailUrl" TEXT,
    "mimeType"    TEXT,
    "sizeBytes"   INTEGER,
    "width"       INTEGER,
    "height"      INTEGER,
    "altText"     TEXT,
    "meta"        JSONB, -- metadati extra (prompt AI, design Canva ID, ecc.)
    "createdBy"   TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MediaAsset_venueId_idx" ON "MediaAsset"("venueId");

-- Account social connessi (OAuth tokens)
CREATE TABLE "SocialAccount" (
    "id"            TEXT NOT NULL,
    "venueId"       TEXT NOT NULL,
    "platform"      TEXT NOT NULL, -- instagram | facebook | whatsapp | tiktok
    "accountId"     TEXT NOT NULL, -- ID piattaforma
    "username"      TEXT,
    "displayName"   TEXT,
    "avatarUrl"     TEXT,
    "accessToken"   TEXT NOT NULL, -- crittografato in app
    "refreshToken"  TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "scopes"        TEXT[],
    "connectedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSyncAt"    TIMESTAMP(3),
    "active"        BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "SocialAccount_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SocialAccount_venueId_platform_accountId_key" UNIQUE ("venueId", "platform", "accountId")
);
CREATE INDEX "SocialAccount_venueId_idx" ON "SocialAccount"("venueId");

-- Post social (bozze, programmati, pubblicati)
CREATE TABLE "SocialPost" (
    "id"            TEXT NOT NULL,
    "venueId"       TEXT NOT NULL,
    "campaignId"    TEXT,
    "mediaAssetId"  TEXT,
    "caption"       TEXT NOT NULL,
    "hashtags"      TEXT[] DEFAULT '{}',
    "platforms"     TEXT[] NOT NULL DEFAULT '{}', -- dove pubblicare
    "status"        TEXT NOT NULL DEFAULT 'DRAFT', -- DRAFT | SCHEDULED | PUBLISHING | PUBLISHED | FAILED
    "scheduledAt"   TIMESTAMP(3),
    "publishedAt"   TIMESTAMP(3),
    "aiGenerated"   BOOLEAN NOT NULL DEFAULT false,
    "aiPrompt"      TEXT,
    "canvaDesignId" TEXT,
    "gammaDocId"    TEXT,
    "perPlatform"   JSONB, -- { instagram: { postId, permalink, error }, facebook: {...} }
    "createdBy"     TEXT,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialPost_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SocialPost_venueId_status_idx" ON "SocialPost"("venueId", "status");
CREATE INDEX "SocialPost_venueId_scheduledAt_idx" ON "SocialPost"("venueId", "scheduledAt");

-- Commenti social (sync da piattaforme)
CREATE TABLE "SocialComment" (
    "id"            TEXT NOT NULL,
    "venueId"       TEXT NOT NULL,
    "socialPostId"  TEXT,
    "platform"      TEXT NOT NULL,
    "platformCommentId" TEXT NOT NULL,
    "authorName"    TEXT,
    "authorAvatarUrl" TEXT,
    "text"          TEXT NOT NULL,
    "likesCount"    INTEGER NOT NULL DEFAULT 0,
    "repliedAt"     TIMESTAMP(3),
    "replyText"     TEXT,
    "aiAutoReplied" BOOLEAN NOT NULL DEFAULT false,
    "needsReply"    BOOLEAN NOT NULL DEFAULT true,
    "receivedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialComment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SocialComment_venueId_platform_commentId_key" UNIQUE ("venueId", "platform", "platformCommentId")
);
CREATE INDEX "SocialComment_venueId_needsReply_idx" ON "SocialComment"("venueId", "needsReply");
CREATE INDEX "SocialComment_socialPostId_idx" ON "SocialComment"("socialPostId");

-- Campagne marketing
CREATE TABLE "Campaign" (
    "id"            TEXT NOT NULL,
    "venueId"       TEXT NOT NULL,
    "name"          TEXT NOT NULL,
    "description"   TEXT,
    "startDate"     TIMESTAMP(3),
    "endDate"       TIMESTAMP(3),
    "budgetCents"   INTEGER NOT NULL DEFAULT 0,
    "status"        TEXT NOT NULL DEFAULT 'ACTIVE', -- DRAFT | ACTIVE | PAUSED | COMPLETED
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Campaign_venueId_idx" ON "Campaign"("venueId");

-- Analytics social (snapshot giornaliero per post/account)
CREATE TABLE "SocialAnalytics" (
    "id"            TEXT NOT NULL,
    "venueId"       TEXT NOT NULL,
    "socialPostId"  TEXT,
    "socialAccountId" TEXT,
    "platform"      TEXT NOT NULL,
    "date"          DATE NOT NULL,
    "impressions"   INTEGER NOT NULL DEFAULT 0,
    "reach"         INTEGER NOT NULL DEFAULT 0,
    "likes"         INTEGER NOT NULL DEFAULT 0,
    "comments"      INTEGER NOT NULL DEFAULT 0,
    "shares"        INTEGER NOT NULL DEFAULT 0,
    "saves"         INTEGER NOT NULL DEFAULT 0,
    "profileVisits" INTEGER NOT NULL DEFAULT 0,
    "websiteClicks" INTEGER NOT NULL DEFAULT 0,
    "followerCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialAnalytics_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SocialAnalytics_venueId_date_idx" ON "SocialAnalytics"("venueId", "date");
CREATE INDEX "SocialAnalytics_socialPostId_idx" ON "SocialAnalytics"("socialPostId");

-- Foreign keys
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE;
ALTER TABLE "SocialAccount" ADD CONSTRAINT "SocialAccount_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE;
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE;
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL;
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL;
ALTER TABLE "SocialComment" ADD CONSTRAINT "SocialComment_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE;
ALTER TABLE "SocialComment" ADD CONSTRAINT "SocialComment_socialPostId_fkey" FOREIGN KEY ("socialPostId") REFERENCES "SocialPost"("id") ON DELETE CASCADE;
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE;
ALTER TABLE "SocialAnalytics" ADD CONSTRAINT "SocialAnalytics_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE;
ALTER TABLE "SocialAnalytics" ADD CONSTRAINT "SocialAnalytics_socialPostId_fkey" FOREIGN KEY ("socialPostId") REFERENCES "SocialPost"("id") ON DELETE CASCADE;
ALTER TABLE "SocialAnalytics" ADD CONSTRAINT "SocialAnalytics_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE;
