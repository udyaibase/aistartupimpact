'use client';

import { FileText, Lock } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import BillingDetailsForm, { type SaveBilling } from '@/components/billing/BillingDetailsForm';
import type { BillingProfile } from '@/lib/billing/details';

/**
 * The one-time "invoice details" step before Razorpay Checkout opens (Razorpay's form only takes the payment; GST
 * invoices need the buyer's name, address and GSTIN from us). Shown only while the billing profile is incomplete:
 * saving it continues straight to payment, so it's one flow, not a detour. Also used to change the details later
 * (without an order, the button just saves).
 */
export default function BillingCheckoutDialog({ open, onClose, initial, save, lookupUrl, order, onSaved }: {
  open: boolean;
  onClose: () => void;
  initial: BillingProfile;
  save: SaveBilling;
  lookupUrl?: string;
  /** What's being bought; when set, the button reads "Continue to payment · ₹…". */
  order?: { label: string; total: string } | null;
  onSaved: (p: BillingProfile) => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title={order ? 'Invoice details' : 'Edit billing details'} maxWidth="2xl">
      <div className="px-5 sm:px-6 py-5 space-y-5 font-jakarta">
        {order ? (
          <div className="flex items-start gap-3 rounded-[12px] bg-gray-50 dark:bg-gray-800/60 p-3.5">
            <FileText className="w-5 h-5 mt-0.5 text-gray-500 shrink-0" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">{order.label}</p>
              <p className="text-[13px] text-gray-600 dark:text-gray-400">
                We need these once, for your GST invoice. Next time you’ll go straight to payment.
              </p>
            </div>
            <p className="text-sm font-bold text-gray-900 dark:text-white tabular-nums shrink-0">{order.total}</p>
          </div>
        ) : (
          <p className="text-sm text-gray-600 dark:text-gray-400">Changes apply to future invoices.</p>
        )}
        <BillingDetailsForm
          initial={initial}
          save={save}
          lookupUrl={lookupUrl}
          inDialog
          submitLabel={order ? `Continue to payment · ${order.total}` : 'Save billing details'}
          onSaved={onSaved}
        />
        {order && (
          <p className="flex items-center gap-1.5 text-xs text-gray-500">
            <Lock className="w-3.5 h-3.5" aria-hidden /> Payment is handled securely by Razorpay. Card and UPI details never reach our servers.
          </p>
        )}
      </div>
    </Modal>
  );
}

/** One line above the plans once details are saved: who the invoice goes to, with a way to change it. */
export function InvoiceToLine({ profile, onChange }: { profile: BillingProfile; onChange: () => void }) {
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] text-gray-600 dark:text-gray-400">
      <FileText className="w-4 h-4 text-gray-400" aria-hidden />
      <span>Invoices go to <span className="font-semibold text-gray-900 dark:text-white">{profile.billingName}</span>
        {profile.billingGstin ? <> · GSTIN {profile.billingGstin}</> : null}</span>
      <button type="button" onClick={onChange} className="font-semibold text-[#A50F15] dark:text-red-300 hover:underline">Change</button>
    </p>
  );
}
