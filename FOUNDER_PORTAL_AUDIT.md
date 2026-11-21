# Founder portal audit

Date: 20 November 2026. Tested on the local dev server and dev database, signed in as the seeded founder `founder@udyaibase.test` (verified owner of Krishi Mitra AI). Nothing was changed in the code. Test records I created were deleted afterwards.

## Verdict

**Overall: 6.7 / 10. Usable, but not as solid as the employer portal is now.** Other founders' data is well protected. The weak points are sign-out, one broken account action, content that goes public without review, and many small input and form gaps.

| Area | Rating | One-line reason |
|---|---|---|
| Security | 6.5 | Data isolation held in every test; sign-out does not end the session |
| Bugs | 6.5 | Deactivate account is broken; several server errors on bad input |
| Input fields | 6.0 | Listings are checked well; profile, updates and milestones are not |
| UI | 7.5 | Clean and consistent; no layout breaks on desktop, two on phone |
| UX and user flow | 7.0 | Clear dashboard and empty states; forms give weak error feedback |
| Architecture | 6.0 | Three sign-in records and three cookies; no shared route guard |

**Fix before relying on it in production:** S1, B1, B2, S2 and S3 below.

## Status after the fixes (20 November 2026)

All seven phases of [FOUNDER_PORTAL_FIX_PLAN.md](FOUNDER_PORTAL_FIX_PLAN.md) are done on the local machine and not yet committed or deployed. The ratings below are my estimate after the fixes; the ones in the table above were before.

| Area | Before | After | What is still open |
|---|---|---|---|
| Security | 6.5 | 8.5 | The lockout message still shows an account exists after 5 wrong passwords |
| Bugs | 6.5 | 8.5 | Nothing known |
| Input fields | 6.0 | 8.5 | A few routes still use hand-written checks |
| UI | 7.5 | 8.5 | Nothing known |
| UX and user flow | 7.0 | 8.5 | Security settings are in two places; no line explaining the two "Verified" badges |
| Architecture | 6.0 | 7.0 | Three account records per person; two very large form components |
| **Overall** | **6.7** | **8.3** | |

Fixed: S1 to S14, B1 to B5, U1 to U8 and U10 to U12, A2, A4, A5 and A7. Partly done: S4 (lockout message), A1 (one lookup per request, records not merged), A3. Not done: U9, A6.

Seven more problems were found and fixed while doing the work:
1. "Publish" on a saved draft update never published it.
2. Editing an approved founder story went live with no second review.
3. Saving content was limited to 3 an hour per network.
4. The onboarding page accepted an outside address as its return page.
5. The startup form's Save button stayed greyed out with no reason given.
6. Deleting a Google-only account from the site Profile page needed no confirmation, and also erased the founder account.
7. Three links pointed at a founder sign-in page that doesn't exist.

Not verified: anything in production. Google sign-in, real emails, real uploads, the new rate limits and the cached-page refresh could not be tested locally. The plan ends with a checklist for those.

## Final review (20 November 2026, end of day)

After the seven phases, the Create section rebuild (story editor, updates, milestones) and the placement changes.

| Area | Start | Now |
|---|---|---|
| Security | 6.5 | 8.5 |
| Bugs | 6.5 | 8.5 |
| Input fields | 6.0 | 8.5 |
| UI | 7.5 | 8.5 |
| UX and user flow | 7.0 | 8.5 |
| Architecture | 6.0 | 7.0 |
| **Overall** | **6.7** | **8.4** |

Checked at the end: 1,739 tests pass in 187 files; type check and lint have no errors; the production build succeeds; changed files hold no keys or passwords; no database migration is needed.

Verdict: ready to deploy, on the condition that the production checklist in the fix plan is run straight after. What only production can show: Google sign-in, real emails, real uploads, the rate limits, cached pages refreshing, and the admin Approve button.

## What was tested

- All 26 founder pages opened on desktop; 6 key pages at phone width (375 px).
- All 54 founder API routes read; 33 called signed out, 19 called signed in against records that are not mine.
- About 25 bad-input requests (profile, updates, milestones, team, support, settings, notifications).
- Sign-in, sign-out and deactivate through the API.
- Browser console: no errors on any page.

## What held up

- **Other founders' data is protected.** All 19 attempts to read or change a startup, tool, story, support ticket, team member or milestone that isn't mine were refused.
- **Cross-site requests are blocked.** A request with no origin or a foreign origin got 403.
- **Signed-out visitors can't open any page.** All six pages tried redirected to sign-in.
- **Story text is cleaned on display.** A script tag, an `onerror` image and a `javascript:` link in an update were all removed on the public page.
- **Listing forms are checked on the server** (lengths, web addresses, years, amounts) and saved through one access check.
- Two-step sign-in has attempt lockout; changing email and deleting the account ask for the password.

## Security gaps

### High

**S1. Signing out does not end the session.** After calling sign-out, the old cookie still opened founder data (tested: 200 before, 200 after). A copied or stolen cookie keeps working for up to 7 days. Related, from reading the code:
- The founder sign-out route clears one of the three sign-in cookies.
- There is no "sign out everywhere".
- One of the three sign-in paths skips the "sessions ended after password change" check.

### Medium

**S2. Startup updates go public instantly with weak checks.** Tested:
- A 600 KB update was accepted. There is no size limit on create.
- The content field accepts any shape of data, not only text.
- The cover image accepts any text, including `javascript:alert(1)`, which is placed on the public page as the image address.
- Nobody reviews an update before it is public.

**S3. A deleted update can stay public for up to an hour** (code read). The public story page is cached for 60 minutes in production and delete did not refresh it. The same applied to edits. Correction, 20 Nov: my local test was not valid evidence. The local server does not cache pages and answers 200 even for a "Story Not Found" page, so the "still loaded" result was that page. The gap is real from the code, but it was not observed.

**S4. Sign-in reveals whether an email is registered** (code read, not tested). Different messages for "sign in with Google", "suspended", "deactivated" and "N attempts remaining" tell an outsider which emails have accounts.

**S5. Google sign-in gaps** (code read, not tested):
- The value Google sends back is not checked against the one sent, so a sign-in can be started by another site.
- A password account that signs in with Google once is marked as a Google account. After that, "forgot password" silently sends nothing.

**S6. Missing limits.** No rate limit on reset password, email verification, DNS checks for startups and tools, URL changes, settings and notifications. The email verification link never expires. Reset links are stored as plain text in the database.

**S7. Google-only accounts can be deleted with no confirmation** (code read). With no password on file, the password check passes automatically.

### Low

- **S8.** Six routes answer a signed-out request with a server error (500) instead of "please sign in" (401): notifications, settings, support list, support ticket, data export, change email. No data leaks.
- **S9.** Server errors on bad input: a story whose startup has no owner, `notifications?limit=abc`, a milestone with an invalid date.
- **S10.** Profile accepts a `javascript:` or any outside address as the photo, a name of only spaces, HTML in the name, and any text as a phone number.
- **S11.** A development-only "verify any email" route is still in the code. It is blocked in production, but should be deleted.
- **S12.** Changing a startup URL does not check other startups' old URLs or reserved words, so an old link could be taken over.
- **S13.** Milestones accept a date in the year 2999 and a negative amount.
- **S14.** Uploads trust the file type the browser declares (code read, not tested).

## Bugs

- **B1. Deactivate account never works for password accounts.** With the correct password the answer is "Incorrect password" (tested). The route reads the request twice, and the second read is empty.
- **B2. A signed-in founder opening their own public startup page is sent to a "what brings you here?" onboarding screen.** Tested with the seeded account; worth checking with a real founder account in production.
- **B3. A startup update appears publicly as "Founder Story" by "Founder Content"**, not as an update from the startup or the founder.
- **B4. Funding round type "Angle"** should be "Angel".
- **B5. Sign-in did not move on after success** in my automated run (the API answered success, the page stayed on sign-in). Seen once; I could not tell whether it was the test tool, so it needs a manual check.

## UX, UI and user flow gaps

- **U1. Page titles.** 14 of 18 screens show the generic site title in the browser tab. Only Hiring, Events and Activity log have their own.
- **U2. "Verify your company email" banner on every page**, even though the startup already shows "Verified". On a phone it takes about a fifth of the screen. Two different "Verified" badges are not explained.
- **U3. Fields without labels for screen readers:** startup form 14, tool form 6, new update 3, new milestone 3, profile 2, settings 1.
- **U4. Weak form errors.** The startup form relies on the browser's own "Please fill in this field" bubble, one field at a time, with no messages next to the fields.
- **U5. The startup form is one long page** of 29 fields with no section jump links and no autosave.
- **U6. Limits differ between form and server.** Tagline shows 60 on the form; the server allows 500.
- **U7. Unknown address inside the portal** shows a bare "404" with no menu and no way back.
- **U8. Signed-out redirect forgets the page you wanted.**
- **U9. Security settings live in two places:** Profile → Security and Settings → Security.
- **U10. Content is not in the side menu.** It is reachable only through Create.
- **U11. Phone layout:** the startup edit page scrolls sideways; the company email box in Settings is cut off; the dashboard shows two Create buttons.
- **U12. Wording is inconsistent:** "Submit Tool" and "List your tool"; "Invite Member" and "Invite a teammate"; stage names like "PRE SERIES_A".

## Architecture and code

- **A1. Three account records and three cookies per person** (founder, site user, unified). The sign-in check has three paths with different rules. This is the root of S1, S5 and B2.
- **A2. No shared route guard.** Each of the 54 routes checks sign-in its own way, which is why six return the wrong status. The employer portal now uses one guard; the founder portal should too.
- **A3. Mixed styles.** Raw SQL and Prisma side by side; schema validation in 4 of 54 routes, hand-written checks elsewhere.
- **A4. Repeated work per page.** The layout and each page look up the session separately, and the layout runs several queries one after another.
- **A5. Dead code.** Unused query-building lines in settings, ads routes behind an off switch, the dev verify route.
- **A6. Very large components.** Startup form 1,140 lines, tool form 842, security settings 501.
- **A7. Tests.** 61 test files mention founders, but nothing covers sign-out, deactivate or the content routes, which is where the bugs are.

## Not tested

- Google sign-in, two-step sign-in, password change, delete account.
- Team invites and roles end to end (the seed has no team members).
- Ownership transfer and DNS verification.
- Real email delivery, and rate limits (they are off in the test setup).
- Ads and payments (switched off).
- Production. Everything above is from the local server.
