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
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(newSlug)) return NextResponse.json({ error: 'Invalid slug format' }, { status: 400 });

    const tools = await sql`SELECT id, slug, "previousSlugs" FROM "AiTool" WHERE id = ${params.id} AND "deletedAt" IS NULL LIMIT 1`;
    if (tools.length === 0) return NextResponse.json({ error: 'Tool not found' }, { status: 404 });
    const tool = tools[0] as any;

    if (tool.slug === newSlug) return NextResponse.json({ success: true, slug: newSlug });

    const existing = await sql`SELECT id FROM "AiTool" WHERE slug = ${newSlug} AND id != ${params.id} LIMIT 1`;
    if (existing.length > 0) return NextResponse.json({ error: 'Slug already taken' }, { status: 409 });

    // Also check Startup slugs (cross-table uniqueness)
    const startupCheck = await sql`SELECT id FROM "Startup" WHERE slug = ${newSlug} LIMIT 1`;
    if (startupCheck.length > 0) {
      return NextResponse.json({ error: 'This URL is already in use. Try a different one.' }, { status: 409 });
    }

    const previousSlugs = tool.previousSlugs || [];
    if (!previousSlugs.includes(tool.slug)) previousSlugs.push(tool.slug);

    await sql`
      UPDATE "AiTool"
      SET slug = ${newSlug}, "slugChangedAt" = NOW(), "previousSlugs" = ${previousSlugs}, "updatedAt" = NOW()
      WHERE id = ${params.id}
    `;

    logAuditEvent({ action: 'UPDATE', resourceType: 'AI_TOOL', resourceId: params.id, before: { slug: tool.slug }, after: { slug: newSlug } });

    return NextResponse.json({ success: true, slug: newSlug });
  } catch (error: any) {
    console.error('[Admin Tool Slug PUT]', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

export const PUT = withPublicRefresh(['tools', 'home'], putHandler);
