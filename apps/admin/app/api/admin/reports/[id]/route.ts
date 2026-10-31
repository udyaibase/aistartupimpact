import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@udyaibase/database";
import { sendEmailFireAndForget } from "@/lib/email-send";
import { withPublicRefresh } from '@/lib/refresh-public';

async function putHandler(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session: any = await getServerSession(authOptions);
  if (!session?.user || !["SUPER_ADMIN", "EDITOR_IN_CHIEF"].includes(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { status, adminNotes, jobAction } = await request.json();

  // Job reports: close the job, or release a moderation hold. Resolves every open report on that job.
  if (jobAction === 'close' || jobAction === 'release') {
    const report = await prisma.contentReport.findUnique({ where: { id: params.id } });
    if (!report || report.entityType !== 'JOB') return NextResponse.json({ error: "Not a job report" }, { status: 400 });
    const now = new Date();
    if (jobAction === 'close') {
      const job = await prisma.jobBoardListing.update({
        where: { id: report.entityId },
        data: { status: 'CLOSED', isActive: false, closedAt: now, closeReason: 'MANUAL', moderationHold: false },
        select: { title: true, publishedByEmail: true, Employer: { select: { email: true, passwordHash: true } } },
      });
      // Tell the workspace owner (and whoever published it) why; placeholder workspaces have no inbox.
      const to = Array.from(new Set([job.Employer.passwordHash !== '' ? job.Employer.email : null, job.publishedByEmail].filter(Boolean) as string[]));
      if (to.length) {
        const site = (process.env.NEXT_PUBLIC_WEB_URL || 'https://udyaibase.com').replace(/\/$/, '');
        const esc = (t: string) => t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
        for (const recipient of to) sendEmailFireAndForget({
          to: recipient,
          type: 'job_closed_by_moderation',
          subject: `We closed “${job.title}” after review`,
          html: `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2937;max-width:560px;margin:0 auto;padding:24px">
<h1 style="font-size:20px;margin:0 0 8px">Your job “${esc(job.title)}” was closed</h1>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6">Several people reported this job, and after reviewing it our team closed it. It no longer appears on Udyaibase and can’t receive applications. Candidates who already applied are still in your portal.</p>
${adminNotes ? `<p style="margin:0 0 16px;font-size:15px;line-height:1.6"><strong>Reason:</strong> ${esc(String(adminNotes).slice(0, 500))}</p>` : ''}
<p style="margin:0 0 16px;font-size:15px;line-height:1.6">If you think this was a mistake, reply to this email or write to contact@udyaibase.com and we’ll take another look.</p>
<p style="margin:0"><a href="${site}/employer/jobs" style="color:#A50F15">Go to your jobs</a></p>
</div>`,
        });
      }
    } else {
      const listing = await prisma.jobBoardListing.findUnique({ where: { id: report.entityId }, select: { status: true } });
      await prisma.jobBoardListing.update({
        where: { id: report.entityId },
        data: { moderationHold: false, moderationHoldAt: null, isActive: listing?.status === 'OPEN' },
      });
    }
    await prisma.contentReport.updateMany({
      where: { entityType: 'JOB', entityId: report.entityId, status: { in: ['PENDING', 'REVIEWING'] } },
      data: { status: jobAction === 'close' ? 'RESOLVED' : 'DISMISSED', resolvedAt: now, resolvedBy: session.user.id, adminNotes: adminNotes ?? undefined },
    });
    return NextResponse.json({ success: true });
  }

  await prisma.contentReport.update({
    where: { id: params.id },
    data: {
      status: status || undefined,
      adminNotes: adminNotes !== undefined ? adminNotes : undefined,
      resolvedAt: ["RESOLVED", "DISMISSED"].includes(status) ? new Date() : undefined,
      resolvedBy: ["RESOLVED", "DISMISSED"].includes(status) ? session.user.id : undefined,
    },
  });

  return NextResponse.json({ success: true });
}

export const PUT = withPublicRefresh(['jobs'], putHandler);
