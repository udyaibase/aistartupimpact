import { getOrganizerSession } from "@/lib/organizer-auth";
import OrganizerEventForm from "./OrganizerEventForm";
export const dynamic = "force-dynamic";
export default async function CreateEventPage({ searchParams }: { searchParams: Promise<{ template?: string }> }) {
  const session = await getOrganizerSession();
  if (!session) return null;
  const params = await searchParams;
  return <OrganizerEventForm organizerId={session.id} template={params.template} />;
}
