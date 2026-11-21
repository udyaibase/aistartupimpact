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

    // Verify ownership
    const startups = await sql`
      SELECT id, slug, "slugChangedAt", "previousSlugs", "ownerId"
      FROM "Startup"
      WHERE id = ${id} AND "ownerId" = ${session.userId} AND "deletedAt" IS NULL
      LIMIT 1
    `;

    if (startups.length === 0) {
      return NextResponse.json({ error: 'Startup not found or not owned by you' }, { status: 404 });
    }

    const startup = startups[0] as any;

    // Same slug — no change needed
    if (startup.slug === newSlug) {
      return NextResponse.json({ success: true, slug: newSlug });
    }

    // Check 45-day cooldown (founders only)
    if (startup.slugChangedAt) {
      const lastChanged = new Date(startup.slugChangedAt + 'Z');
      const cooldownEnd = new Date(lastChanged.getTime() + COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
      if (new Date() < cooldownEnd) {
        const daysLeft = Math.ceil((cooldownEnd.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
        return NextResponse.json({
          error: `You can change your URL again in ${daysLeft} day${daysLeft !== 1 ? 's' : ''} (next change: ${cooldownEnd.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' })})`
        }, { status: 429 });
      }
    }

    // Free now, and not another listing's old URL (those keep redirecting to the listing that moved).
    if (await slugTakenByAnother(newSlug, { type: 'startup', id })) {
      return NextResponse.json({ error: 'This URL is already taken. Try a different one.' }, { status: 409 });
    }

    // Store old slug in previousSlugs array
    const previousSlugs = (startup.previousSlugs || []).filter((old: string) => old !== newSlug); // taking an old URL back
    if (!previousSlugs.includes(startup.slug)) {
      previousSlugs.push(startup.slug);
    }

    // Update slug
    await sql`
      UPDATE "Startup"
      SET slug = ${newSlug},
          "slugChangedAt" = NOW(),
          "previousSlugs" = ${previousSlugs},
          "updatedAt" = NOW()
      WHERE id = ${id}
    `;

    return NextResponse.json({ success: true, slug: newSlug, previousSlug: startup.slug });
  } catch (error: any) {
    console.error('[PUT /api/founder/startups/[id]/slug]', error);
    return NextResponse.json({ error: 'Failed to update URL' }, { status: 500 });
  }
}
