# Local Development Setup

> **Note (Oct 2026):** the Express server `apps/api` has been retired. The web and admin apps query the database directly, media URLs come from `R2_PUBLIC_URL`, and the Resend bounce/complaint webhook moved to `apps/web/app/api/webhooks/resend` (see `docs/infrastructure/RESEND.md`). Sections below that mention `apps/api`, port 4000 or `/api/v1` rewrites are historical.

Get the project running locally in under 10 minutes.

---

## Prerequisites

| Tool | Version | Check |
|------|---------|-------|
| Node.js | 20+ | `node --version` |
| npm | 10+ | `npm --version` |
| Git | 2.x | `git --version` |

No local PostgreSQL required — we use Neon (cloud).

---

## Step 1: Clone the Repository

```bash
git clone https://github.com/udyaibase/udyaibase.git
cd udyaibase
```

---

## Step 2: Install Dependencies

```bash
npm install
```

This installs dependencies for all apps (web, admin, api) and packages via workspaces.

---

## Step 3: Environment Setup

```bash
cp .env.example .env
```

Fill in the required values. At minimum you need:

| Variable | Where to Get |
|----------|-------------|
| `DATABASE_URL` | Neon dashboard → Connection string (pooled) |
| `DIRECT_URL` | Neon dashboard → Connection string (direct) |
| `FOUNDER_JWT_SECRET` | Generate: `openssl rand -hex 32` |
| `USER_JWT_SECRET` | Generate: `openssl rand -hex 32` |
| `IP_HASH_SALT` | Generate: `openssl rand -hex 32` |
| `GOOGLE_CLIENT_ID` | Google Cloud Console → OAuth 2.0 |
| `GOOGLE_CLIENT_SECRET` | Google Cloud Console → OAuth 2.0 |

Optional for basic development (features degrade gracefully without these):
- `UPSTASH_REDIS_REST_URL` / `TOKEN` — caching (falls through to DB without it)
- `RESEND_API_KEY` — email sending
- `R2_*` — media uploads

> ⚠️ `apps/web/.env.local` overrides root `.env` for the web app. Keep both in sync.

---

## Step 4: Generate Prisma Client

```bash
npx prisma generate --schema=packages/database/prisma/schema.prisma
```

---

## Step 5: Run Development Servers

```bash
npm run dev
```

This starts all 3 apps via Turborepo:

| App | URL | Purpose |
|-----|-----|---------|
| Web | http://localhost:3000 | Public site + Founder + Organizer dashboards |
| Admin | http://localhost:3001 | Internal admin dashboard |
| API | http://localhost:4000 | Express REST API |

---

## Step 6: Verify

1. Open http://localhost:3000 — you should see the homepage
2. Open http://localhost:3001 — you should see the admin login
3. Open http://localhost:4000/health — should return `{ status: "ok" }`

---

## Database Access

The project uses **Neon PostgreSQL** (cloud). No local DB needed.

- Schema lives at: `packages/database/prisma/schema.prisma`
- Run migrations: `npx prisma migrate dev --schema=packages/database/prisma/schema.prisma`
- View data: `npx prisma studio --schema=packages/database/prisma/schema.prisma`

---

## IDE Setup (VSCode)

Recommended extensions:
- **Prisma** — Schema highlighting + formatting
- **Tailwind CSS IntelliSense** — Class autocomplete
- **ESLint** — Inline lint errors
- **Pretty TypeScript Errors** — Readable TS errors

Recommended settings (`.vscode/settings.json`):
```json
{
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.formatOnSave": true,
  "typescript.preferences.importModuleSpecifier": "non-relative"
}
```

---

## Common Issues

| Problem | Solution |
|---------|----------|
| `MODULE_NOT_FOUND` on startup | Delete `apps/web/.next` and restart |
| Prisma client errors | Run `npx prisma generate` again |
| `Unknown argument` / 500s right after a schema change | The running dev server still holds the old Prisma client. Run `npx prisma db push` from `packages/database` (never `--accept-data-loss`), then restart the dev server |
| Every `/api/*` route returns 404 (often after deleting or moving a route folder) | Turbopack's route cache is stale: stop the dev server, `rm -rf apps/web/.next`, start again |
| Dev server hangs or pages time out after an interrupted test run | Restart the dev server; aborted Playwright runs can leave it stuck in `ECONNRESET` loops |
| Port already in use | Kill process: `lsof -ti:3000 \| xargs kill` |
| DB connection refused | Check `DATABASE_URL` is correct in `.env` |
| ENV vars not loading | Ensure `dotenv-cli` is installed (comes with `npm install`) |
| Timestamps show wrong time | DB stores UTC — display with `timeZone: 'Asia/Kolkata'` |

---

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start all apps in development |
| `npm run build` | Build all apps for production |
| `npm run lint` | Lint all apps |
| `npx turbo db:generate` | Generate Prisma client |
| `npx prisma migrate dev` | Create + apply migration |
| `npx prisma studio` | Visual database browser |

---

## Next Steps

- Read [SYSTEM_OVERVIEW.md](../architecture/SYSTEM_OVERVIEW.md) to understand the architecture
- Read [AUTHENTICATION.md](../architecture/AUTHENTICATION.md) to understand auth flows
- Read [CODING_STANDARDS.md](./CODING_STANDARDS.md) before writing code
