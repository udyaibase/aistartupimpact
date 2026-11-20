import { NextRequest, NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { prisma } from "@udyaibase/database";

export async function GET(request: NextRequest) {
  const { session, error } = await requireApiAuth(["SUPER_ADMIN", "EDITOR_IN_CHIEF"]);
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "50");
  const status = searchParams.get("status") || undefined;
  const priority = searchParams.get("priority") || undefined;
  const portal = searchParams.get("portal") || undefined;
  const search = searchParams.get("search") || undefined;

  const where: any = {};
  if (status && status !== "ALL") where.status = status;
  if (priority) where.priority = priority;
  if (portal) where.portal = portal;
  if (search) {
    where.OR = [
      { subject: { contains: search, mode: "insensitive" } },
      { ticketNumber: { contains: search, mode: "insensitive" } },
      { submitterName: { contains: search, mode: "insensitive" } },
      { submitterEmail: { contains: search, mode: "insensitive" } },
    ];
  }

  const [tickets, totalCount] = await Promise.all([
    prisma.supportTicket.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        ticketNumber: true,
        subject: true,
        category: true,
        priority: true,
        status: true,
        portal: true,
        submitterName: true,
        submitterEmail: true,
        submitterType: true,
        assignedTo: true,
        createdAt: true,
        updatedAt: true,
        replyDueAt: true,
        firstReplyAt: true,
        planAtOpen: true,
        _count: { select: { messages: true } },
      },
    }),
    prisma.supportTicket.count({ where }),
  ]);

  return NextResponse.json({ success: true, tickets, totalCount, page, totalPages: Math.ceil(totalCount / limit) });
}
