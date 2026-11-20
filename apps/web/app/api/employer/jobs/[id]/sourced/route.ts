import { NextRequest, NextResponse } from 'next/server';
import { employerApi, fail } from '@/lib/employer/api-session';
import { writeLimited } from '@/lib/employer/write-limit';
import { addSourced } from '@/lib/employer/sourcing';

export const dynamic = 'force-dynamic';

/** Add someone the team found to this job's sourcing lane. JSON, or multipart with `data` (JSON) and a `resume` file. */
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const limited = await writeLimited(request, 'jobs/[id]/sourced');
  if (limited) return limited;
  const { id } = await props.params;
  const g = await employerApi('candidates.move');
  if (g.error) return g.error;
  let input: Record<string, unknown> = {};
  let resume: Uint8Array | null = null;
  if ((request.headers.get('content-type') ?? '').includes('multipart/form-data')) {
    const form = await request.formData().catch(() => null);
    if (!form) return NextResponse.json({ error: 'Couldn’t read the form.' }, { status: 400 });
    try { input = JSON.parse(String(form.get('data') ?? '{}')); } catch { input = {}; }
    const f = form.get('resume');
    if (f && typeof f !== 'string' && f.size > 0) resume = new Uint8Array(await f.arrayBuffer());
  } else input = await request.json().catch(() => ({}));
  const r = await addSourced({ employerId: g.session.id, listingId: id, actorEmail: g.session.email, input, resume, jobIds: g.session.jobIds });
  return r.ok ? NextResponse.json({ success: true, id: r.id, duplicates: r.duplicates }) : fail(r);
}
