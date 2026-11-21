# Organizer portal and public event pages: audit

Date: 21 November 2026. Tested on the local dev server and dev database with the seeded host "Bengaluru AI Collective" (owner, manager, staff and check-in teammates) and a second, unrelated host. Nothing was changed in the code. The four test registrations I created were removed.

The fix plan is in [ORGANIZER_EVENTS_FIX_PLAN.md](ORGANIZER_EVENTS_FIX_PLAN.md).

## Verdict

**Overall: 7.6 / 10.** This is the strongest of the three portals on security: another host's data, team roles, sign-in and public forms all held up. The problems are one session gap, a wrong event time for visitors in India, a hidden venue address that is not hidden, and a lot of UI polish.

| Area | Rating | One-line reason |
|---|---|---|
| Security | 8.0 | Workspace and role checks held in every test; one cookie outlives sign-out |
| Bugs | 6.5 | Public pages show the wrong start time to visitors in India |
| Input fields | 8.5 | Registration, phone, export and email content are all handled well |
| UI | 7.0 | Clean, but generic tab titles, unlabelled fields and overlays stacking |
| UX and user flow | 7.0 | Good create flow and dashboard; no sticky Register on phones; tours restart |
| Architecture | 7.5 | Sessions stored in the database, clear role table; three guard styles, no guard test |

**Fix before relying on it in production:** S1, B1 and S2 below.

## Status after Phases 0 and 1 (21 November 2026)

Done on the local machine; not committed or deployed.

| Item | Status | How it was checked |
|---|---|---|
| S1. Site cookie outlives sign-out | Fixed | Live: the copied cookie opened the host's events before sign-out (200) and was refused after (401) |
| B1, B3. Wrong time on public pages | Fixed | Live in a browser set to India time: event page "10:00 AM – 7:00 PM", events list "10:00 AM". Other device time zones are covered by tests, not by a second browser |
| S2. Hidden venue address is public | Fixed | Live: search returns 0 of 7 events with an address or map position; the event page source has no street address; the calendar download says "NIMHANS Convention Centre, Bengaluru" |
| S10. Meeting link in the page source (new, below) | Not fully fixed here; fixed on 21 November in the after-event test | The seeded webinar passed, but events hosts create still exposed the link |

Also fixed while there: the home page event cards and the "Closes" date use the event's time zone, and the "Today" filter means today in India, not today in UTC.

Checks: 1,749 tests pass in 188 files (10 new); type check and lint have no errors. No database change.

Not rechecked live: the attendee export with the copied cookie (it uses the same sign-in check as the events list, which was refused). Nothing was tested in production.

Estimated rating after these two phases: Security 8.0 → 8.8, Bugs 6.5 → 8.0, overall 7.6 → 8.1.

## Status after Phase 2 (21 November 2026)

Done on the local machine; not committed or deployed.

| Item | Status | Notes |
|---|---|---|
| S3. Writes without a limit | Fixed | 25 write actions in 20 routes now share a limit of 90 a minute per person. Not exercised live: limits are off in the local test setup |
| S5. Check-in role reads the whole event | Fixed | Live: the owner gets 64 fields, the check-in teammate 19, with no meeting link or settings. Staff get the same short record plus attendees |
| S6. Outside event answers | Fixed | Live: a second host gets "not found" (404) for the event and for its registration list |
| S8, A2. No guard test | Fixed | A test now fails if a host route has no sign-in check or a write has no limit |
| A3. Old events guard | Removed | Nothing used it |
| S7. "Already registered" reply | Moved to Phase 3 | See below |

Three corrections to what this audit said:
- **A2.** The "session only" routes are not a gap. They are the person's own account (profile, password, two-step sign-in, support, workspace switch), where a workspace role does not apply. All 67 non-public routes already had a sign-in check; what was missing was a test.
- **S3.** The company-email code check already allowed only 3 wrong tries per code and 5 codes an hour.
- **S6.** There is no per-event attendee export; the export always covers the signed-in workspace. The empty answer came from the registration list, which now says "not found".

S7 was not done here: a real registration answers with the ticket, so a repeat cannot be given an identical answer without changing what a first registration returns. That belongs with the registration changes in Phase 3.

Checks: 1,755 tests pass in 189 files; type check and lint have no errors. No database change.

Estimated rating now: Security 8.8 → 9.0, Architecture 7.5 → 8.0, overall 8.1 → 8.3.

## Status after Phase 3 (21 November 2026)

Done on the local machine; not committed or deployed. You chose the lighter protections over confirm-by-email.

| Item | Status | How it was checked |
|---|---|---|
| S4. Anyone can register any email | Reduced, not removed | See the three parts below |
| – "I didn't register" link in every registration email | Built | Live: opening the page changed nothing; pressing the button cancelled the registration; a second press and a forged link were handled |
| – Address blocked for 90 days after that | Built | Live: the same address was then refused on another event |
| – At most 5 guest registrations per address per day | Built | Tests only: the local data has only 5 free open events, so a sixth could not be tried |
| S7. "Already registered" reply | Fixed | Live: a repeat registration got the same answer as a first one. The ticket is re-sent to the address, at most twice a day |
| S9. HTML in names | Fixed | Angle brackets are removed when a name is saved. Tests only |

Three more problems found and fixed while there:
- **The ticket code was sent back to whoever filled in the form.** Anyone registering someone else's address received that person's check-in code in the reply. The forms never used it; it now goes to the email address only.
- **The confirmation email showed the wrong time.** It printed the server's clock (UTC), so a 10:00 AM India event read 4:30 AM. This is B1 again, in the email. Not checked with a real email.
- **The confirmation email did not escape the name or the event title.** My audit said names "are escaped in emails"; that was true for the other emails, not this one.

Not built: "no reminders until the first email is opened". The site sends no event reminders, so there was nothing to hold back.

Still true after this phase: a stranger can register someone's address once, and that person gets one email. They can now undo it in two clicks. Pressing "I didn't register" cancels that one registration, not others made for the same address the same day.

Noticed, not changed: the check-in QR picture in the email is drawn by an outside service (api.qrserver.com), which therefore sees each ticket code.

Checks: 1,769 tests pass in 190 files (14 new); type check and lint have no errors. No database migration: the "not me" mark reuses an existing column.

Estimated rating now: Security 9.0, overall 8.3 → 8.5.

## Status after Phase 4 (21 November 2026)

Done on the local machine; not committed or deployed. Checked in the browser at 375 px and 1024 px, dark theme.

| Item | Status | What changed |
|---|---|---|
| U5. No sticky Register on phones | Fixed | A bar with the price and the button stays at the bottom until the main button is on screen. It hides while the form is open |
| U6. Empty cover box | Fixed | An event with no cover image gets a slim band. On a phone the title moved up from 561 px to 318 px |
| U3. Cookie banner covers the title and Register | Fixed on phones, improved on desktop | Phones: a short sheet above the bottom menu, with the Register bar above it. Desktop: a bar along the bottom edge, about 70 px tall, not a card in the corner |
| U11. Small tap targets | Fixed | Save, Share, Report, "See more", breadcrumb and schedule buttons are 44 px on phones. One inline text link remains at 18 px |

On a first visit at 375 px the title, date, time and Register are all on the first screen.

One more problem found and fixed:
- **Paid events were labelled "Free".** The event page said "Free" and "Register Now — Free" for every event, and the events list showed a "Free" tag on a ₹499 summit. Both now show the real price ("₹499", "From ₹499", "Free or from ₹299"). Events listed from other sites show no price.

Limits of the check:
- On desktop the cookie bar still covers whatever is at the very bottom of the screen until the visitor scrolls or answers. At 1024 × 768 that included the Register button.
- Light theme and a real phone were not checked. The banner's fade-in did not play in my test browser, so I judged its final look from the styles.
- The banner change is site-wide; I looked at it on the event page only.

Checks: 1,775 tests pass in 191 files (6 new); type check and lint have no errors. No database change.

Estimated rating now: UI 7.0 → 8.0, UX 7.0 → 8.0, Bugs 8.0 → 8.5, overall 8.5 → 8.7.

## Status after Phase 5 (21 November 2026)

Done on the local machine; not committed or deployed. Checked in the browser signed in as the seeded host, at 1024 px and 375 px.

| Item | Status | What changed |
|---|---|---|
| U1. Browser-tab titles | Fixed | All 28 host screens name their tab ("Attendees \| Udyaibase"); a test fails when a new screen has none |
| U2. Overlays stack | Fixed | The cookie banner no longer shows inside the host, founder and employer workspaces |
| U4. Tours restart on each screen | Fixed, with one difference from the plan | Only the welcome tour opens by itself. Other screens' tips open from Guide |
| B2. Sideways scroll from long names | Fixed | The dashboard columns can shrink, so a long name is cut with "…" |
| U7. Fields without labels | Fixed | Event form 4, settings 4, attendee search and all row checkboxes: none left unlabelled on the three screens |
| U8. Icon buttons without names | Fixed | See below |
| U9. Bare 404 in the portal | Fixed | A wrong address shows "We can't find that page" with the menu and two ways back |
| U10. Attendee list on phones | Partly, by choice | 25 people at a time with "Show 25 more" |

Differences from the plan:
- **Tour "remembered in their account" is not built.** It is still remembered in the browser, so the welcome tour shows once per browser, not once per person. Remembering it in the account needs a new database field.
- **Row actions were not moved behind a menu button.** Each attendee has one or two actions ("Cancel registration", or "Approve" and "Decline"); a menu would add a tap for no gain.

Two more problems found and fixed:
- **The dashboard showed event times in the server's clock, labelled "IST".** In production that is UTC, so a 10:00 AM event would read "4:30 AM IST". My audit said the dashboard time was right; it only looked right because this machine's clock is India time. The dashboard, the events list and the analytics page now use the event's time zone.
- **Buttons that did nothing.** The bell in the header had no action and always showed an "unread" dot; it is removed. The two "…" buttons on dashboard rows did nothing either; they are now a plain arrow, since the whole row is the link.

Not checked: a keyboard pass of every control, light theme, and screens other than the dashboard, create event, settings, attendees and the not-found page.

Checks: 1,783 tests pass in 192 files (8 new); type check and lint have no errors. No database change.

Estimated rating now: UI 8.0 → 8.5, UX 8.0 → 8.5, overall 8.7 → 8.9.

## Final review after Phase 6 (21 November 2026)

All six phases are done on the local machine. Nothing is committed or deployed.

| Area | At the audit | Now | What is still open |
|---|---|---|---|
| Security | 8.0 | 9.0 | A stranger can still register someone's address once (they can undo it); the check-in QR picture is drawn by an outside service |
| Bugs | 6.5 | 8.5 | Nothing known |
| Input fields | 8.5 | 9.0 | Nothing known |
| UI | 7.0 | 8.5 | Light theme and a real phone not checked |
| UX and user flow | 7.0 | 8.5 | The welcome tour is remembered per browser, not per account |
| Architecture | 7.5 | 8.5 | Three account records per person; the event form's five steps are still one file |
| **Overall** | **7.6** | **8.9** | |

Phase 6:
- **A1. Fixed.** The host sign-in lookup runs once per request and is shared by the layout, the page and their checks.
- **A4. Partly.** The event form went from 1,498 lines to 1,067. The lists and types, the live preview, the full preview and the step header are now their own files. The five steps themselves are still in the main file: they share about 60 pieces of form state, and splitting them is a larger change than a clean-up phase should carry. Checked in the browser: typing updates the live preview, the full preview opens and closes, and an existing event loads for editing.
- **A5.** 44 tests were added across the phases, in 5 new test files; all stay in the suite.
- While splitting the form: its live preview said "Free" for every event; it now shows the price from the tickets entered.

Release checks, all run at the end:
- 1,783 tests pass in 192 files.
- Type check: no errors in the web app or the admin app.
- Lint: 0 errors, 27 warnings (none new).
- Production build: succeeds.
- Uncommitted changes scanned for keys and passwords: none. Four made-up test values matched the pattern.
- Database: no migration needed.

Verdict: ready to deploy, on the condition that the production checklist in the fix plan is run straight after. Everything above was verified locally only.

## End-to-end host test (21 November 2026)

After the six phases I acted as a host, two teammates, eight visitors and a second host on the local server: 111 checks, all passing at the end. Test events, registrations, teammates and accounts were removed afterwards.

| Flow | Checks | Result |
|---|---|---|
| Host creates, edits and publishes events (with speaker, agenda, question) | 16 | Pass, after one fix |
| Public page, search and calendar download | 5 | Pass |
| Team: invite, accept, sign in, roles, role change | 28 | Pass |
| Visitors register: confirmed, waitlist, approval, repeat, bad input | 16 | Pass |
| Host approves, declines, cancels, raises capacity, exports | 13 | Pass, after one fix |
| Door: ticket scan, email, name search, undo, walk-in, wrong tickets | 21 | Pass |
| "I didn't register", removing a teammate, cancel, delete, restore, sign-out | 12 | Pass |

Also done through the real screens in the browser: a visitor registered with the form ("Registration Confirmed!"), and the host checked that person in on the Check-in screen ("Checked in", then "Already checked in" on a second try). The Team and Attendees screens showed the test people.

Two bugs found and fixed:
- **The server accepted an event that ends before it starts.** Only the form checked it. Create and edit now refuse it.
- **Raising an event's capacity left people on the waitlist.** Their waitlist email says a freed seat is given automatically; it was not when the host added seats. It is now.

How things work, worth knowing:
- A host who is not yet verified cannot publish: a new event waits for admin review and is not public until approved. I stood in for the admin's Approve button by changing the status directly; the admin screen itself was not tested.
- A full event refuses "move to confirmed" with the reason "the event is full. Raise the capacity first."
- The check-in role cannot add walk-ins; managers and above can. A walk-in gets a ticket and is then checked in like anyone else.
- Deleting a live event tells attendees it is cancelled. Restoring it brings it back as a draft with those registrations still cancelled, and says so.

Small things noticed, not changed:
- The Check-in screen's event list includes drafts and cancelled events.
- After a second scan of the same person, the "Recent" list on the Check-in screen shows them twice.

Not tested: real emails (invitation, ticket, cancellation), camera QR scanning, offline check-in sync, paid tickets and refunds, and the admin review screen.

Checks after the two fixes: 1,785 tests pass; type check and lint have no errors.

## After-event test (21 November 2026)

Badges, certificates, feedback, follow-up emails and the recap, tested on the local server as a Pro host, a Free host, a check-in teammate and five attendees: 72 checks, all passing at the end. Test data was removed afterwards.

| Flow | Checks | Result |
|---|---|---|
| Badges: all, three layouts, one person, checked-in only, access | 9 | Pass |
| Before the event: saving designs and messages, what is refused too early | 13 | Pass |
| Certificates: automatic at check-in, issue, no duplicates, public page, PDF, verify | 14 | Pass |
| Feedback: page, rating, change of answer, forged links, host's summary | 12 | Pass |
| Follow-up: stop-emails, who gets which message, history | 8 | Pass |
| Recap on the public page | 5 | Pass, after one fix |
| Free plan: certificates locked until bought, one follow-up only | 8 | Pass, after one fix |

Seen on the real screens: the host's "After the event" screen (5 registered, 3 checked in, 60%, rating 3.5, 2 responses), the attendee's certificate page and the feedback form.

Four bugs found and fixed:
- **Every online event's meeting link was in its public page source.** In Phase 1 I reported this as fixed. It was not: my fix only covered events with a "reveal after registration" setting switched on, and no screen lets a host switch it on. The link is now never sent to the public page.
- **Attendees of online events were never given the link.** The ticket email said "link will be shared before the event" and nothing sent it. The ticket email to confirmed attendees now carries the join link.
- **The server accepted registrations for an event that had ended.** The page hid the button; a direct request still got a ticket.
- **The certificate preview never showed on the certificate page.** The site's own security rules blocked it, so every visitor saw "Your browser can't show the PDF here". The page now frames the PDF and the PDF allows it. My test browser cannot display PDFs, so I confirmed the rules no longer block it but did not see it drawn; check it in Chrome.

Also fixed, from the earlier run: the Check-in screen lists only published and completed events, and its "Recent" list shows each person once.

Two small things noticed in that run, fixed afterwards:
- The host's feedback box now says "Recommendation score" with a line explaining it runs from −100 to +100. It used to say "Would recommend", so a score of 0 read as if nobody would.
- When a host adds or changes the join link, everyone with a seat gets an email with the new link. Checked live in the local email log: the ticket email carried the first link and the right time (10:00 am), one update email carried the new link, and saving again with the same link sent nothing.

Still open: a link that changes because a connected Zoom or Google meeting is moved automatically does not send this email; only a link the host saves does.

Not tested: whether emails are delivered and how they look, automatic follow-up two hours after the event (it runs on a timer), paying for certificates (I recorded the purchase directly), signature upload, and badges on a real printer.

Checks after the fixes: 1,788 tests pass; type check and lint have no errors.

## Certificates: more designs and details (21 November 2026)

Added at your request, done locally, not committed.

- **Six designs, up from three.** New: Executive (navy page, gold frame and seal), Heritage (cream page, burgundy and gold border, ribbon seal) and Tech (dark header band with a teal line).
- **More on the certificate.** The host can choose the wording ("participated in", "attended", "successfully completed", "spoke at", "volunteered at"), add a duration ("6 hours"), one sentence about the event, and up to six "Topics covered".
- **Where the host chooses:** After the event → Certificates. The form shows all six designs and the new fields; "Preview PDF" shows the result before saving.
- **Public pages:** the attendee's certificate page and the verification page show the sentence, duration and topics too.

Tested through the host's form in the browser: chose Heritage, set the wording, duration, sentence and five topics, saved, and downloaded the attendee's certificate; then switched to Executive and Tech and downloaded again. Each download matched the chosen design.

Worth knowing: a certificate is drawn from the event's current design each time it is opened. If a host changes the design after issuing, certificates already issued change too.

One problem met on the way: the form crashed for a design saved before the new fields existed. Fixed, and covered by a test.

**Live preview (added after).** The certificate form now shows the certificate as the host designs it, redrawn on every keystroke and design change, with an example name. It is a close likeness drawn in the browser from the same layout and colours as the PDF; "Preview PDF" still opens the real file. Checked in the browser: the title, wording, topics, duration, signer and design each changed in the preview as they were edited, before anything was saved. The QR code in the preview is a stand-in, and fonts can differ slightly from the PDF's.

No database change: the new settings live in the event's existing certificate settings. Checks: 1,800 tests pass; type check and lint have no errors.

## Certificates: brand logo and the host's own design (21 November 2026)

You chose SVG as the format for pasted designs. Done locally, not committed.

**Brand logo (all six built-in designs)**
- A logo just for certificates, separate from the profile picture, and an optional partner logo beside it.
- Position (top centre, top left, top right) and size (small, medium, large).
- A switch to print the organization's name as well as the logo.
- Logos must be files uploaded here. A logo address on another website is dropped when the host saves.

**The host's own design**
- A seventh choice, "Your own", opens a box for SVG code, with a "Copy prompt for Claude or ChatGPT" button that gives the exact instructions.
- The design uses markers such as `{{name}}`, `{{event}}`, `{{date}}`, `{{topics}}`; twelve in all, listed in the form. Each is filled in per attendee, and every value is escaped.
- The form lists what is wrong as the host pastes: things to fix (not SVG, no `{{name}}`, no viewBox) and things that will be removed (scripts, embedded pages, animations, links to other sites).
- The live preview shows the pasted design at once, with example values.
- The QR code, certificate ID and verify address are always drawn by Udyaibase on a white plate, where the design marks `<rect id="qr">` or bottom right. A design cannot leave them out.

**How pasted code is made safe**
- It is cleaned against an allow-list when saved and again when drawn: only shapes, paths, gradients and text survive.
- Nothing is loaded from elsewhere: no outside pictures, fonts, styles or files. Entity tricks (a DOCTYPE) and over-size designs are refused whole.
- The preview shows the code as a picture, where a browser runs no scripts.

Tested through the host's form: pasted a design containing a script, an `onload` handler and a picture from another site. The form warned about each, the preview showed the design, the saved copy contained none of them, and the attendee's downloaded certificate used the design. A design without `{{name}}` was refused with the reason. A name containing markup printed as plain text.

Not done, from the plan:
- **Uploading a finished image as the design** (stage B1), with fields placed on it.
- **A reusable template library and freezing issued certificates** (stage B4). Both need a database migration. Today a pasted design is stored with the event, and changing it changes certificates already issued.

Not verified:
- **Fonts in production.** A pasted design is drawn by the server using the fonts installed there. Locally it looks right. Production servers may have fewer fonts, so text could fall back to a plainer face. Check one certificate in production before offering this to hosts.
- **A real logo upload.** Uploads go to the same storage as production, so I did not upload test files. Placement was checked with stand-in images.
- **Long names in an own design.** Built-in designs shrink a long name to fit; a pasted design prints it at the size the design sets.

Checks: 1,821 tests pass (21 new); type check and lint have no errors. No database change.

## What was tested

- 24 organizer pages and 4 public event pages opened; 8 probed in depth, 4 at phone width.
- 97 API routes read for their checks (78 organizer, 14 public events, 5 widget).
- 51 requests signed out; 20 as a second host against the first host's data; 23 as staff, check-in and manager roles.
- 11 registration attempts with bad input, and 14 other public requests.
- Sign-in, sign-out, Google sign-in start, and the site cookie after sign-out.

## What held up

- **Signed out:** all 51 requests were refused (401).
- **Another host's data:** all 20 attempts were refused or returned nothing: event, attendees, badges, agenda, sponsors, certificates, refunds, check-in, walk-ins.
- **Team roles:** staff, check-in and manager were refused everything their role doesn't allow (creating and deleting events, team changes, exports, payouts, billing).
- **Host sign-out ends the session.** A copied host cookie returned 401 after sign-out.
- **Sign-in gives nothing away:** an unknown email and a wrong password get the same answer.
- **Google sign-in is tied to the browser** with a cookie, and a forged answer was refused.
- **Registration:** captcha required, bad email and bad phone refused, draft and finished events refused, a second registration with the same email refused.
- **Attendee export is safe to open in a spreadsheet.** A name starting with `=HYPERLINK(` was exported with a leading quote.
- **Names are cut to 100 characters** and are escaped in emails.
- **Sponsor links** show a "you're leaving" page unless the host or sponsor is verified.
- **Ticket payment confirmation** checks the payment signature and the captured amount.

## Security gaps

### High

**S1. The site sign-in cookie still opens the host workspace after sign-out.** I signed in on the main site as the host, copied the cookie, signed out, and the copy still returned the host's events and the attendee export (over 300 people). The host portal accepts the site cookie without checking that its session still exists. This is the same gap fixed for the founder portal on 20 November; the host portal reads that cookie through its own code.

### Medium

**S2. A hidden venue address is public.** The event page says "Register to See Address", but the public search returns the venue name and address ("NIMHANS Convention Centre, Hosur Road, Bengaluru") to anyone, and the events list shows it on the card.

**S3. Writes without a limit.** Creating and editing events, series, widgets, team changes, profile, billing details, support messages and workspace switching have no rate limit. The company-email code check has no limit of its own either (code read; the shared code helper may count attempts).

**S4. Anyone can register any email address.** There is no "confirm your email" step, so a person can be signed up for events, and sent emails, without asking. Captcha and a rate limit slow this down but don't prevent it.

**S10. A meeting link meant for registered people was in the public page source** (found during Phase 1, fixed). For an online event set to show its link only after registration, the link was hidden on screen but sent to every visitor inside the page data and the search-engine block.

### Low

- **S5.** The check-in role can read the whole event record (meeting link, certificate and follow-up settings), not only what the door needs.
- **S6.** The attendee export for another host's event returns an empty file with 200, not "not found".
- **S7.** "You are already registered for this event" tells a stranger that an email is registered for that event.
- **S8.** Routes are guarded in three different ways (role check, event check, session only), and no test fails when a new route forgets its check.
- **S9.** HTML typed into a name is stored as typed. It is escaped wherever I saw it shown, so this is a risk only if a new screen forgets to escape.

## Bugs

- **B1. Public pages show the wrong time to visitors in India.** An event stored as 10:00 AM India time shows as "4:30 AM – 1:30 PM (Kolkata)" on the event page and "4:30 AM" on the events list. The page reads the stored time without its time zone, so the browser treats it as local time. A visitor whose device is set to UTC sees it correctly. The host dashboard shows the right time. Worth confirming on the live site before anything else.
- **B2. The host dashboard scrolls sideways at laptop width (1024 px)** when a registrant has a long unbroken name.
- **B3. The same reading of times applies to the registration deadline and "is this event upcoming"** (code read), so a deadline can close 5½ hours off.

## UX, UI and user flow gaps

- **U1. Browser-tab titles.** 21 of 24 host screens show the generic site title. Only Plans & billing, Website widget and Activity log have their own.
- **U2. Overlays stack on a first visit.** The welcome tour, the cookie banner and the "verify your company email" banner all appear together. On a phone they cover most of the screen.
- **U3. The cookie banner covers the Register button** on the public event page (desktop) and the event title (phone).
- **U4. Tours restart on each screen** ("Step 1 of 4" appeared again on Attendees after the dashboard tour).
- **U5. No sticky Register button on phones.** On the event page it sits about 1,000 px down, below an empty cover area and the host block.
- **U6. An event with no cover image shows a large empty box** with a calendar icon: about a third of the first screen on desktop and half on a phone.
- **U7. Fields without labels for screen readers:** event form 4, settings 4, and the attendee list's search box and 100 row checkboxes.
- **U8. Five icon buttons on the dashboard have no name** for screen readers.
- **U9. A wrong address inside the portal** shows a bare "404" with no menu and no way back.
- **U10. The attendee list draws 100 rows at once** on a phone, each with its own buttons.
- **U11. 47 tap targets under 32 px** on the public event page at phone width.

## Architecture and code

- **A1. Three account records and three cookies** per person, as in the founder portal. S1 comes from this.
- **A2. No shared guard test.** 48 of 78 routes use the role or event guard; the rest check the session by hand.
- **A3. An old events guard** (`lib/events/auth.ts`, built on a different sign-in system) looks unused.
- **A4. Large files:** event form 1,498 lines, widget customiser 721, dashboard page 600, settings page 544.
- **A5. Tests:** 46 test files touch organizers or events, 7 of them organizer integration tests. Nothing covers the site-cookie path or how public pages show time.

## Not tested

- Paid tickets, refunds, payouts and plan purchase (payments are off locally).
- Real email delivery, check-in by QR scan with a camera, offline check-in sync.
- Calendar and meeting integrations (Google, Zoom), the website widget on an outside site.
- Certificates, badges layout, follow-up emails and feedback forms beyond their access checks.
- Rate limits (off in the local test setup) and anything in production.

## Correction to the founder audit

In the founder portal documents I wrote that the events-workspace Google sign-in "has no state check". That was wrong: I had not looked. It has one, and a forged answer was refused in this audit.
