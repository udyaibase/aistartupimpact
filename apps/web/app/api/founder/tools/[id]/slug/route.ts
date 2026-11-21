import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { founderApi, tooMany } from '@/lib/founder/api-session';
import { founderWriteRateLimit } from '@/lib/rate-limit';
import { slugFormatProblem, slugTakenByAnother } from '@/lib/founder/slug-rules';

export const dynamic = 'force-dynamic';
const COOLDOWN_DAYS = 45;

export async function PUT(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const guard = await founderApi();
    if (guard.error) return guard.error;
    const session = guard.session;
    const limited = await tooMany(founderWriteRateLimit, `slug:${session.userId}`);
    if (limited) return limited;

    const { id } = params;
    const body = await request.json();
    const newSlug = body.slug?.trim().toLowerCase();

    const problem = slugFormatProblem(newSlug);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });

    const tools = await sql`
      SELECT id, slug, "slugChangedAt", "previousSlugs", "ownerId"
      FROM "AiTool"
      WHERE id = ${id} AND "ownerId" = ${session.userId} AND "deletedAt" IS NULL
      LIMIT 1
    `;

    if (tools.length === 0) return NextResponse.json({ error: 'Tool not found' }, { status: 404 });
    const tool = tools[0] as any;

    if (tool.slug === newSlug) return NextResponse.json({ success: true, slug: newSlug });

    // 45-day cooldown
    if (tool.slugChangedAt) {
      const lastChanged = new Date(tool.slugChangedAt + 'Z');
      const cooldownEnd = new Date(lastChanged.getTime() + COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
      if (new Date() < cooldownEnd) {
        const daysLeft = Math.ceil((cooldownEnd.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
        return NextResponse.json({ error: `You can change your URL again in ${daysLeft} days` }, { status: 429 });
      }
    }

    // Free now, and not another listing's old URL (those keep redirecting to the listing that moved).
    if (await slugTakenByAnother(newSlug, { type: 'tool', id })) {
      return NextResponse.json({ error: 'This URL is already taken. Try a different one.' }, { status: 409 });
    }

    const previousSlugs = (tool.previousSlugs || []).filter((old: string) => old !== newSlug); // taking an old URL back
    if (!previousSlugs.includes(tool.slug)) previousSlugs.push(tool.slug);

    await sql`
      UPDATE "AiTool"
      SET slug = ${newSlug}, "slugChangedAt" = NOW(), "previousSlugs" = ${previousSlugs}, "updatedAt" = NOW()
      WHERE id = ${id}
    `;

    return NextResponse.json({ success: true, slug: newSlug });
  } catch (error: any) {
    console.error('[PUT /api/founder/tools/[id]/slug]', error);
    return NextResponse.json({ error: 'Failed to update URL' }, { status: 500 });
  }
}
