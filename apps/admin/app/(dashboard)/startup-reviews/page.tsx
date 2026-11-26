import { neon } from "@neondatabase/serverless";
import StartupReviewsClient from "./StartupReviewsClient";
import { requirePageRole } from "@/lib/api-auth";
import { sectionRoles } from "@/lib/section-access";
import type { Review } from "@/components/reviews/ReviewsTable";

export const metadata = {
  title: "Startup reviews | Udyaibase Admin",
};

export default async function StartupReviewsPage() {
  // This page reads reviews (with reviewers' emails) directly, so it checks the role itself.
  await requirePageRole(sectionRoles("/startup-reviews"));
  const sql = neon(process.env.DATABASE_URL!);

  // Reviews are written by website users (WebUser), not staff accounts.
  const rows = await sql`
     SELECT
       r.id, r.rating, r.title, r.body, r.status, r."proofImageUrl", r."createdAt"::text AS "createdAt", r."helpfulCount",
       u.name AS user_name, u.email AS user_email, u.avatar AS user_avatar,
       s.name AS subject_name, s.slug AS subject_slug
     FROM "StartupReview" r
     LEFT JOIN "WebUser" u ON u.id = r."userId"
     LEFT JOIN "Startup" s ON s.id = r."startupId"
     ORDER BY r."createdAt" DESC
  `;

  const reviews: Review[] = rows.map((r: any) => ({
    id: r.id,
    rating: r.rating,
    title: r.title,
    body: r.body,
    status: r.status,
    proofImageUrl: r.proofImageUrl,
    createdAt: r.createdAt,
    helpfulCount: r.helpfulCount || 0,
    user: { name: r.user_name, email: r.user_email, avatar: r.user_avatar },
    subject: { name: r.subject_name, slug: r.subject_slug },
  }));

  const site = (process.env.NEXT_PUBLIC_SITE_URL || "https://udyaibase.com").replace(/\/$/, "");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="portal-title">Startup reviews</h1>
        <p className="portal-subtitle">Approve, flag or delete the reviews people write about startups.</p>
      </div>
      <StartupReviewsClient initialReviews={reviews} publicBase={`${site}/startups`} />
    </div>
  );
}
