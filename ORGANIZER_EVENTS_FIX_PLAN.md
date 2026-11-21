# Organizer portal and public event pages: fix plan

Covers every item in [ORGANIZER_EVENTS_AUDIT.md](ORGANIZER_EVENTS_AUDIT.md). Six phases, most urgent first. Each phase ends with tests and can be committed on its own. Item codes (S1, B1, U1, A1) match the audit.

## Summary

| Phase | Theme | Items | Database change | Size |
|---|---|---|---|---|
| 0 | Tests that fail today for the confirmed problems | tests only | no | Small |
| 1 | The three that matter: session, event time, hidden address | S1, B1, B3, S2 | no | Medium |
| 2 | Guards, limits and small leaks | S3, S5, S6, S8, A2, A3 | no | Medium |
| 3 | Registration trust | S4, S7, S9 | to be decided | Medium |
| 4 | Public event page | U3, U5, U6, U11 | no | Medium |
| 5 | Host portal polish | B2, U1, U2, U4, U7, U8, U9, U10 | no | Medium |
| 6 | Clean-up and release checks | A1, A4, A5 | no | Small |

Phases 0 and 1 are the ones to ship first. The rest can follow in later releases.

**Status, 21 November 2026:** All six phases are done locally. Nothing is committed or deployed.

---

## Phase 0: Safety net

**Goal:** a test that fails today for each confirmed problem.

- The site cookie still opens the host workspace after its session is deleted (S1).
- A time stored as 04:30 UTC for an India-time event shows as "4:30 AM" when the browser is in India (B1).
- The public search returns the address of an event that hides it (S2).
- A list of every organizer route, failing if a route has no sign-in check (S8).

Done when: these run and fail for the reasons above, and the existing suite still passes.

---

## Phase 1: Session, event time and hidden address

### S1. The site cookie outlives sign-out

What is wrong: the host portal accepts the site sign-in cookie by matching its email to a host. It never checks that the session behind the cookie still exists, so a copy keeps working after sign-out.

What changes:
- In `apps/web/lib/organizer-auth/index.ts`, the site-cookie path requires the session row to exist and be unexpired, the same check the founder portal now has.
- "Sign out everywhere" already ends host sessions too (added on 20 November); a test confirms the site-cookie path honours it.

### B1 and B3. Wrong time on public pages

What is wrong: the public queries return the stored time as text without a time zone ("2026-11-28 04:30:00"). The browser reads that as local time, so a visitor in India sees the UTC clock time, 5½ hours early.

What changes:
- One helper turns a stored time into a proper UTC instant. The public event page, the events list, search results, the registration deadline and the "upcoming" check all use it.
- The queries return the time with its zone marker, so nothing downstream can misread it.
- The time zone label reads "IST" or the city, and the visitor's own local time is shown beside it when it differs.
- Checked in a browser set to India time and one set to UTC.

Files: `apps/web/app/(public)/events/[slug]/page.tsx`, `EventDetailClient.tsx`, `apps/web/components/events/EventListClient.tsx`, `apps/web/lib/events/search.ts`.

### S2. Hidden venue address is public

What changes:
- The search and list queries leave out the address when the event hides it until registration. The card shows the city only.
- The event page already hides it; a test covers both.

Decision for you: is the address hidden for every in-person event, or only when the host switches that on? The plan follows whatever the event page does today.

Done when: the Phase 0 tests for S1, B1 and S2 pass, and the event page shows 10:00 AM for the seeded 10:00 AM event in both browsers.

### As built (21 November 2026)

- **S1.** The site-cookie path in `apps/web/lib/organizer-auth/index.ts` refuses a cookie whose session row is gone or expired.
- **B1, B3.** Every public event query returns times with a UTC marker. `eventInstant()` in `apps/web/lib/events/zoned-time.ts` also reads older unmarked text as UTC. Pages show the time in the event's own time zone. Not built: the visitor's own local time beside it.
- **S2.** Decision taken, since none was given: the city is public; the street address and map position are shown after registration, for every in-person event. `apps/web/lib/events/public-place.ts` removes them from search, the events list, the home page, the event page data, the search-engine block and the calendar download. If you want hosts to choose instead, that is a small change.
- **Meeting link (new, S10).** The event page removes a registration-only meeting link before anything is sent to the browser.
- **Phase 0 route list (S8)** was not written; it moves to Phase 2, where the routes change.
- Tests: `apps/web/__tests__/integration/organizer-phase1.test.ts` (10 tests).

---

## Phase 2: Guards, limits and small leaks

- **S8, A2. One guard, enforced by a test.** The route list planned for Phase 0 is written here. Routes that check the session by hand move to the role guard or the event guard. The Phase 0 route list becomes a test with only the public routes excepted.
- **S3. Limits.** Per-host limits on creating and editing events, series, widgets, team changes, profile, billing details, support messages and workspace switching. The company-email code check gets an attempt limit.
- **S5. Check-in role.** It receives the event's title, date, venue and ticket names, not the full record.
- **S6. Attendee export** answers "not found" for an event outside the workspace.
- **S7. Registration reply.** A repeat registration gets the same "you're registered, check your email" answer as a new one, and the email says "you were already registered".
- **A3.** Remove the unused old events guard, after confirming nothing imports it.

Done when: every organizer route is on a shared guard and the test proves it.

### As built (21 November 2026)

- **S8, A2.** `apps/web/__tests__/integration/organizer-route-guards.test.ts` reads every host route and fails if one has no sign-in check, or a write has no limit, outside two short lists of exceptions with reasons. Account routes keep the plain session check on purpose.
- **S3.** `hostWriteLimit()` in `apps/web/lib/organizer-auth/write-limit.ts`: 90 writes a minute per person, added to 20 routes. Left without a limit on purpose: check-in and its offline sync (the door sends bursts), payment confirmation, sign-out.
- **S5.** `apps/web/app/api/organizer/events/[eventId]/route.ts` sends view-only roles only what their screen shows.
- **S6.** The event and the registration list answer 404 for an event outside the workspace.
- **A3.** `apps/web/lib/events/auth.ts` deleted.
- **S7** moved to Phase 3.

---

## Phase 3: Registration trust

### S4. Anyone can register any email

Two ways to close it. This needs your decision before work starts.

1. **Confirm by email (stronger).** A registration from someone who isn't signed in is "pending" until they click a link in the email. Seats are held for a short time. It needs a new status and changes to counts, waitlists and reminders.
2. **Keep instant registration, limit the harm (lighter).** At most a few registrations per email per day across all events, an "I didn't register" link in the confirmation email that cancels and blocks further sign-ups for that address, and no reminders until the first email is opened or the person signs in.

My recommendation is the lighter one first: it keeps sign-up friction low, which matters for free events.

### S7. "Already registered" reply (moved from Phase 2)

A repeat registration tells a stranger the email is registered. Fixed together with S4: once the reply to a first registration no longer carries the ticket (it goes by email), a repeat can get the same reply.

### S9. Names

Names are cleaned of angle brackets when saved, so a future screen that forgets to escape them still shows nothing harmful.

### As built (21 November 2026)

Decision: the lighter protections.

- **Daily limit.** 5 guest registrations per address in 24 hours, counted in the database (`apps/web/lib/events/registration-trust.ts`). Walk-ins added by a host don't count.
- **"I didn't register".** Every confirmation, waitlist and approval email has the link. It opens `/events/not-me`, which asks first; only the button cancels. The seat goes to the next person waiting. Paid and used tickets are refused and sent to support.
- **Block.** The address can't be registered through the public forms for 90 days. Stored as a mark on the cancelled registration (`waitlistReason = "not_me"`), so no migration.
- **S7.** The event page and the website widget get the same reply for a repeat as for a first registration, and the reply no longer carries the ticket code or record id. A host adding a walk-in is still told "already registered".
- **S9.** Angle brackets are removed from names on save; the confirmation email now escapes the name, title and venue.
- **Email time.** The confirmation email uses the event's time zone.
- **Not built:** holding back reminders (the site sends none).
- Tests: `apps/web/__tests__/integration/organizer-phase3.test.ts` (14 tests).

To check in production: register with a real address, confirm the email shows the right time and the "Didn't register?" link, and press it.

---

## Phase 4: Public event page

- **U5. Sticky Register bar on phones** with the price and the button, shown until the main button scrolls into view.
- **U6. No cover image:** a slim header band in the event's category colour instead of a large empty box.
- **U3. Cookie banner:** it sits at the bottom edge and never covers the Register button or the title. This is a site-wide component, so the change is checked on other public pages too.
- **U11. Tap targets** on the event page raised to at least 44 px: share, save, report, tags, agenda and speaker links.

Done when: on a 375 px screen the title, date, time and Register are all visible without scrolling on a first visit.

### As built (21 November 2026)

- **U5.** Register bar in `EventDetailClient.tsx` (phones only), placed above the bottom menu and above the cookie banner, which reports its height in `--cookie-banner-space`.
- **U6.** No cover image: a band 64 px tall on phones, 112 px on desktop.
- **U3.** `apps/web/styles/CookieConsent.module.css`: below 1024 px a short sheet above the bottom menu with three 44 px buttons; from 1024 px a bar on the bottom edge. Shorter wording.
- **U11.** 44 px on phones for Save, Share, Report, "See more", breadcrumb links and the schedule's buttons.
- **Price.** `apps/web/lib/events/price-label.ts`; used by the event page and the events list.
- Tests: `apps/web/__tests__/unit/event-page-phase4.test.ts`.

To check after deploy: the cookie bar on the home page and one article page, in light theme, on a real phone.

---

## Phase 5: Host portal polish

- **U1. Browser-tab titles** on all 24 screens, with a test that fails when a screen has none.
- **U2, U4. One thing at a time.** The cookie banner does not show inside the signed-in portal. The welcome tour runs once per person, is remembered in their account, and each screen's tips can be reopened from Guide.
- **B2. Long names** are cut with "…" in the dashboard's latest registrations, so the page never scrolls sideways.
- **U7, U8. Labels:** the event form's 4 fields, settings' 4 fields, the attendee search box, the row checkboxes ("Select Priya Sharma") and the dashboard's 5 icon buttons.
- **U9. Not-found page** inside the portal, with the menu and a way back.
- **U10. Attendee list on phones:** 25 rows at a time with "Show more", and the row actions behind one menu button.

Done when: each screen is rechecked at 375 px and at 1024 px, and a keyboard pass reaches every control.

### As built (21 November 2026)

- **U1.** Titles on every screen under `apps/web/app/organizer`, with the site name kept by the layout's title template. Test: `apps/web/__tests__/unit/organizer-portal-phase5.test.ts`.
- **U2.** `CookieConsent.tsx` stays hidden under `/organizer`, `/founder` and `/employer` (sign-in pages excepted).
- **U4.** `GuideHost.tsx` opens only the welcome tour by itself. Still stored in the browser, not the account.
- **B2.** `min-w-0` on the dashboard's two columns.
- **U7, U8.** Labels added; the dead bell and "…" buttons removed.
- **U9.** `apps/web/app/organizer/not-found.tsx` and a catch-all route.
- **U10.** 25 rows at a time on phones. Row actions left as they are.
- **Also:** event times on the dashboard, events list and analytics page use the event's time zone.

---

## Phase 6: Clean-up and release checks

- **A1.** The host sign-in lookup runs once per request and is reused by the layout and pages.
- **A4.** Split the event form (1,498 lines) by step. No change to what hosts see.
- **A5.** Tests added in Phases 0 to 5 stay in the suite.
- **Release checks:** full tests, type check, lint and production build.
- **Check by hand in production:** an event page and the events list from a phone in India (time and address), host sign-out, a free registration end to end, a paid ticket, check-in by QR, and the website widget on an outside site.

### As built (21 November 2026)

- **A1.** `getOrganizerSession` in `apps/web/lib/organizer-auth/index.ts` is cached per request.
- **A4, partly.** `apps/web/app/organizer/events/create/`: `event-form-data.ts`, `EventFormSidebar.tsx`, `EventPreview.tsx` and `CollapsedStep.tsx` split out; `OrganizerEventForm.tsx` is 1,067 lines, down from 1,498. The five steps stay in it.
- **Release checks:** 1,783 tests, type check (web and admin), lint and the production build all pass. No migration.

### Check by hand in production, straight after deploy

1. An event page and the events list from a phone in India: the time is right and no street address shows.
2. The host dashboard: event times are right (they were in the server's clock before).
3. Sign in on the main site as a host, sign out, and confirm the events workspace asks you to sign in again.
4. Register for a free event with a real address: the email shows the right time and a "Didn't register?" link; press it and confirm the registration is cancelled.
5. Register the same address twice: the second attempt looks the same as the first, and the ticket email arrives again.
6. A paid event shows its price on the list and the event page, and a ticket can be bought.
7. Check-in by QR at the door, as a teammate with the check-in role.
8. The website widget on an outside site still registers people.
9. The cookie bar on the home page and one article, in light theme, on a real phone.
10. Save an event a few times quickly as a host: the new write limit should never get in the way of normal use.

---

## Decisions needed from you

1. **Phase 1 (open, default taken):** the city is public and the street address shows after registration, for every in-person event. Say so if hosts should choose instead.
2. **Phase 3 (answered):** the lighter protections.

## Not in this plan

- Merging the host, site-user and unified account records into one.
- Payments, payouts and plan changes, which could not be tested locally.
