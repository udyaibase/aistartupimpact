-- Candidate import from CSV: the import record, the application's link to it, and the IMPORTED source. Additive only.
-- AlterEnum
ALTER TYPE "JobBoardApplicationSource" ADD VALUE 'IMPORTED';

-- AlterTable
ALTER TABLE "JobBoardApplication" ADD COLUMN     "importId" TEXT;

-- CreateTable
CREATE TABLE "JobBoardImport" (
    "id" TEXT NOT NULL,
    "employerId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "totalRows" INTEGER NOT NULL,
    "cursor" INTEGER NOT NULL DEFAULT 0,
    "created" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "rows" JSONB,
    "mapping" JSONB NOT NULL,
    "problems" JSONB NOT NULL DEFAULT '[]',
    "resumes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "undoneAt" TIMESTAMP(3),

    CONSTRAINT "JobBoardImport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobBoardApplication_importId_idx" ON "JobBoardApplication"("importId");

-- CreateIndex
CREATE INDEX "JobBoardImport_employerId_createdAt_idx" ON "JobBoardImport"("employerId", "createdAt");

-- AddForeignKey
ALTER TABLE "JobBoardApplication" ADD CONSTRAINT "JobBoardApplication_importId_fkey" FOREIGN KEY ("importId") REFERENCES "JobBoardImport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobBoardImport" ADD CONSTRAINT "JobBoardImport_employerId_fkey" FOREIGN KEY ("employerId") REFERENCES "JobBoardEmployer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

