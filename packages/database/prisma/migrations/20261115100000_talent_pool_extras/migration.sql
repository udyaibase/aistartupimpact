-- Talent pool: team tags per candidate, and when the "your membership ends soon" email went out. Safe to run more than once.
ALTER TABLE "JobBoardApplication" ADD COLUMN IF NOT EXISTS "talentTags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "JobBoardApplication" ADD COLUMN IF NOT EXISTS "talentPoolReminderAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "JobBoardApplication_talentPoolUntil_idx" ON "JobBoardApplication"("talentPoolUntil");
