import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { setListingStatus } from '@/lib/jobs/listing-status';
import { deleteResume } from '@/lib/jobs/resume-storage';
import { runPlanMaintenance } from '@/lib/employer/billing';
import { runHiringMaintenance } from '@/lib/employer/lifecycle';
import { runHostPlanMaintenance } from '@/lib/events/billing';
import { expireTicketHolds } from '@/lib/events/tickets';
import { trackCronRoute } from '@/lib/ops/cron';
import { sizePendingLogos } from '@/lib/media/logo-sizes';
import { refreshPaths, refreshSections } from '@/lib/revalidate';
import { sendPendingCreditNotes, sendPendingInvoices } from '@/lib/billing/invoice';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return trackCronRoute('data-retention', () => runCleanup(request));
}

export async function POST(request: NextRequest) {
  return trackCronRoute('data-retention', () => runCleanup(request));
}

async function runCleanup(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const now = new Date();
    const results: Record<string, number> = {};

    // Email logs older than 90 days
    const emailLogCutoff = new Date(now);
    emailLogCutoff.setDate(emailLogCutoff.getDate() - 90);
    const emailLogs = await prisma.emailLog.deleteMany({
      where: { sentAt: { lt: emailLogCutoff } },
    });
    results.emailLogsDeleted = emailLogs.count;

    // Monitoring history: job runs 90 days, AI call records 180 days (cost trends).
    results.cronRunsDeleted = (await prisma.opsCronRun.deleteMany({ where: { startedAt: { lt: new Date(now.getTime() - 90 * 864e5) } } })).count;
    results.aiCallsDeleted = (await prisma.opsAiCall.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 180 * 864e5) } } })).count;

    // Cached pages show jobs and events as of when they were built: drop expired jobs and past events daily.
    refreshSections(['jobs', 'events', 'home']);

    // Invoices for paid payments not emailed yet (manual admin grants, or a send that failed).
    try { results.invoicesSent = await sendPendingInvoices(50); } catch (err) { console.error('[data-retention] invoices', err); }
    try { results.creditNotesSent = await sendPendingCreditNotes(50); } catch (err) { console.error('[data-retention] credit notes', err); }

    // New logos get their ready-made sizes (64/128/256 WebP) so Cloudflare serves small files.
    try {
      const sizing = await sizePendingLogos(150);
      results.logosSized = sizing.sized;
      if (sizing.rowsUpdated) refreshSections(['startups', 'tools', 'home']);
    } catch (err) {
      console.error('[data-retention] logo sizing failed', err);
    }

    // Soft-deleted event registrations older than 30 days
    const softDeleteCutoff = new Date(now);
    softDeleteCutoff.setDate(softDeleteCutoff.getDate() - 30);
    const softDeletedRegs = await prisma.eventRegistration.findMany({
      where: { deletedAt: { lt: softDeleteCutoff } },
      select: { id: true },
    });
    if (softDeletedRegs.length > 0) {
      const regIds = softDeletedRegs.map(r => r.id);
      await prisma.eventRegistrationAnswer.deleteMany({
        where: { registrationId: { in: regIds } },
      });
      const deleted = await prisma.eventRegistration.deleteMany({
        where: { id: { in: regIds } },
      });
      results.softDeletedRegistrationsHardDeleted = deleted.count;
    }

    // Expired sessions older than 30 days (all user types)
    const sessionCutoff = new Date(now);
    sessionCutoff.setDate(sessionCutoff.getDate() - 30);
    const founderSessions = await prisma.founderSession.deleteMany({
      where: { expiresAt: { lt: sessionCutoff } },
    });
    const webUserSessions = await prisma.webUserSession.deleteMany({
      where: { expiresAt: { lt: sessionCutoff } },
    });
    const organizerSessions = await prisma.eventOrganizerSession.deleteMany({
      where: { expiresAt: { lt: sessionCutoff } },
    });
    results.expiredSessionsDeleted = founderSessions.count + webUserSessions.count + organizerSessions.count;

    // Unsubscribe records older than 1 year (keep audit trail for 12 months)
    const unsubCutoff = new Date(now);
    unsubCutoff.setFullYear(unsubCutoff.getFullYear() - 1);
    const unsubs = await prisma.newsletterUnsubscribe.deleteMany({
      where: { unsubscribedAt: { lt: unsubCutoff } },
    });
    results.oldUnsubscribeRecordsDeleted = unsubs.count;

    // Unverified newsletter subscribers older than 7 days (never confirmed)
    const unverifiedCutoff = new Date(now);
    unverifiedCutoff.setDate(unverifiedCutoff.getDate() - 7);
    const unverified = await prisma.newsletterSubscriber.deleteMany({
      where: {
        emailVerified: false,
        isActive: false,
        subscribedAt: { lt: unverifiedCutoff },
      },
    });
    results.unverifiedSubscribersDeleted = unverified.count;

    // Job listings past their closing date. Public pages already hide them via
    // publicListingCondition(); this only keeps dashboards and status in step.
    const expired = await prisma.jobBoardListing.findMany({
      where: { status: 'OPEN', expiresAt: { lte: now }, deletedAt: null },
      select: { id: true },
    });
    results.expiredListingsClosed = await setListingStatus(expired.map(l => l.id), 'CLOSED', 'EXPIRED');

    // Resumes uploaded but never submitted: deleted within 24 hours (promised in the apply consent text).
    const orphanCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const orphans = await prisma.jobBoardResumeUpload.findMany({
      where: { applicationId: null, createdAt: { lt: orphanCutoff } },
      select: { id: true, key: true },
      take: 500,
    });
    let orphansDeleted = 0;
    for (const o of orphans) {
      try {
        await deleteResume(o.key);
        await prisma.jobBoardResumeUpload.delete({ where: { id: o.id } });
        orphansDeleted++;
      } catch (err) {
        console.error('Orphan resume cleanup failed:', o.id, err instanceof Error ? err.message : err);
      }
    }
    results.orphanResumesDeleted = orphansDeleted;

    // Employer plans: reminders, lapses, featured placement.
    Object.assign(results, await runPlanMaintenance(now));
    // Hiring nudges and candidate data retention (DPDP).
    Object.assign(results, await runHiringMaintenance(now));
    // Event host plans: reminders and lapses.
    Object.assign(results, await runHostPlanMaintenance(now));
    // Unpaid ticket holds (they stop counting after 15 minutes anyway; this tidies their status).
    Object.assign(results, await expireTicketHolds(now));

    // Audit logs older than 1 year
    const auditCutoff = new Date(now);
    auditCutoff.setFullYear(auditCutoff.getFullYear() - 1);
    const auditLogs = await prisma.auditLog.deleteMany({
      where: { createdAt: { lt: auditCutoff } },
    });
    results.auditLogsDeleted = auditLogs.count;

    return NextResponse.json({
      success: true,
      message: 'Data retention cleanup completed',
      results,
      executedAt: now.toISOString(),
    });
  } catch (error) {
    console.error('Data retention cleanup error:', error);
    return NextResponse.json(
      { success: false, error: 'Cleanup failed' },
      { status: 500 }
    );
  }
}
