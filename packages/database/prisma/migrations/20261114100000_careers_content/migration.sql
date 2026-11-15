-- Careers page content, "get notified" subscribers and general applications. Safe to run more than once.
ALTER TABLE "JobBoardEmployer" ADD COLUMN IF NOT EXISTS "careersContent" JSONB;
ALTER TABLE "JobBoardEmployer" ADD COLUMN IF NOT EXISTS "acceptGeneralApplications" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "JobBoardListing" ADD COLUMN IF NOT EXISTS "isGeneral" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "JobBoardCareersSubscriber" (
    "id" TEXT NOT NULL,
    "employerId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'CAREERS_PAGE',
    "consentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consentText" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "tokenHash" TEXT NOT NULL,
    "unsubscribedAt" TIMESTAMP(3),
    "lastNotifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JobBoardCareersSubscriber_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "JobBoardCareersSubscriber_tokenHash_key" ON "JobBoardCareersSubscriber"("tokenHash");
CREATE UNIQUE INDEX IF NOT EXISTS "JobBoardCareersSubscriber_employerId_email_key" ON "JobBoardCareersSubscriber"("employerId", "email");
CREATE INDEX IF NOT EXISTS "JobBoardCareersSubscriber_employerId_confirmedAt_idx" ON "JobBoardCareersSubscriber"("employerId", "confirmedAt");
DO $$ BEGIN
  ALTER TABLE "JobBoardCareersSubscriber" ADD CONSTRAINT "JobBoardCareersSubscriber_employerId_fkey"
    FOREIGN KEY ("employerId") REFERENCES "JobBoardEmployer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
