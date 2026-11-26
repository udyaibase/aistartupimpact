import { requireRole } from '@/lib/role-guard';
import ActivityDashboard from './ActivityDashboard';
import { sectionRoles } from '@/lib/section-access';

export default async function ActivityPage() {
  await requireRole(sectionRoles('/activity'));
  return <ActivityDashboard />;
}
