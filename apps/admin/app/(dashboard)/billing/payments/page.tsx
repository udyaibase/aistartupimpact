import { getBilling } from '@/lib/billing/request';
import PaymentsTable from '@/components/billing/PaymentsTable';

export default async function BillingPaymentsPage() {
  const { rows } = await getBilling();
  return <PaymentsTable rows={rows} tableId="billing-payments" title={`All payments · ${rows.length.toLocaleString('en-IN')}`} />;
}
