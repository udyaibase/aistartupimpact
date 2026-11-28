-- Discount codes: a percentage or an amount off one payment for a paid plan.
-- Additive only: nullable columns (one with a default) and an index.

ALTER TABLE "PlanOffer" ADD COLUMN IF NOT EXISTS "percentOff" INTEGER;
ALTER TABLE "PlanOffer" ADD COLUMN IF NOT EXISTS "amountOffPaise" INTEGER;
ALTER TABLE "PlanOffer" ADD COLUMN IF NOT EXISTS "cycle" TEXT NOT NULL DEFAULT 'ANY';

ALTER TABLE "PlanOfferRedemption" ADD COLUMN IF NOT EXISTS "paymentRef" TEXT;
ALTER TABLE "PlanOfferRedemption" ADD COLUMN IF NOT EXISTS "discountPaise" INTEGER;
CREATE INDEX IF NOT EXISTS "PlanOfferRedemption_paymentRef_idx" ON "PlanOfferRedemption"("paymentRef");
