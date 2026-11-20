-- Onboarding: company check for workspaces without a founder-verified startup, "send to your founder", jobs waiting to go live, and the onboarding funnel. Additive only.
-- AlterTable
ALTER TABLE "JobBoardEmployer" ADD COLUMN     "companyCin" TEXT,
ADD COLUMN     "companyReview" TEXT,
ADD COLUMN     "companyReviewNote" TEXT,
ADD COLUMN     "companyReviewRequestedAt" TIMESTAMP(3),
ADD COLUMN     "companyReviewRequestedBy" TEXT,
ADD COLUMN     "companyReviewedAt" TIMESTAMP(3),
ADD COLUMN     "companyReviewedBy" TEXT,
ADD COLUMN     "founderAskEmail" TEXT,
ADD COLUMN     "founderAskRemindedAt" TIMESTAMP(3),
ADD COLUMN     "founderAskedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "JobBoardListing" ADD COLUMN     "publishWaitingAt" TIMESTAMP(3),
ADD COLUMN     "publishWaitingBy" TEXT;

-- CreateTable
CREATE TABLE "JobBoardOnboardingStep" (
    "id" TEXT NOT NULL,
    "employerId" TEXT NOT NULL,
    "step" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "meta" JSONB,

    CONSTRAINT "JobBoardOnboardingStep_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobBoardOnboardingStep_step_at_idx" ON "JobBoardOnboardingStep"("step", "at");

-- CreateIndex
CREATE UNIQUE INDEX "JobBoardOnboardingStep_employerId_step_key" ON "JobBoardOnboardingStep"("employerId", "step");

-- AddForeignKey
ALTER TABLE "JobBoardOnboardingStep" ADD CONSTRAINT "JobBoardOnboardingStep_employerId_fkey" FOREIGN KEY ("employerId") REFERENCES "JobBoardEmployer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

