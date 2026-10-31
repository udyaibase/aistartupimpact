'use server';

import { neon } from '@neondatabase/serverless';
import { requireActionAuth } from '@/lib/api-auth';
import { refreshPublic } from '@/lib/refresh-public';

const sql = neon(process.env.DATABASE_URL!);

export async function getEmployersAction() {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };

  try {
    const employers = await sql`
      SELECT e.id, e."companyName", e.slug, e.email, e."logoUrl", e."websiteUrl",
             e.plan, e."isVerified", e."isActive", e."companySize", e.industry,
             e."createdAt"::text,
             (SELECT COUNT(*)::int FROM "JobBoardListing" WHERE "employerId" = e.id AND "deletedAt" IS NULL) AS "jobCount"
      FROM "JobBoardEmployer" e
      ORDER BY e."createdAt" DESC
      LIMIT 200
    `;
    return { success: true, data: employers };
  } catch (error: any) {
    console.error('[Admin Employers]', error);
    return { success: false, error: 'Failed to load employers' };
  }
}

export async function toggleEmployerVerifyAction(id: string, isVerified: boolean) {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };

  try {
    await sql`UPDATE "JobBoardEmployer" SET "isVerified" = ${isVerified}, "updatedAt" = NOW() WHERE id = ${id}`;
    await refreshPublic(['jobs']); return { success: true };
  } catch (error: any) {
    return { success: false, error: 'Failed to update' };
  }
}

export async function toggleEmployerActiveAction(id: string, isActive: boolean) {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };

  try {
    await sql`UPDATE "JobBoardEmployer" SET "isActive" = ${isActive}, "updatedAt" = NOW() WHERE id = ${id}`;
    await refreshPublic(['jobs']); return { success: true };
  } catch (error: any) {
    return { success: false, error: 'Failed to update' };
  }
}
