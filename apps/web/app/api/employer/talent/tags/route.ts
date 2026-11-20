import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { writeLimited } from '@/lib/employer/write-limit';
import { cleanTags } from '@/lib/employer/talent-tags';
import { employerApi } from '@/lib/employer/api-session';

export const dynamic = 'force-dynamic';

/**
 * Set the team's private tags on a talent pool candidate ("backend", "next quarter"). Tags belong to the person,
 * so they're saved on every application they sent this company and stay in step. Never shown to the candidate,
 * and erased with the rest of their data.
 */
export async function PUT(request: NextRequest) {
  const limited = await writeLimited(request, 'talent/tags');
  if (limited) return limited;
  const guard = await employerApi('candidates.note');
  if (guard.error) return guard.error;
  const session = guard.session;
  if (session.jobIds) return NextResponse.json({ error: 'The talent pool isn’t available for your role.' }, { status: 403 });

  const b = await request.json().catch(() => ({}));
  const tags = cleanTags(b.tags);
  if (tags === null) return NextResponse.json({ error: 'Tags must be a list of short words.' }, { status: 400 });

  const app = await prisma.jobBoardApplication.findFirst({
    where: { id: String(b.applicationId ?? ''), Listing: { employerId: session.id }, talentPoolUntil: { gt: new Date() }, NOT: { email: { endsWith: '@deleted.invalid' } } },
    select: { email: true },
  });
  if (!app) return NextResponse.json({ error: 'This person is no longer in your talent pool.' }, { status: 404 });

  await prisma.jobBoardApplication.updateMany({
    where: { email: { equals: app.email, mode: 'insensitive' }, Listing: { employerId: session.id } },
    data: { talentTags: tags },
  });
  return NextResponse.json({ tags });
}
