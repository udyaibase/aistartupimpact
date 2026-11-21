import { organizerPageGate } from "@/lib/organizer-auth/page-gate";

export const metadata = { title: 'Attendees' };

export const dynamic = "force-dynamic";

export default async function Layout({ children }: { children: React.ReactNode }) {
  return (await organizerPageGate("registrations.view")) ?? children;
}
