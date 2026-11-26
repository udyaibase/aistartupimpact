import { NextRequest, NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/api-auth";
import { prisma } from "@udyaibase/database";
import { logAuditEvent } from '@/lib/audit-log';

export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { error } = await requireApiAuth(["SUPER_ADMIN", "EDITOR_IN_CHIEF"]);
  if (error) return error;

  const ticket = await prisma.supportTicket.findUnique({
    where: { id: params.id },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!ticket) return NextResponse.json({ success: false, error: "Ticket not found" }, { status: 404 });
  return NextResponse.json({ success: true, ticket });
}

export async function PUT(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { session, error } = await requireApiAuth(["SUPER_ADMIN", "EDITOR_IN_CHIEF"]);
  if (error) return error;

  const body = await request.json();
  const data: any = {};

  if (body.status) {
    data.status = body.status;
    if (body.status === "RESOLVED" || body.status === "CLOSED") {
      data.resolvedAt = new Date();
      data.resolvedBy = (session as any).user.id;
      if (body.status === "CLOSED") data.closedAt = new Date();
    }
  }
  if (body.priority) data.priority = body.priority;
  if (body.assignedTo !== undefined) data.assignedTo = body.assignedTo;

  const ticket = await prisma.supportTicket.update({
    where: { id: params.id },
    data,
  });

  await logAuditEvent({ action: 'UPDATE', resourceType: 'SUPPORT', resourceId: params.id, resourceName: 'support-tickets/[id]' });
  return NextResponse.json({ success: true, ticket });
}
