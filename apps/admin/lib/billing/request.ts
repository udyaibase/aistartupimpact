import { cache } from 'react';
import { requirePageRole } from '@/lib/api-auth';
import { sectionRoles } from '@/lib/section-access';
import { loadGatewayFees, loadLedger, ticketFeesByMonth } from './ledger';

/**
 * What every billing page starts from: the signed-in super admin is checked, then the ledger is read once per
 * request (the layout and the page share it).
 */
export const getBilling = cache(async () => {
  await requirePageRole(sectionRoles('/billing'));
  const [rows, ticketFees, gateway] = await Promise.all([loadLedger(), ticketFeesByMonth(), loadGatewayFees()]);
  /** feesReady: the RazorpayFee table exists (its migration has been applied). */
  return { rows, ticketFees, now: new Date(), feesReady: gateway.ready };
});
