"use server";

import { getUserSession } from "@/lib/user-session";
import { sql } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { claimHelpfulVote } from "@/lib/review-helpful";

export async function submitToolReview(data: {
  toolSlug: string;
  rating: number;
  title: string;
  body: string;
  proofImageUrl?: string;
}) {
  const session = await getUserSession();
  
  if (!session?.id) {
    return { success: false, error: "Authentication required" };
  }
  const userId = session.id;

  try {
    const tools = await sql`
      SELECT id FROM "AiTool" 
      WHERE slug = ${data.toolSlug} AND status = 'APPROVED' AND "deletedAt" IS NULL
      LIMIT 1
    `;

    if (tools.length === 0) {
      return { success: false, error: "Tool not found" };
    }
    const toolId = tools[0].id;

    const existingReviews = await sql`
      SELECT id FROM "ToolReview"
      WHERE "toolId" = ${toolId} AND "userId" = ${userId}
      LIMIT 1
    `;

    if (existingReviews.length > 0) {
      return { success: false, error: "You have already reviewed this tool." };
    }

    const rating = Math.max(1, Math.min(5, data.rating));
    const title = data.title.trim();
    const body = data.body.trim();
    const isVerifiedPurchase = !!data.proofImageUrl;
    const proofImageUrl = data.proofImageUrl || null;

    // Velocity Rate Limiting
    const recentReviews = await sql`
      SELECT COUNT(id) as count FROM "ToolReview"
      WHERE "userId" = ${userId} AND "createdAt" > NOW() - INTERVAL '24 hours'
    `;
    if (recentReviews[0].count >= 3) {
      return { success: false, error: "You have reached your review limit for today." };
    }

    // Account Age Gating
    const user = await sql`SELECT "createdAt" FROM "WebUser" WHERE id = ${userId}`;
    let finalStatus = 'APPROVED';
    
    if (user.length > 0) {
      // 48 hours = 48 * 60 * 60 * 1000 = 172800000 ms
      const ageMs = Date.now() - new Date(user[0].createdAt).getTime();
      if (ageMs < 172800000) {
        finalStatus = 'PENDING';
      }
    }

    await sql`
      INSERT INTO "ToolReview" (
        id, "toolId", "userId", rating, title, body, "isVerifiedPurchase", "proofImageUrl", status, "aiSpamScore", "helpfulCount", "createdAt", "publishedAt"
      ) VALUES (
        gen_random_uuid(), ${toolId}, ${userId}, ${rating}, ${title}, ${body}, ${isVerifiedPurchase}, ${proofImageUrl}, ${finalStatus}, 0, 0, NOW(), NOW()
      )
    `;

    revalidatePath(`/tools/${data.toolSlug}`);

    return { success: true };
  } catch (err: any) {
    console.error("Submit review error:", err);
    return { success: false, error: "Failed to submit review. Please try again later." };
  }
}

export async function incrementHelpfulCountAction(reviewId: string, _toolSlug?: string) {
  try {
    // One vote per visitor per review; a repeat is accepted quietly without counting again.
    if (!(await claimHelpfulVote('tool', reviewId))) return { success: true };
    // The page to refresh comes from the review itself, never from the caller.
    const rows = await sql`
      UPDATE "ToolReview" r
      SET "helpfulCount" = r."helpfulCount" + 1
      FROM "AiTool" t
      WHERE r.id = ${reviewId} AND t.id = r."toolId"
      RETURNING t.slug
    `;
    if (rows[0]?.slug) revalidatePath(`/tools/${rows[0].slug}`);
    return { success: true };
  } catch (err) {
    console.error("Helpful upvote failed", err);
    return { success: false };
  }
}
