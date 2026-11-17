# Production migration: organizer portal release (November 2026)

Three migrations ship with the organizer portal fixes. They are applied by hand, **before** the new code is
deployed (the Vercel build does not run migrations; see `docs/operations/DEPLOYMENT.md`). All three were applied
to the dev branch (`ep-winter-cloud`) on 2026-11-17. Production is `ep-restless-shadow`.

| Order | Migration | What it does |
|---|---|---|
| 1 | `20261117100000_organizer_email_lowercase` | Lowercases organizer and team-member emails (skips rows that would collide), then adds a unique index on `lower(email)` only if no two accounts differ by case; otherwise prints a NOTICE and skips the index. |
| 2 | `20261117120000_organizer_account_safety` | Adds `EventOrganizer.deletionScheduledAt`, `EventTeamMember.memberOrganizerId` (+ index), `EventOrganizerSession.lastSeenAt`, `Event.venueMapUrl`, `EventCustomQuestion.hiddenAt`. Binds active team memberships to the matching confirmed account. Moves map links out of `address` (`"addr|||url"`) into `venueMapUrl`. Clears the unused `EventTeamMember.passwordHash`. |
| 3 | `20261117140000_organizer_ownership_transfer` | Creates the `OrganizerOwnershipTransfer` table. |

All three only add things or rewrite values in place. The live (old) code keeps working after them, with two small
effects until the new code is deployed: someone typing their email with capitals at sign-in may be told it's wrong,
and the event edit form won't show an existing map link. So run the migrations and deploy straight after.

## 0. Before you start

- Pick a quiet time (late evening IST). The whole thing takes about 15 minutes.
- Have ready: Neon console access, the production **pooled** and **direct** connection strings (Neon → production
  branch → Connect; the pooled host contains `-pooler`, the direct one doesn't), and the Vercel dashboard.
- The code must be committed, pushed and reviewed (CI green) so it can be deployed right after step 5.
- Check Vercel → Project → Settings → Environment Variables (Production) has: `ORGANIZER_JWT_SECRET` (or at least
  `USER_JWT_SECRET`), `CRON_SECRET`, `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`. Zoom and Google Meet
  keys are optional (the buttons stay hidden without them).

## 1. Back up

Neon console → your project → **Branches** → **Create branch**:
- Parent: the production branch, **Head (current data)**.
- Name: `pre-organizer-2026-11-17`.

This is an instant copy you can restore from. Keep it for at least two weeks.

## 2. Read-only checks (Neon SQL editor, on production)

```sql
-- A. Organizer accounts whose emails differ only by case (must be empty for the unique index)
SELECT lower(btrim(email)) AS email, count(*) AS accounts,
       array_agg(id || ' | ' || email || ' | verified=' || "emailVerified" || ' | created=' || "createdAt"::date ORDER BY "createdAt") AS rows
FROM "EventOrganizer" GROUP BY 1 HAVING count(*) > 1;

-- B. One person invited twice to the same team with different case (left as is by the migration; informational)
SELECT "organizerId", lower(btrim(email)) AS email, count(*) FROM "EventTeamMember" GROUP BY 1, 2 HAVING count(*) > 1;

-- C. Events with the map link inside the address (the migration moves these)
SELECT count(*) AS events_with_map_in_address FROM "Event" WHERE address LIKE '%|||%';

-- D. Sizes, to compare after
SELECT (SELECT count(*) FROM "EventOrganizer") AS organizers,
       (SELECT count(*) FROM "EventTeamMember" WHERE status = 'ACTIVE') AS active_members,
       (SELECT count(*) FROM "Event") AS events;
```

If **A** returns rows: for each pair, keep the confirmed (`verified=true`), older account. If the other one has no
events, delete it; if it has events, change its email (for example `old+dup1@domain`) and tell the person. Run A
again until it is empty. Skipping this is safe (the index is just not created), but then two accounts can still
differ by case, so fix it.

## 3. Point a terminal at production (this terminal only)

Prisma migrates through `DIRECT_URL` (`directUrl` in `schema.prisma`). `packages/database/.env` points both
variables at the **dev** branch, so you must set **both** in the shell; shell values win over the file.

```bash
cd ~/Desktop/aistartupimpact/packages/database
read -rs DATABASE_URL && export DATABASE_URL     # paste the production POOLED string, Enter (hidden)
read -rs DIRECT_URL && export DIRECT_URL         # paste the production DIRECT string, Enter (hidden)
```

Never put these in a file, a commit or a chat. Close this terminal when you're done.

## 4. See what is pending

```bash
npx prisma migrate status
```

Check the output:
- `Datasource "db" ... at "ep-restless-shadow..."`: **must** say `ep-restless-shadow`. If it says `ep-winter-cloud`,
  stop: the variables didn't take.
- "Following migrations have not yet been applied": should list the three above. If it lists **others** too, they
  are from earlier work not yet in production; read each one's `migration.sql` before going on. `migrate deploy`
  applies all pending migrations in order.
- If it reports **drift**, or a migration as **failed**, stop and don't run anything else.

## 5. Apply

```bash
npx prisma migrate deploy
npx prisma migrate status        # expect "Database schema is up to date!"
```

If migration 1 found duplicates you'll see `NOTICE: EventOrganizer: N email(s) exist in more than one case; unique
index not created`. The migration still succeeds. Resolve those pairs (step 2A) and then create the index by hand:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS "EventOrganizer_email_lower_key" ON "EventOrganizer" (lower(email));
```

Close the terminal (`exit`) so the production strings are gone.

## 6. Verify (Neon SQL editor)

```sql
SELECT indexname FROM pg_indexes
WHERE indexname IN ('EventOrganizer_email_lower_key', 'EventTeamMember_memberOrganizerId_idx', 'OrganizerOwnershipTransfer_tokenHash_key');
-- expect 3 rows (2 if the email index was skipped)

SELECT table_name, column_name FROM information_schema.columns
WHERE column_name IN ('deletionScheduledAt', 'memberOrganizerId', 'venueMapUrl', 'hiddenAt')
   OR (table_name = 'EventOrganizerSession' AND column_name = 'lastSeenAt');
-- expect 5 rows

SELECT count(*) FROM "Event" WHERE address LIKE '%|||%';                          -- expect 0
SELECT count(*) FROM "EventTeamMember" WHERE status = 'ACTIVE' AND "memberOrganizerId" IS NOT NULL;  -- bound memberships
SELECT count(*) FROM "EventOrganizer" WHERE email <> lower(btrim(email));        -- expect 0 (unless duplicates were left)
```

Compare query D from step 2: organizer, member and event counts must be unchanged.

## 7. Deploy the code

Merge the branch to `main` (or promote the build in Vercel). Watch the deployment finish.

## 8. Smoke test production (10 minutes)

1. Sign in to the organizer portal typing your email with a capital letter.
2. Settings → Preferences: "Signed-in devices" lists this browser.
3. Open an event that had a map link: the edit form shows it in "Venue map link".
4. Attendees page loads, shows "1–N of total", and Next/Previous work if you have more than 100.
5. Open a completed event's public page: it loads (it used to 404).
6. Team page (as owner): "Transfer ownership" section shows.
7. Vercel logs: no new errors for `/api/organizer/*`.
8. Next day: the `data-retention` cron run includes `organizerAccountsDeleted` in its results.

Tell hosts about the visible changes: new sign-ups must confirm their email before the portal opens; accounts that
never confirmed are asked to at their next sign-in (the link is re-sent automatically); account deletion now waits
14 days; Staff can't export attendee lists.

## If something goes wrong

- **Code problem after deploy**: roll back the deployment in Vercel. The old code works with the new columns.
  If you roll back for more than a few hours, put map links back where the old form reads them:
  ```sql
  UPDATE "Event" SET address = coalesce(address, '') || '|||' || "venueMapUrl" WHERE "venueMapUrl" IS NOT NULL AND address NOT LIKE '%|||%';
  ```
- **Data problem from a migration**: restore from the `pre-organizer-2026-11-17` branch (Neon → Branches → that
  branch → Restore, or point production at it). Anything written after the backup is lost, so decide quickly.
- **A migration fails halfway**: `migrate status` marks it failed. Don't re-run blindly. Fix the cause, then
  `npx prisma migrate resolve --rolled-back <name>` (if nothing was applied) or `--applied <name>` (if it was), and
  run `deploy` again. All three migrations use `IF NOT EXISTS` and guarded updates, so re-running them is safe.
