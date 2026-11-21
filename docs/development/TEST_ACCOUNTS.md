# Test accounts (dev database only)

Created by `packages/database/seed-dev.ts` on the Neon **dev** branch. They don't exist in production, and the seed refuses to run against production.

```bash
cd packages/database && NODE_ENV=test npx tsx --env-file=.env seed-dev.ts
```

Re-running replaces the earlier dummy data with a fresh copy.

**Password for every password account:** the value of `SEED_TEST_PASSWORD` in your local `packages/database/.env` (never committed). If it isn't set, the seed makes a random one and prints it at the end of the run. Every account below also signs in with an email code, which needs no password.

All emails use the reserved `.test` domain. The app never sends to it; in local development the email (subject and text, including sign-in codes and links) is printed in the **dev server log** as `[email:test-inbox]`.

## Admin app (`http://localhost:3001`)

Admin signs in with **Google only**, and the Google email must be an active staff member in the dev database. Give your own Google address once (it isn't stored in the code):

```bash
cd packages/database && SEED_ADMIN_EMAIL=you@gmail.com NODE_ENV=test npx tsx --env-file=.env seed-dev.ts --admin-only
```

That makes you Super Admin on the dev database. **Events → Review** has one event waiting ("Pune AI Build Night", from the new organizer `new-organizer@udyaibase.test`) to try the review screen. Re-creating the dummy data keeps this account. Google must allow `http://localhost:3001/api/auth/callback/google` as a redirect URI for the OAuth client in your local `.env`.

## Employer portal (`/employer/login`)

| Who | Email | Sign-in | What to test |
|---|---|---|---|
| Owner, Nimbus AI Labs (Pro plan) | `nimbus-owner@udyaibase.test` | password | Everything: 6 jobs (open, paused, closed, draft), ~110 candidates in every stage, general applications, talent pool, team, careers page |
| Recruiter, Nimbus | `nimbus-recruiter@udyaibase.test` | email code (from the server log) | Can post jobs and move candidates; no team, company or account settings |
| Interviewer, Nimbus (Senior ML Engineer only) | `nimbus-interviewer@udyaibase.test` | email code (from the server log) | Sees only one job's candidates; can add notes; can't move, email or export |
| Owner, Kavach Robotics (Free plan) | `kavach-owner@udyaibase.test` | password | A second company: check its candidates never appear in Nimbus, and vice versa |

Worth trying with Nimbus: "Full Stack Engineer" has 3 openings and "Data Analyst Intern" has 5 (Hired x/y on the Jobs list); a few candidates applied to two roles ("Also applied to"); some talent pool members end within 30 days.

## Organizer portal (`/organizer/login`)

| Who | Email | Role |
|---|---|---|
| Owner, Bengaluru AI Collective (Pro plan) | `organizer@udyaibase.test` | Owner |
| Teammate | `organizer-admin@udyaibase.test` | Admin |
| Teammate | `organizer-manager@udyaibase.test` | Manager |
| Teammate | `organizer-staff@udyaibase.test` | Staff |
| Teammate | `organizer-checkin@udyaibase.test` | Check-in |

Teammates sign in with their own email and the password, then switch to the "Bengaluru AI Collective" workspace. There are 8 events: upcoming paid and free events (in person, virtual, hybrid), one completed event with check-ins, and one draft. Registrations include confirmed, waitlisted, cancelled and checked-in guests.

## Founder portal and site sign-in (`/auth/login`)

| Who | Email | What to test |
|---|---|---|
| Founder, Krishi Mitra AI (verified owner) | `founder@udyaibase.test` | Founder portal, startup editing, hiring from the founder account |

## Public site

- 24 AI tools in 8 categories (slugs start with `demo-`), some featured.
- 15 startups across stages and cities (slugs start with `demo-`), 3 featured.
- 24 funding rounds (pre-seed to Series B, in USD with INR at ₹84/$) from 10 dummy investors; each startup's total funding is the sum of its rounds. See `/funding`, round pages like `/funding/bhasha-labs-series-b-2026`, and investor pages like `/funding/investors/peak-peninsula-ventures`.
- 526 Indian cities with map coordinates (reference data from `packages/utils/src/cities.ts`, the same list production uses), so the `/india-ai` map can place startups. Kept between runs.
- 6 founder stories (the first is written by `founder@udyaibase.test`) and 4 news stories on `/stories`.
- Events and jobs above appear on `/events` and `/jobs`.

Candidates have no resume files (storage is shared with production, so the seed doesn't upload any); the resume panel shows "No resume on file". Apply to a job yourself to test resumes.
