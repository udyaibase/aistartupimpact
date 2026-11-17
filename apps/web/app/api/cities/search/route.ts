import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * City search for onboarding. Matches the name or any alias, ignoring case, so "Bangalore", "bombay" and
 * "Gurgaon" find Bengaluru, Mumbai and Gurugram (aliases are stored in lowercase).
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim().slice(0, 60);
  if (!q || q.length < 2) {
    return NextResponse.json([]);
  }

  // Typed % and _ are letters here, not wildcards.
  const safe = q.replace(/[\\%_]/g, (c) => `\\${c}`);
  const contains = `%${safe}%`;
  const starts = `${safe}%`;
  try {
    const cities = await sql`
      SELECT id, name, state, country
      FROM "City"
      WHERE name ILIKE ${contains}
         OR EXISTS (SELECT 1 FROM unnest(aliases) AS a WHERE a ILIKE ${starts})
      ORDER BY
        CASE WHEN name ILIKE ${starts} THEN 0
             WHEN EXISTS (SELECT 1 FROM unnest(aliases) AS a WHERE a ILIKE ${starts}) THEN 1
             ELSE 2 END,
        CASE WHEN country = 'India' THEN 0 ELSE 1 END,
        name
      LIMIT 10
    `;
    return NextResponse.json(cities);
  } catch (err) {
    console.error('[cities/search] failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'City search is unavailable right now.' }, { status: 500 });
  }
}
