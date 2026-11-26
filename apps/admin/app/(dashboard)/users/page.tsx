// Wrapper component to pass server data to the client component
import UsersPageClient from "./UsersPageClient";
import { getUsers } from "./actions";
import { requireRole } from "@/lib/role-guard";
import { sectionRoles } from '@/lib/section-access';

export default async function UsersPage() {
  await requireRole(sectionRoles('/users'));
  const users = await getUsers();
  return <UsersPageClient initialUsers={users} />;
}
