# Resend

Email delivery service for transactional and newsletter emails.

---

## Configuration

| Property | Value |
|----------|-------|
| Provider | Resend |
| SDK | `resend` npm package |
| Templates | React Email (`@react-email/components`) |
| Location | `apps/web/lib/email` + admin actions |

---

## Bounce & complaint webhook

Hard bounces and spam complaints unsubscribe the address from newsletters (`NewsletterSubscriber`) and
event campaigns (`EventSubscriber`). Login accounts are never touched. Soft (transient) bounces are ignored.

- Endpoint: `https://udyaibase.com/api/webhooks/resend` (`apps/web/app/api/webhooks/resend/route.ts`)
- Resend dashboard → Webhooks → add the endpoint with events `email.bounced` and `email.complained`
- Copy the signing secret (`whsec_…`) into `RESEND_WEBHOOK_SECRET` on the web Vercel project
- Without the secret every request is rejected (401), so set it before enabling the webhook

---

## Environment Variables

```env
RESEND_API_KEY=re_xxxxxxxxxxxx
RESEND_FROM_EMAIL=no-reply@udyaibase.com
RESEND_FROM_NAME=Udyaibase
RESEND_NEWSLETTER_EMAIL=events@udyaibase.com
RESEND_NEWSLETTER_NAME=Udyaibase Events
RESEND_REPLY_TO=hello@udyaibase.com
RESEND_WEBHOOK_SECRET=whsec_xxxxxxxxxxxx
```

---

## Email Types

| Email | From | Trigger |
|-------|------|---------|
| Tool approved | RESEND_FROM_EMAIL | Admin approves tool |
| Verification OTP | RESEND_FROM_EMAIL | Email verification |
| Event registration | RESEND_NEWSLETTER_EMAIL | User registers |
| Newsletter | RESEND_NEWSLETTER_EMAIL | Scheduled send |
| Password reset | RESEND_FROM_EMAIL | User request |

---

## Domains

Configured in Resend Dashboard:
- `udyaibase.com` — verified sending domain
- SPF, DKIM, DMARC records configured in Cloudflare DNS

---

## Rate Limits

| Plan | Emails/day | Emails/second |
|------|-----------|---------------|
| Free | 100 | 1 |
| Pro | 50,000 | 10 |

Newsletter sends are batched to respect rate limits.

---

## Related Documents

- [Email Architecture](../architecture/EMAIL.md) — System design
- [Newsletter Feature](../features/NEWSLETTER.md) — Subscription flow
