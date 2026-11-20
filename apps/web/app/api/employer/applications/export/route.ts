import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { stageOf, PIPELINE } from '@/lib/employer/pipeline';
import { computeMatch } from '@/lib/jobs/match';
import { employerActor, logEmployerActivity } from '@/lib/workspace-activity';
import { checkRateLimit } from '@/lib/rate-limit';
import { candidateExportRateLimit } from '@/lib/event-rate-limit';
import { employerApi } from '@/lib/employer/api-session';

export const dynamic = 'force-dynamic';

const AI_LABEL: Record<string, string> = { shortlist: 'Shortlist', consider: 'Worth a look', weak: 'Weak fit' };

const PAGE = 500;
const MAX_ROWS = 5000;
const HEADER = ['Name', 'Email', 'Phone', 'Job', 'Stage', 'Applied', 'Source', 'Current role', 'Current company', 'City',
  'Experience (years)', 'Notice (days)', 'Expected CTC (₹ L)', 'Match score', 'Needs check', 'AI fit', 'AI suggestion', 'Skills matched', 'Skills', 'LinkedIn', 'GitHub', 'Portfolio', 'Screening answers', 'Resume'];

/** Cells starting with = + - @ would run as formulas in Excel/Sheets. */
function cell(v: unknown): string {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV of candidates (optionally one job / selected ids). Resumes stay in the portal. */
export async function GET(request: NextRequest) {
  const guard = await employerApi('candidates.export');
  if (guard.error) return guard.error;
  const session = guard.session;
  const { success } = await checkRateLimit(candidateExportRateLimit, `export:${session.id}`);
  if (!success) return NextResponse.json({ error: 'You’ve exported a lot this hour. Try again later.' }, { status: 429 });

  const job = request.nextUrl.searchParams.get('job') || undefined;
  const ids = request.nextUrl.searchParams.get('ids')?.split(',').filter(Boolean).slice(0, 2000);
  const where = { Listing: { employerId: session.id }, ...(job ? { listingId: job } : {}), ...(ids?.length ? { id: { in: ids } } : {}), NOT: { email: { endsWith: '@deleted.invalid' } } };
  const label = (s: string) => PIPELINE.find((p) => p.key === stageOf(s))?.label ?? s;

  /** One page of candidates, newest first, starting after `cursor`. */
  const page = (cursor: string | null) => prisma.jobBoardApplication.findMany({
    where,
    orderBy: [{ appliedAt: 'desc' }, { id: 'desc' }],
    take: PAGE,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: { Listing: { select: {
      title: true, skills: true, mustHaveSkills: true, experienceMin: true, experienceMax: true, workType: true, city: true,
      salaryMax: true, salaryCurrency: true, maxNoticeDays: true, screeningQuestions: true,
    } }, AiScreening: { select: { status: true, fitScore: true, recommendation: true } } },
  });
  type Row = Awaited<ReturnType<typeof page>>[number];
  const line = (a: Row) => { const m = computeMatch(a.Listing, a); return [
    a.fullName, a.email, a.phone, a.Listing.title, a.withdrawnAt ? 'Withdrawn' : label(a.status), a.appliedAt.toISOString().slice(0, 10),
    a.source, a.currentTitle, a.currentCompany, a.city, a.experienceYears, a.noticePeriodDays, a.expectedCtcLakh, m.score, m.knockedOut ? 'Yes' : '',
    a.AiScreening?.status === 'DONE' ? a.AiScreening.fitScore : '', a.AiScreening?.status === 'DONE' ? AI_LABEL[a.AiScreening.recommendation ?? ''] ?? '' : '',
    `${a.matchedSkills.length}/${a.Listing.skills.length}`, a.confirmedSkills.join('; '), a.linkedinUrl, a.githubUrl, a.portfolioUrl,
    (Array.isArray(a.screeningAnswers) ? a.screeningAnswers as { question: string; answer: string }[] : []).map((q) => `${q.question}: ${q.answer}`).join(' | '),
    a.resumeKey || a.resumeUrl ? 'Available in the Udyaibase portal' : '',
  ].map(cell).join(','); };

  // The first page is read before answering, so a failure is a proper error and not half a file.
  let rows: Row[];
  try {
    rows = await page(null);
  } catch (e) {
    console.error('[GET /api/employer/applications/export]', e instanceof Error ? e.message : 'unknown error');
    return NextResponse.json({ error: 'We couldn’t build the export. Please try again.' }, { status: 500 });
  }

  // The rest is written a page at a time, so memory stays at one page however many candidates there are
  // (it used to hold up to 5,000 with their jobs and reviews at once).
  const encoder = new TextEncoder();
  const actor = employerActor(session);
  let sent = 0;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('\uFEFF' + HEADER.map(cell).join(',')));
    },
    async pull(controller) {
      try {
        for (const a of rows) { if (sent >= MAX_ROWS) break; controller.enqueue(encoder.encode('\r\n' + line(a))); sent++; }
        const more = rows.length === PAGE && sent < MAX_ROWS;
        if (more) { rows = await page(rows[rows.length - 1].id); return; }
        // Candidates' personal data left the portal: always worth a record.
        await logEmployerActivity(session.id, 'applications_exported', { actor, request, metadata: { count: String(sent) } }).catch(() => {});
        controller.close();
      } catch (e) {
        console.error('[GET /api/employer/applications/export] stopped part-way:', e instanceof Error ? e.message : 'unknown error');
        controller.error(e);
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="candidates-${new Date().toISOString().slice(0, 10)}.csv"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
