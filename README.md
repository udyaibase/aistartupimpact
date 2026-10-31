# Udyaibase

> One place to track the entire AI startup ecosystem.

Udyaibase is a full-stack platform for discovering AI startups, tools, founders, events, and funding. Built to give India's AI ecosystem the visibility it deserves.

[![CI](https://github.com/udyaibase/udyaibase/actions/workflows/ci.yml/badge.svg)](https://github.com/udyaibase/udyaibase/actions/workflows/ci.yml)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Database | Neon PostgreSQL |
| ORM | Prisma |
| Caching | Upstash Redis |
| Storage | Cloudflare R2 |
| Email | Resend |
| Auth | JWT + NextAuth |
| Hosting | Vercel |
| CDN | Cloudflare |
| Monorepo | Turborepo |

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      Cloudflare CDN                       │
└───────────────┬─────────────────────────┬───────────────┘
                │                         │
┌───────────────▼───────────┐ ┌───────────▼───────────────┐
│   apps/web (Next.js)      │ │   apps/admin (Next.js)    │
│   Public + Founder +      │ │   Admin Dashboard         │
│   Organizer Dashboards    │ │   Port 3001               │
│   Port 3000               │ │                           │
└───────────────┬───────────┘ └───────────┬───────────────┘
                │                         │
┌───────────────▼───────────┐ ┌───────────▼───────────────┐
│   Neon PostgreSQL         │ │   Upstash Redis           │
│   (ap-southeast-1)        │ │   (Caching + Rate Limit)  │
└───────────────────────────┘ └───────────────────────────┘
                │
┌───────────────▼───────────┐
│   Cloudflare R2           │
│   (Media Storage)         │
└───────────────────────────┘
```

---

## Project Structure

```
udyaibase/
├── apps/
│   ├── web/                    # Public website + all user-facing portals
│   │   ├── app/(public)/       #   Public pages (tools, startups, events, stories, funding)
│   │   ├── app/founder/        #   Founder Portal (submit tools, manage startups, analytics)
│   │   ├── app/organizer/      #   Organizer Portal (create events, registrations, team)
│   │   ├── app/api/            #   REST API routes
│   │   ├── components/         #   React components (shared, tools, events, layout)
│   │   └── lib/                #   Utilities (auth, cache, seo, db)
│   ├── admin/                  # Internal admin dashboard (NextAuth, RBAC)
│   │   ├── app/(dashboard)/    #   32 admin feature pages
│   │   ├── components/         #   Admin UI components
│   │   └── lib/                #   Auth, audit-log, cache-invalidate
│   └── api/                    # Express API server (background jobs, email)
├── packages/
│   └── database/               # Shared Prisma schema (80+ models), client, migrations
├── docs/                       # 78 documentation files across 12 sections
└── turbo.json                  # Turborepo pipeline config
```

---

## Quickstart

```bash
# 1. Clone
git clone https://github.com/udyaibase/udyaibase.git
cd udyaibase

# 2. Install dependencies
npm install

# 3. Set up environment
cp .env.example .env
# Fill in DATABASE_URL, UPSTASH_REDIS_REST_URL, etc.

# 4. Generate Prisma client
npx turbo db:generate

# 5. Run development servers
npm run dev
```

This starts all apps:
- **Web** → http://localhost:3000
- **Admin** → http://localhost:3001

Both apps talk to the database directly (Prisma / Neon). The old Express server (`apps/api`) was retired; its Resend webhook now lives at `apps/web/app/api/webhooks/resend`.

---

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start all apps in development mode |
| `npm run build` | Build all apps for production |
| `npm run lint` | Lint all apps |
| `npx turbo db:generate` | Generate Prisma client |
| `npx turbo db:push` | Push schema to database |
| `npx turbo db:migrate` | Run pending migrations |

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Neon PostgreSQL connection string |
| `DIRECT_URL` | Yes | Direct (non-pooled) Neon connection |
| `NEXTAUTH_SECRET` | Yes | NextAuth encryption secret |
| `NEXTAUTH_URL` | Yes | Admin app URL |
| `UPSTASH_REDIS_REST_URL` | Yes | Upstash Redis REST endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | Yes | Upstash Redis auth token |
| `CLOUDFLARE_R2_ACCESS_KEY` | Yes | R2 storage access key |
| `CLOUDFLARE_R2_SECRET_KEY` | Yes | R2 storage secret key |
| `RESEND_API_KEY` | Yes | Resend email API key |
| `GOOGLE_CLIENT_ID` | Yes | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth client secret |
| `JWT_SECRET` | Yes | JWT signing secret for web auth |

See [docs/infrastructure/ENVIRONMENT.md](docs/infrastructure/ENVIRONMENT.md) for the full catalog.

---

## Authentication

The platform uses 4 separate auth mechanisms:

| User Type | Mechanism | Cookie | Auth Helper |
|-----------|-----------|--------|-------------|
| Public User | JWT | `user-token` | `verifyToken()` |
| Founder | JWT (Google OAuth) | `founder-token` | `requireFounderAuth()` |
| Admin | NextAuth (Google OAuth) | `next-auth.session-token` | `getServerSession(authOptions)` |
| Organizer | JWT | `organizer_session` | `getOrganizerSession()` |

---

## Key Features

### Public Platform
- **AI Startup Directory** — 280+ startups with search, filters, 32 business sectors, funding data
- **AI Tool Directory** — Curated tools with 12 tag groups (254 tags), 21 parent categories (306 subcategories), reviews, comparisons, upvotes
- **AI Events** — Conferences, hackathons, meetups, workshops — browse, register, and discover
- **Founder Stories** — In-depth editorial profiles and interviews
- **Funding Dashboard** — Live funding rounds, investor tracking, ecosystem trends
- **India AI Hub** — Government schemes (IndiaAI Mission), policies, AI researchers, talent stats
- **Newsletter** — 5,000+ subscribers, weekly AI ecosystem digest
- **Tool Comparison** — Side-by-side comparison of AI tools at `/tools/compare/[slugs]`
- **Tool Alternatives** — Discover alternative tools with SEO landing pages
- **Category Landing Pages** — Dedicated pages per tool category with SEO
- **Community Upvotes** — Anti-gaming (24h account age, 20/day cap, threshold display)
- **Search** — Full-text search across tools, startups, and articles (PostgreSQL tsvector)

### Founder Portal (`/founder/*`)
- **Google OAuth Login** — Sign in with Google, onboarding flow
- **Startup Management** — Claim, edit, verify ownership (DNS verification)
- **Tool Management** — Submit tools, edit details, view approval status
- **Analytics Dashboard** — Per-tool metrics (clicks, bookmarks, reviews, upvotes, daily chart)
- **Review Responses** — View and respond to community reviews on your tools
- **DNS Verification** — Prove domain ownership via TXT record → verified badge
- **Profile Management** — Edit founder profile and settings

### Organizer Portal (`/organizer/*`)
- **Event Creation** — Full event setup (date, location, agenda, pricing, format)
- **Registration Management** — View attendees, manage registrations
- **Organization Profile** — Company branding and details
- **Team Management** — Add/remove team members
- **On-Site Tools** — QR check-in for attendees (future)

### Admin Dashboard (`/admin`)
- **Content Management** — Articles, news, stories (rich text editor, co-authors)
- **Startup Management** — CRUD, approval queue, bulk actions, duplicate detection
- **Tool Management** — CRUD, approval queue, bulk approve/reject/delete
- **Tag System** — 12 groups, 254 tags with admin CRUD
- **Category System** — Hierarchical categories with parent/subcategory management
- **Event Oversight** — Event moderation and management
- **Funding Rounds** — Add/edit funding data and investors
- **User Management** — Admin roles, delegated delete access (time-limited)
- **Newsletter Admin** — Campaign creation, subscriber management, delivery
- **Media Library** — Upload/manage images (Cloudflare R2)
- **Analytics** — Platform metrics, traffic, team activity (IST timestamps)
- **Collections** — Editor's Picks curated tool lists
- **Hero Slots** — Homepage hero section management
- **Bulk Actions** — Multi-select approve/delete with "type DELETE" confirmation
- **Audit Logs** — Full admin action audit trail
- **Cities Database** — City management for location features

### Security & Access Control
- **RBAC** — 7 admin roles (SUPER_ADMIN → CONTRIBUTOR)
- **Delete Protection** — Restricted to SUPER_ADMIN with delegated grants
- **Rate Limiting** — Per-endpoint limits via Upstash
- **Security Headers** — CSP, HSTS, X-Frame-Options, Referrer-Policy
- **DNS Verification** — Verified badges for tools and startups

---

## Documentation

Full documentation lives in [`/docs`](./docs/) — 78 files across 12 sections:

| Section | Content |
|---------|---------|
| [Architecture](docs/architecture/) | System overview, auth, caching, deployment, search, storage, email, scalability |
| [Frontend](docs/frontend/) | Components, SEO, overview |
| [Backend](docs/backend/) | Routes, validation, server actions |
| [Database](docs/database/) | Schema ERD, conventions, indexes |
| [API Reference](docs/api/) | All endpoints documented |
| [Features](docs/features/) | Every feature with data flow, permissions, business logic |
| [Infrastructure](docs/infrastructure/) | Vercel, Cloudflare, R2, Neon, Upstash, Resend, backups |
| [Security](docs/security/) | Overview, rate limiting, headers |
| [Operations](docs/operations/) | Deploy, incidents, runbooks, health checks |
| [Testing](docs/testing/) | Strategy, unit, E2E |
| [Troubleshooting](docs/troubleshooting/) | Common issues, database debugging |
| [ADRs](docs/adr/) | Architecture Decision Records |

Start here:
- [Development Setup](docs/development/SETUP.md) — Get running locally
- [System Overview](docs/architecture/SYSTEM_OVERVIEW.md) — Understand the architecture
- [Authentication](docs/architecture/AUTHENTICATION.md) — All 4 auth flows

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on:
- Branch naming and PR process
- Code style and conventions
- Commit message format
- Review expectations

---

## License

Proprietary. All rights reserved.

---

<p align="center">
  <strong>Udyaibase</strong> — Hyderabad, Telangana, India<br/>
  <a href="https://udyaibase.com">udyaibase.com</a>
</p>
