-- CreateTable
CREATE TABLE "AnalyticsDaily" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "shares" INTEGER NOT NULL DEFAULT 0,
    "directViews" INTEGER NOT NULL DEFAULT 0,
    "searchViews" INTEGER NOT NULL DEFAULT 0,
    "socialViews" INTEGER NOT NULL DEFAULT 0,
    "emailViews" INTEGER NOT NULL DEFAULT 0,
    "referralViews" INTEGER NOT NULL DEFAULT 0,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnalyticsDaily_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsDaily_entityType_entityId_date_key" ON "AnalyticsDaily"("entityType", "entityId", "date");

-- CreateIndex
CREATE INDEX "AnalyticsDaily_entityType_entityId_date_idx" ON "AnalyticsDaily"("entityType", "entityId", "date");

-- CreateIndex
CREATE INDEX "AnalyticsDaily_entityType_date_idx" ON "AnalyticsDaily"("entityType", "date");
