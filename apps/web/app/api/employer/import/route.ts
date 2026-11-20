import { NextRequest, NextResponse } from 'next/server';
import { writeLimited } from '@/lib/employer/write-limit';
import { listImports, startImport } from '@/lib/employer/importer';
import { importSession } from './guard';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Past imports, newest first (for the report and undo). */
export async function GET() {
  const g = await importSession();
  if (g.error) return g.error;
  return NextResponse.json({ imports: await listImports(g.session.id) });
}

/** Start an import: { fileName, csv, mapping, jobs, stages, defaultJob }. The browser then calls /run until done. */
export async function POST(request: NextRequest) {
  const limited = await writeLimited(request, 'import', 'sensitive');
  if (limited) return limited;
  const g = await importSession();
  if (g.error) return g.error;
  const input = await request.json().catch(() => ({}));
  const r = await startImport({ employerId: g.session.id, actorEmail: g.session.email, input });
  return r.ok ? NextResponse.json({ success: true, ...r }) : NextResponse.json({ error: r.error }, { status: r.status });
}
