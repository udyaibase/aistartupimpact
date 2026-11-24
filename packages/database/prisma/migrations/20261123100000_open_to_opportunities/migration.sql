-- "Open to opportunities" network (pilot): anonymous candidate profiles and company intro requests.
ALTER TYPE "JobBoardApplicationSource" ADD VALUE IF NOT EXISTS 'NETWORK';

ALTER TABLE "JobBoardEmployer" ADD COLUMN IF NOT EXISTS "networkPausedAt" TIMESTAMP(3);
ALTER TABLE "JobBoardEmployer" ADD COLUMN IF NOT EXISTS "networkPilot" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "JobBoardOpenProfile" (
    "id" TEXT NOT NULL,
    "webUserId" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "experienceYears" INTEGER,
    "skills" TEXT[],
    "city" TEXT,
    "workMode" TEXT NOT NULL DEFAULT 'ANY',
    "noticePeriodDays" INTEGER,
    "currentCompany" TEXT,
    "showCompany" BOOLEAN NOT NULL DEFAULT false,
    "blockedEmployerIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "visibleUntil" TIMESTAMP(3) NOT NULL,
    "pausedAt" TIMESTAMP(3),
    "renewReminderAt" TIMESTAMP(3),
    "consentAt" TIMESTAMP(3) NOT NULL,
    "consentText" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "JobBoardOpenProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "JobBoardIntroRequest" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "employerId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "sentByEmail" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reportReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    "applicationId" TEXT,
    CONSTRAINT "JobBoardIntroRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "JobBoardOpenProfile_webUserId_key" ON "JobBoardOpenProfile"("webUserId");
CREATE INDEX IF NOT EXISTS "JobBoardOpenProfile_visibleUntil_idx" ON "JobBoardOpenProfile"("visibleUntil");
CREATE UNIQUE INDEX IF NOT EXISTS "JobBoardIntroRequest_applicationId_key" ON "JobBoardIntroRequest"("applicationId");
CREATE INDEX IF NOT EXISTS "JobBoardIntroRequest_employerId_createdAt_idx" ON "JobBoardIntroRequest"("employerId", "createdAt");
CREATE INDEX IF NOT EXISTS "JobBoardIntroRequest_profileId_status_idx" ON "JobBoardIntroRequest"("profileId", "status");
CREATE INDEX IF NOT EXISTS "JobBoardIntroRequest_status_createdAt_idx" ON "JobBoardIntroRequest"("status", "createdAt");

DO $$ BEGIN
  ALTER TABLE "JobBoardOpenProfile" ADD CONSTRAINT "JobBoardOpenProfile_webUserId_fkey" FOREIGN KEY ("webUserId") REFERENCES "WebUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "JobBoardIntroRequest" ADD CONSTRAINT "JobBoardIntroRequest_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "JobBoardOpenProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "JobBoardIntroRequest" ADD CONSTRAINT "JobBoardIntroRequest_employerId_fkey" FOREIGN KEY ("employerId") REFERENCES "JobBoardEmployer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "JobBoardIntroRequest" ADD CONSTRAINT "JobBoardIntroRequest_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "JobBoardListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
