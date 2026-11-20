import { NextRequest, NextResponse } from 'next/server';
import { employerApi } from '@/lib/employer/api-session';
import { writeLimited } from '@/lib/employer/write-limit';
import { archiveTemplate, listTemplates, saveTemplate } from '@/lib/employer/pipeline-templates';

export const dynamic = 'force-dynamic';

export async function GET() {
  const g = await employerApi('jobs.view');
  if (g.error) return g.error;
  return NextResponse.json({ templates: await listTemplates(g.session.id) });
}

/** Save a job's steps as a template: { name, config }. The same name again makes a new version. */
export async function POST(request: NextRequest) {
  const limited = await writeLimited(request, 'pipeline-templates');
  if (limited) return limited;
  const g = await employerApi('jobs.manage');
  if (g.error) return g.error;
  const b = await request.json().catch(() => ({}));
  const r = await saveTemplate(g.session.id, g.session.email, b.name, b.config);
  return r.ok ? NextResponse.json({ success: true, id: r.id, version: r.version }) : NextResponse.json({ error: r.error }, { status: 400 });
}

export async function DELETE(request: NextRequest) {
  const limited = await writeLimited(request, 'pipeline-templates');
  if (limited) return limited;
  const g = await employerApi('jobs.manage');
  if (g.error) return g.error;
  return (await archiveTemplate(g.session.id, request.nextUrl.searchParams.get('id') ?? ''))
    ? NextResponse.json({ success: true }) : NextResponse.json({ error: 'Template not found.' }, { status: 404 });
}
