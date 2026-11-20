import { NextRequest, NextResponse } from 'next/server';
import { attachImportedResume } from '@/lib/employer/importer';
import { importSession } from '../../guard';

export const dynamic = 'force-dynamic';

/** One resume from the ZIP (raw bytes), for the candidate named in ?email=. */
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const g = await importSession();
  if (g.error) return g.error;
  const email = request.nextUrl.searchParams.get('email') ?? '';
  const bytes = new Uint8Array(await request.arrayBuffer());
  const r = await attachImportedResume({ importId: id, employerId: g.session.id, email, bytes });
  return r.ok ? NextResponse.json({ success: true, attached: r.attached }) : NextResponse.json({ error: r.error }, { status: r.status });
}
