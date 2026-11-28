-- Offers run from Admin → Billing → Offers (phase 1: a paid plan free for N days, granted automatically).
-- Additive only: two new tables, nothing existing is changed.

CREATE TABLE IF NOT EXISTS "PlanOffer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "portal" TEXT NOT NULL,
    "benefit" TEXT NOT NULL DEFAULT 'FREE_PLAN',
    "plan" TEXT NOT NULL,
    "benefitDays" INTEGER NOT NULL,
    "audience" TEXT NOT NULL DEFAULT 'NEW_WORKSPACES',
    "trigger" TEXT NOT NULL DEFAULT 'AUTO',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "maxRedemptions" INTEGER,
    "redeemedCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "showPublicly" BOOLEAN NOT NULL DEFAULT true,
    "createdByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanOffer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PlanOfferRedemption" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "portal" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "accountEmail" TEXT NOT NULL,
    "companyKey" TEXT,
    "plan" TEXT NOT NULL,
    "benefitDays" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanOfferRedemption_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PlanOffer_portal_status_startsAt_endsAt_idx" ON "PlanOffer"("portal", "status", "startsAt", "endsAt");
CREATE UNIQUE INDEX IF NOT EXISTS "PlanOfferRedemption_offerId_accountId_key" ON "PlanOfferRedemption"("offerId", "accountId");
CREATE UNIQUE INDEX IF NOT EXISTS "PlanOfferRedemption_offerId_companyKey_key" ON "PlanOfferRedemption"("offerId", "companyKey");
CREATE INDEX IF NOT EXISTS "PlanOfferRedemption_accountId_idx" ON "PlanOfferRedemption"("accountId");
CREATE INDEX IF NOT EXISTS "PlanOfferRedemption_offerId_createdAt_idx" ON "PlanOfferRedemption"("offerId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "PlanOfferRedemption" ADD CONSTRAINT "PlanOfferRedemption_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "PlanOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
