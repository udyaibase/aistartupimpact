import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@udyaibase/database";
import { redirect } from "next/navigation";
import ReportsClient from "./ReportsClient";

export default async function ReportsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user || !["SUPER_ADMIN", "EDITOR_IN_CHIEF"].includes(session.user.role)) redirect("/dashboard");

  const reports = await prisma.contentReport.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const stats = {
    pending: reports.filter(r => r.status === "PENDING").length,
    reviewing: reports.filter(r => r.status === "REVIEWING").length,
    resolved: reports.filter(r => r.status === "RESOLVED").length,
    total: reports.length,
  };

  const jobIds = [...new Set(reports.filter(r => r.entityType === "JOB").map(r => r.entityId))];
  const jobs = jobIds.length ? await prisma.jobBoardListing.findMany({ where: { id: { in: jobIds } }, select: { id: true, status: true, moderationHold: true, publishedByEmail: true, Employer: { select: { companyName: true, email: true } } } }) : [];
  const jobMap = Object.fromEntries(jobs.map(j => [j.id, { status: j.status, hold: j.moderationHold, company: j.Employer.companyName, publishedBy: j.publishedByEmail ?? j.Employer.email }]));

  return <ReportsClient reports={reports.map(r => ({ ...r, reporterHash: undefined, job: jobMap[r.entityId] ?? null, createdAt: r.createdAt.toISOString(), resolvedAt: r.resolvedAt?.toISOString() || null }))} stats={stats} />;
}
