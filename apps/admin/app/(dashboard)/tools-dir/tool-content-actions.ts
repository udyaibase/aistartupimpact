'use server';

import { neon } from '@neondatabase/serverless';
import { revalidatePath } from 'next/cache';
import { invalidateToolCache } from '@/lib/cache-invalidate';
import { requireActionAuth } from '@/lib/api-auth';
import { refreshPublic } from '@/lib/refresh-public';
import { publicError } from '@/lib/public-error';

const sql = neon(process.env.DATABASE_URL!);

export async function getToolFAQsAction(toolId: string) {
  const { error } = await requireActionAuth();
  if (error) return [];
  try {
    const faqs = await sql`
      SELECT id, question, answer, "order"
      FROM "ToolFAQ"
      WHERE "toolId" = ${toolId}
      ORDER BY "order" ASC
    `;
    return faqs.map((faq: any) => ({
      id: faq.id,
      question: faq.question,
      answer: faq.answer,
      order: faq.order,
    }));
  } catch (error) {
    console.error('getToolFAQsAction error:', error);
    return [];
  }
}

export async function getToolProsConsAction(toolId: string) {
  const { error } = await requireActionAuth();
  if (error) return { pros: [], cons: [] };
  try {
    const [pros, cons] = await Promise.all([
      sql`SELECT id, text FROM "ToolPro" WHERE "toolId" = ${toolId} ORDER BY id ASC`,
      sql`SELECT id, text FROM "ToolCon" WHERE "toolId" = ${toolId} ORDER BY id ASC`,
    ]);
    return {
      pros: pros.map((p: any) => ({ id: p.id, text: p.text })),
      cons: cons.map((c: any) => ({ id: c.id, text: c.text })),
    };
  } catch (error) {
    console.error('getToolProsConsAction error:', error);
    return { pros: [], cons: [] };
  }
}

export async function updateToolProsConsAction(toolId: string, data: { pros: string[]; cons: string[] }) {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  try {
    // Delete existing
    await sql`DELETE FROM "ToolPro" WHERE "toolId" = ${toolId}`;
    await sql`DELETE FROM "ToolCon" WHERE "toolId" = ${toolId}`;

    // Insert new pros
    for (const text of data.pros) {
      if (text.trim()) {
        await sql`INSERT INTO "ToolPro" (id, "toolId", text) VALUES (gen_random_uuid()::text, ${toolId}, ${text.trim()})`;
      }
    }

    // Insert new cons
    for (const text of data.cons) {
      if (text.trim()) {
        await sql`INSERT INTO "ToolCon" (id, "toolId", text) VALUES (gen_random_uuid()::text, ${toolId}, ${text.trim()})`;
      }
    }

    revalidatePath('/tools-dir');
    invalidateToolCache();
    await refreshPublic(['tools', 'home']); return { success: true };
  } catch (error: any) {
    console.error('updateToolProsConsAction error:', error);
    return { success: false, error: publicError(error) };
  }
}

// ─── Tool Featured Campaign System ─────────────────────────────────────────

export async function searchStartupsForLinkAction(query: string) {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  try {
    if (!query || query.length < 2) return [];
    const results = await sql`
      SELECT id, name, slug, "logoUrl", stage, "headquartersCity"
      FROM "Startup"
      WHERE "deletedAt" IS NULL
        AND (LOWER(name) LIKE ${'%' + query.toLowerCase() + '%'} OR LOWER(slug) LIKE ${'%' + query.toLowerCase() + '%'})
      ORDER BY name ASC
      LIMIT 10
    `;
    return results;
  } catch (error) {
    console.error('searchStartupsForLinkAction error:', error);
    return [];
  }
}

export async function linkToolToStartupAction(toolId: string, startupId: string | null) {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  try {
    await sql`
      UPDATE "AiTool" SET "startupId" = ${startupId}, "updatedAt" = NOW()
      WHERE id = ${toolId}
    `;
    revalidatePath('/tools-dir');
    invalidateToolCache();
    await refreshPublic(['tools', 'home']); return { success: true };
  } catch (error: any) {
    console.error('linkToolToStartupAction error:', error);
    return { success: false, error: publicError(error) };
  }
}

export async function getLinkedStartupAction(toolId: string) {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  try {
    const rows = await sql`
      SELECT s.id, s.name, s.slug, s."logoUrl", s.stage, s."headquartersCity", s."totalFundingInr", s."employeeCount", s."foundedYear"
      FROM "AiTool" t
      JOIN "Startup" s ON s.id = t."startupId"
      WHERE t.id = ${toolId} AND s."deletedAt" IS NULL
      LIMIT 1
    `;
    return rows.length > 0 ? rows[0] : null;
  } catch (error) {
    console.error('getLinkedStartupAction error:', error);
    return null;
  }
}

export async function getToolAlternativesAction(toolId: string) {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  try {
    const rows = await sql`
      SELECT a.id, a."alternativeId", a.source,
             t.name, t.slug, t."logoUrl", t.tagline, t."avgRating", t."pricingModel"
      FROM "ToolAlternative" a
      JOIN "AiTool" t ON t.id = a."alternativeId"
      WHERE a."toolId" = ${toolId} AND t."deletedAt" IS NULL
      ORDER BY a."createdAt" DESC
    `;
    return rows;
  } catch (error) {
    console.error('getToolAlternativesAction error:', error);
    return [];
  }
}

export async function addToolAlternativeAction(toolId: string, alternativeId: string) {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  try {
    if (toolId === alternativeId) return { success: false, error: 'A tool cannot be its own alternative' };

    // Check if already linked
    const existing = await sql`SELECT id FROM "ToolAlternative" WHERE "toolId" = ${toolId} AND "alternativeId" = ${alternativeId} LIMIT 1`;
    if (existing.length > 0) return { success: false, error: 'Already linked as alternative' };

    // Insert bidirectional: A→B and B→A
    await sql`INSERT INTO "ToolAlternative" (id, "toolId", "alternativeId", source) VALUES (gen_random_uuid(), ${toolId}, ${alternativeId}, 'admin') ON CONFLICT DO NOTHING`;
    await sql`INSERT INTO "ToolAlternative" (id, "toolId", "alternativeId", source) VALUES (gen_random_uuid(), ${alternativeId}, ${toolId}, 'admin') ON CONFLICT DO NOTHING`;

    revalidatePath('/tools-dir');
    invalidateToolCache();
    await refreshPublic(['tools', 'home']); return { success: true };
  } catch (error: any) {
    console.error('addToolAlternativeAction error:', error);
    return { success: false, error: publicError(error) };
  }
}

export async function removeToolAlternativeAction(toolId: string, alternativeId: string) {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  try {
    // Remove both directions
    await sql`DELETE FROM "ToolAlternative" WHERE ("toolId" = ${toolId} AND "alternativeId" = ${alternativeId}) OR ("toolId" = ${alternativeId} AND "alternativeId" = ${toolId})`;
    revalidatePath('/tools-dir');
    invalidateToolCache();
    await refreshPublic(['tools', 'home']); return { success: true };
  } catch (error: any) {
    return { success: false, error: publicError(error) };
  }
}

export async function searchToolsForAlternativeAction(query: string, excludeToolId: string) {
  const { error } = await requireActionAuth();
  if (error) return { success: false, error };
  try {
    if (!query || query.length < 2) return [];
    const results = await sql`
      SELECT id, name, slug, "logoUrl", "pricingModel", "avgRating"
      FROM "AiTool"
      WHERE "deletedAt" IS NULL AND status = 'APPROVED'
        AND id != ${excludeToolId}
        AND (LOWER(name) LIKE ${'%' + query.toLowerCase() + '%'} OR LOWER(slug) LIKE ${'%' + query.toLowerCase() + '%'})
      ORDER BY name ASC
      LIMIT 10
    `;
    return results;
  } catch (error) {
    console.error('searchToolsForAlternativeAction error:', error);
    return [];
  }
}


// ─── Sprint 4: Bulk Actions ─────────────────────────────────────────────────
