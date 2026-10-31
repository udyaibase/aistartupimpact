import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { requireApiAuth } from '@/lib/api-auth';
import { logAuditEvent } from '@/lib/audit-log';
import { withPublicRefresh } from '@/lib/refresh-public';

async function postHandler(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { error } = await requireApiAuth(['SUPER_ADMIN', 'EDITOR_IN_CHIEF']);
  if (error) return error;
  try {
    const { id } = params;

    // Update the city to be active and mark as standard
    const city = await prisma.indiaAICity.update({
      where: { id },
      data: {
        isActive: true,
        source: 'standard',
        updatedAt: new Date(),
      },
    });

    // Also create/upsert in the City table so cityId resolution works for startups
    const slug = city.cityName
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');

    // Check if city already exists in City table
    const existingCity = await prisma.$queryRaw<any[]>`
      SELECT id FROM "City"
      WHERE LOWER(name) = LOWER(${city.cityName})
        OR slug = ${slug}
      LIMIT 1
    `;

    if (existingCity.length === 0) {
      // Insert into City table
      await prisma.$executeRaw`
        INSERT INTO "City" (id, slug, name, state, country, latitude, longitude, aliases, "createdAt", "updatedAt")
        VALUES (
          gen_random_uuid(),
          ${slug},
          ${city.cityName},
          ${city.state},
          'India',
          ${city.latitude ? Number(city.latitude) : null},
          ${city.longitude ? Number(city.longitude) : null},
          ${city.aliases || []},
          NOW(),
          NOW()
        )
        ON CONFLICT (slug) DO NOTHING
      `;
    }

    logAuditEvent({ action: 'APPROVE', resourceType: 'CITY', resourceId: id, resourceName: city.cityName });

    return NextResponse.json({ success: true, data: city });
  } catch (error) {
    console.error('Error approving city:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to approve city' },
      { status: 500 }
    );
  }
}

export const POST = withPublicRefresh(['india-ai'], postHandler);
