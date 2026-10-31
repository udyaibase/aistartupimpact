'use server';

import { neon } from '@neondatabase/serverless';
import { revalidatePath } from 'next/cache';
import { requireActionAuth } from '@/lib/api-auth';
import { refreshPublic } from '@/lib/refresh-public';

const sql = neon(process.env.DATABASE_URL!);

export async function getFundingDigestsAction() {
  const { error } = await requireActionAuth();
  if (error) return [];
  try {
    console.log('getFundingDigestsAction: Fetching funding digests...');
    const digests = await sql`
      SELECT 
        id, title, date::text AS date, status, "dealsCount", "totalRaised", deals, "createdAt"::text AS "createdAt"
      FROM "FundingDigest"
      ORDER BY date DESC
    `;
    console.log('getFundingDigestsAction: Found', digests.length, 'digests');
    return digests;
  } catch (error) {
    console.error('Error fetching funding digests:', error);
    return [];
  }
}

export async function createFundingDigestAction(data: {
  title: string;
  date: string;
  status: string;
  dealsCount: number;
  totalRaised: string;
  deals: any[];
}) {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  try {
    await sql`
      INSERT INTO "FundingDigest" (
        id, title, date, status, "dealsCount", "totalRaised", deals, "createdAt"
      )
      VALUES (
        gen_random_uuid(), ${data.title}, ${data.date}::date, ${data.status},
        ${data.dealsCount}, ${data.totalRaised}, ${JSON.stringify(data.deals)}, NOW()
      )
    `;

    revalidatePath('/funding-dir');
    await refreshPublic(['funding', 'startups', 'india-ai', 'home']); return { success: true };
  } catch (error) {
    console.error('Error creating funding digest:', error);
    return { success: false, error: 'Failed to create funding digest' };
  }
}

export async function updateFundingDigestAction(id: string, data: {
  title: string;
  date: string;
  status: string;
  dealsCount: number;
  totalRaised: string;
  deals: any[];
}) {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  try {
    await sql`
      UPDATE "FundingDigest"
      SET 
        title = ${data.title},
        date = ${data.date}::date,
        status = ${data.status},
        "dealsCount" = ${data.dealsCount},
        "totalRaised" = ${data.totalRaised},
        deals = ${JSON.stringify(data.deals)}
      WHERE id = ${id}
    `;

    revalidatePath('/funding-dir');
    await refreshPublic(['funding', 'startups', 'india-ai', 'home']); return { success: true };
  } catch (error) {
    console.error('Error updating funding digest:', error);
    return { success: false, error: 'Failed to update funding digest' };
  }
}

export async function deleteFundingDigestAction(id: string) {
  const { error } = await requireActionAuth(['SUPER_ADMIN']);
  if (error) return { success: false, error };
  try {
    await sql`
      DELETE FROM "FundingDigest" WHERE id = ${id}
    `;

    revalidatePath('/funding-dir');
    await refreshPublic(['funding', 'startups', 'india-ai', 'home']); return { success: true };
  } catch (error) {
    console.error('Error deleting funding digest:', error);
    return { success: false, error: 'Failed to delete funding digest' };
  }
}

export async function toggleFundingDigestStatusAction(id: string) {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  try {
    await sql`
      UPDATE "FundingDigest"
      SET status = CASE 
        WHEN status = 'PUBLISHED' THEN 'DRAFT'
        ELSE 'PUBLISHED'
      END
      WHERE id = ${id}
    `;

    revalidatePath('/funding-dir');
    await refreshPublic(['funding', 'startups', 'india-ai', 'home']); return { success: true };
  } catch (error) {
    console.error('Error toggling funding digest status:', error);
    return { success: false, error: 'Failed to toggle status' };
  }
}

// ── Funding Rounds (individual deals) ────────────────────────────────────────

export async function getFundingRoundsDirectAction() {
  const { error } = await requireActionAuth();
  if (error) return [];
  try {
    const rows = await sql`
      SELECT
        fr.id, fr."roundType", fr."amountUsd", fr."amountInr",
        fr."announcedAt"::text AS "announcedAt", fr."leadInvestors", fr."allInvestors",
        fr."valuation", fr."sourceUrl", fr."createdAt"::text AS "createdAt",
        s.name AS "startupName", s.id AS "startupId"
      FROM "FundingRound" fr
      JOIN "Startup" s ON s.id = fr."startupId"
      WHERE s."deletedAt" IS NULL
      ORDER BY fr."announcedAt" DESC
    `;
    return rows;
  } catch (error) {
    console.error('getFundingRoundsDirectAction error:', error);
    return [];
  }
}

export async function createFundingRoundDirectAction(data: {
  startupName: string;
  roundType: string;
  amountUsd?: string;
  announcedAt: string;
  leadInvestors: string[];
  allInvestors?: string[];
  valuation?: string;
  sourceUrl?: string;
  headquartersCity?: string;
  sector?: string;
}) {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  try {
    // Find or create startup by name
    let startupId: string;
    const existing = await sql`SELECT id FROM "Startup" WHERE name = ${data.startupName} AND "deletedAt" IS NULL LIMIT 1`;
    if (existing.length > 0) {
      startupId = (existing[0] as any).id;
    } else {
      const slug = data.startupName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const created = await sql`
        INSERT INTO "Startup" (id, name, slug, tagline, description, stage, "isIndian", "isFeatured", "createdAt", "updatedAt")
        VALUES (gen_random_uuid(), ${data.startupName}, ${slug}, ${data.startupName}, ${data.startupName}, 'SEED'::"StartupStage", true, false, NOW(), NOW())
        RETURNING id
      `;
      startupId = (created[0] as any).id;
    }

    await sql`
      INSERT INTO "FundingRound" (
        id, "startupId", "roundType", "amountUsd", "amountInr",
        "announcedAt", "leadInvestors", "allInvestors", valuation, "sourceUrl", "createdAt"
      ) VALUES (
        gen_random_uuid(), ${startupId}, ${data.roundType},
        ${data.amountUsd ? parseInt(data.amountUsd) : null},
        ${data.amountUsd ? BigInt(Math.round(parseInt(data.amountUsd) * 83)) : null},
        ${data.announcedAt}::timestamp,
        ${data.leadInvestors}, ${data.allInvestors || []},
        ${data.valuation ? parseInt(data.valuation) : null},
        ${data.sourceUrl || null}, NOW()
      )
    `;
    revalidatePath('/funding-dir');
    await refreshPublic(['funding', 'startups', 'india-ai', 'home']); return { success: true };
  } catch (error: any) {
    console.error('createFundingRoundDirectAction error:', error);
    return { success: false, error: error.message };
  }
}

export async function updateFundingRoundDirectAction(id: string, data: {
  startupName: string;
  roundType: string;
  amountUsd?: string;
  announcedAt: string;
  leadInvestors: string[];
  valuation?: string;
  sourceUrl?: string;
  headquartersCity?: string;
  sector?: string;
}) {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  try {
    await sql`
      UPDATE "FundingRound" SET
        "roundType" = ${data.roundType},
        "amountUsd" = ${data.amountUsd ? parseInt(data.amountUsd) : null},
        "announcedAt" = ${data.announcedAt}::timestamp,
        "leadInvestors" = ${data.leadInvestors},
        "valuation" = ${data.valuation ? parseInt(data.valuation) : null},
        "sourceUrl" = ${data.sourceUrl || null}
      WHERE id = ${id}
    `;
    revalidatePath('/funding-dir');
    await refreshPublic(['funding', 'startups', 'india-ai', 'home']); return { success: true };
  } catch (error: any) {
    console.error('updateFundingRoundDirectAction error:', error);
    return { success: false, error: error.message };
  }
}

export async function deleteFundingRoundDirectAction(id: string) {
  const { error } = await requireActionAuth(['SUPER_ADMIN']);
  if (error) return { success: false, error };
  try {
    await sql`DELETE FROM "FundingRound" WHERE id = ${id}`;
    revalidatePath('/funding-dir');
    await refreshPublic(['funding', 'startups', 'india-ai', 'home']); return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
