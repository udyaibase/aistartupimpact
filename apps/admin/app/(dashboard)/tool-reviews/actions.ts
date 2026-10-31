"use server";

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { neon } from "@neondatabase/serverless";
import { revalidatePath } from "next/cache";
import { refreshPublic } from '@/lib/refresh-public';

type ActionResponse<T = void> = { success: true; data?: T } | { success: false; error: string };

function getSql() {
  return neon(process.env.DATABASE_URL!);
}

async function verifyAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user || !['SUPER_ADMIN', 'ADMIN'].includes(session.user.role)) {
    throw new Error("Unauthorized");
  }
}

export async function updateReviewStatusAction(
  reviewId: string, 
  status: 'PENDING' | 'APPROVED' | 'FLAGGED'
): Promise<ActionResponse> {
  try {
    await verifyAdmin();
    const sql = getSql();

    await sql`
      UPDATE "ToolReview"
      SET status = ${status}
      WHERE id = ${reviewId}
    `;

    revalidatePath("/tool-reviews");
    await refreshPublic(['tools']); return { success: true };
  } catch (err: any) {
    console.error("Failed to update status:", err);
    return { success: false, error: err.message || "Failed to update review status" };
  }
}

export async function deleteReviewAction(reviewId: string): Promise<ActionResponse> {
  try {
    await verifyAdmin();
    const sql = getSql();

    await sql`
      DELETE FROM "ToolReview"
      WHERE id = ${reviewId}
    `;

    revalidatePath("/tool-reviews");
    await refreshPublic(['tools']); return { success: true };
  } catch (err: any) {
    console.error("Failed to delete review:", err);
    return { success: false, error: err.message || "Failed to delete review" };
  }
}

export async function bulkUpdateReviewStatusAction(
  reviewIds: string[], 
  status: 'PENDING' | 'APPROVED' | 'FLAGGED'
): Promise<ActionResponse> {
  try {
    await verifyAdmin();
    const sql = getSql();

    // Use a simple loop for safely updating via neon HTTP
    for (const reviewId of reviewIds) {
      await sql`
        UPDATE "ToolReview"
        SET status = ${status}
        WHERE id = ${reviewId}
      `;
    }

    revalidatePath("/tool-reviews");
    await refreshPublic(['tools']); return { success: true };
  } catch (err: any) {
    console.error("Failed to bulk update status:", err);
    return { success: false, error: err.message || "Failed to update review statuses" };
  }
}

export async function bulkDeleteReviewAction(reviewIds: string[]): Promise<ActionResponse> {
  try {
    await verifyAdmin();
    const sql = getSql();

    for (const reviewId of reviewIds) {
      await sql`
        DELETE FROM "ToolReview"
        WHERE id = ${reviewId}
      `;
    }

    revalidatePath("/tool-reviews");
    await refreshPublic(['tools']); return { success: true };
  } catch (err: any) {
    console.error("Failed to bulk delete reviews:", err);
    return { success: false, error: err.message || "Failed to delete reviews" };
  }
}
