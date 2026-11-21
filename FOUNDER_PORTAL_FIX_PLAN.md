# Founder portal fix plan

Covers every item in [FOUNDER_PORTAL_AUDIT.md](FOUNDER_PORTAL_AUDIT.md): High, Medium and Low. Seven phases, in the order that removes the most risk first. Each phase ends with tests and can be committed on its own.

Item codes (S1, B1, U1, A1) match the audit.

## Status

| Phase | Status |
|---|---|
| 0 | Done, 20 Nov 2026. Tests for Phase 1 items are real; Phase 2 and 3 items are listed as to-do tests so the suite stays green. |
| 1 | Done, 20 Nov 2026. Not committed. No database migration was needed. |
| 2 | Done, 20 Nov 2026. Not committed. |
| 3 | Done, 20 Nov 2026. Not committed. |
| 4 | Done, 20 Nov 2026. Not committed. No database migration was needed. |
| 5 | Done, 20 Nov 2026. Not committed. |
| 6 | Done, 20 Nov 2026, except U9. Not committed. |
| 7 | Done, 20 Nov 2026, except the items listed under it. Not committed. |

Phase 1 as built:
- Every founder sign-in now has a row in the existing `FounderSession` table, named in the cookie. Sign-out deletes the row, so a copied cookie stops working. The site cookie is checked against its `WebUserSession` row in the founder portal too.
- Sign-out clears all three sign-in cookies. "Sign out everywhere" is in the account menu.
- Deactivate reads the request once and works.
- Accounts without a password confirm deactivate and delete with a 6-digit emailed code.
- The dev-only verify route is deleted.
- Founder cookies issued before this release have no session row. They keep working until they expire (7 days at most), or until that person signs out everywhere or changes their password.

Phase 2 as built:
- `founderApi()` in `apps/web/lib/founder/api-session.ts` is the one sign-in check. 43 routes use it; a test fails if a route checks by hand.
- A signed-out request gets 401 on every founder route (33 checked live; six used to answer 500).
- Bad input no longer causes server errors: notification `limit` is kept between 1 and 100, an invalid milestone date gets a clear message, and a story of a startup nobody owns is refused.
- New limits: 60 writes a minute per founder (settings, notifications, URL changes, hiring, two-step setup, ads), 6 DNS checks a minute per founder, 10 uses of an emailed link per 15 minutes per network (reset password, verify email).
- Left for Phase 4: the email verification link still never expires, and reset links are still stored as plain text.

Phase 3 as built:
- Updates and stories go through one set of checks on create and edit: title 3 to 200 characters, text only, 100,000 characters at most, summary 500 at most, cover image a full `https` address.
- A startup can publish 5 updates in 24 hours. Drafts and stories are not counted.
- Create, edit and delete refresh the story page, the stories list and the startup's page at once. Milestones refresh the startup's page.
- The public page says "Startup Update" for updates, and names the founder as author (or the startup, when the founder has turned off "Show me on my startup's profile").
- Found and fixed on the way: "Publish" on a saved draft update only saved it again and never published it.
- Saving content is now limited to 30 an hour per founder. It was 3 an hour per network, shared with other actions.
- Milestones: date must be real, from 1990 to one year ahead; amount zero or more; currency INR, USD or EUR.
- Decided 20 Nov: a change to an approved, live founder story goes back to review. The story comes off the public site until it is approved again; the approved version is kept in its version history, and re-approval keeps the original publish date. Startup updates are not reviewed. A fuller version (keep the approved text live while the edit waits) would need a pending-edits screen in the admin app and is not built.

Phase 4 as built:
- Sign-in gives one answer, "Email or password is incorrect.", for an unknown email, a wrong password and a Google-only account. Suspended, deactivated and unverified states are told only to someone who entered the right password. This is the shared sign-in, so site users and event hosts get the same answers.
- "Continue with Google" (site and founder routes) ties the request to the browser with a short-lived cookie and refuses an answer that doesn't match. The events-workspace Google sign-in already had this check (confirmed 21 Nov; an earlier note here said it didn't, which was wrong).
- A password account that signs in with Google keeps its password. Any account can ask for a reset link.
- Reset links are stored as a hash. Verification links are stored as a hash and work for 24 hours. Links emailed before this release stop working.
- A founder who finished founder onboarding is no longer sent to the site's onboarding. It takes effect at their next sign-in.
- After sign-in on the sign-in page, a founder lands on the dashboard (it used to stay on the sign-in page). A signed-out visit to a founder page returns to that page after sign-in.
- Found and fixed on the way: the onboarding page accepted an outside address as its return page.
- Still true: after 5 wrong passwords the "account locked" message shows that the account exists.

Phase 5 as built:
- Profile: name is trimmed, 2 to 100 characters, no `<` or `>`; phone is digits with the usual separators; a new photo must be an upload or the person's Google photo (a photo already on the profile may stay). Profile saves are in the activity log.
- Public URLs: reserved words are refused, and so is another listing's current or old URL. A listing can take back its own old URL.
- Tool DNS verification uses a value made from a server secret. Records added with the old value are still accepted.
- Uploads: both upload routes check the file's first bytes are a real JPEG, PNG, WebP or GIF.
- "Angle" is now "Angel" in the funding rounds list (shared with the admin app). Rounds saved as "Angle" show as "Angel" in the form and are corrected when saved; rows not opened keep the old spelling in the database.
- Form limits come from one place: startup tagline 60, tool tagline 100, tool description 1,000. The server now enforces them. Longer text already on a listing may stay if it isn't changed.
- A tool tagline over 100 characters used to be cut off silently; it now gets a message.

Phase 6 as built:
- Every founder screen sets its own browser-tab title (a test fails if a new screen doesn't).
- The company email banner is hidden when the founder's startup is already verified, stays dismissed for 30 days, and is one line on a phone.
- Every field on the founder forms has a label a screen reader can read. Some of these components are shared with the admin app (funding rounds, social links, strengths and limitations, category and city pickers).
- Startup edit form and tool form: Save lists every problem at once, each item jumps to its field, and bad fields get a red outline. The startup edit form also has jump links to its six parts.
- Found and fixed on the way: the startup form's Save button stayed greyed out, with no reason given, until every required field was filled. It is now always usable and says what is missing.
- A wrong address inside the portal shows the portal's own "not found" page, with the menu and a way back.
- Content is in the side menu.
- Phone: the startup edit page no longer scrolls sideways, the company email box in Settings is full width, and the dashboard shows one Create button.
- Wording: "List a tool", "List your AI tool", "Invite a teammate", "Submit for review"; funding stages read "Pre-Series A", not "PRE SERIES_A".
- Not done, U9 (security settings in two places): Profile → Security has the signed-in devices list that Settings → Security lacks, so hiding either one would remove something. Merging them is a small project of its own.
- Not done: a sentence in Settings explaining "Verified startup" against "Verified email".

Phase 7 as built:
- The sign-in lookup runs once per request and is reused by the layout, the page and their helpers.
- The portal layout runs its three lookups together instead of one after another.
- Removed: unused lines in the settings route, and 8 error branches that can no longer run now that every route uses the shared guard.
- Found and fixed on the way: deleting an account from the site's Profile page also erases the founder account, and for a Google-only account it needed no confirmation. It now needs the emailed code too. In that screen the Delete button had also been unusable for Google-only accounts.
- Found and fixed on the way: three links pointed at `/founder/login`, a page that doesn't exist (the contact page and two places in the hiring portal). They now go to the real sign-in.
- Not done, A3: the remaining hand-written checks were not moved to schemas. The routes changed in Phases 2 to 5 use shared checks.
- Not done, A6: the startup form (about 1,170 lines) and tool form (about 850) were not split into smaller files. It changes nothing for founders and is safer as its own change.
- Not done: the ads routes stay, behind their off switch.

## Added after the plan: founder story editor (20 Nov 2026)

- Founder stories are written on a page of their own (`apps/web/components/founder/StoryEditor.tsx`): title, optional subtitle, optional cover upload, and the story with headings, bold, italics, links, quotes, lists and a divider. Formatting appears above selected text and in a bar that stays in view.
- A draft saves itself to the founder's account a few seconds after they stop typing, and the bar says so. A reload reopens the draft. A story that is live or in review saves only when asked.
- The server cleans the story to plain formatting, stores its text, word count and reading time, and refuses to send a story for review under 100 characters or publish an update with no text.
- Plain-text updates now show with their paragraphs, line breaks and clickable links on the public page.
- Draft saves have their own limit (240 an hour per founder), separate from publishing.
- The old Category choice on stories is gone: it was never saved.
- Fixed on the way: links in host-written event descriptions and founder content were meant to open in a new tab with "nofollow", but the cleaning step removed those attributes again.
- Not tried: a real cover upload (storage is shared with production), and an approved formatted story on its public page.
- The rest of the Create section review was fixed the same day:
  - Updates link to their Stories address, and an update or story opened under `/news/...` is sent there, so it no longer carries a "News" badge.
  - Edit and delete refresh the `/news/...` address and the public Milestones page as well.
  - Milestones share the 30-an-hour per-founder limit with updates and stories (it was 3 an hour per network).
  - A second similar milestone asks first ("Add it anyway"). Milestones can be edited.
  - Amounts read "₹25 lakh", "₹2.5 crore", "$2.5M".
  - The content list always shows Edit and Delete, has a "View on the site" link for published posts, and reports a failed delete.
  - The update form no longer has the unused Tag, and says plainly whether a draft is in the account or only in this browser.
  - An update with no cover image no longer shows a large empty box above its text.
- Milestone UI and UX pass (same day): the amount box was squeezed to 30 px next to the currency and is now full size, with a line showing how the amount will read ("Shows as ₹2.5 crore"); an error clears once the founder changes something and the cursor moves to the field concerned; the chosen type has a clear outline and tick; a green "Milestone added" or "Milestone updated" note shows back on the Content page; list dates carry the year; on a phone the title is shown in full and the three Create cards are compact rows.
- The Create screens use one neutral line-icon style (no coloured gradient tiles).
- Decided 20 Nov, where things are shown: founder stories on the Founder Stories page; startup updates and milestones on the startup's own profile only.
  - The "Startup Milestones" section is removed from the home page.
  - The public Milestones page is retired: `/milestones` now sends visitors to the startup directory, and it is out of the sitemap.
  - Startup updates are kept out of the site-wide article lists (the home page's lead story, its "latest" list and the ticker). Before, the newest update could appear there.
  - An update still has its own page under `/stories/...`, reached from the startup's profile, and can still be found by site search.
- Left as it is: milestones go public without review. They show without the "verified" tick until our team verifies them.

## Release checklist

Checked on 20 Nov 2026, on the local machine:
- [x] Web tests: 1,739 pass in 187 files (final run, after all Create section and placement work)
- [x] Web production build re-run at the end: succeeds
- [x] Web type check and lint: no errors (27 lint warnings, none new errors)
- [x] Web production build
- [x] Admin type check
- [x] Changed files scanned for keys, passwords and database addresses: none
- [x] No database migration in any phase

Before commit:
- [ ] Leave `docs/development/TEST_ACCOUNTS.md` and `packages/database/seed-dev.ts` out of the commit (they hold the dev test password)

After deploy, check by hand in production:
- [ ] Sign in with a password, and land on the founder dashboard
- [ ] Sign out, then confirm an old tab no longer works
- [ ] "Sign out everywhere" from a second browser
- [ ] "Continue with Google" for an existing founder and for a new one
- [ ] Two-step sign-in, if any account has it on
- [ ] Forgot password: request a link, use it once, confirm it can't be used twice
- [ ] Post an update, edit it, delete it; reload its public link each time
- [ ] Edit a live founder story, approve it in the admin app, confirm the original date is kept
- [ ] Upload a logo and a profile photo
- [ ] Post an update with two paragraphs and a link; check they show as paragraphs and the link works
- [ ] Add, edit and delete a milestone; check the startup's profile each time, and that the home page shows no milestones
- [ ] Write a founder story: add a cover, format some text, reload mid-way, submit, approve it in admin, read it on the public page
- [ ] Deactivate and reactivate a test account
- [ ] Team invite, ownership transfer and DNS verification (not testable locally)
- [ ] The new limits, by saving settings repeatedly (rate limiting is off locally)

## Summary

| Phase | Theme | Items | Database change | Size |
|---|---|---|---|---|
| 0 | Safety net before touching anything | tests only | no | Small |
| 1 | Sessions, sign-out and broken account actions | S1, B1, S7, S11 | no (uses the existing session tables) | Medium |
| 2 | One route guard and correct error answers | A2, S8, S9, S6 (limits) | no | Medium |
| 3 | Updates, stories and milestones | S2, S3, B3, S13 | no | Medium |
| 4 | Sign-in and Google sign-in | S4, S5, S6 (links), B2, B5, U8 | no (the link carries its own issue time) | Medium |
| 5 | Input fields | S10, S12, S14, B4, U6 | no | Small |
| 6 | UX and UI | U1 to U5, U7, U9 to U12 | no | Medium |
| 7 | Code clean-up and release checks | A1, A3 to A7 | no | Medium |

Phases 1 to 3 are the ones that matter for production safety. Phases 4 to 7 can follow in later releases.

---

## Phase 0: Safety net

**Goal:** have a test that fails today for each confirmed bug, so every later fix is proven.

What happens:
- Add integration tests that reproduce the confirmed problems:
  - old cookie still works after sign-out (S1)
  - deactivate with the correct password is refused (B1)
  - a 600 KB update and a `javascript:` cover image are accepted (S2)
  - a signed-out call to notifications, settings, support, data export and change email returns 500 (S8)
- Add a test that lists every file under `app/api/founder` and fails if a route has no sign-in check. It starts with a list of known exceptions (sign-in, reset, invite accept, unsubscribe).

Done when: the new tests run and fail for the reasons above; the existing 1,522 tests still pass.

---

## Phase 1: Sessions, sign-out and broken account actions

**Goal:** signing out really ends the session, and the account actions in Settings work.

### S1. Sign-out does not end the session

What is wrong: sign-out only removes the cookie from the browser. The server never records that the session ended, so a copied cookie keeps working for 7 days.

What changes:
- Each sign-in gets a session id inside the cookie.
- The founder record gets a list of ended session ids. This is the same design already used for employer team members (`sessionsValidAfter` plus `revokedSessionIds`). `FounderUser` already has `sessionsValidAfter`; it needs `revokedSessionIds`.
- `getFounderSession` (in `lib/founder-auth.ts`) refuses a cookie whose session id is on the ended list.
- All three sign-in paths apply the same checks. Today the third path (unified session) skips the "sessions ended after password change" check.
- Sign-out (`/api/founder/auth/logout` and `/api/user/auth/logout`) ends the session on the server and clears all three cookies: `founder-token`, `user-token`, `unified_session`.
- Add "Sign out everywhere" to the founder header menu. It sets `sessionsValidAfter` to now.

Files: `lib/founder-auth.ts`, `lib/founder/account.ts`, both logout routes, `components/founder/FounderHeader.tsx`, one migration.

### B1. Deactivate account never works

What is wrong: `app/api/founder/deactivate/route.ts` reads the request body twice. The second read is empty, so the password is always missing.

What changes: read the body once. Add a test with the correct and a wrong password.

### S7. Google-only accounts can be deleted with no confirmation

What changes: when the account has no password, delete and deactivate ask for a 6-digit code sent to the account email, using the existing email-code helper.

### S11. Development-only verify route

What changes: delete `app/api/founder/auth/manual-verify/route.ts`. The seed script already creates verified accounts.

Done when: Phase 0 tests for S1 and B1 pass; a cookie copied before sign-out gets 401 after; deactivate and reactivate work in the browser.

**Production step:** none. No migration.

---

## Phase 2: One route guard and correct error answers

**Goal:** every founder route checks sign-in the same way and answers with the right status.

### A2 and S8. Shared guard

What is wrong: 54 routes each check sign-in their own way. Six of them turn "not signed in" into a server error.

What changes:
- Add `founderApi()` in `lib/founder/api-session.ts`, shaped like the employer one: it returns either the session or a ready 401 answer.
- Convert every route under `app/api/founder` to use it.
- Turn the Phase 0 "every route has a check" test on with no exceptions beyond the public ones.

### S9. Server errors on bad input

What changes:
- `lib/founder-content-auth.ts`: a startup with no owner returns "not found" instead of crashing. It also ignores deleted startups.
- `notifications`: `limit` is read as a number between 1 and 100, default 50.
- `milestones`: an invalid date returns a clear 400 message.

### S6 (first half). Missing rate limits

What changes: add the existing limiters to reset password, email verification, startup DNS check, tool DNS check, URL change, settings, notifications, hiring and two-step setup. The DNS checks get a strict limit (a few per minute per founder).

Done when: all 33 signed-out calls from the audit return 401 or 403, none 500; the three bad-input cases return 400 or 404.

---

## Phase 3: Updates, stories and milestones

**Goal:** what a founder publishes is checked, and what they delete disappears.

### S2. Updates go public with weak checks

What changes in `app/api/founder/content/route.ts` and `content/[id]/route.ts`:
- One schema for create and edit: title 3 to 200 characters, content must be text, maximum 100,000 characters (the edit route already has this limit; create does not).
- Cover image must be a full `https` address on a public host, using the existing `isPublicWebUrl` check. Anything else is rejected.
- Excerpt maximum 500 characters.
- A limit of updates per startup per day (suggested: 5) so a taken-over account can't flood the stories page.

Decision for you: keep instant publishing for updates, or hold the first update from each startup for review. The plan assumes instant publishing stays.

### S3. Deleted update stays public for an hour

What changes: after create, edit and delete, refresh the cached public pages: the story page, the stories list and the startup's profile. `lib/founder/refresh-listing.ts` already does this for listings and gets a story version.

### B3. Update shown as "Founder Story" by "Founder Content"

What changes: the public story page shows "Startup update" for updates and "Founder story" for stories, and names the founder and startup as the author when the article has a founder author.

### S13. Milestone checks

What changes: date must be a real date, not more than one year ahead; amount must be zero or more; currency must be from the allowed list.

Done when: the Phase 0 tests for S2 pass; deleting a test update makes its public page return 404 straight away; a new update shows the right label and author.

---

## Phase 4: Sign-in and Google sign-in

**Goal:** sign-in gives nothing away, Google sign-in is safe, and founders land where they expect.

### S4. Sign-in reveals registered emails

What changes in `app/api/user/auth/login/route.ts`: one answer for every failure ("Email or password is incorrect"). The "sign in with Google" hint and the attempts-remaining count go away from the answer; the lockout email still tells the real owner.

### S5. Google sign-in

What changes in `app/api/founder/auth/google/route.ts` and `callback/route.ts`:
- The start route puts a random value in a short-lived cookie and in the request to Google. The callback refuses when they don't match.
- Email is lower-cased before the account lookup.
- A password account that signs in with Google keeps its password. The account is marked as having both, so "forgot password" keeps working.

### S6 (second half). Links

What changes:
- Email verification links expire after 24 hours (needs a new expiry column, one migration).
- Reset links are stored as a hash, not as plain text. Existing unused links stop working at deploy, which is acceptable for 1-hour links.

### B2. Founder sent to a second onboarding

What is wrong: `middleware.ts` sends anyone whose site-user record says "onboarding not done" to `/onboarding`, even a founder who finished founder onboarding.

What changes: when the person has a completed founder record, the site-user onboarding is marked done at sign-in, and the middleware skips the redirect for them.

### B5 and U8. After sign-in

What changes:
- Re-test sign-in by hand. If the page does stay on sign-in after success, fix the redirect in the login page.
- A signed-out visit to a founder page remembers the page (`returnTo`) and goes back there after sign-in. Only paths inside the site are accepted.

Done when: wrong email and wrong password give the same answer; a Google callback with a mismatched value is refused; a founder opening `/startups/<their-slug>` sees the page.

---

## Phase 5: Input fields

**Goal:** every field a founder can type into is checked on the server.

- **S10. Profile** (`app/api/founder/profile/update/route.ts`):
  - name is trimmed, 2 to 100 characters, no angle brackets
  - phone allows digits, spaces, `+`, `-` and brackets, 7 to 20 characters
  - photo must be an address on the site's own media host
  - a profile change is written to the activity log
- **S12. Startup and tool URL change:** refuse a URL that is another listing's old URL, and refuse reserved words (`submit`, `new`, `claim`, `category`, `compare`, `alternatives`). Tool verification uses a random stored token instead of one derived from the tool id.
- **S14. Uploads:** check the first bytes of the file to confirm it is really a JPEG, PNG, WebP or GIF.
- **B4.** "Angle" becomes "Angel".
- **U6.** One shared set of limits (tagline, description, names) used by both the forms and the server, so the counters match.

Done when: every bad-input request from the audit is refused with a clear message.

---

## Phase 6: UX and UI

**Goal:** the portal reads and behaves consistently on desktop and phone.

- **U1. Page titles** on all 18 screens ("Startup | Udyaibase", "Settings | Udyaibase" and so on).
- **U2. Company email banner:** not shown when the founder's startup is already verified; once dismissed it stays dismissed for 30 days; on a phone it becomes one line. Settings explains the difference between "Verified startup" and "Verified email".
- **U3. Labels:** every field gets a label a screen reader can read (29 fields across six screens).
- **U4. Form errors:** the startup and tool forms show a message under each wrong field and scroll to the first one, instead of the browser bubble.
- **U5. Startup form:** section jump links at the top (Basics, Links, Team, Funding, FAQs), as the job composer now has.
- **U7. Not-found page** inside the portal keeps the menu and offers "Back to dashboard".
- **U9. Security in one place:** Profile → Security links to Settings → Security.
- **U10. Content in the side menu** under Listings.
- **U11. Phone layout:** fix the sideways scroll on the startup edit page, the cut-off email box in Settings and the duplicate Create button on the dashboard.
- **U12. Wording:** one phrase per action ("List a tool", "Invite a teammate"), sentence case, readable stage names ("Pre-Series A").

Done when: each screen is re-checked at 375 px and desktop, and a keyboard pass reaches every control.

---

## Phase 7: Code clean-up and release checks

**Goal:** make the next change cheaper and safer. None of this changes what founders see.

- **A1. One sign-in check.** `getFounderSession` becomes a single cached lookup per request with one set of rules for all three cookies. Merging the three account records into one is a larger project and is not part of this plan.
- **A3. Validation.** Routes touched in earlier phases use shared schemas; the remaining hand-written checks move to schemas.
- **A4. Fewer queries.** The layout runs its queries together, and pages reuse the cached session.
- **A5. Dead code** removed: unused lines in settings, and the ads routes if ads stay off.
- **A6. Large components** (startup form 1,140 lines, tool form 842) split by section, after Phase 6 has settled them.
- **A7. Tests** for sign-out, deactivate, content and Google sign-in stay in the suite.
- **Release checks:** full test run, production build, lint, and a manual pass in production of sign-in, sign-out, Google sign-in, two-step sign-in, team invite, ownership transfer and DNS verification, which the audit could not test locally.

---

## Decisions needed from you

1. **Phase 3:** keep instant publishing for startup updates, or review the first update from each startup?
2. **Phase 1:** is an emailed code acceptable as the confirmation for Google-only accounts deleting or deactivating?
3. **Phase 5:** restrict profile photos to uploads on the site's own media host? Founders who pasted an outside photo address would need to upload it.

## Not in this plan

- Merging the founder, site-user and unified account records into one.
- Company profile and verification rules, which stay as they are.
- Ads and payments, which are switched off.
