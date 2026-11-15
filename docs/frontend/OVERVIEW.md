# Frontend Overview

The web application (`apps/web`) is a Next.js 14 App Router application serving public pages, founder dashboard, and organizer dashboard.

---

## Architecture

- **Framework**: Next.js 14 with App Router
- **Rendering**: Server Components by default, ISR for public pages
- **Styling**: Tailwind CSS with custom design tokens
- **Fonts**: Sora (headings), Plus Jakarta Sans (body)
- **Icons**: Lucide React
- **State**: Server state via Server Components, client state via useState/useContext
- **Forms**: Controlled inputs with server action or fetch submission

---

## Route Groups

| Group | Path | Auth | Purpose |
|-------|------|------|---------|
| `(public)` | `/tools`, `/startups`, `/events`, etc. | None | Public-facing pages |
| `founder` | `/founder/*` | founder-token | Founder self-service dashboard |
| `organizer` | `/organizer/*` | organizer_session | Event organizer dashboard |
| `api` | `/api/*` | Varies | REST API endpoints |

---

## Layout Hierarchy

```
RootLayout (app/layout.tsx)
├── Fonts (Sora + Jakarta), Theme, Analytics, CookieConsent
│
├── PublicLayout (app/(public)/layout.tsx)
│   ├── Navbar, Footer, AuthContext
│   └── Page content
│
├── FounderLayout (app/founder/layout.tsx)
│   ├── Founder sidebar, auth check
│   └── Dashboard content
│
└── OrganizerLayout (app/organizer/layout.tsx)
    ├── Organizer sidebar, auth check
    └── Organizer content
```

---

## Data Fetching Patterns

### Server Components (preferred for reads)
```typescript
// Direct DB query — no fetch, no loading state needed
export default async function ToolsPage() {
  const tools = await getApprovedTools();
  return <ToolsList tools={tools} />;
}
```

### ISR (Incremental Static Regeneration)
```typescript
// Page revalidates every 60 seconds
export const revalidate = 60;

export default async function StartupsPage() {
  const data = await getStartups();
  return <StartupGrid startups={data} />;
}
```

### Client-side mutations
```typescript
'use client';
const handleUpvote = async () => {
  const res = await fetch(`/api/tools/${toolId}/upvote`, { method: 'POST' });
  const data = await res.json();
  setCount(data.count);
};
```

---

## Component Patterns

### Shared Components (`components/shared/`)
- `CityAutocomplete` — City search with API-backed suggestions
- `ToolTagSelector` — Multi-select tag picker with typeahead
- `CategoryCascadeSelect` — Parent → subcategory drill-down
- `FAQManager` — Add/edit/reorder FAQ items
- `ProsConsManager` — Manage pros/cons lists

### Domain Components
- `components/tools/` — UpvoteButton, DiscoverySections, ComparisonTable
- `components/events/` — EventCard, CitySelect, RegistrationForm
- `components/founder/` — StartupEditForm, ToolSubmitForm
- `components/layout/` — Navbar, Footer, MobileNav, Sidebar

### Design System Classes
- `btn-brand` — Primary CTA button (brand color)
- `card` — Card container (border, shadow, rounded)
- `input-field` — Form input styling
- `font-sora` — Heading font
- `font-jakarta` — Body font
- `text-brand` — Brand red color
- `text-navy` — Dark heading color

---

## SEO Strategy

| Feature | Implementation |
|---------|---------------|
| Page metadata | `export const metadata: Metadata = { ... }` per page |
| Canonical URLs | `alternates: { canonical: '/path' }` |
| Open Graph | title, description, image per page |
| Twitter Cards | summary_large_image |
| Structured Data | JSON-LD schemas in layout + pages |
| Sitemaps | Dynamic XML at `/sitemap.xml`, `/tools/sitemap.xml` |
| Robots | `robots.txt` with allow all + sitemap reference |

### Structured Data Schemas Generated
- `WebSite` — Site-level (root layout)
- `Organization` — Publisher identity (root layout)
- `BreadcrumbList` — Page hierarchy
- `SoftwareApplication` — Tool detail pages
- `NewsArticle` — Story/news pages
- `FAQPage` — FAQ sections
- `ItemList` — Directory listing pages
- `Event` — Event detail pages

---

## Performance

| Technique | Where |
|-----------|-------|
| Server Components | All data fetching (no client waterfalls) |
| ISR | Public pages (60s–300s revalidate) |
| Redis cache | Hot queries (categories, trending, discovery) |
| Image optimization | `next/image` with AVIF/WebP formats |
| Font preload | Sora + Jakarta loaded with `preload: true` |
| Code splitting | Automatic via App Router |
| Lazy loading | `dynamic()` for heavy client components |
| Suspense | Streaming for slow sections |

---

## Theme System

- Dark mode via `class` strategy (not media query)
- Toggle stored in `localStorage` key: `asi-theme`
- Flash prevention: inline script in `<head>` adds `dark` class before paint
- Colors adapt via `dark:` prefix in Tailwind

---

## Related Documents

- [Components](./COMPONENTS.md) — Component catalog
- [SEO](./SEO.md) — SEO implementation details
- [Coding Standards](../development/CODING_STANDARDS.md) — Code conventions
- [Folder Conventions](../development/FOLDER_CONVENTIONS.md) — File organization
