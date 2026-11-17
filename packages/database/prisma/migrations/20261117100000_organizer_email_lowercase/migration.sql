-- Organizer emails in one form (trimmed, lower case), and unique whatever the case.
-- Before this, "Bob@x.com" and "bob@x.com" could be two accounts, and team access is matched by email.
-- Safe to run twice. Rows that would collide are left as they are and reported; the unique index is only created
-- when no such pair exists (resolve the reported pairs by hand, then run the index statement again).

UPDATE "EventOrganizer" o
SET email = lower(btrim(o.email))
WHERE o.email <> lower(btrim(o.email))
  AND NOT EXISTS (SELECT 1 FROM "EventOrganizer" x WHERE x.id <> o.id AND lower(btrim(x.email)) = lower(btrim(o.email)));

UPDATE "EventTeamMember" m
SET email = lower(btrim(m.email))
WHERE m.email <> lower(btrim(m.email))
  AND NOT EXISTS (
    SELECT 1 FROM "EventTeamMember" x
    WHERE x.id <> m.id AND x."organizerId" = m."organizerId" AND lower(btrim(x.email)) = lower(btrim(m.email))
  );

DO $$
DECLARE dupes integer;
BEGIN
  SELECT count(*) INTO dupes FROM (
    SELECT lower(btrim(email)) FROM "EventOrganizer" GROUP BY 1 HAVING count(*) > 1
  ) d;
  IF dupes = 0 THEN
    CREATE UNIQUE INDEX IF NOT EXISTS "EventOrganizer_email_lower_key" ON "EventOrganizer" (lower(email));
  ELSE
    RAISE NOTICE 'EventOrganizer: % email(s) exist in more than one case; unique index not created', dupes;
  END IF;
END $$;
