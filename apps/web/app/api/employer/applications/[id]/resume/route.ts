import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { getEmployerSession } from '@/lib/employer-auth';
import { readResume, resumeDownloadUrl } from '@/lib/jobs/resume-storage';
import { can, forbidden, listingScope } from '@/lib/employer/permissions';

export const dynamic = 'force-dynamic';

/**
 * Opens a candidate's resume for the hiring team only: ownership check, then a link valid
 * for 5 minutes (or, in local development, the file streamed through this route).
 */
export async function GET(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await getEmployerSession();
  if (!session) return NextResponse.json({ error: 'Please log in again.' }, { status: 401 });
  if (!can(session.role, 'candidates.view')) return forbidden();

  const app = await prisma.jobBoardApplication.findFirst({
    where: { id, Listing: listingScope(session) },
    select: { resumeKey: true, resumeUrl: true, fullName: true },
  });
  if (!app) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  // Applications from before private storage kept an external link.
  if (!app.resumeKey) {
    return app.resumeUrl ? NextResponse.redirect(app.resumeUrl) : NextResponse.json({ error: 'No resume on file.' }, { status: 404 });
  }

  const ext = app.resumeKey.split('.').pop() === 'docx' ? 'docx' : 'pdf';
  const filename = `${app.fullName.replace(/[^\w ]/g, '').trim() || 'Candidate'} resume.${ext}`;
  const signed = await resumeDownloadUrl(app.resumeKey, filename);
  const noStore = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' };
  if (signed) return NextResponse.redirect(signed, { headers: noStore });

  const bytes = await readResume(app.resumeKey).catch(() => null);
  if (!bytes) return NextResponse.json({ error: 'Resume not found.' }, { status: 404 });
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      ...noStore,
      'Content-Type': ext === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `inline; filename="${filename}"`,
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
