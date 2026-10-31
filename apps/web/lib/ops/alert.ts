import * as Sentry from '@sentry/nextjs';
import { prisma } from '@udyaibase/database';
import { sendEmail } from '@/lib/email/send';

/**
 * Operations alerts to the admin inbox (ADMIN_DIGEST_EMAIL), also sent to Sentry.
 * Throttled per key: at most one email per `hours`, so a failing job doesn't flood the inbox.
 * Returns true when an email went out.
 */
export async function opsAlert(key: string, subject: string, lines: string[], hours = 6): Promise<boolean> {
  Sentry.captureMessage(`[ops] ${subject}`, { level: 'warning', tags: { opsAlert: key }, extra: { lines } });
  const claimed = await prisma.$queryRaw<{ key: string }[]>`
    INSERT INTO "OpsAlert" (key, "lastSentAt", count) VALUES (${key}, NOW(), 1)
    ON CONFLICT (key) DO UPDATE SET "lastSentAt" = NOW(), count = "OpsAlert".count + 1
    WHERE "OpsAlert"."lastSentAt" < NOW() - make_interval(hours => ${hours}::int)
    RETURNING key`.catch(() => []);
  if (!claimed.length) return false;
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
  const site = (process.env.NEXT_PUBLIC_ADMIN_URL || 'https://admin.udyaibase.com').replace(/\/$/, '');
  const r = await sendEmail({
    to: process.env.ADMIN_DIGEST_EMAIL || 'admin@udyaibase.com',
    subject: `[Udyaibase ops] ${subject}`,
    type: 'ops_alert',
    html: `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2937;max-width:600px;margin:0 auto;padding:24px">
<h1 style="font-size:18px;margin:0 0 12px">${esc(subject)}</h1>
<ul style="margin:0 0 16px;padding-left:20px;font-size:14px;line-height:1.6">${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
<p style="margin:0;font-size:13px;color:#6b7280">More on the <a href="${site}/monitoring" style="color:#A50F15">Monitoring page</a>. You won’t get this alert again for ${hours} hours.</p></div>`,
  }).catch(() => ({ success: false }));
  return r.success;
}
