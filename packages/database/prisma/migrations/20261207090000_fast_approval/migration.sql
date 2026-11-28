-- Fast approval: a startup or AI tool that proves ownership, has an AI-looking address and passes the automatic
-- first look goes live by itself after a short delay, and a person checks it afterwards.
-- Additive only: new columns on "Startup" and "AiTool". Nothing is removed and no existing value changes.

ALTER TABLE "Startup" ADD COLUMN IF NOT EXISTS "autoApproveAt" TIMESTAMP(3);
ALTER TABLE "Startup" ADD COLUMN IF NOT EXISTS "autoApproveHeld" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Startup" ADD COLUMN IF NOT EXISTS "approvedBy" TEXT;
ALTER TABLE "Startup" ADD COLUMN IF NOT EXISTS "postCheckedAt" TIMESTAMP(3);
ALTER TABLE "Startup" ADD COLUMN IF NOT EXISTS "postCheckedByEmail" TEXT;

ALTER TABLE "AiTool" ADD COLUMN IF NOT EXISTS "aiCheckLabel" TEXT;
ALTER TABLE "AiTool" ADD COLUMN IF NOT EXISTS "aiCheckReason" TEXT;
ALTER TABLE "AiTool" ADD COLUMN IF NOT EXISTS "aiCheckedAt" TIMESTAMP(3);
ALTER TABLE "AiTool" ADD COLUMN IF NOT EXISTS "aiCheckModel" TEXT;
ALTER TABLE "AiTool" ADD COLUMN IF NOT EXISTS "autoApproveAt" TIMESTAMP(3);
ALTER TABLE "AiTool" ADD COLUMN IF NOT EXISTS "autoApproveHeld" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AiTool" ADD COLUMN IF NOT EXISTS "postCheckedAt" TIMESTAMP(3);
ALTER TABLE "AiTool" ADD COLUMN IF NOT EXISTS "postCheckedByEmail" TEXT;
