import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import SupportClient from "./SupportClient";
import StatusBannerCard from "./StatusBannerCard";

export default async function SupportPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user || !["SUPER_ADMIN", "EDITOR_IN_CHIEF"].includes(session.user.role)) redirect("/dashboard");

  return (
    <div className="space-y-6">
      <StatusBannerCard />
      <SupportClient />
    </div>
  );
}
