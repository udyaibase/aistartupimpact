-- Hiring Step 3: interview rounds, scorecards, scheduled interviews (.ics invites). Additive only.
-- AlterTable
ALTER TABLE "JobBoardApplication" ADD COLUMN     "interviewRound" TEXT;

-- AlterTable
ALTER TABLE "JobBoardListing" ADD COLUMN     "interviewRounds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "JobBoardScorecard" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "round" TEXT NOT NULL,
    "authorEmail" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "ratings" JSONB NOT NULL,
    "recommendation" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobBoardScorecard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobBoardInterview" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "round" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "panelEmails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "meetingUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "createdByEmail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "JobBoardInterview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobBoardScorecard_applicationId_idx" ON "JobBoardScorecard"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "JobBoardScorecard_applicationId_round_authorEmail_key" ON "JobBoardScorecard"("applicationId", "round", "authorEmail");

-- CreateIndex
CREATE INDEX "JobBoardInterview_applicationId_startAt_idx" ON "JobBoardInterview"("applicationId", "startAt");

-- AddForeignKey
ALTER TABLE "JobBoardScorecard" ADD CONSTRAINT "JobBoardScorecard_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "JobBoardApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobBoardInterview" ADD CONSTRAINT "JobBoardInterview_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "JobBoardApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
