-- Organizer accounts: deletion grace period, team membership bound to an account, unused teammate password copies removed.

ALTER TABLE "EventOrganizer" ADD COLUMN IF NOT EXISTS "deletionScheduledAt" TIMESTAMP(3);

ALTER TABLE "EventTeamMember" ADD COLUMN IF NOT EXISTS "memberOrganizerId" TEXT;
CREATE INDEX IF NOT EXISTS "EventTeamMember_memberOrganizerId_idx" ON "EventTeamMember"("memberOrganizerId");

-- Accepted memberships are bound to the confirmed account with that email (only when exactly one matches).
UPDATE "EventTeamMember" m
SET "memberOrganizerId" = o."id"
FROM "EventOrganizer" o
WHERE m."status" = 'ACTIVE'
  AND m."memberOrganizerId" IS NULL
  AND o."emailVerified" = true
  AND lower(o."email") = lower(m."email")
  AND (SELECT count(*) FROM "EventOrganizer" o2 WHERE lower(o2."email") = lower(m."email")) = 1;

-- A teammate's password hash used to be copied here and was never read.
UPDATE "EventTeamMember" SET "passwordHash" = NULL WHERE "passwordHash" IS NOT NULL;

-- Signed-in devices list.
ALTER TABLE "EventOrganizerSession" ADD COLUMN IF NOT EXISTS "lastSeenAt" TIMESTAMP(3);

-- Venue map link in its own column (it used to be appended to the address as "address|||url").
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "venueMapUrl" TEXT;
UPDATE "Event"
SET "venueMapUrl" = NULLIF(split_part("address", '|||', 2), ''),
    "address" = NULLIF(split_part("address", '|||', 1), '')
WHERE "address" LIKE '%|||%';

-- Questions removed after people answered them are hidden instead of deleted (deleting dropped the answers).
ALTER TABLE "EventCustomQuestion" ADD COLUMN IF NOT EXISTS "hiddenAt" TIMESTAMP(3);
