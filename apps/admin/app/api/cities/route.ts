import { NextResponse } from 'next/server';
import { prisma } from '@udyaibase/database';
import { requireApiAuth } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  // Any signed-in staff member may read the city list; checked here too, not just by the middleware.
  const { error } = await requireApiAuth(['SUPER_ADMIN', 'EDITOR_IN_CHIEF', 'SENIOR_WRITER', 'WRITER', 'AD_MANAGER', 'CONTRIBUTOR', 'EVENT_ORGANIZER']);
  if (error) return error;
  try {
    const cities = await prisma.indiaAICity.findMany({
      where: { isActive: true },
      orderBy: [
        { displayOrder: 'asc' },
        { totalStartups: 'desc' }
      ]
    });

    // Serialize BigInt/Decimal fields to JSON-safe values
    const serialized = cities.map(city => ({
      id: city.id,
      cityName: city.cityName,
      slug: city.slug,
      state: city.state,
      latitude: city.latitude ? Number(city.latitude) : null,
      longitude: city.longitude ? Number(city.longitude) : null,
      totalStartups: city.totalStartups,
      totalFunding: city.totalFunding ? Number(city.totalFunding) : 0,
      aliases: city.aliases,
      isActive: city.isActive,
      source: city.source || 'standard',
    }));

    return NextResponse.json({
      success: true,
      data: serialized,
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
      }
    });
  } catch (error) {
    console.error('Error fetching admin cities:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch cities' },
      { status: 500 }
    );
  }
}
