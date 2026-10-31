import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { requireApiAuth } from '@/lib/api-auth';
import { logAuditEvent } from '@/lib/audit-log';
import { withPublicRefresh } from '@/lib/refresh-public';

const sql = neon(process.env.DATABASE_URL!);

async function putHandler(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { error } = await requireApiAuth();
  if (error) return error;

  try {
    const body = await request.json();
    const newSlug = body.slug?.trim().toLowerCase();

    if (!newSlug || newSlug.length < 3) return NextResponse.json({ error: 'Slug must be at least 3 characters' }, { status: 400 });
    if (newSlug.length > 80) return NextResponse.json({ error: 'Slug must be under 80 characters' }, { status: 400 });
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(newSlug)) return NextResponse.json({ error: 'Only lowercase letters, numbers, and hyphens allowed' }, { status: 400 });

    const startups = await sql`SELECT id, slug, "previousSlugs" FROM "Startup" WHERE id = ${params.id} AND "deletedAt" IS NULL LIMIT 1`;
    if (startups.length === 0) return NextResponse.json({ error: 'Startup not found' }, { status: 404 });
    const startup = startups[0] as any;

    if (startup.slug === newSlug) return NextResponse.json({ success: true, slug: newSlug });

    const existing = await sql`SELECT id FROM "Startup" WHERE slug = ${newSlug} AND id != ${params.id} LIMIT 1`;
    if (existing.length > 0) return NextResponse.json({ error: 'Slug already taken' }, { status: 409 });

    // Also check AiTool slugs (cross-table uniqueness)
    const toolCheck = await sql`SELECT id FROM "AiTool" WHERE slug = ${newSlug} LIMIT 1`;
    if (toolCheck.length > 0) {
      return NextResponse.json({ error: 'This URL is already in use. Try a different one.' }, { status: 409 });
    }

    const previousSlugs = startup.previousSlugs || [];
    if (!previousSlugs.includes(startup.slug)) previousSlugs.push(startup.slug);

    await sql`
      UPDATE "Startup"
      SET slug = ${newSlug}, "slugChangedAt" = NOW(), "previousSlugs" = ${previousSlugs}, "updatedAt" = NOW()
      WHERE id = ${params.id}
    `;

    logAuditEvent({ action: 'UPDATE', resourceType: 'STARTUP', resourceId: params.id, before: { slug: startup.slug }, after: { slug: newSlug } });

    return NextResponse.json({ success: true, slug: newSlug });
  } catch (error: any) {
    console.error('[Admin Startup Slug PUT]', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

export const PUT = withPublicRefresh(['startups', 'funding'], putHandler);
