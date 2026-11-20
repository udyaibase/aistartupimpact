-- Job seeker accounts: proven email ownership, and applications linked to the account.
ALTER TABLE "WebUser" ADD COLUMN "emailVerifiedAt" TIMESTAMPTZ;

ALTER TABLE "JobBoardApplication" ADD COLUMN "webUserId" TEXT;
CREATE INDEX "JobBoardApplication_webUserId_idx" ON "JobBoardApplication"("webUserId");
ALTER TABLE "JobBoardApplication" ADD CONSTRAINT "JobBoardApplication_webUserId_fkey"
  FOREIGN KEY ("webUserId") REFERENCES "WebUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
