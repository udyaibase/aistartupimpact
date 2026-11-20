# Employer Portal and AI Jobs: Detailed Fix Plan

Date: 20 November 2026 · Companion to `EMPLOYER_PORTAL_JOBS_AUDIT.md`. Finding numbers (S1, U1, A1, E1) refer to that report.

## How to read this plan

There are eight phases. Each phase says:

- **Goal**: what the phase is for.
- **What changes for people**: what an employer, teammate or candidate will notice afterwards.
- **Fixes**: for each one, the problem today, the steps, the files, and how we prove it is fixed.
- **Done when**: the exit test for the phase.

Phases 1 to 3 plus phase 7 are what make the hiring product production ready. Phases 4 to 6 can ship after launch, in order.

Effort figures are my estimates for one developer and include tests.

| Phase | Goal | Fixes | Effort |
|-------|------|-------|--------|
| 0 | Clean base to work from | A9 | 0.5 day |
| 1 | Close the High items and the quick fixes | S1, S8, S7, S2, S10, S11, U1, A7 | 1.5 days |
| 2 | Safer sign-in and sessions, faster portal | S3, E1, A4, S4, S12, S5, S15, S16, S17, S18 | 3 days |
| 3 | One answer for "verified" and for every count | S6, A2, U3, U2, A3, S20 | 2.5 days |
| 4 | Candidate and public jobs experience | U6, U7, U8, U11, S13, S14, E4, public low items | 3 days |
| 5 | Employer portal polish and accessibility | U5, U9, U10, U12, U13, A6, portal low items | 3 days |
| 6 | Structure and scale | A1, A5, E6, S9, S19, A8, E2, E3, E5 | 4 days |
| 7 | Release gate | Untested areas, production config, rollout | 2 days |

Total: about 19.5 working days. Phases 1 to 3 plus the gate: about 9.5.

## On hold

**U4, Company profile editing.** Removed from this plan at your request. Company details and verification belong to the founder portal, so the employer Company page stays as it is. Nothing in any phase touches it.

Two fixes in phase 3 sit close to that area. They are kept, and neither changes how verification works or where it happens:

- S6 only makes the public "Verified Company" tick follow the verification result the founder portal already produces.
- U3 only makes the employer portal's wording match that same result.

If you want those two held as well, say so and phase 3 becomes the counts work alone.

## Decisions needed from you

| # | Question | Recommendation | Affects |
|---|----------|----------------|---------|
| D1 | Remove the password reactivation route entirely? | Yes. Code sign-in already reactivates. | Phase 1 |
| D2 | End password sign-in now instead of 31 December? | Yes if few accounts still use it. It removes S4 and S12 outright. | Phase 2 |
| D3 | Show view and application counts on the public job page? | Hide both. Keep them in the portal. | Phase 4 |
| D4 | Login page claims ("45K+ professionals", "500+ companies", "pre-screened") | Replace with claims you can evidence today. | Phase 5 |
| D5 | Verify a guest candidate's email when they apply? | Not as a blocker. Add a "this wasn't me" link to the confirmation email. | Phase 4 |
| D6 | Keep interleaving search results by company? | Only for the default order. Make the named sorts true sorts. | Phase 4 |
| D7 | Virus-scan resumes? | Sandbox the viewer now. Add scanning only if you have a service for it. | Phase 4 |
| D8 | Merge Help and Support into one screen? | Yes. Keep `/employer/help`, redirect `/employer/support`. | Phase 5 |

---

## Phase 0: Clean base (0.5 day)

**Goal.** Start from a branch that can be reviewed and rolled back.

**What changes for people.** Nothing visible.

### 0.1 Commit the work in progress (A9)

- **Problem today.** 133 files are changed and uncommitted on `feat/employer-hiring-steps` (about 3,700 lines added). A fix made on top of that cannot be reviewed or reverted on its own.
- **Steps.**
  1. Scan the full diff for secrets (keys, passwords, database URLs).
  2. Split into commits by area: admin support screens, hiring steps (pipeline, offers, assessments), public jobs pages, invite pages.
  3. Run the unit suite after each commit.
- **Proof.** `git status` is clean; 1,007 unit tests pass.

### 0.2 Signed-in end-to-end helper

- **Problem today.** The portal's end-to-end tests only check that pages do not return 500 when signed out. Nothing signs in, so a bug like the hidden move dialog cannot be caught.
- **Steps.**
  1. Add a Playwright helper that requests a sign-in code for a seeded `.test` account, reads the code from the test inbox log, and signs in.
  2. Provide three fixtures: Owner, Recruiter, Interviewer (limited to one job).
  3. Add one smoke test per role that opens the landing page for that role.
- **Files.** `apps/web/e2e/` (new helper), `apps/web/e2e/employer-portal.spec.ts`.
- **Proof.** The three smoke tests pass locally.

**Done when.** The branch is clean and a signed-in test opens the dashboard.

---

## Phase 1: High items and quick fixes (1.5 days)

**Goal.** Close the one High security gap, the broken candidate move, and every fix that is a few lines.

**What changes for people.**

- Employers: clicking Screening, Interview or pressing a shortcut on an open candidate now shows the confirmation dialog.
- Employers who hide a salary: it is truly hidden.
- Interviewers limited to some jobs: they can no longer read other jobs' pipeline settings.
- Deactivated workspaces: can only come back through code sign-in and two-step.

### 1.1 Remove password reactivation (S1) — High

- **Problem today.** `POST /api/employer/reactivate` brings back a deactivated workspace and signs the owner in with email and password alone. It has no two-step check, no captcha and no lockout, it ignores the 31 December password cut-off, and its error messages reveal which emails have accounts.
- **Steps.**
  1. Delete `apps/web/app/api/employer/reactivate/route.ts`.
  2. In `auth/login/route.ts` (lines 135-143), drop `reactivateUrl` from the deactivated response and keep the message that tells the owner to sign in with an email code.
  3. In the login page, remove any call to the old route and show the code sign-in form when the response says the workspace is deactivated.
  4. Update Settings copy under "Deactivate account" to say "sign in with an email code to reactivate".
- **Proof.** The route returns 404. Integration test: deactivated owner with two-step on, correct password, gets no session.

### 1.2 Reactivate only after two-step passes (S8)

- **Problem today.** In code sign-in, the workspace's `deactivatedAt` is cleared as soon as the email code is right, before the two-step check. Someone with the owner's inbox but not their authenticator can un-deactivate the workspace.
- **Steps.**
  1. In `auth/member-code/route.ts`, move the `deactivatedAt: null` update (line 81) to after the `needsTwoFactor` branch, so it only runs when a session is about to be issued.
  2. In `auth/verify-2fa/route.ts`, clear `deactivatedAt` on success, next to the `lastLoginAt` update.
  3. Log `account_reactivated` in the activity log in both places.
- **Proof.** Integration test: right email code, no two-step code, workspace stays deactivated; with the two-step code it reactivates.

### 1.3 Interviewer job scope on pipeline settings (S7)

- **Problem today.** `GET /api/employer/jobs/[id]/pipeline` checks the role but not the interviewer's job list. An interviewer assigned to one job read another job's rounds, decision owner email and the owner and recruiter emails (confirmed live).
- **Steps.**
  1. After `employerApi('jobs.view')`, return 404 when `canSeeJob(session, id)` is false.
  2. For interviewers, return `people: []` and null decision emails; they cannot edit these.
- **Files.** `api/employer/jobs/[id]/pipeline/route.ts`.
- **Proof.** New case in `__tests__/integration/idor-employer.test.ts`.

### 1.4 Hidden salaries stay hidden (S2)

- **Problem today.** With "Show the salary on the job" off, the search query still sends `salaryMin` and `salaryMax` to the browser and to `/api/jobs/search`, and "Highest salary" sorts by the hidden number.
- **Steps.**
  1. In `lib/jobs/search.ts`, select `CASE WHEN jl."showSalary" THEN jl."salaryMin" END` and the same for max, in both the inner and outer select.
  2. Sort on that same expression, so hidden salaries sort last.
  3. Apply the same rule to the related-jobs query in `jobs/[slug]/page.tsx` and to the company jobs page.
  4. Check the widget and careers page queries in `lib/jobs/careers.ts` for the same leak and fix if present.
- **Proof.** Unit test with a hidden-salary job: API returns null for both fields; salary sort puts it last.

### 1.5 Malformed Referer no longer crashes (S10)

- **Problem today.** `new URL(referer)` in `middleware.ts:101` throws on a bad header, so any state-changing API request with a broken Referer returns 500.
- **Steps.** Wrap in try/catch; treat a bad Referer as a failed origin check and return 403.
- **Proof.** `curl -X POST -H 'Referer: not a url'` returns 403. Add to `csrf-protection.test.ts`.

### 1.6 Export returns 401 when signed out (S11)

- **Problem today.** `GET /api/employer/export-data` throws `EMPLOYER_AUTH_REQUIRED` and returns 500.
- **Steps.** Catch that error and return 401, the same way `delete-account` does.
- **Proof.** Signed-out GET returns 401. Add to `auth-enforcement.test.ts`.

### 1.7 Dialogs open above the candidate panel (U1, A7) — High

- **Problem today.** The candidate panel and resume viewer use layer 400 (`z-modal`). Dialogs opened from the panel use hard-coded 120 to 140, so they render underneath. With the resume showing, the move dialog is fully covered.
- **Steps.**
  1. In `tailwind.config.ts`, add a `dialog` layer (450) between `modal` (400) and `toast` (500).
  2. Replace hard-coded layers with the token in: `MoveDialog.tsx:89`, `ShareShortlist.tsx:58`, `AddCandidates.tsx:74`, `FilledPrompt.tsx:58`, `CompareFinalists.tsx:39`, `PipelineSettings.tsx:75`, `StageSections.tsx:492`.
  3. Put the board toast (`PipelineBoard.tsx:669`) on `z-toast`.
  4. Search `components/employer` and `app/employer` for the remaining hard-coded `z-[1xx]` values (11 in total) and move each to a token.
  5. Check focus: when a dialog opens over the panel, focus moves into it and Escape closes only the dialog.
- **Proof.** End-to-end test: open a candidate with the resume showing, press S, confirm, see "Moved 1 candidate". Manual check of each dialog at desktop and phone width, in light and dark themes.

**Done when.** All proofs pass. Audit summary items 1, 2 and 5 are closed.

---

## Phase 2: Safer sign-in and sessions, faster portal (3 days)

**Goal.** Make a session something that can be ended, remove the ways sign-in leaks or can be blocked, and cut the portal's page time. These all touch `getEmployerSession`, so they are done together.

**What changes for people.**

- Signing out really ends the session. A new "Sign out everywhere" button appears in Settings.
- Removing a teammate or changing their role signs them out at once.
- Portal pages load noticeably faster.
- The code request has a human check. Sign-in emails no longer show the code in the subject.

### 2.1 Revocable sessions (S3)

- **Problem today.** The session is a 7-day signed token. Sign-out deletes the cookie, but a copied token keeps working. The existing cut-off (`sessionsValidAfter`) is skipped for teammate sessions, and owners who sign in by code now get teammate-style sessions.
- **Steps.**
  1. Migration: add nullable `sessionsValidAfter` to `JobBoardTeamMember`.
  2. In `lib/employer-auth.ts`, select it with the member row and reject the token when it was issued before the cut-off. Keep the workspace-level check for owner-account sessions.
  3. Set the member's cut-off on: sign-out (`auth/logout`), role change and removal (`team/[memberId]`), and email change.
  4. Add `POST /api/employer/sessions/revoke` and a "Sign out everywhere" button in Settings, gated by the existing emailed action code.
  5. Shorten the session to 7 days sliding or keep 7 days fixed; no change unless you want one.
- **Files.** `packages/database/prisma/schema.prisma`, `lib/employer-auth.ts`, `auth/logout/route.ts`, `team/[memberId]/route.ts`, `employer/(portal)/settings/page.tsx`.
- **Proof.** Integration test: capture the cookie, sign out, replay it, get 401. Same after a role change.
- **Migration.** One nullable column. Run by hand on production before merge with `scripts/prod-migrate.sh`, choosing `neondb`.

### 2.2 Portal layout queries in parallel (E1)

- **Problem today.** Every portal page waits on about eight database calls made one after another: session (2), shell, founder lookup (2), other workspaces, plan, status. The page then checks the session again. Pages spent 500 to 1,000 ms in application code locally.
- **Steps.**
  1. Wrap `getEmployerSession` in React `cache()` so layout, page and guards share one lookup per request.
  2. In `employer/(portal)/layout.tsx`, run shell, founder lookup, other workspaces and portal status with `Promise.all`.
  3. Add the plan fields to the shell query and delete the separate `planRow` query.
  4. Join the member lookup into the employer query inside `getEmployerSession` (one query instead of two).
- **Files.** `lib/employer-auth.ts`, `employer/(portal)/layout.tsx:23-48`, `lib/employer/portal.ts`.
- **Proof.** Compare the dev log's "application-code" time for `/employer/dashboard`, `/employer/applications` and `/employer/jobs` before and after. Target: at least half.

### 2.3 Read plan and company name from the database (A4)

- **Problem today.** The token carries `plan`, `companyName` and `slug` for 7 days, so a plan change or rename is not reflected until the next sign-in.
- **Steps.** Return those three from the employer row the session check already loads. Stop writing them into new tokens; keep reading old tokens without error.
- **Proof.** Change the plan in the database; the portal header and limits update on the next request.

### 2.4 No email enumeration on password sign-in (S4)

- **Problem today.** Unknown emails get "Invalid email or password"; real accounts get "…4 attempts remaining". Founder-only and code-only accounts get their own messages without a password.
- **Steps (if D2 is no).** One message for every failure. Remove the attempts count. Offer "sign in with a code instead" on every failure.
- **Steps (if D2 is yes).** Set `PASSWORD_SIGNIN_UNTIL` to now, remove the password form, and return 410 from `auth/login`, `auth/forgot-password`, `auth/reset-password` and `change-password`.
- **Proof.** Unknown and known emails return identical bodies and status.

### 2.5 Unverified legacy accounts (S12)

- **Problem today.** Password sign-in does not require a verified email, and "switch workspace" trusts the session's email. An old unverified account could switch into a team that address belongs to.
- **Steps.** Require `emailVerified` in `auth/login` and in `workspaces/switch`. Not needed if D2 is yes.
- **Proof.** Test with an unverified account: sign-in is refused with a prompt to use a code.

### 2.6 Sign-in cannot be blocked by a stranger (S5)

- **Problem today.** Requesting a code has no human check. Someone who knows a teammate's email can use up that address's three codes per 15 minutes and burn each code with three wrong guesses.
- **Steps.**
  1. Require a Turnstile token on the "send" step of `auth/member-code` and add the widget to the login page.
  2. Count wrong guesses per requester (IP plus email) with a small limit, checked before the guess is counted against the code itself.
  3. Keep the three-attempt limit on the code as the final backstop.
- **Proof.** Send without a token returns 403. Three wrong guesses from one address do not kill the code for a correct guess from another.

### 2.7 Code out of the email subject (S15)

- **Steps.** Change the subject in `sendMemberLoginCode` (`lib/employer/team.ts`) to "Your Udyaibase sign-in code". Same for the signup and action-code emails.
- **Proof.** Read the test-inbox log.

### 2.8 Separate key for the two-step challenge (S16)

- **Problem today.** The 5-minute two-step challenge token is signed with the same key as sessions.
- **Steps.** Derive the challenge key with its own prefix in `lib/employer/sign-in.ts:13` and `auth/verify-2fa/route.ts:13` (one shared helper). Confirm `EMPLOYER_JWT_SECRET` and `OTP_HASH_SECRET` are set in production.
- **Proof.** A challenge token is rejected as a session cookie, and a session token is rejected as a challenge.

### 2.9 Rate limits on open endpoints (S17)

- **Steps.** Add limits to `/api/jobs/search` (per IP), `/api/jobs/[slug]/save` (per user), CSV export (per workspace) and `/api/jobs/notify/unsubscribe` (per IP). Remove `viewsCount` from the search response.
- **Proof.** Read in code now; exercised in phase 7 with Redis on.

### 2.10 Widget framing when Redis is down (S18)

- **Problem today.** If Redis is unreachable, the widget page may be framed by any site.
- **Steps.** On a Redis error, read the widget's allowed domains from the database before falling back. Keep "any site" only when the employer has set no domain.
- **Proof.** Unit test on the fallback path.

**Done when.** A replayed cookie fails after sign-out, the dashboard's server time is at least halved, and all proofs pass.

---

## Phase 3: One answer for "verified" and for every count (2.5 days)

**Goal.** Stop screens contradicting each other. Verification itself stays in the founder portal; this phase only makes the hiring side read that result the same way everywhere.

**What changes for people.**

- Candidates see the "Verified Company" tick only for companies that pass the same rule that lets jobs go live.
- Employers see the same number for the same word on every screen.
- The portal's verification messages match what is actually true for the workspace.

### 3.1 One rule for the verified tick (S6, A2)

- **Problem today.** The rule is written three times: `lib/jobs/trust.ts`, the job page (`jobs/[slug]/page.tsx:122`) and SQL in `lib/jobs/search.ts:72`. They have drifted. Nimbus shows "Verified Company" to candidates while its portal says "Re-verify your startup".
- **Steps.**
  1. In `lib/jobs/trust.ts`, export `companyTrust(employer)` returning `verified`, `checked` or `none`, using the same conditions as the publish gate.
  2. Export a matching SQL fragment from the same file for queries that cannot call the function.
  3. Replace the hand-written rule on the job page, in search, on the company jobs page, in the widget schema and careers queries, and in the composer preview.
  4. Add a test that runs both the function and the SQL fragment over the same seeded rows and asserts they agree.
- **Proof.** A workspace that fails the publish gate shows no tick on any page or API.
- **Not changed.** How a startup gets verified, the founder portal, or the Company page.

### 3.2 Verification wording that matches the state (U3)

- **Problem today.** Nimbus has three live jobs, yet the checklist says "then your jobs can go live", the composer banner says jobs go live once the founder verifies, and the preview says "Unverified company".
- **Steps.**
  1. Define the states once in `lib/employer/portal.ts`: not verified, verified, verification lapsed with jobs live.
  2. Write one short message per state.
  3. Make the dashboard checklist, the composer banner, the sidebar chip and the job preview read that state. Copy only; no change to the Company page.
- **Proof.** Walk each state in seeded data; no two places disagree.

### 3.3 One definition per count (U2, A3)

- **Problem today.** At one moment the same workspace showed: dashboard "20 new" and "waiting 20"; board "Review new · 42" and "Waiting · 70"; insights "29 waiting more than 5 days"; jobs "New 17 (10 unseen)"; insights per job "36 (24 new)". Billing said 4 seats used, Team said 3 members.
- **Steps.**
  1. Create `lib/employer/counts.ts` with four named counts and a one-line definition each:
     - `unseen`: applications nobody on the team has opened.
     - `inNewStage`: applications in the New stage.
     - `awaitingReply`: applications with no first response from the team.
     - `overdue`: awaiting reply for more than 5 days.
  2. Replace the separate calculations in the dashboard, sidebar badge, board header and filters, jobs list, insights and weekly report with calls to it.
  3. Rename labels so each word has one meaning: "Unseen", "In New stage", "Awaiting reply", "Overdue".
  4. Seats: make billing and Team use one query, and decide whether pending invites count (they should, and the Team page should say "3 members, 1 invited").
- **Files.** `lib/employer/portal.ts`, `lib/employer/insights.ts`, `lib/employer/applications.ts`, `lib/employer/billing.ts`, `lib/employer/weekly-report.ts`, and the pages that show them.
- **Proof.** One test seeds a workspace and asserts every screen's number comes from the same function and matches.

### 3.4 Less team detail for job-limited interviewers (S20)

- **Steps.** In `team/route.ts` GET, return names and roles only (no emails, no pending invites) when the session is job-limited. In `company/route.ts` GET, drop the account email for them.
- **Proof.** API test as the seeded interviewer.

**Done when.** The same word shows the same number on every screen, and no screen contradicts another about verification.

---

## Phase 4: Candidate and public jobs experience (3 days)

**Goal.** Fix what a job seeker meets between finding a job and tracking an application.

**What changes for people.**

- Sorting by salary or views really sorts.
- Jobs can be saved from the job page, not just the list.
- Salary reads the same way everywhere, in the right currency.
- The phone layout has a Jobs tab and bigger tap targets.
- A person whose email was used by someone else can remove that application in one click.

### 4.1 Real sorts and honest filter counts (U6)

- **Problem today.** Results are interleaved by company before any sort, so "Highest salary" put a ₹12L job above a ₹38L one. Filter counts ignore the current search, and "Show 33 more roles" lists categories with no jobs.
- **Steps.**
  1. In `lib/jobs/search.ts`, apply company interleaving only when the sort is the default.
  2. Compute filter counts against the current search and other filters.
  3. Hide categories with zero jobs.
- **Proof.** Unit test on ordering for each sort. Manual check of counts with a search term.

### 4.2 Save button on the job page (U7)

- **Steps.** Reuse the list's save control in the job header and next to the bottom "Apply now". Signed-out click opens sign-in and returns to the job.
- **Files.** `jobs/[slug]/page.tsx`, `components/jobs/JobActions.tsx`.

### 4.3 One salary format (U8)

- **Problem today.** "₹16–29 L" on the job page, "₹ 25L–40L" in the list, "INR 2500K–4000K" in related jobs. The list hard-codes ₹ for every currency and prints "0L" when only a minimum is set.
- **Steps.** Add `formatSalary(min, max, currency)` to `lib/jobs/format.ts` handling one-sided ranges and all six currencies. Use it in the list (`JobListClient.tsx:210,240`), job page, related jobs (`page.tsx:593`), careers page, widget and emails.
- **Proof.** Unit tests for INR, USD, min only, max only.

### 4.4 Phone layout (U11)

- **Steps.**
  1. Add AI Jobs to the public bottom navigation.
  2. Make the promo bar dismissible and remember it.
  3. Give the save icon a 44-pixel hit area.
  4. Put the location field in the filter sheet.
  5. Stop the cookie banner covering the first job card's button.
- **Proof.** Screenshots at 375 pixels wide before and after.

### 4.5 Applying with someone else's email (S13)

- **Problem today.** The email on an application is never checked. Anyone can apply as someone else, which blocks the real person, and the duplicate message confirms who applied where.
- **Steps (per D5).**
  1. Add a signed "This wasn't me" link to the application-received email. One click deletes the application.
  2. Change the duplicate response to a neutral message that does not confirm the email has applied.
- **Files.** `lib/jobs/apply-emails.ts`, `api/jobs/[slug]/apply/route.ts:166`, a small new route for the link.

### 4.6 Resume viewer hardening (S14)

- **Steps.**
  1. Add a `sandbox` attribute to the viewer frame in `ResumeViewer.tsx`.
  2. Send `Content-Security-Policy: default-src 'none'` on the inline resume response.
  3. Restrict the legacy `resumeUrl` redirect to https, opened in a new tab with no referrer.
  4. Scanning only if D7 is yes.
- **Proof.** A PDF still previews; a PDF with embedded script does nothing.

### 4.7 Save toggle in one transaction (E4)

- **Steps.** In `api/jobs/[slug]/save/route.ts`, insert with `ON CONFLICT DO NOTHING` or delete, and set `savedCount` from a count of the table, all in one transaction.
- **Proof.** Ten parallel toggles leave the count correct.

### 4.8 Public low items

- Hide view and application counts on the job page (D3).
- "Bengaluru, India" with a comma.
- New applications show "Received" until someone on the team opens them.
- Remove the repeated "create an account" card on the apply confirmation.
- Own page titles for the apply page states and the tracking page.
- Link the notice-period and expected-salary labels to their fields.
- Raise the contrast of error text on the dark theme.

**Done when.** An end-to-end test covers search, sort, save, apply and track at desktop and phone sizes.

---

## Phase 5: Employer portal polish and accessibility (3 days)

**Goal.** Remove the rough edges an employer meets daily.

**What changes for people.** Clearer AI review, easier sign-in, one Help screen, a composer that is easier to move around, and a portal that works by keyboard.

### 5.1 AI review that does not contradict itself (U5)

- **Problem today.** A review said "No readable resume, so this is based on the form answers only", then listed skills as "Shown in resume" with a resume quote. The same card showed "AI pick · 85" beside "56% match · Missing PyTorch". General applications all show "Top pick · 65% match" with no role to match.
- **Steps.**
  1. Show the "no readable resume" line only when no resume text was sent to the review. Never label evidence "Shown in resume" in that case; use "From their answers".
  2. When AI fit and the rules match differ by 25 points or more, add one line saying why (for example "The resume mentions PyTorch; the candidate did not tick it").
  3. For general applications, show no match score and no "Top pick"; sort them by date.
  4. Lower the fit ceiling when the resume text is very short, so a one-line resume cannot score 85.
- **Files.** `components/employer/pipeline/AiReview.tsx`, `lib/jobs/ai-screen.ts`, `lib/jobs/match.ts`.
- **Proof.** Unit tests for each case, using the audit's one-line resume as a fixture.

### 5.2 Code sign-in (U9)

- **Steps.** Add "Resend code" with the 60-second countdown. Submit when the sixth digit is entered. Apply both to the candidate sign-in as well.
- **Files.** `employer/(auth)/login/page.tsx`, `components/jobs/CandidateSignIn.tsx`.

### 5.3 Login page claims (U10)

- **Steps.** Replace per D4. Give the login, signup and forgot-password pages their own titles.

### 5.4 One Help screen (U12)

- **Steps.** Keep `/employer/help` with the ticket form and list. Move the status tabs from Support into it. Redirect `/employer/support` and `/employer/support/[id]`.

### 5.5 Composer navigation (U13)

- **Problem today.** One form about 6,000 pixels tall on a phone, with no way to jump.
- **Steps.** Add section navigation (sticky on desktop, a jump menu on phone). Collapse optional sections (perks, screening questions, where it appears) by default. On "Fix 3 things", link each item to its field.
- **Files.** `components/employer/jobs/JobComposer.tsx`.

### 5.6 Route names (A6)

- **Steps.** Rename `/employer/careers` to `/employer/widget` with a redirect. Add `/employer/candidates` as the main path and redirect `/employer/applications`. Update the sidebar, emails and help articles.

### 5.7 Portal low items

- Greet by name; fall back to "Good morning" alone.
- "1 yr", not "1 yrs"; hide "0 yrs".
- "Remote · India", not "Remote · India · Remote".
- "Series A", not "SERIES_A".
- Activity log: remove "Change your password" and "admins"; stop duplicate entries.
- Hide "Change password" for accounts that sign in by code.
- A portal 404 inside the portal frame, with a link back.
- A short notice when a page is not available for the role, instead of a silent redirect.
- Hide "Re-verify your startup" from interviewers.
- On the Jobs page, the title opens candidates; edit moves into the menu.

### 5.8 Accessibility

- `aria-current="page"` on the active sidebar and bottom-nav link.
- Checkboxes with a 24-pixel box and a 44-pixel hit area.
- Every field has a linked label.
- Contrast check on error and muted text in both themes.
- Keyboard pass through board, candidate panel and each dialog: focus moves in, is trapped, and returns on close.

**Done when.** Every low item in the audit is ticked off and the candidate flow can be completed by keyboard alone.

---

## Phase 6: Structure and scale (4 days)

**Goal.** Remove the causes behind this audit's findings so they do not return, and prepare for more jobs and candidates.

**What changes for people.** Nothing visible, except search and export stay fast as data grows.

### 6.1 One route guard (A1)

- **Problem today.** Four ways to guard a route: `employerApi` (13 routes), `requireEmployerPermission` (2), `requireEmployerAuth` (9), and a hand-written session check plus `can()` (48). Job scope is a separate call that is easy to forget; S7 was exactly that.
- **Steps.**
  1. Extend `employerApi` to take a permission and an optional job id or application id, and to apply job scope itself.
  2. Migrate all 72 guarded routes, in batches by folder (applications, jobs, billing, careers, account).
  3. Add a test that fails when any file under `api/employer` (outside `auth/`) does not use the guard.
  4. Delete `requireEmployerPermission` and `requireEmployerAuth`.
- **Proof.** The existing cross-workspace and role tests still pass; the new test enforces the rule.

### 6.2 One data style, typed rows (A5, E6)

- **Steps.** Move the 12 routes that import `@/lib/db` to Prisma, keeping raw SQL only for search. Type the rows that remain, removing the 48 uses of `any` in hiring code.

### 6.3 Stricter content security policy (S9)

- **Problem today.** `script-src` allows inline scripts, so the policy would not stop an injected one.
- **Steps.** Generate a nonce per request in middleware, pass it to the framework and third-party tags, and remove `'unsafe-inline'` from `script-src`. Run in report-only mode for a week first, then enforce. Embed pages keep their own policy with the same change.
- **Proof.** No violations reported during the report-only week.

### 6.4 DNS rebinding gap in URL fetching (S19)

- **Steps.** In `fetchPublicHtml`, resolve the host once, check the address, and connect to that address (pinned lookup) on each hop.
- **Files.** `packages/utils/safe-url.ts`, `lib/embed/safe-fetch.ts`.

### 6.5 Redis outage does not block sign-in (A8)

- **Steps.** Alert when the limiter is unreachable. For sign-in routes, fall back to a small in-memory limit instead of refusing everyone.
- **Files.** `lib/rate-limit.ts`.

### 6.6 Search at scale (E2)

- **Steps.** Add trigram indexes on job title and company name, or move job search to the Meilisearch instance already configured. Return rows and total from one query.
- **Migration.** Indexes; same manual production step as phase 2.

### 6.7 Streamed export (E3)

- **Steps.** Write the CSV in pages of 500 rows instead of loading up to 5,000 with relations.
- **Files.** `applications/export/route.ts`.

### 6.8 Smaller client components (E5)

- **Steps.** Split `PipelineBoard` (842 lines), `JobComposer` (708) and `CandidatePanel` (587) by concern. Load dialogs on demand.

**Done when.** No hand-written guard remains, the policy has run a week in report-only without violations, and all suites are green.

---

## Phase 7: Release gate (2 days)

**Goal.** Exercise everything the audit could not, on production-like settings, before calling the product production ready.

| Area | What to do | Pass when |
|------|------------|-----------|
| Rate limits | Run with Upstash on, using a test database. Trip each limit: sign-in, code send, apply, upload, search, export. | Each returns 429 at its limit and recovers. |
| Payments | Razorpay test mode: checkout, verify, webhook, invoice, credit note, failed payment, expired plan. | Plan activates only on captured payment for the right amount. |
| Email | Send every template to a controlled inbox. | Links work, unsubscribe headers present, no code in a subject. |
| Storage | Upload, view, download, delete a resume on a non-production R2 bucket. | Files are private; links expire in 5 minutes. |
| Two-step sign-in | Set up, sign in, use a backup code, disable, hit lockout. | Each path works and is logged. |
| CSV import | Run an import, download the problems file, attach resumes, undo. | Counts match; undo removes everything. |
| Sign-in paths | Google for candidates; founder account into hiring; workspace switch. | Each lands in the right place with the right role. |
| Production config | Check `EMPLOYER_JWT_SECRET`, `OTP_HASH_SECRET`, `APPLY_SESSION_SECRET`, Turnstile and R2 are set. Migrations applied. | No dev fallback is reachable. |
| Regression | Re-run the audit's 105 cross-workspace and role calls as an automated test. Full unit, integration and end-to-end suites. | All green. |
| Rollout | Ship phases 1 to 3 as one release. Watch error rate, sign-in success and apply completion for 48 hours before phase 4. | No regression in the three measures. |

---

## Coverage check

Every audit finding and where it is handled:

- **Security.** S1, S2, S7, S8, S10, S11 → phase 1 · S3, S4, S5, S12, S15, S16, S17, S18 → phase 2 · S6, S20 → phase 3 · S13, S14 → phase 4 · S9, S19 → phase 6
- **UX.** U1 → phase 1 · U2, U3 → phase 3 · U6, U7, U8, U11 → phase 4 · U5, U9, U10, U12, U13 → phase 5 · low list → phases 4 and 5 · **U4 → on hold**
- **Architecture.** A9 → phase 0 · A7 → phase 1 · A4 → phase 2 · A2, A3 → phase 3 · A6 → phase 5 · A1, A5, A8 → phase 6
- **Efficiency.** E1 → phase 2 · E4 → phase 4 · E2, E3, E5, E6 → phase 6

---

## Status after the work (20 November 2026)

Phases 1 to 6 are coded on `feat/employer-hiring-steps`. **Nothing is committed.** 1,506 unit and integration tests pass; lint and the type check are clean.

### Done and checked

| Phase | Done | Checked |
|-------|------|---------|
| 1 | Reactivation route removed (S1), reactivation only after two-step (S8), interviewer job scope (S7), hidden salaries (S2), two 500s (S10, S11), dialog layers (U1) | Live, plus tests. S8 by code only. |
| 2 | Revocable sessions and "Sign out everywhere" (S3), one cached session read and parallel layout (E1), fresh plan and name (A4), uniform sign-in answer (S4), confirmed email required (S12), human check on codes (S5), codes out of subjects (S15), separate challenge key (S16), four rate limits (S17), widget framing fallback (S18) | Live, plus tests. S17 by code only. |
| 3 | One definition per count and one seat count (U2), one tick rule (S6), admin-verified counts as verified with matching wording (U3), reduced team list for limited interviewers (S20) | Live, plus tests. S20 by tests only. |
| 4 | True sorts (U6), one salary format (U8), labelled save button (U7), save recount (E4), location on phones (U11), "didn't apply?" email line (S13), https-only legacy resume links (S14), public low items | Live for most. Signed-in save and the email by code only. |
| 5 | AI review wording and general applications (U5), resend and auto-submit (U9), login claims (U10), one Help form (U12), composer jump links (U13), portal 404, small text fixes | Live, except U9 and U10 (code only). |
| 6 | One route guard on every hiring API route, enforced by a test (A1); streamed export (E3) | Live, plus tests. |

### Not done, by decision or for a stated reason

- **On hold at your request:** U4, Company profile editing.
- **Left as is, with reasons in the phase reports:** content policy nonces (S9), DNS pinning (S19), Redis-down fallback (A8), search indexes (E2), raw SQL rewrite (A5, E6), component splitting (E5), route renames (A6), the duplicate-application reply, sandboxing the resume viewer, filter counts that follow the search.
- **Needs your call:** a Jobs tab in the site-wide phone bottom bar, a dismissible promo bar, cookie banner position, ending password sign-in before 31 December, whether the public tick should require a founder-verified startup.
- **Not started:** role-denied notice, AI/rules disagreement line, larger checkboxes and a keyboard-only pass, the S8 test.

### Phase 7: release gate

| Check | Result |
|-------|--------|
| Unit and integration tests | Pass (1,506) |
| Lint, whole web app | Clean. Four plain `<a>` links became router links. |
| Type check | Clean |
| Production build | Pass: compiled, type-checked and generated all static pages (run locally with `NODE_ENV=production`) |
| CSV import: run, problems file, undo | Pass, live: 2 imported, 1 row flagged "No email", undo removed both |
| Cross-workspace and role regression | Pass by integration tests and live spot checks (other workspace's job and candidate return 404; 7 routes return 401 signed out) |
| Startup settings check | Added: in production the server now logs, by name, any missing setting hiring needs and what breaks without it (`lib/ops/production-config.ts`) |

**Could not be checked from this machine. Do these before release:**

1. **Rate limits with Redis on.** Local Redis is the real one, so I did not hammer it. On a test Redis, trip each limit: sign-in, code send, apply, upload, search, save, export.
2. **Payments.** Razorpay keys are not set here. In test mode: checkout, verify, webhook, invoice, credit note, a failed payment.
3. **Real email.** Send each template to an inbox you control. Confirm no code is in a subject and every link works.
4. **Resume storage.** Upload, preview, download and delete against a non-production R2 bucket.
5. **Two-step sign-in.** Set up, sign in, backup code, disable, lockout. Then deactivate that workspace and confirm it only comes back after the two-step code (S8).
6. **Sign-in paths.** Google for candidates, founder account into hiring, switching teams.
7. **Signed-in browser tests.** `e2e/employer-signed-in.spec.ts` is written but has never run: it needs `.env.staging`.
8. **Code sign-in in a real browser.** The resend button and auto-submit (U9) with the real human check.

**Release steps, in order:**

1. Commit: the earlier work in progress first, then one commit per phase. Scan the staged diff for secrets.
2. Run the migration on production by hand **before** deploying: `20261120200000_team_member_session_revocation` (two columns on `JobBoardTeamMember`). The new session check reads them, so code first would sign everyone out of hiring.
3. Confirm these are set in production: `TURNSTILE_SECRET_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `OTP_HASH_SECRET`, `EMPLOYER_JWT_SECRET`, `APPLY_SESSION_SECRET`, the two Upstash values, the four R2 values, `RESEND_API_KEY`, `INTERNAL_API_SECRET`. After deploy, the server log names any that are missing.
4. In the admin app, review which employers have "verified" switched on. They now publish without the job limit.
5. Deploy, then watch error rate, sign-in success and apply completion for 48 hours.

**What people will notice on release:** existing sessions keep working; sign-in asks for the human check before sending a code; "Sign out everywhere" appears in the account menu; counts on the dashboard change because they now mean one thing; hidden salaries disappear from sorting.

---

## End-to-end run before commit (20 November 2026)

One full pass through the product on the local test server, as a real employer and two real candidates would use it. Test data was removed afterwards.

| Step | Result |
|------|--------|
| Sign in through the login form (human check, code, auto-submit, resend countdown) | Pass |
| Post a job: paste a description, "Fill the form" (13 fields filled), add a screening question, publish | Pass |
| Public list: search by title, skill and company; location; work mode; type; experience; role; salary shown; date; visa; both sorts; combined filters; empty result | Pass |
| Public job page: salary, verified tick, location, job markup for Google | Pass |
| Apply as two candidates (resume upload, skills, screening answer, consent); duplicate refused | Pass |
| Candidate tracking page: Received, then Hired / Not selected | Pass |
| Employer board: unseen count, cards, search, four quick filters, filter panel, list view | Pass |
| Candidate panel: details, AI review, team note | Pass, after the AI review fix below |
| New to Screening with email; to Interview with email; schedule interview with calendar invite; scorecard; decision; offer saved and marked sent; accepted; joined | Pass |
| Job auto-closes when filled; "tell the people still waiting" prompt shows above the panel | Pass |
| Put on hold; reject with a reason and email | Pass |
| CSV export; activity log | Pass |
| Interviewer limited to another job cannot see this one; recruiter can work on it but sees no offer amounts, billing or team management | Pass |
| Pause, resume, close, edit the job; public search follows each change | Pass |
| Candidate deletes their data with an emailed code; gone from the board and the export | Pass |

**Two bugs found and fixed in this run:**

1. **AI review discarded real evidence.** The AI shortens what it quotes (drops a few words, ends a sentence early) and the checker only accepted word-for-word quotes. A resume naming Python, PyTorch and LLMs was reported as "No evidence of Python in the resume" and scored 56. The checker now accepts a quote when every word is in the resume, in order and close together; invented quotes still fail. The same candidate now scores 89 with five of six skills recognised. `lib/jobs/ai-screen.ts`, two new tests.
2. **Apply link on a closed or paused job showed a bare "page not found".** It now goes to the job page, which says the role is closed. `app/(public)/jobs/[slug]/apply/page.tsx`.

**Noticed in the run, fixed afterwards:**

- **Must-have skills.** "Fill the form" now ticks as must-have the skills the description calls required (up to 5), and leaves "good to have" ones unticked. Checked live: Python, PyTorch, LLMs and SQL ticked; Hugging Face and Docker not.
- **Salary in the composer preview** is written the same way as on the job page ("₹3–4.8 L per annum"). A test compares the two for every currency.
- **"Withdraw application"** no longer shows once a candidate is rejected or hired, and the server refuses it too.
- **A job closing by itself when filled** is now in the activity log: "The job … closed by itself: every opening is filled".

**Noticed, not changed:**

- The AI missed "Docker" although it was in the resume's skills line. That is the model's answer, not the checker.
