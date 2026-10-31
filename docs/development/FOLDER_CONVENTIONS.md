# Folder Conventions

> **Note (Oct 2026):** the Express server `apps/api` has been retired. The web and admin apps query the database directly, media URLs come from `R2_PUBLIC_URL`, and the Resend bounce/complaint webhook moved to `apps/web/app/api/webhooks/resend` (see `docs/infrastructure/RESEND.md`). Sections below that mention `apps/api`, port 4000 or `/api/v1` rewrites are historical.

Where things live in the monorepo and why.

---

## Top-Level Structure

```
udyaibase/
├── apps/           → Application code (3 apps)
├── packages/       → Shared libraries
├── docs/           → Documentation
├── .github/        → CI workflows
├── .env            → Root environment (shared)
├── turbo.json      → Build pipeline
└── package.json    → Workspace root
```

---

## apps/web — Public Website + Dashboards

```
apps/web/
├── app/
│   ├── (public)/           → Public pages (no auth required)
│   │   ├── tools/          → AI Tool directory + detail
│   │   ├── startups/       → Startup directory + detail + submit
│   │   ├── events/         → Events listing + detail
│   │   ├── stories/        → Founder stories
│   │   ├── funding/        → Funding dashboard
│   │   ├── india-ai/       → India AI hub + schemes
│   │   ├── about/          → About page
│   │   ├── contact/        → Contact page
│   │   ├── privacy/        → Legal pages (privacy, terms, etc.)
│   │   ├── newsletter/     → Newsletter page
│   │   ├── search/         → Search results
│   │   └── layout.tsx      → Public layout (Navbar + Footer)
│   │
│   ├── (client)/           → Authenticated user pages
│   │   └── my-analytics/   → User analytics (future)
│   │
│   ├── founder/            → Founder dashboard (founder-token auth)
│   │   ├── dashboard/      → Main founder dashboard
│   │   ├── startups/       → Manage owned startups
│   │   ├── tools/          → Manage owned tools
│   │   ├── analytics/      → Tool analytics
│   │   ├── onboarding/     → New founder onboarding flow
│   │   ├── profile/        → Founder profile edit
│   │   └── settings/       → Account settings
│   │
│   ├── organizer/          → Event organizer dashboard (organizer_session auth)
│   │   ├── events/         → Manage events
│   │   ├── organization/   → Organization profile
│   │   ├── team/           → Team management
│   │   └── settings/       → Organizer settings
│   │
│   ├── api/                → API routes (REST endpoints)
│   │   ├── tools/          → /api/tools/* (upvote, reviews, etc.)
│   │   ├── startups/       → /api/startups/*
│   │   ├── events/         → /api/events/*
│   │   ├── founder/        → /api/founder/* (auth, tools, startups)
│   │   ├── organizer/      → /api/organizer/*
│   │   ├── user/           → /api/user/* (auth, profile)
│   │   ├── newsletter/     → /api/newsletter/*
│   │   ├── media/          → /api/media/* (upload)
│   │   ├── search/         → /api/search/*
│   │   └── cities/         → /api/cities/* (autocomplete)
│   │
│   ├── layout.tsx          → Root layout (fonts, theme, analytics)
│   ├── globals.css         → Tailwind base + custom utilities
│   └── sitemap.xml/        → Dynamic sitemap generation
│
├── components/
│   ├── layout/             → Navbar, Footer, Sidebar, MobileNav
│   ├── shared/             → Reusable across features
│   │   ├── CityAutocomplete.tsx
│   │   ├── ToolTagSelector.tsx
│   │   ├── CategoryCascadeSelect.tsx
│   │   ├── FAQManager.tsx
│   │   └── ...
│   ├── tools/              → Tool-specific (UpvoteButton, DiscoverySections)
│   ├── events/             → Event-specific (CitySelect, EventCard)
│   ├── founder/            → Founder dashboard components
│   ├── organizer/          → Organizer components
│   ├── auth/               → Auth forms, signup popup
│   ├── india-ai/           → India AI hub components
│   └── seo/                → SEO metadata components
│
├── lib/
│   ├── auth.ts             → Stub auth (web doesn't use NextAuth)
│   ├── founder-auth.ts     → Founder JWT auth helpers
│   ├── organizer-auth/     → Organizer session helpers
│   ├── unified-auth/       → Unified auth (migration in progress)
│   ├── cache.ts            → Upstash Redis caching layer
│   ├── db.ts               → Shared database queries
│   ├── seo.ts              → Structured data schema generators
│   ├── seo-utils.ts        → SEO helper utilities
│   └── categories.ts       → Category/type data helpers
│
├── public/                 → Static assets (logos, images)
├── middleware.ts           → Edge middleware (founder onboarding)
└── next.config.js          → Next.js config (headers, rewrites, Sentry)
```

---

## apps/admin — Admin Dashboard

```
apps/admin/
├── app/
│   ├── (dashboard)/        → All admin pages (protected by NextAuth)
│   │   ├── dashboard/      → Main admin dashboard
│   │   ├── articles/       → News/stories management
│   │   ├── startups-dir/   → Startup directory management
│   │   │   ├── manage/     → List + bulk actions
│   │   │   ├── new/        → Create startup
│   │   │   └── [id]/edit/  → Edit startup
│   │   ├── tools-dir/      → Tool directory management
│   │   │   ├── manage/     → List + bulk actions
│   │   │   ├── tags/       → Tag system CRUD
│   │   │   ├── categories/ → Category CRUD
│   │   │   └── collections/→ Editor collections
│   │   ├── events/         → Event management
│   │   ├── founders/       → Founder profiles
│   │   ├── funding-rounds/ → Funding data
│   │   ├── users/          → Admin user management
│   │   ├── analytics/      → Platform analytics
│   │   ├── activity/       → Team activity log
│   │   ├── media/          → Media library
│   │   ├── newsletter-admin/→ Newsletter management
│   │   ├── hero-slots/     → Homepage hero management
│   │   ├── cities/         → City database
│   │   └── layout.tsx      → Dashboard layout (sidebar + header)
│   │
│   ├── login/              → Admin login page
│   └── layout.tsx          → Root layout
│
├── components/
│   ├── layout/             → Sidebar, Header, BreakingTicker
│   └── shared/             → Reusable admin components
│       ├── ProsConsManager.tsx
│       ├── AlternativeToolsManager.tsx
│       ├── StartupLinker.tsx
│       ├── ToolTagSelector.tsx
│       └── ...
│
└── lib/
    ├── auth.ts             → NextAuth config (Google OAuth)
    ├── audit-log.ts        → Audit logging + permission helpers
    └── cache-invalidate.ts → Redis cache invalidation
```

---

## apps/api — Express REST API

```
apps/api/
└── src/
    ├── app.ts              → Express server entry (port 4000)
    ├── routes/             → Route handlers by domain
    ├── services/           → Business logic
    ├── middleware/          → Auth, rate limit, CORS
    └── lib/                → Utilities
```

---

## packages/database — Shared DB Layer

```
packages/database/
├── prisma/
│   ├── schema.prisma       → All 80+ models, enums, relations
│   └── migrations/         → Migration history
├── index.ts                → Re-exports Prisma client
└── package.json            → Published as @udyaibase/database
```

---

## Where to Put New Code

| You're building... | Put it in... |
|-------------------|-------------|
| New public page | `apps/web/app/(public)/your-page/page.tsx` |
| New founder feature | `apps/web/app/founder/your-feature/page.tsx` |
| New admin page | `apps/admin/app/(dashboard)/your-page/page.tsx` |
| New API endpoint | `apps/web/app/api/your-domain/route.ts` |
| Reusable component | `apps/web/components/shared/YourComponent.tsx` |
| Admin component | `apps/admin/components/shared/YourComponent.tsx` |
| Utility function | `apps/web/lib/your-util.ts` |
| Database change | `packages/database/prisma/schema.prisma` |
| Server action | Same folder as the page: `actions.ts` |

---

## Related Documents

- [Coding Standards](./CODING_STANDARDS.md) — How to write code
- [System Overview](../architecture/SYSTEM_OVERVIEW.md) — Architecture context
