import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export const runtime = 'edge';
export const revalidate = 300; // Revalidate every 1 minute

export async function GET() {
  try {
    
    const cities = await sql`
      SELECT 
        id,
        "cityName",
        slug,
        state,
        latitude,
        longitude,
        "totalStartups",
        "totalFunding",
        "topSectors",
        "recentFundings",
        "keyAccelerators",
        "notableCompanies",
        "averageTeamSize",
        "averageFunding",
        description,
        "featuredImage",
        "isFeatured",
        "premiumPlacement",
        "displayOrder",
        aliases
      FROM "IndiaAICity"
      WHERE "isActive" = true
      ORDER BY "displayOrder" ASC, "totalStartups" DESC
    `;

    return NextResponse.json({
      success: true,
      data: cities,
      count: cities.length,
    });
  } catch (error) {
    console.error('Error fetching India AI cities:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch cities' },
      { status: 500 }
    );
  }
}
