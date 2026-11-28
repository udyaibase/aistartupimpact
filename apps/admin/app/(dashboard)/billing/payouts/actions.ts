'use server';

import { requireActionAuth } from '@/lib/api-auth';
import { sectionRoles } from '@/lib/section-access';
import { logAuditEvent } from '@/lib/audit-log';
import { tooManyShared } from '@/lib/rate-limit';
import { callWeb, webLinkProblem } from '@/lib/web-internal';
import { asPayoutStatus, PAYOUT_LABEL } from '@/lib/billing/payouts';

/** Ask Razorpay for a host's current payout review status (the same check as the host's own Refresh button). */
export async function refreshPayoutAction(organizerId: string, name: string): Promise<{ success: true; label: string } | { success: false; error: string }> {
  const { error, session } = await requireActionAuth(sectionRoles('/billing'));
  if (error) return { success: false, error };
  const limited = await tooManyShared(session!.user.id, 'payoutRefresh');
  if (limited) return { success: false, error: limited };
  if (typeof organizerId !== 'string' || !/^[0-9a-f-]{36}$/i.test(organizerId)) return { success: false, error: 'Unknown host.' };

  const res = await callWeb('/api/webhooks/payout-refresh', { organizerId }, 20000);
  const problem = webLinkProblem(res);
  if (problem || !res) return { success: false, error: `Not re-checked: ${problem}` };
  const j = (await res.json().catch(() => null)) as { status?: string; error?: string } | null;
  if (!res.ok || !j?.status) return { success: false, error: j?.error || "Couldn't refresh this host. Try again." };
  const label = PAYOUT_LABEL[asPayoutStatus(j.status)];
  await logAuditEvent({ action: 'UPDATE', resourceType: 'BILLING_PAYMENT', resourceId: organizerId, resourceName: `Payout status refreshed: ${String(name).slice(0, 120)}`, after: { status: j.status } });
  return { success: true, label };
}
