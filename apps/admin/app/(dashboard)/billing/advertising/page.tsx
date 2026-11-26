import { getBilling } from '@/lib/billing/request';
import StreamReport from '@/components/billing/StreamReport';

export default async function BillingAdvertisingPage() {
  const { rows, now } = await getBilling();
  return <StreamReport stream="ADS" rows={rows} now={now} recurring={false} />;
}
