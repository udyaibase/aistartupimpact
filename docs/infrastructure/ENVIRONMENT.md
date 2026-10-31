# Environment Variables

Complete catalog of all environment variables used across the project.

---

## Quick Reference

The project reads environment from:
1. Root `.env` — shared across all apps (loaded by `dotenv-cli`)
2. `apps/web/.env.local` — overrides for the web app (Next.js auto-loads)
3. `apps/admin/.env.local` — overrides for the admin app
4. Vercel Dashboard — production environment variables

> ⚠️ `apps/web/.env.local` takes precedence over root `.env` for the web app. Keep both in sync.

---

## Database

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Neon PostgreSQL pooled connection string |
| `DIRECT_URL` | Yes | Neon direct (non-pooled) connection for migrations |

**Example**: `postgresql://user:pass@ep-xxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`

---

## Authentication Secrets

| Variable | Required | Description |
|----------|----------|-------------|
| `FOUNDER_JWT_SECRET` | Yes | Signs founder JWT tokens (min 32 chars) |
| `USER_JWT_SECRET` | Yes | Signs user + organizer JWT tokens (min 32 chars) |
| `ADMIN_JWT_SECRET` | No | Legacy admin JWT (use NEXTAUTH_SECRET instead) |
| `JWT_SECRET` | CI only | Generic JWT secret for CI builds |
| `REFRESH_SECRET` | CI only | Refresh token secret |
| `NEXTAUTH_SECRET` | Yes | NextAuth encryption key for admin app |
| `NEXTAUTH_URL` | Yes | Admin app base URL (http://localhost:3001 locally) |
| `ADMIN_NEXTAUTH_URL` | Build | Admin app URL for Vercel build |
| `IP_HASH_SALT` | Yes | Salt for hashing IP addresses (privacy) |

**Generate secrets**: `openssl rand -hex 32`

---

## Google OAuth

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_CLIENT_ID` | Yes | Google Cloud OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Yes | Google Cloud OAuth client secret |
| `GOOGLE_REDIRECT_URI` | Yes | Founder OAuth callback URL |
| `GOOGLE_REDIRECT_URI_USER` | Yes | User OAuth callback URL |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Yes | Client-side Google ID (public) |

**Local**: `http://localhost:3000/api/founder/auth/google/callback`
**Prod**: `https://udyaibase.com/api/founder/auth/google/callback`

---

## Email (Resend)

| Variable | Required | Description |
|----------|----------|-------------|
| `RESEND_API_KEY` | Yes | Resend API key (`re_...`) |
| `RESEND_FROM_EMAIL` | Yes | Default from address |
| `RESEND_FROM_NAME` | Yes | Default from name |
| `RESEND_NEWSLETTER_EMAIL` | Yes | Newsletter from address |
| `RESEND_NEWSLETTER_NAME` | Yes | Newsletter from name |
| `RESEND_REPLY_TO` | Yes | Reply-to address |

---

## Caching (Upstash Redis)

| Variable | Required | Description |
|----------|----------|-------------|
| `UPSTASH_REDIS_REST_URL` | Prod: Yes | Upstash REST endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | Prod: Yes | Upstash REST auth token |

**Behavior without Redis**: App falls through to direct DB queries (no errors, just slower).

---

## Storage (Cloudflare R2)

| Variable | Required | Description |
|----------|----------|-------------|
| `R2_ACCOUNT_ID` | Yes | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | Yes | R2 S3-compatible access key |
| `R2_SECRET_ACCESS_KEY` | Yes | R2 S3-compatible secret key |
| `R2_BUCKET_NAME` | Yes | R2 bucket name |
| `R2_PUBLIC_URL` | Yes | Public CDN URL for serving files |

---

## Analytics & Monitoring

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_GA_ID` | No | Google Analytics 4 measurement ID |
| `NEXT_PUBLIC_SENTRY_DSN` | No | Sentry error tracking DSN |
| `SENTRY_AUTH_TOKEN` | No | Sentry source map upload token |

---

## Application URLs

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_WEB_URL` | Yes | Web app URL (http://localhost:3000) |
| `NEXT_PUBLIC_ADMIN_URL` | Yes | Admin app URL (http://localhost:3001) |
| `NEXT_PUBLIC_SITE_URL` | Build | Canonical site URL |
| `API_URL` | No | Internal API URL (server-side, never exposed) |

---

## Search (MeiliSearch — Optional)

| Variable | Required | Description |
|----------|----------|-------------|
| `MEILI_URL` | No | MeiliSearch instance URL |
| `MEILI_MASTER_KEY` | No | MeiliSearch admin key |

Currently using PostgreSQL full-text search. MeiliSearch is a future upgrade.

---

## Legacy / SMTP (Deprecated)

| Variable | Required | Description |
|----------|----------|-------------|
| `SMTP_HOST` | No | Legacy SMTP (replaced by Resend) |
| `SMTP_PORT` | No | Legacy SMTP port |
| `SMTP_USER` | No | Legacy SMTP username |
| `SMTP_PASSWORD` | No | Legacy SMTP password |
| `SMTP_FROM` | No | Legacy SMTP from address |

---

## Vercel-Specific

These are auto-set by Vercel during builds:
- `VERCEL_GIT_COMMIT_SHA` — Used as cache version prefix (auto-invalidates on deploy)
- `NEXT_BUILD_ID` — Next.js build identifier
- `NODE_ENV` — `production` in deployments

---

## Adding New Variables

1. Add to `.env.example` with a comment
2. Add to `turbo.json` → `tasks.build.env` array (if needed at build time)
3. Add to `apps/web/.env.local` and root `.env`
4. Add to Vercel dashboard (Production + Preview)
5. Document in this file
6. Update CI workflow if needed (`.github/workflows/ci.yml`)

---

## Related Documents

- [Development Setup](../development/SETUP.md) — How to configure locally
- [Deployment](../architecture/DEPLOYMENT.md) — Production env setup
- [Security: Secrets](../security/SECRETS.md) — Rotation and management
