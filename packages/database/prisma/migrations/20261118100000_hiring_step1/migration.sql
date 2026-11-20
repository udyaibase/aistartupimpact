-- Hiring Step 1: On hold, exit reasons, closing emails, weekly hiring report. Additive only.
ALTER TYPE "JobBoardAppStatus" ADD VALUE IF NOT EXISTS 'ON_HOLD';

ALTER TABLE "JobBoardApplication"
  ADD COLUMN IF NOT EXISTS "exitReason" TEXT,
  ADD COLUMN IF NOT EXISTS "exitNote" TEXT,
  ADD COLUMN IF NOT EXISTS "onHoldUntil" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "closingEmailedAt" TIMESTAMP(3);

ALTER TABLE "JobBoardApplicationEvent" ADD COLUMN IF NOT EXISTS "reasonCode" TEXT;

ALTER TABLE "JobBoardEmployer"
  ADD COLUMN IF NOT EXISTS "weeklyReport" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "weeklyReportSentAt" TIMESTAMP(3);

ALTER TABLE "JobBoardTeamMember" ADD COLUMN IF NOT EXISTS "weeklyReport" BOOLEAN NOT NULL DEFAULT true;
