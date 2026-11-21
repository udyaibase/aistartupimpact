import { NextResponse } from "next/server";
import { requirePermission, eventScope } from "@/lib/organizer-auth/require-permission";
import OrganizerEventForm from "./OrganizerEventForm";
export const metadata = { title: 'Create event' };

export const dynamic = "force-dynamic";
export default async function CreateEventPage({ searchParams }: { searchParams: Promise<{ template?: string }> }) {
  // The active workspace (their own, or a team they chose), with the same role rules as the API.
  const session = await requirePermission("events.create");
  if (session instanceof NextResponse) return session.status === 401 ? null : <p className="py-16 text-center text-sm text-gray-500 dark:text-gray-400">Your role in this workspace doesn’t include this page.</p>;
  const params = await searchParams;
  return <OrganizerEventForm organizerId={session.organizerId} template={params.template} />;
}
