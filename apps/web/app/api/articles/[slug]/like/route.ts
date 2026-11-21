import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { apiRateLimit, checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function POST(_req: NextRequest, props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  try {
    const identifier = getClientIdentifier(_req);
    const { success: allowed } = await checkRateLimit(apiRateLimit, identifier);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const rows = await sql`
      UPDATE "Article" SET "likeCount" = COALESCE("likeCount", 0) + 1
      WHERE slug = ${params.slug} AND status = 'PUBLISHED'
      RETURNING "likeCount"
    `;
    if (!rows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ likeCount: rows[0].likeCount });
  } catch (e) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

/** Undo a like. The count never goes below zero. */
export async function DELETE(_req: NextRequest, props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  try {
    const identifier = getClientIdentifier(_req);
    const { success: allowed } = await checkRateLimit(apiRateLimit, identifier);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const rows = await sql`
      UPDATE "Article" SET "likeCount" = GREATEST(COALESCE("likeCount", 0) - 1, 0)
      WHERE slug = ${params.slug} AND status = 'PUBLISHED'
      RETURNING "likeCount"
    `;
    if (!rows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ likeCount: rows[0].likeCount });
  } catch (e) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
