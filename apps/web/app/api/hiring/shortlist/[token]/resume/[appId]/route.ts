import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';
import { applicationStatusRateLimit } from '@/lib/event-rate-limit';
import { readResume, resumeDownloadUrl } from '@/lib/jobs/resume-storage';
import { shareByToken } from '@/lib/employer/shortlist-share';

export const dynamic = 'force-dynamic';

/** Resume of a candidate on a shared shortlist: only while the link is on, and only for candidates it shows. */
export async function GET(request: NextRequest, props: { params: Promise<{ token: string; appId: string }> }) {
  const { success } = await checkRateLimit(applicationStatusRateLimit, `shortlist-resume:${getClientIdentifier(request)}`);
  if (!success) return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });
  const { token, appId } = await props.params;
  const share = await shareByToken(token);
  if (!share) return NextResponse.json({ error: 'This link has expired or was turned off.' }, { status: 410 });
  const app = await prisma.jobBoardApplication.findFirst({
    where: { id: appId, listingId: share.listingId, status: { in: ['SHORTLISTED', 'INTERVIEW'] }, withdrawnAt: null },
    select: { resumeKey: true, resumeUrl: true, fullName: true },
  });
  if (!app) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  if (!app.resumeKey) return app.resumeUrl ? NextResponse.redirect(app.resumeUrl) : NextResponse.json({ error: 'No resume on file.' }, { status: 404 });
  const ext = app.resumeKey.split('.').pop() === 'docx' ? 'docx' : 'pdf';
  const filename = `${app.fullName.replace(/[^\w ]/g, '').trim() || 'Candidate'} resume.${ext}`;
  const noStore = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' };
  const signed = await resumeDownloadUrl(app.resumeKey, filename);
  if (signed) return NextResponse.redirect(signed, { headers: noStore });
  const bytes = await readResume(app.resumeKey).catch(() => null);
  if (!bytes) return NextResponse.json({ error: 'Resume not found.' }, { status: 404 });
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      ...noStore,
      'Content-Type': ext === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
