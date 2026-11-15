"use server";

import { getUserSession } from "@/lib/user-session";
import { sql } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { claimHelpfulVote } from "@/lib/review-helpful";

export async function submitStartupReview(data: {
  startupSlug: string;
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
    const startups = await sql`
      SELECT id FROM "Startup" 
      WHERE slug = ${data.startupSlug} AND "deletedAt" IS NULL
      LIMIT 1
    `;

    if (startups.length === 0) {
      return { success: false, error: "Startup not found" };
    }
    const startupId = startups[0].id;

    const existingReviews = await sql`
      SELECT id FROM "StartupReview"
      WHERE "startupId" = ${startupId} AND "userId" = ${userId}
      LIMIT 1
    `;

    if (existingReviews.length > 0) {
      return { success: false, error: "You have already reviewed this startup." };
    }

    const rating = Math.max(1, Math.min(5, data.rating));
    const title = data.title.trim();
    const body = data.body.trim();
    const proofImageUrl = data.proofImageUrl || null;

    // Velocity Rate Limiting
    const recentReviews = await sql`
      SELECT COUNT(id) as count FROM "StartupReview"
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
      INSERT INTO "StartupReview" (
        id, "startupId", "userId", rating, title, body, "proofImageUrl", status, "aiSpamScore", "helpfulCount", "createdAt", "publishedAt"
      ) VALUES (
        gen_random_uuid(), ${startupId}, ${userId}, ${rating}, ${title}, ${body}, ${proofImageUrl}, ${finalStatus}, 0, 0, NOW(), NOW()
      )
    `;

    revalidatePath(`/startups/${data.startupSlug}`);

    return { success: true };
  } catch (err: any) {
    console.error("Submit startup review error:", err);
    return { success: false, error: "Failed to submit review. Please try again later." };
  }
}

export async function incrementStartupReviewHelpful(reviewId: string, _startupSlug?: string) {
  try {
    // One vote per visitor per review; a repeat is accepted quietly without counting again.
    if (!(await claimHelpfulVote('startup', reviewId))) return { success: true };
    // The page to refresh comes from the review itself, never from the caller.
    const rows = await sql`
      UPDATE "StartupReview" r
      SET "helpfulCount" = r."helpfulCount" + 1
      FROM "Startup" s
      WHERE r.id = ${reviewId} AND s.id = r."startupId"
      RETURNING s.slug
    `;
    if (rows[0]?.slug) revalidatePath(`/startups/${rows[0].slug}`);
    return { success: true };
  } catch (err) {
    console.error("Helpful upvote failed", err);
    return { success: false };
  }
}
