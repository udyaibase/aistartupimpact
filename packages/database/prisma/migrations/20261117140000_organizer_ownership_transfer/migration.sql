-- Workspace ownership transfer requests (owner -> one of the workspace's Admins).
CREATE TABLE IF NOT EXISTS "OrganizerOwnershipTransfer" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "organizerId" TEXT NOT NULL,
  "toMemberId" TEXT NOT NULL,
  "toAccountId" TEXT NOT NULL,
  "toEmail" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decidedAt" TIMESTAMP(3),
  "previousOwnerAccountId" TEXT,
  CONSTRAINT "OrganizerOwnershipTransfer_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "OrganizerOwnershipTransfer_tokenHash_key" ON "OrganizerOwnershipTransfer"("tokenHash");
CREATE INDEX IF NOT EXISTS "OrganizerOwnershipTransfer_organizerId_status_idx" ON "OrganizerOwnershipTransfer"("organizerId", "status");
