import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { checkRateLimit, getClientIdentifier, strictRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  // Suggestions wait for an admin to approve them: a few per visitor an hour is plenty.
  const { success: allowed } = await checkRateLimit(strictRateLimit, `custom-city:${getClientIdentifier(req)}`);
  if (!allowed) return NextResponse.json({ success: false, error: 'Too many suggestions. Please try again later.' }, { status: 429 });
  try {
    const { cityName } = await req.json();

    if (!cityName || typeof cityName !== 'string' || cityName.trim().length < 2) {
      return NextResponse.json(
        { success: false, error: 'City name must be at least 2 characters' },
        { status: 400 }
      );
    }

    const cleanName = cityName.trim().slice(0, 100);
    const slug = cleanName
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .split(/[\s_-]+/)
      .filter(Boolean)
      .join('-');

    // Check if city already exists (standard or custom)
    const existing = await sql`
      SELECT id FROM "IndiaAICity"
      WHERE LOWER("cityName") = LOWER(${cleanName})
        OR slug = ${slug}
      LIMIT 1
    `;

    if (existing.length > 0) {
      // City already exists, no need to add again
      return NextResponse.json({ success: true, message: 'City already exists' });
    }

    // Insert as custom city (inactive until admin approves)
    await sql`
      INSERT INTO "IndiaAICity" (
        id, "cityName", slug, state, latitude, longitude,
        "totalStartups", "totalFunding", "topSectors", "keyAccelerators",
        "notableCompanies", "isActive", source, aliases, "displayOrder",
        "isFeatured", "createdAt", "updatedAt"
      ) VALUES (
        gen_random_uuid(), ${cleanName}, ${slug}, NULL, 0, 0,
        0, 0, '{}', '{}',
        '{}', false, 'custom', '{}', 999,
        false, NOW(), NOW()
      )
      ON CONFLICT ("cityName") DO NOTHING
    `;

    return NextResponse.json({ success: true, message: 'Custom city submitted for review' });
  } catch (error) {
    console.error('Error submitting custom city:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to submit city' },
      { status: 500 }
    );
  }
}
