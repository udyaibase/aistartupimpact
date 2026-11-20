import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { employerApi, fail } from '@/lib/employer/api-session';
import { writeLimited } from '@/lib/employer/write-limit';
import { confirmSamePerson, contactPreview, contactSourced, deleteSourced, duplicateSuggestions, markInterested } from '@/lib/employer/sourcing';

export const dynamic = 'force-dynamic';

async function own(employerId: string, id: string, jobIds: string[] | null) {
  return prisma.jobBoardApplication.findFirst({
    where: { id, Listing: { employerId, ...(jobIds ? { id: { in: jobIds } } : {}) } },
    select: { id: true, email: true, phone: true, personId: true, sourcedState: true },
  });
}

/** The first-contact preview and possible duplicates. */
export async function GET(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const g = await employerApi('candidates.view');
  if (g.error) return g.error;
  const a = await own(g.session.id, id, g.session.jobIds);
  if (!a) return NextResponse.json({ error: 'Candidate not found.' }, { status: 404 });
  const [preview, duplicates] = await Promise.all([
    a.sourcedState === 'ADDED' || a.sourcedState === 'CONTACTED' ? contactPreview(g.session.id, id, g.session.email) : null,
    duplicateSuggestions(g.session.id, { id: a.id, email: a.email, phone: a.phone, personId: a.personId }),
  ]);
  return NextResponse.json({ preview, duplicates });
}

/** { action: 'contact', subject, body } | { action: 'interested' } | { action: 'remove' } | { action: 'same-person', otherId } */
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const limited = await writeLimited(request, 'applications/[id]/sourced');
  if (limited) return limited;
  const { id } = await props.params;
  const g = await employerApi('candidates.move');
  if (g.error) return g.error;
  const b = await request.json().catch(() => ({}));
  const a = await own(g.session.id, id, g.session.jobIds);
  if (!a) return NextResponse.json({ error: 'Candidate not found.' }, { status: 404 });
  if (b.action === 'contact') {
    const r = await contactSourced({ employerId: g.session.id, id, actorEmail: g.session.email, subject: b.subject, body: b.body });
    return r.ok ? NextResponse.json({ success: true }) : fail(r);
  }
  if (b.action === 'interested') {
    return (await markInterested({ employerId: g.session.id, id, actor: g.session.email }))
      ? NextResponse.json({ success: true }) : NextResponse.json({ error: 'They’re already in your pipeline.' }, { status: 409 });
  }
  if (b.action === 'remove') {
    if (!a.sourcedState || a.sourcedState === 'INTERESTED') return NextResponse.json({ error: 'Only sourced people not yet in the pipeline can be removed here.' }, { status: 409 });
    await deleteSourced(id);
    return NextResponse.json({ success: true });
  }
  if (b.action === 'same-person' && typeof b.otherId === 'string') {
    return (await confirmSamePerson(g.session.id, id, b.otherId)) ? NextResponse.json({ success: true }) : NextResponse.json({ error: 'Couldn’t link those two.' }, { status: 400 });
  }
  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}
