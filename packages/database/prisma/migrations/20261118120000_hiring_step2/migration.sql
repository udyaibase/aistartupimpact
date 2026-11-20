-- Hiring Step 2: job alerts for site visitors, referral links, co-founder shortlist links. Additive only.
-- AlterTable
ALTER TABLE "JobBoardApplication" ADD COLUMN     "referrerId" TEXT;

-- CreateTable
CREATE TABLE "JobAlertSubscription" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "category" TEXT,
    "city" TEXT,
    "workType" TEXT,
    "consentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consentText" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "unsubscribedAt" TIMESTAMP(3),
    "tokenHash" TEXT NOT NULL,
    "lastSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobAlertSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobBoardReferrer" (
    "id" TEXT NOT NULL,
    "employerId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "memberId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobBoardReferrer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobBoardShortlistShare" (
    "id" TEXT NOT NULL,
    "employerId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "sharedWithName" TEXT NOT NULL,
    "createdByEmail" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastViewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobBoardShortlistShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobBoardShortlistVote" (
    "id" TEXT NOT NULL,
    "shareId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "vote" TEXT NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobBoardShortlistVote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JobAlertSubscription_tokenHash_key" ON "JobAlertSubscription"("tokenHash");

-- CreateIndex
CREATE INDEX "JobAlertSubscription_confirmedAt_unsubscribedAt_idx" ON "JobAlertSubscription"("confirmedAt", "unsubscribedAt");

-- CreateIndex
CREATE UNIQUE INDEX "JobAlertSubscription_email_category_city_workType_key" ON "JobAlertSubscription"("email", "category", "city", "workType");

-- CreateIndex
CREATE UNIQUE INDEX "JobBoardReferrer_code_key" ON "JobBoardReferrer"("code");

-- CreateIndex
CREATE UNIQUE INDEX "JobBoardReferrer_employerId_email_key" ON "JobBoardReferrer"("employerId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "JobBoardShortlistShare_tokenHash_key" ON "JobBoardShortlistShare"("tokenHash");

-- CreateIndex
CREATE INDEX "JobBoardShortlistShare_employerId_listingId_idx" ON "JobBoardShortlistShare"("employerId", "listingId");

-- CreateIndex
CREATE INDEX "JobBoardShortlistVote_applicationId_idx" ON "JobBoardShortlistVote"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "JobBoardShortlistVote_shareId_applicationId_key" ON "JobBoardShortlistVote"("shareId", "applicationId");

-- CreateIndex
CREATE INDEX "JobBoardApplication_referrerId_idx" ON "JobBoardApplication"("referrerId");

-- AddForeignKey
ALTER TABLE "JobBoardApplication" ADD CONSTRAINT "JobBoardApplication_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "JobBoardReferrer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobBoardReferrer" ADD CONSTRAINT "JobBoardReferrer_employerId_fkey" FOREIGN KEY ("employerId") REFERENCES "JobBoardEmployer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobBoardShortlistShare" ADD CONSTRAINT "JobBoardShortlistShare_employerId_fkey" FOREIGN KEY ("employerId") REFERENCES "JobBoardEmployer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobBoardShortlistVote" ADD CONSTRAINT "JobBoardShortlistVote_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "JobBoardShortlistShare"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobBoardShortlistVote" ADD CONSTRAINT "JobBoardShortlistVote_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "JobBoardApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

