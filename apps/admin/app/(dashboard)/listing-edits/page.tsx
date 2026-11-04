import { requireRole } from '@/lib/role-guard';
import ListingEditsClient from './ListingEditsClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Listing Edits' };

export default async function ListingEditsPage() {
  await requireRole(['SUPER_ADMIN', 'EDITOR_IN_CHIEF']);
  return <ListingEditsClient />;
}
