# Search Architecture

> **Note (Oct 2026):** the Express server `apps/api` has been retired. The web and admin apps query the database directly, media URLs come from `R2_PUBLIC_URL`, and the Resend bounce/complaint webhook moved to `apps/web/app/api/webhooks/resend` (see `docs/infrastructure/RESEND.md`). Sections below that mention `apps/api`, port 4000 or `/api/v1` rewrites are historical.

Full-text search using PostgreSQL native tsvector with GIN indexes.

---

## Engine

| Property | Value |
|----------|-------|
| Engine | PostgreSQL full-text search |
| Index type | GIN (Generalized Inverted Index) |
| Query type | `tsvector @@ tsquery` |
| Ranking | `ts_rank()` for relevance scoring |
| Language | English dictionary |

---

## Searchable Tables

| Table | Column | Indexed Fields |
|-------|--------|---------------|
| `AiTool` | `searchVector` | name, tagline, description |
| `Startup` | `searchVector` | name, tagline, description |
| `Article` | `searchVector` | title, excerpt, contentText |

Each has a GIN index: `@@index([searchVector], type: Gin)`

---

## How It Works

### 1. Data Indexing (on INSERT/UPDATE)

A database trigger automatically updates the `searchVector` column:
```sql
-- Trigger function (conceptual)
UPDATE "AiTool"
SET "searchVector" = 
  setweight(to_tsvector('english', COALESCE(name, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(tagline, '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(description, '')), 'C')
WHERE id = NEW.id;
```

Weights: A (highest relevance for name) > B (tagline) > C (description)

### 2. Query Building

```typescript
// User input: "artificial intelligence chatbot"
// → tsquery: 'artificial & intelligence & chatbot'

const tsQuery = query
  .trim()
  .split(/\s+/)
  .filter(Boolean)
  .join(' & ');

// With prefix matching for autocomplete:
const prefixQuery = query.trim().split(/\s+/).join(' & ') + ':*';
```

### 3. Search Execution

```sql
SELECT id, name, slug, tagline,
       ts_rank("searchVector", to_tsquery('english', $1)) AS rank
FROM "AiTool"
WHERE "deletedAt" IS NULL
  AND status = 'APPROVED'
  AND "searchVector" @@ to_tsquery('english', $1)
ORDER BY rank DESC
LIMIT 20;
```

### 4. Multi-table Search

```typescript
// Search across tools, startups, and articles in parallel
const [tools, startups, articles] = await Promise.all([
  sql`SELECT ... FROM "AiTool" WHERE "searchVector" @@ tsquery LIMIT 10`,
  sql`SELECT ... FROM "Startup" WHERE "searchVector" @@ tsquery LIMIT 10`,
  sql`SELECT ... FROM "Article" WHERE "searchVector" @@ tsquery LIMIT 5`,
]);

// Merge and return
return { tools, startups, articles };
```

---

## API Endpoint

```
GET /api/search?q=chatbot+ai
```

Response:
```json
{
  "tools": [{ "id": "...", "name": "ChatGPT", "slug": "chatgpt", "rank": 0.85 }],
  "startups": [{ "id": "...", "name": "Sarvam AI", "slug": "sarvam-ai", "rank": 0.72 }],
  "articles": [{ "id": "...", "title": "Best AI Chatbots", "slug": "best-ai-chatbots" }]
}
```

---

## Limitations

| Limitation | Impact | Workaround |
|-----------|--------|-----------|
| No fuzzy matching | Typos won't match | Future: MeiliSearch |
| No typo tolerance | "chatgtp" won't find "chatgpt" | Future: trigram index |
| English only | Non-English content poorly ranked | Use 'simple' dictionary |
| No synonyms | "ML" won't match "machine learning" | Manual synonym mapping |

---

## Future: MeiliSearch

`meilisearch` package is already in `apps/api/package.json`. Migration plan:
1. Index tools + startups in MeiliSearch
2. Use MeiliSearch for autocomplete + typo tolerance
3. Keep PostgreSQL tsvector for advanced filtered queries
4. Hybrid: MeiliSearch for search UI, PostgreSQL for directory filters

---

## Autocomplete

City autocomplete (`/api/cities/search`) uses `ILIKE` pattern matching:
```sql
SELECT id, name, state, country
FROM "City"
WHERE name ILIKE ${query + '%'}
ORDER BY name
LIMIT 10;
```

---

## Related Documents

- [System Overview](./SYSTEM_OVERVIEW.md) — Architecture context
- [Database Schema](../database/SCHEMA.md) — Table structures
- [Backend Routes](../backend/ROUTES.md) — Search endpoint
