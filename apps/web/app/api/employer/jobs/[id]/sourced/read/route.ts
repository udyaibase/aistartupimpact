import { NextRequest, NextResponse } from 'next/server';
import { employerApi, fail } from '@/lib/employer/api-session';
import { writeLimited } from '@/lib/employer/write-limit';
import { readSourcedResume } from '@/lib/employer/sourcing';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** Read a resume (raw bytes) to fill the add form. Nothing is stored here. */
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const limited = await writeLimited(request, 'jobs/[id]/sourced/read');
  if (limited) return limited;
  const { id } = await props.params;
  const g = await employerApi('candidates.move');
  if (g.error) return g.error;
  const bytes = new Uint8Array(await request.arrayBuffer());
  const r = await readSourcedResume({ employerId: g.session.id, listingId: id, bytes });
  return r.ok ? NextResponse.json({ success: true, fields: r.fields, usedAi: r.usedAi }) : fail(r);
}
