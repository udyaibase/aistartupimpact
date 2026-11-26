import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@udyaibase/database";
import EventCreateForm from "./EventCreateForm";
import { sectionRoles } from '@/lib/section-access';

const EVENT_ROLES = sectionRoles('/events');

export default async function CreateEventPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user || !EVENT_ROLES.includes(session.user.role)) {
    redirect("/dashboard");
  }

  // Fetch tags for the tag selector
  const tags = await prisma.eventTag.findMany({
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });

  return <EventCreateForm tags={tags} />;
}
