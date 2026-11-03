import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { detectCategory } from '@/lib/categories';
import { checkLocation } from '@/lib/locations';
import { apiRateLimit, checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const identifier = getClientIdentifier(req);
    const { success: allowed } = await checkRateLimit(apiRateLimit, identifier);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const body = await req.json();
    const {
      name, websiteUrl, linkedinUrl, logoUrl,
      tagline, description, stage,
      headquartersCity, foundedYear, employeeCount,
      founders, founderEmail,
      category, useCases,
    } = body;

    if (!name || !websiteUrl || !tagline || !founderEmail) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      + '-' + Math.random().toString(36).substring(2, 6);

    // Auto-detect category if not provided
    const finalCategory = category || detectCategory(`${name} ${tagline} ${description || ''}`);

    // Headquarters only from the standard city list.
    const loc = await checkLocation({ city: typeof headquartersCity === 'string' ? headquartersCity : '' });
    if (!loc.ok) return NextResponse.json({ error: loc.error, field: 'headquartersCity' }, { status: 400 });
    const finalCity = loc.city;

    // Insert startup
    const result = await sql`
      INSERT INTO "Startup" (
        id, name, slug, tagline, description, "websiteUrl", "linkedinUrl", "logoUrl",
        stage, "headquartersCity", "foundedYear", "employeeCount",
        founders, "foundersData",
        "isIndian", "isFeatured", "createdAt", "updatedAt"
      ) VALUES (
        gen_random_uuid(), ${name}, ${slug},
        ${tagline.slice(0, 60)},
        ${description || null},
        ${websiteUrl},
        ${linkedinUrl || null},
        ${logoUrl || null},
        ${stage || 'SEED'}::"StartupStage",
        ${finalCity},
        ${foundedYear ? parseInt(foundedYear) : null},
        ${employeeCount ? parseInt(employeeCount) : null},
        ${founders && founders.length > 0 ? founders.filter((f: any) => f.name?.trim()).map((f: any) => f.name) : null},
        ${founders && founders.length > 0 ? JSON.stringify(founders.filter((f: any) => f.name?.trim())) : null}::jsonb,
        true, false, NOW(), NOW()
      )
      RETURNING id
    `;

    const startupId = (result[0] as any).id;

    return NextResponse.json({ success: true, slug });
  } catch (e: any) {
    console.error('startup submit error:', e);
    return NextResponse.json({ error: 'Submission failed. Please try again.' }, { status: 500 });
  }
}
