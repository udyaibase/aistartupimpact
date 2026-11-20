-- Pipeline v2: sourcing lane, assessment and final decision stages, precise outcomes, offer to joining, pipeline templates. Additive only.
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "JobBoardAppStatus" ADD VALUE 'ASSESSMENT';
ALTER TYPE "JobBoardAppStatus" ADD VALUE 'DECISION';

-- AlterEnum
ALTER TYPE "JobBoardApplicationSource" ADD VALUE 'SOURCED';

-- AlterTable
ALTER TABLE "JobBoardApplication" ADD COLUMN     "contactedAt" TIMESTAMP(3),
ADD COLUMN     "holdFromStatus" "JobBoardAppStatus",
ADD COLUMN     "interestedAt" TIMESTAMP(3),
ADD COLUMN     "joinedAt" TIMESTAMP(3),
ADD COLUMN     "joiningDate" TIMESTAMP(3),
ADD COLUMN     "outcome" TEXT,
ADD COLUMN     "outcomeReasonBy" TEXT,
ADD COLUMN     "personId" TEXT,
ADD COLUMN     "sourcedBy" TEXT,
ADD COLUMN     "sourcedChannel" TEXT,
ADD COLUMN     "sourcedState" TEXT;

-- AlterTable
ALTER TABLE "JobBoardListing" ADD COLUMN     "assessment" JSONB,
ADD COLUMN     "decisionDelegateEmail" TEXT,
ADD COLUMN     "decisionOwnerEmail" TEXT,
ADD COLUMN     "pipelineTemplate" TEXT NOT NULL DEFAULT 'FOUNDER_LED',
ADD COLUMN     "pipelineVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "recruitersSeeOffers" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "JobBoardAssessment" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "tokenHash" TEXT,
    "brief" TEXT,
    "url" TEXT,
    "dueAt" TIMESTAMP(3),
    "remindedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "submissionUrl" TEXT,
    "submissionKey" TEXT,
    "submissionNote" TEXT,
    "score" DOUBLE PRECISION,
    "maxScore" DOUBLE PRECISION,
    "passMark" DOUBLE PRECISION,
    "reviewerEmail" TEXT,
    "reviewNotes" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'SENT',
    "createdByEmail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobBoardAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobBoardDecision" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "decidedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobBoardDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobBoardOffer" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "employerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "fixedAnnual" INTEGER,
    "variableAnnual" INTEGER,
    "joiningDate" TIMESTAMP(3),
    "answerBy" TIMESTAMP(3),
    "firmExpiry" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "sentAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "declineReason" TEXT,
    "reasonBy" TEXT,
    "revisions" JSONB NOT NULL DEFAULT '[]',
    "createdByEmail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobBoardOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobBoardPipelineTemplate" (
    "id" TEXT NOT NULL,
    "employerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "config" JSONB NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "JobBoardPipelineTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JobBoardAssessment_tokenHash_key" ON "JobBoardAssessment"("tokenHash");

-- CreateIndex
CREATE INDEX "JobBoardAssessment_applicationId_idx" ON "JobBoardAssessment"("applicationId");

-- CreateIndex
CREATE INDEX "JobBoardAssessment_status_dueAt_idx" ON "JobBoardAssessment"("status", "dueAt");

-- CreateIndex
CREATE INDEX "JobBoardDecision_applicationId_createdAt_idx" ON "JobBoardDecision"("applicationId", "createdAt");

-- CreateIndex
CREATE INDEX "JobBoardOffer_applicationId_idx" ON "JobBoardOffer"("applicationId");

-- CreateIndex
CREATE INDEX "JobBoardOffer_employerId_status_idx" ON "JobBoardOffer"("employerId", "status");

-- CreateIndex
CREATE INDEX "JobBoardPipelineTemplate_employerId_idx" ON "JobBoardPipelineTemplate"("employerId");

-- CreateIndex
CREATE INDEX "JobBoardApplication_personId_idx" ON "JobBoardApplication"("personId");

-- AddForeignKey
ALTER TABLE "JobBoardAssessment" ADD CONSTRAINT "JobBoardAssessment_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "JobBoardApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobBoardDecision" ADD CONSTRAINT "JobBoardDecision_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "JobBoardApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobBoardOffer" ADD CONSTRAINT "JobBoardOffer_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "JobBoardApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobBoardPipelineTemplate" ADD CONSTRAINT "JobBoardPipelineTemplate_employerId_fkey" FOREIGN KEY ("employerId") REFERENCES "JobBoardEmployer"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AlterTable
ALTER TABLE "JobBoardEmployer" ADD COLUMN     "aiReadSourcedResumes" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "JobBoardAssessment" ADD COLUMN     "title" TEXT,
ADD COLUMN     "questions" JSONB,
ADD COLUMN     "answers" JSONB,
ADD COLUMN     "rubric" JSONB,
ADD COLUMN     "rubricScores" JSONB,
ADD COLUMN     "submissionLinks" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Existing hires become "Joined" (there was no joining date before).
UPDATE "JobBoardApplication" SET "joinedAt" = COALESCE("statusChangedAt", "appliedAt") WHERE "status" = 'HIRED' AND "joinedAt" IS NULL;
-- Existing rejections were the team's decision.
UPDATE "JobBoardApplication" SET "outcome" = 'REJECTED' WHERE "status" = 'REJECTED' AND "outcome" IS NULL;
