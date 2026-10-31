# System Overview

> **Note (Oct 2026):** the Express server `apps/api` has been retired. The web and admin apps query the database directly, media URLs come from `R2_PUBLIC_URL`, and the Resend bounce/complaint webhook moved to `apps/web/app/api/webhooks/resend` (see `docs/infrastructure/RESEND.md`). Sections below that mention `apps/api`, port 4000 or `/api/v1` rewrites are historical.

Udyaibase is a monorepo containing 3 applications and 1 shared package, serving the AI startup ecosystem with directories, news, events, and community features.

---

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                        Cloudflare (CDN + DNS + WAF)               │
└─────────┬────────────────────────────────────────────┬───────────┘
          │                                            │
┌─────────▼─────────────┐              ┌──────────────▼────────────┐
│  apps/web (Next.js)   │              │  apps/admin (Next.js)     │
│  Port 3000            │              │  Port 3001                │
│                       │              │                           │
│  • Public pages       │              │  • Admin dashboard        │
│  • Founder dashboard  │              │  • Content management     │
│  • Organizer panel    │              │  • Bulk operations        │
│  • API routes (/api/) │              │  • Analytics              │
│  • Server Components  │              │  • NextAuth (Google)      │
└─────────┬─────────────┘              └──────────────┬────────────┘
          │                                            │
          │  ┌─────────────────────────────────────┐   │
          └──►  apps/api (Express)                 ◄───┘
             │  Port 4000                          │
             │                                     │
             │  • REST API (/v1/*)                  │
             │  • Background jobs (Bull)            │
             │  • Email sending (Resend)            │
             │  • Media processing                  │
             └───────────┬─────────────────────────┘
                         │
          ┌──────────────┼──────────────────┐
          │              │                  │
┌─────────▼──────┐ ┌────▼─────────┐ ┌──────▼──────────┐
│ Neon PostgreSQL│ │ Upstash Redis│ │ Cloudflare R2   │
│ (Database)     │ │ (Cache)      │ │ (Media Storage) │
│                │ │              │ │                 │
│ • 80+ tables   │ │ • SWR cache  │ │ • Logos         │
│ • 474+ indexes │ │ • Rate limit │ │ • Screenshots   │
│ • Full-text    │ │ • Metrics    │ │ • Event banners │
│ • ap-southeast │ │ • Stampede   │ │ • No egress fee │
└────────────────┘ └──────────────┘ └─────────────────┘
```

---

## Monorepo Structure

```
udyaibase/
├── apps/
│   ├── web/              → Public website + Founder + Organizer dashboards
│   │   ├── app/          → Next.js App Router pages
│   │   │   ├── (public)/ → Public pages (tools, startups, events, stories)
│   │   │   ├── (client)/ → Authenticated user pages
│   │   │   ├── founder/  → Founder dashboard
│   │   │   ├── organizer/→ Event organizer dashboard
│   │   │   └── api/      → API routes
│   │   ├── components/   → React components
│   │   └── lib/          → Utilities (auth, cache, seo, db)
│   │
│   ├── admin/            → Internal admin dashboard
│   │   ├── app/(dashboard)/ → All admin feature pages
│   │   ├── components/   → Admin UI components
│   │   └── lib/          → Admin utilities (auth, audit, cache-invalidate)
│   │
│   └── api/              → Express REST API server
│       └── src/          → Routes, services, middleware
│
├── packages/
│   └── database/         → Shared Prisma schema + generated client
│       └── prisma/
│           ├── schema.prisma   → Database schema (80+ models)
│           └── migrations/     → Migration history
│
├── docs/                 → Project documentation
├── .github/workflows/    → CI pipeline (lint + build)
└── turbo.json            → Turborepo task configuration
```

---

## Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | Next.js 14 (App Router) | SSR, ISR, Server Components |
| Language | TypeScript (strict) | Type safety across all apps |
| Styling | Tailwind CSS | Utility-first styling |
| Database | Neon PostgreSQL | Serverless, auto-scaling, branching |
| ORM | Prisma 5 | Type-safe DB access, migrations |
| Caching | Upstash Redis | SWR, stampede protection, rate limiting |
| Storage | Cloudflare R2 | S3-compatible object storage |
| Email | Resend | Transactional + newsletter delivery |
| Auth (Admin) | NextAuth + Google OAuth | Admin dashboard access |
| Auth (Web) | JWT cookies | Founder, Organizer, Public user |
| CDN | Cloudflare | Global edge caching, DDoS protection |
| Hosting | Vercel | Serverless deployment, preview deploys |
| Monitoring | Sentry | Error tracking, performance |
| Analytics | Google Analytics 4 | Traffic, user behavior |
| CI | GitHub Actions | Lint → Build on PR/push |
| Monorepo | Turborepo | Parallel builds, task caching |

---

## Data Flow

### Read Path (Public Page Load)
```
Browser → Cloudflare CDN
  → Cache HIT? → Serve cached page
  → Cache MISS → Vercel Edge
    → Next.js Server Component
      → Redis cache check (Upstash)
        → Cache HIT? → Return cached data
        → Cache MISS → Prisma → Neon PostgreSQL
          → Store in Redis (SWR pattern)
      → Render HTML
    → Cache at CDN (ISR revalidate)
  → Return to Browser
```

### Write Path (Mutation)
```
Browser → API Route (POST/PUT/DELETE)
  → Auth middleware (verify JWT/session)
  → Rate limit check (Upstash)
  → Input validation (Zod)
  → Prisma mutation → Neon PostgreSQL
  → Cache invalidation (explicit keys)
  → Return response
```

---

## Key Design Decisions

| Decision | Rationale | ADR |
|----------|-----------|-----|
| Turborepo monorepo | Shared code, parallel builds, single CI | [ADR-001](../adr/001-monorepo-turborepo.md) |
| Neon PostgreSQL | Serverless, auto-scale, branching for dev | [ADR-002](../adr/002-neon-postgresql.md) |
| Upstash Redis | REST-based, serverless-compatible, SWR | [ADR-003](../adr/003-upstash-redis-caching.md) |
| JWT in cookies | Stateless auth, no session DB, edge-compatible | [ADR-005](../adr/005-jwt-cookie-auth.md) |
| 4 auth mechanisms | Different security needs per user type | See [AUTHENTICATION.md](./AUTHENTICATION.md) |
| Soft deletes | Audit trail, recovery, data integrity | [ADR-010](../adr/010-soft-deletes.md) |
| Redis as cache only | PostgreSQL = source of truth, Redis = speed | [ADR-003](../adr/003-upstash-redis-caching.md) |

---

## Related Documents

- [Authentication](./AUTHENTICATION.md) — All 4 auth flows
- [Caching](./CACHING.md) — Redis SWR strategy
- [Deployment](./DEPLOYMENT.md) — Vercel pipeline
- [Environment Variables](../infrastructure/ENVIRONMENT.md) — Full env catalog
