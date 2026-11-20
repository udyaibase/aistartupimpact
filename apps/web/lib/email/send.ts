import { Resend } from 'resend';
import { isQuotaError } from '@/lib/email/quota';

let resendClient: Resend | null = null;

export function getResend(): Resend | null {
  if (!resendClient && process.env.RESEND_API_KEY) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'no-reply@udyaibase.com';
const FROM_NAME = process.env.RESEND_FROM_NAME || 'Udyaibase';

interface SendEmailOptions {
  to: string;
  cc?: string[];
  subject: string;
  html: string;
  from?: string;
  headers?: Record<string, string>;
  replyTo?: string;
  tags?: Array<{ name: string; value: string }>;
  attachments?: Array<{ filename: string; content: Buffer | string; contentType?: string }>;
  type?: string;
  /** ISO time to deliver later (Resend scheduled send). */
  scheduledAt?: string;
}

interface SendResult {
  success: boolean;
  resendId?: string;
  error?: string;
}

async function logEmail(opts: { type: string; to: string; subject: string; status: string; resendId?: string; error?: string }) {
  try {
    const { prisma } = await import('@udyaibase/database');
    await prisma.$executeRaw`
      INSERT INTO "EmailLog" (id, type, "to", subject, status, "resendId", error, "sentAt")
      VALUES (gen_random_uuid(), ${opts.type}, ${opts.to}, ${opts.subject}, ${opts.status}, ${opts.resendId || null}, ${opts.error || null}, NOW())
    `;
  } catch (err) {
    console.error('Failed to log email:', err);
  }
}

/**
 * Reserved test domains (RFC 2606/6761) used by the dev seed data: never sent, since they can't receive mail and
 * bounces hurt our sending reputation. In local development the message is printed to the server log instead, so
 * sign-in codes and links for seeded accounts can still be used.
 */
export function isTestAddress(to: string): boolean {
  const domain = to.trim().toLowerCase().split('@').pop() ?? '';
  return /\.(test|invalid|example|localhost)$/.test(domain) || /(^|\.)example\.(com|org|net)$/.test(domain);
}

/** One log line's worth of a value: no line breaks, so it can't fake extra log entries. */
export const logSafe = (value: unknown): string => String(value ?? '').replace(/[\r\n\u2028\u2029]+/g, ' ').slice(0, 300);

/** Readable text of an email for the dev log: style blocks dropped (without a backtracking regex), tags removed. */
export function emailLogText(html: string): string {
  const lower = html.toLowerCase();
  let out = '';
  let i = 0;
  while (i < html.length) {
    const start = lower.indexOf('<style', i);
    if (start === -1) { out += html.slice(i); break; }
    out += html.slice(i, start);
    const end = lower.indexOf('</style>', start);
    i = end === -1 ? html.length : end + '</style>'.length;
  }
  return out.replace(/<[^>]*>/g, ' ').replace(/[<>]/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

function skipTestEmail(opts: { to: string; subject: string; html: string; type?: string }): SendResult {
  if (process.env.NODE_ENV !== 'production') {
    const text = emailLogText(opts.html);
    console.info(`[email:test-inbox] to=${logSafe(opts.to)} type=${logSafe(opts.type || 'unknown')}\n  subject: ${logSafe(opts.subject)}\n  ${logSafe(text.slice(0, 600))}`);
  }
  logEmail({ type: opts.type || 'unknown', to: opts.to, subject: opts.subject, status: 'skipped_test_address' });
  return { success: true };
}

export async function sendEmail(opts: SendEmailOptions): Promise<SendResult> {
  if (isTestAddress(opts.to)) return skipTestEmail(opts);
  const client = getResend();
  if (!client) {
    console.warn('Resend API key not configured, skipping email send');
    return { success: false, error: 'Resend not configured' };
  }

  try {
    const { data, error } = await client.emails.send({
      from: opts.from || `${FROM_NAME} <${FROM_EMAIL}>`,
      to: opts.to,
      ...(opts.cc?.length && { cc: opts.cc }),
      subject: opts.subject,
      html: opts.html,
      ...(opts.headers && { headers: opts.headers }),
      ...(opts.replyTo && { replyTo: opts.replyTo }),
      ...(opts.tags && { tags: opts.tags }),
      ...(opts.attachments && { attachments: opts.attachments }),
      ...(opts.scheduledAt && { scheduledAt: opts.scheduledAt }),
    });

    if (error) {
      console.error('Email send failed:', opts.type || 'unknown', error);
      logEmail({ type: opts.type || 'unknown', to: opts.to, subject: opts.subject, status: 'failed', error: error.message });
      if (isQuotaError(error.message) && opts.type !== 'ops_alert') {
        void import('@/lib/ops/alert').then(({ opsAlert }) => opsAlert('email-quota', 'Resend is rejecting emails (limit reached)', [`Error: ${error.message}`, `Email type: ${opts.type || 'unknown'}`, 'Sign-in codes, tickets and invoices may not be arriving. Check the Resend dashboard and plan.'])).catch(() => {});
      }
      return { success: false, error: error.message };
    }

    logEmail({ type: opts.type || 'unknown', to: opts.to, subject: opts.subject, status: 'sent', resendId: data?.id });
    return { success: true, resendId: data?.id };
  } catch (err: any) {
    console.error('Email send error:', opts.type || 'unknown', err);
    logEmail({ type: opts.type || 'unknown', to: opts.to, subject: opts.subject, status: 'failed', error: err.message });
    return { success: false, error: err.message };
  }
}

export async function sendEmailWithRetry(
  opts: SendEmailOptions,
  maxAttempts = 3
): Promise<SendResult> {
  const delays = [1000, 3000, 9000];

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const result = await sendEmail(opts);
    if (result.success) return result;

    if (attempt < maxAttempts - 1) {
      await new Promise(resolve => setTimeout(resolve, delays[attempt]));
    } else {
      return result;
    }
  }

  return { success: false, error: 'Max retries exceeded' };
}

export function sendEmailFireAndForget(opts: SendEmailOptions): void {
  sendEmail(opts).catch(err => console.error('Fire-and-forget email error:', err));
}

/**
 * Sends up to 100 emails in one Resend call. `idempotencyKey` makes retries safe:
 * Resend ignores a repeated key, so a timed-out request never sends twice.
 * Returns one result per input, in order.
 */
export async function sendEmailBatch(
  items: Array<Omit<SendEmailOptions, 'attachments'>>,
  opts: { idempotencyKey?: string } = {},
): Promise<SendResult[]> {
  const client = getResend();
  if (!client) return items.map(() => ({ success: false, error: 'Resend not configured' }));
  if (items.length === 0) return [];
  if (items.length > 100) throw new Error('sendEmailBatch: max 100 emails per call');

  // Seed/test addresses are skipped; the rest go out as one batch and results keep the original order.
  if (items.some((o) => isTestAddress(o.to))) {
    const real = items.filter((o) => !isTestAddress(o.to));
    const sent = real.length ? await sendEmailBatch(real, opts) : [];
    let j = 0;
    return items.map((o) => (isTestAddress(o.to) ? skipTestEmail(o) : sent[j++]));
  }

  try {
    const { data, error } = await client.batch.send(
      items.map((o) => ({
        from: o.from || `${FROM_NAME} <${FROM_EMAIL}>`,
        to: o.to,
        subject: o.subject,
        html: o.html,
        ...(o.headers && { headers: o.headers }),
        ...(o.replyTo && { replyTo: o.replyTo }),
        ...(o.tags && { tags: o.tags }),
        ...(o.scheduledAt && { scheduledAt: o.scheduledAt }),
      })),
      opts.idempotencyKey ? { idempotencyKey: opts.idempotencyKey } : undefined,
    );
    if (error) {
      console.error('Batch email failed:', error);
      if (isQuotaError(error.message)) {
        void import('@/lib/ops/alert').then(({ opsAlert }) => opsAlert('email-quota', 'Resend is rejecting emails (limit reached)', [`Error: ${error.message}`, `Batch of ${items.length} emails`])).catch(() => {});
      }
      items.forEach((o) => logEmail({ type: o.type || 'unknown', to: o.to, subject: o.subject, status: 'failed', error: error.message }));
      return items.map(() => ({ success: false, error: error.message }));
    }
    const ids = (data as { data?: { id: string }[] } | null)?.data ?? [];
    items.forEach((o, i) => logEmail({ type: o.type || 'unknown', to: o.to, subject: o.subject, status: 'sent', resendId: ids[i]?.id }));
    return items.map((_, i) => ({ success: true, resendId: ids[i]?.id }));
  } catch (err: any) {
    console.error('Batch email error:', err);
    return items.map(() => ({ success: false, error: err.message }));
  }
}
