import { requireFounderAuth } from '@/lib/founder-auth';
import SupportTicketList from '@/components/support/SupportTicketList';

export const metadata = { title: 'Support' };

export default async function FounderSupportPage() {
  await requireFounderAuth();
  return <SupportTicketList apiBasePath="/api/founder/support" portalPath="/founder" />;
}
