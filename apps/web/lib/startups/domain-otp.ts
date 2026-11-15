import crypto from 'crypto';
import { accountCodeRateLimit, checkRateLimit, emailCodeAllowed, recipientCodeRateLimit } from '@/lib/rate-limit';
import { sql } from '@/lib/db';
import { sendEmail } from '@/lib/email/send';
import { checkEmailCode, hashOtp } from '@/lib/otp';

const COOLDOWN_SECONDS = 60;
const CODE_TTL_MINUTES = 10;

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

type Result = { ok: true; cooldown?: number } | { ok: false; error: string; status: number; retryAfter?: number };

/** Sends a 6-digit code to a work email to prove control of a startup's domain. */
export async function sendDomainCode(opts: {
  email: string; purpose: string; startupName: string; requester: string;
  /** Replaces the default subject/heading/intro (used for confirming a contact email). Plain text; escaped here. */
  copy?: { subject: string; heading: string; intro: string };
  /** Who is asking (e.g. "founder:<id>"): capped at 10 codes an hour across every address they try. */
  account?: string;
}): Promise<Result> {
  const { email, purpose } = opts;
  if (opts.account) {
    const { success } = await checkRateLimit(accountCodeRateLimit, `acct:${opts.account}`);
    if (!success) return { ok: false, status: 429, error: 'You’ve requested a lot of codes. Please try again in an hour.' };
  }
  // Per inbox across every account and purpose: five accounts can't take turns flooding one address.
  const { success: inboxOk } = await checkRateLimit(recipientCodeRateLimit, `rcpt:${email.trim().toLowerCase()}`);
  if (!inboxOk) return { ok: false, status: 429, error: 'This address has received several codes in the last hour. Try again later.' };
  if (!(await emailCodeAllowed(email, purpose))) {
    return { ok: false, status: 429, error: 'Too many codes requested for this email. Try again in 15 minutes.' };
  }
  const recent = await sql`
    SELECT EXTRACT(EPOCH FROM (NOW() - "createdAt"))::int AS age FROM "EmailOtp"
    WHERE email = ${email} AND purpose = ${purpose} ORDER BY "createdAt" DESC LIMIT 1
  `;
  const age = (recent[0] as { age: number } | undefined)?.age;
  if (age !== undefined && age < COOLDOWN_SECONDS) {
    const retryAfter = COOLDOWN_SECONDS - age;
    return { ok: false, status: 429, retryAfter, error: `Please wait ${retryAfter} seconds before requesting another code.` };
  }

  const code = crypto.randomInt(100000, 1000000).toString();
  const hashed = hashOtp(code);
  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000);
  await sql`DELETE FROM "EmailOtp" WHERE email = ${email} AND purpose = ${purpose}`;
  await sql`
    INSERT INTO "EmailOtp" (id, email, code, purpose, "expiresAt", "createdAt")
    VALUES (gen_random_uuid()::text, ${email}, ${hashed}, ${purpose}, ${expiresAt.toISOString()}::timestamp, NOW())
  `;

  const sent = await sendEmail({
    to: email,
    subject: opts.copy?.subject ?? `Your code to verify ${opts.startupName} on Udyaibase`,
    type: 'otp',
    html: `<!doctype html><html><body style="margin:0;background:#F7F7F9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#111827">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#fff;border:1px solid #e5e7eb;border-radius:14px"><tr><td style="padding:32px">
<h1 style="font-size:20px;margin:0 0 8px">${esc(opts.copy?.heading ?? `Verify ${opts.startupName}`)}</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#374151">${opts.copy ? esc(opts.copy.intro) : `${esc(opts.requester)} asked to verify ownership of ${esc(opts.startupName)} on Udyaibase. Enter this code to confirm you work there:`}</p>
<p style="margin:0 0 20px;font-size:32px;font-weight:700;letter-spacing:8px">${code}</p>
<p style="margin:0;font-size:13px;color:#6b7280">The code expires in ${CODE_TTL_MINUTES} minutes. If you didn't request this, ignore this email; nothing changes without the code.</p>
</td></tr></table></td></tr></table></body></html>`,
  });
  if (!sent.success) {
    await sql`DELETE FROM "EmailOtp" WHERE email = ${email} AND purpose = ${purpose}`;
    return { ok: false, status: 502, error: "We couldn't send the code right now. Please try again in a few minutes." };
  }
  return { ok: true, cooldown: COOLDOWN_SECONDS };
}

/** Checks a code from sendDomainCode: 3 attempts, used once. The check itself is shared with every other code flow. */
export async function checkDomainCode(opts: { email: string; purpose: string; code: string }): Promise<Result> {
  const r = await checkEmailCode(opts.email, opts.purpose, opts.code, { whenSpent: 'delete' });
  if (r.ok) return { ok: true };
  if (r.reason === 'locked') return { ok: false, status: 429, error: 'Too many attempts. Request a new code.' };
  if (r.reason === 'wrong') return { ok: false, status: 400, error: `Invalid code. ${r.left} attempt${r.left === 1 ? '' : 's'} remaining.` };
  return { ok: false, status: 400, error: 'Code expired or not found. Request a new one.' };
}
