import { NextRequest, NextResponse } from 'next/server';
import { getEmployerSession } from '@/lib/employer-auth';
import { prisma } from '@udyaibase/database';
import { stageOf, PIPELINE } from '@/lib/employer/pipeline';
import { can, forbidden } from '@/lib/employer/permissions';
import { computeMatch } from '@/lib/jobs/match';

export const dynamic = 'force-dynamic';

const AI_LABEL: Record<string, string> = { shortlist: 'Shortlist', consider: 'Worth a look', weak: 'Weak fit' };

/** Cells starting with = + - @ would run as formulas in Excel/Sheets. */
function cell(v: unknown): string {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV of candidates (optionally one job / selected ids). Resumes stay in the portal. */
export async function GET(request: NextRequest) {
  const session = await getEmployerSession();
  if (!session) return NextResponse.json({ error: 'Please log in again.' }, { status: 401 });
  if (!can(session.role, 'candidates.export')) return forbidden();

  const job = request.nextUrl.searchParams.get('job') || undefined;
  const ids = request.nextUrl.searchParams.get('ids')?.split(',').filter(Boolean).slice(0, 2000);
  const apps = await prisma.jobBoardApplication.findMany({
    where: { Listing: { employerId: session.id }, ...(job ? { listingId: job } : {}), ...(ids?.length ? { id: { in: ids } } : {}), NOT: { email: { endsWith: '@deleted.invalid' } } },
    orderBy: { appliedAt: 'desc' },
    take: 5000,
    include: { Listing: { select: {
      title: true, skills: true, mustHaveSkills: true, experienceMin: true, experienceMax: true, workType: true, city: true,
      salaryMax: true, salaryCurrency: true, maxNoticeDays: true, screeningQuestions: true,
    } }, AiScreening: { select: { status: true, fitScore: true, recommendation: true } } },
  });

  const header = ['Name', 'Email', 'Phone', 'Job', 'Stage', 'Applied', 'Source', 'Current role', 'Current company', 'City',
    'Experience (years)', 'Notice (days)', 'Expected CTC (₹ L)', 'Match score', 'Needs check', 'AI fit', 'AI suggestion', 'Skills matched', 'Skills', 'LinkedIn', 'GitHub', 'Portfolio', 'Screening answers', 'Resume'];
  const label = (s: string) => PIPELINE.find((p) => p.key === stageOf(s))?.label ?? s;
  const rows = apps.map((a) => { const m = computeMatch(a.Listing, a); return [
    a.fullName, a.email, a.phone, a.Listing.title, a.withdrawnAt ? 'Withdrawn' : label(a.status), a.appliedAt.toISOString().slice(0, 10),
    a.source, a.currentTitle, a.currentCompany, a.city, a.experienceYears, a.noticePeriodDays, a.expectedCtcLakh, m.score, m.knockedOut ? 'Yes' : '',
    a.AiScreening?.status === 'DONE' ? a.AiScreening.fitScore : '', a.AiScreening?.status === 'DONE' ? AI_LABEL[a.AiScreening.recommendation ?? ''] ?? '' : '',
    `${a.matchedSkills.length}/${a.Listing.skills.length}`, a.confirmedSkills.join('; '), a.linkedinUrl, a.githubUrl, a.portfolioUrl,
    (Array.isArray(a.screeningAnswers) ? a.screeningAnswers as { question: string; answer: string }[] : []).map((q) => `${q.question}: ${q.answer}`).join(' | '),
    a.resumeKey || a.resumeUrl ? 'Available in the Udyaibase portal' : '',
  ].map(cell).join(','); });

  const csv = '﻿' + [header.map(cell).join(','), ...rows].join('\r\n');
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="candidates-${new Date().toISOString().slice(0, 10)}.csv"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
