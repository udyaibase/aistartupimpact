import { sendEmailFireAndForget } from '@/lib/email/send';

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://udyaibase.com').replace(/\/$/, '');

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function shell(body: string): string {
  return `<!doctype html><html><body style="margin:0;background:#F7F7F9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px">
<tr><td style="padding:32px">${body}</td></tr></table>
<p style="font-size:12px;color:#6b7280;margin:16px 0 0">Udyaibase &middot; AI jobs at India's startups</p>
</td></tr></table></body></html>`;
}

export const button = (href: string, label: string) =>
  `<a href="${href}" style="display:inline-block;background:#A50F15;color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 20px;border-radius:10px">${label}</a>`;

/** "Application received" with the private status link (the only copy of the token). */
export function sendApplicationReceived(opts: { to: string; name: string; jobTitle: string; company: string; statusToken: string }) {
  const link = `${SITE}/applications/${opts.statusToken}`;
  sendEmailFireAndForget({
    to: opts.to,
    subject: `Application received: ${opts.jobTitle} at ${opts.company}`,
    type: 'job_application_received',
    html: shell(`
<h1 style="font-size:20px;margin:0 0 8px">Thanks for applying, ${esc(opts.name.split(' ')[0] || opts.name)}</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.6">Your application for <strong>${esc(opts.jobTitle)}</strong> at <strong>${esc(opts.company)}</strong> has been sent. You can check its status, withdraw it, or delete your data at any time:</p>
<p style="margin:0 0 24px">${button(link, 'Track your application')}</p>
<p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6">Keep this email private: anyone with the link can see your application status. We'll email you when ${esc(opts.company)} moves you forward.</p>`),
  });
}

/** Tells the hiring team a new candidate applied. No candidate PII beyond the name. */
export function sendNewApplicationAlert(opts: { to: string; candidateName: string; jobTitle: string; jobId: string; matched: number; total: number; source: string }) {
  const link = `${SITE}/employer/applications?job=${opts.jobId}`;
  const match = opts.total > 0 ? ` · matches ${opts.matched} of ${opts.total} skills` : '';
  sendEmailFireAndForget({
    to: opts.to,
    subject: `New applicant for ${opts.jobTitle}: ${opts.candidateName}`,
    type: 'job_application_alert',
    html: shell(`
<h1 style="font-size:20px;margin:0 0 8px">New applicant for ${esc(opts.jobTitle)}</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.6"><strong>${esc(opts.candidateName)}</strong> applied via ${esc(opts.source)}${esc(match)}.</p>
<p style="margin:0 0 24px">${button(link, 'Review candidate')}</p>
<p style="margin:0;font-size:13px;color:#6b7280">Candidates who hear back within 2 days are far more likely to accept an offer.</p>`),
  });
}
