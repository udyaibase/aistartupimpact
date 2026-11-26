import { getBilling } from '@/lib/billing/request';
import StreamReport from '@/components/billing/StreamReport';

export default async function BillingFundingDataPage() {
  const { rows, now } = await getBilling();
  return <StreamReport stream="FUNDING" rows={rows} now={now} recurring={false} />;
}
