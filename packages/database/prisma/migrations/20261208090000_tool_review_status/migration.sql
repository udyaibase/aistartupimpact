-- AI tool review kept apart from ownership, the same way as startups: until now a tool's "claimStatus" meant both
-- "has our team reviewed it" and "has the founder proven ownership", and the reason for a rejection was only emailed.
-- Additive only: six new columns on "AiTool". Whether a tool is public is still decided by "status".

ALTER TABLE "AiTool" ADD COLUMN IF NOT EXISTS "reviewStatus" TEXT NOT NULL DEFAULT 'IN_REVIEW';
ALTER TABLE "AiTool" ADD COLUMN IF NOT EXISTS "reviewReasonCode" TEXT;
ALTER TABLE "AiTool" ADD COLUMN IF NOT EXISTS "reviewNote" TEXT;
ALTER TABLE "AiTool" ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3);
ALTER TABLE "AiTool" ADD COLUMN IF NOT EXISTS "reviewedByEmail" TEXT;
ALTER TABLE "AiTool" ADD COLUMN IF NOT EXISTS "submittedForReviewAt" TIMESTAMP(3);

-- Existing rows. Live tools are approved. Tools our team turned down keep that. An archived tool that had been
-- approved (hidden by its founder's account being deactivated, or archived by us) counts as approved, so
-- reactivating the account can bring it back; one that never was approved is still waiting.
UPDATE "AiTool" SET "reviewStatus" = 'APPROVED' WHERE status IN ('APPROVED', 'FEATURED') AND "reviewStatus" = 'IN_REVIEW';
UPDATE "AiTool" SET "reviewStatus" = 'REJECTED' WHERE status NOT IN ('APPROVED', 'FEATURED') AND "claimStatus" = 'REJECTED' AND "reviewStatus" = 'IN_REVIEW';
UPDATE "AiTool" SET "reviewStatus" = 'APPROVED' WHERE status = 'ARCHIVED' AND "claimStatus" <> 'REJECTED' AND "approvedAt" IS NOT NULL AND "reviewStatus" = 'IN_REVIEW';

CREATE INDEX IF NOT EXISTS "AiTool_review_queue_idx" ON "AiTool"("status", "reviewStatus");
