-- Promo codes for offers: a CODE offer is claimed by typing its code on the billing page.
-- Additive only: one nullable column and its unique index.

ALTER TABLE "PlanOffer" ADD COLUMN IF NOT EXISTS "code" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "PlanOffer_code_key" ON "PlanOffer"("code");
