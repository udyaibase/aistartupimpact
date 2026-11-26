import { requireRole } from '@/lib/role-guard';
import ListingEditsClient from './ListingEditsClient';
import { sectionRoles } from '@/lib/section-access';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Listing Edits' };

export default async function ListingEditsPage() {
  await requireRole(sectionRoles('/listing-edits'));
  return <ListingEditsClient />;
}
