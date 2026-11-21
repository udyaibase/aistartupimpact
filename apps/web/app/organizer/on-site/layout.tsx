import { organizerPageGate } from "@/lib/organizer-auth/page-gate";

export const metadata = { title: 'On-site tools' };

export const dynamic = "force-dynamic";

export default async function Layout({ children }: { children: React.ReactNode }) {
  return (await organizerPageGate("registrations.manage")) ?? children;
}
