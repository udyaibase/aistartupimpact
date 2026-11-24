import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { employerApi } from '@/lib/employer/api-session';
import { writeLimited } from '@/lib/employer/write-limit';

export const dynamic = 'force-dynamic';

const notForRole = () => NextResponse.json({ error: 'Not available for your role.' }, { status: 403 });
const notFound = () => NextResponse.json({ error: 'Saved search not found.' }, { status: 404 });

/** Rename a saved search, or turn its daily email on or off. */
export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const guard = await employerApi('candidates.view');
  if (guard.error) return guard.error;
  if (guard.session.jobIds) return notForRole();
  const limited = await writeLimited(request, 'talent/searches');
  if (limited) return limited;
  const { id } = await props.params;
  const body = await request.json().catch(() => ({}));
  const data: { alert?: boolean; name?: string; lastAlertAt?: Date } = {};
  // Turning alerts back on starts from now, so nobody gets a backlog of old matches.
  if (typeof body.alert === 'boolean') { data.alert = body.alert; if (body.alert) data.lastAlertAt = new Date(); }
  if (typeof body.name === 'string' && body.name.trim().length >= 2) data.name = body.name.trim().slice(0, 60);
  const r = await prisma.jobBoardSavedTalentSearch.updateMany({ where: { id, employerId: guard.session.id }, data });
  return r.count ? NextResponse.json({ success: true }) : notFound();
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const guard = await employerApi('candidates.view');
  if (guard.error) return guard.error;
  if (guard.session.jobIds) return notForRole();
  const limited = await writeLimited(request, 'talent/searches');
  if (limited) return limited;
  const { id } = await props.params;
  const r = await prisma.jobBoardSavedTalentSearch.deleteMany({ where: { id, employerId: guard.session.id } });
  return r.count ? NextResponse.json({ success: true }) : notFound();
}
