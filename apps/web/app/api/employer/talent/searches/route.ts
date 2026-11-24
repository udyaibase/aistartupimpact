import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { employerApi } from '@/lib/employer/api-session';
import { writeLimited } from '@/lib/employer/write-limit';
import { cleanTalentFilters, hasFilters } from '@/lib/employer/talent-filters';

export const dynamic = 'force-dynamic';

/** Most saved searches one company keeps. */
const MAX_SAVED_SEARCHES = 20;

/** The company's saved talent pool searches (the pool spans every job, so teammates limited to some jobs don't get it). */
export async function GET() {
  const guard = await employerApi('candidates.view');
  if (guard.error) return guard.error;
  if (guard.session.jobIds) return NextResponse.json({ error: 'Not available for your role.' }, { status: 403 });
  const searches = await prisma.jobBoardSavedTalentSearch.findMany({
    where: { employerId: guard.session.id },
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, filters: true, alert: true, createdByEmail: true, createdAt: true },
  });
  return NextResponse.json({ searches: searches.map((s) => ({ ...s, filters: cleanTalentFilters(s.filters) })) });
}

/** Save the current search. With alerts on, the person saving it is emailed daily about new matches. */
export async function POST(request: NextRequest) {
  const guard = await employerApi('candidates.view');
  if (guard.error) return guard.error;
  const { session } = guard;
  if (session.jobIds) return NextResponse.json({ error: 'Not available for your role.' }, { status: 403 });
  const limited = await writeLimited(request, 'talent/searches');
  if (limited) return limited;

  const body = await request.json().catch(() => ({}));
  const filters = cleanTalentFilters(body.filters);
  if (!hasFilters(filters)) return NextResponse.json({ error: 'Choose at least one filter to save a search.' }, { status: 400 });
  const name = (typeof body.name === 'string' ? body.name.trim() : '').slice(0, 60);
  if (name.length < 2) return NextResponse.json({ error: 'Give the search a short name.' }, { status: 400 });
  const count = await prisma.jobBoardSavedTalentSearch.count({ where: { employerId: session.id } });
  if (count >= MAX_SAVED_SEARCHES) return NextResponse.json({ error: `You can keep up to ${MAX_SAVED_SEARCHES} saved searches. Delete one first.` }, { status: 409 });

  const search = await prisma.jobBoardSavedTalentSearch.create({
    data: { employerId: session.id, name, filters: JSON.parse(JSON.stringify(filters)), alert: body.alert !== false, createdByEmail: session.email },
    select: { id: true, name: true, filters: true, alert: true, createdByEmail: true, createdAt: true },
  });
  return NextResponse.json({ success: true, search: { ...search, filters } });
}
