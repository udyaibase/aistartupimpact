'use server';

import { requireFounderAuth } from '@/lib/founder-auth';
import { sendAdminReviewAlert, sendSubmissionReceivedEmail } from '@/lib/founder-email';
import { prisma } from '@udyaibase/database';
import { revalidatePath } from 'next/cache';

interface ToolSubmission {
  name: string;
  tagline: string;
  description: string;
  websiteUrl: string;
  affiliateUrl?: string;
  categoryId: string;
  pricingModel: string;
  pricingUrl?: string;
  startingPrice?: number;
  freeTrialDays?: number;
  demoVideoUrl?: string;
  hasApi: boolean;
  hasMobileApp: boolean;
  launchYear: number;
  founderNames?: string[];
  headquartersCountry?: string;
  features: string[];
  useCases: string[];
  logoUrl?: string;
  screenshotUrls: string[];
  faqs?: Array<{ question: string; answer: string; order: number }>;
  tagIds?: string[];
  pros?: string[];
  cons?: string[];
  twitterUrl?: string;
  linkedinUrl?: string;
  socialLinks?: Array<{ platform: string; url: string }>;
}

export async function submitToolAction(data: ToolSubmission) {
  try {
    const session = await requireFounderAuth();
    if (data.tagline) data.tagline = data.tagline.trim().slice(0, 100);

    // Generate slug from name
    const slug = data.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    // Check if tool with same name already exists for this founder
    const existingByName = await prisma.$queryRaw<any[]>`
      SELECT id FROM "AiTool"
      WHERE LOWER(name) = LOWER(${data.name})
        AND "ownerId" = ${session.userId}
        AND "deletedAt" IS NULL
      LIMIT 1
    `;

    if (existingByName.length > 0) {
      return {
        success: false,
        error: 'You have already submitted a tool with this name. View it in your dashboard.',
      };
    }

    // Check if slug already exists globally
    const existing = await prisma.$queryRaw<any[]>`
      SELECT id FROM "AiTool" WHERE slug = ${slug} AND "deletedAt" IS NULL LIMIT 1
    `;

    if (existing.length > 0) {
      return {
        success: false,
        error: 'A tool with this name already exists on the platform',
      };
    }

    // Get category ID from submission or use first available
    let categoryId = data.categoryId;
    
    if (!categoryId) {
      const categories = await prisma.$queryRaw<any[]>`
        SELECT id FROM "ToolCategory" LIMIT 1
      `;
      
      if (categories.length === 0) {
        // Create a default category if none exists
        const newCategories = await prisma.$queryRaw<any[]>`
          INSERT INTO "ToolCategory" (id, name, slug, description, "createdAt")
          VALUES (gen_random_uuid(), 'General', 'general', 'General AI tools', NOW())
          RETURNING id
        `;
        categoryId = newCategories[0].id;
      } else {
        categoryId = categories[0].id;
      }
    }

    // Convert starting price to paise (cents)
    const startingPricePaise = data.startingPrice 
      ? Math.round(data.startingPrice * 100) 
      : null;

    const socialLinksJson = data.socialLinks && data.socialLinks.length > 0
      ? JSON.stringify(data.socialLinks)
      : null;

    // Create tool using raw SQL to avoid date validation issues
    const tools = await prisma.$queryRaw<any[]>`
      INSERT INTO "AiTool" (
        id, name, slug, tagline, description, "websiteUrl", "affiliateUrl",
        "pricingModel", "pricingUrl", "startingPrice", "freeTrialDays", "demoVideoUrl", "hasApi", "hasMobileApp",
        "launchYear", "founderNames", "headquartersCountry", "logoUrl", "screenshotUrls",
        "twitterUrl", "linkedinUrl", "socialLinks",
        "categoryId", "ownerId", "claimStatus", status, "submittedBy", "createdAt", "updatedAt"
      ) VALUES (
        gen_random_uuid(), ${data.name}, ${slug}, ${data.tagline}, ${data.description},
        ${data.websiteUrl}, ${data.affiliateUrl || null},
        ${data.pricingModel}, ${data.pricingUrl || null}, ${startingPricePaise},
        ${data.freeTrialDays || null},
        ${data.demoVideoUrl || null},
        ${data.hasApi}, ${data.hasMobileApp}, ${data.launchYear},
        ${data.founderNames || []}::text[], ${data.headquartersCountry || null},
        ${data.logoUrl || null}, ${data.screenshotUrls}::text[],
        ${data.twitterUrl || null}, ${data.linkedinUrl || null}, ${socialLinksJson}::jsonb,
        ${categoryId}, ${session.userId}, 'PENDING', 'PENDING', ${session.userId},
        NOW(), NOW()
      )
      RETURNING id
    `;

    const toolId = tools[0].id;

    // Create features as ToolUseCase entries (zero-padded index for ORDER BY id)
    if (data.features.length > 0) {
      await prisma.toolUseCase.createMany({
        data: data.features.map((text, index) => ({
          id: `${String(index).padStart(4, '0')}_${crypto.randomUUID()}`,
          toolId: toolId,
          text,
          type: 'feature',
        })),
      });
    }

    // Create use cases
    if (data.useCases.length > 0) {
      await prisma.toolUseCase.createMany({
        data: data.useCases.map((text, index) => ({
          id: `${String(index).padStart(4, '0')}_${crypto.randomUUID()}`,
          toolId: toolId,
          text,
          type: 'use_case',
        })),
      });
    }

    // Create FAQs if provided
    if (data.faqs && data.faqs.length > 0) {
      for (const faq of data.faqs) {
        await prisma.$queryRaw`
          INSERT INTO "ToolFAQ" (id, "toolId", question, answer, "order", "createdAt", "updatedAt")
          VALUES (gen_random_uuid()::text, ${toolId}, ${faq.question}, ${faq.answer}, ${faq.order}, NOW(), NOW())
        `;
      }
    }

    // Create tag mappings if provided (max 30)
    if (data.tagIds && data.tagIds.length > 0) {
      const cappedTagIds = data.tagIds.slice(0, 30);
      for (const tagId of cappedTagIds) {
        await prisma.$queryRaw`
          INSERT INTO "ToolSystemTagMapping" (id, "toolId", "tagId", "addedBy", "createdAt")
          VALUES (gen_random_uuid(), ${toolId}, ${tagId}, 'founder', NOW())
          ON CONFLICT ("toolId", "tagId") DO NOTHING
        `;
      }
      // Increment tag counts
      await prisma.$queryRaw`
        UPDATE "ToolSystemTag"
        SET "tagCount" = "tagCount" + 1, "updatedAt" = NOW()
        WHERE id = ANY(${cappedTagIds}::text[])
      `;
    }

    // Create pros
    if (data.pros && data.pros.length > 0) {
      for (const text of data.pros) {
        if (text.trim()) {
          await prisma.$queryRaw`INSERT INTO "ToolPro" (id, "toolId", text) VALUES (gen_random_uuid(), ${toolId}, ${text.trim()})`;
        }
      }
    }

    // Create cons
    if (data.cons && data.cons.length > 0) {
      for (const text of data.cons) {
        if (text.trim()) {
          await prisma.$queryRaw`INSERT INTO "ToolCon" (id, "toolId", text) VALUES (gen_random_uuid(), ${toolId}, ${text.trim()})`;
        }
      }
    }

    // Confirm to the founder and alert the review team (fire-and-forget)
    const founderInfo = await prisma.$queryRaw<any[]>`
      SELECT email, name FROM "FounderUser" WHERE id = ${session.userId} LIMIT 1
    `;
    if (founderInfo.length > 0) {
      sendSubmissionReceivedEmail(founderInfo[0].email, founderInfo[0].name, 'tool', data.name)
        .catch(err => console.error('Submission email error:', err));
      sendAdminReviewAlert({ entityType: 'tool', entityName: data.name, founderEmail: founderInfo[0].email, reason: 'new' });
    }

    revalidatePath('/founder/tools');
    revalidatePath('/founder/dashboard');

    return { success: true };
  } catch (error: any) {
    console.error('Tool submission error:', error);
    return {
      success: false,
      error: error.message || 'Failed to submit tool',
    };
  }
}

export async function updateToolAction(id: string, data: ToolSubmission) {
  try {
    const session = await requireFounderAuth();

    // Verify ownership using raw SQL
    const tools = await prisma.$queryRaw<any[]>`
      SELECT id, slug, name, "claimStatus", "ownerId"
      FROM "AiTool"
      WHERE id = ${id}
      LIMIT 1
    `;

    if (tools.length === 0 || tools[0].ownerId !== session.userId) {
      return {
        success: false,
        error: 'Tool not found or you do not have permission to edit it',
      };
    }

    const tool = tools[0];

    // Generate new slug if name changed
    let slug = tool.slug;
    if (data.name !== tool.name) {
      slug = data.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

      // Check if new slug already exists using raw SQL
      const existingTools = await prisma.$queryRaw<any[]>`
        SELECT id FROM "AiTool" 
        WHERE slug = ${slug} AND id != ${id}
        LIMIT 1
      `;

      if (existingTools.length > 0) {
        return {
          success: false,
          error: 'A tool with this name already exists',
        };
      }
    }

    // Convert starting price to paise (cents)
    const startingPricePaise = data.startingPrice 
      ? Math.round(data.startingPrice * 100) 
      : null;

    // Update tool
    // Keep the current status - no need for re-approval after initial approval
    // This allows founders to edit freely once their tool is approved

    const socialLinksJson = data.socialLinks && data.socialLinks.length > 0
      ? JSON.stringify(data.socialLinks)
      : null;

    // Use raw SQL to avoid date validation issues
    await prisma.$queryRaw`
      UPDATE "AiTool"
      SET
        name = ${data.name},
        slug = ${slug},
        tagline = ${data.tagline},
        description = ${data.description},
        "websiteUrl" = ${data.websiteUrl},
        "affiliateUrl" = ${data.affiliateUrl || null},
        "categoryId" = ${data.categoryId},
        "pricingModel" = ${data.pricingModel}::"PricingModel",
        "pricingUrl" = ${data.pricingUrl || null},
        "startingPrice" = ${startingPricePaise},
        "hasApi" = ${data.hasApi},
        "hasMobileApp" = ${data.hasMobileApp},
        "launchYear" = ${data.launchYear},
        "founderNames" = ${data.founderNames || []}::text[],
        "headquartersCountry" = ${data.headquartersCountry || null},
        "logoUrl" = ${data.logoUrl || null},
        "screenshotUrls" = ${data.screenshotUrls}::text[],
        "twitterUrl" = ${data.twitterUrl || null},
        "linkedinUrl" = ${data.linkedinUrl || null},
        "socialLinks" = ${socialLinksJson}::jsonb,
        "demoVideoUrl" = ${data.demoVideoUrl || null},
        "freeTrialDays" = ${data.freeTrialDays || null},
        "updatedAt" = NOW()
      WHERE id = ${id}
    `;

    // Delete existing use cases using raw SQL
    await prisma.$queryRaw`
      DELETE FROM "ToolUseCase"
      WHERE "toolId" = ${id}
    `;

    // Create new features using raw SQL (zero-padded index for ORDER BY id)
    if (data.features.length > 0) {
      for (let i = 0; i < data.features.length; i++) {
        const orderedId = `${String(i).padStart(4, '0')}_${crypto.randomUUID()}`;
        await prisma.$queryRaw`
          INSERT INTO "ToolUseCase" (id, "toolId", text, type)
          VALUES (${orderedId}, ${id}, ${data.features[i]}, 'feature')
        `;
      }
    }

    // Create new use cases using raw SQL
    if (data.useCases.length > 0) {
      for (let i = 0; i < data.useCases.length; i++) {
        const orderedId = `${String(i).padStart(4, '0')}_${crypto.randomUUID()}`;
        await prisma.$queryRaw`
          INSERT INTO "ToolUseCase" (id, "toolId", text, type)
          VALUES (${orderedId}, ${id}, ${data.useCases[i]}, 'use_case')
        `;
      }
    }

    // Update FAQs if provided
    if (data.faqs !== undefined) {
      // Delete existing FAQs
      await prisma.$queryRaw`DELETE FROM "ToolFAQ" WHERE "toolId" = ${id}`;
      
      // Insert new FAQs
      if (data.faqs.length > 0) {
        for (const faq of data.faqs) {
          await prisma.$queryRaw`
            INSERT INTO "ToolFAQ" (id, "toolId", question, answer, "order", "createdAt", "updatedAt")
            VALUES (gen_random_uuid()::text, ${id}, ${faq.question}, ${faq.answer}, ${faq.order}, NOW(), NOW())
          `;
        }
      }
    }

    // Update pros
    if (data.pros !== undefined) {
      await prisma.$queryRaw`DELETE FROM "ToolPro" WHERE "toolId" = ${id}`;
      if (data.pros.length > 0) {
        for (const text of data.pros) {
          if (text.trim()) {
            await prisma.$queryRaw`INSERT INTO "ToolPro" (id, "toolId", text) VALUES (gen_random_uuid(), ${id}, ${text.trim()})`;
          }
        }
      }
    }

    // Update cons
    if (data.cons !== undefined) {
      await prisma.$queryRaw`DELETE FROM "ToolCon" WHERE "toolId" = ${id}`;
      if (data.cons.length > 0) {
        for (const text of data.cons) {
          if (text.trim()) {
            await prisma.$queryRaw`INSERT INTO "ToolCon" (id, "toolId", text) VALUES (gen_random_uuid(), ${id}, ${text.trim()})`;
          }
        }
      }
    }

    // Update tags if provided
    if (data.tagIds !== undefined) {
      const cappedTagIds = data.tagIds.slice(0, 30);

      // Get existing tag mappings
      const existingMappings = await prisma.$queryRaw<any[]>`
        SELECT "tagId" FROM "ToolSystemTagMapping" WHERE "toolId" = ${id}
      `;
      const existingIds = new Set(existingMappings.map((r: any) => r.tagId));
      const newIds = new Set(cappedTagIds);

      // Tags to remove
      const toRemove = [...existingIds].filter(tid => !newIds.has(tid));
      // Tags to add
      const toAdd = cappedTagIds.filter(tid => !existingIds.has(tid));

      if (toRemove.length > 0) {
        await prisma.$queryRaw`
          DELETE FROM "ToolSystemTagMapping"
          WHERE "toolId" = ${id} AND "tagId" = ANY(${toRemove}::text[])
        `;
        await prisma.$queryRaw`
          UPDATE "ToolSystemTag"
          SET "tagCount" = GREATEST("tagCount" - 1, 0), "updatedAt" = NOW()
          WHERE id = ANY(${toRemove}::text[])
        `;
      }

      if (toAdd.length > 0) {
        for (const tagId of toAdd) {
          await prisma.$queryRaw`
            INSERT INTO "ToolSystemTagMapping" (id, "toolId", "tagId", "addedBy", "createdAt")
            VALUES (gen_random_uuid(), ${id}, ${tagId}, 'founder', NOW())
            ON CONFLICT ("toolId", "tagId") DO NOTHING
          `;
        }
        await prisma.$queryRaw`
          UPDATE "ToolSystemTag"
          SET "tagCount" = "tagCount" + 1, "updatedAt" = NOW()
          WHERE id = ANY(${toAdd}::text[])
        `;
      }
    }


    revalidatePath('/founder/tools');
    revalidatePath(`/founder/tools/${id}`);
    revalidatePath('/founder/dashboard');

    return { success: true };
  } catch (error: any) {
    console.error('Tool update error:', error);
    return {
      success: false,
      error: error.message || 'Failed to update tool',
    };
  }
}

// ─── Tag System Actions (Founder) ───────────────────────────────────────────

export async function getTagGroupsForFounderAction() {
  try {
    const groups = await prisma.$queryRaw<any[]>`
      SELECT id, name, slug, icon, description, "sortOrder", "displayMode", "maxVisibleDefault", "isAdminOnly", "isActive"
      FROM "ToolTagGroup"
      WHERE "isActive" = true AND "isAdminOnly" = false
      ORDER BY "sortOrder" ASC
    `;

    const tags = await prisma.$queryRaw<any[]>`
      SELECT id, name, slug, emoji, "groupId", "sortOrder", "isActive", "tagCount"
      FROM "ToolSystemTag"
      WHERE "isActive" = true
      ORDER BY "sortOrder" ASC, name ASC
    `;

    // Group tags by groupId
    const tagsByGroup: Record<string, any[]> = {};
    for (const tag of tags) {
      const gid = tag.groupId;
      if (!tagsByGroup[gid]) tagsByGroup[gid] = [];
      tagsByGroup[gid].push(tag);
    }

    return groups.map((g: any) => ({
      ...g,
      tags: tagsByGroup[g.id] || [],
    }));
  } catch (error) {
    console.error('getTagGroupsForFounderAction error:', error);
    return [];
  }
}

export async function getToolTagIdsAction(toolId: string) {
  try {
    const session = await requireFounderAuth();

    // Verify ownership
    const tools = await prisma.$queryRaw<any[]>`
      SELECT id FROM "AiTool" WHERE id = ${toolId} AND "ownerId" = ${session.userId} LIMIT 1
    `;
    if (tools.length === 0) return [];

    const mappings = await prisma.$queryRaw<any[]>`
      SELECT "tagId" FROM "ToolSystemTagMapping" WHERE "toolId" = ${toolId}
    `;
    return mappings.map((m: any) => m.tagId);
  } catch (error) {
    console.error('getToolTagIdsAction error:', error);
    return [];
  }
}

// ─── Review Responses ───────────────────────────────────────────────────────

export async function respondToReviewAction(reviewId: string, body: string) {
  try {
    const session = await requireFounderAuth();

    if (!body.trim() || body.length > 1000) {
      return { success: false, error: 'Response must be 1-1000 characters' };
    }

    // Verify the review exists and the founder owns the tool
    const reviews = await prisma.$queryRaw<any[]>`
      SELECT r.id, r."toolId", t."ownerId"
      FROM "ToolReview" r
      JOIN "AiTool" t ON t.id = r."toolId"
      WHERE r.id = ${reviewId}
      LIMIT 1
    `;

    if (reviews.length === 0) return { success: false, error: 'Review not found' };
    if (reviews[0].ownerId !== session.userId) return { success: false, error: 'Not authorized' };

    // Check if response already exists
    const existing = await prisma.$queryRaw<any[]>`
      SELECT id FROM "ToolReviewResponse" WHERE "reviewId" = ${reviewId} LIMIT 1
    `;
    if (existing.length > 0) return { success: false, error: 'Already responded to this review' };

    // Insert response
    await prisma.$queryRaw`
      INSERT INTO "ToolReviewResponse" (id, "reviewId", "founderId", body, "createdAt", "updatedAt")
      VALUES (gen_random_uuid(), ${reviewId}, ${session.userId}, ${body.trim()}, NOW(), NOW())
    `;

    return { success: true };
  } catch (error: any) {
    console.error('respondToReviewAction error:', error);
    return { success: false, error: error.message || 'Failed to respond' };
  }
}

export async function getReviewResponsesAction(toolId: string) {
  try {
    const responses = await prisma.$queryRaw<any[]>`
      SELECT rr.id, rr."reviewId", rr.body, rr."createdAt",
             fu.name AS "founderName"
      FROM "ToolReviewResponse" rr
      JOIN "FounderUser" fu ON fu.id = rr."founderId"
      JOIN "ToolReview" tr ON tr.id = rr."reviewId"
      WHERE tr."toolId" = ${toolId}
    `;
    return responses;
  } catch (error) {
    console.error('getReviewResponsesAction error:', error);
    return [];
  }
}

// ─── Referral System ────────────────────────────────────────────────────────

export async function getFounderReferralCodeAction() {
  try {
    const session = await requireFounderAuth();

    // Check if founder has any tools with referral codes
    const tools = await prisma.$queryRaw<any[]>`
      SELECT id, name, "referralCode"
      FROM "AiTool"
      WHERE "ownerId" = ${session.userId} AND "deletedAt" IS NULL AND "referralCode" IS NOT NULL
      LIMIT 1
    `;

    if (tools.length > 0) {
      return { code: tools[0].referralCode, toolName: tools[0].name };
    }

    // Generate a referral code for the founder's first tool
    const allTools = await prisma.$queryRaw<any[]>`
      SELECT id, name FROM "AiTool"
      WHERE "ownerId" = ${session.userId} AND "deletedAt" IS NULL
      ORDER BY "createdAt" ASC LIMIT 1
    `;

    if (allTools.length === 0) return { code: null };

    const code = 'REF_' + session.userId.substring(0, 6).toUpperCase() + '_' + Math.random().toString(36).substring(2, 6).toUpperCase();
    await prisma.$queryRaw`
      UPDATE "AiTool" SET "referralCode" = ${code} WHERE id = ${allTools[0].id}
    `;

    return { code, toolName: allTools[0].name };
  } catch (error) {
    console.error('getFounderReferralCodeAction error:', error);
    return { code: null };
  }
}

export async function getReferralStatsAction() {
  try {
    const session = await requireFounderAuth();

    const referred = await prisma.$queryRaw<any[]>`
      SELECT COUNT(*)::int AS count
      FROM "AiTool"
      WHERE "referredBy" = ${session.userId} AND "deletedAt" IS NULL
    `;

    return { referredCount: referred[0]?.count || 0 };
  } catch (error) {
    return { referredCount: 0 };
  }
}
