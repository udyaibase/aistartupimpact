# API Overview

> **Note (Oct 2026):** the Express server `apps/api` has been retired. The web and admin apps query the database directly, media URLs come from `R2_PUBLIC_URL`, and the Resend bounce/complaint webhook moved to `apps/web/app/api/webhooks/resend` (see `docs/infrastructure/RESEND.md`). Sections below that mention `apps/api`, port 4000 or `/api/v1` rewrites are historical.

Design principles and conventions for all API endpoints.

---

## Architecture

Two API systems:
1. **Next.js API Routes** (`apps/web/app/api/`) — Primary for web app endpoints
2. **Express API** (`apps/api`, port 4000) — Background jobs, email, heavy processing

Express is proxied via Next.js rewrites: `/api/v1/*` → `localhost:4000/v1/*`

---

## Design Principles

| Principle | Implementation |
|-----------|---------------|
| RESTful | Standard HTTP methods (GET, POST, PUT, DELETE) |
| JSON | All request/response bodies as JSON |
| Auth in cookies | JWT tokens in HttpOnly cookies (not headers) |
| Explicit errors | `{ error: "message" }` with correct HTTP status |
| No versioning (yet) | Single API version, breaking changes coordinated |
| Rate limited | Public endpoints have per-IP or per-user limits |
| Parameterized | Never string-interpolate user input into SQL |

---

## Request Format

```typescript
// GET with query params
GET /api/search?q=chatbot&limit=10

// POST with JSON body
POST /api/tools/abc123/upvote
Content-Type: application/json
Cookie: user-token=eyJhbGciOiJI...
```

---

## Response Format

### Success
```json
// Single resource
{ "id": "abc123", "name": "Tool Name", "slug": "tool-name" }

// Action result
{ "success": true }
{ "upvoted": true, "count": 42 }

// List
{ "tools": [...], "total": 280 }
```

### Error
```json
{ "error": "Human-readable error message" }
```

---

## HTTP Status Codes

| Status | Meaning | When |
|--------|---------|------|
| 200 | OK | Successful read or action |
| 201 | Created | Resource created |
| 400 | Bad Request | Validation failed |
| 401 | Unauthorized | Not authenticated |
| 403 | Forbidden | Authenticated but not authorized |
| 404 | Not Found | Resource doesn't exist |
| 429 | Too Many Requests | Rate limited |
| 500 | Internal Error | Unexpected server error |

---

## Authentication

No `Authorization` header — auth is cookie-based:
- `user-token` → Public users
- `founder-token` → Founders
- `organizer_session` → Organizers
- `next-auth.session-token` → Admins

---

## Common Patterns

### Pagination (future)
```
GET /api/tools?page=1&limit=20
→ { tools: [...], total: 280, page: 1, limit: 20 }
```

### Filtering
```
GET /api/startups?category=healthcare&stage=SEED&city=Bengaluru
```

### Sorting
```
GET /api/tools?sort=upvotes&order=desc
```

---

## Endpoint Catalog

See individual API docs:
- [Auth API](./AUTH_API.md)
- [Tools API](./TOOLS_API.md)
- [Startups API](./STARTUPS_API.md)
- [Events API](./EVENTS_API.md)
- [Founders API](./FOUNDERS_API.md)
- [Newsletter API](./NEWSLETTER_API.md)
- [Media API](./MEDIA_API.md)
- [Search API](./SEARCH_API.md)
- [Admin API](./ADMIN_API.md)

For the full route table, see [Backend Routes](../backend/ROUTES.md).
