import { hostWriteLimit } from '@/lib/organizer-auth/write-limit';
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@udyaibase/database";
import { getOrganizerSession } from "@/lib/organizer-auth";
import { logOrganizerActivity, organizerActor } from '@/lib/workspace-activity';
import { cleanLink } from '@/lib/events/event-input';

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ success: false }, { status: 401 });

  const org = await prisma.eventOrganizer.findUnique({
    where: { id: session.id },
    select: { name: true, company: true, bio: true, website: true, linkedin: true, phone: true, avatar: true, email: true },
  });

  return NextResponse.json({ success: true, profile: org || {} });
}

export async function PUT(request: NextRequest) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
  const limited = await hostWriteLimit(session.id);
  if (limited) return limited;

  const { name, company, bio, website, linkedin, phone, avatar } = await request.json().catch(() => ({}));
  // Logos must come from our own upload endpoint (R2 media), never an arbitrary outside URL.
  const mediaBase = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');
  const avatarOk = avatar === null || avatar === '' || (typeof avatar === 'string' && !!mediaBase && avatar.startsWith(`${mediaBase}/`) && avatar.length < 500);
  if (avatar !== undefined && !avatarOk) return NextResponse.json({ success: false, error: 'Upload the logo here instead of pasting a link.' }, { status: 400 });

  if (!name || typeof name !== "string") return NextResponse.json({ success: false, error: "Name is required" }, { status: 400 });
  // Shown as links on public pages: http(s) only.
  const websiteLink = cleanLink(website ?? null);
  const linkedinLink = cleanLink(linkedin ?? null);
  if (websiteLink === undefined) return NextResponse.json({ success: false, error: "Enter your website as a full link, like https://example.com" }, { status: 400 });
  if (linkedinLink === undefined) return NextResponse.json({ success: false, error: "Enter your LinkedIn as a full link." }, { status: 400 });
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) || null : null);
  if (typeof bio === "string" && bio.length > 500) return NextResponse.json({ success: false, error: "Bio must be 500 characters or less" }, { status: 400 });
  if (typeof name === "string" && name.length > 100) return NextResponse.json({ success: false, error: "Name must be 100 characters or less" }, { status: 400 });

  await prisma.eventOrganizer.update({
    where: { id: session.id },
    data: { name: name.slice(0, 100), company: str(company, 100), bio: str(bio, 500), website: websiteLink, linkedin: linkedinLink, phone: str(phone, 20), ...(avatar !== undefined ? { avatar: avatar || null } : {}) },
  });
  await logOrganizerActivity(session.id, 'profile_updated', { actor: organizerActor(session), request, metadata: { what: 'organizer profile' } });

  return NextResponse.json({ success: true });
}
