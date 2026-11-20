-- Support: context captured with a report, the plan at the time, the first-reply promise, and inbound email ids. Additive only.
-- AlterTable
ALTER TABLE "SupportTicket" ADD COLUMN     "context" JSONB,
ADD COLUMN     "firstReplyAt" TIMESTAMP(3),
ADD COLUMN     "planAtOpen" TEXT,
ADD COLUMN     "replyDueAt" TIMESTAMP(3),
ADD COLUMN     "externalId" TEXT;

-- AlterTable
ALTER TABLE "SupportTicketMessage" ADD COLUMN     "externalId" TEXT;

-- CreateIndex
CREATE INDEX "SupportTicket_firstReplyAt_replyDueAt_idx" ON "SupportTicket"("firstReplyAt", "replyDueAt");

-- CreateIndex
CREATE UNIQUE INDEX "SupportTicket_externalId_key" ON "SupportTicket"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "SupportTicketMessage_externalId_key" ON "SupportTicketMessage"("externalId");
