import crypto from 'crypto';
import { sql } from '@/lib/db';
import { sendEmail } from '@/lib/email/send';

const COOLDOWN_SECONDS = 60;
const CODE_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 3;

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

type Result = { ok: true; cooldown?: number } | { ok: false; error: string; status: number; retryAfter?: number };

/** Sends a 6-digit code to a work email to prove control of a startup's domain. */
export async function sendDomainCode(opts: { email: string; purpose: string; startupName: string; requester: string }): Promise<Result> {
  const { email, purpose } = opts;
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
  const hashed = crypto.createHash('sha256').update(code).digest('hex');
  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000);
  await sql`DELETE FROM "EmailOtp" WHERE email = ${email} AND purpose = ${purpose}`;
  await sql`
    INSERT INTO "EmailOtp" (id, email, code, purpose, "expiresAt", "createdAt")
    VALUES (gen_random_uuid()::text, ${email}, ${hashed}, ${purpose}, ${expiresAt.toISOString()}::timestamp, NOW())
  `;

  const sent = await sendEmail({
    to: email,
    subject: `Your code to verify ${opts.startupName} on Udyaibase`,
    type: 'otp',
    html: `<!doctype html><html><body style="margin:0;background:#F7F7F9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#111827">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#fff;border:1px solid #e5e7eb;border-radius:14px"><tr><td style="padding:32px">
<h1 style="font-size:20px;margin:0 0 8px">Verify ${esc(opts.startupName)}</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#374151">${esc(opts.requester)} asked to verify ownership of ${esc(opts.startupName)} on Udyaibase. Enter this code to confirm you work there:</p>
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

/** Checks a code from sendDomainCode. Burns the code on success; allows 3 attempts. */
export async function checkDomainCode(opts: { email: string; purpose: string; code: string }): Promise<Result> {
  const { email, purpose, code } = opts;
  const rows = await sql`
    SELECT id, attempts, code FROM "EmailOtp"
    WHERE email = ${email} AND purpose = ${purpose} AND verified = false AND "expiresAt" > NOW()
    ORDER BY "createdAt" DESC LIMIT 1
  `;
  const otp = rows[0] as { id: string; attempts: number; code: string } | undefined;
  if (!otp) return { ok: false, status: 400, error: 'Code expired or not found. Request a new one.' };
  if (otp.attempts >= MAX_ATTEMPTS) {
    await sql`DELETE FROM "EmailOtp" WHERE id = ${otp.id}`;
    return { ok: false, status: 429, error: 'Too many attempts. Request a new code.' };
  }
  await sql`UPDATE "EmailOtp" SET attempts = attempts + 1 WHERE id = ${otp.id}`;
  const hashed = crypto.createHash('sha256').update(code).digest('hex');
  const match = otp.code.length === hashed.length && crypto.timingSafeEqual(Buffer.from(otp.code), Buffer.from(hashed));
  if (!match) {
    const left = MAX_ATTEMPTS - (otp.attempts + 1);
    return { ok: false, status: 400, error: `Invalid code. ${left} attempt${left === 1 ? '' : 's'} remaining.` };
  }
  await sql`UPDATE "EmailOtp" SET verified = true WHERE id = ${otp.id}`;
  return { ok: true };
}
