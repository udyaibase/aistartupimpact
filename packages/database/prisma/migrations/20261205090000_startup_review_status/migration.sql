-- Startup review kept apart from ownership. Until now one column (claimStatus) meant both "has our team reviewed it"
-- and "has the founder proven ownership", so verifying a domain hid a startup from the review queue.
-- Additive only: seven new columns on "Startup". Visibility is still decided by "isApproved".

ALTER TABLE "Startup" ADD COLUMN IF NOT EXISTS "reviewStatus" TEXT NOT NULL DEFAULT 'IN_REVIEW';
ALTER TABLE "Startup" ADD COLUMN IF NOT EXISTS "reviewReasonCode" TEXT;
ALTER TABLE "Startup" ADD COLUMN IF NOT EXISTS "reviewNote" TEXT;
ALTER TABLE "Startup" ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3);
ALTER TABLE "Startup" ADD COLUMN IF NOT EXISTS "reviewedByEmail" TEXT;
ALTER TABLE "Startup" ADD COLUMN IF NOT EXISTS "submittedForReviewAt" TIMESTAMP(3);
ALTER TABLE "Startup" ADD COLUMN IF NOT EXISTS "aiUseCase" TEXT;

-- Existing rows: live ones are approved; ones our team turned down keep that; the rest are waiting.
UPDATE "Startup" SET "reviewStatus" = 'APPROVED' WHERE "isApproved" = true AND "reviewStatus" = 'IN_REVIEW';
UPDATE "Startup" SET "reviewStatus" = 'REJECTED' WHERE "isApproved" = false AND "claimStatus" = 'REJECTED' AND "reviewStatus" = 'IN_REVIEW';

CREATE INDEX IF NOT EXISTS "Startup_review_queue_idx" ON "Startup"("isApproved", "reviewStatus");
