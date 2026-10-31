# Health Checks

Endpoints and services to monitor for uptime.

---

## Endpoints to Monitor

| URL | Expected | Frequency | Alert If |
|-----|----------|-----------|----------|
| `https://udyaibase.com` | 200, HTML | 1 min | > 5s or non-200 |
| `https://udyaibase.com/tools` | 200, HTML | 5 min | > 5s or non-200 |
| `https://udyaibase.com/api/user/session` | 200, JSON | 5 min | > 2s or non-200 |
| Admin dashboard | 200 (redirect to login) | 5 min | Non-200/302 |

---

## External Service Health

| Service | Status Page | Check |
|---------|------------|-------|
| Vercel | status.vercel.com | Deployment + serverless |
| Neon | neon.tech/status | Database connectivity |
| Upstash | status.upstash.com | Redis availability |
| Cloudflare | cloudflarestatus.com | CDN + DNS |
| Resend | status.resend.com | Email delivery |

---

## Key Metrics to Track

| Metric | Normal | Warning | Critical |
|--------|--------|---------|----------|
| Homepage load time | < 1s | 1–3s | > 3s |
| API response time | < 200ms | 200–500ms | > 500ms |
| Error rate (Sentry) | < 0.1% | 0.1–1% | > 1% |
| Redis hit rate | > 80% | 60–80% | < 60% |
| DB connection time | < 50ms | 50–200ms | > 200ms |
| Upstash memory | < 70% | 70–90% | > 90% |

---

## Monitoring Tools

| Tool | Purpose |
|------|---------|
| Sentry | Error tracking, performance monitoring |
| Vercel Analytics | Web Vitals, traffic |
| Google Analytics | User behavior, traffic sources |
| Upstash Dashboard | Redis metrics, memory, operations |
| Neon Dashboard | Query performance, connections |
| Cloudflare Analytics | CDN hits, threats blocked |

---

## Alerting (Recommended Setup)

| Service | Alert On | Channel |
|---------|----------|---------|
| Sentry | New error spike (> 10/min) | Slack + Email |
| Uptime monitor | Any 5xx for > 2 minutes | Slack + SMS |
| Upstash | Memory > 80% | Email |
| Vercel | Build failure | GitHub + Slack |

---

## Related Documents

- [Incident Response](./INCIDENT_RESPONSE.md) — What to do when alerts fire
- [Runbooks](./RUNBOOKS.md) — How to fix common issues
- [Monitoring](../architecture/MONITORING.md) — Architecture-level observability
