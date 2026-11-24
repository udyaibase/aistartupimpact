-- Saved talent pool searches, with optional daily alerts for new matches.
CREATE TABLE IF NOT EXISTS "JobBoardSavedTalentSearch" (
    "id" TEXT NOT NULL,
    "employerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "alert" BOOLEAN NOT NULL DEFAULT true,
    "createdByEmail" TEXT NOT NULL,
    "lastAlertAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JobBoardSavedTalentSearch_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "JobBoardSavedTalentSearch_employerId_idx" ON "JobBoardSavedTalentSearch"("employerId");
CREATE INDEX IF NOT EXISTS "JobBoardSavedTalentSearch_alert_idx" ON "JobBoardSavedTalentSearch"("alert");
DO $$ BEGIN
  ALTER TABLE "JobBoardSavedTalentSearch" ADD CONSTRAINT "JobBoardSavedTalentSearch_employerId_fkey"
    FOREIGN KEY ("employerId") REFERENCES "JobBoardEmployer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
