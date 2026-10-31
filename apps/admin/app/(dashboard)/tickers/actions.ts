'use server';

import { neon } from '@neondatabase/serverless';
import { revalidatePath } from 'next/cache';
import { requireActionAuth } from '@/lib/api-auth';
import { refreshPublic } from '@/lib/refresh-public';

const sql = neon(process.env.DATABASE_URL!);

// ═══════════════════════════════════════════════════════
// BREAKING TICKER ACTIONS
// ═══════════════════════════════════════════════════════

export async function getBreakingTickersAction() {
  const { error } = await requireActionAuth();
  if (error) return [];
  try {
    const tickers = await sql`
      SELECT id, text, "isActive", "sortOrder", "createdAt", "updatedAt"
      FROM "BreakingTicker"
      ORDER BY "sortOrder" ASC, "createdAt" DESC
    `;
    return tickers;
  } catch (error) {
    console.error('Error fetching breaking tickers:', error);
    return [];
  }
}

export async function createBreakingTickerAction(text: string) {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  try {
    // Get the next sort order
    const maxOrder = await sql`
      SELECT COALESCE(MAX("sortOrder"), -1) + 1 as "nextOrder"
      FROM "BreakingTicker"
    `;
    const nextOrder = (maxOrder as any)[0]?.nextOrder || 0;

    await sql`
      INSERT INTO "BreakingTicker" (id, text, "isActive", "sortOrder", "createdAt", "updatedAt")
      VALUES (gen_random_uuid(), ${text}, true, ${nextOrder}, NOW(), NOW())
    `;

    revalidatePath('/tickers');
    await refreshPublic(['home']); return { success: true };
  } catch (error) {
    console.error('Error creating breaking ticker:', error);
    return { success: false, error: 'Failed to create ticker' };
  }
}

export async function updateBreakingTickerAction(id: string, text: string, isActive: boolean) {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  try {
    await sql`
      UPDATE "BreakingTicker"
      SET text = ${text}, "isActive" = ${isActive}, "updatedAt" = NOW()
      WHERE id = ${id}
    `;

    revalidatePath('/tickers');
    await refreshPublic(['home']); return { success: true };
  } catch (error) {
    console.error('Error updating breaking ticker:', error);
    return { success: false, error: 'Failed to update ticker' };
  }
}

export async function deleteBreakingTickerAction(id: string) {
  const { error } = await requireActionAuth(['SUPER_ADMIN']);
  if (error) return { success: false, error };
  try {
    await sql`
      DELETE FROM "BreakingTicker" WHERE id = ${id}
    `;

    revalidatePath('/tickers');
    await refreshPublic(['home']); return { success: true };
  } catch (error) {
    console.error('Error deleting breaking ticker:', error);
    return { success: false, error: 'Failed to delete ticker' };
  }
}

export async function reorderBreakingTickersAction(tickerIds: string[]) {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  try {
    for (let i = 0; i < tickerIds.length; i++) {
      await sql`
        UPDATE "BreakingTicker"
        SET "sortOrder" = ${i}, "updatedAt" = NOW()
        WHERE id = ${tickerIds[i]}
      `;
    }

    revalidatePath('/tickers');
    await refreshPublic(['home']); return { success: true };
  } catch (error) {
    console.error('Error reordering breaking tickers:', error);
    return { success: false, error: 'Failed to reorder tickers' };
  }
}

// ═══════════════════════════════════════════════════════
// LIVE TICKER ACTIONS
// ═══════════════════════════════════════════════════════

export async function getLiveTickersAction() {
  const { error } = await requireActionAuth();
  if (error) return [];
  try {
    const tickers = await sql`
      SELECT id, text, "isActive", "sortOrder", "createdAt", "updatedAt"
      FROM "LiveTicker"
      ORDER BY "sortOrder" ASC, "createdAt" DESC
    `;
    return tickers;
  } catch (error) {
    console.error('Error fetching live tickers:', error);
    return [];
  }
}

export async function createLiveTickerAction(text: string) {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  try {
    // Get the next sort order
    const maxOrder = await sql`
      SELECT COALESCE(MAX("sortOrder"), -1) + 1 as "nextOrder"
      FROM "LiveTicker"
    `;
    const nextOrder = (maxOrder as any)[0]?.nextOrder || 0;

    await sql`
      INSERT INTO "LiveTicker" (id, text, "isActive", "sortOrder", "createdAt", "updatedAt")
      VALUES (gen_random_uuid(), ${text}, true, ${nextOrder}, NOW(), NOW())
    `;

    revalidatePath('/tickers');
    await refreshPublic(['home']); return { success: true };
  } catch (error) {
    console.error('Error creating live ticker:', error);
    return { success: false, error: 'Failed to create ticker' };
  }
}

export async function updateLiveTickerAction(id: string, text: string, isActive: boolean) {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  try {
    await sql`
      UPDATE "LiveTicker"
      SET text = ${text}, "isActive" = ${isActive}, "updatedAt" = NOW()
      WHERE id = ${id}
    `;

    revalidatePath('/tickers');
    await refreshPublic(['home']); return { success: true };
  } catch (error) {
    console.error('Error updating live ticker:', error);
    return { success: false, error: 'Failed to update ticker' };
  }
}

export async function deleteLiveTickerAction(id: string) {
  const { error } = await requireActionAuth(['SUPER_ADMIN']);
  if (error) return { success: false, error };
  try {
    await sql`
      DELETE FROM "LiveTicker" WHERE id = ${id}
    `;

    revalidatePath('/tickers');
    await refreshPublic(['home']); return { success: true };
  } catch (error) {
    console.error('Error deleting live ticker:', error);
    return { success: false, error: 'Failed to delete ticker' };
  }
}

export async function reorderLiveTickersAction(tickerIds: string[]) {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  try {
    for (let i = 0; i < tickerIds.length; i++) {
      await sql`
        UPDATE "LiveTicker"
        SET "sortOrder" = ${i}, "updatedAt" = NOW()
        WHERE id = ${tickerIds[i]}
      `;
    }

    revalidatePath('/tickers');
    await refreshPublic(['home']); return { success: true };
  } catch (error) {
    console.error('Error reordering live tickers:', error);
    return { success: false, error: 'Failed to reorder tickers' };
  }
}