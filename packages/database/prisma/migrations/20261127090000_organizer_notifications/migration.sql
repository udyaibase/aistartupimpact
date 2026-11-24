-- Organizer portal bell (see OrganizerNotification in schema.prisma).
CREATE TABLE IF NOT EXISTS "OrganizerNotification" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "organizerId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "link" TEXT,
  "read" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrganizerNotification_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrganizerNotification_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "EventOrganizer"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "OrganizerNotification_organizerId_createdAt_idx" ON "OrganizerNotification"("organizerId", "createdAt");
CREATE INDEX IF NOT EXISTS "OrganizerNotification_organizerId_read_idx" ON "OrganizerNotification"("organizerId", "read");
