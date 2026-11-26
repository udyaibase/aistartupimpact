import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import SupportDetailClient from "./SupportDetailClient";
import { sectionRoles } from '@/lib/section-access';

export default async function SupportDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session?.user || !sectionRoles('/support').includes(session.user.role)) redirect("/dashboard");

  return <SupportDetailClient ticketId={params.id} adminId={session.user.id} adminName={session.user.name || "Admin"} />;
}
