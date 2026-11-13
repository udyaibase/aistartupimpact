import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { setListingStatus } from '@/lib/jobs/listing-status';
import { deleteResume } from '@/lib/jobs/resume-storage';
import { runPlanMaintenance } from '@/lib/employer/billing';
import { runHiringMaintenance } from '@/lib/employer/lifecycle';
import { runHostPlanMaintenance } from '@/lib/events/billing';
import { finishRecentlyApprovedEvents, processSuspendedEvents } from '@/lib/events/trust';
import { expireTicketHolds } from '@/lib/events/tickets';
import { refreshPendingPayouts } from '@/lib/events/payouts';
import { trackCronRoute } from '@/lib/ops/cron';
import { sizePendingLogos } from '@/lib/media/logo-sizes';
import { refreshPaths, refreshSections } from '@/lib/revalidate';
import { sendPendingCreditNotes, sendPendingInvoices } from '@/lib/billing/invoice';
import { refreshExchangeRates } from '@/lib/fx';
import { invalidateCache } from '@/lib/cache';
import { FUNDING_ROUNDS_KEY } from '@/lib/funding/rounds';

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
    // Events an admin approved: featured placement and the first-event free Boost (safe to repeat).
    results.approvedEventsFinished = await finishRecentlyApprovedEvents(now);
    // Organizers suspended by an admin: tell attendees of their cancelled events and refund paid tickets.
    results.suspendedEventsHandled = await processSuspendedEvents();
    // Unpaid ticket holds (they stop counting after 15 minutes anyway; this tidies their status).
    Object.assign(results, await expireTicketHolds(now));
    // Hosts waiting on Razorpay KYC review: re-check (fallback if the account webhook was missed).
    try { results.payoutsActivated = await refreshPendingPayouts(); } catch (err) { console.error('[data-retention] payouts', err); }
    // USD→INR: today's published rate (the full history on the first run), then funding rounds converted at their
    // announcement-date rate. A failure here never stops the rest of the job.
    try {
      const fx = await refreshExchangeRates();
      results.exchangeRatesAdded = fx.ratesAdded;
      results.fundingRoundsConverted = fx.roundsUpdated;
      if (fx.roundsUpdated > 0) await invalidateCache(FUNDING_ROUNDS_KEY).catch(() => {});
    } catch (err) { console.error('[data-retention] exchange rates', err); }

    // Audit logs older than 1 year
    const auditCutoff = new Date(now);
    auditCutoff.setFullYear(auditCutoff.getFullYear() - 1);
    const auditLogs = await prisma.auditLog.deleteMany({
      where: { createdAt: { lt: auditCutoff } },
    });
    results.auditLogsDeleted = auditLogs.count;

    // Founder security logs and domain-verification logs (they hold IP addresses): one year.
    results.founderActivityLogsDeleted = (await prisma.founderActivityLog.deleteMany({ where: { createdAt: { lt: auditCutoff } } })).count;
    // Employer and event-host workspace activity logs (IP addresses, masked emails): one year. Never block the rest
    // of the job (e.g. before the table's migration has run).
    results.workspaceActivityLogsDeleted = await prisma.workspaceActivityLog.deleteMany({ where: { createdAt: { lt: auditCutoff } } })
      .then((r) => r.count).catch((e) => { console.error('[data-retention] workspace activity', e); return 0; });
    // Past listing versions and closed review requests: one year, as the privacy policy says.
    results.listingVersionsDeleted = (await prisma.listingVersion.deleteMany({ where: { createdAt: { lt: auditCutoff } } })).count;
    results.closedEditsDeleted = (await prisma.listingPendingEdit.deleteMany({ where: { status: { not: 'PENDING' }, createdAt: { lt: auditCutoff } } })).count;
    results.verificationLogsDeleted = (await prisma.startupVerificationLog.deleteMany({ where: { createdAt: { lt: auditCutoff } } })).count;

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
