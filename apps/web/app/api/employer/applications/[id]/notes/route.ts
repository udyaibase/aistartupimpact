import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { getEmployerSession } from '@/lib/employer-auth';
import { can, forbidden, listingScope } from '@/lib/employer/permissions';
import { listTeam, sendMentionEmails } from '@/lib/employer/team';

export const dynamic = 'force-dynamic';

/** Private team note on a candidate (never shown to the candidate). */
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await getEmployerSession();
  if (!session) return NextResponse.json({ error: 'Please log in again.' }, { status: 401 });
  if (!can(session.role, 'candidates.note')) return forbidden();

  const { body, mentions: picked } = await request.json().catch(() => ({}));
  const text = typeof body === 'string' ? body.trim().slice(0, 4000) : '';
  if (!text) return NextResponse.json({ error: 'Write a note first.' }, { status: 400 });

  const app = await prisma.jobBoardApplication.findFirst({ where: { id, Listing: listingScope(session) }, select: { id: true, fullName: true, listingId: true } });
  if (!app) return NextResponse.json({ error: 'Candidate not found.' }, { status: 404 });

  // Mentions are emails picked from the team list; only active teammates (and the owner account) count.
  const team = (await listTeam(session.id)).filter((t) => t.status !== 'PENDING');
  const allowed = new Set(team.map((t) => t.email.toLowerCase()));
  const mentions = Array.from(new Set((Array.isArray(picked) ? picked : []).map((m: unknown) => String(m).toLowerCase())))
    .filter((m) => allowed.has(m) && m !== session.email.toLowerCase()).slice(0, 10);
  const author = await prisma.jobBoardEmployer.findUnique({ where: { id: session.id }, select: { FounderUser: { select: { name: true } } } });
  const authorName = session.memberName || (!session.memberId && author?.FounderUser?.name) || session.email.split('@')[0];
  const note = await prisma.jobBoardApplicationNote.create({
    data: { applicationId: id, authorEmail: session.email, authorName, body: text, mentions },
  });
  if (mentions.length) {
    sendMentionEmails({ employerId: session.id, to: mentions, authorName, candidateName: app.fullName, jobId: app.listingId, applicationId: app.id, note: text })
      .catch((err) => console.error('Mention email failed:', err));
  }
  return NextResponse.json({ note: { id: note.id, mentions, authorName: note.authorName, authorEmail: note.authorEmail, body: note.body, createdAt: note.createdAt.toISOString() } }, { status: 201 });
}
