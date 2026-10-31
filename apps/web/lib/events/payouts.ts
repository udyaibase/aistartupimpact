import { prisma } from '@udyaibase/database';
import { razorpayApi, RazorpayApiError } from '@/lib/billing/razorpay';

/**
 * Host payouts for paid tickets via Razorpay Route linked accounts.
 * Bank and KYC details are passed straight to Razorpay and never stored; we keep the account id,
 * product id, activation status and the last 4 digits of the bank account.
 *
 * Razorpay business profile category/subcategory come from env (RAZORPAY_ROUTE_CATEGORY,
 * RAZORPAY_ROUTE_SUBCATEGORY) so they can match the values Razorpay accepts for event hosts.
 */

export type PayoutStatus = 'NOT_STARTED' | 'UNDER_REVIEW' | 'NEEDS_CLARIFICATION' | 'ACTIVATED' | 'SUSPENDED';

export { BUSINESS_TYPES } from '@/lib/events/payout-options';
import { BUSINESS_TYPES } from '@/lib/events/payout-options';

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;

export interface PayoutInput {
  legalName: string; businessType: string; contactName: string; phone: string; pan: string; businessPan?: string; gstin?: string;
  street: string; city: string; state: string; postalCode: string;
  accountNumber: string; ifsc: string; beneficiaryName: string; acceptTerms: boolean;
}

export function validatePayoutInput(b: Record<string, unknown>): { ok: true; data: PayoutInput } | { ok: false; error: string; field: string } {
  const s = (k: string, max = 120) => (typeof b[k] === 'string' ? (b[k] as string).trim().slice(0, max) : '');
  const data: PayoutInput = {
    legalName: s('legalName'), businessType: s('businessType', 40), contactName: s('contactName'), phone: s('phone', 15).replace(/\D/g, '').slice(-10),
    pan: s('pan', 10).toUpperCase(), businessPan: s('businessPan', 10).toUpperCase() || undefined, gstin: s('gstin', 15).toUpperCase() || undefined,
    street: s('street', 100), city: s('city', 50), state: s('state', 50), postalCode: s('postalCode', 6),
    accountNumber: s('accountNumber', 20).replace(/\s/g, ''), ifsc: s('ifsc', 11).toUpperCase(), beneficiaryName: s('beneficiaryName'),
    acceptTerms: b.acceptTerms === true,
  };
  const need: [keyof PayoutInput, string][] = [['legalName', 'Legal name'], ['contactName', 'Contact name'], ['street', 'Address'], ['city', 'City'], ['state', 'State'], ['beneficiaryName', 'Account holder name']];
  for (const [k, label] of need) if (!data[k]) return { ok: false, error: `${label} is required.`, field: k };
  if (!BUSINESS_TYPES.some((t) => t.value === data.businessType)) return { ok: false, error: 'Choose a business type.', field: 'businessType' };
  if (!/^[6-9]\d{9}$/.test(data.phone)) return { ok: false, error: 'Enter a 10-digit Indian mobile number.', field: 'phone' };
  if (!PAN_RE.test(data.pan)) return { ok: false, error: 'Enter a valid PAN (e.g. ABCDE1234F).', field: 'pan' };
  if (data.businessPan && !PAN_RE.test(data.businessPan)) return { ok: false, error: 'Enter a valid business PAN.', field: 'businessPan' };
  if (!/^\d{6}$/.test(data.postalCode)) return { ok: false, error: 'Enter a 6-digit PIN code.', field: 'postalCode' };
  if (!/^\d{9,18}$/.test(data.accountNumber)) return { ok: false, error: 'Enter a valid bank account number.', field: 'accountNumber' };
  if (!IFSC_RE.test(data.ifsc)) return { ok: false, error: 'Enter a valid IFSC (e.g. HDFC0001234).', field: 'ifsc' };
  if (!data.acceptTerms) return { ok: false, error: 'Accept the Razorpay terms to receive payouts.', field: 'acceptTerms' };
  return { ok: true, data };
}

const mapStatus = (s: string | undefined): PayoutStatus =>
  s === 'activated' ? 'ACTIVATED' : s === 'needs_clarification' ? 'NEEDS_CLARIFICATION' : s === 'suspended' ? 'SUSPENDED' : 'UNDER_REVIEW';

/** Create (or finish) the host's Route linked account and settlement bank details. */
export async function setUpPayouts(organizerId: string, input: PayoutInput): Promise<{ status: PayoutStatus; note: string | null }> {
  const org = await prisma.eventOrganizer.findUniqueOrThrow({ where: { id: organizerId }, select: { email: true, payoutAccountId: true, payoutProductId: true } });
  let accountId = org.payoutAccountId;
  let productId = org.payoutProductId;
  try {
    if (!accountId) {
      const acc = await razorpayApi<{ id: string }>('POST', '/v2/accounts', {
        email: org.email, phone: input.phone, type: 'route', reference_id: organizerId.replace(/-/g, '').slice(0, 20),
        legal_business_name: input.legalName, business_type: input.businessType, contact_name: input.contactName,
        profile: {
          category: process.env.RAZORPAY_ROUTE_CATEGORY || 'others',
          subcategory: process.env.RAZORPAY_ROUTE_SUBCATEGORY || 'others',
          addresses: { registered: { street1: input.street, street2: input.city, city: input.city, state: input.state, postal_code: input.postalCode, country: 'IN' } },
        },
        ...(input.businessPan || input.gstin ? { legal_info: { ...(input.businessPan ? { pan: input.businessPan } : {}), ...(input.gstin ? { gst: input.gstin } : {}) } } : {}),
      });
      accountId = acc.id;
      await prisma.eventOrganizer.update({ where: { id: organizerId }, data: { payoutAccountId: accountId, payoutStatus: 'UNDER_REVIEW', payoutUpdatedAt: new Date() } });
      await razorpayApi('POST', `/v2/accounts/${accountId}/stakeholders`, { name: input.contactName, email: org.email, kyc: { pan: input.pan } });
    }
    if (!productId) {
      const prod = await razorpayApi<{ id: string }>('POST', `/v2/accounts/${accountId}/products`, { product_name: 'route', tnc_accepted: true });
      productId = prod.id;
      await prisma.eventOrganizer.update({ where: { id: organizerId }, data: { payoutProductId: productId } });
    }
    const prod = await razorpayApi<{ activation_status?: string; requirements?: { field_reference?: string; reason_code?: string }[] }>(
      'PATCH', `/v2/accounts/${accountId}/products/${productId}`,
      { settlements: { account_number: input.accountNumber, ifsc_code: input.ifsc, beneficiary_name: input.beneficiaryName }, tnc_accepted: true },
    );
    const status = mapStatus(prod.activation_status);
    const note = prod.requirements?.length ? `Razorpay needs: ${prod.requirements.map((r) => r.field_reference || r.reason_code).filter(Boolean).join(', ')}` : null;
    await prisma.eventOrganizer.update({
      where: { id: organizerId },
      data: { payoutStatus: status, payoutNote: note, payoutBankLast4: input.accountNumber.slice(-4), payoutBeneficiary: input.beneficiaryName, payoutUpdatedAt: new Date() },
    });
    return { status, note };
  } catch (err) {
    const msg = err instanceof RazorpayApiError ? err.message : 'Could not reach Razorpay. Try again in a few minutes.';
    await prisma.eventOrganizer.update({ where: { id: organizerId }, data: { payoutNote: msg.slice(0, 300), payoutUpdatedAt: new Date() } }).catch(() => {});
    throw err instanceof RazorpayApiError ? err : new RazorpayApiError(msg, 502);
  }
}

/** Re-read activation status from Razorpay (KYC review finishes asynchronously). */
export async function refreshPayoutStatus(organizerId: string): Promise<PayoutStatus | null> {
  const org = await prisma.eventOrganizer.findUnique({ where: { id: organizerId }, select: { payoutAccountId: true, payoutProductId: true } });
  if (!org?.payoutAccountId || !org.payoutProductId) return null;
  const prod = await razorpayApi<{ activation_status?: string; requirements?: { field_reference?: string }[] }>('GET', `/v2/accounts/${org.payoutAccountId}/products/${org.payoutProductId}`);
  const status = mapStatus(prod.activation_status);
  const note = prod.requirements?.length ? `Razorpay needs: ${prod.requirements.map((r) => r.field_reference).filter(Boolean).join(', ')}` : null;
  await prisma.eventOrganizer.update({ where: { id: organizerId }, data: { payoutStatus: status, payoutNote: note, payoutUpdatedAt: new Date() } });
  return status;
}

export async function canSellTickets(organizerId: string): Promise<boolean> {
  const o = await prisma.eventOrganizer.findUnique({ where: { id: organizerId }, select: { payoutStatus: true, payoutAccountId: true } });
  return o?.payoutStatus === 'ACTIVATED' && !!o.payoutAccountId;
}
