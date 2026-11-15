"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@udyaibase/database";
import { careersResumeKey, deleteCareersResume } from '@/lib/careers-resume';

const ALLOWED_ROLES = ["SUPER_ADMIN", "EDITOR_IN_CHIEF"] as const;

const VALID_STATUSES = ["NEW", "REVIEWED", "SHORTLISTED", "INTERVIEW", "OFFERED", "HIRED", "REJECTED"] as const;

// ── List applications ──────────────────────────────────────────────────────

interface ListOptions {
  cursor?: string;
  limit?: number;
  search?: string;
  status?: string;
  type?: string;
  role?: string;
}

export async function listApplicationsAction(options: ListOptions = {}) {
  const session: any = await getServerSession(authOptions);
  if (!session?.user || !ALLOWED_ROLES.includes(session.user.role)) {
    return { success: false as const, error: "Unauthorized", data: [], total: 0, nextCursor: null };
  }

  try {
    const { cursor, limit = 30, search, status, type, role } = options;

    const where: any = {};
    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { role: { contains: search, mode: "insensitive" } },
      ];
    }
    if (status) where.status = status;
    if (type) where.type = type;
    if (role) where.role = role;

    const [apps, total] = await Promise.all([
      prisma.jobApplication.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      }),
      prisma.jobApplication.count({ where }),
    ]);

    const hasMore = apps.length > limit;
    const items = hasMore ? apps.slice(0, limit) : apps;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    const data = items.map((a: any) => ({
      id: a.id,
      type: a.type || "INTERNSHIP",
      role: a.role,
      fullName: a.fullName,
      email: a.email,
      phone: a.phone || a.mobile || null,
      resumeLink: a.resumeLink,
      resumeUrl: a.resumeUrl || null,
      resumeFileName: a.resumeFileName || null,
      resumeSizeBytes: a.resumeSizeBytes || null,
      linkedinUrl: a.linkedinUrl || null,
      portfolioUrl: a.portfolioUrl || null,
      status: a.status,
      notes: a.notes || null,
      reviewedAt: a.reviewedAt?.toISOString() || null,
      createdAt: a.createdAt.toISOString(),
    }));

    return { success: true as const, data, total, nextCursor };
  } catch (e: any) {
    console.error("listApplicationsAction error:", e);
    return { success: false as const, error: e.message, data: [], total: 0, nextCursor: null };
  }
}

// ── Update status ──────────────────────────────────────────────────────────

export async function updateApplicationStatusAction(id: string, status: string, notes?: string) {
  const session: any = await getServerSession(authOptions);
  if (!session?.user || !ALLOWED_ROLES.includes(session.user.role)) {
    return { success: false as const, error: "Unauthorized" };
  }

  if (!VALID_STATUSES.includes(status as any)) {
    return { success: false as const, error: "Invalid status" };
  }

  try {
    const update: any = { status, reviewedAt: new Date() };
    if (notes !== undefined) update.notes = notes;

    await prisma.jobApplication.update({ where: { id }, data: update });
    return { success: true as const };
  } catch (e: any) {
    return { success: false as const, error: e.message };
  }
}

// ── Delete application ─────────────────────────────────────────────────────

export async function deleteApplicationAction(id: string) {
  const session: any = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    return { success: false as const, error: "Unauthorized" };
  }

  try {
    const app = await prisma.jobApplication.findUnique({ where: { id }, select: { resumeUrl: true, resumeLink: true } });
    await prisma.jobApplication.delete({ where: { id } });
    // The applicant's file goes with the record.
    const key = careersResumeKey(app?.resumeUrl) ?? careersResumeKey(app?.resumeLink);
    if (key) await deleteCareersResume(key).catch((e) => console.error('[applications] resume delete', e instanceof Error ? e.message : e));
    return { success: true as const };
  } catch (e: any) {
    return { success: false as const, error: e.message };
  }
}

// ── Stats ──────────────────────────────────────────────────────────────────

export async function getApplicationStatsAction() {
  const session: any = await getServerSession(authOptions);
  if (!session?.user || !ALLOWED_ROLES.includes(session.user.role)) {
    return { success: false as const, error: "Unauthorized" };
  }

  try {
    const all = await prisma.jobApplication.findMany({
      select: { status: true, type: true, role: true },
    });

    const total = all.length;
    const byStatus: Record<string, number> = {};
    const byType: Record<string, number> = {};
    const byRole: Record<string, number> = {};

    for (const a of all) {
      byStatus[a.status] = (byStatus[a.status] || 0) + 1;
      const t = (a as any).type || "INTERNSHIP";
      byType[t] = (byType[t] || 0) + 1;
      byRole[a.role] = (byRole[a.role] || 0) + 1;
    }

    return { success: true as const, data: { total, byStatus, byType, byRole } };
  } catch (e: any) {
    return { success: false as const, error: e.message };
  }
}

// ── Get unique roles for filter ────────────────────────────────────────────

export async function getApplicationRolesAction() {
  const session: any = await getServerSession(authOptions);
  if (!session?.user || !ALLOWED_ROLES.includes(session.user.role)) {
    return { success: false as const, error: "Unauthorized", data: [] };
  }

  try {
    const all = await prisma.jobApplication.findMany({
      select: { role: true },
      distinct: ["role"],
      orderBy: { role: "asc" },
    });
    return { success: true as const, data: all.map((a: any) => a.role) };
  } catch (e: any) {
    return { success: false as const, error: e.message, data: [] };
  }
}
