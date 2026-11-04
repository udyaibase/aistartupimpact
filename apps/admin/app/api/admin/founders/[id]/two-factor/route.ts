import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { requireApiAuth } from '@/lib/api-auth';
import { logAuditEvent } from '@/lib/audit-log';
import { notifyFounder } from '@/lib/founder-notify';
import { sendEmailFireAndForget } from '@/lib/email-send';

export const dynamic = 'force-dynamic';

/**
 * Account recovery: turns off a founder's two-factor sign-in when they've lost both their phone and backup codes.
 * Super Admins only, with a written reason, recorded in the audit log, and the founder is told by email in case it
 * wasn't them who asked.
 */
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { error } = await requireApiAuth(['SUPER_ADMIN']);
  if (error) return error;

  const { id } = await props.params;
  const body = await request.json().catch(() => ({}));
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (reason.length < 10) return NextResponse.json({ error: 'Say how you confirmed this person, in at least 10 characters.' }, { status: 400 });

  const founder = await prisma.founderUser.findUnique({ where: { id }, select: { email: true, name: true } });
  if (!founder) return NextResponse.json({ error: 'Founder not found.' }, { status: 404 });

  const { count } = await prisma.accountTwoFactor.deleteMany({ where: { email: founder.email.toLowerCase() } });
  if (count === 0) return NextResponse.json({ error: 'Two-factor sign-in is already off for this person.' }, { status: 409 });

  await prisma.founderActivityLog.create({ data: { founderId: id, action: '2fa_disabled', metadata: { by: 'admin' } } }).catch(() => undefined);
  await notifyFounder(id, { type: 'security', title: 'Two-factor sign-in was turned off', message: 'Our team turned it off after a recovery request. Turn it back on in Settings.', link: '/founder/settings' });
  sendEmailFireAndForget({
    to: founder.email,
    subject: 'Security alert: two-factor sign-in was turned off',
    html: `<p>Hi ${(founder.name || 'there').replace(/[<>&"']/g, '')},</p><p>Our team turned off two-factor sign-in on your Udyaibase account after a recovery request. If you didn’t ask for this, contact support@udyaibase.com straight away and change your password.</p>`,
    type: 'security_alert',
  });
  logAuditEvent({ action: 'UPDATE', resourceType: 'USER', resourceId: id, resourceName: 'Reset two-factor sign-in', after: { reason } });
  return NextResponse.json({ success: true });
}
