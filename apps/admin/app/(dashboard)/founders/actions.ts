'use server';

import { neon } from '@neondatabase/serverless';
import { requireActionAuth } from '@/lib/api-auth';
import { sectionRoles } from '@/lib/section-access';
import { publicError } from '@/lib/public-error';

const sql = neon(process.env.DATABASE_URL!);

export async function getFoundersAction() {
  const { error } = await requireActionAuth(sectionRoles('/founders'));
  if (error) return { success: false, error };
  try {
    const founders = await sql`
      SELECT 
        fu.id,
        fu.name,
        fu.email,
        fu.company,
        fu."companyDomain",
        fu.role,
        fu.phone,
        fu."authProvider",
        fu."emailVerified",
        fu.status,
        fu."onboardingCompleted",
        fu."createdAt"::text AS "createdAt",
        fu."lastLoginAt"::text AS "lastLoginAt",
        COUNT(DISTINCT s.id) AS "startupCount",
        COUNT(DISTINCT t.id) AS "toolCount"
      FROM "FounderUser" fu
      LEFT JOIN "Startup" s ON s."ownerId" = fu.id
      LEFT JOIN "AiTool" t ON t."ownerId" = fu.id
      GROUP BY fu.id
      ORDER BY fu."createdAt" DESC
    `;

    const formatted = founders.map((f: any) => ({
      ...f,
      _count: {
        startups: parseInt(f.startupCount) || 0,
        tools: parseInt(f.toolCount) || 0,
      },
    }));

    return { success: true, data: formatted };
  } catch (error: any) {
    console.error('Get founders error:', error);
    return { success: false, error: publicError(error) };
  }
}
