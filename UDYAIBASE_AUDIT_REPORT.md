# UdyaiBase: Technical and Product Audit

Date: 13 November 2026 · Branch audited: `feat/hiring-onboarding` at `9d6eb3d`

**How to read this report.** Every finding cites a file and line. "Verified" means I read the code or ran it. "Unverified" means I could not confirm it from the repository and say what is needed. Nothing was changed in the codebase; this file is the only addition.

**Coverage.** The repo is about 198,000 lines of TypeScript in 1,716 tracked files. I read in full: both middlewares, every auth and session module, every payment, billing, invoice and webhook module, the plan definitions, the cron entry points, the cache layer, the Prisma client setup, the schema (analysed by script for foreign keys and indexes) and the scoring algorithms. I inventoried all 288 web API routes and 52 admin API routes for their auth guards by script, then read the high-risk ones line by line. I did **not** read every UI component or every admin page, and I did not drive the app in a browser, so section 5 (user flows) is based on code, not on clicking through. Section 7 lists what remains unchecked.

---

## 1. Executive summary

### Is it ready for public launch?

**Conditional: not yet.** The payment and plan-enforcement code is better than most seed-stage products. The blockers are elsewhere: secrets that fail open, no separation between local development and the production database, admin actions with no authorization check, a migration history that cannot rebuild the database, and two paid flows (event tickets, advertising) that can take money and deliver nothing. All of the "must fix" items in section 5 are small or medium jobs. With those done, launch is reasonable.

### Health scores

| Area | Score | One-line reason |
|---|---|---|
| 1. Architecture | 6 / 10 | Sound monorepo, but five session systems joined by email matching, 14 dead tables, two ad systems |
| 2. Security | 5 / 10 | Strong basics (CSRF, rate limits, 2FA, webhook checks), undermined by fail-open secrets and unguarded admin actions |
| 3. Payments and billing | 7.5 / 10 | Idempotent, amount-checked, capture-checked; one ticket bug and an unfinished ads flow |
| 4. Pricing and plan enforcement | 8 / 10 | Limits are enforced on the server; only small races |
| 5. User flows | 6 / 10 | Code-level review only; organizer teams and workspace linking have broken steps |
| 6. Performance | 6.5 / 10 | Good caching design; a database query in middleware on every startup and tool page view |
| 7. Algorithms | 6 / 10 | AI screening is carefully built; Impact Score has a bug and is easy to game |
| 8. Code quality and operations | 5.5 / 10 | 1,100 passing tests and real monitoring; no environment separation, broken migration history |

### Top 10 issues

| # | ID | Severity | Issue |
|---|---|---|---|
| 1 | SEC-01 | Critical (if the variable is unset in Vercel) | Employer sessions are signed with an empty key when `EMPLOYER_JWT_SECRET` is missing. I ran it: signing and verifying both succeed with an empty key. The variable is absent from `.env` and `.env.production`. |
| 2 | OPS-01 | Critical | Local `.env` and `.env.production` hold the same `DATABASE_URL`, R2 bucket and Resend key. Local development runs against production data. |
| 3 | SEC-02 | High | 23 admin server actions (tool categories, collections, tags) never call the auth guard they import. |
| 4 | OPS-02 | High | 109 of 156 Prisma models have no `CREATE TABLE` in the migration history. The database cannot be rebuilt from migrations, and a trigger the ticket code depends on exists only in one SQL file. |
| 5 | PAY-01 | High | Starting a second ticket checkout with the same email overwrites the first order id. If the buyer then pays the first order, the money is captured and no ticket is issued or refunded. |
| 6 | SEC-03 | High | `/api/careers/upload-resume` accepts anonymous uploads into the public R2 bucket and returns a public URL. Candidate resumes for your own job openings are publicly readable. |
| 7 | SEC-04 | High | An organizer who is an active team member of any other organizer is always scoped to that other organizer and cannot reach their own workspace. |
| 8 | PAY-02 | High | Self-serve advertising: zones a founder pays for are never read by any public page, there is no GST invoice, and activation depends on the webhook alone. |
| 9 | SEC-05 / SEC-06 | Medium | Two open redirects (`/api/newsletter/track-click`, Google OAuth `state`) and an unauthenticated URL fetcher (`/api/og`) with a weak private-network filter. |
| 10 | SEC-07 / SEC-08 | Medium | The founder "security code" token contains the hash of its own 6-digit code, so it can be cracked offline; the startup-claim code check counts attempts non-atomically and has no rate limit on the verify step. |

### Your notes compared with the code

| Your note | What the code shows |
|---|---|
| `apps/api` Express service overlaps the web API | **Gone.** `apps/` contains only `web` and `admin`. It was deleted in commit `ab0f648`. No overlap remains. |
| About 200 API routes | 288 `route.ts` files in `apps/web/app/api`, 52 in `apps/admin/app/api`. |
| 142 tables, 70 enums | 156 models, 71 enums (`packages/database/prisma/schema.prisma`). |
| 4 JWT cookies | 5 cookies: `user-token`, `founder-token`, `employer_session`, `organizer_session`, `unified_session`. |
| Employer pricing Free / Featured ₹5,000 / Premium ₹15,000 | Now Free / Growth ₹2,499 / Pro ₹4,999 / Scale ₹9,999 a month plus GST; annual is 10 months' price. Featured and Premium survive only as legacy names (`packages/utils/employer-plans.ts:44-82`). |
| Organizer Free / Boost ₹799 / Pro ₹1,999 | Matches. Annual Pro is ₹14,990 (`packages/utils/host-plans.ts:31-50`). |
| Ads ₹2,999 / ₹5,999 / ₹9,999 | Matches, each for 365 days (`apps/web/lib/advertise.ts:7-12, 27`). |
| Ticket fee 5%, no auto-renewal | Matches. The fee is read from `TICKET_PLATFORM_FEE_PCT`, default 5 (`apps/web/lib/events/tickets.ts:22-25`). |
| Advertise webhook activates on signature alone | **Outdated.** It now checks captured status, amount and currency and claims the payment atomically (`apps/web/app/api/webhooks/razorpay-advertise/route.ts:36-62`). |
| Funding-report email is an unfinished TODO | No `TODO` or `FIXME` exists anywhere in `apps/web/app/api` or `apps/web/lib`. The paid flow sends a download link and an invoice (`apps/web/lib/funding/purchase.ts:29-31`). |
| "918 tests passing" and "no automated test suite" | Neither. I ran both suites today: **977 web tests in 101 files and 123 admin tests in 13 files, all passing (1,100 total)**. There are also 55 Playwright tests in 8 spec files, which I did not run. Every unit and integration test mocks the database. |
| Caching uses `revalidate=60` | Pages use 300, 3,600 or 86,400 seconds plus on-demand refresh (`apps/web/lib/revalidate.ts`). A comment in `app/(public)/page.tsx:11` still says 60. |
| Unused Meilisearch dependency | There is no Meilisearch package. Only the `MEILI_URL` and `MEILI_MASTER_KEY` variable names remain in `turbo.json`, `ci.yml` and the env files. |
| Duplicate job systems (`Job` and `JobBoard*`) | `Job` has zero references in code. `JobApplication` is still live: it stores applications to UdyaiBase's own careers page (`apps/web/app/api/careers/apply/route.ts`) and has an admin screen. |

---

## 2. Findings by area

### Area 1: Architecture

**ARCH-01 · High · Five session systems joined by email matching**
- Evidence: `apps/web/lib/founder-auth.ts:50-104` (three fallbacks), `apps/web/lib/organizer-auth/index.ts:62-119`, `apps/web/lib/unified-auth/index.ts:60-117`, `apps/web/lib/employer-auth.ts:78-127`, `apps/web/lib/user-session.ts:26-81`.
- What is wrong: a founder session can come from `founder-token`, from `user-token` (looked up by email), or from `unified_session`. An organizer session can come from `organizer_session` or `user-token`. Each path applies different checks: the unified fallback skips `sessionsValidAfter` (`founder-auth.ts:92-101`), so a password change does not sign out a session that arrived that way. Password hashing is implemented three times. `NEXTAUTH_SECRET` signs organizer sessions, unified sessions, action codes and funding links.
- Why it matters: every new feature must reason about five sessions. Most of the security findings below come from one path lacking a check that another path has.
- Fix: finish the move to `UnifiedUser`. One session cookie, one `getSession()` that returns the person plus their workspaces, one place that checks revocation. Remove the email-match fallbacks once legacy cookies have expired (7 days).
- Effort: L

**ARCH-02 · Medium · Dead tables and a second, unused ad system**
- Evidence: models with zero references outside the schema: `Job`, `UserSession`, `AdClick`, `AdImpression`, `ToolTraffic`, `FounderAnalytics`, `GlossaryTerm`, `Redirect`, `RelatedArticle`, `TalentStats`, `TeamActivityLog`, `ContentMedia`, `ArticleCoAuthor`, `IndiaAIFundingHighlight`. `EventRegistration.stripePaymentIntentId` is a leftover field. Two ad systems exist: `AdCampaign`/`AdCreative` (rendered by `apps/web/lib/db.ts:1216-1237`) and `AdvPackage`/`AdvZoneActivation` (sold to founders, never rendered; see PAY-02).
- Why it matters: 156 tables is defensible for six products in one database, but about 14 are noise that slows every schema review.
- Fix: drop the dead models in one migration after confirming row counts are zero. Choose one ad system.
- Effort: M

**ARCH-03 · Medium · Two database clients and 1,183 `any` usages**
- Evidence: `apps/web/lib/db.ts` (1,736 lines of raw SQL through the Neon HTTP driver) alongside Prisma over a WebSocket pool (`packages/database/index.ts:18-31`). A count of `: any` and `as any` in non-test code under `apps/web` and `apps/admin` returns 1,183.
- What is wrong: raw SQL results are untyped, so a renamed column fails at runtime, not at build. `strict` is on, but `any` switches it off where it matters most.
- Fix: do not rewrite. Add typed row interfaces to the 20 most used query functions, and add new queries with Prisma or typed SQL.
- Effort: M, ongoing

**ARCH-04 · Medium · Missing foreign keys and indexes**
- Evidence (script over the schema): 61 id-like columns have no relation. Most are legitimate (Razorpay ids, polymorphic `entityId`). The ones that should be real foreign keys: `EventRegistration.userId`, `OrganizerPayment.eventId`, `WorkspaceLinkRequest.userId`, `JobBoardApplication.widgetId`, `JobBoardResumeUpload.listingId`, `IndiaAIFundingHighlight.startupId`. Columns that are filtered on but lead no index: `EventRegistration.ticketTierId` (counted inside the ticket lock, `apps/web/lib/events/tickets.ts:78-80`), `AiTool.startupId`, `Article.startupId`, `Article.toolId`, `AdvPayment.packageId`.
- Fix: add the indexes now (cheap); add foreign keys with `ON DELETE SET NULL` when you next touch each table.
- Effort: S

**ARCH-05 · Low · Unused and mismatched dependencies**
- Evidence: zero imports of `msw` and `@react-email/render` in `apps/web`; zero imports of `react-hook-form` and `@hookform/resolvers` in `apps/admin`. Root `package.json` depends on `@prisma/driver-adapter-utils ^7.10.0` while Prisma is 5.22. `eslint-config-next` is 15.5.25 while `next` is 16.4.3. `next-auth` is in `apps/web` only to back a stub (`apps/web/lib/auth.ts`). `@types/*` packages sit in `dependencies`.
- Fix: remove them; align the ESLint config version with Next.
- Effort: S

**ARCH-06 · Low · Duplicated logic**
- Evidence: Impact Score exists in `apps/web/lib/impact-score.ts` and `apps/admin/lib/impact-score.ts`. Four upload routes with different validation: `api/upload`, `api/media/upload`, `api/organizer/upload`, `api/careers/upload-resume`.
- Fix: move shared logic into `packages/utils`; keep one upload helper that sniffs file bytes.
- Effort: S

**Caching.** The design is correct: stale-while-revalidate with a lock, TTL jitter, fall-through when Redis is down (`apps/web/lib/cache.ts:60-117`), and on-demand page refresh after edits. One risk: preview and local builds share the production Redis with a different key prefix (`cache.ts:35-37`), so rate-limit counters and quotas are shared across environments.

**Scale: where it breaks first.**
1. At about 10x: the middleware query on every `/startups/:slug` and `/tools/:slug` view (PERF-01), and the per-pageview analytics writes (PERF-03).
2. At about 10x: the single daily cron that does 20 unrelated jobs with `take: 500` batches (OPS-05).
3. At about 100x: Postgres connections, because each Vercel instance opens its own WebSocket pool (`packages/database/index.ts:25`). Whether `DATABASE_URL` is Neon's pooled endpoint is unverified.
4. At about 100x: trigram search with no trigram index (ALG-06) and the click limiter that counts rows in Postgres (`apps/web/lib/security.ts:50-70`, whose own comment says to move to Redis above 500 clicks an hour).

---

### Area 2: Security

**SEC-01 · Critical if unset in production · JWT secrets fail open**
- Evidence: `apps/web/lib/employer-auth.ts:5-7` builds the key with `new TextEncoder().encode(process.env.EMPLOYER_JWT_SECRET!)`. The same pattern is in `founder-auth.ts:8-14`, `user-session.ts:5-7`, `organizer-auth/index.ts:6-11`, `unified-auth/index.ts:6` and `middleware.ts:8-14`. `EMPLOYER_JWT_SECRET` appears in `.env.example` but in neither `.env` nor `.env.production`, and not in `turbo.json`.
- Verified by running it: with the variable undefined the key is zero bytes, `SignJWT(...).sign()` succeeds, and `jwtVerify` accepts the token (jose 4.15 on Node 24).
- Why it matters: if the variable is missing in Vercel, anyone can forge an `employer_session` cookie for any workspace id and read every candidate's name, email, phone and resume. There is no startup check, so nothing would tell you.
- Unverified: whether the variable is set in the Vercel project. Check today.
- Fix: validate required secrets once at startup and refuse to run without them.
```ts
// apps/web/lib/env.ts, imported from instrumentation.ts
const required = ['EMPLOYER_JWT_SECRET', 'FOUNDER_JWT_SECRET', 'USER_JWT_SECRET', 'NEXTAUTH_SECRET'] as const;
for (const k of required) {
  if ((process.env[k] ?? '').length < 32) throw new Error(`${k} is missing or shorter than 32 characters`);
}
```
- Also remove the hard-coded fallback `'founder-team-otp-fallback'` (`apps/web/lib/action-otp.ts:3`).
- Effort: S

**SEC-02 · High · Admin server actions with no authorization**
- Evidence: `apps/admin/app/(dashboard)/tools-dir/categories/actions.ts` imports `requireActionAuth` (line 5) and never calls it: all 8 exported actions, including `deleteParentCategoryAction` (215-230). Same in `tools-dir/collections/actions.ts` (7 actions, for example `deleteCollectionAction` 54-63). `tools-dir/tags/actions.ts` calls it in 1 of 9 actions; `deleteTagAction` (238-250) is unguarded.
- What is wrong: a server action is a public POST endpoint. Any signed-in staff account of any role, including one that has not yet completed 2FA, can call these. The admin middleware matcher excludes `/login` (`apps/admin/middleware.ts:32-36`), and Next.js runs a server action on whatever page it is posted to, so these may be callable with no session at all. I did not test that path: treat it as unverified but plausible.
- Business impact: deleting the tool category tree or the tag system breaks the tools directory for every visitor.
- Fix: first line of every exported action:
```ts
const { error } = await requireActionAuth();
if (error) return { success: false, error };
```
  Add a test that imports every `actions.ts` file and fails if an exported function does not call a guard.
- Related, Medium: about 20 files call `getServerSession` directly and skip `twoFactorBlock` (for example `app/(dashboard)/articles/actions.ts:31-35`, `app/api/admin/people/export/route.ts`). The review actions check for a role named `ADMIN`, which is not in the `UserRole` enum (`tool-reviews/actions.ts:17`, schema line 2056), so only SUPER_ADMIN can moderate reviews.
- Effort: S

**SEC-03 · High · Anonymous uploads to the public bucket; resumes publicly readable**
- Evidence: `apps/web/app/api/careers/upload-resume/route.ts:18-67`. No session, no CAPTCHA, a limit of 100 requests a minute per IP, a type check on the browser-supplied MIME type only (line 33), written to `R2_BUCKET_NAME` (line 52) and returned as a public URL (lines 59-60).
- Why it matters: resumes sent to your own job openings are personal data in a public bucket. Under the DPDP Act that is a failure of reasonable security safeguards. Anyone can also host arbitrary files on `media.udyaibase.com`.
- Fix: reuse what the job board already does correctly: the private bucket, byte sniffing and 5-minute signed links (`apps/web/lib/jobs/resume-storage.ts`, `resume-text.ts:13-24`). Move the existing objects under `resumes/` out of the public bucket.
- Effort: S

**SEC-04 · High · Organizer team scoping takes over the member's own workspace**
- Evidence: `apps/web/lib/organizer-auth/require-permission.ts:29-66`. `findFirst` looks for an active team membership on any organizer other than the user's own. If one exists, the session is scoped to that organizer for every request.
- What is wrong: an organizer who accepts an invitation to help another host can no longer manage their own events through any route that uses `requirePermission`. With two memberships, which one is chosen is undefined because there is no ordering. The email comparison is case-sensitive.
- Fix: make the active workspace explicit, as the employer portal already does (`apps/web/app/api/employer/workspaces/switch/route.ts`). Store the chosen organizer id in the session and verify membership on each request.
- Effort: M

**SEC-05 · Medium · Open redirects**
- Evidence: `apps/web/app/api/newsletter/track-click/route.ts:66-69` redirects to the `url` query parameter with no allow-list and no signature, including on the error path. The same route lets anyone insert click rows for any email and inflate campaign statistics (lines 38-63). `apps/web/app/api/auth/google/callback/route.ts:18, 92` redirects to the OAuth `state` value; an absolute URL in `state` sends the user off-site after sign-in. That callback also never checks that `state` was issued by you (login CSRF) and does not check Google's `verified_email` field.
- Why it matters: phishing links that begin with `udyaibase.com`.
- Fix: sign newsletter links (`HMAC(campaignId|email|url)`) and reject unsigned ones. For OAuth, set a random `state` cookie, compare it on return, and accept only paths that start with a single `/`.
- Effort: S

**SEC-06 · Medium · `/api/og` is an unauthenticated URL fetcher with a weak filter**
- Evidence: `apps/web/app/api/og/route.ts:6-36`. No session, no rate limit, and a filter that inspects only the hostname text. A hostname that resolves to a private address, a decimal IP or an IPv6-mapped address passes. The response body is read with no size limit.
- Context: a correct helper already exists and is not used here: `fetchPublicHtml` and `isSafePublicUrl` (`apps/web/lib/embed/safe-fetch.ts`, `packages/utils/safe-url.ts`) resolve DNS and re-check every redirect hop.
- Fix: require a founder session, add `strictRateLimit`, and call `fetchPublicHtml`.
- Effort: S

**SEC-07 · Medium · The founder action code can be cracked offline**
- Evidence: `apps/web/lib/action-otp.ts:6-15` places `sha256(code)` inside the token, and `apps/web/app/api/founder/team/otp/route.ts:41` returns that token to the browser. The code has 900,000 possible values; hashing all of them takes under a second. The token is also not bound to the user or the action and can be replayed for 10 minutes.
- Why it matters: the emailed code is meant to stop someone with a stolen founder session from changing team roles. It does not.
- Fix: store the code server-side in `EmailOtp`, bound to the founder id and the action, as `lib/otp.ts` does. Alternatively put `HMAC(secret, code)` in the token, not a plain hash.
- Effort: S

**SEC-08 · Medium · Startup-claim code: non-atomic attempt counter, no rate limit on verify**
- Evidence: `apps/web/lib/startups/domain-otp.ts:62-83` reads `attempts`, then increments in a separate statement. `apps/web/app/api/founder/startups/[id]/verify-email/route.ts:64-67` applies no rate limit to the verify step (only `send` is limited, line 57). The same read-then-write pattern is in `apps/web/lib/otp.ts:86-97`.
- What is wrong: parallel requests all read `attempts = 0` and all get a guess. The email's local part is not checked for existence, so an attacker can request fresh codes for random addresses on the company's domain and race each one. Success makes the attacker the verified owner of that startup and, through `openFounderWorkspace`, an Owner of its hiring workspace (`apps/web/lib/employer/founder-workspace.ts:44-54`).
- Fix:
```sql
UPDATE "EmailOtp" SET attempts = attempts + 1
WHERE id = $1 AND attempts < 3 RETURNING code;
-- no row returned means locked: stop
```
  Add `authRateLimit` to the verify step, keyed on founder id and startup id.
- Effort: S

**SEC-09 · Medium · Any employee with a company email becomes the startup's owner**
- Evidence: `verify-email/route.ts:45-69` followed by `markStartupVerified(..., session.userId)` (`apps/web/lib/startups/ownership.ts:18-37`).
- What is wrong: a code sent to any mailbox on the company's domain proves "works there", not "is the founder". The first employee to do it owns the profile, and a verified owner is granted Owner access to the hiring workspace and its candidates.
- Trade-off: this is a deliberate low-friction choice and common in the industry. The risk is real for larger companies.
- Fix: keep it, but treat email-verified owners as provisional for sensitive rights: email the workspace's existing owners and wait 48 hours before granting hiring-workspace ownership, and let a DNS-verified claimant displace an email-verified one.
- Effort: M

**SEC-10 · Medium · Session revocation is not applied everywhere**
- Evidence: routes that call `jwtVerify` on `user-token` directly and skip the `WebUserSession` check that `getUserSession` performs (`user-session.ts:54-61`): `api/user/profile/route.ts`, `api/user/profile/password/route.ts:17-25`, `api/user/interactions`, `api/user/recommendations`, `api/user/sessions`, `api/jobs/[slug]/save`. The password route also has no rate limit on wrong current-password guesses and a weaker password rule (8 characters) than signup.
- Why it matters: "sign out of other devices" does not stop a stolen token from changing the password for up to 7 days.
- Fix: replace the hand-rolled checks with `getUserSession()`; reuse the signup password rule.
- Effort: S

**SEC-11 · Medium · Privacy and DPDP Act gaps**
- Bundled consent: `apps/web/app/api/careers/apply/route.ts:39-41` refuses an application unless the applicant agrees to the newsletter. `apps/web/app/api/funding-data/checkout/route.ts:55` requires a consent that subscribes the buyer to marketing (`lib/funding/access.ts:60-72`). Consent to marketing must be free and separate from the service.
- Unsalted IP hashes: `apps/web/lib/security.ts:37-39` and `api/newsletter/track-click/route.ts:6-8` store the first 16 hex characters of `sha256(ip)`. All IPv4 addresses can be hashed in minutes, so this is still personal data. `IP_HASH_SALT` already exists and is not used in these two places.
- Session replay: `sentry.client.config.ts:13-19` enables Sentry Replay for every visitor with no consent check. (It is currently blocked by your own CSP; see OPS-03.)
- What is done well: candidate retention periods are defined and enforced (`apps/web/lib/employer/lifecycle.ts:12-17, 94-96`), candidates can withdraw or delete from their status link (`api/applications/[token]/route.ts`), every account type has export and delete routes, and resumes on the job board use a private bucket with signed links.
- Fix: make the newsletter box optional in both flows; use an HMAC with `IP_HASH_SALT`; start Replay only after analytics consent.
- Effort: S

**SEC-12 · Low · CSRF and CSP details**
- CSRF: the Origin/Referer check in `apps/web/middleware.ts:86-119` is sound. Gaps: `new URL(referer)` (line 103) throws on a malformed header and returns a 500; `GET /api/employer/auth/founder` changes state (creates a workspace and a session).
- CSP: `script-src 'unsafe-inline'` (`apps/web/next.config.mjs:39`) removes most of the protection CSP gives against XSS. Moving to nonces is the standard fix and is a medium job in Next.js.
- Uploads: `apps/web/app/api/upload/route.ts:39, 72` uses the client-supplied `type` field as the storage key prefix and trusts the client MIME type.
- Effort: S each, M for CSP nonces

**Checked and found sound.** Razorpay and Resend webhook signatures with constant-time comparison and a 5-minute replay window for Resend (`lib/billing/razorpay.ts:28-44`, `lib/email/resend-webhook.ts:8-29`). Internal admin-to-web calls fail closed without a secret (`lib/internal-auth.ts`). Rate limiting fails closed in production when Redis is down (`lib/rate-limit.ts:95-117`). Client IP handling resists spoofed headers (`lib/client-ip.ts`). The DNS claim token is unique per founder (`lib/startups/claim.ts`). DOCX parsing has a zip-bomb guard (`lib/jobs/resume-text.ts:19, 40`). The `sql.unsafe` call in `api/track/route.ts:84` uses a fixed whitelist. Integration tests cover IDOR for all four portals, CSRF, cookie flags, SQL injection and open redirects. I found no committed secrets: `.env` files are git-ignored and CI runs gitleaks, Semgrep and CodeQL.

---

### Area 3: Payments and billing

Flows traced end to end: employer plan, organizer Pro and Boost, event ticket, funding data. Advertising was traced up to the point where it stops (PAY-02).

**What is right in all four working flows.** The price is computed on the server. Each order has a database row before the buyer can pay, so a webhook cannot arrive before the row exists. The checkout callback verifies the signature and then reads the payment back from Razorpay to confirm order id, amount, currency and captured status (`lib/billing/razorpay.ts:54-68`). The webhook checks the same things against the stored total (`api/webhooks/razorpay-billing/route.ts:45-54`). Activation flips `PENDING → SUCCESS` with a conditional update inside a transaction, so a duplicate webhook or a callback-plus-webhook pair activates once (`lib/employer/billing.ts:52-88`). A failed card followed by a successful retry on the same order still activates. If Razorpay is down, checkout returns a 502 and nothing is activated.

**PAY-01 · High · A second ticket checkout orphans the first order**
- Evidence: `apps/web/lib/events/tickets.ts:70-91`. When a registration already exists for the email and is in `PENDING_PAYMENT`, the row is reused and `razorpayOrderId` is set to `null` (line 87), then replaced with a new order id (line 102).
- What is wrong: the buyer opens checkout (order A), retries or opens a second tab (order B), then pays in the first window. The webhook looks up order A, finds nothing and returns `unknown` (`razorpay-billing/route.ts:48-49`); the callback returns 404 (`api/events/tickets/verify/route.ts:16-17`). The payment is captured, and there is no ticket, no refund and no alert. The email is not verified at checkout, so a third party can also trigger this for someone else's pending purchase.
- Business impact: paid attendees turned away at the door, chargebacks, manual refunds.
- Fix: if a hold is still valid, return the existing order; otherwise keep a history of order ids.
```ts
if (existing?.status === 'PENDING_PAYMENT' && existing.razorpayOrderId
    && existing.paymentExpiresAt! > now && existing.ticketTierId === tier.id) {
  return existingOrderResponse(existing);   // same order, same hold
}
```
  Also alert (`opsAlert`) whenever a captured payment arrives for an unknown order, for every product.
- Effort: S

**PAY-02 · High · Self-serve advertising takes payment but is not finished**
- Evidence:
  - No public page reads `AdvZoneActivation`. The only readers and writers are `api/founder/advertise/zones/activate`, `zones/extend`, the webhook, `lib/advertise.ts` and the admin actions. The homepage renders the other system (`AdCreative`, `apps/web/lib/db.ts:1216-1237`).
  - No checkout callback exists for advertising, so activation depends on the webhook alone (`api/founder/advertise/route.ts:69-124`).
  - `InvoiceTable` is `'employer' | 'organizer' | 'funding'` (`lib/billing/invoice.ts:27`): 18% GST is charged on ad purchases (`lib/advertise.ts:175-178`) and no tax invoice is issued.
  - `POST /api/founder/advertise` has no rate limit and creates a Razorpay order plus an `AdvPackage` row with status `CANCELLED` on every call (lines 80-99).
  - `handlePackageUpgrade` (`webhooks/razorpay-advertise/route.ts:131-160`) is three writes with no transaction; a failure after the first write releases the claim, and the retry creates a second package.
  - Nothing prevents two founders from activating the same zone for the same days.
- Unverified: whether placements are meant to be fulfilled by hand from the admin panel.
- Fix: either hide the purchase buttons until the flow is complete, or finish it: render active zones, add a verify callback that reuses `ensureCaptured`, add `'advertise'` to the invoice module, wrap the upgrade in a transaction, and rate-limit order creation.
- Effort: M to L

**PAY-03 · Medium · Refund edge cases**
- Evidence: `apps/web/lib/events/tickets.ts:226-257`.
- What is wrong: (a) there is no atomic claim before calling Razorpay, so two clicks send two refund requests (Razorpay rejects the second; the code path is unprotected). (b) The host's share is held until two days after the event (`tickets.ts:100`). A refund after that needs the host's linked account to have a balance, or `reverse_all` fails and the buyer is not refunded. (c) No `refund.processed` or `refund.failed` webhook is handled, so a `REFUNDED` status means "requested". (d) On a full refund the platform absorbs the gateway fee.
- Fix: set `REFUND_PENDING` with a conditional update first, as the sold-out path already does (`tickets.ts:153`); handle refund webhooks; state a refund cut-off in the host terms.
- Effort: M

**PAY-04 · Medium · No tax document for tickets or the platform fee**
- Evidence: the invoice module covers three tables only (`lib/billing/invoice.ts:27`). Ticket amounts carry no GST fields (`tickets.ts:27-30`).
- What is wrong: buyers receive a confirmation email and no receipt. Hosts receive no invoice for the 5% fee, which is a taxable service you supply to them.
- Unverified: the correct GST treatment (who is the supplier of the ticket, GST on the commission, TCS duties of an e-commerce operator). This needs a chartered accountant before paid tickets go live.
- Effort: M after advice

**PAY-05 · Medium · AI screening quota can be bypassed**
- Evidence: `apps/web/lib/jobs/ai-screen.ts:138-151` and `api/employer/applications/ai-screen/route.ts:28-52`.
- What is wrong: a forced re-run deletes the old billable row and creates a new one, so usage does not rise. With one screening left, a workspace can re-run 20 candidates per request, 100 requests a minute, indefinitely. The quota check and the row creation are also not atomic, so four parallel workers can each pass the check.
- Business impact: OpenAI cost with no revenue. `OPENAI_HARD_STOP` exists but is off by default (`lib/ops/ai.ts:41-46`).
- Fix: keep superseded rows (mark them, do not delete) so every completed run counts; reserve quota with a single conditional insert; set `OPENAI_HARD_STOP=true` in production.
- Effort: S

**PAY-06 · Low · Founding-member price**
- Evidence: `api/employer/billing/checkout/route.ts:40-42`. Eligibility is counted when the order is created; membership is recorded when it is paid. Concurrent checkouts can exceed the 50 places, and an unpaid founding-price order can be paid weeks later.
- Fix: re-check on activation, or accept the overshoot and say "about 50".
- Effort: S

**PAY-07 · Low · Changing plan forfeits unused time**
- Evidence: `lib/employer/billing.ts:65-67`. A different plan starts a new period immediately. A Pro customer who buys Growth mid-cycle loses the remaining Pro days with no credit.
- Fix: warn in the checkout UI, or convert remaining days to credit.
- Effort: S for the warning

**PAY-08 · Low · Invoices switch off silently**
- Evidence: `lib/billing/invoice.ts:29-43`. If any of `INVOICE_SELLER_NAME`, `INVOICE_SELLER_GSTIN`, `INVOICE_SELLER_ADDRESS` or `INVOICE_SAC` is unset, invoices are disabled while GST is still charged.
- Unverified: whether these are set in Vercel.
- Fix: include them in the startup check from SEC-01 whenever Razorpay keys are present.
- Effort: S

**Checked and found sound.** Invoice and credit-note numbers are sequential per financial year, allocated inside a transaction with the payment row locked (`invoice.ts:138, 175-181, 458-461`). CGST and SGST versus IGST is decided by place of supply (`invoice.ts:206-230`). Ticket overselling is prevented by a row lock on the event, with unexpired holds counted (`tickets.ts:68-82`). A payment that lands after its hold expired is confirmed only if a seat is free, otherwise refunded with the transfer reversed (`tickets.ts:138-173`). A Boost paid for a deleted or ended event is refunded automatically (`lib/events/billing.ts:72-90`). Plans go through reminder, 3-day grace and a move to Free that pauses extra jobs without deleting anything (`lib/employer/billing.ts:116-178`).

---

### Area 4: Pricing and plan enforcement

**Enforcement is on the server.** Verified: open-job limit at publish (`api/employer/jobs/[id]/status/route.ts:80-89`), seats (`lib/employer/team.ts:183-190`, `api/employer/team/[memberId]/route.ts:42`), AI screening allowance (`lib/jobs/ai-screen.ts:138-142`), upcoming-event limit (`lib/events/billing.ts:207-213`, called from both event routes), organizer teammates (`api/organizer/team/route.ts:62`), promotion emails (`lib/events/promote.ts:75`), registrations per event (`packages/utils/host-plans.ts:105-109`), and widget branding decided at render time (`app/embed/jobs/[widgetId]/page.tsx:28, 52`; `app/embed/[widgetId]/page.tsx:96`). Calling the API directly does not bypass these.

**PLAN-01 · Low · Count-then-act races**
- Evidence: job publish (`status/route.ts:80-84`), seats and upcoming events count rows and then write, with no lock. Two simultaneous requests can exceed a limit by one.
- Fix: acceptable at this stage. If it matters later, lock the workspace row as the ticket code does.
- Effort: S

**PLAN-02 · Low · Walk-in registration ignores the plan's registration cap**
- Evidence: `apps/web/app/api/organizer/walk-in/route.ts:33` checks the host's own capacity only, not `registrationLimit()`, and does not lock.
- Fix: use `registrationLimit(effectiveHostPlan(...), event)`.
- Effort: S

**PLAN-03 · Low · Stale plan in the employer cookie**
- Evidence: the plan is copied into the 7-day JWT (`lib/employer-auth.ts:42-50`). Enforcement reads the database, so this affects display only (`api/employer/session/route.ts:19`).
- Fix: read the plan from the database for display too.
- Effort: S

**Pricing: my opinion, not a code finding.** Everything in this paragraph is opinion from general market knowledge, not from current competitor price lists; check live prices before deciding.
- Employer plans (₹2,499 / ₹4,999 / ₹9,999 a month) sit below what established ATS products typically charge small teams, and well below per-hire platforms such as Instahyre. For an unproven job board that is the right side to err on. The Free tier (1 job, 25 AI reviews, pipeline, careers widget) is generous enough that a startup hiring one role at a time never needs to pay. The real upgrade trigger is the second open job, so watch that conversion first.
- The step from Growth to Pro is carried mostly by "featured" placement. Featured only has value once the job board has traffic. Before launch traffic exists, lead Pro with seats and AI volume.
- Organizer Pro at ₹1,999 a month plus a 5% ticket fee is comparable in shape to Luma and to Indian ticketing platforms. The ₹799 Boost is a sensible impulse price. The weak point is that Boost and Pro both promise email promotion "to subscribers in your city", which is worth little until that list is large.
- Ad packages (₹2,999 to ₹9,999 for 365 days) are very cheap for a year and include only 3 free days per zone, after which the founder pays ₹99 to ₹199 a day. Buyers are likely to read the package price as the price of a year of advertising. Reword it or restructure it.
- Funding data sold as one-off packs is a reasonable test against subscription databases such as Tracxn. Its value depends on data quality, which I did not assess.

---

### Area 5: User flows

Based on reading routes and page structure. Not tested in a browser. Before → after descriptions are in section 3.

**FLOW-01 · High · Organizer teammates lose their own workspace.** See SEC-04.

**FLOW-02 · Medium · "Confirmation email sent" is never sent**
- Evidence: `apps/web/lib/unified-auth/workspace.ts:66-75, 136-146` creates a `WorkspaceLinkRequest` and returns a message saying a confirmation email was sent. No code sends an email or reads that table (it has exactly one reference in the codebase).
- Effect: founders with 2FA, and organizers with 10 or more events, can never link their existing account through this path.
- Fix: send the email and add the confirm route, or remove the branch.
- Effort: M

**FLOW-03 · Medium · Portals have almost no loading or error states**
- Evidence: `app/founder` has 24 pages, 1 `loading.tsx` and 1 `error.tsx`; `app/employer` 21, 1 and 1; `app/organizer` 21, 2 and 1. The public site has 43 `loading.tsx` files for 68 pages, and no `not-found.tsx` exists anywhere.
- Effect: portal navigation shows a blank or frozen screen on slow connections, and a failed fetch falls through to one generic error boundary per portal.
- Effort: M

**FLOW-04 · Medium · Advertising purchase has no confirmation step.** After paying, the founder depends on the webhook; there is no callback and no pending state. See PAY-02.

**FLOW-05 · Low · Employers cannot publish until a founder verifies the startup**
- Evidence: `apps/web/lib/jobs/trust.ts:57-63`. This is a deliberate trust rule and a good one for job-scam prevention, but it is the largest drop-off point in the employer journey: a recruiter signs up, drafts a job, and is told to ask their founder.
- Fix: keep the rule; make the "ask your founder" step one click (a pre-written email with a deep link to the claim page), and show the draft's status clearly.
- Effort: S

**FLOW-06 · Low · Check-in by partial name**
- Evidence: `apps/web/app/api/organizer/check-in/route.ts:45-49` checks in the first registration whose name contains the typed text.
- Fix: when the input is not a QR token or an email, return a list to choose from.
- Effort: S

**FLOW-07 · Low · Founder can open a hiring workspace that requires two-step sign-in**
- Evidence: `api/founder/hiring/switch/route.ts:21-30` does not apply the `needsTwoFactor` check that `api/employer/workspaces/switch/route.ts:26` applies.
- Effort: S

---

### Area 6: Performance

**PERF-01 · High · A database query in middleware on every startup and tool page view**
- Evidence: `apps/web/middleware.ts:135-171`. Every request to `/startups/<slug>` and `/tools/<slug>` runs a Neon query to look for an old slug, before the cached page is served. The `previousSlugs` array lookup has no GIN index in the migrations.
- Why it matters: these are your highest-traffic pages and they are cached for an hour, yet each view still costs a database round trip. It keeps Neon compute awake and adds latency to every hit, including crawlers.
- Fix: do the lookup only when the page would 404. Call it from the page's not-found path, or cache "slug is current" in Redis for an hour.
- Effort: S

**PERF-02 · Medium · Trigram search without a trigram index**
- Evidence: `apps/web/lib/startups/directory.ts:124, 147` uses `word_similarity` in `WHERE` and `ORDER BY`. No migration creates the `pg_trgm` extension or a `gin_trgm_ops` index. The admin duplicate check has a fallback for a missing extension (`startups-dir/actions.ts:836-838`); the public search does not.
- Unverified: whether the extension and index were created by hand in the live database.
- Fix: `CREATE EXTENSION IF NOT EXISTS pg_trgm; CREATE INDEX ... ON "Startup" USING gin (lower(name) gin_trgm_ops);` in a migration.
- Effort: S

**PERF-03 · Medium · Analytics writes on every page view**
- Evidence: `apps/web/app/api/track/route.ts:67-90` does a `SELECT` and then an `UPDATE` per view. Concurrent views can both miss the row; whether the insert then conflicts depends on a unique key I did not confirm. Each view also updates a counter on the entity row.
- Fix: a single `INSERT ... ON CONFLICT (entityType, entityId, date) DO UPDATE SET views = views + 1`. At higher volume, count in Redis and flush every minute.
- Effort: S

**PERF-04 · Medium · Client bundle size**
- Evidence: 263 client component files. The largest: `app/organizer/events/create/OrganizerEventForm.tsx` (1,377 lines), `components/ToolsListWithComparison.tsx` (1,232), `components/StartupSearch.tsx` (1,092), `app/(public)/newsletter/page.tsx` (904, a whole page as a client component), `app/(public)/funding/FundingDashboard.tsx` (861).
- Unverified: actual bundle sizes and Core Web Vitals. I did not run a production build with the analyzer or Lighthouse.
- Likely risks: INP on the tools directory and startup search; LCP on the homepage hero if the image is not prioritised; CLS from ad and ticker slots that render or not depending on data.
- Fix: run `@next/bundle-analyzer` once, dynamically import the comparison UI, charts and the India map, and reserve fixed heights for ad and ticker slots.
- Effort: M

**PERF-05 · Low · Cold starts**
- Evidence: Prisma with a WebSocket pool per instance (`packages/database/index.ts:25`); `bcryptjs` at cost 12 in pure JavaScript on every sign-in; a single Vercel region `sin1` (`apps/web/vercel.json:2`).
- Fix: nothing urgent. Consider native `bcrypt` or argon2 if sign-in latency shows in monitoring.

**SEO.** Fifteen sitemap files cover every public section, `robots.ts` exists, comparison URLs are forced to one canonical order by a 301 (`middleware.ts:123-129`), old slugs 301 to new ones, and application status pages are `noindex` with `no-referrer` (`next.config.mjs:85-91`). JSON-LD and SEO helpers have unit tests. I did not validate the rendered structured data against Google's tester.

---

### Area 7: Algorithms

**ALG-01 · High · Impact Score: later funding stages score zero**
- Evidence: `apps/web/lib/impact-score.ts:18-29`. `STAGE_SCORES` has no entry for `PRE_SERIES_B`, `PRE_SERIES_C`, `PRE_SERIES_D`, or `SERIES_D` through `SERIES_J`, although the label map in the same file (104-125) knows them. `stageScore` returns 0 for anything missing (line 74).
- Effect: a Series D company gets 0 of 15 for stage, less than an idea-stage startup (1).
- Other points: the comments do not match the formulas (10 employees gives 7, not 5; $50M gives 46, not 40). Funding under $100K returns an unrounded decimal (line 47), so totals are not always whole numbers. Complexity is O(1).
- Fix: complete the map and add a test that every `StartupStage` enum value has a score.
- Effort: S

**ALG-02 · Medium · Impact Score measures size, and half of it is self-reported**
- Evidence: employees (20), stage (15) and age (15) come from the profile. A founder who enters 500 employees, Growth stage and a 2010 founding year gets 49 with no funding and no evidence. Age alone gives full marks to any company eight years old, active or not. Bootstrapped scores 4 of 15. There are two copies of the algorithm (ARCH-06).
- Why it matters: it is called "Impact" and shown publicly. It rewards capital raised and headcount, which biases against bootstrapped and capital-efficient companies.
- Unverified: whether a founder edit recalculates the score without admin review.
- Fix: count self-reported fields only after verification, or cap them; label the score for what it is ("Scale score"); or add signals you already hold (verified domain, product launches, hiring activity).
- Effort: M

**ALG-03 · Medium · Candidate match score**
- Evidence: `apps/web/lib/jobs/match.ts`.
- Correct: deterministic, explainable, O(skills + questions), never reads name, gender, age or college, missing data earns half credit, knockouts flag and never hide.
- Gaming: up to 50 of 100 points come from skills the candidate ticks (lines 63-88). Ticking everything maximises it. The AI review partly offsets this by marking such skills "claimed".
- Bias: experience above the band earns 75% (line 106). Years of experience correlate with age, so this is an indirect age penalty. Location mismatch earns 30% (line 119), which penalises candidates willing to relocate.
- Edge case: `sameCity` uses substring matching after stripping non-letters (lines 54-57). A city name written in a non-Latin script normalises to an empty string and matches every city.
- Fix: give experience above the band full credit and show it as information; require a non-empty normalised city before comparing.
- Effort: S

**ALG-04 · Low to Medium · AI screening: well built, one residual risk**
- Evidence: `apps/web/lib/jobs/ai-screen.ts`.
- Correct: contact details and name are removed before the model sees the text (90-99); the prompt marks the resume as untrusted (77); the model returns no score; the score is computed in code from judgments whose quoted evidence must appear in the candidate's own text (233-285); nothing is auto-rejected.
- Residual risk: the quote check proves the words are in the resume, not that they are true or visible. White-on-white text such as "built production Kubernetes clusters" would be quoted, verified and scored. The model is also asked to judge "real use", which hidden text can satisfy.
- Fix: show the evidence quotes next to the score (confirm the UI does), and flag resumes where extracted text contains instruction-like phrases or far more text than three pages normally hold.
- Effort: S
- PDF parsing: `getDocumentProxy` runs on untrusted files up to 5 MB with no timeout of its own (`resume-text.ts:30`). A crafted PDF could use the function's full duration. Low.

**ALG-05 · Medium · "Trending tools" can be set from one IP address**
- Evidence: ranking is the click count over 7 days (`apps/web/lib/db.ts:1547-1566`). The only limit is 5 clicks per tool per hour per IP (`lib/security.ts:50-70`): 840 clicks a week from one address, with no account, no CAPTCHA and no per-day cap. The bot filter reads the User-Agent header.
- Fix: count distinct IP hashes per day, not raw clicks, and cap one tool's share from a single /24 network.
- Effort: S

**ALG-06 · Low · Duplicate detection**
- Evidence: `apps/admin/app/(dashboard)/startups-dir/actions.ts:826-834` (and the tools equivalent at `tools-dir/actions.ts:972`).
- Issues: the website comparison is an exact string match, so `https://acme.ai`, `http://www.acme.ai/` and `acme.ai` are three different companies. Name similarity uses a threshold of 0.4 with `LIMIT 5` and no ordering by similarity. It runs a full table scan. It is an admin helper only; nothing stops duplicates at founder submission.
- Fix: compare the registrable domain using the `websiteDomain` helper you already have; order by similarity.
- Effort: S

**ALG-07 · Low · Startup search ranking**
- Evidence: `apps/web/lib/startups/directory.ts:117-150`. Weighted full-text rank plus exact, prefix and substring name boosts plus trigram similarity plus a category boost. Results must match half the query concepts. This is a sensible design. Ranking has no popularity or quality term, so it cannot be gamed by clicks. See PERF-02 for the index.

**ALG-08 · Low · Event auto-import scoring**
- Evidence: `apps/admin/app/api/admin/fetch-events/route.ts:61-101`. Additive keyword scoring using substring matches. Short keywords match inside unrelated words: `api` in "capital", `rust` in "trust", `iot` in "patriot", `hack` in "whack". The score has no upper bound, so a long description collects points.
- Fix: match on word boundaries and cap the contribution of each keyword group.
- Effort: S

**ALG-09 · Low · Ad rotation**
- Evidence: `apps/web/lib/db.ts:1229` picks one active creative per zone by a hash of its id and a 5-minute time bucket. This is uniform and stateless. It has no weighting, pacing or frequency cap, and the `AdImpression` and `AdClick` tables are never written, so you cannot report delivery to an advertiser.
- Fix: log impressions and clicks before selling ads.
- Effort: M

**ALG-10 · Low · Upvotes and opinion trending**
- Upvotes (`api/tools/[id]/upvote/route.ts`): require a verified account at least 24 hours old and cap at 20 a day. Reasonable. Removing and re-adding an upvote resets its date, which refreshes "most upvoted this month". The handler reads a raw JWT and skips session revocation (SEC-10).
- Opinion trending (`lib/db.ts:148-149`): engagement divided by age to the power 1.5, a standard decay. Views carry weight and view tracking is limited only at 100 a minute per IP.

**Not found.** I could not find a tool auto-approval rule at score ≥ 80 anywhere in `apps/web` or `apps/admin`. Tell me where it lives or whether it was removed.
**Reviewed at outline level only.** The similar-startups query (`app/(public)/startups/[slug]/page.tsx:133-205`) is a single `UNION ALL` with priority de-duplication; I did not check its ranking in detail.

---

### Area 8: Code quality and operations

**OPS-01 · Critical · Local development uses production data**
- Evidence: comparing values without printing them, `.env` and `.env.production` have identical `DATABASE_URL`, `R2_BUCKET_NAME` and `RESEND_API_KEY`. The JWT secrets and the Redis URL differ.
- Why it matters: any local script, seed or `prisma db push` runs against production. The setup guide tells developers to run `db push` after schema changes (`docs/development/SETUP.md:134`). A local test can email real users.
- Context: the e2e suite already refuses to run when staging points at production (`apps/web/e2e/safe-env.ts:30-32`), so the pattern is known; it is not applied to local development.
- Fix: create a Neon branch for development and one for staging (minutes of work), a separate R2 bucket, and a Resend test key. Make the dev script refuse to start if the database host equals the production host.
- Effort: S

**OPS-02 · High · Migration history cannot rebuild the database**
- Evidence: `packages/database/prisma/migrations` has 37 migrations that create 49 tables. The schema has 156 models; 109 have no `CREATE TABLE` in any migration, including `Startup`, `FounderUser`, `WebUser`, `JobBoardPayment`, `OrganizerPayment` and `InvoiceCounter`. The deployment and disaster-recovery documents say to run `prisma migrate deploy` (`docs/operations/DEPLOYMENT.md:37`, `docs/architecture/DISASTER_RECOVERY.md:67`). The Vercel build runs `prisma generate` only (`apps/web/package.json`).
- What is wrong: the real schema was built with `db push`. Database objects Prisma cannot describe exist only in old SQL files: the trigger that maintains `Event.registrationCount` (`20250718000000_add_event_platform/migration.sql:415-440`), which ticket capacity depends on (`lib/events/tickets.ts:74`), and the search vector columns. A fresh database built from the schema would oversell tickets silently.
- Fix: baseline now. Dump the production schema (`pg_dump --schema-only`), commit it as a single `0_init` migration, mark it applied with `prisma migrate resolve`, and use `prisma migrate deploy` in the deploy pipeline from then on. Add a CI job that builds a database from migrations and runs a smoke test.
- Effort: M

**OPS-03 · Medium · Browser error reporting is blocked by your own CSP**
- Evidence: `connect-src` in `apps/web/next.config.mjs:43` lists no Sentry host, and no `tunnelRoute` is configured in `withSentryConfig` (lines 103-108). `sentry.client.config.ts` enables error capture and Replay.
- Effect: the browser refuses to send events to Sentry. Server errors are reported; client errors are not. Verified by reading the config; confirm in the browser console on production.
- Fix: add `tunnelRoute: '/monitoring'` to `withSentryConfig`, or add the Sentry ingest host to `connect-src` and `worker-src blob:` for Replay.
- Effort: S

**OPS-04 · Medium · Tests are broad but never touch a database or a payment provider**
- Evidence: 1,100 unit and integration tests pass; all mock `@udyaibase/database`. Coverage is measured for `lib/**` only (`vitest.config.mts:17`) and CI does not enforce a threshold.
- Critical paths with no real test: Razorpay order → webhook → activation against a real database; the ticket hold and the row lock under concurrency (PAY-01 would have been caught); the `registrationCount` trigger; migrations; the 23 unguarded admin actions.
- Fix: one integration suite against a Neon branch or a Postgres container covering the four payment activations and two concurrent ticket checkouts. That is about ten tests and removes most of the money risk.
- Effort: M

**OPS-05 · Medium · One daily cron does about 20 unrelated jobs**
- Evidence: `apps/web/app/api/admin/data-retention/route.ts:30-195` runs retention, pending invoices, plan lapses for employers and hosts, ticket hold expiry, payout refresh, exchange rates and more, in sequence. Several early steps are not wrapped in their own `try` (for example the deletes at lines 43-50), so one failure skips plan lapses and invoice emails for that day. Each step handles at most 500 rows.
- What is done well: every cron run is recorded and missed runs raise an alert (`lib/ops/cron.ts`).
- Fix: wrap each step in a helper that records its own success or failure; split billing lifecycle from data retention.
- Effort: S

**OPS-06 · Medium · Backups and recovery are documented but not evidenced**
- Evidence: `docs/architecture/DISASTER_RECOVERY.md` states a 24-hour RPO and a 1-hour RTO and says R2 has "no automated backup currently" (line 33).
- Unverified: Neon plan and point-in-time retention, whether a restore has ever been tested, R2 versioning.
- Fix: do one restore drill to a Neon branch before launch and write down how long it took; enable versioning on the private resumes bucket.
- Effort: S

**OPS-07 · Low · CI/CD**
- Good: lint, typecheck, unit tests, build, Playwright, `npm audit`, Semgrep, gitleaks and CodeQL all run on pull requests (`.github/workflows/ci.yml`).
- Gaps: no migration step, no deploy gate tied to CI (Vercel deploys independently), `npm audit` fails only on critical findings, and the build job uses placeholder secrets so it cannot detect a missing production variable.
- Unverified: whether Razorpay test and live keys are separated per environment. The keys are in neither local env file.

**OPS-08 · Low · Logging of personal data**
- Evidence: activity logs mask emails (`lib/mask.ts`, used in `api/organizer/registrations/[id]/refund/route.ts:22`), AI calls are logged without prompts (`lib/ops/ai.ts:7`), and errors are logged by message. I saw no deliberate logging of personal data. `console.error('...', error)` with a full Prisma error can include query parameters; that is a minor exposure in Vercel logs.

---

## 3. User flow improvements

Not browser-tested. Each row is the change I would make first for that role.

### Founder
| Step | Before | After |
|---|---|---|
| Sign in | Three cookies may be set; which one grants access depends on the route | One session; a workspace switcher shows Founder, Hiring and Events |
| Claim startup | Any employee with a company email becomes owner instantly | Email proof grants edit rights at once; hiring-workspace ownership after a 48-hour notice to existing owners; DNS proof outranks email proof |
| Link an existing account with 2FA | Told "confirmation email sent"; nothing arrives | Email is sent and the link completes, or the option is removed |
| Change a teammate's role | Emailed code that can be bypassed | Code checked on the server, bound to the action |
| Advertise | Pays; the placement does not appear; no invoice | Pays; sees "active" after the callback; the placement is live; GST invoice by email |

### Employer
| Step | Before | After |
|---|---|---|
| First job | Draft saved; publishing blocked with "ask your founder" | Same rule, with a one-click "send this to your founder" email and a visible "waiting for verification" state |
| AI screening | Re-runs are free and unlimited | Every completed run counts; the remaining allowance is shown before a bulk run |
| Change plan mid-cycle | Remaining days are lost without warning | Checkout shows what is forfeited, or gives credit |
| Portal navigation | One loading state for 21 pages | Skeletons on Candidates, Jobs and Billing |

### Event organizer
| Step | Before | After |
|---|---|---|
| Join another host's team | Own events become unreachable | A workspace switcher; own workspace is the default |
| Sell tickets | A buyer who retries checkout can pay and get no ticket | The same order is returned while the hold is valid; unknown paid orders raise an alert |
| Refund after the event | May fail once the payout is released | Clear refund cut-off; refund status follows Razorpay's webhook |
| Check-in by name | First partial match is checked in | A short list to choose from |
| Payout | No invoice for the platform fee | Monthly fee invoice (after tax advice) |

### Visitor and candidate
| Step | Before | After |
|---|---|---|
| Apply to a UdyaiBase role | Must accept the newsletter; resume stored at a public URL | Newsletter optional; resume in the private bucket |
| Buy funding data | Must accept marketing email to buy | Marketing box optional and unticked |
| Click a newsletter link | Any URL can be wrapped in a udyaibase.com link | Only signed links redirect |
| Delete data | Works from the status link and account settings | Keep as is; add a single "delete everything for this email" request form for people without an account |

### Cross-portal
| Step | Before | After |
|---|---|---|
| Switch workspace | Different rules per direction; 2FA checked in one direction only | One switch endpoint with one rule set |
| Remove a member | Hiring removals apply on the next request (good); founder JWTs remain valid until expiry on some routes | Revocation checked in one shared session function |

---

## 4. Architecture target state

**Keep:** the Turborepo layout, `apps/web` and `apps/admin` as separate deployments, Neon, Upstash, R2 with public and private buckets, Vercel cron, shared plan definitions in `packages/utils`. None of this needs to change before Series A.

**Target structure**
```
apps/web        public site and the three portals
apps/admin      staff tools
packages/database   schema, migrations (the single source of truth), client
packages/auth       NEW: one session, workspace resolution, 2FA, OTP
packages/billing    NEW: Razorpay client, activation, invoices (moved from apps/web/lib/billing)
packages/utils      pure helpers and plan definitions
```

**Identity:** `UnifiedUser` is the person. `FounderUser`, `EventOrganizer` and employer memberships become workspace memberships of that person. One cookie. One function returns `{ user, workspaces, active }`.

**Payments:** one `Payment` table with a `product` column in place of four near-identical tables (`JobBoardPayment`, `OrganizerPayment`, `FundingDataPurchase`, `AdvPayment`), one webhook endpoint, and one activation dispatcher. The current code is already structured this way inside `razorpay-billing/route.ts`, so this is a consolidation, not a redesign.

**Data access:** Prisma for writes and simple reads; typed raw SQL for search and reporting; no untyped `sql` results crossing a module boundary.

**Migration path**
1. Now: SEC-01 startup check, OPS-01 environment split, OPS-02 migration baseline. These unblock everything else.
2. Before launch: extract `packages/auth` with the existing functions unchanged, then delete the email-match fallbacks one at a time behind tests.
3. After launch: merge the payment tables (new table, dual-write for one release, backfill, switch reads, drop the old tables).
4. Later: drop dead models; retire the unused ad system.

---

## 5. Prioritized roadmap

### Must fix before launch
| ID | Item | Effort |
|---|---|---|
| SEC-01 | Check Vercel for `EMPLOYER_JWT_SECRET`; add the startup secret check | S |
| OPS-01 | Separate dev and staging database, bucket and email key from production | S |
| SEC-02 | Add the guard to 23 admin actions; add the guard test | S |
| OPS-02 | Baseline migrations; deploy with `migrate deploy` | M |
| PAY-01 | Fix the ticket re-checkout; alert on unknown paid orders | S |
| SEC-03 | Move the careers resume upload to the private bucket; move existing files | S |
| SEC-04 | Explicit organizer workspace selection | M |
| PAY-02 | Finish or hide self-serve advertising | M to L (S to hide) |
| SEC-05, SEC-06 | Close the two open redirects; lock down `/api/og` | S |
| SEC-07, SEC-08 | Server-side action codes; atomic attempt counter; rate limit on verify | S |
| PAY-05 | Count every AI run; turn the hard stop on | S |
| ALG-01 | Complete the stage score map | S |
| OPS-03 | Sentry tunnel so browser errors are reported | S |
| SEC-11 | Unbundle newsletter consent in two flows | S |
| PAY-04 | Tax advice on tickets and the platform fee before paid tickets go live | External |

### First 30 days after launch
PERF-01 (middleware query), PERF-02 (trigram index), PERF-03 (analytics upsert), SEC-10 (one session check everywhere), PAY-03 (refund claim and webhooks), OPS-04 (payment tests against a real database), OPS-05 (split the cron), OPS-06 (restore drill), FLOW-02 (workspace link email), FLOW-03 (portal loading and error states), ALG-05 (trending by distinct visitors), ARCH-04 indexes.

### 90 days
ARCH-01 (single session in `packages/auth`), SEC-09 (provisional ownership for email-verified claims), SEC-12 (CSP nonces), PERF-04 (bundle work with measurements), ALG-02 (Impact Score redesign), ALG-03 (match-score bias fixes), ALG-09 (ad impression logging), ARCH-03 (typed queries).

### Later
Merge the payment tables, drop dead models, retire the second ad system, move click and view counting to Redis, proration on plan changes.

---

## 6. What is already done well

- **Payment activation.** Server-side prices, capture verified by reading the payment back, amount checks in both callback and webhook, idempotent state flips in transactions. This is the part most teams get wrong.
- **Ticket capacity.** A row lock on the event, holds counted against capacity, and an automatic refund for payments that arrive after the seat is gone.
- **GST invoices and credit notes.** Sequential numbering per financial year under a lock, correct CGST/SGST versus IGST split, frozen bill-to details.
- **Plan limits on the server**, with grace periods and a downgrade that pauses and never deletes.
- **AI screening design.** Redaction, an untrusted-input prompt, no model-issued score, evidence that must be quoted from the candidate's own text, nothing automated against a candidate.
- **Operations monitoring.** Cron runs recorded, missed-run alerts, OpenAI spend tracking with budgets, email quota checks, throttled alerts to an inbox and Sentry.
- **Security basics.** Origin-checked CSRF, rate limits that fail closed, spoof-resistant client IP, TOTP 2FA with lockout, signed webhooks, a proper SSRF helper (where it is used), private resume storage with signed links on the job board.
- **Privacy mechanics.** Defined retention periods that a job actually enforces, candidate self-service deletion, export and delete for every account type, double opt-in for the newsletter.
- **Tests and CI.** 1,100 passing tests, including IDOR tests for every portal, plus secret scanning and static analysis on every pull request.
- **Comments explain why.** The code documents its reasoning at the points where a wrong guess would cost money.

---

## 7. Unverified items and open questions

**Check in Vercel (I cannot see it)**
1. Is `EMPLOYER_JWT_SECRET` set in production? (SEC-01)
2. Are `INTERNAL_API_SECRET`, `CRON_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `RESEND_WEBHOOK_SECRET`, `ENCRYPTION_KEY`, `APPLY_SESSION_SECRET` and the four `INVOICE_*` variables set?
3. Are Razorpay test keys used in preview and live keys only in production?
4. Is `OPENAI_HARD_STOP` on, and what are the budgets?
5. Is `DATABASE_URL` the Neon pooled endpoint?

**Check in the database**
6. Does the `registrationCount` trigger exist in production? (`SELECT tgname FROM pg_trigger WHERE tgrelid = '"EventRegistration"'::regclass;`)
7. Is `pg_trgm` installed, and is there a trigram index on `Startup.name`?
8. Is there a unique key on `AnalyticsDaily (entityType, entityId, date)`?
9. Are the 14 unreferenced tables empty?

**Check in a browser or with a test**
10. Can an unguarded admin server action be called by posting to `/login` without a session? (SEC-02)
11. Are client-side Sentry events blocked by CSP in production? (OPS-03)
12. Core Web Vitals and bundle sizes: no build analysis or Lighthouse run was done.
13. The 55 Playwright tests were not run.

**Questions for you**
14. Is advertising fulfilled by hand from the admin panel today, or is the self-serve flow meant to be live? (PAY-02)
15. Where is the tool auto-approval rule (score ≥ 80)? I could not find it.
16. Has a chartered accountant reviewed GST on tickets and the 5% fee? (PAY-04)
17. Is a founder edit to employees, stage or founding year reviewed before the Impact Score changes? (ALG-02)
18. Neon plan and point-in-time retention; has a restore ever been tested? (OPS-06)
19. Is "any employee can claim the startup" an accepted trade-off? (SEC-09)

**Not reviewed**
- Most UI components and admin pages beyond their auth guards.
- The admin career scraper and Puppeteer usage, beyond noting they exist.
- Email template content and deliverability settings (SPF, DKIM, DMARC).
- Third-party dependency vulnerabilities beyond what CI already runs.
- The quality and licensing of the funding dataset itself.
