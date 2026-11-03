'use server';

import { requireActionAuth } from '@/lib/api-auth';
import { getExtraCities } from '@/lib/locations';

/** Cities added on the Cities page, for the admin city pickers. */
export async function getExtraCitiesAction() {
  const { error } = await requireActionAuth();
  if (error) return [];
  return getExtraCities();
}
