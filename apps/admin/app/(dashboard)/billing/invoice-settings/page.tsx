import InvoiceSettingsForm from '@/components/billing/InvoiceSettingsForm';
import { card } from '@/components/billing/parts';
import { getInvoiceSettingsAction } from './actions';

export const dynamic = 'force-dynamic';

const day = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

/** Seller details, SAC codes and footer note for GST invoices and credit notes. */
export default async function InvoiceSettingsPage() {
  const r = await getInvoiceSettingsAction();
  if (!r.success) return <p role="alert" className={`${card} p-5 text-sm text-red-700 dark:text-red-400`}>{r.error}</p>;
  return (
    <div className="space-y-5">
      <div className={`${card} p-4 text-sm text-gray-700 dark:text-gray-300`}>
        <p className="font-medium text-gray-900 dark:text-white">Changes apply to new invoices only.</p>
        <p className="mt-1">
          An invoice or credit note already issued keeps the seller details and SAC code it was sent with, however often it is downloaded again.
          {r.data.updatedAt ? ` Last saved ${day(r.data.updatedAt)}.` : ' Nothing has been saved here yet, so invoices use the server settings.'}
        </p>
      </div>
      <InvoiceSettingsForm view={r.data} />
    </div>
  );
}
