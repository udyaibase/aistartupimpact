# Organizer portal review: security, implementation and gaps

Date: 2026-11-17 · Branch: `feat/hiring-onboarding` · Scope: organizer portal only

## Fix status (updated 2026-11-17, second round)

All findings below are fixed. Type check is clean and the web test suite passes (143 files, 1,277 tests). Sign-up, email confirmation, sign-in, check-in, the devices list, event editing, completed/postponed public pages, delete and restore, attendee paging and the activity log were tested in a browser against the dev database. Not tested in a browser: Google sign-in, 2FA, payouts, team roles with a second account, account deletion.

**Before deploying**

- Apply three migrations in order: `20261117100000_organizer_email_lowercase`, `20261117120000_organizer_account_safety` and `20261117140000_organizer_ownership_transfer` (all applied to the dev database). The first adds a unique index on `lower(email)` and skips it with a notice if two accounts differ only by case; those pairs need resolving by hand. The second adds the grace-period, account-binding, devices, venue-map and hidden-question columns, binds existing team memberships to their accounts, moves map links out of `address`, and clears the unused teammate password copies.
- Behaviour changes hosts will notice: sign-up no longer signs the person in; unconfirmed accounts must confirm at their next sign-in; deleting an account now waits 14 days; Staff can no longer export attendee lists; a restored event comes back as a draft with its registrations cancelled.

| Item | Status | What changed |
|---|---|---|
| C1 | Fixed | Emails normalised; unverified accounts get no session; team membership is bound to the account that accepted the invite (`memberOrganizerId`), with email matching only for memberships accepted before this change. |
| H1, H2 | Fixed | Google state and `email_verified` checked; 2FA on Google, reset and reactivation; one password-change path; reset tokens hashed. |
| H3 | Fixed | Payouts: owner only, confirmed with the password, or an emailed code for Google-only owners; owner emailed on every change. |
| H4 | Fixed | Deactivate/delete blocked while events are live or payouts pending; deletion has a 14-day grace period (sign in and reactivate to cancel; the daily data-retention job finishes it). |
| H5, H6 | Fixed | CSV neutralised and capped; name check-in returns a pick list. |
| M1 | Fixed | One session resolver; sign-out ends every session kind; signed-in devices list with sign-out per device and "sign out all other devices". Sessions are database-backed and last 7 days, so no separate idle timeout was added. |
| M2 | Fixed | Sign-up answers the same whether or not the email is taken (the owner gets an email instead). Wrong passwords pause sign-in for that account from that network only; the account-wide lock needs 20 failures. |
| M3 | Fixed | Verification tokens stored hashed (older links still work until they expire after 24 hours); reset tokens hashed. |
| M4 | Fixed | Email change re-checks uniqueness, moves memberships and 2FA, ends sessions, notifies the old address, and renames the linked unified identity (or unlinks it when it also serves a founder profile). Main-site `WebUser` accounts are separate accounts and are deliberately left alone. |
| M5, M6 | Fixed | Event, profile and onboarding input validated. |
| M7 | Fixed | New `registrations.export` permission (Owner, Admin, Manager; not Staff); event-limited teammates can't create or change series or workspace-wide widgets and only see series their events belong to. |
| M8 | Fixed | Check-in and undo (including offline sync), widgets, series, sponsors, speaker-application decisions and settings, restores and devices signed out are now in the activity log. |
| M9 | Fixed | Daily upload allowance of 200 images per workspace on top of the burst limit. |
| M10 | Fixed | Walk-in capacity check and insert are one statement that locks the event row. |
| Low | Fixed | Unused teammate password copies cleared; a Zoom/Google meeting id is only accepted with a server-issued proof that this workspace created it (or when it's unchanged). CSRF still relies on the Origin check and correct site URLs per environment. |
| Gaps 1–13 | Fixed | Attendees screen pages through the server (search, status filter, counts); completed, postponed and cancelled events stay public (cancelled ones are not indexed); deleted events can be restored for 30 days; renamed speakers keep their id; custom questions are updated in place and removed ones with answers are hidden, not deleted; venue map link has its own column and is sent in registration emails; teammates can leave a team; verification resend and security emails done earlier. |
| Gap 10 (ownership transfer) | Fixed | Team page → Transfer ownership (owner only, confirmed with password or emailed code) sends an active Admin a 7-day link. On accept, in one transaction, the Admin takes over the workspace's sign-in, the old owner gets an account of their own and stays as an Admin, payout bank details and the company-email badge are cleared, and both are emailed. Waits while paid ticket money is held; the Admin's own account must be empty (it is replaced). See `lib/organizer-auth/ownership-transfer.ts`. Tested end to end on the dev database. |
| Gap 14 | Configuration | Meeting integrations need the Zoom and Google keys set in production. |

## How this review was done

- Read every route under `apps/web/app/api/organizer` (74 routes), the auth libraries (`lib/organizer-auth`, `lib/unified-auth`, `lib/auth/set-password.ts`), `middleware.ts`, the portal layout and the server gates on portal pages.
- Findings come from reading code. Nothing was exploited or run against a live system, so each finding should be reproduced before it is treated as confirmed.
- Not read in depth: the client page components (about 7,000 lines), the internals of `lib/events/*` (tickets, promote, payouts, follow-ups), the public embed endpoints and the admin app. Items marked "needs check" depend on code outside what was read.

Paths below are relative to `apps/web/` unless they start with `packages/`.

## Summary

| Severity | Count | Theme |
|---|---|---|
| Critical | 1 | Unverified sign-ups are trusted as the owner of the email they typed |
| High | 6 | 2FA bypasses, old password surviving a reset, payout control, account deletion, CSV injection, wrong-person check-in |
| Medium | 10 | Session handling, enumeration, input validation, role gaps, missing logs and limits |
| Low | 6 | Smaller hardening items |
| Feature gaps | 14 | Missing or half-finished behaviour |

The first thing to fix is C1. It is the root cause behind several other items.

---

## Critical

### C1. An unverified sign-up is treated as the real owner of that email

Three facts combine:

1. Sign-up creates a full session before the email is verified ([signup/route.ts:67-85](../apps/web/app/api/organizer/auth/signup/route.ts)). No portal code checks `emailVerified` afterwards; the session check only rejects `SUSPENDED` and deactivated accounts ([organizer-auth/index.ts:77](../apps/web/lib/organizer-auth/index.ts)).
2. Sign-up and sign-in use the email exactly as typed. There is no lowercasing and no case-insensitive unique index on `EventOrganizer.email`, so `bob@x.com` and `Bob@x.com` are two accounts.
3. Team membership is matched by the session email, case-insensitively ([organizer-auth/workspace.ts:31-32](../apps/web/lib/organizer-auth/workspace.ts)).

Result: if `bob@x.com` is an active Admin on a host's team, anyone can sign up as `Bob@x.com` with their own password, never verify, and immediately work in that host's workspace with Bob's role. Admin includes team management, billing and payouts.

The same root cause has other effects:

- **Startup impersonation and review bypass.** "Hosted by <startup>" is allowed when the session email matches a founder or team email ([events/trust.ts:35-36](../apps/web/lib/events/trust.ts)), and a tagged event publishes without review ([events/trust.ts:64](../apps/web/lib/events/trust.ts)). An unverified sign-up with a founder's email gets both.
- **Pre-registration hijack.** An attacker signs up with a victim's email and a password. When the victim later uses Google sign-in, the accounts merge and the attacker's password stays valid ([google/callback/route.ts:61-73](../apps/web/app/api/organizer/auth/google/callback/route.ts)). The same happens when the victim accepts a team invite: "existing account keeps its password" ([team/accept/route.ts:69-71](../apps/web/app/api/organizer/team/accept/route.ts)).
- **Platform-branded email to anyone.** An unverified account can send walk-in confirmations, team invites and widget instructions to arbitrary addresses.

Fix:

- Normalise email (trim and lowercase) at sign-up, sign-in, reset and Google callback. Backfill existing rows and add a unique index on `lower(email)`.
- Do not give unverified accounts a working session, or restrict them to a "verify your email" screen.
- Require `emailVerified` in `teamMemberships()` and in `canTagStartup()`.
- Bind a team membership to the organizer id at accept time instead of matching by email on every request.
- When Google sign-in or an invite meets an existing unverified account, clear its password and sessions first.

---

## High

### H1. Google sign-in skips 2FA and has no state check

- The callback creates a session without checking `isTwoFactorOn` ([google/callback/route.ts:98-100](../apps/web/app/api/organizer/auth/google/callback/route.ts)), while password sign-in enforces it.
- `state` is the fixed string `"organizer"` ([google/route.ts:28](../apps/web/app/api/organizer/auth/google/route.ts)) and is never verified, which allows login CSRF (signing a victim into the attacker's account).
- The `email_verified` claim from Google is not checked.

Fix: random state stored in a short-lived cookie and compared in the callback; send accounts with 2FA through the same challenge step; reject tokens where `email_verified` is false.

### H2. Password reset and reactivation skip 2FA, and a reset leaves the old password working elsewhere

- Reset signs the person in directly ([reset-password/route.ts:90](../apps/web/app/api/organizer/auth/reset-password/route.ts)). So does reactivation ([reactivate/route.ts:50](../apps/web/app/api/organizer/reactivate/route.ts)), which also has no CAPTCHA and does not use the failed-attempt lockout.
- Reset updates only `EventOrganizer` ([reset-password/route.ts:75-83](../apps/web/app/api/organizer/auth/reset-password/route.ts)). It does not go through `setAccountPassword`, whose own comment says every change must. A `WebUser` or `UnifiedUser` row with the same email keeps the old password, the main sign-in still accepts it, and the `user-token` fallback then opens the organizer portal ([organizer-auth/index.ts:90-113](../apps/web/lib/organizer-auth/index.ts)).
- `setAccountPassword` matches `email = lower(address)` ([auth/set-password.ts:20](../apps/web/lib/auth/set-password.ts)). For an organizer stored with capitals, "change password" returns success and changes nothing.

Fix: route reset through `setAccountPassword`, match case-insensitively, and require the second factor before creating a session after reset or reactivation.

### H3. An Admin teammate can set or replace the payout bank account

`payouts` POST only needs the `billing` permission ([payouts/route.ts:32-34](../apps/web/app/api/organizer/payouts/route.ts)), which Admin has ([organizer-auth/permissions.ts:38-43](../apps/web/lib/organizer-auth/permissions.ts)). There is no password or 2FA step and no notice to the owner. Combined with C1 this is a path to redirecting ticket money.

Fix: owner only, with a password or 2FA step-up and an email to the owner on every change.

### H4. Account deletion and deactivation are unsafe for live events

- Delete is a hard delete with no check for upcoming events, paid tickets or pending payouts, no refunds and no attendee notice ([delete-account/route.ts:41-52](../apps/web/app/api/organizer/delete-account/route.ts)). Depending on the foreign-key rules it either fails with a 500 or removes events and registrations; this needs a test.
- For Google-only accounts (no password hash) any non-empty string passes the password check ([delete-account/route.ts:34-39](../apps/web/app/api/organizer/delete-account/route.ts), [deactivate/route.ts:39-44](../apps/web/app/api/organizer/deactivate/route.ts)).
- Deactivation silently moves published events to Draft; registered attendees are not told and paid tickets are not refunded ([deactivate/route.ts:52-59](../apps/web/app/api/organizer/deactivate/route.ts)).
- Deletion writes no activity log and sends no confirmation email.

Fix: block deletion while there are upcoming events with registrations or unpaid payouts; cancel and refund through the existing cancellation path; re-authenticate Google accounts with a fresh Google sign-in or an emailed code; add a grace period.

### H5. Attendee CSV export allows formula injection

Cells are quoted but not neutralised ([attendees/route.ts:38](../apps/web/app/api/organizer/attendees/route.ts)). An attendee who registers with a name such as `=HYPERLINK(...)` gets it executed when the host opens the file in Excel or Sheets. The export also includes registrations of deleted events (no `deletedAt` filter on the event), has no row cap and no rate limit.

Fix: prefix cells that start with `=`, `+`, `-`, `@`, tab or carriage return with `'`. Add the deleted-event filter and a limit.

### H6. Check-in by name admits the first partial match

The check-in route falls back to `guestName contains input` and checks that person in at once ([check-in/route.ts:46-50](../apps/web/app/api/organizer/check-in/route.ts)). Typing "an" checks in the first attendee whose name contains "an". This is a correctness problem at the door and it also inflates attendance, which drives certificates.

Fix: QR token and exact email check in directly; a name search returns a list and the staff member picks one.

---

## Medium

### M1. Session handling is inconsistent

- The portal layout resolves identity as unified session, then organizer cookie, then `user-token` ([organizer/layout.tsx:31-72](../apps/web/app/organizer/layout.tsx)). API routes use organizer cookie, then `user-token`, and never the unified session ([organizer-auth/index.ts:59-116](../apps/web/lib/organizer-auth/index.ts)). With cookies for two accounts the page can show one workspace while the buttons act on another; with only a unified cookie the page renders and every API call returns 401.
- The layout's `user-token` fallback does not check `deactivatedAt`.
- Sign-out removes only the organizer cookie ([auth/logout/route.ts:6-8](../apps/web/app/api/organizer/auth/logout/route.ts)); if a `user-token` cookie is present the person is still signed in.
- `sessionsValidAfter` exists on the model but is never read for organizers. `ipAddress` and `userAgent` on sessions are never filled, and there is no "signed-in devices" list.
- Sessions last 7 days with no idle timeout or rotation.

### M2. Account enumeration and lockout abuse

- Sign-in says "account suspended" before checking the password, and shows "N attempts remaining" only for real accounts ([auth/login/route.ts:55-57](../apps/web/app/api/organizer/auth/login/route.ts), [auth/login/route.ts:104-108](../apps/web/app/api/organizer/auth/login/route.ts)). Sign-up returns 409 for existing emails.
- Five wrong passwords lock any account for 15 minutes, so anyone who knows a host's email can keep them out on event day.

### M3. Reset and verification tokens

- Reset tokens and email-verification tokens share the `verifyToken` column, are stored in plain text, and a reset request overwrites a pending verification token ([auth/forgot-password/route.ts:44-49](../apps/web/app/api/organizer/auth/forgot-password/route.ts)).
- Email-verification tokens never expire, and there is no "resend verification" route.

### M4. Email change leaves identity out of step

Confirming a new email updates only `EventOrganizer` and the newsletter row ([verify-email-change/route.ts:148-162](../apps/web/app/api/verify-email-change/route.ts)). Team memberships (matched by email), `WebUser` and `UnifiedUser` keep the old address, so the person loses their team access and the old address becomes claimable by someone else (see C1). No notice goes to the old address, existing sessions are kept, and uniqueness is not re-checked at confirm time.

### M5. Event input is barely validated

In [events/route.ts](../apps/web/app/api/organizer/events/route.ts) and [events/[eventId]/route.ts](../apps/web/app/api/organizer/events/%5BeventId%5D/route.ts):

- A caller-supplied `slug` is stored as sent (line 58 of the create route); it can contain `/`, spaces or uppercase.
- `meetingLink`, `coverImageUrl`, `venueMapUrl`, speaker photo and speaker link accept any string, including `javascript:` URLs. Whether this becomes stored XSS depends on how the public page renders them: needs check.
- `category`, `format`, `visibility` and ticket `type` are passed to Prisma unchecked, so a bad value is a 500.
- `data.agenda.length`, `data.customQuestions.length` and `q.options.split` assume the right type and crash otherwise.
- No length limit on title, subtitle, venue or address; `parseInt` on capacity and quantity can produce `NaN`.

Fix: one zod schema shared by create and update, with http(s)-only URLs and own-media-only image URLs (as the profile route already does).

### M6. Onboarding accepts any avatar URL

The profile route only allows logos from the platform's own media host ([profile/route.ts:26-28](../apps/web/app/api/organizer/profile/route.ts)), but the onboarding server action stores any URL ([organizer/onboarding/actions.ts:35](../apps/web/app/organizer/onboarding/actions.ts)) and returns raw `error.message`. Website and LinkedIn links are not checked for scheme in either place.

### M7. Role gaps

- **Check-in role reads speaker proposals.** CFP list needs only `events.view` ([cfp/route.ts:10](../apps/web/app/api/organizer/events/%5BeventId%5D/cfp/route.ts)), which Check-in has, and it returns submitters' emails and the host's private notes.
- **Staff can export every attendee's phone and email** with `registrations.view`. Consider a separate export permission.
- **Manager can cancel an event** (mass refund) by setting status to `CANCELLED` ([events/[eventId]/route.ts:294-296](../apps/web/app/api/organizer/events/%5BeventId%5D/route.ts)), although delete is Admin-only.
- **Event-limited teammates** can create widgets and series, and list all series, without the per-event check.
- The events list applies the assigned-events filter to Admins ([events/route.ts:169-171](../apps/web/app/api/organizer/events/route.ts)) while `canAccessEvent` exempts them.

### M8. Actions missing from the activity log

Bulk approve, reject and cancel (including refunds, though a single refund is logged "always on record"), check-in and undo, walk-in registration, widget, series, sponsor and CFP changes, speaker decisions, and account deletion.

### M9. Missing rate limits and quotas

Upload (no per-workspace quota), walk-in (sends email), team invite (sends email), support tickets (`limit` query parameter is also unbounded), attendee export, 2FA setup.

### M10. Registration handling

- Bulk approve and waitlist promote ignore capacity; raw `err.message` is returned to the client ([registrations/bulk/route.ts:132-134](../apps/web/app/api/organizer/registrations/bulk/route.ts)).
- A host cancelling a free registration sends the attendee nothing.
- Walk-in does not normalise the email, its duplicate check is case-sensitive, and its capacity check is not atomic ([walk-in/route.ts:33-39](../apps/web/app/api/organizer/walk-in/route.ts)).

---

## Low

- Permission errors name the internal permission ("Required: team.manage").
- Widget update checks event ownership but not `deletedAt` ([widgets/[widgetId]/route.ts](../apps/web/app/api/organizer/widgets/%5BwidgetId%5D/route.ts)).
- A teammate's password hash is copied into `EventTeamMember.passwordHash` and never used.
- Accepting an invite does not check whether the existing organizer account is suspended or deactivated.
- A Manager can attach any meeting id to an event; a later time change then edits that meeting on the workspace's connected Zoom or Google account.
- CSRF protection is the Origin check in middleware plus SameSite=Lax cookies. It works, but it depends on the site URL environment variables being set correctly in every environment.

---

## Feature and implementation gaps

1. **Registrations list stops at 500** with no paging or server-side search ([registrations/route.ts:36](../apps/web/app/api/organizer/registrations/route.ts)); the data export stops at 1,000.
2. **Cancelling via status does not email free attendees**; only deleting the event does. Needs check against `lib/events/tickets.ts`.
3. **Postponed, Completed and Archived events disappear publicly**: the public page requires `PUBLISHED` ([events/[slug]/page.tsx:49](../apps/web/app/(public)/events/%5Bslug%5D/page.tsx)). A host who marks an event Completed loses the public recap page.
4. **Saving the main event form can wipe agenda data.** The event update deletes and recreates agenda items ([events/[eventId]/route.ts:215-229](../apps/web/app/api/organizer/events/%5BeventId%5D/route.ts)), dropping the recording links, slides and speaker links that the dedicated agenda route preserves. Needs check: does the form still send `agenda`?
5. **Renaming a speaker deletes and recreates them** (matched by name), losing agenda links.
6. **Custom questions are replaced on every save**, so question ids change; existing answers may be orphaned. Needs check.
7. **Venue map link is stored by appending `|||url` to the address** on create and is not handled on update ([events/route.ts:126-137](../apps/web/app/api/organizer/events/route.ts)).
8. **No way to resend a verification email**, and nothing nudges or limits unverified accounts.
9. **No security notifications** for new sign-in, 2FA turned off, email change or payout change.
10. **No ownership transfer**, and a teammate cannot leave a team themselves.
11. **No device or session list**, and no "sign out everywhere".
12. **Deleted events cannot be restored**, although deletion is a soft delete.
13. **Check-in has no audit trail** of who admitted whom.
14. **Meeting integrations show "coming soon"** when the provider keys are not configured ([MeetingIntegrations.tsx:76](../apps/web/components/organizer/MeetingIntegrations.tsx)).

---

## What is done well

- Every event-scoped route checks both workspace ownership and the teammate's assigned events.
- Team membership and role are re-read on each request, so removing someone takes effect at once; role changes are limited to roles below the actor's own.
- Payments activate only after signature, capture and amount are all confirmed; prices are computed on the server.
- Uploads check type, size and magic bytes, and derive the extension from the checked type.
- Server-side fetches (widget verify, certificate images) validate every redirect hop or allow only the platform's media host.
- Event descriptions are sanitised; no `dangerouslySetInnerHTML` in the portal.
- Sign-in, sign-up and reset have CAPTCHA and rate limits; passwords use bcrypt cost 12; 2FA has per-account attempt limits.
- Invite tokens and password hashes are stripped from team API responses.

---

## Suggested order of work

1. C1: email normalisation, verified-only sessions, membership bound to account id.
2. H2 and H1: one password-change path; 2FA and state on Google, reset and reactivate.
3. H3 and H4: owner-only payouts with step-up; safe deletion and deactivation.
4. H5 and H6: CSV neutralising; check-in name search returns a list.
5. M1 and M4: one session resolver for pages and APIs; email change synced across tables.
6. M5 to M10, then the feature gaps.
