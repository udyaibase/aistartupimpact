import { NextRequest, NextResponse } from 'next/server';
import { isSection, refreshPaths, refreshSections, type Section } from '@/lib/revalidate';
import { internalAuthorized } from '@/lib/internal-auth';

export const dynamic = 'force-dynamic';

/**
 * Called by the admin app after it changes public content: { sections?: Section[], paths?: string[] }.
 * Authorised with INTERNAL_API_SECRET (lib/internal-auth.ts). Fails closed without it.
 */
export async function POST(request: NextRequest) {
  if (!internalAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const sections: Section[] = Array.isArray(body.sections) ? body.sections.filter(isSection).slice(0, 20) : [];
  const paths: string[] = Array.isArray(body.paths)
    ? body.paths.filter((p: unknown): p is string => typeof p === 'string' && /^\/[\w\-./]*$/.test(p) && p.length <= 300).slice(0, 50)
    : [];
  if (!sections.length && !paths.length) return NextResponse.json({ error: 'Nothing to refresh.' }, { status: 400 });

  refreshSections(sections);
  refreshPaths(paths);
  return NextResponse.json({ revalidated: true, sections, paths: paths.length });
}
