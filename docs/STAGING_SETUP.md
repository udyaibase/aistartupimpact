# Staging setup

Local dev servers use the production database through the root `.env`. Anything that writes data, including the browser tests, needs this separate environment instead.

Browser tests (`npm run test:e2e` in `apps/web`) refuse to start until `.env.staging` passes the checks in `apps/web/e2e/safe-env.ts`. They start their own server on port 3100 and never reuse the dev server on port 3000.

## What to create

| # | Service | Create | Goes in `.env.staging` as |
|---|---|---|---|
| 1 | Neon | A branch of the database, named `staging` | `DATABASE_URL`, and `DIRECT_URL` if your root `.env` has it |
| 2 | Cloudflare R2 | Two new buckets, such as `udyaibase-staging-media` and `udyaibase-staging-resumes`, with public access off on the resumes bucket | `R2_BUCKET_NAME`, `R2_RESUMES_BUCKET`, `R2_PUBLIC_URL`, and `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` (ideally a token limited to these buckets) |
| 3 | Razorpay | Test mode keys, and a test webhook secret | `RAZORPAY_KEY_ID` (starts `rzp_test_`), `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` |
| 4 | Resend | A separate API key. Send only to `delivered@resend.dev` or your own inbox | `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `RESEND_FROM_EMAIL` |
| 5 | Turnstile | Cloudflare's published test keys | `TURNSTILE_SECRET_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY` |
| 6 | Upstash | A separate Redis database | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` |
| 7 | OpenAI | A separate key with a low budget, or leave empty to turn AI off | `OPENAI_API_KEY` |
| 8 | Secrets | New random values, not the production ones | `EMPLOYER_JWT_SECRET`, `USER_JWT_SECRET`, `FOUNDER_JWT_SECRET`, `APPLY_SESSION_SECRET`, `NEXTAUTH_SECRET`, `CRON_SECRET` |

## Rules

- `.env.staging` goes in the repository root and is already gitignored. Never commit it.
- Neon branches copy production data, including real personal data. Before anyone else uses staging, or before connecting it to a Vercel Preview, anonymise it or start from an empty schema.
- Keep staging emails away from real people: a copied database still holds real addresses.
- Schema changes go to the staging branch first, then to production.

## Optional: Vercel Preview

Add the same values to Vercel's Preview environment, so every pull request gets a safe, shareable link. Do this only after the database is anonymised.
