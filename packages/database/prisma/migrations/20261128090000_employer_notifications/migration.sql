-- Employer portal bell (see EmployerNotification in schema.prisma).
CREATE TABLE IF NOT EXISTS "EmployerNotification" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "employerId" TEXT NOT NULL,
  "memberId" TEXT,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "link" TEXT,
  "read" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmployerNotification_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EmployerNotification_employerId_fkey" FOREIGN KEY ("employerId") REFERENCES "JobBoardEmployer"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "EmployerNotification_employerId_memberId_createdAt_idx" ON "EmployerNotification"("employerId", "memberId", "createdAt");
CREATE INDEX IF NOT EXISTS "EmployerNotification_employerId_memberId_read_idx" ON "EmployerNotification"("employerId", "memberId", "read");
