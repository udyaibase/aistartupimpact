import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { readResume, resumeDownloadUrl } from '@/lib/jobs/resume-storage';
import { can, listingScope } from '@/lib/employer/permissions';
import { employerApi } from '@/lib/employer/api-session';

export const dynamic = 'force-dynamic';

/**
 * A candidate's resume, for the hiring team only (ownership check first).
 *
 * - `?view=1`: the PDF streamed from this route with `inline`, so it shows inside the candidate panel. It's served
 *   from our own origin because the page may only frame itself (next.config.mjs relaxes framing for this path to
 *   same-origin). Word files can't be shown by browsers, so view mode answers 415 and the page offers a download.
 * - Otherwise: a download (a storage link valid for 5 minutes, or the file streamed in local development).
 */
export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const view = request.nextUrl.searchParams.get('view') === '1';
  const { id } = await props.params;
  const guard = await employerApi('candidates.view');
  if (guard.error) return guard.error;
  const session = guard.session;

  const app = await prisma.jobBoardApplication.findFirst({
    where: { id, Listing: listingScope(session) },
    select: { resumeKey: true, resumeUrl: true, fullName: true },
  });
  if (!app) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  // Applications from before private storage kept an external link.
  if (!app.resumeKey) {
    // The link came from the candidate, so only a plain https address is followed, and without a referrer.
    let external: URL | null = null;
    try { external = app.resumeUrl ? new URL(app.resumeUrl) : null; } catch { external = null; }
    if (external?.protocol !== 'https:' || external.username || external.password) return NextResponse.json({ error: 'No resume on file.' }, { status: 404 });
    return NextResponse.redirect(external, { headers: { 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'private, no-store' } });
  }

  const ext = app.resumeKey.split('.').pop() === 'docx' ? 'docx' : 'pdf';
  const filename = `${app.fullName.replace(/[^\w ]/g, '').trim() || 'Candidate'} resume.${ext}`;
  const noStore = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' };
  if (view && ext !== 'pdf') return NextResponse.json({ error: 'Word files can’t be previewed. Download it instead.' }, { status: 415 });

  if (!view) {
    const signed = await resumeDownloadUrl(app.resumeKey, filename);
    if (signed) return NextResponse.redirect(signed, { headers: noStore });
  }

  const bytes = await readResume(app.resumeKey).catch(() => null);
  if (!bytes) return NextResponse.json({ error: 'Resume not found.' }, { status: 404 });
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      ...noStore,
      'Content-Type': ext === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      // Viewing shows it in the page; otherwise the browser saves it.
      'Content-Disposition': `${view ? 'inline' : 'attachment'}; filename="${filename}"`,
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
