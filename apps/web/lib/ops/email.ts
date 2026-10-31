import { prisma } from '@udyaibase/database';
import { emailUsage } from '@udyaibase/database/ops';
import { opsAlert } from '@/lib/ops/alert';

export { emailLimits, emailUsage } from '@udyaibase/database/ops';

export async function checkEmailUsage() {
  const u = await emailUsage();
  if (u.sent24h >= u.limits.daily * 0.8) {
    await opsAlert('email-daily', `Emails: ${u.sent24h} sent in 24 hours (daily limit ${u.limits.daily})`, [
      `This month: ${u.sentMonth} of ${u.limits.monthly}.`, 'Past the limit, Resend rejects emails (sign-in codes, tickets, invoices). Upgrade the Resend plan or raise RESEND_DAILY_LIMIT if you already did.',
    ], 12);
  }
  if (u.sentMonth >= u.limits.monthly * 0.8) {
    await opsAlert('email-monthly', `Emails: ${u.sentMonth} sent this month (monthly limit ${u.limits.monthly})`, ['Upgrade the Resend plan before the limit, or set RESEND_MONTHLY_LIMIT to your plan.'], 24);
  }
  const attempted = u.failed24h + u.sent24h;
  if (attempted >= 20 && u.failed24h / attempted >= 0.1) {
    const recent = await prisma.emailLog.findMany({ where: { status: 'failed', sentAt: { gte: new Date(Date.now() - 864e5) } }, orderBy: { sentAt: 'desc' }, take: 3, select: { type: true, error: true } });
    await opsAlert('email-failures', `${u.failed24h} emails failed in the last 24 hours`, recent.map((r) => `${r.type}: ${r.error ?? 'unknown error'}`));
  }
  return u;
}

export { isQuotaError } from '@/lib/email/quota';
