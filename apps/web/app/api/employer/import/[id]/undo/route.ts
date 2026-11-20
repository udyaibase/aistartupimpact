import { NextRequest, NextResponse } from 'next/server';
import { writeLimited } from '@/lib/employer/write-limit';
import { undoImport } from '@/lib/employer/importer';
import { importSession } from '../../guard';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Removes the import's candidates, their resumes and the closed jobs it created (within 7 days). */
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const limited = await writeLimited(request, 'import/undo', 'sensitive');
  if (limited) return limited;
  const { id } = await props.params;
  const g = await importSession();
  if (g.error) return g.error;
  const r = await undoImport(id, g.session.id);
  return r.ok ? NextResponse.json({ success: true, removed: r.removed }) : NextResponse.json({ error: r.error }, { status: r.status });
}
