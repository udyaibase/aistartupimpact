-- Resume engine step 2: structured, line-referenced resume profiles (one per application, reused by file hash).
CREATE TABLE IF NOT EXISTS "JobBoardResumeProfile" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "resumeKey" TEXT,
    "version" TEXT NOT NULL,
    "model" TEXT,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JobBoardResumeProfile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "JobBoardResumeProfile_applicationId_key" ON "JobBoardResumeProfile"("applicationId");
CREATE INDEX IF NOT EXISTS "JobBoardResumeProfile_fileHash_version_idx" ON "JobBoardResumeProfile"("fileHash", "version");
DO $$ BEGIN
  ALTER TABLE "JobBoardResumeProfile" ADD CONSTRAINT "JobBoardResumeProfile_applicationId_fkey"
    FOREIGN KEY ("applicationId") REFERENCES "JobBoardApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- Present when the table was created before this column was added (dev).
ALTER TABLE "JobBoardResumeProfile" ADD COLUMN IF NOT EXISTS "resumeKey" TEXT;
