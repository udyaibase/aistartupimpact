import { NextRequest, NextResponse } from 'next/server';
import { runImportChunk } from '@/lib/employer/importer';
import { importSession } from '../../guard';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Imports the next chunk of rows; the browser repeats until `done`. */
export async function POST(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const g = await importSession();
  if (g.error) return g.error;
  const r = await runImportChunk(id, g.session.id);
  return r.ok ? NextResponse.json({ success: true, ...r }) : NextResponse.json({ error: r.error }, { status: r.status });
}
