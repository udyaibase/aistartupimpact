# Backend Overview

> **Note (Oct 2026):** the Express server `apps/api` has been retired. The web and admin apps query the database directly, media URLs come from `R2_PUBLIC_URL`, and the Resend bounce/complaint webhook moved to `apps/web/app/api/webhooks/resend` (see `docs/infrastructure/RESEND.md`). Sections below that mention `apps/api`, port 4000 or `/api/v1` rewrites are historical.

The backend consists of two systems: Next.js API routes (`apps/web/app/api/`) and an Express server (`apps/api`).

---

## Architecture

```
┌─────────────────────────────────────────┐
│  Next.js API Routes (apps/web/app/api/) │
│                                         │
│  • Tool operations (upvote, reviews)    │
│  • Founder auth + dashboard APIs        │
│  • Organizer APIs                       │
│  • User auth (signup, login)            │
│  • Newsletter subscribe                 │
│  • Media upload                         │
│  • Search                               │
│  • City autocomplete                    │
└──────────────────┬──────────────────────┘
                   │ rewrites: /api/v1/* → localhost:4000/v1/*
┌──────────────────▼──────────────────────┐
│  Express API Server (apps/api)          │
│  Port 4000                              │
│                                         │
│  • Background jobs (Bull queues)        │
│  • Email sending (Resend)               │
│  • Media processing                     │
│  • Heavy compute tasks                  │
│  • Scheduled jobs                       │
└─────────────────────────────────────────┘
```

---

## Next.js API Routes

### Route Organization

| Domain | Path | Purpose |
|--------|------|---------|
| Tools | `/api/tools/[id]/upvote` | Upvote toggle |
| Tools | `/api/tools/[id]/reviews` | Submit/get reviews |
| Tools | `/api/tools/[id]/click` | Track clicks |
| Startups | `/api/startups/[id]/save` | Bookmark |
| Events | `/api/events/[id]/register` | Event registration |
| Founder | `/api/founder/auth/*` | Google OAuth flow |
| Founder | `/api/founder/tools/*` | Tool CRUD |
| Founder | `/api/founder/startups/*` | Startup management |
| User | `/api/user/auth/*` | Email signup/login |
| User | `/api/user/session` | Session check |
| Organizer | `/api/organizer/*` | Organizer APIs |
| Newsletter | `/api/newsletter/subscribe` | Subscribe |
| Media | `/api/media/upload` | File upload to R2 |
| Search | `/api/search` | Full-text search |
| Cities | `/api/cities/search` | City autocomplete |

### Standard Route Pattern

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // 1. Authentication
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Input validation
    const body = await request.json();
    if (!body.title?.trim()) {
      return NextResponse.json({ error: 'Title required' }, { status: 400 });
    }

    // 3. Business logic + database
    await sql`INSERT INTO "ToolReview" ...`;

    // 4. Side effects (cache invalidation, notifications)
    // await invalidateCache('tool:reviews:' + params.id);

    // 5. Response
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[POST /api/tools/review]', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
```

---

## Server Actions (Admin + Founder)

Server actions are used in `apps/admin` and `apps/web/app/founder/` for form submissions.

### Location
Actions live in `actions.ts` files alongside the page that uses them:
```
apps/admin/app/(dashboard)/tools-dir/actions.ts
apps/admin/app/(dashboard)/startups-dir/manage/actions.ts
```

### Pattern
```typescript
'use server';

import { neon } from '@neondatabase/serverless';
import { revalidatePath } from 'next/cache';
import { logAuditEvent } from '@/lib/audit-log';
import { invalidateToolCache } from '@/lib/cache-invalidate';

const sql = neon(process.env.DATABASE_URL!);

export async function approveToolAction(id: string) {
  try {
    await sql`UPDATE "AiTool" SET status = 'APPROVED' WHERE id = ${id}`;
    
    // Audit trail
    await logAuditEvent({ action: 'APPROVE', resourceType: 'tool', resourceId: id });
    
    // Cache invalidation
    await invalidateToolCache();
    
    // ISR revalidation
    revalidatePath('/tools');
    
    return { success: true };
  } catch (error) {
    return { success: false, error: 'Failed to approve tool' };
  }
}
```

---

## Database Access

### Raw SQL (primary pattern)
```typescript
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL!);

const tools = await sql`
  SELECT t.id, t.name, t.slug, c.name AS "categoryName"
  FROM "AiTool" t
  LEFT JOIN "ToolCategory" c ON c.id = t."categoryId"
  WHERE t."deletedAt" IS NULL AND t.status = 'APPROVED'
  ORDER BY t."createdAt" DESC
  LIMIT 20
`;
```

### Prisma Client (for simple operations)
```typescript
import { prisma } from '@udyaibase/database';

const tool = await prisma.aiTool.findUnique({
  where: { slug },
  include: { ToolCategory: true },
});
```

### When to use which
| Use | When |
|-----|------|
| Raw SQL (`neon`) | Complex joins, aggregates, full-text search, performance-critical |
| Prisma | Simple CRUD, type-safe includes, count operations |

---

## Authentication Middleware

Auth is checked per-route, not globally:

```typescript
// For public user auth (user-token cookie)
async function getUserFromRequest(request: NextRequest) {
  const token = request.cookies.get('user-token')?.value;
  if (!token) return null;
  const { payload } = await jwtVerify(token, JWT_SECRET);
  return { id: payload.userId, email: payload.email };
}

// For founder auth (in server actions)
import { requireFounderAuth } from '@/lib/founder-auth';
const session = await requireFounderAuth(); // throws if not authenticated
```

---

## Rate Limiting

```typescript
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, '60 s'),
});

// In route handler:
const { success } = await ratelimit.limit(identifier);
if (!success) return NextResponse.json({ error: 'Rate limited' }, { status: 429 });
```

---

## Error Response Format

All API errors follow this structure:
```json
{
  "error": "Human-readable error message",
  "code": "OPTIONAL_ERROR_CODE"
}
```

HTTP status codes used:
| Status | Meaning |
|--------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad request (validation failed) |
| 401 | Not authenticated |
| 403 | Not authorized (role/permission) |
| 404 | Resource not found |
| 429 | Rate limited |
| 500 | Internal server error |

---

## Express API (apps/api)

- Runs on port 4000
- Proxied from web app via Next.js rewrites: `/api/v1/*` → `localhost:4000/v1/*`
- Uses: `express`, `helmet`, `cors`, `compression`, `morgan`
- Background jobs: `bull` queue library
- Email: `resend` + `@react-email/components`
- File processing: `multer`

---

## Security Headers

Configured in `apps/web/next.config.js`:
- `Content-Security-Policy` — Strict CSP with allowlisted sources
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Strict-Transport-Security` — HSTS with 1-year max-age
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` — Disable camera, microphone, geolocation

---

## Related Documents

- [Routes Catalog](./ROUTES.md) — Full endpoint listing
- [Validation](./VALIDATION.md) — Input validation patterns
- [Authentication](../architecture/AUTHENTICATION.md) — Auth flows
- [Caching](../architecture/CACHING.md) — Redis cache layer
