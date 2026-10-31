'use server';

import { neon } from '@neondatabase/serverless';
import { revalidatePath } from 'next/cache';
import { requireActionAuth } from '@/lib/api-auth';
import { refreshPublic } from '@/lib/refresh-public';

const sql = neon(process.env.DATABASE_URL!);

export async function getFundingRoundsAction() {
  const { error } = await requireActionAuth();
  if (error) return [];
  try {
    const fundingRounds = await sql`
      SELECT 
        fr.id, fr."roundType", fr."amountInr", fr."announcedAt", fr."leadInvestors", 
        fr."allInvestors", fr."valuation", fr."sourceUrl", fr."createdAt",
        s.name as "startupName", s.id as "startupId"
      FROM "FundingRound" fr
      JOIN "Startup" s ON s.id = fr."startupId"
      WHERE s."deletedAt" IS NULL
      ORDER BY fr."announcedAt" DESC
    `;
    return fundingRounds;
  } catch (error) {
    console.error('Error fetching funding rounds:', error);
    return [];
  }
}

export async function getStartupsForDropdownAction() {
  const { error } = await requireActionAuth();
  if (error) return [];
  try {
    const startups = await sql`
      SELECT id, name
      FROM "Startup"
      WHERE "deletedAt" IS NULL
      ORDER BY name ASC
    `;
    return startups;
  } catch (error) {
    console.error('Error fetching startups:', error);
    return [];
  }
}

export async function createFundingRoundAction(data: {
  startupId: string;
  roundType: string;
  amountInr: string;
  announcedAt: string;
  leadInvestors: string[];
  sourceUrl?: string;
}) {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  try {
    await sql`
      INSERT INTO "FundingRound" (
        id, "startupId", "roundType", "amountInr", "announcedAt", 
        "leadInvestors", "createdAt"
      )
      VALUES (
        gen_random_uuid(), ${data.startupId}, ${data.roundType}, 
        ${BigInt(data.amountInr)}, ${data.announcedAt}::timestamp,
        ${data.leadInvestors}, NOW()
      )
    `;

    revalidatePath('/funding-rounds');
    await refreshPublic(['funding', 'startups', 'india-ai', 'home']); return { success: true };
  } catch (error) {
    console.error('Error creating funding round:', error);
    return { success: false, error: 'Failed to create funding round' };
  }
}

export async function updateFundingRoundAction(id: string, data: {
  startupId: string;
  roundType: string;
  amountInr: string;
  announcedAt: string;
  leadInvestors: string[];
  sourceUrl?: string;
}) {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  try {
    await sql`
      UPDATE "FundingRound"
      SET 
        "startupId" = ${data.startupId},
        "roundType" = ${data.roundType},
        "amountInr" = ${BigInt(data.amountInr)},
        "announcedAt" = ${data.announcedAt}::timestamp,
        "leadInvestors" = ${data.leadInvestors}
      WHERE id = ${id}
    `;

    revalidatePath('/funding-rounds');
    await refreshPublic(['funding', 'startups', 'india-ai', 'home']); return { success: true };
  } catch (error) {
    console.error('Error updating funding round:', error);
    return { success: false, error: 'Failed to update funding round' };
  }
}

export async function deleteFundingRoundAction(id: string) {
  const { error } = await requireActionAuth(['SUPER_ADMIN']);
  if (error) return { success: false, error };
  try {
    await sql`
      DELETE FROM "FundingRound" WHERE id = ${id}
    `;

    revalidatePath('/funding-rounds');
    await refreshPublic(['funding', 'startups', 'india-ai', 'home']); return { success: true };
  } catch (error) {
    console.error('Error deleting funding round:', error);
    return { success: false, error: 'Failed to delete funding round' };
  }
}