import { Resend } from 'resend';
import { publicError } from '@/lib/public-error';

let resendClient: Resend | null = null;

function getResend(): Resend | null {
  if (!resendClient && process.env.RESEND_API_KEY) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'no-reply@udyaibase.com';
const FROM_NAME = process.env.RESEND_FROM_NAME || 'Udyaibase';

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  from?: string;
  headers?: Record<string, string>;
  type?: string;
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

/** Reserved test domains used by dev seed data: never sent (see apps/web/lib/email/send.ts). */
function isTestAddress(to: string): boolean {
  const domain = to.trim().toLowerCase().split('@').pop() ?? '';
  return /\.(test|invalid|example|localhost)$/.test(domain) || /(^|\.)example\.(com|org|net)$/.test(domain);
}

export async function sendEmail(opts: SendEmailOptions): Promise<SendResult> {
  if (isTestAddress(opts.to)) {
    const oneLine = (v: unknown) => String(v ?? '').replace(/[\r\n\u2028\u2029]+/g, ' ').slice(0, 300);
    if (process.env.NODE_ENV !== 'production') console.info(`[email:test-inbox] to=${oneLine(opts.to)} subject: ${oneLine(opts.subject)}`);
    logEmail({ type: opts.type || 'unknown', to: opts.to, subject: opts.subject, status: 'skipped_test_address' });
    return { success: true };
  }
  const client = getResend();
  if (!client) {
    console.warn('Resend API key not configured, skipping email send');
    return { success: false, error: 'Resend not configured' };
  }

  try {
    const { data, error } = await client.emails.send({
      from: opts.from || `${FROM_NAME} <${FROM_EMAIL}>`,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      ...(opts.headers && { headers: opts.headers }),
    });

    if (error) {
      console.error(`Email send failed [${opts.subject}]:`, error);
      logEmail({ type: opts.type || 'unknown', to: opts.to, subject: opts.subject, status: 'failed', error: publicError(error) });
      return { success: false, error: publicError(error) };
    }

    logEmail({ type: opts.type || 'unknown', to: opts.to, subject: opts.subject, status: 'sent', resendId: data?.id });
    return { success: true, resendId: data?.id };
  } catch (err: any) {
    console.error(`Email send error [${opts.subject}]:`, err);
    logEmail({ type: opts.type || 'unknown', to: opts.to, subject: opts.subject, status: 'failed', error: publicError(err) });
    return { success: false, error: publicError(err) };
  }
}

export function sendEmailFireAndForget(opts: SendEmailOptions): void {
  sendEmail(opts).catch(err => console.error('Fire-and-forget email error:', err));
}
