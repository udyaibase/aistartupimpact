import { NextRequest, NextResponse } from 'next/server';
import { problemsCsv } from '@/lib/employer/importer';
import { importSession } from '../../guard';

export const dynamic = 'force-dynamic';

/** The rows that weren't imported and why, as a CSV. */
export async function GET(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const g = await importSession();
  if (g.error) return g.error;
  const csv = await problemsCsv(id, g.session.id);
  if (csv == null) return NextResponse.json({ error: 'Import not found.' }, { status: 404 });
  return new NextResponse(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="import-problems.csv"`, 'Cache-Control': 'no-store' } });
}
