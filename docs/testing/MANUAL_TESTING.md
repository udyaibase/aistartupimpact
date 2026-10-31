# Manual Testing Guide

> **Note (Oct 2026):** the Express server `apps/api` has been retired. The web and admin apps query the database directly, media URLs come from `R2_PUBLIC_URL`, and the Resend bounce/complaint webhook moved to `apps/web/app/api/webhooks/resend` (see `docs/infrastructure/RESEND.md`). Sections below that mention `apps/api`, port 4000 or `/api/v1` rewrites are historical.

> Step-by-step test plan for interns to validate the platform before releases.
> Each section produces a test report row: Pass ✅ / Fail ❌ / Partial ⚠️

---

## How to Use This Document

1. **Before testing**: Pull latest code, run `npm run dev`, verify all 3 apps start
2. **During testing**: Follow each test case step-by-step, record result in the report sheet
3. **After testing**: Submit completed report to the team lead

### Test Report Template

For each test case, record:

| # | Test Case | Steps Followed | Expected Result | Actual Result | Status | Notes/Screenshots |
|---|-----------|---------------|-----------------|---------------|--------|-------------------|
| TC-001 | Homepage loads | ... | ... | ... | ✅/❌/⚠️ | ... |

---

## Test Environment Setup

Before starting manual testing:

```bash
# 1. Pull latest code
git pull origin main

# 2. Install dependencies
npm install

# 3. Start all apps
npm run dev
```

Verify:
- [ ] Web app running at http://localhost:3000
- [ ] Admin app running at http://localhost:3001
- [ ] API running at http://localhost:4000/health

### Browser Requirements
Test on these browsers:
- Chrome (latest) — Primary
- Safari (latest) — Secondary
- Mobile Chrome (via DevTools responsive mode at 375px width)

---

## Module 1: Public Pages (No Auth Required)

### TC-001: Homepage
| Step | Action | Expected |
|------|--------|----------|
| 1 | Visit http://localhost:3000 | Page loads without errors |
| 2 | Check hero section | Dynamic stats visible (startups count, tools count) |
| 3 | Scroll to featured sections | Trending tools, recent startups load |
| 4 | Check footer | All links present, social icons visible, "Hyderabad, Telangana, India" shown |
| 5 | Click "AI Tools" in navbar | Navigates to /tools |
| 6 | Click "AI Startups" in navbar | Navigates to /startups |
| 7 | Test on mobile (375px) | Responsive layout, hamburger menu works |

### TC-002: AI Tools Directory (/tools)
| Step | Action | Expected |
|------|--------|----------|
| 1 | Visit /tools | Tool cards render with names, taglines, logos |
| 2 | Click a category pill | Results filter to that category |
| 3 | Click a subcategory | Further filters within parent category |
| 4 | Use search box | Type "chatbot" → relevant tools appear |
| 5 | Try pricing filter | Select "Free" → only free tools shown |
| 6 | Check "All Filters" button | Opens full filter panel with 12 tag groups |
| 7 | Select tags from filter | Results update with matching tools |
| 8 | Check tool card elements | Shows: name, tagline, pricing badge, 2 tag pills max, category |
| 9 | Click "Compare" on a card | Tool added to comparison bar |
| 10 | Check empty state | Search for "xyznonexistent" → shows friendly empty state |
| 11 | Test on mobile (375px) | Cards stack vertically, filters accessible |

### TC-003: Tool Detail Page (/tools/[slug])
| Step | Action | Expected |
|------|--------|----------|
| 1 | Click any tool from /tools | Detail page loads with full info |
| 2 | Check header | Tool name, tagline, logo, verified badge (if verified) |
| 3 | Check pricing section | Pricing model displayed, free trial badge (if applicable) |
| 4 | Check description | Full description renders |
| 5 | Check pros/cons | Bullet points listed |
| 6 | Check tags | Tags displayed, clickable (filter back to directory) |
| 7 | Check demo video | If demoVideoUrl exists, video embed shows (YouTube/Vimeo/Loom) |
| 8 | Check reviews section | Reviews visible with rating, title, body |
| 9 | Check alternatives | Alternative tools section shows (if configured) |
| 10 | Check "Built by" card | If linked to startup, shows startup card in sidebar |
| 11 | Check upvote button | Shows count, button present |
| 12 | Click "Visit Website" | Opens tool website in new tab |
| 13 | Test on mobile | Layout stacks, all info accessible |

### TC-004: AI Startups Directory (/startups)
| Step | Action | Expected |
|------|--------|----------|
| 1 | Visit /startups | Startup cards render |
| 2 | Use search | Type "AI" → relevant startups appear |
| 3 | Filter by category | Select sector → results filter |
| 4 | Filter by city | Select city → results filter |
| 5 | Filter by stage | Select "Seed" → only seed startups shown |
| 6 | Click a startup card | Navigates to detail page |
| 7 | Check startup detail | Name, tagline, logo, stage, location, team info visible |
| 8 | Check funding section | Funding rounds listed (if any) |
| 9 | Test on mobile | Responsive, filters usable |

### TC-005: Events Page (/events)
| Step | Action | Expected |
|------|--------|----------|
| 1 | Visit /events | Event cards render with date, location, title |
| 2 | Click an event | Detail page loads |
| 3 | Check event detail | Date, time, location, description, agenda visible |
| 4 | Check registration | Registration button/form present |
| 5 | Test on mobile | Cards stack, detail page readable |

### TC-006: Founder Stories (/stories)
| Step | Action | Expected |
|------|--------|----------|
| 1 | Visit /stories | Story cards render with title, author, date |
| 2 | Click a story | Full article loads |
| 3 | Check article | Title, author, date, cover image, body content renders |
| 4 | Check navigation | Back to stories works |

### TC-007: Funding Dashboard (/funding)
| Step | Action | Expected |
|------|--------|----------|
| 1 | Visit /funding | Funding data loads |
| 2 | Check round listings | Recent funding rounds visible |
| 3 | Check data accuracy | Amounts, dates, round types display correctly |

### TC-008: India AI Hub (/india-ai)
| Step | Action | Expected |
|------|--------|----------|
| 1 | Visit /india-ai | Hub page loads with sections |
| 2 | Check schemes section | Government schemes listed |
| 3 | Click a scheme | Detail page loads with eligibility, budget info |

### TC-009: About Page (/about)
| Step | Action | Expected |
|------|--------|----------|
| 1 | Visit /about | Page loads |
| 2 | Check "At a Glance" stats | Shows: 45K+ LinkedIn, real startup count, real tool count |
| 3 | Check "What You'll Find Here" | 6 sections including Events |
| 4 | Check founder section | Photo, "Founder & CEO", "MNIT Jaipur", full bio, focus tags |
| 5 | Check "Where We Show Up" | Shows "45,000+ members" |
| 6 | Test on mobile | All sections readable |

### TC-010: Legal Pages
| Step | Action | Expected |
|------|--------|----------|
| 1 | Visit /privacy | Loads, mentions "Hyderabad, Telangana, India" |
| 2 | Visit /terms | Loads, jurisdiction: "Hyderabad, Telangana" |
| 3 | Visit /cookie-policy | Loads, contact section has Hyderabad address |
| 4 | Visit /content-guidelines | Loads |
| 5 | Visit /copyright | Loads |
| 6 | Visit /trademark | Loads |
| 7 | Visit /verification-policy | Loads |
| 8 | Check text sizing | Not too large — consistent prose-sm/prose-base across all |

### TC-011: Contact Page (/contact)
| Step | Action | Expected |
|------|--------|----------|
| 1 | Visit /contact | Form renders |
| 2 | Check office address card | "Hyderabad, Telangana, India" shown |
| 3 | Check form fields | Name, Email, Subject, Message present |

### TC-012: Newsletter Page (/newsletter)
| Step | Action | Expected |
|------|--------|----------|
| 1 | Visit /newsletter | Subscribe form renders |
| 2 | Enter valid email | Success message appears |
| 3 | Enter invalid email | Error message appears |
| 4 | Try duplicate email | Already subscribed message |

### TC-013: Search
| Step | Action | Expected |
|------|--------|----------|
| 1 | Click search icon in navbar | Search modal/page opens |
| 2 | Type "artificial intelligence" | Results from tools + startups + articles |
| 3 | Click a result | Navigates to correct page |
| 4 | Search empty query | No error, shows prompt |

### TC-014: Navigation & Theme
| Step | Action | Expected |
|------|--------|----------|
| 1 | Click all navbar links | Each navigates correctly |
| 2 | Toggle dark mode | Theme switches, persists on page reload |
| 3 | Check bottom mobile nav | 5 tabs, active state correct |
| 4 | Check footer links | All links work (legal, explore, company, founders) |

---

## Module 2: Authentication Flows

### TC-015: Public User Signup
| Step | Action | Expected |
|------|--------|----------|
| 1 | Click "Sign Up" or navigate to signup | Signup form renders |
| 2 | Enter valid email + password + name | Account created, token set |
| 3 | Try duplicate email | "Email already exists" error |
| 4 | Try weak/empty password | Validation error shown |
| 5 | Try invalid email format | Validation error shown |

### TC-016: Public User Login
| Step | Action | Expected |
|------|--------|----------|
| 1 | Navigate to login | Login form renders |
| 2 | Enter valid credentials | Logged in, redirected |
| 3 | Enter wrong password | "Invalid credentials" error |
| 4 | Enter non-existent email | Error shown |
| 5 | Check session persists | Refresh page → still logged in |
| 6 | Logout | Cookie cleared, logged out |

### TC-017: Founder Login (Google OAuth)
| Step | Action | Expected |
|------|--------|----------|
| 1 | Visit /founder or click "Founder Login" | Redirect to Google consent |
| 2 | Sign in with Google | Redirected back to platform |
| 3 | First-time user | Onboarding flow shown |
| 4 | Returning user | Dashboard loads directly |
| 5 | Logout | Cookie cleared, redirected to login |

### TC-018: Organizer Login
| Step | Action | Expected |
|------|--------|----------|
| 1 | Visit /organizer/login | Login form renders |
| 2 | Enter valid organizer credentials | Dashboard loads |
| 3 | Enter invalid credentials | Error shown |
| 4 | Logout | Session cleared |

### TC-019: Admin Login
| Step | Action | Expected |
|------|--------|----------|
| 1 | Visit http://localhost:3001 | Redirected to /login |
| 2 | Click Google Sign In | Google OAuth flow |
| 3 | Sign in with registered admin email | Dashboard loads |
| 4 | Try non-registered email | Rejected ("Access denied") |

---

## Module 3: Community Features (Requires Public User Login)

### TC-020: Upvote Tool
| Step | Action | Expected |
|------|--------|----------|
| 1 | Login as public user | Authenticated |
| 2 | Visit any tool detail page | Upvote button visible |
| 3 | Click upvote (account > 24h old) | Count increments, button fills |
| 4 | Click upvote again | Count decrements (toggle off) |
| 5 | Try upvoting without login | Shows "Login required" message |
| 6 | Try with new account (< 24h) | Shows "Account must be 24 hours old" |

### TC-021: Tool Reviews
| Step | Action | Expected |
|------|--------|----------|
| 1 | Login as public user | Authenticated |
| 2 | Visit tool detail page | Review section visible |
| 3 | Submit review (rating + title + body) | Review saved, appears in list |
| 4 | Try submitting second review for same tool | "Already reviewed" error |
| 5 | Check review display | Shows rating stars, title, body, author |

### TC-022: Bookmark Startup
| Step | Action | Expected |
|------|--------|----------|
| 1 | Login as public user | Authenticated |
| 2 | Visit startup detail page | Bookmark button visible |
| 3 | Click bookmark | Saved confirmation |
| 4 | Click again | Unbookmarked (toggle) |

### TC-023: Newsletter Subscribe (Footer)
| Step | Action | Expected |
|------|--------|----------|
| 1 | Scroll to footer on any page | Email input visible |
| 2 | Enter valid email | Success message |
| 3 | Enter same email again | "Already subscribed" or handled gracefully |
| 4 | Enter invalid email | Error message |

---

## Module 4: Founder Portal (/founder/*)

> Requires: Founder login via Google OAuth

### TC-024: Founder Dashboard
| Step | Action | Expected |
|------|--------|----------|
| 1 | Login as founder | Dashboard loads |
| 2 | Check sidebar navigation | All links work (Dashboard, Startups, Tools, Profile, Settings) |
| 3 | Check dashboard overview | Shows owned tools/startups count |

### TC-025: Submit AI Tool
| Step | Action | Expected |
|------|--------|----------|
| 1 | Navigate to submit tool | Form renders |
| 2 | Fill all required fields | Name, tagline, description, URL, category, pricing |
| 3 | Submit | Success, tool shown in "My Tools" as PENDING |
| 4 | Try submitting without required fields | Validation errors shown |
| 5 | Check tool in "My Tools" | Shows with PENDING status |

### TC-026: Edit Owned Tool
| Step | Action | Expected |
|------|--------|----------|
| 1 | Go to My Tools | List of owned tools shown |
| 2 | Click edit on a tool | Edit form loads with existing data |
| 3 | Change tagline, save | Update succeeds |
| 4 | Verify change | Tagline updated on detail page |

### TC-027: Tool Analytics
| Step | Action | Expected |
|------|--------|----------|
| 1 | Go to tool analytics | Analytics page loads |
| 2 | Check metrics | Clicks, bookmarks, reviews, upvotes shown |
| 3 | Check daily chart | Chart renders with data points |

### TC-028: DNS Verification
| Step | Action | Expected |
|------|--------|----------|
| 1 | Go to owned tool | Verify button visible |
| 2 | Click "Verify Ownership" | Token displayed with instructions |
| 3 | Click "Check Verification" (without TXT record) | "TXT record not found" message |

### TC-029: Respond to Review
| Step | Action | Expected |
|------|--------|----------|
| 1 | Go to tool that has reviews | Reviews listed |
| 2 | Click "Respond" on a review | Response form opens |
| 3 | Submit response | Response saved, shows below review |

### TC-030: Manage Startups
| Step | Action | Expected |
|------|--------|----------|
| 1 | Go to My Startups | Owned startups listed |
| 2 | Click edit | Edit form loads |
| 3 | Update info | Changes saved |

---

## Module 5: Organizer Portal (/organizer/*)

> Requires: Organizer login

### TC-031: Create Event
| Step | Action | Expected |
|------|--------|----------|
| 1 | Login as organizer | Dashboard loads |
| 2 | Click "Create Event" | Event form renders |
| 3 | Fill required fields | Title, description, dates, location, format |
| 4 | Submit | Event created, appears in My Events |
| 5 | Try submitting without required fields | Validation errors |

### TC-032: Edit Event
| Step | Action | Expected |
|------|--------|----------|
| 1 | Go to My Events | Events listed |
| 2 | Click edit | Form loads with existing data |
| 3 | Change date/location | Update saves |

### TC-033: View Registrations
| Step | Action | Expected |
|------|--------|----------|
| 1 | Go to event with registrations | Registration list visible |
| 2 | Check attendee data | Names, emails shown |

### TC-034: Organization Profile
| Step | Action | Expected |
|------|--------|----------|
| 1 | Go to Organization | Profile form loads |
| 2 | Update company name/description | Saves correctly |

### TC-035: Promote (Locked)
| Step | Action | Expected |
|------|--------|----------|
| 1 | Click "Promote" in sidebar | Shows locked/Pro badge |
| 2 | Try to access promote feature | 403 or locked UI — no action possible |

---

## Module 6: Admin Dashboard (localhost:3001)

> Requires: Admin login (Google OAuth with registered email)

### TC-036: Admin Tool Management
| Step | Action | Expected |
|------|--------|----------|
| 1 | Navigate to Tools management | All tools listed (pending first) |
| 2 | Click "Approve" on pending tool | Status changes to APPROVED |
| 3 | Verify on public site | Tool now visible at /tools |
| 4 | Edit a tool | Form loads, changes save |
| 5 | Bulk select multiple tools | Checkbox works |
| 6 | Bulk approve | All selected approved |

### TC-037: Admin Startup Management
| Step | Action | Expected |
|------|--------|----------|
| 1 | Navigate to Startups management | All startups listed |
| 2 | Approve a startup | isApproved set to true |
| 3 | Edit startup details | Form loads, saves |
| 4 | Bulk actions | Select multiple, approve/delete works |

### TC-038: Delete Access Control
| Step | Action | Expected |
|------|--------|----------|
| 1 | Login as non-SUPER_ADMIN | Dashboard loads |
| 2 | Try to delete a tool | Permission Denied popup appears |
| 3 | Login as SUPER_ADMIN | Dashboard loads |
| 4 | Try to delete a tool | "Type DELETE to confirm" dialog |
| 5 | Type "DELETE" and confirm | Tool soft-deleted |
| 6 | Type wrong text | Button stays disabled |

### TC-039: Tag Management
| Step | Action | Expected |
|------|--------|----------|
| 1 | Go to Tools → Tags | All 12 groups, 254 tags visible |
| 2 | Create new tag | Tag added to group |
| 3 | Edit tag | Name updates |
| 4 | Delete tag | Removed (SUPER_ADMIN only) |

### TC-040: Category Management
| Step | Action | Expected |
|------|--------|----------|
| 1 | Go to Tools → Categories | Parent categories listed |
| 2 | Expand parent | Subcategories visible |
| 3 | Create new category | Added to list |
| 4 | Edit category | Name/slug updates |

### TC-041: Activity Log
| Step | Action | Expected |
|------|--------|----------|
| 1 | Go to Activity | Team activity visible |
| 2 | Check timestamps | Displayed in IST (not UTC) |
| 3 | Check actions | Shows who did what and when |

### TC-042: Newsletter Admin
| Step | Action | Expected |
|------|--------|----------|
| 1 | Go to Newsletter | Subscriber list visible |
| 2 | Check subscriber count | Matches About page stat |
| 3 | Create campaign | Form works |

---

## Module 7: SEO & Performance

### TC-043: SEO Verification
| Step | Action | Expected |
|------|--------|----------|
| 1 | View page source on /tools | `<title>` tag present and descriptive |
| 2 | Check meta description | Present, under 160 chars |
| 3 | Check canonical URL | `<link rel="canonical">` present |
| 4 | Check Open Graph tags | og:title, og:description, og:image present |
| 5 | Check structured data | JSON-LD script tags in page source |
| 6 | Visit /sitemap.xml | XML sitemap renders with URLs |
| 7 | Visit /robots.txt | Proper allow/disallow rules |
| 8 | Check tool detail OG image | Dynamic OG image URL present |

### TC-044: Performance (Basic)
| Step | Action | Expected |
|------|--------|----------|
| 1 | Open Chrome DevTools → Network | Check homepage load time |
| 2 | Run Lighthouse audit | Performance score ≥ 80 |
| 3 | Check for large images | No image > 300KB on listing pages |
| 4 | Check for layout shift | No visible content jumping (CLS) |
| 5 | Test on slow 3G (DevTools throttle) | Page still usable within 5s |

---

## Module 8: Security (Basic Checks)

### TC-045: Auth Protection
| Step | Action | Expected |
|------|--------|----------|
| 1 | Visit /founder/dashboard without login | Redirected to login |
| 2 | Visit /organizer/events without login | Redirected to login |
| 3 | Visit admin (3001) without login | Redirected to /login |
| 4 | Call POST /api/tools/xxx/upvote without cookie | 401 response |
| 5 | Call POST /api/founder/tools without cookie | 401 response |

### TC-046: Input Validation
| Step | Action | Expected |
|------|--------|----------|
| 1 | Submit tool with empty name | Validation error |
| 2 | Submit tool with invalid URL | Validation error |
| 3 | Submit review with empty body | Validation error |
| 4 | Try newsletter with "not-an-email" | 400 error |
| 5 | Try XSS in search: `<script>alert(1)</script>` | Script NOT executed, escaped |

### TC-047: Rate Limiting
| Step | Action | Expected |
|------|--------|----------|
| 1 | Upvote 21 tools rapidly (same day) | 21st returns 429 "Daily limit reached" |
| 2 | Try subscribing newsletter 6 times (same IP) | 6th returns rate limit error |

---

## Module 9: Responsive Design

### TC-048: Mobile (375px width)
| Step | Action | Expected |
|------|--------|----------|
| 1 | Homepage | Hero readable, stats visible, no horizontal scroll |
| 2 | /tools | Cards stack, filters accessible via button |
| 3 | Tool detail | All info visible, scrollable |
| 4 | /startups | Cards stack, search works |
| 5 | /events | Event cards stack |
| 6 | /about | All sections readable |
| 7 | Navigation | Bottom nav visible, hamburger menu works |
| 8 | Forms | Inputs full-width, buttons tappable |
| 9 | Footer | Links visible, not cramped |

### TC-049: Tablet (768px width)
| Step | Action | Expected |
|------|--------|----------|
| 1 | Homepage | 2-column grid where appropriate |
| 2 | /tools | Cards in grid, sidebar filters (if applicable) |
| 3 | Navigation | Full navbar visible (no hamburger) |

### TC-050: Desktop (1440px width)
| Step | Action | Expected |
|------|--------|----------|
| 1 | Homepage | Full-width hero, multi-column sections |
| 2 | /tools | Grid cards, full filter panel |
| 3 | Tool detail | Sidebar layout |
| 4 | Max-width constraint | Content doesn't stretch beyond max-w-7xl |

---

## Module 10: Dark Mode

### TC-051: Dark Mode Functionality
| Step | Action | Expected |
|------|--------|----------|
| 1 | Toggle dark mode button | Theme switches immediately |
| 2 | Refresh page | Dark mode persists (localStorage) |
| 3 | Check text contrast | All text readable against dark background |
| 4 | Check cards | Border/shadow visible in dark mode |
| 5 | Check images/logos | Not lost against dark background |
| 6 | Check forms | Input fields have visible borders in dark |
| 7 | Check footer | Links visible, brand colors maintained |

---

## Test Report Template (Copy and Fill)

```
# Manual Test Report

**Tester Name**: _______________
**Date**: _______________
**Branch/Version**: _______________
**Browser**: _______________
**Device/Viewport**: _______________

## Summary
- Total Test Cases: 51
- Passed: ___
- Failed: ___
- Partial: ___
- Blocked: ___

## Failed/Partial Test Cases

| TC# | Description | Expected | Actual | Screenshot |
|-----|-------------|----------|--------|------------|
| | | | | |

## Critical Issues Found

| # | Issue | Severity | Steps to Reproduce |
|---|-------|----------|-------------------|
| | | P1/P2/P3/P4 | |

## Environment Issues

| Issue | Impact |
|-------|--------|
| | |

## Notes & Observations

_______________________________________________
```

---

## Severity Definitions

| Severity | Definition | Example |
|----------|-----------|---------|
| **P1 — Critical** | Feature completely broken, blocks users | Login fails, homepage 500 |
| **P2 — Major** | Feature partially broken, no workaround | Search returns no results, upvote doesn't save |
| **P3 — Minor** | Feature has issue but workaround exists | Styling glitch, wrong count display |
| **P4 — Cosmetic** | Visual issue, no functional impact | Alignment off, typo, color inconsistency |

---

## Testing Schedule

| Round | Timing | Focus |
|-------|--------|-------|
| **Pre-Release** | Before every production deploy | Module 1-6 (all critical flows) |
| **Weekly Regression** | Every Friday | Module 1, 2, 3 (public + auth + community) |
| **Monthly Full** | First Monday of month | All 10 modules |
| **Post-Deploy Smoke** | After every production deploy | TC-001, TC-002, TC-015, TC-020 (4 critical checks) |

---

## Tips for Interns

1. **Always take screenshots** of failures — annotate what's wrong
2. **Note the exact URL** where the issue occurs
3. **Record the steps exactly** — someone else needs to reproduce it
4. **Check both themes** (light + dark) for visual issues
5. **Test on mobile first** — most bugs hide on small screens
6. **Clear cache** between testing sessions (Cmd+Shift+R)
7. **Don't skip "expected" results** — verify every assertion
8. **Report ALL issues**, even if you think they're minor
9. **If something feels wrong**, it probably is — document it
10. **Ask if blocked** — don't waste time on environment issues
